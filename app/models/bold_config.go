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
	WebhookURL         string `json:"webhook_url"`          // URL to receive webhook notifications (production)
	WebhookURLSandbox  string `json:"webhook_url_sandbox"`  // Sandbox webhook URL (test)
	WebhookSecret      string `json:"webhook_secret"`       // Secret for webhook validation (production)
	WebhookSecretSandbox string `json:"webhook_secret_sandbox"` // Secret for webhook validation (sandbox/test)
	WebhookPort        int    `json:"webhook_port" gorm:"default:8083"` // Port for webhook HTTP server

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

// BoldPendingPayment tracks Bold payments awaiting webhook confirmation
type BoldPendingPayment struct {
	ID uint `gorm:"primaryKey" json:"id"`

	IntegrationID string  `json:"integration_id" gorm:"uniqueIndex;not null"` // Bold's integration_id
	Reference     string  `json:"reference"`                                   // Our internal reference
	Amount        float64 `json:"amount"`                                      // Payment amount
	Status        string  `json:"status" gorm:"default:'pending'"`             // "pending", "approved", "rejected", "cancelled"

	// Context information to complete the payment
	PaymentMethodID   uint   `json:"payment_method_id"`             // POS payment method ID
	PaymentMethodName string `json:"payment_method_name"`           // POS payment method name
	OrderID           uint   `json:"order_id,omitempty"`            // Order ID if available
	CustomerID        uint   `json:"customer_id,omitempty"`         // Customer ID if available
	EmployeeID        uint   `json:"employee_id,omitempty"`         // Employee ID if available
	CashRegisterID    uint   `json:"cash_register_id,omitempty"`    // Cash register ID if available

	// Webhook notification data (populated when webhook received)
	PaymentID      string     `json:"payment_id"`       // Bold's payment_id from webhook
	BoldCode       string     `json:"bold_code"`        // Bold transaction code
	ApprovalNumber string     `json:"approval_number"`  // Approval number from card network
	CardBrand      string     `json:"card_brand"`       // Card brand (VISA, MASTERCARD, etc.)
	CardMaskedPan  string     `json:"card_masked_pan"`  // Masked card number
	WebhookData    string     `json:"webhook_data" gorm:"type:text"` // Full webhook JSON for reference

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BoldWebhookLog represents a raw webhook attempt (for debugging)
type BoldWebhookLog struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// Request details
	Method        string    `json:"method"`
	RemoteAddr    string    `json:"remote_addr"`
	Headers       string    `json:"headers" gorm:"type:text"`      // JSON string of headers
	RawBody       string    `json:"raw_body" gorm:"type:text"`     // Raw request body
	Signature     string    `json:"signature"`                     // x-bold-signature header
	ContentType   string    `json:"content_type"`

	// Processing details
	ProcessStatus string    `json:"process_status"` // "success", "failed_signature", "failed_parse", "failed_processing"
	ErrorMessage  string    `json:"error_message" gorm:"type:text"`
	MatchedPayment bool    `json:"matched_payment"` // Whether it matched a pending payment

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BoldWebhookNotification represents a webhook notification from Bold
type BoldWebhookNotification struct {
	ID              string                 `json:"id"`               // UUID of the notification
	Type            string                 `json:"type"`             // SALE_APPROVED, SALE_REJECTED, VOID_APPROVED, VOID_REJECTED
	Subject         string                 `json:"subject"`          // Transaction ID
	Source          string                 `json:"source"`           // Resource that sent the notification
	SpecVersion     string                 `json:"spec_version"`     // CloudEvents spec version
	Time            int64                  `json:"time"`             // Notification time in POSIX format
	Data            BoldWebhookData        `json:"data"`             // Notification body
	DataContentType string                 `json:"datacontenttype"`  // Content type of data
}

// BoldWebhookData represents the data portion of a webhook notification
type BoldWebhookData struct {
	PaymentID      string                  `json:"payment_id"`
	MerchantID     string                  `json:"merchant_id"`
	CreatedAt      string                  `json:"created_at"`
	Amount         BoldWebhookAmount       `json:"amount"`
	UserID         string                  `json:"user_id"`
	Metadata       BoldWebhookMetadata     `json:"metadata"`
	BoldCode       string                  `json:"bold_code"`
	PayerEmail     string                  `json:"payer_email,omitempty"`
	PaymentMethod  string                  `json:"payment_method"`
	Card           *BoldWebhookCard        `json:"card,omitempty"`
	ApprovalNumber string                  `json:"approval_number,omitempty"`
	Integration    string                  `json:"integration"`
}

// BoldWebhookAmount represents amount information in webhook
type BoldWebhookAmount struct {
	Currency string              `json:"currency"`
	Total    float64             `json:"total"`
	Taxes    []BoldWebhookTax    `json:"taxes"`
	Tip      float64             `json:"tip"`
}

// BoldWebhookTax represents tax information in webhook
type BoldWebhookTax struct {
	Base  float64 `json:"base"`
	Type  string  `json:"type"`
	Value float64 `json:"value"`
}

// BoldWebhookMetadata represents metadata in webhook
type BoldWebhookMetadata struct {
	Reference string `json:"reference"`
}

// BoldWebhookCard represents card information in webhook
type BoldWebhookCard struct {
	CaptureMode     string `json:"capture_mode"`
	Brand           string `json:"brand"`      // Can also be "franchise"
	CardholderName  string `json:"cardholder_name"`
	TerminalID      string `json:"terminal_id"`
	MaskedPan       string `json:"masked_pan"`
	Installments    int    `json:"installments"`
	CardType        string `json:"card_type"`
}
