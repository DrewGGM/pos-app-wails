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

// Order represents a customer order
type Order struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	OrderNumber string         `gorm:"unique;not null" json:"order_number"`
	Type        string         `json:"type"` // "dine-in", "takeout", "delivery"
	Status      OrderStatus    `json:"status"`
	TableID     *uint          `json:"table_id,omitempty"`
	Table       *Table         `json:"table,omitempty"`
	CustomerID  *uint          `json:"customer_id,omitempty"`
	Customer    *Customer      `json:"customer,omitempty"`
	Items       []OrderItem    `json:"items"`
	Subtotal    float64        `json:"subtotal"`
	Tax         float64        `json:"tax"`
	Discount    float64        `json:"discount"`
	Total       float64        `json:"total"`
	Notes       string         `json:"notes"`
	EmployeeID  uint           `json:"employee_id"`
	Employee    *Employee      `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	SaleID      *uint          `json:"sale_id,omitempty"`
	Source      string         `json:"source"` // "pos", "waiter_app", "online"
	IsSynced    bool           `gorm:"default:false" json:"is_synced"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ID              uint                `gorm:"primaryKey" json:"id"`
	OrderID         uint                `json:"order_id"`
	Order           *Order              `gorm:"foreignKey:OrderID" json:"-"`
	ProductID       uint                `json:"product_id"`
	Product         *Product            `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Quantity        int                 `json:"quantity"`
	UnitPrice       float64             `json:"unit_price"`
	Subtotal        float64             `json:"subtotal"`
	Modifiers       []OrderItemModifier `json:"modifiers"`
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

// QueuedOrder for offline sync
type QueuedOrder struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	OrderData  string    `json:"order_data"` // JSON serialized order
	Action     string    `json:"action"`     // "create", "update", "delete"
	RetryCount int       `json:"retry_count"`
	LastError  string    `json:"last_error"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
