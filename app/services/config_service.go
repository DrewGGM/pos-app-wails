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
	*BaseService
}

// NewConfigService creates a new config service
func NewConfigService() *ConfigService {
	return &ConfigService{
		BaseService: &BaseService{db: database.GetDB()},
	}
}

// GetSystemConfig gets a system configuration value
func (s *ConfigService) GetSystemConfig(key string) (string, error) {
	if err := s.EnsureDB(); err != nil {
		return "", err
	}
	var config models.SystemConfig
	if err := s.db.Where("key = ?", key).First(&config).Error; err != nil {
		return "", err
	}
	return config.Value, nil
}

// SetSystemConfig sets a system configuration value
func (s *ConfigService) SetSystemConfig(key, value, configType, category string) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}
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
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
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
	if s.EnsureDB() != nil {
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
		// Cloudflare Tunnel configuration
		{"tunnel_enabled", "false", "boolean", "network"},
		{"tunnel_url", "", "string", "network"},
		{"tunnel_websocket_secure", "true", "boolean", "network"},
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
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
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
			EnableKitchenAck:      false, // Disabled by default
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
// Supports partial updates - only updates the fields that are provided
func (s *ConfigService) UpdateRestaurantConfig(config *models.RestaurantConfig) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}

	fmt.Printf("\n🔍 [UpdateRestaurantConfig] Recibiendo actualización:\n")
	configJSON, _ := json.MarshalIndent(config, "", "  ")
	fmt.Printf("   Datos recibidos: %s\n", string(configJSON))

	// Get existing config to determine ID
	var existing models.RestaurantConfig
	err := s.db.First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		fmt.Println("   ℹ️  No existe config, creando nueva...")
		return s.db.Create(config).Error
	}

	if err != nil {
		return err
	}

	fmt.Printf("   📋 Config existente (campos de módulos): inventory=%v, ingredients=%v, combos=%v, customers=%v, reports=%v, discounts=%v\n",
		existing.EnableInventoryModule, existing.EnableIngredientsModule, existing.EnableCombosModule,
		existing.EnableCustomersModule, existing.EnableReportsModule, existing.EnableDiscountsModule)

	// Convert struct to map to handle false/zero values correctly
	// GORM's Updates() ignores zero values when using structs, but not when using maps
	configMap := make(map[string]interface{})
	configJSON, err = json.Marshal(config)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(configJSON, &configMap); err != nil {
		return err
	}

	fmt.Printf("   🗺️  Map después de JSON (primeras claves): ")
	count := 0
	for key := range configMap {
		if count < 10 {
			fmt.Printf("%s, ", key)
			count++
		}
	}
	fmt.Println()

	// Remove nil values and metadata fields that shouldn't be updated
	delete(configMap, "id")
	delete(configMap, "created_at")
	delete(configMap, "updated_at")
	delete(configMap, "deleted_at")

	// Remove nil values from map
	for key, value := range configMap {
		if value == nil {
			delete(configMap, key)
		}
	}

	fmt.Printf("   ✅ Campos a actualizar (%d): ", len(configMap))
	for key, value := range configMap {
		fmt.Printf("%s=%v, ", key, value)
	}
	fmt.Println()

	// Use Updates() with map - this will update false values correctly
	err = s.db.Model(&existing).Updates(configMap).Error
	if err != nil {
		fmt.Printf("   ❌ Error al actualizar: %v\n", err)
		return err
	}

	// Reload to show what was saved
	var updated models.RestaurantConfig
	s.db.First(&updated)
	fmt.Printf("   💾 Config después de actualizar (campos de módulos): inventory=%v, ingredients=%v, combos=%v, customers=%v, reports=%v, discounts=%v\n\n",
		updated.EnableInventoryModule, updated.EnableIngredientsModule, updated.EnableCombosModule,
		updated.EnableCustomersModule, updated.EnableReportsModule, updated.EnableDiscountsModule)

	return nil
}

// UpdateRestaurantConfigPartial updates restaurant configuration with a map of fields
// This properly handles partial updates including false/zero values
func (s *ConfigService) UpdateRestaurantConfigPartial(updates map[string]interface{}) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}

	fmt.Printf("\n🔍 [UpdateRestaurantConfigPartial] Actualización parcial:\n")
	fmt.Printf("   Campos recibidos (%d): ", len(updates))
	for key, value := range updates {
		fmt.Printf("%s=%v, ", key, value)
	}
	fmt.Println()

	// Get existing config
	var existing models.RestaurantConfig
	err := s.db.First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		fmt.Println("   ℹ️  No existe config, creando nueva...")
		newConfig := &models.RestaurantConfig{}
		if err := s.db.Create(newConfig).Error; err != nil {
			return err
		}
		existing = *newConfig
	} else if err != nil {
		return err
	}

	fmt.Printf("   📋 Antes: inventory=%v, ingredients=%v, combos=%v, customers=%v, reports=%v, discounts=%v\n",
		existing.EnableInventoryModule, existing.EnableIngredientsModule, existing.EnableCombosModule,
		existing.EnableCustomersModule, existing.EnableReportsModule, existing.EnableDiscountsModule)

	// Remove metadata fields
	delete(updates, "id")
	delete(updates, "created_at")
	delete(updates, "updated_at")
	delete(updates, "deleted_at")

	// Remove nil values from map
	for key, value := range updates {
		if value == nil {
			delete(updates, key)
		}
	}

	fmt.Printf("   ✅ Campos a actualizar después de filtrar (%d): ", len(updates))
	for key, value := range updates {
		fmt.Printf("%s=%v, ", key, value)
	}
	fmt.Println()

	// Update with map
	err = s.db.Model(&existing).Updates(updates).Error
	if err != nil {
		fmt.Printf("   ❌ Error: %v\n", err)
		return err
	}

	// Reload
	var updated models.RestaurantConfig
	s.db.First(&updated)
	fmt.Printf("   💾 Después: inventory=%v, ingredients=%v, combos=%v, customers=%v, reports=%v, discounts=%v\n\n",
		updated.EnableInventoryModule, updated.EnableIngredientsModule, updated.EnableCombosModule,
		updated.EnableCustomersModule, updated.EnableReportsModule, updated.EnableDiscountsModule)

	return nil
}

// GetDIANConfig gets DIAN configuration
func (s *ConfigService) GetDIANConfig() (*models.DIANConfig, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
	var config models.DIANConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config - APIURL must be configured before use
		config = models.DIANConfig{
			Environment:  "test",
			IsEnabled:    false,
			UseTestSetID: true, // Default to true for test mode
			APIURL:       "",   // Must be configured in Settings
		}
		s.db.Create(&config)
	}
	return &config, err
}

// UpdateDIANConfig updates DIAN configuration
func (s *ConfigService) UpdateDIANConfig(config *models.DIANConfig) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// GetPrinterConfigs gets all printer configurations
func (s *ConfigService) GetPrinterConfigs() ([]models.PrinterConfig, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
	var configs []models.PrinterConfig
	err := s.db.Where("is_active = ?", true).Find(&configs).Error
	return configs, err
}

// GetDefaultPrinter gets the default printer, or any active printer if no default is set
func (s *ConfigService) GetDefaultPrinter() (*models.PrinterConfig, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
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
	if err := s.EnsureDB(); err != nil {
		return err
	}
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
	if err := s.EnsureDB(); err != nil {
		return err
	}
	return s.db.Delete(&models.PrinterConfig{}, id).Error
}

// GetUITheme gets UI theme configuration
func (s *ConfigService) GetUITheme() (*models.UITheme, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
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
	if err := s.EnsureDB(); err != nil {
		return err
	}
	if theme.ID == 0 {
		return s.db.Create(theme).Error
	}
	return s.db.Save(theme).Error
}

// GetTableLayout gets table layout configuration
func (s *ConfigService) GetTableLayout() (*models.TableLayout, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
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
	if err := s.EnsureDB(); err != nil {
		return err
	}
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

// TunnelConfig represents the tunnel configuration for external access
type TunnelConfig struct {
	Enabled         bool   `json:"enabled"`
	URL             string `json:"url"`
	WebSocketSecure bool   `json:"websocket_secure"`
}

// GetTunnelConfig gets the Cloudflare tunnel configuration
func (s *ConfigService) GetTunnelConfig() (*TunnelConfig, error) {
	enabled := s.GetSystemConfigBool("tunnel_enabled", false)
	url, _ := s.GetSystemConfig("tunnel_url")
	wsSecure := s.GetSystemConfigBool("tunnel_websocket_secure", true)

	return &TunnelConfig{
		Enabled:         enabled,
		URL:             url,
		WebSocketSecure: wsSecure,
	}, nil
}

// SetTunnelConfig sets the Cloudflare tunnel configuration
func (s *ConfigService) SetTunnelConfig(config *TunnelConfig) error {
	if err := s.SetSystemConfig("tunnel_enabled", strconv.FormatBool(config.Enabled), "boolean", "network"); err != nil {
		return err
	}
	if err := s.SetSystemConfig("tunnel_url", config.URL, "string", "network"); err != nil {
		return err
	}
	if err := s.SetSystemConfig("tunnel_websocket_secure", strconv.FormatBool(config.WebSocketSecure), "boolean", "network"); err != nil {
		return err
	}
	return nil
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

	return config, nil
}

// InitializeDefaultConfig initializes default configuration
func (s *ConfigService) InitializeDefaultConfig() error {
	// System configs
	configs := map[string][]string{
		"websocket_port":   {"8080", "number", "network"},
		"default_tax_rate": {"19", "number", "tax"},
		"currency":         {"COP", "string", "general"},
		"currency_symbol":  {"$", "string", "general"},
		"decimal_places":   {"0", "number", "general"},
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
	if s.EnsureDB() != nil {
		return false, []string{"database not initialized"}
	}
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

// GetNetworkConfig retrieves network configuration
func (s *ConfigService) GetNetworkConfig() (*models.NetworkConfig, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
	var config models.NetworkConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Create default config
		config = models.NetworkConfig{
			WebSocketPort:       8080,
			WebSocketEnabled:    true,
			ConfigAPIPort:       8082,
			ConfigAPIEnabled:    true,
			MCPPort:             8090,
			MCPEnabled:          false,
			RappiWebhookPort:    8081,
			RappiWebhookEnabled: false,
		}
		if err := s.db.Create(&config).Error; err != nil {
			return nil, err
		}
		return &config, nil
	}
	return &config, err
}

// SaveNetworkConfig saves network configuration
func (s *ConfigService) SaveNetworkConfig(config *models.NetworkConfig) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// GetTunnelConfigDB retrieves tunnel configuration from database model
func (s *ConfigService) GetTunnelConfigDB() (*models.TunnelConfig, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}
	var config models.TunnelConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Create default config
		config = models.TunnelConfig{
			Provider:    "",
			Enabled:     false,
			IsConnected: false,
		}
		if err := s.db.Create(&config).Error; err != nil {
			return nil, err
		}
		return &config, nil
	}
	return &config, err
}

// SaveTunnelConfigDB saves tunnel configuration to database model
func (s *ConfigService) SaveTunnelConfigDB(config *models.TunnelConfig) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// tunnelService is a singleton instance for tunnel management
var tunnelService *TunnelService

// getTunnelService returns the tunnel service singleton
func getTunnelService() *TunnelService {
	if tunnelService == nil {
		tunnelService = NewTunnelService()
		tunnelService.SetContext(nil)
	}
	return tunnelService
}

// GetTunnelStatus returns the current tunnel status
func (s *ConfigService) GetTunnelStatus() (*TunnelStatus, error) {
	return getTunnelService().GetStatus()
}

// StartQuickTunnel starts a quick tunnel (no token required)
func (s *ConfigService) StartQuickTunnel(port int) error {
	return getTunnelService().StartTunnel(port)
}

// StartTunnelWithToken starts tunnel with a Cloudflare token
func (s *ConfigService) StartTunnelWithToken(token string) error {
	return getTunnelService().StartTunnelWithToken(token)
}

// StopTunnel stops the running tunnel
func (s *ConfigService) StopTunnel() error {
	return getTunnelService().StopTunnel()
}

// DownloadCloudflared downloads the cloudflared binary
func (s *ConfigService) DownloadCloudflared() error {
	return getTunnelService().DownloadCloudflared()
}

// IsTunnelInstalled checks if cloudflared is installed
func (s *ConfigService) IsTunnelInstalled() bool {
	return getTunnelService().IsInstalled()
}

// GetTunnelDownloadURL returns the download URL for cloudflared
func (s *ConfigService) GetTunnelDownloadURL() string {
	return getTunnelService().GetDownloadURL()
}

// ClearTunnelOutput clears the tunnel output buffer
func (s *ConfigService) ClearTunnelOutput() {
	getTunnelService().ClearOutput()
}

// InstallCloudflaredViaPackageManager installs cloudflared using system package manager
func (s *ConfigService) InstallCloudflaredViaPackageManager() error {
	return getTunnelService().InstallViaPackageManager()
}

// LoginToCloudflare opens browser for Cloudflare authentication
func (s *ConfigService) LoginToCloudflare() error {
	return getTunnelService().LoginToCloudflare()
}

// GetPackageManagerCommand returns the command to install cloudflared
func (s *ConfigService) GetPackageManagerCommand() string {
	return getTunnelService().GetPackageManagerCommand()
}

// CanUsePackageManager checks if a package manager is available
func (s *ConfigService) CanUsePackageManager() bool {
	return getTunnelService().CanUsePackageManager()
}
