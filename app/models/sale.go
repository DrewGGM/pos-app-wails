package models

import (
	"time"

	"gorm.io/gorm"
)

// Sale represents a completed sale transaction
type Sale struct {
	ID                     uint               `gorm:"primaryKey" json:"id"`
	SaleNumber             string             `gorm:"unique;not null" json:"sale_number"`
	OrderID                uint               `json:"order_id"`
	Order                  *Order             `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	CustomerID             *uint              `json:"customer_id,omitempty"`
	Customer               *Customer          `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	Subtotal               float64            `json:"subtotal"`
	Tax                    float64            `json:"tax"`
	Discount               float64            `json:"discount"`
	Total                  float64            `json:"total"`
	PaymentMethod          string             `json:"payment_method"`
	PaymentDetails         []Payment          `gorm:"foreignKey:SaleID" json:"payment_details"`
	Status                 string             `json:"status"`                   // "completed", "refunded", "partial_refund"
	InvoiceType            string             `json:"invoice_type"`             // "none", "electronic", "pos_equivalent"
	NeedsElectronicInvoice bool               `json:"needs_electronic_invoice"` // Flag for electronic invoice per sale
	ElectronicInvoice      *ElectronicInvoice `gorm:"foreignKey:SaleID" json:"electronic_invoice,omitempty"`
	EmployeeID             uint               `json:"employee_id"`
	Employee               *Employee          `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	CashRegisterID         uint               `json:"cash_register_id"`
	CashRegister           *CashRegister      `gorm:"foreignKey:CashRegisterID" json:"cash_register,omitempty"`
	Notes                  string             `json:"notes"`
	IsSynced               bool               `gorm:"default:false" json:"is_synced"`
	CreatedAt              time.Time          `json:"created_at"`
	UpdatedAt              time.Time          `json:"updated_at"`
	DeletedAt              gorm.DeletedAt     `gorm:"index" json:"deleted_at,omitempty"`
}

// Payment represents payment details for a sale
type Payment struct {
	ID              uint                `gorm:"primaryKey" json:"id"`
	SaleID          uint                `json:"sale_id"`
	Sale            *Sale               `gorm:"foreignKey:SaleID" json:"-"`
	PaymentMethodID uint                `json:"payment_method_id"`
	PaymentMethod   *PaymentMethod      `gorm:"foreignKey:PaymentMethodID" json:"payment_method,omitempty"`
	Amount          float64             `json:"amount"`
	Reference       string              `json:"reference"`             // Transaction ID, check number, etc.
	Allocations     []PaymentAllocation `gorm:"foreignKey:PaymentID" json:"allocations,omitempty"` // Product allocations for split payments
	CreatedAt       time.Time           `json:"created_at"`
}

// PaymentAllocation represents payment allocation to specific order items (for split payments)
type PaymentAllocation struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	PaymentID   uint       `json:"payment_id"`
	Payment     *Payment   `gorm:"foreignKey:PaymentID" json:"-"`
	OrderItemID uint       `json:"order_item_id"`
	OrderItem   *OrderItem `gorm:"foreignKey:OrderItemID" json:"order_item,omitempty"`
	Amount      float64    `json:"amount"`
	CreatedAt   time.Time  `json:"created_at"`
}

// PaymentMethod represents available payment methods
type PaymentMethod struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	Name                 string    `gorm:"not null;unique" json:"name"`
	Type                 string    `json:"type"` // "cash", "digital", "card", "check", "other"
	Icon                 string    `json:"icon"`
	RequiresRef          bool      `json:"requires_ref"`            // Requires reference number
	DIANPaymentMethodID  *int      `json:"dian_payment_method_id"`  // DIAN parametric payment method ID for electronic invoicing
	AffectsCashRegister  bool      `gorm:"default:true" json:"affects_cash_register"` // Whether this payment type counts in cash register reconciliation
	ShowInCashSummary    bool      `gorm:"default:true" json:"show_in_cash_summary"`  // Whether this payment method appears in cash register sales summary
	IsSystemDefault      bool      `gorm:"default:false" json:"is_system_default"` // System default payment methods cannot be deleted
	IsActive             bool      `gorm:"default:true" json:"is_active"`
	DisplayOrder         int       `json:"display_order"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Customer represents a customer
type Customer struct {
	ID                           uint           `gorm:"primaryKey" json:"id"`
	IdentificationType           string         `json:"identification_type"` // NIT, CC, CE, etc.
	IdentificationNumber         string         `gorm:"unique" json:"identification_number"`
	DV                           *string        `json:"dv,omitempty"`                              // Digito verificación (solo para NIT)
	Name                         string         `gorm:"not null" json:"name"`                      // Razón social o nombre completo
	Email                        string         `json:"email"`                                     // Email principal
	Phone                        string         `json:"phone"`                                     // Teléfono de contacto
	Address                      string         `json:"address"`                                   // Dirección física
	MunicipalityID               *int           `json:"municipality_id,omitempty"`                 // Municipio (opcional - corporativos)
	TypeDocumentIdentificationID *int           `json:"type_document_identification_id,omitempty"` // DIAN ID tipo documento (opcional - si no se envía usa default según IdentificationType)
	TypeOrganizationID           *int           `json:"type_organization_id,omitempty"`            // DIAN: 1=Jurídica, 2=Natural (opcional - corporativos)
	TypeLiabilityID              *int           `json:"type_liability_id,omitempty"`               // DIAN responsabilidades fiscales (opcional - corporativos)
	TypeRegimeID                 *int           `json:"type_regime_id,omitempty"`                  // DIAN régimen tributario (opcional - corporativos)
	MerchantRegistration         *string        `json:"merchant_registration,omitempty"`           // Matrícula mercantil (opcional - corporativos)
	IsActive                     bool           `gorm:"default:true" json:"is_active"`
	CreatedAt                    time.Time      `json:"created_at"`
	UpdatedAt                    time.Time      `json:"updated_at"`
	DeletedAt                    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// ElectronicInvoice represents DIAN electronic invoice data
type ElectronicInvoice struct {
	ID                   uint         `gorm:"primaryKey" json:"id"`
	SaleID               uint         `gorm:"unique" json:"sale_id"`
	Sale                 *Sale        `json:"-"`
	InvoiceNumber        string       `json:"invoice_number"`
	Prefix               string       `json:"prefix"`
	UUID                 *string      `json:"uuid,omitempty"`           // Optional UUID from DIAN (not generated, only stored if DIAN sends it)
	CUFE                 string       `json:"cufe"`                     // Código Único de Facturación Electrónica (always present, used as unique ID)
	QRCode               string       `json:"qr_code"`                  // QR code URL or data
	ZipKey               string       `json:"zip_key"`                  // ZIP key for status verification
	Status               string       `json:"status"`                   // "pending", "sent", "accepted", "rejected", "validating"
	IsValid              *bool        `json:"is_valid,omitempty"`       // DIAN validation result
	ValidationMessage    string       `json:"validation_message"`       // DIAN validation message
	DIANResponse         string       `gorm:"type:text" json:"dian_response"` // JSON response from DIAN
	SentAt               *time.Time   `json:"sent_at,omitempty"`        // When sent to DIAN
	AcceptedAt           *time.Time   `json:"accepted_at,omitempty"`    // When accepted by DIAN
	ValidationCheckedAt  *time.Time   `json:"validation_checked_at,omitempty"` // Last validation check
	XMLDocument          string       `json:"xml_document"`             // Stored XML
	PDFDocument          string       `json:"pdf_document"`             // Base64 PDF
	RetryCount           int          `json:"retry_count"`
	LastError            string       `json:"last_error"`
	CreditNotes          []CreditNote `json:"credit_notes,omitempty"`
	DebitNotes           []DebitNote  `json:"debit_notes,omitempty"`
	CreatedAt            time.Time    `json:"created_at"`
	UpdatedAt            time.Time    `json:"updated_at"`
}

// CreditNote represents a DIAN credit note
type CreditNote struct {
	ID                  uint               `gorm:"primaryKey" json:"id"`
	ElectronicInvoiceID uint               `json:"electronic_invoice_id"`
	ElectronicInvoice   *ElectronicInvoice `json:"-"`
	Number              string             `json:"number"`
	Prefix              string             `json:"prefix"`
	UUID                string             `json:"uuid"`
	Reason              string             `json:"reason"`
	DiscrepancyCode     int                `json:"discrepancy_code"`
	Amount              float64            `json:"amount"`
	Status              string             `json:"status"`
	DIANResponse        string             `json:"dian_response"`
	XMLDocument         string             `json:"xml_document"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}

// DebitNote represents a DIAN debit note
type DebitNote struct {
	ID                  uint               `gorm:"primaryKey" json:"id"`
	ElectronicInvoiceID uint               `json:"electronic_invoice_id"`
	ElectronicInvoice   *ElectronicInvoice `json:"-"`
	Number              string             `json:"number"`
	Prefix              string             `json:"prefix"`
	UUID                string             `json:"uuid"`
	Reason              string             `json:"reason"`
	DiscrepancyCode     int                `json:"discrepancy_code"`
	Amount              float64            `json:"amount"`
	Status              string             `json:"status"`
	DIANResponse        string             `json:"dian_response"`
	XMLDocument         string             `json:"xml_document"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}

// QueuedInvoice for offline DIAN sync
type QueuedInvoice struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	SaleID      uint      `json:"sale_id"`
	InvoiceData string    `json:"invoice_data"` // JSON serialized invoice
	Type        string    `json:"type"`         // "invoice", "credit_note", "debit_note"
	RetryCount  int       `json:"retry_count"`
	LastError   string    `json:"last_error"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
