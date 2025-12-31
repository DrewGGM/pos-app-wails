package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"gorm.io/gorm"
)

// ComboService handles combo operations
type ComboService struct {
	*BaseService
}

// NewComboService creates a new combo service
func NewComboService() *ComboService {
	return &ComboService{
		BaseService: &BaseService{db: database.GetDB()},
	}
}

// GetAllCombos gets all active combos with their items
func (s *ComboService) GetAllCombos() ([]models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	var combos []models.Combo

	err := s.db.Preload("Items.Product").
		Preload("Category").
		Where("is_active = ?", true).
		Order("display_order, name").
		Find(&combos).Error

	return combos, err
}

// GetAllCombosAdmin gets all combos including inactive ones (for admin)
func (s *ComboService) GetAllCombosAdmin() ([]models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	var combos []models.Combo

	err := s.db.Preload("Items.Product").
		Preload("Category").
		Order("display_order, name").
		Find(&combos).Error

	return combos, err
}

// GetCombo gets a single combo by ID
func (s *ComboService) GetCombo(id uint) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	var combo models.Combo

	err := s.db.Preload("Items.Product").
		Preload("Category").
		First(&combo, id).Error

	return &combo, err
}

// CreateCombo creates a new combo with its items
func (s *ComboService) CreateCombo(combo *models.Combo) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	if combo.Name == "" {
		return nil, errors.New("el nombre del combo es requerido")
	}

	if combo.Price <= 0 {
		return nil, errors.New("el precio debe ser mayor a 0")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Create the combo first
		if err := tx.Create(combo).Error; err != nil {
			return err
		}

		// Update positions for items
		for i := range combo.Items {
			combo.Items[i].ComboID = combo.ID
			combo.Items[i].Position = i
		}

		// Save items if any
		if len(combo.Items) > 0 {
			if err := tx.Save(&combo.Items).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Reload with all relations
	return s.GetCombo(combo.ID)
}

// UpdateCombo updates an existing combo
func (s *ComboService) UpdateCombo(combo *models.Combo) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	if combo.ID == 0 {
		return nil, errors.New("combo ID es requerido")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Update combo basic info
		if err := tx.Model(&models.Combo{}).Where("id = ?", combo.ID).Updates(map[string]interface{}{
			"name":          combo.Name,
			"description":   combo.Description,
			"price":         combo.Price,
			"image":         combo.Image,
			"category_id":   combo.CategoryID,
			"is_active":     combo.IsActive,
			"tax_type_id":   combo.TaxTypeID,
			"display_order": combo.DisplayOrder,
		}).Error; err != nil {
			return err
		}

		// Delete existing items
		if err := tx.Where("combo_id = ?", combo.ID).Delete(&models.ComboItem{}).Error; err != nil {
			return err
		}

		// Create new items
		for i := range combo.Items {
			combo.Items[i].ID = 0 // Reset ID for new creation
			combo.Items[i].ComboID = combo.ID
			combo.Items[i].Position = i
		}

		if len(combo.Items) > 0 {
			if err := tx.Create(&combo.Items).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Reload with all relations
	return s.GetCombo(combo.ID)
}

// DeleteCombo soft deletes a combo
func (s *ComboService) DeleteCombo(id uint) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}

	return s.db.Delete(&models.Combo{}, id).Error
}

// ToggleComboActive toggles the active status of a combo
func (s *ComboService) ToggleComboActive(id uint) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	var combo models.Combo
	if err := s.db.First(&combo, id).Error; err != nil {
		return nil, err
	}

	combo.IsActive = !combo.IsActive
	if err := s.db.Save(&combo).Error; err != nil {
		return nil, err
	}

	return s.GetCombo(id)
}

// ComboOrderItem represents a combo item to be added to an order
type ComboOrderItem struct {
	ComboID  uint `json:"combo_id"`
	Quantity int  `json:"quantity"`
}

// ExpandedOrderItem represents an expanded combo item ready for order creation
type ExpandedOrderItem struct {
	ProductID   uint    `json:"product_id"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Subtotal    float64 `json:"subtotal"`
	ComboID     *uint   `json:"combo_id,omitempty"`
	ComboName   string  `json:"combo_name,omitempty"`
	ComboColor  string  `json:"combo_color,omitempty"`
	IsFromCombo bool    `json:"is_from_combo"`
	Notes       string  `json:"notes,omitempty"`
}

// generateComboColor generates a random pastel color for combo grouping
func generateComboColor() string {
	// Predefined pastel colors for better visibility
	colors := []string{
		"#A8E6CF", // Mint green
		"#DDA0DD", // Plum
		"#87CEEB", // Sky blue
		"#F0E68C", // Khaki
		"#FFB6C1", // Light pink
		"#98D8C8", // Seafoam
		"#F7DC6F", // Light yellow
		"#BB8FCE", // Light purple
		"#85C1E9", // Light blue
		"#F8B500", // Gold
	}
	rand.Seed(time.Now().UnixNano())
	return colors[rand.Intn(len(colors))]
}

// ExpandComboToOrderItems expands a combo into individual order items for kitchen
// Each item will have the combo tracking fields set
func (s *ComboService) ExpandComboToOrderItems(comboID uint, quantity int) ([]ExpandedOrderItem, float64, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, 0, err
	}

	combo, err := s.GetCombo(comboID)
	if err != nil {
		return nil, 0, fmt.Errorf("combo no encontrado: %v", err)
	}

	if !combo.IsActive {
		return nil, 0, errors.New("el combo no está activo")
	}

	if len(combo.Items) == 0 {
		return nil, 0, errors.New("el combo no tiene productos")
	}

	// Generate a color for this combo instance
	comboColor := generateComboColor()

	var expandedItems []ExpandedOrderItem

	for _, item := range combo.Items {
		if item.Product == nil {
			continue
		}

		// Calculate proportional price for each item
		// This is for internal tracking, the customer pays the combo price
		itemQty := item.Quantity * quantity

		expandedItem := ExpandedOrderItem{
			ProductID:   item.ProductID,
			Quantity:    itemQty,
			UnitPrice:   item.Product.Price, // Original product price for reference
			Subtotal:    0,                  // Will be calculated at order level
			ComboID:     &comboID,
			ComboName:   combo.Name,
			ComboColor:  comboColor,
			IsFromCombo: true,
		}

		expandedItems = append(expandedItems, expandedItem)
	}

	// Total price is combo price * quantity ordered
	totalPrice := combo.Price * float64(quantity)

	return expandedItems, totalPrice, nil
}

// GetCombosByCategory gets combos by category
func (s *ComboService) GetCombosByCategory(categoryID uint) ([]models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	var combos []models.Combo

	err := s.db.Preload("Items.Product").
		Preload("Category").
		Where("category_id = ? AND is_active = ?", categoryID, true).
		Order("display_order, name").
		Find(&combos).Error

	return combos, err
}

// AddItemToCombo adds a product to an existing combo
func (s *ComboService) AddItemToCombo(comboID uint, productID uint, quantity int) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	// Check combo exists
	var combo models.Combo
	if err := s.db.First(&combo, comboID).Error; err != nil {
		return nil, errors.New("combo no encontrado")
	}

	// Check product exists
	var product models.Product
	if err := s.db.First(&product, productID).Error; err != nil {
		return nil, errors.New("producto no encontrado")
	}

	// Get max position
	var maxPosition int
	s.db.Model(&models.ComboItem{}).
		Where("combo_id = ?", comboID).
		Select("COALESCE(MAX(position), -1)").
		Scan(&maxPosition)

	// Create new item
	item := models.ComboItem{
		ComboID:   comboID,
		ProductID: productID,
		Quantity:  quantity,
		Position:  maxPosition + 1,
	}

	if err := s.db.Create(&item).Error; err != nil {
		return nil, err
	}

	return s.GetCombo(comboID)
}

// RemoveItemFromCombo removes a product from a combo
func (s *ComboService) RemoveItemFromCombo(comboID uint, itemID uint) (*models.Combo, error) {
	if err := s.EnsureDB(); err != nil {
		return nil, err
	}

	if err := s.db.Where("id = ? AND combo_id = ?", itemID, comboID).
		Delete(&models.ComboItem{}).Error; err != nil {
		return nil, err
	}

	return s.GetCombo(comboID)
}

// UpdateComboItemQuantity updates the quantity of an item in a combo
func (s *ComboService) UpdateComboItemQuantity(itemID uint, quantity int) error {
	if err := s.EnsureDB(); err != nil {
		return err
	}

	if quantity < 1 {
		return errors.New("la cantidad debe ser al menos 1")
	}

	return s.db.Model(&models.ComboItem{}).
		Where("id = ?", itemID).
		Update("quantity", quantity).Error
}
