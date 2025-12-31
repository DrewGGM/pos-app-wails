package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"PosApp/app/models"

	"gorm.io/gorm"
)

type BoldService struct {
	db *gorm.DB
}

func NewBoldService(db *gorm.DB) *BoldService {
	return &BoldService{db: db}
}

// GetBoldConfig retrieves the Bold configuration (creates default if not exists)
func (s *BoldService) GetBoldConfig() (*models.BoldConfig, error) {
	var config models.BoldConfig

	err := s.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Create default config
		config = models.BoldConfig{
			Enabled:      false,
			Environment:  "test",
			BaseURL:      "https://integrations.api.bold.co",
			EnablePOS:    true,
			EnableNequi:  false,
			EnableDaviplata: false,
			EnablePayByLink: false,
		}

		if err := s.db.Create(&config).Error; err != nil {
			return nil, fmt.Errorf("error creating default bold config: %w", err)
		}

		return &config, nil
	}

	if err != nil {
		return nil, fmt.Errorf("error fetching bold config: %w", err)
	}

	return &config, nil
}

// UpdateBoldConfig updates the Bold configuration
func (s *BoldService) UpdateBoldConfig(config *models.BoldConfig) error {
	if config.ID == 0 {
		return fmt.Errorf("config ID is required")
	}

	if err := s.db.Save(config).Error; err != nil {
		return fmt.Errorf("error updating bold config: %w", err)
	}

	return nil
}

// GetAPIKey returns the appropriate API key based on environment
func (s *BoldService) GetAPIKey() (string, error) {
	config, err := s.GetBoldConfig()
	if err != nil {
		return "", err
	}

	if config.Environment == "production" {
		return config.APIKeyProduction, nil
	}

	return config.APIKeyTest, nil
}

// GetPaymentMethods fetches available payment methods from Bold API
func (s *BoldService) GetPaymentMethods() ([]models.BoldPaymentMethod, error) {
	config, err := s.GetBoldConfig()
	if err != nil {
		return nil, err
	}

	if !config.Enabled {
		return nil, fmt.Errorf("bold integration is not enabled")
	}

	apiKey, err := s.GetAPIKey()
	if err != nil {
		return nil, err
	}

	if apiKey == "" {
		return nil, fmt.Errorf("API key not configured")
	}

	// Create HTTP request
	url := config.BaseURL + "/payments/payment-methods"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	// Add authorization header
	req.Header.Set("Authorization", "x-api-key "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error executing request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result struct {
		Payload struct {
			PaymentMethods []models.BoldPaymentMethod `json:"payment_methods"`
		} `json:"payload"`
		Errors []interface{} `json:"errors"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("error parsing response: %w", err)
	}

	return result.Payload.PaymentMethods, nil
}

// GetTerminals fetches available terminals from Bold API
func (s *BoldService) GetTerminals() ([]models.BoldTerminalResponse, error) {
	config, err := s.GetBoldConfig()
	if err != nil {
		return nil, err
	}

	if !config.Enabled {
		return nil, fmt.Errorf("bold integration is not enabled")
	}

	apiKey, err := s.GetAPIKey()
	if err != nil {
		return nil, err
	}

	if apiKey == "" {
		return nil, fmt.Errorf("API key not configured")
	}

	// Create HTTP request
	url := config.BaseURL + "/payments/binded-terminals"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	// Add authorization header
	req.Header.Set("Authorization", "x-api-key "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error executing request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result struct {
		Payload struct {
			AvailableTerminals []models.BoldTerminalResponse `json:"available_terminals"`
		} `json:"payload"`
		Errors []interface{} `json:"errors"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("error parsing response: %w", err)
	}

	return result.Payload.AvailableTerminals, nil
}

// CreatePaymentWithContext creates a payment through Bold API and tracks it as pending
// This version accepts payment context for tracking
func (s *BoldService) CreatePaymentWithContext(paymentReq *models.BoldPaymentRequest, paymentMethodID uint, paymentMethodName string, orderID, customerID, employeeID, cashRegisterID uint) (*models.BoldPaymentResponse, error) {
	// First create the payment via Bold API
	response, err := s.CreatePayment(paymentReq)
	if err != nil {
		return nil, err
	}

	// Create pending payment record for webhook tracking
	pendingPayment := &models.BoldPendingPayment{
		IntegrationID:     response.Payload.IntegrationID,
		Reference:         paymentReq.Reference,
		Amount:            paymentReq.Amount.TotalAmount,
		Status:            "pending",
		PaymentMethodID:   paymentMethodID,
		PaymentMethodName: paymentMethodName,
		OrderID:           orderID,
		CustomerID:        customerID,
		EmployeeID:        employeeID,
		CashRegisterID:    cashRegisterID,
	}

	if err := s.CreatePendingPayment(pendingPayment); err != nil {
		// Log error but don't fail the payment creation
		fmt.Printf("Warning: Failed to create pending payment record: %v\n", err)
	}

	return response, nil
}

// CreatePayment creates a payment through Bold API and tracks it as pending
func (s *BoldService) CreatePayment(paymentReq *models.BoldPaymentRequest) (*models.BoldPaymentResponse, error) {
	config, err := s.GetBoldConfig()
	if err != nil {
		return nil, err
	}

	if !config.Enabled {
		return nil, fmt.Errorf("bold integration is not enabled")
	}

	apiKey, err := s.GetAPIKey()
	if err != nil {
		return nil, err
	}

	if apiKey == "" {
		return nil, fmt.Errorf("API key not configured")
	}

	// Marshal request body
	requestBody, err := json.Marshal(paymentReq)
	if err != nil {
		return nil, fmt.Errorf("error marshaling request: %w", err)
	}

	// Create HTTP request
	url := config.BaseURL + "/payments/app-checkout"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	// Add headers
	req.Header.Set("Authorization", "x-api-key "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error executing request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %w", err)
	}

	// Parse response
	var result models.BoldPaymentResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("error parsing response: %w", err)
	}

	// Check for errors in response
	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Update statistics
	config.TotalPayments++
	now := time.Now()
	config.LastSyncAt = &now
	config.LastSyncStatus = "success"
	s.db.Save(config)

	return &result, nil
}

// CreatePendingPayment creates a pending payment record for webhook tracking
func (s *BoldService) CreatePendingPayment(pendingPayment *models.BoldPendingPayment) error {
	return s.db.Create(pendingPayment).Error
}

// GetPendingPayment retrieves a pending payment by integration ID
func (s *BoldService) GetPendingPayment(integrationID string) (*models.BoldPendingPayment, error) {
	var payment models.BoldPendingPayment
	err := s.db.Where("integration_id = ?", integrationID).First(&payment).Error
	if err != nil {
		return nil, err
	}
	return &payment, nil
}

// GetPendingPaymentStatus retrieves the status of a pending payment
// Returns: status string and the full payment object
func (s *BoldService) GetPendingPaymentStatus(integrationID string) (string, *models.BoldPendingPayment, error) {
	payment, err := s.GetPendingPayment(integrationID)
	if err != nil {
		return "", nil, err
	}
	return payment.Status, payment, nil
}

// CancelPendingPayment cancels a pending payment (e.g., due to timeout)
func (s *BoldService) CancelPendingPayment(integrationID string) error {
	return s.db.Model(&models.BoldPendingPayment{}).
		Where("integration_id = ? AND status = ?", integrationID, "pending").
		Update("status", "cancelled").Error
}

// GetRecentWebhooks returns the most recent webhook notifications received
func (s *BoldService) GetRecentWebhooks(limit int) ([]models.BoldPendingPayment, error) {
	if limit <= 0 {
		limit = 50
	}

	var webhooks []models.BoldPendingPayment
	err := s.db.Order("created_at DESC").Limit(limit).Find(&webhooks).Error
	return webhooks, err
}

// GetWebhookLogs returns the raw webhook logs for debugging
func (s *BoldService) GetWebhookLogs(limit int) ([]models.BoldWebhookLog, error) {
	if limit <= 0 {
		limit = 50
	}

	var logs []models.BoldWebhookLog
	err := s.db.Order("created_at DESC").Limit(limit).Find(&logs).Error
	return logs, err
}

// GetAllTerminals retrieves all terminals from database
func (s *BoldService) GetAllTerminals() ([]models.BoldTerminal, error) {
	var terminals []models.BoldTerminal

	if err := s.db.Find(&terminals).Error; err != nil {
		return nil, fmt.Errorf("error fetching terminals: %w", err)
	}

	return terminals, nil
}

// CreateTerminal creates a new terminal in database
func (s *BoldService) CreateTerminal(terminal *models.BoldTerminal) error {
	if err := s.db.Create(terminal).Error; err != nil {
		return fmt.Errorf("error creating terminal: %w", err)
	}

	return nil
}

// UpdateTerminal updates a terminal in database
func (s *BoldService) UpdateTerminal(terminal *models.BoldTerminal) error {
	if terminal.ID == 0 {
		return fmt.Errorf("terminal ID is required")
	}

	if err := s.db.Save(terminal).Error; err != nil {
		return fmt.Errorf("error updating terminal: %w", err)
	}

	return nil
}

// DeleteTerminal deletes a terminal from database
func (s *BoldService) DeleteTerminal(id uint) error {
	if err := s.db.Delete(&models.BoldTerminal{}, id).Error; err != nil {
		return fmt.Errorf("error deleting terminal: %w", err)
	}

	return nil
}

// SyncTerminals synchronizes terminals from Bold API to database
func (s *BoldService) SyncTerminals() error {
	// Fetch terminals from API
	apiTerminals, err := s.GetTerminals()
	if err != nil {
		return err
	}

	// Get existing terminals from database
	var dbTerminals []models.BoldTerminal
	s.db.Find(&dbTerminals)

	// Create map of existing terminals
	existingMap := make(map[string]*models.BoldTerminal)
	for i := range dbTerminals {
		existingMap[dbTerminals[i].TerminalSerial] = &dbTerminals[i]
	}

	// Update or create terminals
	for _, apiTerminal := range apiTerminals {
		if existing, found := existingMap[apiTerminal.TerminalSerial]; found {
			// Update existing terminal
			existing.TerminalModel = apiTerminal.TerminalModel
			existing.Name = apiTerminal.Name
			existing.Status = apiTerminal.Status
			s.db.Save(existing)
		} else {
			// Create new terminal
			newTerminal := models.BoldTerminal{
				TerminalModel:  apiTerminal.TerminalModel,
				TerminalSerial: apiTerminal.TerminalSerial,
				Name:           apiTerminal.Name,
				Status:         apiTerminal.Status,
				IsActive:       true,
				IsDefault:      false,
			}
			s.db.Create(&newTerminal)
		}
	}

	return nil
}

// TestConnection tests the connection to Bold API
func (s *BoldService) TestConnection() error {
	_, err := s.GetPaymentMethods()
	return err
}
