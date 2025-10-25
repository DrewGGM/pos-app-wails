package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"strconv"

	"gorm.io/gorm"
)

// ConfigService handles system configuration
type ConfigService struct {
	db *gorm.DB
}

// NewConfigService creates a new config service
func NewConfigService() *ConfigService {
	return &ConfigService{
		db: database.GetDB(),
	}
}

// GetSystemConfig gets a system configuration value
func (s *ConfigService) GetSystemConfig(key string) (string, error) {
	var config models.SystemConfig
	if err := s.db.Where("key = ?", key).First(&config).Error; err != nil {
		return "", err
	}
	return config.Value, nil
}

// SetSystemConfig sets a system configuration value
func (s *ConfigService) SetSystemConfig(key, value, configType, category string) error {
	var config models.SystemConfig

	err := s.db.Where("key = ?", key).First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Create new config
		config = models.SystemConfig{
			Key:      key,
			Value:    value,
			Type:     configType,
			Category: category,
		}
		return s.db.Create(&config).Error
	} else if err != nil {
		return err
	}

	// Update existing config if not locked
	if config.IsLocked {
		return fmt.Errorf("configuration key '%s' is locked and cannot be modified", key)
	}

	config.Value = value
	return s.db.Save(&config).Error
}

// GetAllSystemConfigs gets all system configurations
func (s *ConfigService) GetAllSystemConfigs() ([]models.SystemConfig, error) {
	var configs []models.SystemConfig
	err := s.db.Order("category, key").Find(&configs).Error
	return configs, err
}

// GetSystemConfigInt gets a system configuration as integer with default value
func (s *ConfigService) GetSystemConfigInt(key string, defaultValue int) int {
	value, err := s.GetSystemConfig(key)
	if err != nil {
		return defaultValue
	}
	intValue, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}
	return intValue
}

// GetSystemConfigBool gets a system configuration as boolean with default value
func (s *ConfigService) GetSystemConfigBool(key string, defaultValue bool) bool {
	value, err := s.GetSystemConfig(key)
	if err != nil {
		return defaultValue
	}
	boolValue, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return boolValue
}

// InitializeDefaultSystemConfigs initializes default system configurations
func (s *ConfigService) InitializeDefaultSystemConfigs() error {
	// Check if database is initialized
	if s.db == nil {
		return nil // Skip if database not ready (e.g., during first run or build)
	}

	defaults := []struct {
		Key      string
		Value    string
		Type     string
		Category string
	}{
		{"low_stock_threshold", "10", "number", "inventory"},
		{"kitchen_refresh_interval", "30", "number", "ui"},
		{"max_offline_days", "7", "number", "sync"},
	}

	for _, def := range defaults {
		var existing models.SystemConfig
		err := s.db.Where("key = ?", def.Key).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			// Create if not exists
			config := models.SystemConfig{
				Key:      def.Key,
				Value:    def.Value,
				Type:     def.Type,
				Category: def.Category,
				IsLocked: false,
			}
			if err := s.db.Create(&config).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// GetRestaurantConfig gets restaurant configuration
func (s *ConfigService) GetRestaurantConfig() (*models.RestaurantConfig, error) {
	var config models.RestaurantConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config
		config = models.RestaurantConfig{
			Name:                  "Mi Restaurante",
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
		s.db.Create(&config)
	}
	return &config, err
}

// UpdateRestaurantConfig updates restaurant configuration
func (s *ConfigService) UpdateRestaurantConfig(config *models.RestaurantConfig) error {
	// If no ID, create new
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// GetDIANConfig gets DIAN configuration
func (s *ConfigService) GetDIANConfig() (*models.DIANConfig, error) {
	var config models.DIANConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config - APIURL must be configured before use
		config = models.DIANConfig{
			Environment: "test",
			IsEnabled:   false,
			APIURL:      "", // Must be configured in Settings
		}
		s.db.Create(&config)
	}
	return &config, err
}

// UpdateDIANConfig updates DIAN configuration
func (s *ConfigService) UpdateDIANConfig(config *models.DIANConfig) error {
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// GetPrinterConfigs gets all printer configurations
func (s *ConfigService) GetPrinterConfigs() ([]models.PrinterConfig, error) {
	var configs []models.PrinterConfig
	err := s.db.Where("is_active = ?", true).Find(&configs).Error
	return configs, err
}

// GetDefaultPrinter gets the default printer, or any active printer if no default is set
func (s *ConfigService) GetDefaultPrinter() (*models.PrinterConfig, error) {
	var printer models.PrinterConfig

	// Try to get default printer first
	err := s.db.Where("is_default = ? AND is_active = ?", true, true).First(&printer).Error
	if err == nil {
		return &printer, nil
	}

	// If no default printer, get any active printer
	err = s.db.Where("is_active = ?", true).First(&printer).Error
	if err != nil {
		return nil, fmt.Errorf("no active printer found: please configure a printer in Settings")
	}

	return &printer, nil
}

// SavePrinterConfig saves printer configuration
func (s *ConfigService) SavePrinterConfig(config *models.PrinterConfig) error {
	// If setting as default, unset other defaults
	if config.IsDefault {
		s.db.Model(&models.PrinterConfig{}).Where("id != ?", config.ID).Update("is_default", false)
	}

	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// DeletePrinterConfig deletes a printer configuration
func (s *ConfigService) DeletePrinterConfig(id uint) error {
	return s.db.Delete(&models.PrinterConfig{}, id).Error
}

// GetSyncConfig gets sync configuration
func (s *ConfigService) GetSyncConfig() (*models.SyncConfig, error) {
	var config models.SyncConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config
		config = models.SyncConfig{
			EnableAutoSync: true,
			SyncInterval:   5,
			RetryAttempts:  3,
			RetryDelay:     30,
		}
		s.db.Create(&config)
	}
	return &config, err
}

// UpdateSyncConfig updates sync configuration
func (s *ConfigService) UpdateSyncConfig(config *models.SyncConfig) error {
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// GetUITheme gets UI theme configuration
func (s *ConfigService) GetUITheme() (*models.UITheme, error) {
	var theme models.UITheme
	err := s.db.First(&theme).Error
	if err == gorm.ErrRecordNotFound {
		// Return default theme
		theme = models.UITheme{
			PrimaryColor:    "#3B82F6",
			SecondaryColor:  "#8B5CF6",
			AccentColor:     "#F59E0B",
			BackgroundColor: "#FFFFFF",
			TextColor:       "#1F2937",
			FontFamily:      "Inter",
			FontSize:        "16px",
			ButtonStyle:     "rounded",
			DarkMode:        false,
		}
		s.db.Create(&theme)
	}
	return &theme, err
}

// UpdateUITheme updates UI theme
func (s *ConfigService) UpdateUITheme(theme *models.UITheme) error {
	if theme.ID == 0 {
		return s.db.Create(theme).Error
	}
	return s.db.Save(theme).Error
}

// GetTableLayout gets table layout configuration
func (s *ConfigService) GetTableLayout() (*models.TableLayout, error) {
	var layout models.TableLayout
	err := s.db.Where("is_default = ?", true).First(&layout).Error
	if err == gorm.ErrRecordNotFound {
		// Return default layout
		layout = models.TableLayout{
			Name:      "Default Layout",
			IsDefault: true,
			Layout:    json.RawMessage(`{"tables":[]}`),
		}
		s.db.Create(&layout)
	}
	return &layout, err
}

// SaveTableLayout saves table layout
func (s *ConfigService) SaveTableLayout(layout *models.TableLayout) error {
	// If setting as default, unset other defaults
	if layout.IsDefault {
		s.db.Model(&models.TableLayout{}).Where("id != ?", layout.ID).Update("is_default", false)
	}

	if layout.ID == 0 {
		return s.db.Create(layout).Error
	}
	return s.db.Save(layout).Error
}

// GetWebSocketPort gets the WebSocket server port
func (s *ConfigService) GetWebSocketPort() (int, error) {
	portStr, err := s.GetSystemConfig("websocket_port")
	if err != nil || portStr == "" {
		// Default port
		return 8080, nil
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return 8080, nil
	}

	return port, nil
}

// SetWebSocketPort sets the WebSocket server port
func (s *ConfigService) SetWebSocketPort(port int) error {
	return s.SetSystemConfig("websocket_port", strconv.Itoa(port), "number", "network")
}

// GetDatabaseConfig gets database configuration
func (s *ConfigService) GetDatabaseConfig() (map[string]string, error) {
	config := make(map[string]string)

	// Get PostgreSQL connection details
	config["db_host"], _ = s.GetSystemConfig("db_host")
	config["db_port"], _ = s.GetSystemConfig("db_port")
	config["db_name"], _ = s.GetSystemConfig("db_name")
	config["db_user"], _ = s.GetSystemConfig("db_user")
	config["db_password"], _ = s.GetSystemConfig("db_password")

	// SQLite local path
	config["sqlite_path"], _ = s.GetSystemConfig("sqlite_path")
	if config["sqlite_path"] == "" {
		config["sqlite_path"] = "./data/local.db"
	}

	return config, nil
}

// InitializeDefaultConfig initializes default configuration
func (s *ConfigService) InitializeDefaultConfig() error {
	// System configs
	configs := map[string][]string{
		"websocket_port":      {"8080", "number", "network"},
		"sqlite_path":         {"./data/local.db", "string", "database"},
		"enable_auto_sync":    {"true", "boolean", "sync"},
		"sync_interval":       {"5", "number", "sync"},
		"retry_attempts":      {"3", "number", "sync"},
		"retry_delay":         {"30", "number", "sync"},
		"default_tax_rate":    {"19", "number", "tax"},
		"currency":            {"COP", "string", "general"},
		"currency_symbol":     {"$", "string", "general"},
		"decimal_places":      {"0", "number", "general"},
		"enable_offline_mode": {"true", "boolean", "general"},
		"max_offline_days":    {"7", "number", "general"},
	}

	for key, values := range configs {
		s.SetSystemConfig(key, values[0], values[1], values[2])
	}

	return nil
}

// GetDIANParametricData returns DIAN parametric data
func (s *ConfigService) GetDIANParametricData() *models.DIANParametricData {
	return models.GetDIANParametricData()
}

// ValidateConfiguration validates system configuration
func (s *ConfigService) ValidateConfiguration() (bool, []string) {
	var errors []string
	valid := true

	// Check restaurant config
	restaurant, err := s.GetRestaurantConfig()
	if err != nil || restaurant.Name == "" {
		errors = append(errors, "Restaurant name not configured")
		valid = false
	}

	// Check DIAN config if enabled
	dian, err := s.GetDIANConfig()
	if err == nil && dian.IsEnabled {
		if dian.IdentificationNumber == "" {
			errors = append(errors, "DIAN: Identification number not configured")
			valid = false
		}
		if dian.SoftwareID == "" {
			errors = append(errors, "DIAN: Software ID not configured")
			valid = false
		}
		if dian.Certificate == "" {
			errors = append(errors, "DIAN: Certificate not configured")
			valid = false
		}
		if dian.ResolutionNumber == "" && dian.Environment == "production" {
			errors = append(errors, "DIAN: Resolution not configured for production")
			valid = false
		}
	}

	// Check printer config
	printers, _ := s.GetPrinterConfigs()
	if len(printers) == 0 {
		errors = append(errors, "Warning: No printers configured")
	}

	return valid, errors
}
