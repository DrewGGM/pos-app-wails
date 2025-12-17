package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"
)

// ProductService handles product operations
type ProductService struct {
	*BaseService
}

// NewProductService creates a new product service
func NewProductService() *ProductService {
	return &ProductService{
		BaseService: &BaseService{db: database.GetDB()},
	}
}

// GetAllProducts gets all active products
func (s *ProductService) GetAllProducts() ([]models.Product, error) {
	var products []models.Product

	err := s.db.Preload("Category").Preload("Modifiers.ModifierGroup").
		Where("is_active = ?", true).
		Order("category_id, name").
		Find(&products).Error

	return products, err
}

// GetProductsByCategory gets products by category
func (s *ProductService) GetProductsByCategory(categoryID uint) ([]models.Product, error) {
	var products []models.Product

	err := s.db.Preload("Modifiers.ModifierGroup").
		Where("category_id = ? AND is_active = ?", categoryID, true).
		Order("display_order, name").
		Find(&products).Error

	return products, err
}

// GetProduct gets a single product by ID
func (s *ProductService) GetProduct(id uint) (*models.Product, error) {
	var product models.Product

	err := s.db.Preload("Category").Preload("Modifiers.ModifierGroup").
		First(&product, id).Error

	return &product, err
}

// CreateProduct creates a new product
func (s *ProductService) CreateProduct(product *models.Product) error {
	// Start transaction
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Create product
		if err := tx.Create(product).Error; err != nil {
			return err
		}

		// Create initial inventory record (without employee_id to avoid FK constraint)
		movement := models.InventoryMovement{
			ProductID:   product.ID,
			Type:        "adjustment",
			Quantity:    product.Stock,
			PreviousQty: 0,
			NewQty:      product.Stock,
			Reference:   "Initial stock",
			Notes:       "Product creation",
			// EmployeeID is optional and can be null
		}

		return tx.Create(&movement).Error
	})
}

// UpdateProduct updates a product
func (s *ProductService) UpdateProduct(product *models.Product) error {
	// Get current stock for comparison
	var currentProduct models.Product
	if err := s.db.First(&currentProduct, product.ID).Error; err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// Update product
		if err := tx.Save(product).Error; err != nil {
			return err
		}

		// If stock changed, create inventory movement
		if currentProduct.Stock != product.Stock {
			movement := models.InventoryMovement{
				ProductID:   product.ID,
				Type:        "adjustment",
				Quantity:    product.Stock - currentProduct.Stock,
				PreviousQty: currentProduct.Stock,
				NewQty:      product.Stock,
				Reference:   "Manual adjustment",
			}

			if err := tx.Create(&movement).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// DeleteProduct soft deletes a product
func (s *ProductService) DeleteProduct(id uint) error {
	return s.db.Delete(&models.Product{}, id).Error
}

// AdjustStock adjusts product stock
// Note: Manual adjustments are allowed even if TrackInventory is false,
// to permit corrections and special cases
func (s *ProductService) AdjustStock(productID uint, quantity int, reason string, employeeID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var product models.Product
		if err := tx.First(&product, productID).Error; err != nil {
			return err
		}

		previousStock := product.Stock
		product.Stock += quantity

		// Save product
		if err := tx.Save(&product).Error; err != nil {
			return err
		}

		// Create inventory movement even if TrackInventory is false
		// (manual adjustments should always be logged)
		movement := models.InventoryMovement{
			ProductID:   productID,
			Type:        "adjustment",
			Quantity:    quantity,
			PreviousQty: previousStock,
			NewQty:      product.Stock,
			Reference:   reason,
		}

		// Only set EmployeeID if it's not 0 (valid employee)
		if employeeID != 0 {
			movement.EmployeeID = &employeeID
		}

		return tx.Create(&movement).Error
	})
}

// AdjustStockInTransaction adjusts product stock within an existing transaction
// CRITICAL FIX: This variant works within an existing transaction to prevent nested transactions
func (s *ProductService) AdjustStockInTransaction(tx *gorm.DB, productID uint, quantity int, reason string, employeeID uint) error {
	var product models.Product
	if err := tx.First(&product, productID).Error; err != nil {
		return err
	}

	previousStock := product.Stock
	product.Stock += quantity

	// Save product
	if err := tx.Save(&product).Error; err != nil {
		return err
	}

	// Create inventory movement
	movement := models.InventoryMovement{
		ProductID:   productID,
		Type:        "adjustment",
		Quantity:    quantity,
		PreviousQty: previousStock,
		NewQty:      product.Stock,
		Reference:   reason,
	}

	// Only set EmployeeID if it's not 0 (valid employee)
	if employeeID != 0 {
		movement.EmployeeID = &employeeID
	}

	return tx.Create(&movement).Error
}

// GetInventoryMovements gets inventory movements for a product
func (s *ProductService) GetInventoryMovements(productID uint) ([]models.InventoryMovement, error) {
	var movements []models.InventoryMovement

	err := s.db.Preload("Employee").
		Where("product_id = ?", productID).
		Order("created_at DESC").
		Find(&movements).Error

	return movements, err
}

// Categories

// GetAllCategories gets all active categories
func (s *ProductService) GetAllCategories() ([]models.Category, error) {
	var categories []models.Category

	err := s.db.Where("is_active = ?", true).
		Order("display_order, name").
		Find(&categories).Error

	return categories, err
}

// CreateCategory creates a new category
func (s *ProductService) CreateCategory(category *models.Category) (*models.Category, error) {
	if err := s.db.Create(category).Error; err != nil {
		return nil, err
	}

	return category, nil
}

// UpdateCategory updates a category
func (s *ProductService) UpdateCategory(category *models.Category) (*models.Category, error) {
	if err := s.db.Save(category).Error; err != nil {
		return nil, err
	}

	return category, nil
}

// DeleteCategory soft deletes a category
func (s *ProductService) DeleteCategory(id uint) error {
	return s.db.Delete(&models.Category{}, id).Error
}

// Modifiers

// GetModifierGroups gets all modifier groups
func (s *ProductService) GetModifierGroups() ([]models.ModifierGroup, error) {
	var groups []models.ModifierGroup

	err := s.db.Preload("Modifiers").
		Order("name").
		Find(&groups).Error

	return groups, err
}

// GetModifiers gets all modifiers
func (s *ProductService) GetModifiers() ([]models.Modifier, error) {
	var modifiers []models.Modifier

	err := s.db.Preload("ModifierGroup").
		Order("name").
		Find(&modifiers).Error

	return modifiers, err
}

// CreateModifierGroup creates a new modifier group
func (s *ProductService) CreateModifierGroup(group *models.ModifierGroup) error {
	return s.db.Create(group).Error
}

// UpdateModifierGroup updates a modifier group
func (s *ProductService) UpdateModifierGroup(group *models.ModifierGroup) error {
	return s.db.Save(group).Error
}

// DeleteModifierGroup deletes a modifier group
func (s *ProductService) DeleteModifierGroup(id uint) error {
	return s.db.Delete(&models.ModifierGroup{}, id).Error
}

// CreateModifier creates a new modifier
func (s *ProductService) CreateModifier(modifier *models.Modifier) error {
	return s.db.Create(modifier).Error
}

// UpdateModifier updates a modifier
func (s *ProductService) UpdateModifier(modifier *models.Modifier) error {
	return s.db.Save(modifier).Error
}

// DeleteModifier deletes a modifier
func (s *ProductService) DeleteModifier(id uint) error {
	return s.db.Delete(&models.Modifier{}, id).Error
}

// AssignModifierToProduct assigns a modifier to a product
func (s *ProductService) AssignModifierToProduct(productID uint, modifierID uint) error {
	var product models.Product
	if err := s.db.First(&product, productID).Error; err != nil {
		return err
	}

	var modifier models.Modifier
	if err := s.db.First(&modifier, modifierID).Error; err != nil {
		return err
	}

	return s.db.Model(&product).Association("Modifiers").Append(&modifier)
}

// RemoveModifierFromProduct removes a modifier from a product
func (s *ProductService) RemoveModifierFromProduct(productID uint, modifierID uint) error {
	var product models.Product
	if err := s.db.First(&product, productID).Error; err != nil {
		return err
	}

	var modifier models.Modifier
	if err := s.db.First(&modifier, modifierID).Error; err != nil {
		return err
	}

	return s.db.Model(&product).Association("Modifiers").Delete(&modifier)
}

// Search

// SearchProducts searches products by name or SKU
func (s *ProductService) SearchProducts(query string) ([]models.Product, error) {
	var products []models.Product

	searchQuery := "%" + query + "%"
	err := s.db.Preload("Category").
		Where("(name LIKE ? OR sku LIKE ?) AND is_active = ?", searchQuery, searchQuery, true).
		Find(&products).Error

	return products, err
}

// GetLowStockProducts gets products with low stock
func (s *ProductService) GetLowStockProducts(threshold int) ([]models.Product, error) {
	var products []models.Product

	err := s.db.Preload("Category").
		Where("stock <= ? AND is_active = ?", threshold, true).
		Order("stock ASC").
		Find(&products).Error

	return products, err
}

// ImportProducts imports products from CSV or JSON
func (s *ProductService) ImportProducts(data []byte, format string) error {
	// Implementation for importing products
	// This would parse CSV or JSON and create products
	return fmt.Errorf("not implemented")
}

// ExportProducts exports products to CSV or JSON
func (s *ProductService) ExportProducts(format string) ([]byte, error) {
	products, err := s.GetAllProducts()
	if err != nil {
		return nil, err
	}

	if format == "json" {
		return json.Marshal(products)
	}

	// CSV export implementation
	return nil, fmt.Errorf("CSV export not implemented")
}

// InventorySummary holds aggregated inventory statistics
type InventorySummary struct {
	TotalProducts   int     `json:"total_products"`
	TrackedProducts int     `json:"tracked_products"`
	LowStock        int     `json:"low_stock"`
	OutOfStock      int     `json:"out_of_stock"`
	TotalValue      float64 `json:"total_value"`
}

// GetInventorySummary returns aggregated inventory statistics using SQL
func (s *ProductService) GetInventorySummary() (*InventorySummary, error) {
	summary := &InventorySummary{}

	// Get all counts in a single query
	var result struct {
		TotalProducts   int
		TrackedProducts int
		LowStock        int
		OutOfStock      int
		TotalValue      float64
	}

	err := s.db.Model(&models.Product{}).
		Select(`
			COUNT(*) as total_products,
			COUNT(CASE WHEN track_inventory = true OR track_inventory IS NULL THEN 1 END) as tracked_products,
			COUNT(CASE WHEN (track_inventory = true OR track_inventory IS NULL) AND stock > 0 AND stock <= COALESCE(min_stock, 0) THEN 1 END) as low_stock,
			COUNT(CASE WHEN (track_inventory = true OR track_inventory IS NULL) AND stock <= 0 THEN 1 END) as out_of_stock,
			COALESCE(SUM(stock * COALESCE(cost, price)), 0) as total_value
		`).
		Where("is_active = ?", true).
		Scan(&result).Error

	if err != nil {
		return nil, err
	}

	summary.TotalProducts = result.TotalProducts
	summary.TrackedProducts = result.TrackedProducts
	summary.LowStock = result.LowStock
	summary.OutOfStock = result.OutOfStock
	summary.TotalValue = result.TotalValue

	return summary, nil
}
