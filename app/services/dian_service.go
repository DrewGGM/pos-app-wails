package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"gorm.io/gorm"
)

// DIANService handles DIAN electronic invoicing
type DIANService struct {
	db     *gorm.DB
	config *models.DIANConfig
	client *http.Client
}

// NewDIANService creates a new DIAN service instance
func NewDIANService() *DIANService {
	service := &DIANService{
		db:     database.GetDB(),
		client: &http.Client{Timeout: 120 * time.Second}, // 2 minutes for DIAN API calls that may take time
	}
	// Only load config if database is initialized
	if service.db != nil {
		service.loadConfig()
	}
	return service
}

// loadConfig loads DIAN configuration from database
func (s *DIANService) loadConfig() error {
	return s.db.First(&s.config).Error
}

// DIANCompanyConfig represents company configuration for DIAN
type DIANCompanyConfig struct {
	TypeDocumentIdentificationID int    `json:"type_document_identification_id"`
	TypeOrganizationID           int    `json:"type_organization_id"`
	TypeRegimeID                 int    `json:"type_regime_id"`
	TypeLiabilityID              int    `json:"type_liability_id"`
	BusinessName                 string `json:"business_name"`
	MerchantRegistration         string `json:"merchant_registration"`
	MunicipalityID               int    `json:"municipality_id"`
	Address                      string `json:"address"`
	Phone                        string `json:"phone"`
	Email                        string `json:"email"`
	MailHost                     string `json:"mail_host"`
	MailPort                     string `json:"mail_port"`
	MailUsername                 string `json:"mail_username"`
	MailPassword                 string `json:"mail_password"`
	MailEncryption               string `json:"mail_encryption"`
}

// ConfigureCompany configures the company in DIAN API
// Automatically loads data from DIANConfig and RestaurantConfig tables
func (s *DIANService) ConfigureCompany() (map[string]interface{}, error) {
	// Load DIAN config
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found. Please configure DIAN settings first")
	}

	// Load restaurant config for address, phone, email
	var restaurantConfig models.RestaurantConfig
	if err := s.db.First(&restaurantConfig).Error; err != nil {
		return nil, fmt.Errorf("restaurant configuration not found. Please configure restaurant settings first")
	}

	// Validate required fields
	if dianConfig.IdentificationNumber == "" || dianConfig.DV == "" {
		return nil, fmt.Errorf("NIT and DV are required in DIAN configuration")
	}

	if dianConfig.APIURL == "" {
		return nil, fmt.Errorf("API URL is required in DIAN configuration")
	}

	// Set default merchant registration if empty
	merchantRegistration := dianConfig.MerchantRegistration
	if merchantRegistration == "" {
		merchantRegistration = "0000000-00"
	}

	// Prepare configuration request
	config := DIANCompanyConfig{
		TypeDocumentIdentificationID: dianConfig.TypeDocumentID,
		TypeOrganizationID:           dianConfig.TypeOrganizationID,
		TypeRegimeID:                 dianConfig.TypeRegimeID,
		TypeLiabilityID:              dianConfig.TypeLiabilityID,
		BusinessName:                 dianConfig.BusinessName,
		MerchantRegistration:         merchantRegistration,
		MunicipalityID:               dianConfig.MunicipalityID,
		Address:                      restaurantConfig.Address,
		Phone:                        restaurantConfig.Phone,
		Email:                        restaurantConfig.Email,
		MailHost:                     dianConfig.EmailHost,
		MailPort:                     fmt.Sprintf("%d", dianConfig.EmailPort),
		MailUsername:                 dianConfig.EmailUsername,
		MailPassword:                 dianConfig.EmailPassword,
		MailEncryption:               dianConfig.EmailEncryption,
	}

	// Build URL: {api_url}/api/ubl2.1/config/{nit}/{dv}
	url := fmt.Sprintf("%s/api/ubl2.1/config/%s/%s",
		dianConfig.APIURL,
		dianConfig.IdentificationNumber,
		dianConfig.DV,
	)

	jsonData, err := json.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal configuration: %w", err)
	}

	// Create HTTP request (no authorization required for initial config)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to DIAN API: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Save API token if received (API returns "token" not "api_token")
	token, tokenOk := result["token"].(string)
	if !tokenOk || token == "" {
		// Try alternative field name
		token, tokenOk = result["api_token"].(string)
	}

	if tokenOk && token != "" {
		dianConfig.APIToken = token
		dianConfig.Step1Completed = true // Mark step 1 as completed
		if err := s.db.Save(&dianConfig).Error; err != nil {
			return nil, fmt.Errorf("failed to save API token: %w", err)
		}
		// Update service config
		s.config = &dianConfig
	} else {
		return nil, fmt.Errorf("API token not received in response. Response: %s", string(body))
	}

	return result, nil
}

// ConfigureSoftware configures the software in DIAN API
func (s *DIANService) ConfigureSoftware() error {
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	if dianConfig.SoftwareID == "" || dianConfig.SoftwarePIN == "" {
		return fmt.Errorf("Software ID and PIN are required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/software", dianConfig.APIURL)

	// Convert PIN to integer if it's numeric
	var pinValue interface{} = dianConfig.SoftwarePIN
	if pin, err := strconv.Atoi(dianConfig.SoftwarePIN); err == nil {
		pinValue = pin
	}

	// Only send software ID and PIN
	data := map[string]interface{}{
		"id":  dianConfig.SoftwareID,
		"pin": pinValue,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Mark step 2 as completed
	dianConfig.Step2Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	return nil
}

// ConfigureCertificate configures the certificate in DIAN API
func (s *DIANService) ConfigureCertificate() error {
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	if dianConfig.Certificate == "" || dianConfig.CertificatePassword == "" {
		return fmt.Errorf("Certificate and password are required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/certificate", dianConfig.APIURL)

	data := map[string]interface{}{
		"certificate": dianConfig.Certificate,
		"password":    dianConfig.CertificatePassword,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Mark step 3 as completed
	dianConfig.Step3Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	return nil
}

// ConfigureResolution configures the resolution in DIAN API
func (s *DIANService) ConfigureResolution() error {
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.ResolutionNumber == "" {
		return fmt.Errorf("Resolution number is required")
	}
	if dianConfig.ResolutionPrefix == "" {
		return fmt.Errorf("Resolution prefix is required")
	}
	if dianConfig.TechnicalKey == "" {
		return fmt.Errorf("Technical key is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	// Handle zero-value dates by using default test environment dates
	dateFrom := dianConfig.ResolutionDateFrom
	if dateFrom.IsZero() {
		dateFrom = time.Date(2019, 1, 19, 0, 0, 0, 0, time.UTC)
	}

	dateTo := dianConfig.ResolutionDateTo
	if dateTo.IsZero() {
		dateTo = time.Date(2030, 1, 19, 0, 0, 0, 0, time.UTC)
	}

	data := map[string]interface{}{
		"type_document_id":  1, // Invoice
		"prefix":            dianConfig.ResolutionPrefix,
		"resolution":        dianConfig.ResolutionNumber,
		"resolution_date":   dateFrom.Format("2006-01-02"),
		"technical_key":     dianConfig.TechnicalKey,
		"from":              dianConfig.ResolutionFrom,
		"to":                dianConfig.ResolutionTo,
		"generated_to_date": 0, // Always 0 for initial configuration
		"date_from":         dateFrom.Format("2006-01-02"),
		"date_to":           dateTo.Format("2006-01-02"),
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Mark step 4 as completed
	dianConfig.Step4Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	return nil
}

// ConfigureCreditNoteResolution configures the Credit Note (NC) resolution in DIAN API
func (s *DIANService) ConfigureCreditNoteResolution() error {
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.CreditNoteResolutionPrefix == "" {
		return fmt.Errorf("Credit Note resolution prefix is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	data := map[string]interface{}{
		"type_document_id": 4, // Credit Note
		"prefix":           dianConfig.CreditNoteResolutionPrefix,
		"from":             dianConfig.CreditNoteResolutionFrom,
		"to":               dianConfig.CreditNoteResolutionTo,
	}

	// Optionally add resolution number and dates if provided
	if dianConfig.CreditNoteResolutionNumber != "" {
		data["resolution"] = dianConfig.CreditNoteResolutionNumber
	}
	if !dianConfig.CreditNoteResolutionDateFrom.IsZero() {
		data["date_from"] = dianConfig.CreditNoteResolutionDateFrom.Format("2006-01-02")
	}
	if !dianConfig.CreditNoteResolutionDateTo.IsZero() {
		data["date_to"] = dianConfig.CreditNoteResolutionDateTo.Format("2006-01-02")
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Mark step 5 as completed
	dianConfig.Step5Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	return nil
}

// ConfigureDebitNoteResolution configures the Debit Note (ND) resolution in DIAN API
func (s *DIANService) ConfigureDebitNoteResolution() error {
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.DebitNoteResolutionPrefix == "" {
		return fmt.Errorf("Debit Note resolution prefix is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	data := map[string]interface{}{
		"type_document_id": 5, // Debit Note
		"prefix":           dianConfig.DebitNoteResolutionPrefix,
		"from":             dianConfig.DebitNoteResolutionFrom,
		"to":               dianConfig.DebitNoteResolutionTo,
	}

	// Optionally add resolution number and dates if provided
	if dianConfig.DebitNoteResolutionNumber != "" {
		data["resolution"] = dianConfig.DebitNoteResolutionNumber
	}
	if !dianConfig.DebitNoteResolutionDateFrom.IsZero() {
		data["date_from"] = dianConfig.DebitNoteResolutionDateFrom.Format("2006-01-02")
	}
	if !dianConfig.DebitNoteResolutionDateTo.IsZero() {
		data["date_to"] = dianConfig.DebitNoteResolutionDateTo.Format("2006-01-02")
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Mark step 6 as completed
	dianConfig.Step6Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	return nil
}

// ChangeEnvironment changes between test and production environment
func (s *DIANService) ChangeEnvironment(environment string) error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/environment", s.config.APIURL)

	// Environment IDs: 1=Production, 2=Test
	envID := 2 // Test by default
	if environment == "production" {
		envID = 1
	}

	data := map[string]interface{}{
		"type_environment_id":         envID,
		"payroll_type_environment_id": envID,
		"eqdocs_type_environment_id":  envID,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DIAN API error: %s", string(body))
	}

	// Update local config
	s.config.Environment = environment

	// Mark step 7 as completed when migrating to production
	if environment == "production" {
		s.config.Step7Completed = true
	}

	s.db.Save(s.config)

	return nil
}

// GetNumberingRanges gets numbering ranges from DIAN
func (s *DIANService) GetNumberingRanges() (map[string]interface{}, error) {
	if s.config == nil || s.config.APIToken == "" {
		return nil, fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/numbering-range", s.config.APIURL)

	data := map[string]interface{}{
		"IDSoftware": s.config.SoftwareID,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DIAN API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return result, nil
}

// MigrateToProduction performs the complete migration to production environment
func (s *DIANService) MigrateToProduction() error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	// Step 1: Change environment to production
	if err := s.ChangeEnvironment("production"); err != nil {
		return fmt.Errorf("failed to change environment to production: %w", err)
	}

	// Step 2: Get numbering ranges from DIAN
	numberingRanges, err := s.GetNumberingRanges()
	if err != nil {
		return fmt.Errorf("failed to get numbering ranges: %w", err)
	}

	// Step 3: Parse and update configuration with production data
	// Reload config to get latest values
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	// Extract data from numbering ranges response
	// The API response structure may vary - extracting common fields
	if data, ok := numberingRanges["data"].(map[string]interface{}); ok {
		// Try to find resolution data in various possible locations
		if resolutions, ok := data["resolutions"].([]interface{}); ok && len(resolutions) > 0 {
			// Get first resolution (invoice resolution)
			if resolution, ok := resolutions[0].(map[string]interface{}); ok {
				s.updateConfigFromResolution(&dianConfig, resolution)
			}
		} else {
			// Data might be directly in the response
			s.updateConfigFromResolution(&dianConfig, data)
		}
	} else {
		// Data might be directly in the response
		s.updateConfigFromResolution(&dianConfig, numberingRanges)
	}

	// Save updated configuration
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save production configuration: %w", err)
	}

	// Update service config cache
	s.config = &dianConfig

	// Step 4: Register the production resolution with DIAN API
	if err := s.ConfigureResolution(); err != nil {
		return fmt.Errorf("failed to configure production resolution: %w", err)
	}

	return nil
}

// updateConfigFromResolution updates DIAN config from resolution data
func (s *DIANService) updateConfigFromResolution(config *models.DIANConfig, data map[string]interface{}) {
	// Extract prefix
	if prefix, ok := data["prefix"].(string); ok && prefix != "" {
		config.ResolutionPrefix = prefix
	}

	// Extract resolution number
	if resolution, ok := data["resolution"].(string); ok && resolution != "" {
		config.ResolutionNumber = resolution
	}

	// Extract technical key
	if technicalKey, ok := data["technical_key"].(string); ok && technicalKey != "" {
		config.TechnicalKey = technicalKey
	}

	// Extract from number
	if from, ok := data["from"].(float64); ok {
		config.ResolutionFrom = int(from)
	}

	// Extract to number
	if to, ok := data["to"].(float64); ok {
		config.ResolutionTo = int(to)
	}

	// Extract dates
	if dateFrom, ok := data["date_from"].(string); ok && dateFrom != "" {
		if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
			config.ResolutionDateFrom = t
		}
	}

	if dateTo, ok := data["date_to"].(string); ok && dateTo != "" {
		if t, err := time.Parse("2006-01-02", dateTo); err == nil {
			config.ResolutionDateTo = t
		}
	}

	// resolution_date from API response is typically the same as date_from
	// If it exists and date_from doesn't, use it as date_from
	if resolutionDate, ok := data["resolution_date"].(string); ok && resolutionDate != "" {
		if config.ResolutionDateFrom.IsZero() {
			if t, err := time.Parse("2006-01-02", resolutionDate); err == nil {
				config.ResolutionDateFrom = t
			}
		}
	}
}

// GetDIANConfig returns current DIAN configuration
func (s *DIANService) GetDIANConfig() (*models.DIANConfig, error) {
	if s.config == nil {
		s.loadConfig()
	}
	if s.config == nil {
		// Create default config if not exists
		s.config = &models.DIANConfig{
			Environment:  "test",
			IsEnabled:    false,
			UseTestSetID: true, // Default to true for test mode
		}
		s.db.Create(s.config)
	}
	return s.config, nil
}

// UpdateDIANConfig updates DIAN configuration
func (s *DIANService) UpdateDIANConfig(config *models.DIANConfig) error {
	// Debug: Log the values being saved
	fmt.Printf("💾 Saving DIAN Config - ID: %d, UseTestSetID: %v, TestSetID: %s, Environment: %s\n",
		config.ID, config.UseTestSetID, config.TestSetID, config.Environment)

	if err := s.db.Save(config).Error; err != nil {
		return err
	}
	s.config = config
	fmt.Printf("✅ DIAN Config saved successfully - UseTestSetID: %v\n", config.UseTestSetID)
	return nil
}

// ResetConfigurationSteps resets all DIAN configuration steps to false
// This does NOT delete any data, only resets the step completion flags
func (s *DIANService) ResetConfigurationSteps() error {
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found: %w", err)
	}

	// Reset all step completion flags
	config.Step1Completed = false
	config.Step2Completed = false
	config.Step3Completed = false
	config.Step4Completed = false
	config.Step5Completed = false
	config.Step6Completed = false
	config.Step7Completed = false

	if err := s.db.Save(&config).Error; err != nil {
		return fmt.Errorf("failed to reset configuration steps: %w", err)
	}

	// Update service config cache
	s.config = &config

	fmt.Printf("🔄 DIAN Configuration steps have been reset\n")
	return nil
}

// TestConnection tests the connection to DIAN API
func (s *DIANService) TestConnection() error {
	if s.config == nil || s.config.APIURL == "" {
		return fmt.Errorf("DIAN API URL not configured")
	}

	req, err := http.NewRequest("GET", s.config.APIURL, nil)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

// ==================== DIAN INVOICE STRUCTURES ====================

// DIANInvoiceCustomer represents the customer in a DIAN invoice
type DIANInvoiceCustomer struct {
	IdentificationNumber       int    `json:"identification_number"`
	DV                         string `json:"dv"`
	Name                       string `json:"name"`
	Phone                      string `json:"phone"`
	Address                    string `json:"address"`
	Email                      string `json:"email"`
	MerchantRegistration       string `json:"merchant_registration"`
	TypeDocumentIdentificationID int  `json:"type_document_identification_id"`
	TypeOrganizationID         int    `json:"type_organization_id"`
	TypeLiabilityID            int    `json:"type_liability_id"`
	MunicipalityID             int    `json:"municipality_id"`
	TypeRegimeID               int    `json:"type_regime_id"`
	TaxID                      *int   `json:"tax_id,omitempty"`
}

// DIANInvoicePaymentForm represents the payment form in a DIAN invoice
type DIANInvoicePaymentForm struct {
	PaymentFormID    int    `json:"payment_form_id"`
	PaymentMethodID  int    `json:"payment_method_id"`
	PaymentDueDate   string `json:"payment_due_date"`
	DurationMeasure  string `json:"duration_measure"`
}

// DIANInvoiceLegalMonetaryTotals represents the legal monetary totals
type DIANInvoiceLegalMonetaryTotals struct {
	LineExtensionAmount  string `json:"line_extension_amount"`
	TaxExclusiveAmount   string `json:"tax_exclusive_amount"`
	TaxInclusiveAmount   string `json:"tax_inclusive_amount"`
	AllowanceTotalAmount string `json:"allowance_total_amount,omitempty"`
	PayableAmount        string `json:"payable_amount"`
}

// DIANInvoiceTaxTotal represents a tax total
type DIANInvoiceTaxTotal struct {
	TaxID         int    `json:"tax_id"`
	TaxAmount     string `json:"tax_amount"`
	Percent       string `json:"percent"`
	TaxableAmount string `json:"taxable_amount"`
}

// DIANInvoiceLine represents an invoice line
type DIANInvoiceLine struct {
	UnitMeasureID          int                   `json:"unit_measure_id"`
	InvoicedQuantity       string                `json:"invoiced_quantity"`
	LineExtensionAmount    string                `json:"line_extension_amount"`
	FreeOfChargeIndicator  bool                  `json:"free_of_charge_indicator"`
	TaxTotals              []DIANInvoiceTaxTotal `json:"tax_totals"`
	Description            string                `json:"description"`
	Notes                  string                `json:"notes,omitempty"`
	Code                   string                `json:"code"`
	TypeItemIdentificationID int                 `json:"type_item_identification_id"`
	PriceAmount            string                `json:"price_amount"`
	BaseQuantity           string                `json:"base_quantity"`
}

// DIANInvoiceAllowanceCharge represents a discount or charge
type DIANInvoiceAllowanceCharge struct {
	DiscountID            int    `json:"discount_id,omitempty"`
	ChargeIndicator       bool   `json:"charge_indicator"`
	AllowanceChargeReason string `json:"allowance_charge_reason"`
	Amount                string `json:"amount"`
	BaseAmount            string `json:"base_amount"`
}

// DIANInvoice represents a complete DIAN electronic invoice
type DIANInvoice struct {
	Number                    int                              `json:"number"`
	TypeDocumentID            int                              `json:"type_document_id"`
	Date                      string                           `json:"date"`
	Time                      string                           `json:"time"`
	ResolutionNumber          string                           `json:"resolution_number"`
	Prefix                    string                           `json:"prefix"`
	Notes                     string                           `json:"notes,omitempty"`
	DisableConfirmationText   bool                             `json:"disable_confirmation_text,omitempty"`
	EstablishmentName         string                           `json:"establishment_name"`
	EstablishmentAddress      string                           `json:"establishment_address"`
	EstablishmentPhone        string                           `json:"establishment_phone"`
	EstablishmentMunicipality int                              `json:"establishment_municipality"`
	EstablishmentEmail        string                           `json:"establishment_email,omitempty"`
	SendMail                  bool                             `json:"sendmail,omitempty"`
	SendMailToMe              bool                             `json:"sendmailtome,omitempty"`
	HeadNote                  string                           `json:"head_note,omitempty"`
	FootNote                  string                           `json:"foot_note,omitempty"`
	Customer                  DIANInvoiceCustomer              `json:"customer"`
	PaymentForm               interface{}                      `json:"payment_form"` // Can be single object or array
	LegalMonetaryTotals       DIANInvoiceLegalMonetaryTotals   `json:"legal_monetary_totals"`
	TaxTotals                 []DIANInvoiceTaxTotal            `json:"tax_totals"`
	InvoiceLines              []DIANInvoiceLine                `json:"invoice_lines"`
	AllowanceCharges          []DIANInvoiceAllowanceCharge     `json:"allowance_charges,omitempty"`
}

// DIANInvoiceResponse represents the response from DIAN API when sending an invoice
type DIANInvoiceResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	ResponseDian     interface{} `json:"ResponseDian,omitempty"`
	ZipKey           string `json:"zip_key,omitempty"`
	UUID             string `json:"uuid,omitempty"`
	CUFE             string `json:"cufe,omitempty"`
	IssueDate        string `json:"issue_date,omitempty"`
	Number           string `json:"number,omitempty"`
	ErrorMessages    []string `json:"errors,omitempty"`
}

// SendInvoice sends an electronic invoice to DIAN
func (s *DIANService) SendInvoice(invoice *DIANInvoice) (*DIANInvoiceResponse, error) {
	// Load config
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}

	// Validate configuration
	if dianConfig.APIToken == "" {
		return nil, fmt.Errorf("API token not found. Please complete DIAN configuration steps first")
	}

	if !dianConfig.IsEnabled {
		return nil, fmt.Errorf("DIAN electronic invoicing is not enabled")
	}

	// Build URL based on environment and UseTestSetID flag
	var url string
	if dianConfig.Environment == "test" && dianConfig.UseTestSetID {
		// In test mode with UseTestSetID enabled, include test_set_id
		if dianConfig.TestSetID == "" {
			return nil, fmt.Errorf("test set ID not configured for test environment")
		}
		url = fmt.Sprintf("%s/api/ubl2.1/invoice/%s", dianConfig.APIURL, dianConfig.TestSetID)
	} else {
		// In production mode or test without test_set_id, no test_set_id in URL
		url = fmt.Sprintf("%s/api/ubl2.1/invoice", dianConfig.APIURL)
	}

	// Marshal invoice to JSON
	jsonData, err := json.Marshal(invoice)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal invoice: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send invoice: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var invoiceResp DIANInvoiceResponse
	if err := json.Unmarshal(body, &invoiceResp); err != nil {
		return nil, fmt.Errorf("failed to parse response (status %d): %s", resp.StatusCode, string(body))
	}

	// Check for errors
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		if len(invoiceResp.ErrorMessages) > 0 {
			return &invoiceResp, fmt.Errorf("DIAN API error (status %d): %v", resp.StatusCode, invoiceResp.ErrorMessages)
		}
		return &invoiceResp, fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, invoiceResp.Message)
	}

	// Update consecutive number if invoice was sent successfully
	if invoiceResp.Success {
		dianConfig.LastInvoiceNumber = invoice.Number
		if err := s.db.Save(&dianConfig).Error; err != nil {
			// Log error but don't fail the invoice send
			fmt.Printf("Warning: failed to update consecutive number: %v\n", err)
		}
	}

	return &invoiceResp, nil
}
