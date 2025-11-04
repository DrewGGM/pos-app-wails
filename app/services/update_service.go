package services

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	CurrentVersion = "1.2.0"
	GitHubAPIURL   = "https://api.github.com/repos/DrewGGM/wails-posapp-releases/releases/latest"
)

// UpdateService handles application updates
type UpdateService struct {
	client *http.Client
}

// NewUpdateService creates a new update service
func NewUpdateService() *UpdateService {
	return &UpdateService{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GitHubRelease represents a GitHub release
type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int64  `json:"size"`
	} `json:"assets"`
	PublishedAt time.Time `json:"published_at"`
}

// UpdateInfo represents update information
type UpdateInfo struct {
	CurrentVersion string    `json:"current_version"`
	LatestVersion  string    `json:"latest_version"`
	UpdateAvailable bool     `json:"update_available"`
	DownloadURL    string    `json:"download_url"`
	ReleaseNotes   string    `json:"release_notes"`
	PublishedAt    time.Time `json:"published_at"`
	FileSize       int64     `json:"file_size"`
}

// GetCurrentVersion returns the current application version
func (s *UpdateService) GetCurrentVersion() string {
	return CurrentVersion
}

// CheckForUpdates checks if a new version is available
func (s *UpdateService) CheckForUpdates() (*UpdateInfo, error) {
	// Get latest release from GitHub
	req, err := http.NewRequest("GET", GitHubAPIURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch latest release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to decode release info: %w", err)
	}

	// Find the PosApp.zip asset
	var downloadURL string
	var fileSize int64
	for _, asset := range release.Assets {
		if asset.Name == "PosApp.zip" {
			downloadURL = asset.BrowserDownloadURL
			fileSize = asset.Size
			break
		}
	}

	if downloadURL == "" {
		return nil, fmt.Errorf("no PosApp.zip found in release")
	}

	// Compare versions
	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion := CurrentVersion
	updateAvailable := compareVersions(latestVersion, currentVersion) > 0

	return &UpdateInfo{
		CurrentVersion:  currentVersion,
		LatestVersion:   latestVersion,
		UpdateAvailable: updateAvailable,
		DownloadURL:     downloadURL,
		ReleaseNotes:    release.Body,
		PublishedAt:     release.PublishedAt,
		FileSize:        fileSize,
	}, nil
}

// DownloadUpdate downloads the update file
func (s *UpdateService) DownloadUpdate(url string) (string, error) {
	// Create temp directory
	tempDir := filepath.Join(os.TempDir(), "posapp-update")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create temp directory: %w", err)
	}

	// Download file
	zipPath := filepath.Join(tempDir, "PosApp.zip")
	out, err := os.Create(zipPath)
	if err != nil {
		return "", fmt.Errorf("failed to create zip file: %w", err)
	}
	defer out.Close()

	resp, err := s.client.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to save update: %w", err)
	}

	return zipPath, nil
}

// ExtractUpdate extracts the downloaded update
func (s *UpdateService) ExtractUpdate(zipPath string) (string, error) {
	tempDir := filepath.Dir(zipPath)
	extractDir := filepath.Join(tempDir, "extracted")

	if err := os.MkdirAll(extractDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create extract directory: %w", err)
	}

	// Open zip file
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	// Extract files
	var exePath string
	for _, f := range r.File {
		if strings.HasSuffix(f.Name, ".exe") {
			exePath = filepath.Join(extractDir, filepath.Base(f.Name))

			rc, err := f.Open()
			if err != nil {
				return "", fmt.Errorf("failed to open file in zip: %w", err)
			}

			out, err := os.Create(exePath)
			if err != nil {
				rc.Close()
				return "", fmt.Errorf("failed to create exe file: %w", err)
			}

			_, err = io.Copy(out, rc)
			out.Close()
			rc.Close()

			if err != nil {
				return "", fmt.Errorf("failed to extract exe: %w", err)
			}
			break
		}
	}

	if exePath == "" {
		return "", fmt.Errorf("no .exe file found in zip")
	}

	return exePath, nil
}

// ApplyUpdate replaces the current executable with the new one
func (s *UpdateService) ApplyUpdate(newExePath string) error {
	// Get current executable path
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get current executable path: %w", err)
	}

	// Resolve symlinks
	currentExe, err = filepath.EvalSymlinks(currentExe)
	if err != nil {
		return fmt.Errorf("failed to resolve executable path: %w", err)
	}

	// Create backup
	backupPath := currentExe + ".backup"
	if err := copyFile(currentExe, backupPath); err != nil {
		return fmt.Errorf("failed to create backup: %w", err)
	}

	// On Windows, we need to rename the current exe and then copy the new one
	if runtime.GOOS == "windows" {
		oldPath := currentExe + ".old"

		// Remove old .old file if exists
		os.Remove(oldPath)

		// Rename current exe to .old
		if err := os.Rename(currentExe, oldPath); err != nil {
			return fmt.Errorf("failed to rename current exe: %w", err)
		}

		// Copy new exe to current location
		if err := copyFile(newExePath, currentExe); err != nil {
			// Restore from backup
			os.Rename(oldPath, currentExe)
			return fmt.Errorf("failed to copy new exe: %w", err)
		}

		// Schedule cleanup of old file (best effort)
		go func() {
			time.Sleep(5 * time.Second)
			os.Remove(oldPath)
		}()
	} else {
		// On Unix-like systems, we can replace directly
		if err := copyFile(newExePath, currentExe); err != nil {
			// Restore from backup
			copyFile(backupPath, currentExe)
			return fmt.Errorf("failed to replace executable: %w", err)
		}

		// Make executable
		if err := os.Chmod(currentExe, 0755); err != nil {
			return fmt.Errorf("failed to set executable permissions: %w", err)
		}
	}

	return nil
}

// PerformUpdate performs the complete update process
func (s *UpdateService) PerformUpdate() error {
	// Check for updates
	updateInfo, err := s.CheckForUpdates()
	if err != nil {
		return fmt.Errorf("failed to check for updates: %w", err)
	}

	if !updateInfo.UpdateAvailable {
		return fmt.Errorf("no update available")
	}

	// Download update
	zipPath, err := s.DownloadUpdate(updateInfo.DownloadURL)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer os.Remove(zipPath)

	// Extract update
	newExePath, err := s.ExtractUpdate(zipPath)
	if err != nil {
		return fmt.Errorf("failed to extract update: %w", err)
	}
	defer os.Remove(newExePath)

	// Apply update
	if err := s.ApplyUpdate(newExePath); err != nil {
		return fmt.Errorf("failed to apply update: %w", err)
	}

	return nil
}

// Helper functions

func compareVersions(v1, v2 string) int {
	// Simple version comparison (assumes semantic versioning)
	// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal

	parts1 := strings.Split(v1, ".")
	parts2 := strings.Split(v2, ".")

	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		var n1, n2 int

		if i < len(parts1) {
			fmt.Sscanf(parts1[i], "%d", &n1)
		}
		if i < len(parts2) {
			fmt.Sscanf(parts2[i], "%d", &n2)
		}

		if n1 > n2 {
			return 1
		} else if n1 < n2 {
			return -1
		}
	}

	return 0
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
