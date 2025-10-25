package services

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	"PosApp/app/config"
	"PosApp/app/database"
	"PosApp/app/models"
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

	// Now actually initialize the database connection globally and run migrations
	// This is CRITICAL so that SaveRestaurantConfig and CompleteSetup can use database.GetDB()
	appCfg := &config.AppConfig{
		Database: dbConfig,
	}

	if err := database.InitializeWithConfig(appCfg); err != nil {
		return fmt.Errorf("failed to initialize database connection: %w", err)
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

// SaveRestaurantConfig saves business information to database (NOT config.json)
func (s *ConfigManagerService) SaveRestaurantConfig(name, businessName, nit, address, phone, email string) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Check if restaurant config already exists
	var restaurantConfig models.RestaurantConfig
	err := db.First(&restaurantConfig).Error

	if err == gorm.ErrRecordNotFound {
		// Create new restaurant config
		restaurantConfig = models.RestaurantConfig{
			Name:                 name,
			BusinessName:         businessName,
			IdentificationNumber: nit,
			Address:              address,
			Phone:                phone,
			Email:                email,
			// Defaults
			Currency:              "COP",
			CurrencySymbol:        "$",
			DecimalPlaces:         0,
			DefaultTaxRate:        19.0,
			TaxIncludedInPrice:    false,
			RestaurantMode:        "traditional",
			EnableTableManagement: false,
			EnableKitchenDisplay:  true,
			EnableWaiterApp:       false,
			ShowLogoOnInvoice:     true,
			OpeningTime:           "08:00",
			ClosingTime:           "22:00",
			WorkingDays:           "[\"monday\",\"tuesday\",\"wednesday\",\"thursday\",\"friday\",\"saturday\"]",
		}
		return db.Create(&restaurantConfig).Error
	} else if err != nil {
		return fmt.Errorf("failed to check restaurant config: %w", err)
	}

	// Update existing restaurant config
	restaurantConfig.Name = name
	restaurantConfig.BusinessName = businessName
	restaurantConfig.IdentificationNumber = nit
	restaurantConfig.Address = address
	restaurantConfig.Phone = phone
	restaurantConfig.Email = email

	return db.Save(&restaurantConfig).Error
}

// ExistingConfigData holds existing configuration from database
type ExistingConfigData struct {
	HasConfig       bool   `json:"has_config"`
	RestaurantName  string `json:"restaurant_name"`
	BusinessName    string `json:"business_name"`
	NIT             string `json:"nit"`
	Address         string `json:"address"`
	Phone           string `json:"phone"`
	Email           string `json:"email"`
	HasSystemConfig bool   `json:"has_system_config"`
}

// CheckExistingConfig checks if configuration already exists in the database
// This is useful for reinstallation scenarios where DB already has data
func (s *ConfigManagerService) CheckExistingConfig(dbConfig config.DatabaseConfig) (*ExistingConfigData, error) {
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
		return &ExistingConfigData{HasConfig: false}, nil
	}

	// Get underlying SQL DB
	sqlDB, err := db.DB()
	if err != nil {
		return &ExistingConfigData{HasConfig: false}, nil
	}
	defer sqlDB.Close()

	// Check if restaurant_configs table exists
	var tableExists bool
	err = db.Raw("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'restaurant_configs')").Scan(&tableExists).Error
	if err != nil || !tableExists {
		return &ExistingConfigData{HasConfig: false}, nil
	}

	// Try to get restaurant config
	var config struct {
		Name                 string `gorm:"column:name"`
		BusinessName         string `gorm:"column:business_name"`
		IdentificationNumber string `gorm:"column:identification_number"`
		Address              string `gorm:"column:address"`
		Phone                string `gorm:"column:phone"`
		Email                string `gorm:"column:email"`
	}

	err = db.Table("restaurant_configs").First(&config).Error
	if err != nil {
		// No config found
		return &ExistingConfigData{HasConfig: false}, nil
	}

	// Check for system_configs table
	var hasSystemConfig bool
	err = db.Raw("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'system_configs')").Scan(&hasSystemConfig).Error
	if err != nil {
		hasSystemConfig = false
	}

	// Return existing config data
	return &ExistingConfigData{
		HasConfig:       true,
		RestaurantName:  config.Name,
		BusinessName:    config.BusinessName,
		NIT:             config.IdentificationNumber,
		Address:         config.Address,
		Phone:           config.Phone,
		Email:           config.Email,
		HasSystemConfig: hasSystemConfig,
	}, nil
}
