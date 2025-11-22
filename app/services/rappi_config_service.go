package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
)

// RappiConfigService handles Rappi integration configuration
type RappiConfigService struct {
	db *gorm.DB
}

// NewRappiConfigService creates a new Rappi config service
func NewRappiConfigService() *RappiConfigService {
	return &RappiConfigService{
		db: database.GetDB(),
	}
}

// GetConfig gets Rappi configuration
func (s *RappiConfigService) GetConfig() (*models.RappiConfig, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var config models.RappiConfig
	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config
		config = models.RappiConfig{
			Environment:          "development",
			IsEnabled:            false,
			UseWebhooks:          true,
			WebhookPort:          8081,
			AutoSyncMenu:         false,
			SyncMenuOnStartup:    false,
			DefaultCookingTime:   15,
			AutoAcceptOrders:     false,
			BaseURL:              "https://microservices.dev.rappi.com",
			AuthURL:              "https://api.dev.rappi.com",
			LastConnectionStatus: "never_tested",
			LastMenuSyncStatus:   "never_synced",
		}
		// Create default config
		if err := s.db.Create(&config).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	// Auto-fill URLs based on environment
	if config.Environment == "production" {
		config.BaseURL = "https://microservices.col.rappi.com"
		config.AuthURL = "https://api.col.rappi.com"
	} else {
		config.BaseURL = "https://microservices.dev.rappi.com"
		config.AuthURL = "https://api.dev.rappi.com"
	}

	return &config, nil
}

// SaveConfig saves Rappi configuration
func (s *RappiConfigService) SaveConfig(config *models.RappiConfig) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Auto-fill URLs based on environment
	if config.Environment == "production" {
		config.BaseURL = "https://microservices.col.rappi.com"
		config.AuthURL = "https://api.col.rappi.com"
	} else {
		config.BaseURL = "https://microservices.dev.rappi.com"
		config.AuthURL = "https://api.dev.rappi.com"
	}

	// Set defaults if not provided
	if config.WebhookPort == 0 {
		config.WebhookPort = 8081
	}
	if config.DefaultCookingTime == 0 {
		config.DefaultCookingTime = 15
	}

	// If no ID, create new
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// TestConnectionResponse represents the response from connection test
type TestConnectionResponse struct {
	Success      bool      `json:"success"`
	Message      string    `json:"message"`
	Token        string    `json:"token,omitempty"`
	ExpiresIn    int       `json:"expires_in,omitempty"`
	ExpiresAt    time.Time `json:"expires_at,omitempty"`
	Environment  string    `json:"environment"`
	Error        string    `json:"error,omitempty"`
}

// RappiTokenResponse represents Rappi OAuth token response
type RappiTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

// TestConnection tests the connection to Rappi API
func (s *RappiConfigService) TestConnection(config *models.RappiConfig) (*TestConnectionResponse, error) {
	if config.ClientID == "" || config.ClientSecret == "" {
		return &TestConnectionResponse{
			Success: false,
			Message: "Client ID y Client Secret son requeridos",
			Error:   "missing_credentials",
		}, fmt.Errorf("missing credentials")
	}

	// Prepare auth request
	authURL := config.AuthURL + "/restaurants/auth/v1/token/login/integrations"

	requestBody := map[string]string{
		"client_id":     config.ClientID,
		"client_secret": config.ClientSecret,
	}

	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return &TestConnectionResponse{
			Success: false,
			Message: "Error preparando la solicitud",
			Error:   err.Error(),
		}, err
	}

	// Make HTTP request
	req, err := http.NewRequest("POST", authURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return &TestConnectionResponse{
			Success: false,
			Message: "Error creando la solicitud HTTP",
			Error:   err.Error(),
		}, err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return &TestConnectionResponse{
			Success: false,
			Message: "Error conectando con Rappi API: " + err.Error(),
			Error:   err.Error(),
			Environment: config.Environment,
		}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &TestConnectionResponse{
			Success: false,
			Message: "Error leyendo la respuesta",
			Error:   err.Error(),
		}, err
	}

	// Check response status
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return &TestConnectionResponse{
			Success: false,
			Message: fmt.Sprintf("Autenticación fallida (HTTP %d): %s", resp.StatusCode, string(body)),
			Error:   fmt.Sprintf("http_error_%d", resp.StatusCode),
			Environment: config.Environment,
		}, fmt.Errorf("authentication failed: %s", string(body))
	}

	// Parse response
	var tokenResp RappiTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return &TestConnectionResponse{
			Success: false,
			Message: "Error parseando la respuesta de Rappi",
			Error:   err.Error(),
		}, err
	}

	// Calculate expiration time
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// Update config with token and connection status
	now := time.Now()
	config.CurrentToken = tokenResp.AccessToken
	config.TokenExpiresAt = &expiresAt
	config.LastConnectionTest = &now
	config.LastConnectionStatus = "success"
	config.LastConnectionError = ""

	// Save updated config
	if err := s.SaveConfig(config); err != nil {
		// Log error but don't fail the test
		fmt.Printf("Warning: Could not save token to config: %v\n", err)
	}

	return &TestConnectionResponse{
		Success:     true,
		Message:     fmt.Sprintf("✓ Conexión exitosa con Rappi API (%s)", config.Environment),
		Token:       tokenResp.AccessToken,
		ExpiresIn:   tokenResp.ExpiresIn,
		ExpiresAt:   expiresAt,
		Environment: config.Environment,
	}, nil
}

// GetToken gets a valid access token (uses cached token if valid, otherwise requests new one)
func (s *RappiConfigService) GetToken(forceRefresh bool) (string, error) {
	config, err := s.GetConfig()
	if err != nil {
		return "", err
	}

	// Check if we have a valid cached token
	if !forceRefresh && config.CurrentToken != "" && config.TokenExpiresAt != nil {
		// Add 1 hour buffer before expiration
		if time.Now().Add(1 * time.Hour).Before(*config.TokenExpiresAt) {
			return config.CurrentToken, nil
		}
	}

	// Request new token
	testResp, err := s.TestConnection(config)
	if err != nil {
		return "", err
	}

	return testResp.Token, nil
}

// GetStoreIDs returns store IDs as a slice
func (s *RappiConfigService) GetStoreIDs() ([]string, error) {
	config, err := s.GetConfig()
	if err != nil {
		return nil, err
	}

	if config.StoreIDs == "" {
		return []string{}, nil
	}

	// Split by comma and trim spaces
	ids := strings.Split(config.StoreIDs, ",")
	for i := range ids {
		ids[i] = strings.TrimSpace(ids[i])
	}

	return ids, nil
}

// ValidateStoreIDs validates that store IDs are configured
func (s *RappiConfigService) ValidateStoreIDs() error {
	ids, err := s.GetStoreIDs()
	if err != nil {
		return err
	}

	if len(ids) == 0 {
		return fmt.Errorf("no store IDs configured")
	}

	return nil
}

// GetConnectionStatus returns current connection status
type ConnectionStatus struct {
	IsConfigured         bool       `json:"is_configured"`
	IsEnabled            bool       `json:"is_enabled"`
	Environment          string     `json:"environment"`
	HasValidToken        bool       `json:"has_valid_token"`
	TokenExpiresAt       *time.Time `json:"token_expires_at,omitempty"`
	LastConnectionTest   *time.Time `json:"last_connection_test,omitempty"`
	LastConnectionStatus string     `json:"last_connection_status"`
	StoreCount           int        `json:"store_count"`
	TotalOrdersReceived  int        `json:"total_orders_received"`
	TotalOrdersAccepted  int        `json:"total_orders_accepted"`
	LastMenuSync         *time.Time `json:"last_menu_sync,omitempty"`
	LastMenuSyncStatus   string     `json:"last_menu_sync_status"`
}

func (s *RappiConfigService) GetConnectionStatus() (*ConnectionStatus, error) {
	config, err := s.GetConfig()
	if err != nil {
		return nil, err
	}

	storeIDs, _ := s.GetStoreIDs()

	hasValidToken := false
	if config.CurrentToken != "" && config.TokenExpiresAt != nil {
		hasValidToken = time.Now().Before(*config.TokenExpiresAt)
	}

	isConfigured := config.ClientID != "" && config.ClientSecret != "" && len(storeIDs) > 0

	return &ConnectionStatus{
		IsConfigured:         isConfigured,
		IsEnabled:            config.IsEnabled,
		Environment:          config.Environment,
		HasValidToken:        hasValidToken,
		TokenExpiresAt:       config.TokenExpiresAt,
		LastConnectionTest:   config.LastConnectionTest,
		LastConnectionStatus: config.LastConnectionStatus,
		StoreCount:           len(storeIDs),
		TotalOrdersReceived:  config.TotalOrdersReceived,
		TotalOrdersAccepted:  config.TotalOrdersAccepted,
		LastMenuSync:         config.LastMenuSync,
		LastMenuSyncStatus:   config.LastMenuSyncStatus,
	}, nil
}

// ResetStatistics resets all statistics
func (s *RappiConfigService) ResetStatistics() error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.Model(&models.RappiConfig{}).Updates(map[string]interface{}{
		"total_orders_received": 0,
		"total_orders_accepted": 0,
		"total_orders_rejected": 0,
	}).Error
}

// MakeAuthenticatedRequest makes an authenticated request to Rappi API
func (s *RappiConfigService) MakeAuthenticatedRequest(endpoint string, method string, body interface{}) ([]byte, error) {
	token, err := s.GetToken(false)
	if err != nil {
		return nil, fmt.Errorf("failed to get token: %w", err)
	}

	config, err := s.GetConfig()
	if err != nil {
		return nil, err
	}

	url := config.BaseURL + endpoint

	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-authorization", "Bearer "+token)

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return responseBody, fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	return responseBody, nil
}
