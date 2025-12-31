package models

import (
	"time"

	"gorm.io/gorm"
)

// BoldConfig represents Bold API Integrations configuration
type BoldConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// Enable/Disable Integration
	Enabled bool `json:"enabled" gorm:"default:false"`

	// Environment
	Environment string `json:"environment" gorm:"default:'test'"` // "test" or "production"

	// API Keys
	APIKeyProduction string `json:"api_key_production"` // Production API key
	APIKeyTest       string `json:"api_key_test"`       // Test API key

	// API Settings
	BaseURL string `json:"base_url" gorm:"default:'https://integrations.api.bold.co'"` // Base URL for API requests

	// Seller Information
	UserEmail string `json:"user_email"` // Email of the person making the sale

	// Payment Methods (enabled/disabled)
	EnablePOS       bool `json:"enable_pos" gorm:"default:true"`        // Credit/Debit cards
	EnableNequi     bool `json:"enable_nequi" gorm:"default:false"`     // Nequi payments
	EnableDaviplata bool `json:"enable_daviplata" gorm:"default:false"` // Daviplata payments
	EnablePayByLink bool `json:"enable_pay_by_link" gorm:"default:false"` // Pay by link

	// Default Terminal Settings
	DefaultTerminalModel  string `json:"default_terminal_model"`  // e.g., "N86"
	DefaultTerminalSerial string `json:"default_terminal_serial"` // e.g., "N860W000000"

	// Webhook Configuration
	WebhookURL         string `json:"webhook_url"`          // URL to receive webhook notifications
	WebhookURLSandbox  string `json:"webhook_url_sandbox"`  // Sandbox webhook URL
	WebhookSecret      string `json:"webhook_secret"`       // Secret for webhook validation

	// Status & Tracking
	LastSyncAt     *time.Time `json:"last_sync_at,omitempty"`
	LastSyncStatus string     `json:"last_sync_status"` // "success", "error", "pending"
	LastSyncError  string     `json:"last_sync_error"`
	TotalPayments  int        `json:"total_payments" gorm:"default:0"` // Total payments processed

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BoldTerminal represents a Bold payment terminal (datáfono)
type BoldTerminal struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// Terminal Information
	TerminalModel  string `json:"terminal_model" gorm:"not null"`  // e.g., "N86"
	TerminalSerial string `json:"terminal_serial" gorm:"not null"` // e.g., "N860W000000"
	Name           string `json:"name"`                            // Terminal name/identifier
	Status         string `json:"status"`                          // "BINDED", "UNBINDED"

	// Settings
	IsActive  bool `json:"is_active" gorm:"default:true"`  // Terminal is active for processing
	IsDefault bool `json:"is_default" gorm:"default:false"` // Default terminal for payments

	// Metadata
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	UsageCount int        `json:"usage_count" gorm:"default:0"` // Number of times used

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BoldPaymentMethod represents available payment methods
type BoldPaymentMethod struct {
	Name    string `json:"name"`    // "POS", "NEQUI", "DAVIPLATA", "PAY_BY_LINK"
	Enabled bool   `json:"enabled"` // Whether this method is enabled
}

// BoldTerminalResponse represents the API response for terminals
type BoldTerminalResponse struct {
	TerminalModel  string `json:"terminal_model"`
	TerminalSerial string `json:"terminal_serial"`
	Status         string `json:"status"`
	Name           string `json:"name"`
}

// BoldPaymentRequest represents the request to create a payment
type BoldPaymentRequest struct {
	Amount        BoldAmount `json:"amount"`
	PaymentMethod string     `json:"payment_method"`
	TerminalModel string     `json:"terminal_model"`
	TerminalSerial string    `json:"terminal_serial"`
	Reference     string     `json:"reference"`
	UserEmail     string     `json:"user_email"`
	Description   string     `json:"description,omitempty"`
	Payer         *BoldPayer `json:"payer,omitempty"`
}

// BoldAmount represents the amount details
type BoldAmount struct {
	Currency    string     `json:"currency"`     // "COP"
	Taxes       []BoldTax  `json:"taxes"`
	TipAmount   float64    `json:"tip_amount"`
	TotalAmount float64    `json:"total_amount"`
}

// BoldTax represents tax information
type BoldTax struct {
	Type  string  `json:"type"`            // "VAT", "CONSUMPTION", "IVA_19", "IVA_5", "IAC_8"
	Base  float64 `json:"base,omitempty"`  // Tax base
	Value float64 `json:"value,omitempty"` // Tax value
}

// BoldPayer represents payer information
type BoldPayer struct {
	Email       string         `json:"email,omitempty"`
	PhoneNumber string         `json:"phone_number,omitempty"`
	Document    *BoldDocument  `json:"document,omitempty"`
}

// BoldDocument represents document information
type BoldDocument struct {
	DocumentType   string `json:"document_type"`   // "CEDULA", "NIT", etc.
	DocumentNumber string `json:"document_number"`
}

// BoldPaymentResponse represents the API response for payment creation
type BoldPaymentResponse struct {
	Payload BoldPaymentPayload `json:"payload"`
	Errors  []interface{}      `json:"errors"`
}

// BoldPaymentPayload represents the payload in payment response
type BoldPaymentPayload struct {
	IntegrationID string `json:"integration_id"`
}
