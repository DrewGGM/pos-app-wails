package models

import (
	"time"

	"gorm.io/gorm"
)

// Product represents a product in the menu
type Product struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	Name            string         `gorm:"not null" json:"name"`
	Description     string         `json:"description"`
	Price           float64        `gorm:"not null" json:"price"`
	CategoryID      uint           `json:"category_id"`
	Category        *Category      `json:"category,omitempty"`
	Image           string         `gorm:"type:text" json:"image"`                         // Base64 encoded image
	Stock           int            `json:"stock"`                                          // Can go negative
	IsActive        bool           `gorm:"default:true" json:"is_active"`
	TaxTypeID       int            `gorm:"default:1" json:"tax_type_id"`                   // DIAN Tax Type (1=IVA 19%, 5=IVA 0%, 6=IVA 5%)
	UnitMeasureID   int            `gorm:"default:796" json:"unit_measure_id"`             // DIAN Unit Measure (70=Unidad, 796=Porción, 797=Ración)
	Modifiers       []Modifier     `gorm:"many2many:product_modifiers;" json:"modifiers,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// Category represents a product category
type Category struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `gorm:"not null;unique" json:"name"`
	Description  string         `json:"description"`
	Icon         string         `json:"icon"`
	Color        string         `json:"color"` // For UI display
	DisplayOrder int            `json:"display_order"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	Products     []Product      `json:"products,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// ModifierGroup represents a group of modifiers
type ModifierGroup struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Name      string     `gorm:"not null" json:"name"`
	Required  bool       `json:"required"`
	Multiple  bool       `json:"multiple"` // Allow multiple selections
	MinSelect int        `json:"min_select"`
	MaxSelect int        `json:"max_select"`
	Modifiers []Modifier `gorm:"foreignKey:GroupID" json:"modifiers,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// Modifier represents product modifiers/extras
type Modifier struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	Name          string         `gorm:"not null" json:"name"`
	Type          string         `json:"type"`         // "addition", "removal", "option"
	PriceChange   float64        `json:"price_change"` // Can be negative for removals
	GroupID       uint           `json:"group_id"`
	ModifierGroup *ModifierGroup `gorm:"foreignKey:GroupID" json:"modifier_group,omitempty"`
	Products      []Product      `gorm:"many2many:product_modifiers;" json:"-"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

// InventoryMovement tracks inventory changes
type InventoryMovement struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ProductID   uint      `json:"product_id"`
	Product     *Product  `json:"product,omitempty"`
	Type        string    `json:"type"`     // "purchase", "sale", "adjustment", "loss"
	Quantity    int       `json:"quantity"` // Positive for additions, negative for removals
	PreviousQty int       `json:"previous_qty"`
	NewQty      int       `json:"new_qty"`
	Reference   string    `json:"reference"`             // Order ID, adjustment reason, etc.
	EmployeeID  *uint     `json:"employee_id,omitempty"` // Nullable - can be system-generated
	Employee    *Employee `json:"employee,omitempty"`
	Notes       string    `json:"notes"`
	CreatedAt   time.Time `json:"created_at"`
}

// ProductModifier junction table for many-to-many relationship
type ProductModifier struct {
	ProductID  uint `gorm:"primaryKey"`
	ModifierID uint `gorm:"primaryKey"`
}
