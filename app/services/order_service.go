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
	db            *gorm.DB
	localDB       *database.LocalDB
	productSvc    *ProductService
	printerSvc    *PrinterService
	ingredientSvc *IngredientService
	orderTypeSvc  *OrderTypeService
	wsServer      *websocket.Server
}

// NewOrderService creates a new order service
func NewOrderService() *OrderService {
	return &OrderService{
		db:            database.GetDB(),
		localDB:       database.GetLocalDB(),
		productSvc:    NewProductService(),
		printerSvc:    NewPrinterService(),
		ingredientSvc: NewIngredientService(),
		orderTypeSvc:  NewOrderTypeService(),
		wsServer:      nil, // Will be set later
	}
}

// SetWebSocketServer sets the WebSocket server instance
func (s *OrderService) SetWebSocketServer(server *websocket.Server) {
	log.Printf("OrderService: Setting WebSocket server (server=%v)", server != nil)
	s.wsServer = server
}

// CreateOrder creates a new order
func (s *OrderService) CreateOrder(order *models.Order) (*models.Order, error) {
	// LOG: Input data
	log.Printf("\n🔵 ========== CREATE ORDER ==========")
	log.Printf("Type (deprecated): %s", order.Type)
	if order.OrderTypeID != nil {
		log.Printf("OrderTypeID: %d", *order.OrderTypeID)
	} else {
		log.Printf("OrderTypeID: nil")
	}
	log.Printf("=====================================\n")

	// Generate order number
	order.OrderNumber = s.generateOrderNumber()
	order.Status = models.OrderStatusPending
	order.IsSynced = false

	// Assign sequence number if the order type requires it
	if order.OrderTypeID != nil && *order.OrderTypeID > 0 {
		orderType, err := s.orderTypeSvc.GetOrderType(*order.OrderTypeID)
		if err == nil && orderType.RequiresSequentialNumber {
			nextNumber, err := s.orderTypeSvc.GetNextSequenceNumber(*order.OrderTypeID)
			if err != nil {
				log.Printf("Error getting next sequence number for order type %d: %v", *order.OrderTypeID, err)
			} else {
				order.SequenceNumber = &nextNumber
				log.Printf("✅ Assigned sequence number %d to order type '%s'", nextNumber, orderType.Name)
			}
		}
	}

	// DEPRECATED: Legacy support for old takeout number system
	// This can be removed after migration is complete
	if order.Type == "takeout" && order.SequenceNumber == nil {
		nextNumber, err := s.getNextAvailableTakeoutNumber()
		if err != nil {
			log.Printf("Error getting next takeout number: %v", err)
		} else {
			order.TakeoutNumber = &nextNumber
		}
	}

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

		// LOG: Verify order was saved with order_type_id
		log.Printf("✅ Order created with ID: %d, OrderTypeID: %v", order.ID, order.OrderTypeID)

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

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Deduct ingredients (happens outside transaction, warnings only)
	ingredientWarnings := s.ingredientSvc.DeductIngredientsForOrder(order.Items)
	if len(ingredientWarnings) > 0 {
		log.Printf("⚠️ Ingredient warnings for order %s:", order.OrderNumber)
		for _, warning := range ingredientWarnings {
			log.Println(warning)
		}
	}

	// Reload order with all relationships
	reloadedOrder, err := s.GetOrder(order.ID)
	if err != nil {
		return nil, err
	}

	// Send to kitchen AFTER transaction is complete and order is reloaded
	if order.Source == "pos" || order.Source == "waiter_app" {
		go s.sendToKitchen(reloadedOrder)
	}

	return reloadedOrder, nil
}

// UpdateOrder updates an existing order
func (s *OrderService) UpdateOrder(order *models.Order) (*models.Order, error) {
	log.Printf("UpdateOrder: Received order ID=%d with %d items", order.ID, len(order.Items))
	for i, item := range order.Items {
		log.Printf("  Item %d: ProductID=%d, Quantity=%d, UnitPrice=%.2f, Modifiers=%d",
			i, item.ProductID, item.Quantity, item.UnitPrice, len(item.Modifiers))
	}

	// Recalculate totals
	if err := s.calculateOrderTotals(order); err != nil {
		return nil, err
	}

	if s.localDB.IsOfflineMode() {
		if err := s.localDB.SaveOrder(order); err != nil {
			return nil, err
		}
		return order, nil
	}

	// Get existing order to preserve order_number and other fields
	var existingOrder models.Order
	if err := s.db.Preload("Items").First(&existingOrder, order.ID).Error; err != nil {
		return nil, fmt.Errorf("order not found: %w", err)
	}

	log.Printf("UpdateOrder: Existing order has %d items", len(existingOrder.Items))

	// Preserve critical fields
	order.OrderNumber = existingOrder.OrderNumber
	order.CreatedAt = existingOrder.CreatedAt
	// Preserve status if incoming status is empty (frontend doesn't send status on update)
	if order.Status == "" {
		order.Status = existingOrder.Status
		log.Printf("UpdateOrder: Preserving existing status: %s", existingOrder.Status)
	}

	// Use transaction to update order and items
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// First, get all existing order item IDs
		var existingItemIDs []uint
		if err := tx.Model(&models.OrderItem{}).Where("order_id = ?", order.ID).Pluck("id", &existingItemIDs).Error; err != nil {
			return fmt.Errorf("failed to get existing item IDs: %w", err)
		}

		// Delete order_item_modifiers first (to avoid foreign key constraint)
		if len(existingItemIDs) > 0 {
			if err := tx.Where("order_item_id IN ?", existingItemIDs).Delete(&models.OrderItemModifier{}).Error; err != nil {
				return fmt.Errorf("failed to delete existing item modifiers: %w", err)
			}
		}

		// Now delete existing items
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
			"type":          order.Type,
			"status":        order.Status,
			"order_type_id": order.OrderTypeID,
			"table_id":      order.TableID,
			"customer_id":   order.CustomerID,
			"employee_id":   order.EmployeeID,
			"subtotal":      order.Subtotal,
			"tax":           order.Tax,
			"discount":      order.Discount,
			"total":         order.Total,
			"notes":         order.Notes,
			"source":        order.Source,
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
		return nil, err
	}

	// Reload the order with all relationships to return complete data
	updatedOrder, err := s.GetOrder(order.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to reload order: %w", err)
	}

	// Send to kitchen for any active order (pending, preparing, or ready)
	// This ensures modifiers and other changes are reflected in kitchen display
	if updatedOrder.Status == models.OrderStatusPending ||
	   updatedOrder.Status == models.OrderStatusPreparing ||
	   updatedOrder.Status == models.OrderStatusReady {
		go s.sendToKitchen(updatedOrder)
	}

	log.Printf("✅ UpdateOrder completed successfully for order ID=%d with %d items", updatedOrder.ID, len(updatedOrder.Items))
	return updatedOrder, nil
}

// GetOrder gets an order by ID
func (s *OrderService) GetOrder(id uint) (*models.Order, error) {
	var order models.Order

	err := s.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("Employee").
		Preload("OrderType").
		First(&order, id).Error

	// LOG: Verify OrderType was loaded
	log.Printf("🔍 GetOrder ID=%d: OrderTypeID=%v, OrderType=%v",
		id,
		order.OrderTypeID,
		func() string {
			if order.OrderType != nil {
				return order.OrderType.Name
			}
			return "nil"
		}())

	return &order, err
}

// GetOrderByNumber gets an order by order number
func (s *OrderService) GetOrderByNumber(orderNumber string) (*models.Order, error) {
	var order models.Order

	err := s.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("OrderType").
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
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("OrderType").
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
		Preload("OrderType").
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
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		Preload("Customer").
		Preload("Employee").
		Preload("OrderType").
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

// getNextAvailableTakeoutNumber finds the next available takeout number
// It reuses freed numbers (when orders are completed) instead of continuing sequence
func (s *OrderService) getNextAvailableTakeoutNumber() (int, error) {
	// Get all active takeout orders (not paid or cancelled)
	var activeOrders []models.Order
	err := s.db.Select("takeout_number").
		Where("type = ? AND status IN ? AND takeout_number IS NOT NULL",
			"takeout",
			[]models.OrderStatus{models.OrderStatusPending, models.OrderStatusPreparing, models.OrderStatusReady}).
		Order("takeout_number ASC").
		Find(&activeOrders).Error

	if err != nil {
		return 0, err
	}

	// If no active orders, start from 1
	if len(activeOrders) == 0 {
		return 1, nil
	}

	// Build map of used numbers
	usedNumbers := make(map[int]bool)
	maxNumber := 0

	for _, order := range activeOrders {
		if order.TakeoutNumber != nil {
			num := *order.TakeoutNumber
			usedNumbers[num] = true
			if num > maxNumber {
				maxNumber = num
			}
		}
	}

	// Find first available number starting from 1
	for i := 1; i <= maxNumber; i++ {
		if !usedNumbers[i] {
			return i, nil
		}
	}

	// If all numbers 1 to maxNumber are used, return maxNumber + 1
	return maxNumber + 1, nil
}

func (s *OrderService) calculateOrderTotals(order *models.Order) error {
	var subtotal float64
	var totalTax float64

	// Get restaurant config to check if tax is included in price
	var config models.RestaurantConfig
	err := s.db.First(&config).Error
	taxIncludedInPrice := false
	if err == nil {
		taxIncludedInPrice = config.TaxIncludedInPrice
	}

	// Calculate items subtotal and tax per product
	for i := range order.Items {
		item := &order.Items[i]

		// Get product to determine tax type
		var product models.Product
		if err := s.db.First(&product, item.ProductID).Error; err != nil {
			return err
		}

		// Get product price if not set
		if item.UnitPrice == 0 {
			item.UnitPrice = product.Price
		}

		// Calculate item subtotal
		item.Subtotal = item.UnitPrice * float64(item.Quantity)

		// Add modifiers price changes
		for _, modifier := range item.Modifiers {
			item.Subtotal += modifier.PriceChange * float64(item.Quantity)
		}

		subtotal += item.Subtotal

		// Calculate tax based on product tax_type_id
		// DIAN Tax Types: 1=IVA 19%, 5=IVA 0%, 6=IVA 5%
		var itemTaxRate float64
		switch product.TaxTypeID {
		case 1: // IVA 19%
			itemTaxRate = 19.0
		case 5: // IVA 0%
			itemTaxRate = 0.0
		case 6: // IVA 5%
			itemTaxRate = 5.0
		default:
			itemTaxRate = 0.0 // No tax by default
		}

		// Calculate item tax
		if !taxIncludedInPrice {
			// Tax not included: add tax on top
			totalTax += item.Subtotal * (itemTaxRate / 100)
		} else {
			// Tax included: extract tax from price
			if itemTaxRate > 0 {
				totalTax += item.Subtotal - (item.Subtotal / (1 + itemTaxRate/100))
			}
		}
	}

	order.Subtotal = subtotal
	order.Tax = totalTax

	// Calculate total
	if !taxIncludedInPrice {
		order.Total = order.Subtotal + order.Tax - order.Discount
	} else {
		// Tax already included in prices, so subtotal already contains tax
		order.Total = order.Subtotal - order.Discount
	}

	return nil
}

func (s *OrderService) updateInventory(tx *gorm.DB, productID uint, quantity int, reference string, employeeID uint) error {
	var product models.Product
	if err := tx.First(&product, productID).Error; err != nil {
		return err
	}

	// Skip inventory tracking if disabled for this product
	if !product.TrackInventory {
		return nil
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
		// Preload all relationships including modifiers
		var fullOrder models.Order
		if err := s.db.Preload("Items.Product").
			Preload("Items.Modifiers.Modifier").
			Preload("Table").
			Preload("OrderType").
			First(&fullOrder, order.ID).Error; err != nil {
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
		Preload("Items.Modifiers.Modifier").
		Preload("Customer").
		Preload("Table").
		Preload("Employee").
		Preload("OrderType").
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
	log.Printf("⚠️ DeleteOrder called for order ID=%d", orderID)
	log.Printf("⚠️ THIS SHOULD NOT BE CALLED DURING UPDATE!")

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Get order to check table ID
		var order models.Order
		if err := tx.First(&order, orderID).Error; err != nil {
			return fmt.Errorf("order not found: %w", err)
		}

		tableID := order.TableID

		// First, delete order item modifiers (they reference order_items)
		if err := tx.Where("order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)", orderID).
			Delete(&models.OrderItemModifier{}).Error; err != nil {
			return fmt.Errorf("failed to delete order item modifiers: %w", err)
		}

		// Then delete order items
		if err := tx.Where("order_id = ?", orderID).Delete(&models.OrderItem{}).Error; err != nil {
			return fmt.Errorf("failed to delete order items: %w", err)
		}

		// Finally delete the order
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
