package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ProductService handles product operations
type ProductService struct {
	db      *gorm.DB
	localDB *database.LocalDB
}

// NewProductService creates a new product service
func NewProductService() *ProductService {
	return &ProductService{
		db:      database.GetDB(),
		localDB: database.GetLocalDB(),
	}
}

// GetAllProducts gets all active products
func (s *ProductService) GetAllProducts() ([]models.Product, error) {
	var products []models.Product

	// ALWAYS try main database first (don't use cache to avoid stale stock data)
	err := s.db.Preload("Category").Preload("Modifiers.ModifierGroup").
		Where("is_active = ?", true).
		Order("category_id, name").
		Find(&products).Error

	if err == nil {
		// Cache products locally (but prefer fresh data from DB)
		s.cacheProducts(products)
		return products, nil
	}

	// Only fallback to cache if DB is completely unavailable
	if s.localDB != nil && s.localDB.IsOfflineMode() {
		return s.getProductsFromCache()
	}

	return nil, err
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

		// Update local cache
		s.cacheProducts([]models.Product{*product})

		return nil
	})
}

// DeleteProduct soft deletes a product
func (s *ProductService) DeleteProduct(id uint) error {
	return s.db.Delete(&models.Product{}, id).Error
}

// AdjustStock adjusts product stock
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
	})
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

	// Try main database first
	if !s.localDB.IsOfflineMode() {
		err := s.db.Where("is_active = ?", true).
			Order("display_order, name").
			Find(&categories).Error

		if err == nil {
			// Cache categories locally
			s.cacheCategories(categories)
			return categories, nil
		}
	}

	// Fallback to local cache
	return s.getCategoriesFromCache()
}

// CreateCategory creates a new category
func (s *ProductService) CreateCategory(category *models.Category) (*models.Category, error) {
	if err := s.db.Create(category).Error; err != nil {
		return nil, err
	}

	// Update cache
	s.cacheCategories([]models.Category{*category})
	return category, nil
}

// UpdateCategory updates a category
func (s *ProductService) UpdateCategory(category *models.Category) (*models.Category, error) {
	if err := s.db.Save(category).Error; err != nil {
		return nil, err
	}

	// Update cache
	s.cacheCategories([]models.Category{*category})
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

// Cache methods

func (s *ProductService) cacheProducts(products []models.Product) {
	if s.localDB == nil {
		return
	}

	for _, product := range products {
		productData, _ := json.Marshal(product)
		localProduct := database.LocalProduct{
			ID:          product.ID,
			ProductData: string(productData),
			LastSynced:  time.Now(),
			IsModified:  false,
		}

		s.localDB.GetDB().Save(&localProduct)
	}
}

func (s *ProductService) getProductsFromCache() ([]models.Product, error) {
	var localProducts []database.LocalProduct
	if err := s.localDB.GetDB().Find(&localProducts).Error; err != nil {
		return nil, err
	}

	var products []models.Product
	for _, lp := range localProducts {
		var product models.Product
		if err := json.Unmarshal([]byte(lp.ProductData), &product); err != nil {
			continue
		}
		products = append(products, product)
	}

	return products, nil
}

func (s *ProductService) cacheCategories(categories []models.Category) {
	if s.localDB == nil {
		return
	}

	for _, category := range categories {
		categoryData, _ := json.Marshal(category)
		localCategory := database.LocalCategory{
			ID:           category.ID,
			CategoryData: string(categoryData),
			LastSynced:   time.Now(),
		}

		s.localDB.GetDB().Save(&localCategory)
	}
}

func (s *ProductService) getCategoriesFromCache() ([]models.Category, error) {
	var localCategories []database.LocalCategory
	if err := s.localDB.GetDB().Find(&localCategories).Error; err != nil {
		return nil, err
	}

	var categories []models.Category
	for _, lc := range localCategories {
		var category models.Category
		if err := json.Unmarshal([]byte(lc.CategoryData), &category); err != nil {
			continue
		}
		categories = append(categories, category)
	}

	return categories, nil
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
