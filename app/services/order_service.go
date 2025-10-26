package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"PosApp/app/websocket"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// OrderService handles order operations
type OrderService struct {
	db         *gorm.DB
	localDB    *database.LocalDB
	productSvc *ProductService
	printerSvc *PrinterService
	wsServer   *websocket.Server
}

// NewOrderService creates a new order service
func NewOrderService() *OrderService {
	return &OrderService{
		db:         database.GetDB(),
		localDB:    database.GetLocalDB(),
		productSvc: NewProductService(),
		printerSvc: NewPrinterService(),
		wsServer:   nil, // Will be set later
	}
}

// SetWebSocketServer sets the WebSocket server instance
func (s *OrderService) SetWebSocketServer(server *websocket.Server) {
	log.Printf("OrderService: Setting WebSocket server (server=%v)", server != nil)
	s.wsServer = server
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

	// Get existing order to preserve order_number and other fields
	var existingOrder models.Order
	if err := s.db.Preload("Items").First(&existingOrder, order.ID).Error; err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Preserve critical fields
	order.OrderNumber = existingOrder.OrderNumber
	order.CreatedAt = existingOrder.CreatedAt

	// Use transaction to update order and items
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Delete existing items
		if err := tx.Where("order_id = ?", order.ID).Delete(&models.OrderItem{}).Error; err != nil {
			return fmt.Errorf("failed to delete existing items: %w", err)
		}

		// Set order_id for all new items
		for i := range order.Items {
			order.Items[i].OrderID = order.ID
			order.Items[i].ID = 0 // Ensure new items are created
		}

		// Update order (without items first)
		if err := tx.Model(&models.Order{}).Where("id = ?", order.ID).Updates(map[string]interface{}{
			"type":        order.Type,
			"status":      order.Status,
			"table_id":    order.TableID,
			"customer_id": order.CustomerID,
			"employee_id": order.EmployeeID,
			"subtotal":    order.Subtotal,
			"tax":         order.Tax,
			"discount":    order.Discount,
			"total":       order.Total,
			"notes":       order.Notes,
			"source":      order.Source,
		}).Error; err != nil {
			return fmt.Errorf("failed to update order: %w", err)
		}

		// Create new items
		for i := range order.Items {
			if err := tx.Create(&order.Items[i]).Error; err != nil {
				return fmt.Errorf("failed to create item: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		return err
	}

	// Check if order has unsent items and send to kitchen
	hasUnsentItems := false
	for _, item := range order.Items {
		if !item.SentToKitchen {
			hasUnsentItems = true
			break
		}
	}

	if order.Status == models.OrderStatusPending && hasUnsentItems {
		go s.sendToKitchen(order)
	}

	return nil
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
	err := s.db.Transaction(func(tx *gorm.DB) error {
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

	if err != nil {
		return err
	}

	// Notify kitchen about cancellation via WebSocket
	if s.wsServer != nil {
		data := map[string]interface{}{
			"order_id": fmt.Sprintf("%d", orderID),
			"status":   "cancelled",
		}
		dataJSON, _ := json.Marshal(data)

		message := websocket.Message{
			Type:      websocket.TypeOrderUpdate,
			Timestamp: time.Now(),
			Data:      dataJSON,
		}
		s.wsServer.BroadcastToKitchen(message)
		log.Printf("OrderService: Cancellation notification sent to kitchen for order ID %d", orderID)
	}

	return nil
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
	log.Printf("OrderService: Sending order %s to kitchen", order.OrderNumber)

	// Send to kitchen display via WebSocket
	if s.wsServer != nil {
		// Preload all relationships
		var fullOrder models.Order
		if err := s.db.Preload("Items.Product").Preload("Table").First(&fullOrder, order.ID).Error; err != nil {
			log.Printf("OrderService: Error loading order details: %v", err)
			return
		}

		// Create WebSocket message
		message := websocket.Message{
			Type:      websocket.TypeKitchenOrder,
			Timestamp: time.Now(),
		}

		// Serialize order data
		orderData, err := json.Marshal(fullOrder)
		if err != nil {
			log.Printf("OrderService: Error marshaling order: %v", err)
			return
		}
		message.Data = orderData

		// Broadcast to kitchen clients
		s.wsServer.BroadcastToKitchen(message)
		log.Printf("OrderService: Order %s sent to kitchen successfully", order.OrderNumber)

		// Mark all items as sent to kitchen
		now := time.Now()
		for i := range fullOrder.Items {
			if !fullOrder.Items[i].SentToKitchen {
				fullOrder.Items[i].SentToKitchen = true
				fullOrder.Items[i].SentToKitchenAt = &now
				if err := s.db.Save(&fullOrder.Items[i]).Error; err != nil {
					log.Printf("OrderService: Error marking item %d as sent: %v", fullOrder.Items[i].ID, err)
				}
			}
		}
		log.Printf("OrderService: Marked %d items as sent to kitchen", len(fullOrder.Items))
	} else {
		log.Println("OrderService: WebSocket server not initialized, skipping kitchen notification")
	}

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

	log.Printf("OrderService: Sending item %d from order %s to kitchen", item.ID, order.OrderNumber)

	// Send via WebSocket
	if s.wsServer != nil {
		// Preload product
		s.db.Preload("Product").First(item, item.ID)

		message := websocket.Message{
			Type:      websocket.TypeKitchenOrder,
			Timestamp: time.Now(),
		}

		itemData, err := json.Marshal(map[string]interface{}{
			"order_id":     order.ID,
			"order_number": order.OrderNumber,
			"item":         item,
			"type":         "single_item",
		})
		if err != nil {
			log.Printf("OrderService: Error marshaling item: %v", err)
			return
		}
		message.Data = itemData

		s.wsServer.BroadcastToKitchen(message)
	}
}

func (s *OrderService) notifyOrderReady(order *models.Order) {
	log.Printf("OrderService: Notifying that order %s is ready", order.OrderNumber)

	// Send notification via WebSocket to POS and waiter apps
	if s.wsServer != nil {
		message := websocket.Message{
			Type:      websocket.TypeNotification,
			Timestamp: time.Now(),
		}

		notificationData, err := json.Marshal(map[string]interface{}{
			"type":         "order_ready",
			"order_id":     order.ID,
			"order_number": order.OrderNumber,
			"message":      fmt.Sprintf("Order %s is ready", order.OrderNumber),
		})
		if err != nil {
			log.Printf("OrderService: Error marshaling notification: %v", err)
			return
		}
		message.Data = notificationData

		// Broadcast to all clients (POS and waiters)
		s.wsServer.BroadcastMessage(message)
	}
}

// SendToKitchen manually sends an order to kitchen (can be called from UI to resend)
func (s *OrderService) SendToKitchen(orderID uint) error {
	var order models.Order
	if err := s.db.Preload("Items.Product").Preload("Table").First(&order, orderID).Error; err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	s.sendToKitchen(&order)
	return nil
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

// DeleteOrder permanently deletes an order and updates table status
func (s *OrderService) DeleteOrder(orderID uint) error {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Get order to check table ID
		var order models.Order
		if err := tx.First(&order, orderID).Error; err != nil {
			return fmt.Errorf("order not found: %w", err)
		}

		tableID := order.TableID

		// Delete order items first
		if err := tx.Where("order_id = ?", orderID).Delete(&models.OrderItem{}).Error; err != nil {
			return fmt.Errorf("failed to delete order items: %w", err)
		}

		// Delete the order
		if err := tx.Delete(&order).Error; err != nil {
			return fmt.Errorf("failed to delete order: %w", err)
		}

		// If order had a table, check if table should be marked as available
		if tableID != nil {
			var count int64
			tx.Model(&models.Order{}).Where("table_id = ? AND status = ?", *tableID, models.OrderStatusPending).Count(&count)

			// If no more pending orders, mark table as available
			if count == 0 {
				if err := tx.Model(&models.Table{}).Where("id = ?", *tableID).Update("status", "available").Error; err != nil {
					log.Printf("Warning: Failed to update table status after deleting order: %v", err)
				} else {
					log.Printf("Table %d marked as available after deleting last pending order", *tableID)
				}
			}
		}

		log.Printf("Order %d deleted successfully", orderID)
		return nil
	})

	if err != nil {
		return err
	}

	// Notify kitchen about deletion via WebSocket
	if s.wsServer != nil {
		data := map[string]interface{}{
			"order_id": fmt.Sprintf("%d", orderID),
			"status":   "cancelled",
		}
		dataJSON, _ := json.Marshal(data)

		message := websocket.Message{
			Type:      websocket.TypeOrderUpdate,
			Timestamp: time.Now(),
			Data:      dataJSON,
		}
		s.wsServer.BroadcastToKitchen(message)
		log.Printf("OrderService: Deletion notification sent to kitchen for order ID %d", orderID)
	}

	return nil
}
