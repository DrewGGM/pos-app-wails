package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"PosApp/app/security"
)

// AppConfig holds all application configuration
type AppConfig struct {
	// Database Configuration
	Database DatabaseConfig `json:"database"`

	// DIAN API Configuration
	DIAN DianConfig `json:"dian"`

	// Business Information
	Business BusinessConfig `json:"business"`

	// System Configuration
	System SystemConfig `json:"system"`

	// First run flag
	FirstRun bool `json:"first_run"`
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
	Password string `json:"password"`
	SSLMode  string `json:"ssl_mode"`
}

// DianConfig holds DIAN electronic invoicing settings
type DianConfig struct {
	APIUrl      string `json:"api_url"`
	TestMode    bool   `json:"test_mode"`
	SoftwareID  string `json:"software_id"`
	SoftwarePin string `json:"software_pin"`
	TestSetID   string `json:"test_set_id"`
}

// BusinessConfig holds business information
type BusinessConfig struct {
	Name       string `json:"name"`
	LegalName  string `json:"legal_name"`
	NIT        string `json:"nit"`
	Address    string `json:"address"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
}

// SystemConfig holds system settings
type SystemConfig struct {
	DataPath    string `json:"data_path"`
	PrinterName string `json:"printer_name"`
	Language    string `json:"language"`
}

// GetConfigPath returns the path to the config file
func GetConfigPath() (string, error) {
	// Get user's AppData directory
	appData := os.Getenv("APPDATA")
	if appData == "" {
		// Fallback to user's home directory
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		appData = filepath.Join(homeDir, "AppData", "Roaming")
	}

	// Create PosApp directory if it doesn't exist
	configDir := filepath.Join(appData, "PosApp")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return "", fmt.Errorf("could not create config directory: %w", err)
	}

	return filepath.Join(configDir, "config.json"), nil
}

// LoadConfig loads configuration from config.json and decrypts sensitive fields
func LoadConfig() (*AppConfig, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("config file not found")
	}

	// Read config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("could not read config file: %w", err)
	}

	// Parse JSON
	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("could not parse config file: %w", err)
	}

	// Decrypt sensitive fields
	if err := cfg.decryptSensitiveFields(); err != nil {
		return nil, fmt.Errorf("could not decrypt sensitive fields: %w", err)
	}

	return &cfg, nil
}

// SaveConfig saves configuration to config.json after encrypting sensitive fields
func SaveConfig(cfg *AppConfig) error {
	configPath, err := GetConfigPath()
	if err != nil {
		return err
	}

	// Create a copy to avoid modifying the original
	cfgCopy := *cfg

	// Encrypt sensitive fields in the copy
	if err := cfgCopy.encryptSensitiveFields(); err != nil {
		return fmt.Errorf("could not encrypt sensitive fields: %w", err)
	}

	// Marshal to JSON with indentation
	data, err := json.MarshalIndent(&cfgCopy, "", "  ")
	if err != nil {
		return fmt.Errorf("could not marshal config: %w", err)
	}

	// Write to file with restrictive permissions
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("could not write config file: %w", err)
	}

	return nil
}

// ConfigExists checks if config file exists
func ConfigExists() (bool, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return false, err
	}

	_, err = os.Stat(configPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return true, nil
}

// CreateDefaultConfig creates a default configuration file
func CreateDefaultConfig() (*AppConfig, error) {
	cfg := &AppConfig{
		Database: DatabaseConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "pos_app_db",
			Username: "postgres",
			Password: "",
			SSLMode:  "disable",
		},
		DIAN: DianConfig{
			APIUrl:      "",
			TestMode:    true,
			SoftwareID:  "",
			SoftwarePin: "",
			TestSetID:   "",
		},
		Business: BusinessConfig{
			Name:      "Mi Negocio",
			LegalName: "",
			NIT:       "",
			Address:   "",
			Phone:     "",
			Email:     "",
		},
		System: SystemConfig{
			DataPath:    "",
			PrinterName: "",
			Language:    "es",
		},
		FirstRun: true,
	}

	// Save default config
	if err := SaveConfig(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// UpdateConfig updates specific fields in the config
func UpdateConfig(updates map[string]interface{}) error {
	// Load existing config
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}

	// Update fields based on the map
	// This is a simplified version - you can make it more sophisticated
	if db, ok := updates["database"].(map[string]interface{}); ok {
		if host, ok := db["host"].(string); ok {
			cfg.Database.Host = host
		}
		if port, ok := db["port"].(float64); ok {
			cfg.Database.Port = int(port)
		}
		if database, ok := db["database"].(string); ok {
			cfg.Database.Database = database
		}
		if username, ok := db["username"].(string); ok {
			cfg.Database.Username = username
		}
		if password, ok := db["password"].(string); ok {
			cfg.Database.Password = password
		}
	}

	// Save updated config
	return SaveConfig(cfg)
}

// MarkSetupComplete marks the first run as complete
func MarkSetupComplete() error {
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}

	cfg.FirstRun = false
	return SaveConfig(cfg)
}

// encryptSensitiveFields encrypts sensitive configuration fields
func (cfg *AppConfig) encryptSensitiveFields() error {
	var err error

	// Encrypt database password
	if cfg.Database.Password != "" {
		cfg.Database.Password, err = security.Encrypt(cfg.Database.Password)
		if err != nil {
			return fmt.Errorf("could not encrypt database password: %w", err)
		}
	}

	// Encrypt DIAN API credentials
	if cfg.DIAN.SoftwarePin != "" {
		cfg.DIAN.SoftwarePin, err = security.Encrypt(cfg.DIAN.SoftwarePin)
		if err != nil {
			return fmt.Errorf("could not encrypt DIAN software pin: %w", err)
		}
	}

	if cfg.DIAN.TestSetID != "" {
		cfg.DIAN.TestSetID, err = security.Encrypt(cfg.DIAN.TestSetID)
		if err != nil {
			return fmt.Errorf("could not encrypt DIAN test set ID: %w", err)
		}
	}

	return nil
}

// decryptSensitiveFields decrypts sensitive configuration fields
// If a field is not encrypted (plain text), it leaves it as-is (useful for development)
func (cfg *AppConfig) decryptSensitiveFields() error {
	// Decrypt database password
	if cfg.Database.Password != "" {
		decrypted, err := security.Decrypt(cfg.Database.Password)
		if err != nil {
			// If decryption fails, assume it's plain text (for development)
			// In production, values should always be encrypted
			decrypted = cfg.Database.Password
		}
		cfg.Database.Password = decrypted
	}

	// Decrypt DIAN API credentials
	if cfg.DIAN.SoftwarePin != "" {
		decrypted, err := security.Decrypt(cfg.DIAN.SoftwarePin)
		if err != nil {
			// If decryption fails, assume it's plain text
			decrypted = cfg.DIAN.SoftwarePin
		}
		cfg.DIAN.SoftwarePin = decrypted
	}

	if cfg.DIAN.TestSetID != "" {
		decrypted, err := security.Decrypt(cfg.DIAN.TestSetID)
		if err != nil {
			// If decryption fails, assume it's plain text
			decrypted = cfg.DIAN.TestSetID
		}
		cfg.DIAN.TestSetID = decrypted
	}

	return nil
}
