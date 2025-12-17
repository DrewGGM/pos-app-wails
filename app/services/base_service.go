package services

import (
	"PosApp/app/database"
	"fmt"

	"gorm.io/gorm"
)

// BaseService provides common functionality for all services
type BaseService struct {
	db *gorm.DB
}

// NewBaseService creates a new base service instance
func NewBaseService() *BaseService {
	return &BaseService{
		db: database.GetDB(),
	}
}

// GetDB returns the database connection
func (b *BaseService) GetDB() *gorm.DB {
	return b.db
}

// SetDB sets the database connection (useful for testing)
func (b *BaseService) SetDB(db *gorm.DB) {
	b.db = db
}

// EnsureDB checks if database is initialized and returns an error if not
func (b *BaseService) EnsureDB() error {
	if b.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return nil
}

// WithTransaction executes a function within a database transaction
func (b *BaseService) WithTransaction(fn func(tx *gorm.DB) error) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.Transaction(fn)
}

// Create creates a new record in the database
func (b *BaseService) Create(value interface{}) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.Create(value).Error
}

// Save updates a record in the database
func (b *BaseService) Save(value interface{}) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.Save(value).Error
}

// Delete soft deletes a record from the database
func (b *BaseService) Delete(value interface{}, id uint) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.Delete(value, id).Error
}

// First finds the first record matching the given conditions
func (b *BaseService) First(dest interface{}, conds ...interface{}) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.First(dest, conds...).Error
}

// Find finds all records matching the given conditions
func (b *BaseService) Find(dest interface{}, conds ...interface{}) error {
	if err := b.EnsureDB(); err != nil {
		return err
	}
	return b.db.Find(dest, conds...).Error
}

// Preload preloads associations for a query
func (b *BaseService) Preload(query string) *gorm.DB {
	return b.db.Preload(query)
}

// Where adds a where clause to a query
func (b *BaseService) Where(query interface{}, args ...interface{}) *gorm.DB {
	return b.db.Where(query, args...)
}

// Model specifies the model you would like to run db operations
func (b *BaseService) Model(value interface{}) *gorm.DB {
	return b.db.Model(value)
}

// InventoryMovementHelper creates an inventory movement record
type InventoryMovementHelper struct {
	ProductID    uint
	IngredientID uint
	Type         string
	Quantity     interface{} // Can be int or float64
	PreviousQty  interface{}
	NewQty       interface{}
	Reference    string
	Notes        string
	EmployeeID   *uint
}

// CreateInventoryMovement is a helper to create inventory movements
// This eliminates duplicated movement creation code across services
func CreateProductMovement(tx *gorm.DB, productID uint, movementType string, quantity, previousQty, newQty int, reference string, employeeID *uint) error {
	type InventoryMovement struct {
		ProductID   uint   `gorm:"column:product_id"`
		Type        string `gorm:"column:type"`
		Quantity    int    `gorm:"column:quantity"`
		PreviousQty int    `gorm:"column:previous_qty"`
		NewQty      int    `gorm:"column:new_qty"`
		Reference   string `gorm:"column:reference"`
		EmployeeID  *uint  `gorm:"column:employee_id"`
	}

	movement := InventoryMovement{
		ProductID:   productID,
		Type:        movementType,
		Quantity:    quantity,
		PreviousQty: previousQty,
		NewQty:      newQty,
		Reference:   reference,
		EmployeeID:  employeeID,
	}

	return tx.Table("inventory_movements").Create(&movement).Error
}

// CreateIngredientMovement creates an ingredient movement record
func CreateIngredientMovement(tx *gorm.DB, ingredientID uint, movementType string, quantity, previousQty, newQty float64, reference string, employeeID *uint) error {
	type IngredientMovement struct {
		IngredientID uint    `gorm:"column:ingredient_id"`
		Type         string  `gorm:"column:type"`
		Quantity     float64 `gorm:"column:quantity"`
		PreviousQty  float64 `gorm:"column:previous_qty"`
		NewQty       float64 `gorm:"column:new_qty"`
		Reference    string  `gorm:"column:reference"`
		EmployeeID   *uint   `gorm:"column:employee_id"`
	}

	movement := IngredientMovement{
		IngredientID: ingredientID,
		Type:         movementType,
		Quantity:     quantity,
		PreviousQty:  previousQty,
		NewQty:       newQty,
		Reference:    reference,
		EmployeeID:   employeeID,
	}

	return tx.Table("ingredient_movements").Create(&movement).Error
}
