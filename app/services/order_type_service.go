package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// OrderTypeService handles order type operations
type OrderTypeService struct {
	db *gorm.DB
}

// NewOrderTypeService creates a new order type service
func NewOrderTypeService() *OrderTypeService {
	return &OrderTypeService{
		db: database.GetDB(),
	}
}

// GetAllOrderTypes gets all order types
func (s *OrderTypeService) GetAllOrderTypes() ([]models.OrderType, error) {
	var orderTypes []models.OrderType
	err := s.db.Order("display_order ASC, name ASC").Find(&orderTypes).Error
	return orderTypes, err
}

// GetActiveOrderTypes gets all active order types
func (s *OrderTypeService) GetActiveOrderTypes() ([]models.OrderType, error) {
	var orderTypes []models.OrderType
	err := s.db.Where("is_active = ?", true).Order("display_order ASC, name ASC").Find(&orderTypes).Error
	return orderTypes, err
}

// GetOrderType gets a single order type by ID
func (s *OrderTypeService) GetOrderType(id uint) (*models.OrderType, error) {
	var orderType models.OrderType
	err := s.db.First(&orderType, id).Error
	return &orderType, err
}

// GetOrderTypeByCode gets an order type by its code
func (s *OrderTypeService) GetOrderTypeByCode(code string) (*models.OrderType, error) {
	var orderType models.OrderType
	err := s.db.Where("code = ?", code).First(&orderType).Error
	return &orderType, err
}

// CreateOrderType creates a new order type
func (s *OrderTypeService) CreateOrderType(orderType *models.OrderType) error {
	// Validate required fields
	if orderType.Code == "" || orderType.Name == "" {
		return fmt.Errorf("code and name are required")
	}

	// Check if code already exists
	var count int64
	s.db.Model(&models.OrderType{}).Where("code = ?", orderType.Code).Count(&count)
	if count > 0 {
		return fmt.Errorf("order type with code '%s' already exists", orderType.Code)
	}

	return s.db.Create(orderType).Error
}

// UpdateOrderType updates an order type
func (s *OrderTypeService) UpdateOrderType(orderType *models.OrderType) error {
	// Validate required fields
	if orderType.Code == "" || orderType.Name == "" {
		return fmt.Errorf("code and name are required")
	}

	// Check if code is being changed and if new code already exists
	var existing models.OrderType
	if err := s.db.First(&existing, orderType.ID).Error; err != nil {
		return fmt.Errorf("order type not found")
	}

	if existing.Code != orderType.Code {
		var count int64
		s.db.Model(&models.OrderType{}).Where("code = ? AND id != ?", orderType.Code, orderType.ID).Count(&count)
		if count > 0 {
			return fmt.Errorf("order type with code '%s' already exists", orderType.Code)
		}
	}

	return s.db.Save(orderType).Error
}

// DeleteOrderType soft deletes an order type
func (s *OrderTypeService) DeleteOrderType(id uint) error {
	// Check if order type is being used in any orders
	var count int64
	s.db.Model(&models.Order{}).Where("order_type_id = ?", id).Count(&count)
	if count > 0 {
		return fmt.Errorf("cannot delete order type: it is being used by %d orders", count)
	}

	return s.db.Delete(&models.OrderType{}, id).Error
}

// GetNextSequenceNumber gets the next available sequence number for an order type
// Reuses freed numbers (finds gaps in the sequence)
func (s *OrderTypeService) GetNextSequenceNumber(orderTypeID uint) (int, error) {
	// Get the order type to check if it requires sequential numbering
	orderType, err := s.GetOrderType(orderTypeID)
	if err != nil {
		return 0, err
	}

	if !orderType.RequiresSequentialNumber {
		return 0, fmt.Errorf("order type '%s' does not require sequential numbering", orderType.Name)
	}

	// Find the smallest unused number (to reuse freed numbers)
	// Only consider ACTIVE orders (pending, preparing, ready, delivered)
	// Freed numbers from paid/cancelled orders will be reused
	var result struct {
		NextNumber int
	}

	// CRITICAL FIX: Query to find gaps in sequence or next number
	// Only considers ACTIVE orders (pending, preparing, ready, delivered)
	// Numbers are freed ONLY when orders are paid or cancelled
	err = s.db.Raw(`
		WITH active_orders AS (
			SELECT sequence_number
			FROM orders
			WHERE order_type_id = ?
				AND sequence_number IS NOT NULL
				AND status IN ('pending', 'preparing', 'ready', 'delivered')
		),
		numbers AS (
			SELECT COALESCE(MAX(sequence_number), 0) + 1 as max_num
			FROM active_orders
		),
		gaps AS (
			SELECT t1.sequence_number + 1 as gap_start
			FROM active_orders t1
			WHERE NOT EXISTS (
				SELECT 1 FROM active_orders t2
				WHERE t2.sequence_number = t1.sequence_number + 1
			)
			ORDER BY t1.sequence_number
			LIMIT 1
		)
		SELECT COALESCE(
			(SELECT gap_start FROM gaps WHERE gap_start < (SELECT max_num FROM numbers)),
			(SELECT max_num FROM numbers)
		) as next_number
	`, orderTypeID).Scan(&result).Error

	if err != nil {
		return 0, err
	}

	// If no result, start from 1
	if result.NextNumber == 0 {
		result.NextNumber = 1
	}

	return result.NextNumber, nil
}

// getNextSequenceNumberWithLock gets the next sequence number within a transaction with row-level locking
// This prevents race conditions when multiple orders are created simultaneously
func (s *OrderTypeService) getNextSequenceNumberWithLock(tx *gorm.DB, orderTypeID uint) (int, error) {
	// Get the order type and lock the row to prevent concurrent access
	var orderType models.OrderType
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&orderType, orderTypeID).Error
	if err != nil {
		return 0, err
	}

	if !orderType.RequiresSequentialNumber {
		return 0, fmt.Errorf("order type '%s' does not require sequential numbering", orderType.Name)
	}

	// Find the smallest unused number (to reuse freed numbers)
	var result struct {
		NextNumber int
	}

	// CRITICAL FIX: Query with FOR UPDATE to lock the rows being read
	// Only considers ACTIVE orders (pending, preparing, ready, delivered)
	// Numbers are freed ONLY when orders are paid or cancelled
	err = tx.Raw(`
		WITH active_orders AS (
			SELECT sequence_number
			FROM orders
			WHERE order_type_id = ?
				AND sequence_number IS NOT NULL
				AND status IN ('pending', 'preparing', 'ready', 'delivered')
			FOR UPDATE
		),
		numbers AS (
			SELECT COALESCE(MAX(sequence_number), 0) + 1 as max_num
			FROM active_orders
		),
		gaps AS (
			SELECT t1.sequence_number + 1 as gap_start
			FROM active_orders t1
			WHERE NOT EXISTS (
				SELECT 1 FROM active_orders t2
				WHERE t2.sequence_number = t1.sequence_number + 1
			)
			ORDER BY t1.sequence_number
			LIMIT 1
		)
		SELECT COALESCE(
			(SELECT gap_start FROM gaps WHERE gap_start < (SELECT max_num FROM numbers)),
			(SELECT max_num FROM numbers)
		) as next_number
	`, orderTypeID).Scan(&result).Error

	if err != nil {
		return 0, err
	}

	// If no result, start from 1
	if result.NextNumber == 0 {
		result.NextNumber = 1
	}

	return result.NextNumber, nil
}

// ReorderOrderTypes updates the display order of multiple order types
func (s *OrderTypeService) ReorderOrderTypes(orderTypeIDs []uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for i, id := range orderTypeIDs {
			if err := tx.Model(&models.OrderType{}).Where("id = ?", id).Update("display_order", i).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
