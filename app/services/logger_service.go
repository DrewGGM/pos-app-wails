package services

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"time"
)

// LoggerService handles application logging
type LoggerService struct {
	logDir     string
	logFile    *os.File
	logger     *log.Logger
	currentDay string
}

// NewLoggerService creates a new logger service
func NewLoggerService() *LoggerService {
	service := &LoggerService{}
	service.initializeLogger()
	return service
}

// initializeLogger sets up the logging system
func (s *LoggerService) initializeLogger() error {
	// Get AppData directory for logs
	appData := os.Getenv("APPDATA")
	if appData == "" {
		// Fallback to user's home directory
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Printf("Warning: Could not get home directory: %v", err)
			s.logDir = "logs"
		} else {
			appData = filepath.Join(homeDir, "AppData", "Roaming")
		}
	}

	if appData != "" {
		// Create logs directory in AppData/PosApp/logs
		s.logDir = filepath.Join(appData, "PosApp", "logs")
	} else {
		s.logDir = "logs"
	}

	// Create logs directory
	if err := os.MkdirAll(s.logDir, 0755); err != nil {
		log.Printf("Warning: Could not create logs directory: %v", err)
		// Fallback to current directory
		s.logDir = "logs"
		os.MkdirAll(s.logDir, 0755)
	}

	// Create or open log file for today
	if err := s.rotateLogFile(); err != nil {
		log.Printf("Warning: Could not create log file: %v. Logging to stdout only.", err)
		// Continue without file logging - log to stdout only
		s.logger = log.New(os.Stdout, "", log.LstdFlags|log.Lshortfile)
		log.SetOutput(os.Stdout)
		log.SetFlags(log.LstdFlags | log.Lshortfile)
		return nil
	}

	// Set up multi-writer to write to both file and stdout
	multiWriter := io.MultiWriter(os.Stdout, s.logFile)
	s.logger = log.New(multiWriter, "", log.LstdFlags|log.Lshortfile)

	// Replace standard logger
	log.SetOutput(multiWriter)
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	s.LogInfo("Logger initialized", fmt.Sprintf("Log directory: %s", s.logDir))

	return nil
}

// rotateLogFile creates a new log file for the current day
func (s *LoggerService) rotateLogFile() error {
	now := time.Now()
	today := now.Format("2006-01-02")

	// Check if we need to rotate (new day)
	if s.currentDay == today && s.logFile != nil {
		return nil // Already on correct file
	}

	// Close old file if exists
	if s.logFile != nil {
		s.logFile.Close()
	}

	// Create new log file with date
	logFileName := fmt.Sprintf("%s.log", today)
	logFilePath := filepath.Join(s.logDir, logFileName)

	file, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}

	s.logFile = file
	s.currentDay = today

	return nil
}

// LogInfo logs an informational message
func (s *LoggerService) LogInfo(message string, details ...string) {
	s.checkAndRotate()
	detailStr := ""
	if len(details) > 0 {
		detailStr = " | " + details[0]
	}
	s.logger.Printf("[INFO] %s%s", message, detailStr)
}

// LogWarning logs a warning message
func (s *LoggerService) LogWarning(message string, details ...string) {
	s.checkAndRotate()
	detailStr := ""
	if len(details) > 0 {
		detailStr = " | " + details[0]
	}
	s.logger.Printf("[WARNING] %s%s", message, detailStr)
}

// LogError logs an error message
func (s *LoggerService) LogError(message string, err error, details ...string) {
	s.checkAndRotate()
	detailStr := ""
	if len(details) > 0 {
		detailStr = " | " + details[0]
	}
	errorStr := ""
	if err != nil {
		errorStr = fmt.Sprintf(" | Error: %v", err)
	}
	s.logger.Printf("[ERROR] %s%s%s", message, errorStr, detailStr)
}

// LogFatal logs a fatal error and exits
func (s *LoggerService) LogFatal(message string, err error) {
	s.checkAndRotate()
	errorStr := ""
	if err != nil {
		errorStr = fmt.Sprintf(" | Error: %v", err)
	}
	s.logger.Printf("[FATAL] %s%s", message, errorStr)
	s.logger.Printf("[FATAL] Stack trace:\n%s", string(debug.Stack()))
	if s.logFile != nil {
		s.logFile.Close()
	}
	os.Exit(1)
}

// LogPanic logs a panic with stack trace
func (s *LoggerService) LogPanic(recovered interface{}) {
	s.checkAndRotate()
	s.logger.Printf("[PANIC] Recovered from panic: %v", recovered)
	s.logger.Printf("[PANIC] Stack trace:\n%s", string(debug.Stack()))
}

// LogFrontendError logs errors from the frontend (called via Wails binding)
func (s *LoggerService) LogFrontendError(message string, stack string, componentInfo string) {
	s.checkAndRotate()
	s.logger.Printf("[FRONTEND ERROR] %s", message)
	if componentInfo != "" {
		s.logger.Printf("[FRONTEND ERROR] Component: %s", componentInfo)
	}
	if stack != "" {
		s.logger.Printf("[FRONTEND ERROR] Stack trace:\n%s", stack)
	}
}

// LogFrontendWarning logs warnings from the frontend
func (s *LoggerService) LogFrontendWarning(message string, details string) {
	s.checkAndRotate()
	detailStr := ""
	if details != "" {
		detailStr = " | " + details
	}
	s.logger.Printf("[FRONTEND WARNING] %s%s", message, detailStr)
}

// LogFrontendInfo logs info from the frontend
func (s *LoggerService) LogFrontendInfo(message string, details string) {
	s.checkAndRotate()
	detailStr := ""
	if details != "" {
		detailStr = " | " + details
	}
	s.logger.Printf("[FRONTEND INFO] %s%s", message, detailStr)
}

// checkAndRotate checks if we need to rotate to a new day's log file
func (s *LoggerService) checkAndRotate() {
	today := time.Now().Format("2006-01-02")
	if s.currentDay != today {
		s.rotateLogFile()
		// Update logger output
		if s.logFile != nil {
			multiWriter := io.MultiWriter(os.Stdout, s.logFile)
			s.logger.SetOutput(multiWriter)
			log.SetOutput(multiWriter)
		}
	}
}

// GetLogDirectory returns the directory where logs are stored
func (s *LoggerService) GetLogDirectory() string {
	return s.logDir
}

// GetTodayLogPath returns the path to today's log file
func (s *LoggerService) GetTodayLogPath() string {
	today := time.Now().Format("2006-01-02")
	return filepath.Join(s.logDir, fmt.Sprintf("%s.log", today))
}

// CleanOldLogs removes log files older than specified days
func (s *LoggerService) CleanOldLogs(daysToKeep int) error {
	files, err := os.ReadDir(s.logDir)
	if err != nil {
		return err
	}

	cutoffDate := time.Now().AddDate(0, 0, -daysToKeep)

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		// Check if it's a log file (matches YYYY-MM-DD.log pattern)
		if filepath.Ext(file.Name()) != ".log" {
			continue
		}

		info, err := file.Info()
		if err != nil {
			continue
		}

		// Delete if older than cutoff
		if info.ModTime().Before(cutoffDate) {
			filePath := filepath.Join(s.logDir, file.Name())
			s.LogInfo("Deleting old log file", filePath)
			os.Remove(filePath)
		}
	}

	return nil
}

// Close closes the log file
func (s *LoggerService) Close() {
	if s.logFile != nil {
		s.logFile.Close()
	}
}

// RecoverPanic is a helper to recover from panics in goroutines
func (s *LoggerService) RecoverPanic() {
	if r := recover(); r != nil {
		s.LogPanic(r)
	}
}
