package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// OrderService handles order operations
type OrderService struct {
	db         *gorm.DB
	localDB    *database.LocalDB
	productSvc *ProductService
	printerSvc *PrinterService
}

// NewOrderService creates a new order service
func NewOrderService() *OrderService {
	return &OrderService{
		db:         database.GetDB(),
		localDB:    database.GetLocalDB(),
		productSvc: NewProductService(),
		printerSvc: NewPrinterService(),
	}
}

// CreateOrder creates a new order
func (s *OrderService) CreateOrder(order *models.Order) (*models.Order, error) {
	// Generate order number
	order.OrderNumber = s.generateOrderNumber()
	order.Status = models.OrderStatusPending
	order.IsSynced = false

	// Calculate totals
	if err := s.calculateOrderTotals(order); err != nil {
		return nil, err
	}

	// Check if online or offline
	if s.localDB.IsOfflineMode() {
		// Save locally
		if err := s.localDB.SaveOrder(order); err != nil {
			return nil, err
		}
		return order, nil
	}

	// Save to main database
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Create order
		if err := tx.Create(order).Error; err != nil {
			return err
		}

		// Update table status to occupied if this is a dine-in order
		if order.TableID != nil && *order.TableID > 0 {
			if err := tx.Model(&models.Table{}).
				Where("id = ?", *order.TableID).
				Update("status", "occupied").Error; err != nil {
				return err
			}
		}

		// Update inventory for each item
		for _, item := range order.Items {
			if err := s.updateInventory(tx, item.ProductID, -item.Quantity,
				fmt.Sprintf("Sale - Order %s", order.OrderNumber), 0); err != nil {
				return err
			}
		}

		// Send to kitchen if configured
		if order.Source == "pos" || order.Source == "waiter_app" {
			go s.sendToKitchen(order)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Reload order with all relationships
	return s.GetOrder(order.ID)
}

// UpdateOrder updates an existing order
func (s *OrderService) UpdateOrder(order *models.Order) error {
	// Recalculate totals
	if err := s.calculateOrderTotals(order); err != nil {
		return err
	}

	if s.localDB.IsOfflineMode() {
		return s.localDB.SaveOrder(order)
	}

	return s.db.Save(order).Error
}

// GetOrder gets an order by ID
func (s *OrderService) GetOrder(id uint) (*models.Order, error) {
	var order models.Order

	err := s.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("Employee").
		First(&order, id).Error

	return &order, err
}

// GetOrderByNumber gets an order by order number
func (s *OrderService) GetOrderByNumber(orderNumber string) (*models.Order, error) {
	var order models.Order

	err := s.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Where("order_number = ?", orderNumber).
		First(&order).Error

	return &order, err
}

// GetPendingOrders gets all pending orders
func (s *OrderService) GetPendingOrders() ([]models.Order, error) {
	var orders []models.Order

	// Check if offline
	if s.localDB.IsOfflineMode() {
		return s.getLocalPendingOrders()
	}

	err := s.db.Preload("Items.Product").
		Preload("Table").
		Preload("Customer").
		Where("status IN ?", []models.OrderStatus{
			models.OrderStatusPending,
			models.OrderStatusPreparing,
			models.OrderStatusReady,
		}).
		Order("created_at ASC").
		Find(&orders).Error

	return orders, err
}

// GetOrdersByTable gets orders for a specific table
func (s *OrderService) GetOrdersByTable(tableID uint) ([]models.Order, error) {
	var orders []models.Order

	err := s.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("Employee").
		Where("table_id = ? AND status NOT IN ?", tableID, []models.OrderStatus{
			models.OrderStatusPaid,
			models.OrderStatusCancelled,
		}).
		Order("created_at DESC").
		Find(&orders).Error

	return orders, err
}

// GetOrdersByStatus gets orders by status
func (s *OrderService) GetOrdersByStatus(status models.OrderStatus) ([]models.Order, error) {
	var orders []models.Order

	err := s.db.Preload("Items.Product").
		Preload("Table").
		Where("status = ?", status).
		Order("created_at ASC").
		Find(&orders).Error

	return orders, err
}

// UpdateOrderStatus updates order status
func (s *OrderService) UpdateOrderStatus(orderID uint, status models.OrderStatus) error {
	order := &models.Order{}
	if err := s.db.First(order, orderID).Error; err != nil {
		return err
	}

	order.Status = status

	// If order is ready, notify
	if status == models.OrderStatusReady {
		// Send notification through WebSocket
		s.notifyOrderReady(order)
	}

	return s.db.Save(order).Error
}

// AddItemToOrder adds an item to an order
func (s *OrderService) AddItemToOrder(orderID uint, item *models.OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get order
		var order models.Order
		if err := tx.First(&order, orderID).Error; err != nil {
			return err
		}

		// Add item
		item.OrderID = orderID
		if err := tx.Create(item).Error; err != nil {
			return err
		}

		// Update order totals
		s.calculateOrderTotals(&order)

		// Update inventory
		if err := s.updateInventory(tx, item.ProductID, -item.Quantity,
			fmt.Sprintf("Added to order %s", order.OrderNumber), 0); err != nil {
			return err
		}

		// Send to kitchen if needed
		if !item.SentToKitchen {
			go s.sendItemToKitchen(&order, item)
		}

		return tx.Save(&order).Error
	})
}

// RemoveItemFromOrder removes an item from an order
func (s *OrderService) RemoveItemFromOrder(orderID uint, itemID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get item
		var item models.OrderItem
		if err := tx.First(&item, itemID).Error; err != nil {
			return err
		}

		// Return inventory
		if err := s.updateInventory(tx, item.ProductID, item.Quantity,
			fmt.Sprintf("Removed from order"), 0); err != nil {
			return err
		}

		// Delete item
		if err := tx.Delete(&item).Error; err != nil {
			return err
		}

		// Update order totals
		var order models.Order
		if err := tx.Preload("Items").First(&order, orderID).Error; err != nil {
			return err
		}

		s.calculateOrderTotals(&order)
		return tx.Save(&order).Error
	})
}

// CancelOrder cancels an order
func (s *OrderService) CancelOrder(orderID uint, reason string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get order with items
		var order models.Order
		if err := tx.Preload("Items").First(&order, orderID).Error; err != nil {
			return err
		}

		// Return inventory for all items
		for _, item := range order.Items {
			if err := s.updateInventory(tx, item.ProductID, item.Quantity,
				fmt.Sprintf("Order %s cancelled", order.OrderNumber), 0); err != nil {
				return err
			}
		}

		// Update order status
		order.Status = models.OrderStatusCancelled
		order.Notes = fmt.Sprintf("Cancelled: %s", reason)

		return tx.Save(&order).Error
	})
}

// Table Management

// GetTables gets all tables
func (s *OrderService) GetTables() ([]models.Table, error) {
	var tables []models.Table

	// Try main database first
	if !s.localDB.IsOfflineMode() {
		err := s.db.Where("is_active = ?", true).
			Order("zone, number").
			Find(&tables).Error

		if err == nil {
			// Get current orders for each table
			for i := range tables {
				s.db.Where("table_id = ? AND status NOT IN ?", tables[i].ID,
					[]models.OrderStatus{models.OrderStatusPaid, models.OrderStatusCancelled}).
					First(&tables[i].CurrentOrder)
			}

			// Cache tables
			s.cacheTables(tables)
			return tables, nil
		}
	}

	// Fallback to local cache
	return s.getTablesFromCache()
}

// GetTable gets a specific table
func (s *OrderService) GetTable(id uint) (*models.Table, error) {
	var table models.Table

	err := s.db.First(&table, id).Error
	if err != nil {
		return nil, err
	}

	// Get current order
	s.db.Where("table_id = ? AND status NOT IN ?", id,
		[]models.OrderStatus{models.OrderStatusPaid, models.OrderStatusCancelled}).
		First(&table.CurrentOrder)

	return &table, nil
}

// CreateTable creates a new table
func (s *OrderService) CreateTable(table *models.Table) error {
	return s.db.Create(table).Error
}

// UpdateTable updates a table
func (s *OrderService) UpdateTable(table *models.Table) error {
	return s.db.Save(table).Error
}

// UpdateTableStatus updates table status
func (s *OrderService) UpdateTableStatus(tableID uint, status string) error {
	return s.db.Model(&models.Table{}).Where("id = ?", tableID).Update("status", status).Error
}

// AssignOrderToTable assigns an order to a table
func (s *OrderService) AssignOrderToTable(orderID uint, tableID uint) error {
	// Update order
	if err := s.db.Model(&models.Order{}).Where("id = ?", orderID).Update("table_id", tableID).Error; err != nil {
		return err
	}

	// Update table status
	return s.UpdateTableStatus(tableID, "occupied")
}

// DeleteTable soft deletes a table
func (s *OrderService) DeleteTable(id uint) error {
	return s.db.Delete(&models.Table{}, id).Error
}

// Helper methods

func (s *OrderService) generateOrderNumber() string {
	// Generate order number based on timestamp and random suffix
	timestamp := time.Now().Format("20060102150405")
	return fmt.Sprintf("ORD-%s", timestamp)
}

func (s *OrderService) calculateOrderTotals(order *models.Order) error {
	var subtotal float64

	// Calculate items subtotal
	for i := range order.Items {
		item := &order.Items[i]

		// Get product price if not set
		if item.UnitPrice == 0 {
			var product models.Product
			if err := s.db.First(&product, item.ProductID).Error; err != nil {
				return err
			}
			item.UnitPrice = product.Price
		}

		// Calculate item subtotal
		item.Subtotal = item.UnitPrice * float64(item.Quantity)

		// Add modifiers price changes
		for _, modifier := range item.Modifiers {
			item.Subtotal += modifier.PriceChange * float64(item.Quantity)
		}

		subtotal += item.Subtotal
	}

	order.Subtotal = subtotal

	// Calculate tax (if not included in price)
	var config models.RestaurantConfig
	err := s.db.First(&config).Error

	// Use default tax rate if config doesn't exist
	taxRate := config.DefaultTaxRate
	if err != nil || taxRate == 0 {
		taxRate = 19.0 // Default 19% tax rate for Colombia
	}

	if !config.TaxIncludedInPrice {
		order.Tax = subtotal * (taxRate / 100)
	} else {
		// Tax is already included, calculate base
		order.Tax = subtotal - (subtotal / (1 + taxRate/100))
	}

	// Calculate total
	order.Total = order.Subtotal + order.Tax - order.Discount

	return nil
}

func (s *OrderService) updateInventory(tx *gorm.DB, productID uint, quantity int, reference string, employeeID uint) error {
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
	var empID *uint
	if employeeID > 0 {
		empID = &employeeID
	}
	movement := models.InventoryMovement{
		ProductID:   productID,
		Type:        "sale",
		Quantity:    quantity,
		PreviousQty: previousStock,
		NewQty:      product.Stock,
		Reference:   reference,
		EmployeeID:  empID,
	}

	return tx.Create(&movement).Error
}

func (s *OrderService) sendToKitchen(order *models.Order) {
	// Send to kitchen display via WebSocket
	// This will be implemented with WebSocket service

	// Check if kitchen printing is enabled in printer config
	var printerConfig models.PrinterConfig
	if err := s.db.Where("is_default = ?", true).First(&printerConfig).Error; err == nil {
		// Only print kitchen ticket if configured to do so
		if printerConfig.PrintKitchenCopy {
			s.printerSvc.PrintKitchenOrder(order)
		}
	}
}

func (s *OrderService) sendItemToKitchen(order *models.Order, item *models.OrderItem) {
	// Mark as sent
	now := time.Now()
	item.SentToKitchen = true
	item.SentToKitchenAt = &now
	s.db.Save(item)

	// Send via WebSocket
	// This will be implemented with WebSocket service
}

func (s *OrderService) notifyOrderReady(order *models.Order) {
	// Send notification via WebSocket
	// This will be implemented with WebSocket service
}

// Local cache methods

func (s *OrderService) getLocalPendingOrders() ([]models.Order, error) {
	var localOrders []database.LocalOrder
	if err := s.localDB.GetDB().Where("status IN ?", []string{"pending", "preparing", "ready"}).
		Find(&localOrders).Error; err != nil {
		return nil, err
	}

	var orders []models.Order
	for _, lo := range localOrders {
		var order models.Order
		if err := json.Unmarshal([]byte(lo.OrderData), &order); err != nil {
			continue
		}
		orders = append(orders, order)
	}

	return orders, nil
}

func (s *OrderService) cacheTables(tables []models.Table) {
	if s.localDB == nil {
		return
	}

	for _, table := range tables {
		tableData, _ := json.Marshal(table)
		localTable := database.LocalTable{
			ID:         table.ID,
			TableData:  string(tableData),
			LastSynced: time.Now(),
		}

		s.localDB.GetDB().Save(&localTable)
	}
}

func (s *OrderService) getTablesFromCache() ([]models.Table, error) {
	var localTables []database.LocalTable
	if err := s.localDB.GetDB().Find(&localTables).Error; err != nil {
		return nil, err
	}

	var tables []models.Table
	for _, lt := range localTables {
		var table models.Table
		if err := json.Unmarshal([]byte(lt.TableData), &table); err != nil {
			continue
		}
		tables = append(tables, table)
	}

	return tables, nil
}

// GetTodayOrders gets all orders from today (excluding paid orders which are now sales)
func (s *OrderService) GetTodayOrders() ([]models.Order, error) {
	var orders []models.Order

	today := time.Now().Format("2006-01-02")

	err := s.db.Preload("Items.Product").
		Preload("Customer").
		Preload("Table").
		Where("DATE(created_at) = ? AND status != ?", today, models.OrderStatusPaid).
		Order("created_at DESC").
		Find(&orders).Error

	return orders, err
}

// GetOrdersByDateRange gets orders within a date range
func (s *OrderService) GetOrdersByDateRange(startDate, endDate time.Time) ([]models.Order, error) {
	var orders []models.Order

	err := s.db.Preload("Items.Product").
		Preload("Customer").
		Where("created_at BETWEEN ? AND ?", startDate, endDate).
		Order("created_at DESC").
		Find(&orders).Error

	return orders, err
}

// Table Areas Management

// GetTableAreas gets all table areas
func (s *OrderService) GetTableAreas() ([]models.TableArea, error) {
	var areas []models.TableArea
	err := s.db.Where("is_active = ?", true).Order("name").Find(&areas).Error
	return areas, err
}

// CreateTableArea creates a new table area
func (s *OrderService) CreateTableArea(area *models.TableArea) error {
	return s.db.Create(area).Error
}

// UpdateTableArea updates a table area
func (s *OrderService) UpdateTableArea(area *models.TableArea) error {
	return s.db.Save(area).Error
}

// DeleteTableArea soft deletes a table area
func (s *OrderService) DeleteTableArea(id uint) error {
	return s.db.Delete(&models.TableArea{}, id).Error
}
