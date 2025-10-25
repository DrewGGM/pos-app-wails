package services

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	"PosApp/app/config"
	"PosApp/app/database"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ConfigManagerService manages application configuration
type ConfigManagerService struct{}

// NewConfigManagerService creates a new ConfigManagerService
func NewConfigManagerService() *ConfigManagerService {
	return &ConfigManagerService{}
}

// GetConfig returns the current configuration
func (s *ConfigManagerService) GetConfig() (*config.AppConfig, error) {
	return config.LoadConfig()
}

// SaveConfig saves the configuration
func (s *ConfigManagerService) SaveConfig(cfg *config.AppConfig) error {
	return config.SaveConfig(cfg)
}

// ConfigExists checks if configuration exists
func (s *ConfigManagerService) ConfigExists() (bool, error) {
	return config.ConfigExists()
}

// IsFirstRun checks if this is the first run
func (s *ConfigManagerService) IsFirstRun() (bool, error) {
	exists, err := config.ConfigExists()
	if err != nil {
		return false, err
	}

	if !exists {
		return true, nil
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return false, err
	}

	return cfg.FirstRun, nil
}

// CreateDefaultConfig creates a default configuration
func (s *ConfigManagerService) CreateDefaultConfig() (*config.AppConfig, error) {
	return config.CreateDefaultConfig()
}

// TestDatabaseConnection tests the database connection with given parameters
func (s *ConfigManagerService) TestDatabaseConnection(dbConfig config.DatabaseConfig) error {
	// Build connection string
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		dbConfig.Host,
		dbConfig.Port,
		dbConfig.Username,
		dbConfig.Password,
		dbConfig.Database,
		dbConfig.SSLMode,
	)

	// Try to open connection
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Get underlying SQL DB
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}
	defer sqlDB.Close()

	// Ping database
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	return nil
}

// InitializeDatabase creates database if it doesn't exist and runs migrations
func (s *ConfigManagerService) InitializeDatabase(dbConfig config.DatabaseConfig) error {
	// First, try to connect to the specified database
	err := s.TestDatabaseConnection(dbConfig)
	if err != nil {
		// If database doesn't exist, try to create it
		if strings.Contains(err.Error(), "does not exist") {
			if err := s.createDatabase(dbConfig); err != nil {
				return fmt.Errorf("failed to create database: %w", err)
			}
		} else {
			return err
		}
	}

	return nil
}

// createDatabase creates the database if it doesn't exist
func (s *ConfigManagerService) createDatabase(dbConfig config.DatabaseConfig) error {
	// Connect to postgres database to create the new database
	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=postgres sslmode=%s",
		dbConfig.Host,
		dbConfig.Port,
		dbConfig.Username,
		dbConfig.Password,
		dbConfig.SSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return err
	}
	defer db.Close()

	// Create database
	_, err = db.Exec(fmt.Sprintf("CREATE DATABASE %s", dbConfig.Database))
	if err != nil {
		return err
	}

	return nil
}

// RunSeeds executes the seed data from init_default_users_and_customers.sql script
func (s *ConfigManagerService) RunSeeds() error {
	// Get database instance
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Check if admin already exists (table might be 'employees' or 'users')
	var count int64

	// Try employees table first
	err := db.Table("employees").Where("username = ?", "admin").Count(&count).Error
	if err != nil {
		// If employees table doesn't exist or error, try users table
		err = db.Table("users").Where("username = ?", "admin").Count(&count).Error
		if err != nil {
			return fmt.Errorf("failed to check existing admin: %w", err)
		}
	}

	if count > 0 {
		// Admin already exists, skip seeding
		return nil
	}

	// Read SQL script from scripts/init_default_users_and_customers.sql
	scriptPath := "scripts/init_default_users_and_customers.sql"
	seedSQL, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("failed to read init_default_users_and_customers.sql: %w (make sure %s exists)", err, scriptPath)
	}

	// Execute SQL script
	if err := db.Exec(string(seedSQL)).Error; err != nil {
		return fmt.Errorf("failed to execute init_default_users_and_customers.sql: %w", err)
	}

	return nil
}

// CompleteSetup marks the setup as complete and runs seeds
func (s *ConfigManagerService) CompleteSetup() error {
	// Run seeds
	if err := s.RunSeeds(); err != nil {
		return fmt.Errorf("failed to run seeds: %w", err)
	}

	// Mark first run as complete
	if err := config.MarkSetupComplete(); err != nil {
		return fmt.Errorf("failed to mark setup complete: %w", err)
	}

	return nil
}

// GetConfigPath returns the path to the config file
func (s *ConfigManagerService) GetConfigPath() (string, error) {
	return config.GetConfigPath()
}
