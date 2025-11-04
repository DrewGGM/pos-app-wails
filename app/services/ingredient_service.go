package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"fmt"
	"log"

	"gorm.io/gorm"
)

// IngredientService handles ingredient management
type IngredientService struct {
	db *gorm.DB
}

// NewIngredientService creates a new ingredient service
func NewIngredientService() *IngredientService {
	return &IngredientService{
		db: database.GetDB(),
	}
}

// CRUD Operations for Ingredients

// GetAllIngredients retrieves all ingredients
func (s *IngredientService) GetAllIngredients() ([]models.Ingredient, error) {
	var ingredients []models.Ingredient
	err := s.db.Order("name ASC").Find(&ingredients).Error
	return ingredients, err
}

// GetIngredient retrieves a single ingredient by ID
func (s *IngredientService) GetIngredient(id uint) (*models.Ingredient, error) {
	var ingredient models.Ingredient
	err := s.db.First(&ingredient, id).Error
	return &ingredient, err
}

// CreateIngredient creates a new ingredient
func (s *IngredientService) CreateIngredient(ingredient *models.Ingredient) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Create ingredient
		if err := tx.Create(ingredient).Error; err != nil {
			return err
		}

		// Create initial movement if stock > 0
		if ingredient.Stock > 0 {
			movement := models.IngredientMovement{
				IngredientID: ingredient.ID,
				Type:         "adjustment",
				Quantity:     ingredient.Stock,
				PreviousQty:  0,
				NewQty:       ingredient.Stock,
				Reference:    "Initial stock",
			}
			if err := tx.Create(&movement).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// UpdateIngredient updates an existing ingredient
func (s *IngredientService) UpdateIngredient(ingredient *models.Ingredient) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get current ingredient
		var current models.Ingredient
		if err := tx.First(&current, ingredient.ID).Error; err != nil {
			return err
		}

		// Check if stock changed
		if current.Stock != ingredient.Stock {
			// Create movement for stock change
			movement := models.IngredientMovement{
				IngredientID: ingredient.ID,
				Type:         "adjustment",
				Quantity:     ingredient.Stock - current.Stock,
				PreviousQty:  current.Stock,
				NewQty:       ingredient.Stock,
				Reference:    "Manual adjustment",
			}
			if err := tx.Create(&movement).Error; err != nil {
				return err
			}
		}

		// Update ingredient
		return tx.Save(ingredient).Error
	})
}

// DeleteIngredient deletes an ingredient
func (s *IngredientService) DeleteIngredient(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Delete product ingredient relationships
		if err := tx.Where("ingredient_id = ?", id).Delete(&models.ProductIngredient{}).Error; err != nil {
			return err
		}

		// Delete ingredient
		return tx.Delete(&models.Ingredient{}, id).Error
	})
}

// AdjustIngredientStock adjusts ingredient stock manually
func (s *IngredientService) AdjustIngredientStock(ingredientID uint, quantity float64, reason string, employeeID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var ingredient models.Ingredient
		if err := tx.First(&ingredient, ingredientID).Error; err != nil {
			return err
		}

		previousStock := ingredient.Stock
		ingredient.Stock += quantity

		// Save ingredient
		if err := tx.Save(&ingredient).Error; err != nil {
			return err
		}

		// Create movement
		movement := models.IngredientMovement{
			IngredientID: ingredientID,
			Type:         "adjustment",
			Quantity:     quantity,
			PreviousQty:  previousStock,
			NewQty:       ingredient.Stock,
			Reference:    reason,
		}

		// Set employee ID if provided
		if employeeID != 0 {
			movement.EmployeeID = &employeeID
		}

		return tx.Create(&movement).Error
	})
}

// GetIngredientMovements retrieves all movements for an ingredient
func (s *IngredientService) GetIngredientMovements(ingredientID uint) ([]models.IngredientMovement, error) {
	var movements []models.IngredientMovement
	err := s.db.Preload("Employee").
		Where("ingredient_id = ?", ingredientID).
		Order("created_at DESC").
		Find(&movements).Error
	return movements, err
}

// GetLowStockIngredients gets ingredients with stock below minimum
func (s *IngredientService) GetLowStockIngredients() ([]models.Ingredient, error) {
	var ingredients []models.Ingredient
	err := s.db.Where("is_active = ? AND stock <= min_stock", true).
		Order("stock ASC").
		Find(&ingredients).Error
	return ingredients, err
}

// CRUD Operations for ProductIngredients (Recipes)

// GetProductIngredients gets all ingredients for a product
func (s *IngredientService) GetProductIngredients(productID uint) ([]models.ProductIngredient, error) {
	var productIngredients []models.ProductIngredient
	err := s.db.Preload("Ingredient").
		Where("product_id = ?", productID).
		Find(&productIngredients).Error
	return productIngredients, err
}

// AddProductIngredient adds an ingredient to a product recipe
func (s *IngredientService) AddProductIngredient(productIngredient *models.ProductIngredient) error {
	return s.db.Create(productIngredient).Error
}

// UpdateProductIngredient updates the quantity of an ingredient in a product
func (s *IngredientService) UpdateProductIngredient(productIngredient *models.ProductIngredient) error {
	return s.db.Save(productIngredient).Error
}

// DeleteProductIngredient removes an ingredient from a product recipe
func (s *IngredientService) DeleteProductIngredient(id uint) error {
	return s.db.Delete(&models.ProductIngredient{}, id).Error
}

// SetProductIngredients sets all ingredients for a product (replaces existing)
func (s *IngredientService) SetProductIngredients(productID uint, ingredients []models.ProductIngredient) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Delete existing ingredients
		if err := tx.Where("product_id = ?", productID).Delete(&models.ProductIngredient{}).Error; err != nil {
			return err
		}

		// Add new ingredients
		for _, ing := range ingredients {
			ing.ProductID = productID
			if err := tx.Create(&ing).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// DeductIngredientsForOrder deducts ingredients when an order is created
// Returns warnings if ingredients are low, but doesn't block the order
func (s *IngredientService) DeductIngredientsForOrder(orderItems []models.OrderItem) []string {
	var warnings []string

	err := s.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range orderItems {
			// Get product ingredients
			var productIngredients []models.ProductIngredient
			if err := tx.Preload("Ingredient").
				Where("product_id = ?", item.ProductID).
				Find(&productIngredients).Error; err != nil {
				log.Printf("Error loading ingredients for product %d: %v", item.ProductID, err)
				continue
			}

			// Deduct each ingredient
			for _, prodIng := range productIngredients {
				if prodIng.Ingredient == nil {
					continue
				}

				// Calculate total quantity to deduct
				totalQuantity := prodIng.Quantity * float64(item.Quantity)

				// Get current ingredient stock
				var ingredient models.Ingredient
				if err := tx.First(&ingredient, prodIng.IngredientID).Error; err != nil {
					log.Printf("Error loading ingredient %d: %v", prodIng.IngredientID, err)
					continue
				}

				previousStock := ingredient.Stock
				ingredient.Stock -= totalQuantity

				// Check if stock is low or negative (warning only)
				if ingredient.Stock <= 0 {
					warnings = append(warnings, fmt.Sprintf(
						"⚠️ AGOTADO: %s (quedan %.2f %s)",
						ingredient.Name,
						ingredient.Stock,
						ingredient.Unit,
					))
				} else if ingredient.Stock <= ingredient.MinStock {
					warnings = append(warnings, fmt.Sprintf(
						"⚠️ STOCK BAJO: %s (quedan %.2f %s)",
						ingredient.Name,
						ingredient.Stock,
						ingredient.Unit,
					))
				}

				// Update stock
				if err := tx.Save(&ingredient).Error; err != nil {
					log.Printf("Error updating ingredient stock %d: %v", ingredient.ID, err)
					continue
				}

				// Create movement
				movement := models.IngredientMovement{
					IngredientID: ingredient.ID,
					Type:         "sale",
					Quantity:     -totalQuantity,
					PreviousQty:  previousStock,
					NewQty:       ingredient.Stock,
					Reference:    fmt.Sprintf("Order - %d units of product ID %d", item.Quantity, item.ProductID),
				}

				if err := tx.Create(&movement).Error; err != nil {
					log.Printf("Error creating ingredient movement: %v", err)
				}
			}
		}

		return nil
	})

	if err != nil {
		log.Printf("Error deducting ingredients: %v", err)
	}

	return warnings
}

// RestoreIngredientsForOrder restores ingredients when an order is cancelled/refunded
func (s *IngredientService) RestoreIngredientsForOrder(orderItems []models.OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range orderItems {
			// Get product ingredients
			var productIngredients []models.ProductIngredient
			if err := tx.Preload("Ingredient").
				Where("product_id = ?", item.ProductID).
				Find(&productIngredients).Error; err != nil {
				log.Printf("Error loading ingredients for product %d: %v", item.ProductID, err)
				continue
			}

			// Restore each ingredient
			for _, prodIng := range productIngredients {
				if prodIng.Ingredient == nil {
					continue
				}

				// Calculate total quantity to restore
				totalQuantity := prodIng.Quantity * float64(item.Quantity)

				// Get current ingredient stock
				var ingredient models.Ingredient
				if err := tx.First(&ingredient, prodIng.IngredientID).Error; err != nil {
					log.Printf("Error loading ingredient %d: %v", prodIng.IngredientID, err)
					continue
				}

				previousStock := ingredient.Stock
				ingredient.Stock += totalQuantity

				// Update stock
				if err := tx.Save(&ingredient).Error; err != nil {
					log.Printf("Error restoring ingredient stock %d: %v", ingredient.ID, err)
					continue
				}

				// Create movement
				movement := models.IngredientMovement{
					IngredientID: ingredient.ID,
					Type:         "adjustment",
					Quantity:     totalQuantity,
					PreviousQty:  previousStock,
					NewQty:       ingredient.Stock,
					Reference:    fmt.Sprintf("Refund - %d units of product ID %d", item.Quantity, item.ProductID),
				}

				if err := tx.Create(&movement).Error; err != nil {
					log.Printf("Error creating ingredient movement: %v", err)
				}
			}
		}

		return nil
	})
}
