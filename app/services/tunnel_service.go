package services

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"PosApp/app/database"
	"PosApp/app/models"

	"gorm.io/gorm"
)

// TunnelService manages Cloudflare Tunnel connections
type TunnelService struct {
	ctx            context.Context
	db             *gorm.DB
	cmd            *exec.Cmd
	cancel         context.CancelFunc
	mu             sync.RWMutex
	isRunning      bool
	tunnelURL      string
	lastError      string
	outputBuffer   []string
	maxOutputLines int
}

// NewTunnelService creates a new tunnel service instance
func NewTunnelService() *TunnelService {
	return &TunnelService{
		maxOutputLines: 100,
		outputBuffer:   make([]string, 0),
	}
}

// SetContext sets the application context
func (s *TunnelService) SetContext(ctx context.Context) {
	s.ctx = ctx
	s.db = database.GetDB()
}

// TunnelStatus represents the current tunnel status
type TunnelStatus struct {
	IsRunning    bool     `json:"is_running"`
	IsInstalled  bool     `json:"is_installed"`
	TunnelURL    string   `json:"tunnel_url"`
	LastError    string   `json:"last_error"`
	Output       []string `json:"output"`
	Provider     string   `json:"provider"`
	ConnectedAt  string   `json:"connected_at,omitempty"`
	BinaryPath   string   `json:"binary_path"`
	BinaryExists bool     `json:"binary_exists"`
}

// GetStatus returns the current tunnel status
func (s *TunnelService) GetStatus() (*TunnelStatus, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	binaryPath := s.getCloudflaredPath()
	binaryExists := s.checkBinaryExists(binaryPath)

	status := &TunnelStatus{
		IsRunning:    s.isRunning,
		IsInstalled:  binaryExists,
		TunnelURL:    s.tunnelURL,
		LastError:    s.lastError,
		Output:       s.outputBuffer,
		Provider:     "cloudflare",
		BinaryPath:   binaryPath,
		BinaryExists: binaryExists,
	}

	// Get config from database
	var config models.TunnelConfig
	if err := s.db.First(&config).Error; err == nil {
		if config.LastConnected != nil {
			status.ConnectedAt = config.LastConnected.Format(time.RFC3339)
		}
	}

	return status, nil
}

// getCloudflaredPath returns the path to cloudflared binary
func (s *TunnelService) getCloudflaredPath() string {
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeDir := filepath.Dir(exePath)

	// Binary name depends on OS
	binaryName := "cloudflared"
	if runtime.GOOS == "windows" {
		binaryName = "cloudflared.exe"
	}

	// Check in app directory first
	appPath := filepath.Join(exeDir, binaryName)
	if s.checkBinaryExists(appPath) {
		return appPath
	}

	// Check in data directory
	dataDir := filepath.Join(exeDir, "data")
	dataPath := filepath.Join(dataDir, binaryName)
	if s.checkBinaryExists(dataPath) {
		return dataPath
	}

	// Check in PATH
	if path, err := exec.LookPath(binaryName); err == nil {
		return path
	}

	// Return default path (data directory)
	return dataPath
}

// checkBinaryExists checks if the binary exists at the given path
func (s *TunnelService) checkBinaryExists(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

// IsInstalled checks if cloudflared is installed
func (s *TunnelService) IsInstalled() bool {
	path := s.getCloudflaredPath()
	return s.checkBinaryExists(path)
}

// GetDownloadURL returns the download URL for cloudflared based on OS/arch
func (s *TunnelService) GetDownloadURL() string {
	baseURL := "https://github.com/cloudflare/cloudflared/releases/latest/download/"

	switch runtime.GOOS {
	case "windows":
		if runtime.GOARCH == "amd64" {
			return baseURL + "cloudflared-windows-amd64.exe"
		}
		return baseURL + "cloudflared-windows-386.exe"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return baseURL + "cloudflared-darwin-arm64.tgz"
		}
		return baseURL + "cloudflared-darwin-amd64.tgz"
	case "linux":
		if runtime.GOARCH == "arm64" {
			return baseURL + "cloudflared-linux-arm64"
		}
		if runtime.GOARCH == "arm" {
			return baseURL + "cloudflared-linux-arm"
		}
		return baseURL + "cloudflared-linux-amd64"
	default:
		return ""
	}
}

// DownloadCloudflared downloads the cloudflared binary
func (s *TunnelService) DownloadCloudflared() error {
	downloadURL := s.GetDownloadURL()
	if downloadURL == "" {
		return fmt.Errorf("unsupported platform: %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	// Get target path
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	dataDir := filepath.Join(exeDir, "data")

	// Ensure data directory exists
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	binaryName := "cloudflared"
	if runtime.GOOS == "windows" {
		binaryName = "cloudflared.exe"
	}
	targetPath := filepath.Join(dataDir, binaryName)

	s.addOutput(fmt.Sprintf("Downloading cloudflared from %s...", downloadURL))

	// Download file
	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	// Create temp file
	tmpFile, err := os.CreateTemp(dataDir, "cloudflared-download-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	// Download to temp file
	_, err = io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to save download: %w", err)
	}

	// Move to final location
	os.Remove(targetPath) // Remove existing if any
	if err := os.Rename(tmpPath, targetPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to move binary: %w", err)
	}

	// Make executable on Unix
	if runtime.GOOS != "windows" {
		if err := os.Chmod(targetPath, 0755); err != nil {
			return fmt.Errorf("failed to make binary executable: %w", err)
		}
	}

	s.addOutput(fmt.Sprintf("Cloudflared downloaded successfully to %s", targetPath))
	return nil
}

// StartTunnel starts the cloudflare tunnel with a quick tunnel (no token required)
func (s *TunnelService) StartTunnel(port int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("tunnel is already running")
	}

	binaryPath := s.getCloudflaredPath()
	if !s.checkBinaryExists(binaryPath) {
		return fmt.Errorf("cloudflared not installed. Please download it first")
	}

	// Get network config to determine which port to expose
	var netConfig models.NetworkConfig
	if err := s.db.First(&netConfig).Error; err != nil {
		// Use default port if not configured
		if port == 0 {
			port = 8082 // Default Config API port
		}
	} else if port == 0 {
		port = netConfig.ConfigAPIPort
	}

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	// Build command - Quick tunnel (no account required)
	s.cmd = exec.CommandContext(ctx, binaryPath, "tunnel", "--url", fmt.Sprintf("http://localhost:%d", port))

	// Get stdout and stderr pipes
	stdout, err := s.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := s.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	// Clear output buffer
	s.outputBuffer = make([]string, 0)
	s.lastError = ""
	s.tunnelURL = ""

	// Start the process
	if err := s.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start tunnel: %w", err)
	}

	s.isRunning = true
	s.addOutput(fmt.Sprintf("Starting tunnel on port %d...", port))

	// Monitor output in goroutines
	go s.monitorOutput(stdout)
	go s.monitorOutput(stderr)

	// Wait for process in background
	go func() {
		err := s.cmd.Wait()
		s.mu.Lock()
		s.isRunning = false
		if err != nil && !strings.Contains(err.Error(), "killed") {
			s.lastError = err.Error()
			s.addOutputLocked(fmt.Sprintf("Tunnel stopped: %s", err.Error()))
		} else {
			s.addOutputLocked("Tunnel stopped")
		}
		s.mu.Unlock()

		// Update database
		s.updateTunnelStatus(false, "")
	}()

	return nil
}

// StartTunnelWithToken starts the tunnel using a Cloudflare token
func (s *TunnelService) StartTunnelWithToken(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("tunnel is already running")
	}

	if token == "" {
		return fmt.Errorf("token is required")
	}

	binaryPath := s.getCloudflaredPath()
	if !s.checkBinaryExists(binaryPath) {
		return fmt.Errorf("cloudflared not installed. Please download it first")
	}

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	// Build command with token
	s.cmd = exec.CommandContext(ctx, binaryPath, "tunnel", "run", "--token", token)

	// Get stdout and stderr pipes
	stdout, err := s.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := s.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	// Clear output buffer
	s.outputBuffer = make([]string, 0)
	s.lastError = ""
	s.tunnelURL = ""

	// Start the process
	if err := s.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start tunnel: %w", err)
	}

	s.isRunning = true
	s.addOutput("Starting tunnel with token...")

	// Monitor output in goroutines
	go s.monitorOutput(stdout)
	go s.monitorOutput(stderr)

	// Wait for process in background
	go func() {
		err := s.cmd.Wait()
		s.mu.Lock()
		s.isRunning = false
		if err != nil && !strings.Contains(err.Error(), "killed") {
			s.lastError = err.Error()
			s.addOutputLocked(fmt.Sprintf("Tunnel stopped: %s", err.Error()))
		} else {
			s.addOutputLocked("Tunnel stopped")
		}
		s.mu.Unlock()

		// Update database
		s.updateTunnelStatus(false, "")
	}()

	return nil
}

// StopTunnel stops the running tunnel
func (s *TunnelService) StopTunnel() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return fmt.Errorf("tunnel is not running")
	}

	if s.cancel != nil {
		s.cancel()
	}

	// Give it a moment to stop gracefully
	time.Sleep(500 * time.Millisecond)

	// Force kill if still running
	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}

	s.isRunning = false
	s.addOutputLocked("Tunnel stopped by user")

	// Update database
	go s.updateTunnelStatus(false, "")

	return nil
}

// monitorOutput reads output from the tunnel process
func (s *TunnelService) monitorOutput(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	urlRegex := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)

	for scanner.Scan() {
		line := scanner.Text()
		s.mu.Lock()
		s.addOutputLocked(line)

		// Try to extract tunnel URL
		if matches := urlRegex.FindString(line); matches != "" {
			s.tunnelURL = matches
			s.addOutputLocked(fmt.Sprintf("Tunnel URL: %s", matches))

			// Update database with URL
			go s.updateTunnelStatus(true, matches)
		}

		s.mu.Unlock()
	}
}

// addOutput adds a line to the output buffer (thread-safe)
func (s *TunnelService) addOutput(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.addOutputLocked(line)
}

// addOutputLocked adds a line to the output buffer (must hold lock)
func (s *TunnelService) addOutputLocked(line string) {
	timestamp := time.Now().Format("15:04:05")
	s.outputBuffer = append(s.outputBuffer, fmt.Sprintf("[%s] %s", timestamp, line))

	// Trim if too long
	if len(s.outputBuffer) > s.maxOutputLines {
		s.outputBuffer = s.outputBuffer[len(s.outputBuffer)-s.maxOutputLines:]
	}
}

// updateTunnelStatus updates the tunnel status in the database
func (s *TunnelService) updateTunnelStatus(connected bool, url string) {
	var config models.TunnelConfig
	result := s.db.First(&config)

	if result.Error != nil {
		config = models.TunnelConfig{
			Provider:    "cloudflare",
			IsConnected: connected,
			TunnelURL:   url,
		}
		if connected {
			now := time.Now()
			config.LastConnected = &now
		}
		s.db.Create(&config)
	} else {
		config.IsConnected = connected
		if url != "" {
			config.TunnelURL = url
		}
		if connected {
			now := time.Now()
			config.LastConnected = &now
		}
		s.db.Save(&config)
	}
}

// GetTunnelURL returns the current tunnel URL
func (s *TunnelService) GetTunnelURL() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tunnelURL
}

// IsRunning returns whether the tunnel is currently running
func (s *TunnelService) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunning
}

// ClearOutput clears the output buffer
func (s *TunnelService) ClearOutput() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.outputBuffer = make([]string, 0)
}
