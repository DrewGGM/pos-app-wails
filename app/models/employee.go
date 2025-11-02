package models

import (
	"time"

	"gorm.io/gorm"
)

// Employee represents an employee/user of the system
type Employee struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Username    string         `gorm:"unique;not null" json:"username"`
	Password    string         `json:"-"`    // Hashed password
	PIN         string         `json:"-"`    // Quick access PIN
	Role        string         `json:"role"` // "admin", "cashier", "waiter", "kitchen"
	Email       string         `json:"email"`
	Phone       string         `json:"phone"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	LastLoginAt *time.Time     `json:"last_login_at,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// CashRegister represents a cash register session
type CashRegister struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	EmployeeID     uint           `json:"employee_id"`
	Employee       *Employee      `json:"employee,omitempty"`
	OpeningAmount  float64        `json:"opening_amount"`
	ClosingAmount  *float64       `json:"closing_amount,omitempty"`
	ExpectedAmount *float64       `json:"expected_amount,omitempty"`
	Difference     *float64       `json:"difference,omitempty"`
	Status         string         `json:"status"` // "open", "closed"
	Notes          string         `json:"notes"`
	OpenedAt       time.Time      `json:"opened_at"`
	ClosedAt       *time.Time     `json:"closed_at,omitempty"`
	Movements      []CashMovement `json:"movements,omitempty"`
	Sales          []Sale         `json:"sales,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// CashMovement represents cash movements in a register
type CashMovement struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	CashRegisterID uint          `json:"cash_register_id"`
	CashRegister   *CashRegister `json:"-"`
	Type           string        `json:"type"`   // "sale", "deposit", "withdrawal", "adjustment"
	Amount         float64       `json:"amount"` // Positive for income, negative for expenses
	Description    string        `json:"description"`
	Reason         string        `json:"reason"` // Human-readable reason for the movement
	Reference      string        `json:"reference"` // Sale ID, etc.
	EmployeeID     uint          `json:"employee_id"`
	Employee       *Employee     `json:"employee,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`
}

// CashRegisterReport represents daily cash register report
type CashRegisterReport struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	CashRegisterID  uint      `json:"cash_register_id"`
	Date            time.Time `json:"date"`
	TotalSales      float64   `json:"total_sales"`
	TotalCash       float64   `json:"total_cash"`
	TotalCard       float64   `json:"total_card"`
	TotalDigital    float64   `json:"total_digital"`
	TotalOther      float64   `json:"total_other"`
	TotalRefunds    float64   `json:"total_refunds"`
	TotalDiscounts  float64   `json:"total_discounts"`
	TotalTax        float64   `json:"total_tax"`
	NumberOfSales   int       `json:"number_of_sales"`
	NumberOfRefunds int       `json:"number_of_refunds"`
	CashDeposits    float64   `json:"cash_deposits"`
	CashWithdrawals float64   `json:"cash_withdrawals"`
	OpeningBalance  float64   `json:"opening_balance"`
	ClosingBalance  float64   `json:"closing_balance"`
	ExpectedBalance float64   `json:"expected_balance"`
	Difference      float64   `json:"difference"`
	Notes           string    `json:"notes"`
	GeneratedBy     uint      `json:"generated_by"`
	Employee        *Employee `gorm:"foreignKey:GeneratedBy" json:"employee,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Session represents an active employee session
type Session struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	EmployeeID uint      `json:"employee_id"`
	Employee   *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	Token      string    `gorm:"unique" json:"token"`
	DeviceInfo string    `json:"device_info"`
	IPAddress  string    `json:"ip_address"`
	ExpiresAt  time.Time `json:"expires_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// AuditLog tracks important system actions
type AuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	EmployeeID uint      `json:"employee_id"`
	Employee   *Employee `json:"employee,omitempty"`
	Action     string    `json:"action"`
	Entity     string    `json:"entity"` // "sale", "product", "order", etc.
	EntityID   uint      `json:"entity_id"`
	OldValue   string    `json:"old_value"` // JSON of old values
	NewValue   string    `json:"new_value"` // JSON of new values
	IPAddress  string    `json:"ip_address"`
	UserAgent  string    `json:"user_agent"`
	CreatedAt  time.Time `json:"created_at"`
}
