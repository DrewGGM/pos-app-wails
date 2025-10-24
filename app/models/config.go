package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// SystemConfig represents system configuration
type SystemConfig struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Key       string         `gorm:"unique;not null" json:"key"`
	Value     string         `json:"value"`
	Type      string         `json:"type"`                           // "string", "number", "boolean", "json"
	Category  string         `json:"category"`                       // "general", "dian", "printer", "ui", "sync"
	IsLocked  bool           `gorm:"default:false" json:"is_locked"` // Cannot be modified from UI
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// RestaurantConfig represents restaurant-specific configuration
type RestaurantConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// Restaurant Info
	Name                 string `json:"name"`                   // Commercial name
	BusinessName         string `json:"business_name"`          // Legal name (Razón Social)
	IdentificationNumber string `json:"identification_number"`  // NIT
	DV                   string `json:"dv"`                     // Dígito de verificación
	Logo                 string `gorm:"type:text" json:"logo"`  // Base64 encoded image
	Address              string `json:"address"`
	Phone                string `json:"phone"`
	Email                string `json:"email"`
	Website              string `json:"website"`
	DepartmentID         *int   `json:"department_id,omitempty"`   // DIAN parametric department ID
	MunicipalityID       *int   `json:"municipality_id,omitempty"` // DIAN parametric municipality ID

	// Tax & Legal Info
	TypeRegimeID     *int `json:"type_regime_id,omitempty"`     // DIAN: Tipo de régimen (Simplificado=48, Ordinario=49)
	TypeLiabilityID  *int `json:"type_liability_id,omitempty"`  // DIAN: Tipo de responsabilidad (IVA, ReteFuente, etc.)
	TypeDocumentID   *int `json:"type_document_id,omitempty"`   // DIAN: Tipo de documento (NIT=31, CC=13, etc.)
	TypeOrganization *int `json:"type_organization_id,omitempty"` // DIAN: Tipo de organización

	// Operation Mode
	RestaurantMode        string `json:"restaurant_mode"` // "self_service", "traditional"
	EnableTableManagement bool   `json:"enable_table_management"`
	EnableKitchenDisplay  bool   `json:"enable_kitchen_display"`
	EnableWaiterApp       bool   `json:"enable_waiter_app"`

	// Invoice Settings
	InvoiceHeader     string `json:"invoice_header"`
	InvoiceFooter     string `json:"invoice_footer"`
	ShowLogoOnInvoice bool   `json:"show_logo_on_invoice"`

	// Tax Settings
	DefaultTaxRate     float64 `json:"default_tax_rate"`
	TaxIncludedInPrice bool    `json:"tax_included_in_price"`

	// Currency
	Currency       string `json:"currency"`        // "COP"
	CurrencySymbol string `json:"currency_symbol"` // "$"
	DecimalPlaces  int    `json:"decimal_places"`

	// Working Hours
	OpeningTime string `json:"opening_time"` // "08:00"
	ClosingTime string `json:"closing_time"` // "22:00"
	WorkingDays string `json:"working_days"` // JSON array of days

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DIANConfig represents DIAN electronic invoicing configuration
type DIANConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// Environment
	Environment string `json:"environment"` // "test", "production"
	IsEnabled   bool   `json:"is_enabled"`

	// Company Data
	IdentificationNumber string `json:"identification_number"`
	DV                   string `json:"dv"`
	BusinessName         string `json:"business_name"`
	MerchantRegistration string `json:"merchant_registration"`
	TypeDocumentID       int    `json:"type_document_id"`
	TypeOrganizationID   int    `json:"type_organization_id"`
	TypeRegimeID         int    `json:"type_regime_id"`
	TypeLiabilityID      int    `json:"type_liability_id"`
	MunicipalityID       int    `json:"municipality_id"`

	// Software Info
	SoftwareID  string `json:"software_id"`
	SoftwarePIN string `json:"software_pin"`

	// Certificate
	Certificate         string `json:"certificate"` // Base64
	CertificatePassword string `json:"certificate_password"`

	// Resolution (Invoice)
	ResolutionNumber   string    `json:"resolution_number"`
	ResolutionPrefix   string    `json:"resolution_prefix"`
	ResolutionFrom     int       `json:"resolution_from"`
	ResolutionTo       int       `json:"resolution_to"`
	ResolutionDateFrom time.Time `json:"resolution_date_from"`
	ResolutionDateTo   time.Time `json:"resolution_date_to"`
	TechnicalKey       string    `json:"technical_key"`

	// Resolution Credit Note (NC)
	CreditNoteResolutionNumber   string    `json:"credit_note_resolution_number"`
	CreditNoteResolutionPrefix   string    `json:"credit_note_resolution_prefix"`
	CreditNoteResolutionFrom     int       `json:"credit_note_resolution_from"`
	CreditNoteResolutionTo       int       `json:"credit_note_resolution_to"`
	CreditNoteResolutionDateFrom time.Time `json:"credit_note_resolution_date_from"`
	CreditNoteResolutionDateTo   time.Time `json:"credit_note_resolution_date_to"`

	// Resolution Debit Note (ND)
	DebitNoteResolutionNumber   string    `json:"debit_note_resolution_number"`
	DebitNoteResolutionPrefix   string    `json:"debit_note_resolution_prefix"`
	DebitNoteResolutionFrom     int       `json:"debit_note_resolution_from"`
	DebitNoteResolutionTo       int       `json:"debit_note_resolution_to"`
	DebitNoteResolutionDateFrom time.Time `json:"debit_note_resolution_date_from"`
	DebitNoteResolutionDateTo   time.Time `json:"debit_note_resolution_date_to"`

	// API Settings
	APIURL       string `json:"api_url"`
	APIToken     string `json:"api_token"`
	TestSetID    string `json:"test_set_id"`
	UseTestSetID bool   `json:"use_test_set_id"` // If true, includes test_set_id in URL (some tests don't need it)

	// Counters
	LastInvoiceNumber    int `json:"last_invoice_number"`
	LastCreditNoteNumber int `json:"last_credit_note_number"`
	LastDebitNoteNumber  int `json:"last_debit_note_number"`

	// Email Settings
	SendEmail       bool   `json:"send_email"`
	EmailHost       string `json:"email_host"`
	EmailPort       int    `json:"email_port"`
	EmailUsername   string `json:"email_username"`
	EmailPassword   string `json:"email_password"`
	EmailEncryption string `json:"email_encryption"`

	// Configuration Steps Completion Tracking
	Step1Completed bool `json:"step1_completed"` // Company configuration
	Step2Completed bool `json:"step2_completed"` // Software configuration
	Step3Completed bool `json:"step3_completed"` // Certificate configuration
	Step4Completed bool `json:"step4_completed"` // Resolution configuration (Invoice)
	Step5Completed bool `json:"step5_completed"` // Resolution configuration (Credit Note - NC)
	Step6Completed bool `json:"step6_completed"` // Resolution configuration (Debit Note - ND)

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PrinterConfig represents printer configuration
type PrinterConfig struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Name             string    `gorm:"not null" json:"name"`
	Type             string    `json:"type"`            // "usb", "network"
	ConnectionType   string    `json:"connection_type"` // "usb", "ethernet", "bluetooth"
	Address          string    `json:"address"`         // USB port or IP address
	Port             int       `json:"port"`            // For network printers
	Model            string    `json:"model"`
	PaperWidth       int       `json:"paper_width"` // 58mm, 80mm
	IsDefault        bool      `json:"is_default"`
	IsActive         bool      `json:"is_active"`
	PrintLogo        bool      `json:"print_logo"`
	AutoCut          bool      `json:"auto_cut"`
	CashDrawer       bool      `json:"cash_drawer"`       // Has cash drawer attached
	PrintKitchenCopy bool      `json:"print_kitchen_copy"` // Print kitchen copy when order is created
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// SyncConfig represents sync configuration
type SyncConfig struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	EnableAutoSync  bool       `json:"enable_auto_sync"`
	SyncInterval    int        `json:"sync_interval"` // Minutes
	RetryAttempts   int        `json:"retry_attempts"`
	RetryDelay      int        `json:"retry_delay"` // Seconds
	LastSyncAt      *time.Time `json:"last_sync_at,omitempty"`
	LastSyncStatus  string     `json:"last_sync_status"`
	LastSyncError   string     `json:"last_sync_error"`
	PendingOrders   int        `json:"pending_orders"`
	PendingInvoices int        `json:"pending_invoices"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// TableLayout for storing table positions
type TableLayout struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	Name      string          `json:"name"`
	IsDefault bool            `json:"is_default"`
	Layout    json.RawMessage `json:"layout"` // JSON with table positions
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// UITheme represents UI customization
type UITheme struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	PrimaryColor    string    `json:"primary_color"`
	SecondaryColor  string    `json:"secondary_color"`
	AccentColor     string    `json:"accent_color"`
	BackgroundColor string    `json:"background_color"`
	TextColor       string    `json:"text_color"`
	FontFamily      string    `json:"font_family"`
	FontSize        string    `json:"font_size"`
	ButtonStyle     string    `json:"button_style"` // "rounded", "square"
	DarkMode        bool      `json:"dark_mode"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
