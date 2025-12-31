package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Combo representa un paquete de productos vendidos como uno solo
// En el POS se muestra como un item único, pero en la cocina se expanden a productos individuales
type Combo struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description"`
	Price       float64        `gorm:"not null" json:"price"` // Precio del combo (generalmente con descuento)
	Image       string         `gorm:"type:text" json:"image"`
	CategoryID  *uint          `json:"category_id,omitempty"`
	Category    *Category      `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	Items       []ComboItem    `gorm:"foreignKey:ComboID" json:"items,omitempty"`
	TaxTypeID   int            `gorm:"default:1" json:"tax_type_id"`       // Tipo de impuesto DIAN
	DisplayOrder int           `gorm:"default:0" json:"display_order"`     // Orden de visualización
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// ComboItem representa un producto dentro de un combo
type ComboItem struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ComboID   uint      `gorm:"not null;index" json:"combo_id"`
	Combo     *Combo    `gorm:"foreignKey:ComboID" json:"-"`
	ProductID uint      `gorm:"not null;index" json:"product_id"`
	Product   *Product  `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Quantity  int       `gorm:"default:1" json:"quantity"` // Cantidad de este producto en el combo
	Position  int       `json:"position"`                  // Orden de visualización
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetTotalItemsCount retorna el total de productos en el combo
func (c *Combo) GetTotalItemsCount() int {
	total := 0
	for _, item := range c.Items {
		total += item.Quantity
	}
	return total
}

// GetItemsDescription retorna una descripción de los productos incluidos
func (c *Combo) GetItemsDescription() string {
	if len(c.Items) == 0 {
		return ""
	}

	description := "Incluye: "
	for i, item := range c.Items {
		if item.Product != nil {
			if i > 0 {
				description += ", "
			}
			if item.Quantity > 1 {
				description += fmt.Sprintf("%dx %s", item.Quantity, item.Product.Name)
			} else {
				description += item.Product.Name
			}
		}
	}
	return description
}
