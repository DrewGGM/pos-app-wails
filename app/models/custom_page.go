package models

import (
	"time"

	"gorm.io/gorm"
)

// CustomPage represents a custom product display page for POS
type CustomPage struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `gorm:"not null" json:"name"`
	Description  string         `json:"description"`
	Icon         string         `json:"icon"` // Material icon name
	Color        string         `json:"color"`
	DisplayOrder int            `json:"display_order"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// CustomPageProduct junction table with position
type CustomPageProduct struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	CustomPageID uint      `gorm:"not null;index" json:"custom_page_id"`
	ProductID    uint      `gorm:"not null;index" json:"product_id"`
	Position     int       `gorm:"not null;default:0" json:"position"`
	Product      *Product  `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName specifies the table name for CustomPageProduct
func (CustomPageProduct) TableName() string {
	return "custom_page_products"
}
