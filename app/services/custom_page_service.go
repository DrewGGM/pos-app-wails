package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"fmt"

	"gorm.io/gorm"
)

// CustomPageService handles custom page operations
type CustomPageService struct {
	db *gorm.DB
}

// NewCustomPageService creates a new custom page service
func NewCustomPageService() *CustomPageService {
	return &CustomPageService{
		db: database.GetDB(),
	}
}

// GetAllPages gets all active custom pages ordered by display_order
func (s *CustomPageService) GetAllPages() ([]models.CustomPage, error) {
	var pages []models.CustomPage
	err := s.db.Where("is_active = ?", true).
		Order("display_order, name").
		Find(&pages).Error
	return pages, err
}

// GetPage gets a single page by ID
func (s *CustomPageService) GetPage(id uint) (*models.CustomPage, error) {
	var page models.CustomPage
	err := s.db.First(&page, id).Error
	return &page, err
}

// GetPageWithProducts gets a page with its products in order
func (s *CustomPageService) GetPageWithProducts(pageID uint) ([]models.Product, error) {
	var pageProducts []models.CustomPageProduct
	err := s.db.Where("custom_page_id = ?", pageID).
		Order("position").
		Preload("Product.Category").
		Preload("Product.Modifiers").
		Find(&pageProducts).Error

	if err != nil {
		return nil, err
	}

	// Extract products in order
	products := make([]models.Product, 0, len(pageProducts))
	for _, pp := range pageProducts {
		if pp.Product != nil && pp.Product.IsActive {
			products = append(products, *pp.Product)
		}
	}

	// Now preload ModifierGroup for each modifier to ensure proper serialization
	for i := range products {
		if len(products[i].Modifiers) > 0 {
			for j := range products[i].Modifiers {
				if products[i].Modifiers[j].GroupID > 0 {
					s.db.Model(&products[i].Modifiers[j]).Association("ModifierGroup").Find(&products[i].Modifiers[j].ModifierGroup)
				}
			}
		}
	}

	return products, nil
}

// CreatePage creates a new custom page
func (s *CustomPageService) CreatePage(page *models.CustomPage) error {
	return s.db.Create(page).Error
}

// UpdatePage updates a custom page
func (s *CustomPageService) UpdatePage(page *models.CustomPage) error {
	return s.db.Save(page).Error
}

// DeletePage soft deletes a custom page
func (s *CustomPageService) DeletePage(id uint) error {
	return s.db.Delete(&models.CustomPage{}, id).Error
}

// AddProductToPage adds a product to a page at a specific position
func (s *CustomPageService) AddProductToPage(pageID uint, productID uint, position int) error {
	// Check if already exists
	var count int64
	s.db.Model(&models.CustomPageProduct{}).
		Where("custom_page_id = ? AND product_id = ?", pageID, productID).
		Count(&count)

	if count > 0 {
		return fmt.Errorf("product already in page")
	}

	pageProduct := models.CustomPageProduct{
		CustomPageID: pageID,
		ProductID:    productID,
		Position:     position,
	}

	return s.db.Create(&pageProduct).Error
}

// RemoveProductFromPage removes a product from a page
func (s *CustomPageService) RemoveProductFromPage(pageID uint, productID uint) error {
	return s.db.Where("custom_page_id = ? AND product_id = ?", pageID, productID).
		Delete(&models.CustomPageProduct{}).Error
}

// SetPageProducts replaces all products in a page with new list (in order)
func (s *CustomPageService) SetPageProducts(pageID uint, productIDs []uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Delete existing associations
		if err := tx.Where("custom_page_id = ?", pageID).
			Delete(&models.CustomPageProduct{}).Error; err != nil {
			return err
		}

		// Create new associations with positions
		for position, productID := range productIDs {
			pageProduct := models.CustomPageProduct{
				CustomPageID: pageID,
				ProductID:    productID,
				Position:     position,
			}
			if err := tx.Create(&pageProduct).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
