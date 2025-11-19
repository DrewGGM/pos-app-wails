package models

import (
	"database/sql/driver"
	"time"

	"gorm.io/gorm"
)

// OrderStatus represents the status of an order
type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusPreparing OrderStatus = "preparing"
	OrderStatusReady     OrderStatus = "ready"
	OrderStatusDelivered OrderStatus = "delivered"
	OrderStatusCancelled OrderStatus = "cancelled"
	OrderStatusPaid      OrderStatus = "paid"
)

func (s OrderStatus) String() string {
	return string(s)
}

func (s *OrderStatus) Scan(value interface{}) error {
	*s = OrderStatus(value.(string))
	return nil
}

func (s OrderStatus) Value() (driver.Value, error) {
	return string(s), nil
}

// OrderType represents a configurable order type
type OrderType struct {
	ID                      uint           `gorm:"primaryKey" json:"id"`
	Code                    string         `gorm:"unique;not null" json:"code"` // "dine-in", "takeout", "delivery", etc.
	Name                    string         `gorm:"not null" json:"name"`
	RequiresSequentialNumber bool          `gorm:"default:false" json:"requires_sequential_number"`
	SequencePrefix          string         `json:"sequence_prefix"` // Optional prefix for sequential numbers (e.g., "D-" for delivery)
	DisplayColor            string         `json:"display_color"`   // Hex color for UI
	Icon                    string         `json:"icon"`            // Icon identifier
	IsActive                bool           `gorm:"default:true" json:"is_active"`
	DisplayOrder            int            `gorm:"default:0" json:"display_order"`
	SkipPaymentDialog       bool           `gorm:"default:false" json:"skip_payment_dialog"`      // If true, skip payment dialog and use default payment method
	DefaultPaymentMethodID  *uint          `json:"default_payment_method_id,omitempty"`           // Default payment method when skipping dialog
	AutoPrintReceipt        bool           `gorm:"default:true" json:"auto_print_receipt"`        // If true, automatically print receipt when auto-processing payment
	HideAmountInReports     bool           `gorm:"default:false" json:"hide_amount_in_reports"`   // If true, hide sales amount in reports (only show products)
	CreatedAt               time.Time      `json:"created_at"`
	UpdatedAt               time.Time      `json:"updated_at"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// Order represents a customer order
type Order struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	OrderNumber   string         `gorm:"unique;not null" json:"order_number"`
	OrderTypeID   *uint          `gorm:"index" json:"order_type_id,omitempty"`
	OrderType     *OrderType     `gorm:"foreignKey:OrderTypeID" json:"order_type,omitempty"`
	Type          string         `json:"type"` // Deprecated: kept for backward compatibility, use OrderType instead
	Status        OrderStatus    `gorm:"index" json:"status"`
	SequenceNumber *int          `gorm:"default:null" json:"sequence_number,omitempty"` // Sequential number for order types that require it (1,2,3...), reuses freed numbers
	TakeoutNumber *int           `gorm:"default:null" json:"takeout_number,omitempty"` // Deprecated: use SequenceNumber instead
	TableID       *uint          `gorm:"index" json:"table_id,omitempty"`
	Table         *Table         `gorm:"foreignKey:TableID" json:"table,omitempty"`
	CustomerID   *uint          `gorm:"index" json:"customer_id,omitempty"`
	Customer     *Customer      `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	// Delivery information (optional, for delivery orders)
	DeliveryCustomerName string `json:"delivery_customer_name,omitempty"`
	DeliveryAddress      string `json:"delivery_address,omitempty"`
	DeliveryPhone        string `json:"delivery_phone,omitempty"`
	Items        []OrderItem    `gorm:"foreignKey:OrderID" json:"items"`
	Subtotal     float64        `json:"subtotal"`
	Tax          float64        `json:"tax"`
	Discount     float64        `json:"discount"`
	Total        float64        `json:"total"`
	Notes        string         `json:"notes"`
	EmployeeID   uint           `gorm:"index" json:"employee_id"`
	Employee     *Employee      `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	SaleID       *uint          `json:"sale_id,omitempty"`
	Source       string         `json:"source"` // "pos", "waiter_app", "online"
	IsSynced     bool           `gorm:"default:false" json:"is_synced"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ID              uint                `gorm:"primaryKey" json:"id"`
	OrderID         uint                `gorm:"index" json:"order_id"`
	Order           *Order              `gorm:"foreignKey:OrderID" json:"-"`
	ProductID       uint                `gorm:"index" json:"product_id"`
	Product         *Product            `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Quantity        int                 `json:"quantity"`
	UnitPrice       float64             `json:"unit_price"`
	Subtotal        float64             `json:"subtotal"`
	Modifiers       []OrderItemModifier `gorm:"foreignKey:OrderItemID;constraint:OnDelete:CASCADE" json:"modifiers"`
	Notes           string              `json:"notes"`
	Status          string              `json:"status"` // "pending", "preparing", "ready"
	SentToKitchen   bool                `gorm:"default:false" json:"sent_to_kitchen"`
	SentToKitchenAt *time.Time          `json:"sent_to_kitchen_at,omitempty"`
	PreparedAt      *time.Time          `json:"prepared_at,omitempty"`
	CreatedAt       time.Time           `json:"created_at"`
	UpdatedAt       time.Time           `json:"updated_at"`
}

// OrderItemModifier represents modifiers applied to an order item
type OrderItemModifier struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	OrderItemID uint      `json:"order_item_id"`
	ModifierID  uint      `json:"modifier_id"`
	Modifier    *Modifier `gorm:"foreignKey:ModifierID" json:"modifier,omitempty"`
	PriceChange float64   `json:"price_change"`
	CreatedAt   time.Time `json:"created_at"`
}

// TableArea represents a logical grouping of tables
type TableArea struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description"`
	Color       string         `json:"color"` // Hex color for UI
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// Table represents a restaurant table
type Table struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Number       string         `gorm:"not null" json:"number"` // Unique constraint handled by partial index in migration
	Name         string         `json:"name"`
	Capacity     int            `json:"capacity"`
	Zone         string         `json:"zone"` // "interior", "exterior", "bar" (deprecated - use AreaID)
	AreaID       *uint          `json:"area_id,omitempty"`
	Area         *TableArea     `gorm:"foreignKey:AreaID" json:"area,omitempty"`
	Status       string         `json:"status"` // "available", "occupied", "reserved", "cleaning"
	CurrentOrder *Order         `gorm:"foreignKey:TableID" json:"current_order,omitempty"`
	PositionX    int            `json:"position_x"` // For UI layout
	PositionY    int            `json:"position_y"` // For UI layout
	Shape        string         `json:"shape"`      // "square", "round", "rectangle"
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
