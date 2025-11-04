package models

import (
	"time"

	"gorm.io/gorm"
)

// Ingredient represents a raw material/ingredient used in products
type Ingredient struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"not null;index" json:"name"`
	Unit      string         `gorm:"default:unidades" json:"unit"` // unidades, kg, gramos, litros, ml
	Stock     float64        `gorm:"default:0" json:"stock"`       // Allows decimals for kg, liters
	MinStock  float64        `gorm:"default:0" json:"min_stock"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ProductIngredient represents the recipe - which ingredients are used in each product
type ProductIngredient struct {
	ID           uint        `gorm:"primaryKey" json:"id"`
	ProductID    uint        `gorm:"not null;index" json:"product_id"`
	IngredientID uint        `gorm:"not null;index" json:"ingredient_id"`
	Quantity     float64     `gorm:"not null" json:"quantity"` // Amount consumed per product sale
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Product    *Product    `gorm:"foreignKey:ProductID;constraint:OnDelete:CASCADE" json:"product,omitempty"`
	Ingredient *Ingredient `gorm:"foreignKey:IngredientID;constraint:OnDelete:CASCADE" json:"ingredient,omitempty"`
}

// IngredientMovement tracks all ingredient stock changes
type IngredientMovement struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	IngredientID uint       `gorm:"not null;index" json:"ingredient_id"`
	Type         string     `gorm:"not null" json:"type"` // purchase, sale, adjustment, loss
	Quantity     float64    `gorm:"not null" json:"quantity"` // Positive for additions, negative for deductions
	PreviousQty  float64    `json:"previous_qty"`
	NewQty       float64    `json:"new_qty"`
	Reference    string     `json:"reference"` // Order number, reason, etc.
	EmployeeID   *uint      `json:"employee_id"`
	Notes        string     `json:"notes"`
	CreatedAt    time.Time  `json:"created_at"`

	// Relations
	Ingredient *Ingredient `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
	Employee   *Employee   `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName specifies the table name for Ingredient
func (Ingredient) TableName() string {
	return "ingredients"
}

// TableName specifies the table name for ProductIngredient
func (ProductIngredient) TableName() string {
	return "product_ingredients"
}

// TableName specifies the table name for IngredientMovement
func (IngredientMovement) TableName() string {
	return "ingredient_movements"
}
