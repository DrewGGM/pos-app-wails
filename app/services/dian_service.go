package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
		client: &http.Client{Timeout: 30 * time.Second},
	}
	service.loadConfig()
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
func (s *DIANService) ConfigureCompany(config DIANCompanyConfig) error {
	if s.config == nil {
		return fmt.Errorf("DIAN configuration not loaded")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/%s/%s",
		s.config.APIURL,
		s.config.IdentificationNumber,
		s.config.DV,
	)

	jsonData, err := json.Marshal(config)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("DIAN API error: %s", string(body))
	}

	// Parse response and save API token
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	if token, ok := result["api_token"].(string); ok {
		s.config.APIToken = token
		s.db.Save(s.config)
	}

	return nil
}

// ConfigureSoftware configures the software in DIAN API
func (s *DIANService) ConfigureSoftware() error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/software", s.config.APIURL)

	data := map[string]interface{}{
		"id":  s.config.SoftwareID,
		"pin": s.config.SoftwarePIN,
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

	return nil
}

// ConfigureCertificate configures the certificate in DIAN API
func (s *DIANService) ConfigureCertificate() error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/certificate", s.config.APIURL)

	data := map[string]interface{}{
		"certificate": s.config.Certificate,
		"password":    s.config.CertificatePassword,
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

	return nil
}

// ConfigureResolution configures the resolution in DIAN API
func (s *DIANService) ConfigureResolution() error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", s.config.APIURL)

	data := map[string]interface{}{
		"type_document_id":  1, // Invoice
		"prefix":            s.config.ResolutionPrefix,
		"resolution":        s.config.ResolutionNumber,
		"resolution_date":   s.config.ResolutionDateFrom.Format("2006-01-02"),
		"technical_key":     s.config.TechnicalKey,
		"from":              s.config.ResolutionFrom,
		"to":                s.config.ResolutionTo,
		"generated_to_date": s.config.LastInvoiceNumber,
		"date_from":         s.config.ResolutionDateFrom.Format("2006-01-02"),
		"date_to":           s.config.ResolutionDateTo.Format("2006-01-02"),
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

	return nil
}

// ChangeEnvironment changes between test and production environment
func (s *DIANService) ChangeEnvironment(environment string) error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/environment", s.config.APIURL)

	envID := 1 // Test
	if environment == "production" {
		envID = 2
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

// GetDIANConfig returns current DIAN configuration
func (s *DIANService) GetDIANConfig() (*models.DIANConfig, error) {
	if s.config == nil {
		s.loadConfig()
	}
	if s.config == nil {
		// Create default config if not exists
		s.config = &models.DIANConfig{
			Environment: "test",
			IsEnabled:   false,
		}
		s.db.Create(s.config)
	}
	return s.config, nil
}

// UpdateDIANConfig updates DIAN configuration
func (s *DIANService) UpdateDIANConfig(config *models.DIANConfig) error {
	if err := s.db.Save(config).Error; err != nil {
		return err
	}
	s.config = config
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
