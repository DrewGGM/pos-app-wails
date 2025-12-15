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
		productSvc:    NewProductService(),
		printerSvc:    NewPrinterService(),
		ingredientSvc: NewIngredientService(),
		orderTypeSvc:  NewOrderTypeService(),
		wsServer:      nil, // Will be set later
	}
}

// SetWebSocketServer sets the WebSocket server instance
func (s *OrderService) SetWebSocketServer(server *websocket.Server) {
	s.wsServer = server
}

// CreateOrder creates a new order
func (s *OrderService) CreateOrder(order *models.Order) (*models.Order, error) {
	// LOG: Input data
	if order.OrderTypeID != nil {
	} else {
	}

	// Generate order number
	order.OrderNumber = s.generateOrderNumber()
	order.Status = models.OrderStatusPending
	order.IsSynced = false

	// Validate order type requirements
	if order.OrderTypeID != nil && *order.OrderTypeID > 0 {
		orderType, err := s.orderTypeSvc.GetOrderType(*order.OrderTypeID)
		if err != nil {
			return nil, fmt.Errorf("invalid order type: %w", err)
		}

		// Check if this order type requires a table (e.g., dine-in)
		// Dine-in orders (code "dine_in" or similar) should have a table assigned
		if orderType.Code == "dine_in" || orderType.Code == "mesa" {
			if order.TableID == nil || *order.TableID == 0 {
				return nil, fmt.Errorf("order type '%s' requires a table assignment", orderType.Name)
			}
		}

		// Check if table is available
		if order.TableID != nil && *order.TableID > 0 {
			var table models.Table
			if err := s.db.First(&table, *order.TableID).Error; err != nil {
				return nil, fmt.Errorf("table not found: %w", err)
			}
			if !table.IsActive {
				return nil, fmt.Errorf("table '%s' is not active", table.Number)
			}
		}
	}

	// Calculate totals
	if err := s.calculateOrderTotals(order); err != nil {
		return nil, err
	}

	// Save to main database
	var ingredientWarnings []string
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Assign sequence number if the order type requires it (inside transaction with lock)
		if order.OrderTypeID != nil && *order.OrderTypeID > 0 {
			orderType, err := s.orderTypeSvc.GetOrderType(*order.OrderTypeID)
			if err == nil && orderType.RequiresSequentialNumber {
				nextNumber, err := s.orderTypeSvc.getNextSequenceNumberWithLock(tx, *order.OrderTypeID)
				if err != nil {
					log.Printf("Error getting next sequence number for order type %d: %v", *order.OrderTypeID, err)
				} else {
					order.SequenceNumber = &nextNumber
				}
			}
		}

		// Create order
		if err := tx.Create(order).Error; err != nil {
			return err
		}

		// LOG: Verify order was saved with order_type_id

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

		// Deduct ingredients (now inside transaction for atomicity)
		ingredientWarnings = s.ingredientSvc.DeductIngredientsInTransaction(tx, order.Items)

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Log ingredient warnings after successful transaction
	if len(ingredientWarnings) > 0 {
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
	// NOTE: "split" source is used for split bills - these should NOT be sent to kitchen
	// because the original order was already sent when it was first created
	if order.Source == "pos" || order.Source == "waiter_app" || order.Source == "pwa" {
		go s.sendToKitchen(reloadedOrder)
	}

	return reloadedOrder, nil
}

// UpdateOrder updates an existing order
func (s *OrderService) UpdateOrder(order *models.Order) (*models.Order, error) {
	for i, item := range order.Items {
		log.Printf("  Item %d: ProductID=%d, Quantity=%d, UnitPrice=%.2f, Modifiers=%d",
			i, item.ProductID, item.Quantity, item.UnitPrice, len(item.Modifiers))
	}

	// Recalculate totals
	if err := s.calculateOrderTotals(order); err != nil {
		return nil, err
	}

	// Get existing order to preserve order_number and other fields
	// Load with Items to restore inventory
	var existingOrder models.Order
	if err := s.db.Preload("Items").Preload("Table").First(&existingOrder, order.ID).Error; err != nil {
		return nil, fmt.Errorf("order not found: %w", err)
	}

	// CRITICAL FIX: Prevent updating paid or cancelled orders
	if existingOrder.Status == models.OrderStatusPaid {
		return nil, fmt.Errorf("cannot update paid order")
	}
	if existingOrder.Status == models.OrderStatusCancelled {
		return nil, fmt.Errorf("cannot update cancelled order")
	}

	// Preserve critical fields
	order.OrderNumber = existingOrder.OrderNumber
	order.CreatedAt = existingOrder.CreatedAt

	// Preserve status if incoming status is empty (frontend doesn't send status on update)
	if order.Status == "" {
		order.Status = existingOrder.Status
	} else if order.Status != existingOrder.Status {
		// Validate status transition if status is changing
		if !s.isValidStatusTransition(existingOrder.Status, order.Status) {
			return nil, fmt.Errorf("invalid status transition from '%s' to '%s'", existingOrder.Status, order.Status)
		}
	}

	// Use transaction to update order and items
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// CRITICAL FIX: Restore inventory for existing items BEFORE deleting them
		// This prevents inventory leaks when items are removed or modified
		if len(existingOrder.Items) > 0 {
			log.Printf("UpdateOrder: Restoring inventory for %d existing items", len(existingOrder.Items))

			// Restore product inventory
			for _, item := range existingOrder.Items {
				// Restore product stock (positive quantity = restore)
				if err := s.updateInventory(tx, item.ProductID, item.Quantity,
					fmt.Sprintf("Update - Order %s (item removed/modified)", order.OrderNumber), 0); err != nil {
					log.Printf("Warning: Failed to restore product inventory for item %d: %v", item.ID, err)
					// Continue despite error - don't fail the whole update
				}
			}

			// Restore ingredient stocks
			if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, existingOrder.Items); err != nil {
				log.Printf("Warning: Failed to restore ingredients: %v", err)
				// Continue despite error
			}
		}

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

		// CRITICAL FIX: Handle table status changes
		// If table changed, free the old table and occupy the new one
		oldTableID := existingOrder.TableID
		newTableID := order.TableID

		if oldTableID != nil && newTableID != nil && *oldTableID != *newTableID {
			// Table changed - free the old table
			log.Printf("UpdateOrder: Table changed from %d to %d, freeing old table", *oldTableID, *newTableID)
			if err := tx.Model(&models.Table{}).Where("id = ?", *oldTableID).Update("status", "available").Error; err != nil {
				log.Printf("Warning: Failed to free old table %d: %v", *oldTableID, err)
			}

			// Occupy the new table
			if err := tx.Model(&models.Table{}).Where("id = ?", *newTableID).Update("status", "occupied").Error; err != nil {
				return fmt.Errorf("failed to occupy new table: %w", err)
			}
		} else if oldTableID != nil && newTableID == nil {
			// Table removed - free the old table
			log.Printf("UpdateOrder: Table removed (was %d), freeing table", *oldTableID)
			if err := tx.Model(&models.Table{}).Where("id = ?", *oldTableID).Update("status", "available").Error; err != nil {
				log.Printf("Warning: Failed to free table %d: %v", *oldTableID, err)
			}
		} else if oldTableID == nil && newTableID != nil {
			// Table added - occupy the new table
			log.Printf("UpdateOrder: Table added (%d), occupying table", *newTableID)
			if err := tx.Model(&models.Table{}).Where("id = ?", *newTableID).Update("status", "occupied").Error; err != nil {
				return fmt.Errorf("failed to occupy table: %w", err)
			}
		}

		// Update order (without items first)
		if err := tx.Model(&models.Order{}).Where("id = ?", order.ID).Updates(map[string]interface{}{
			"type":                   order.Type,
			"status":                 order.Status,
			"order_type_id":          order.OrderTypeID,
			"table_id":               order.TableID,
			"customer_id":            order.CustomerID,
			"employee_id":            order.EmployeeID,
			"subtotal":               order.Subtotal,
			"tax":                    order.Tax,
			"discount":               order.Discount,
			"total":                  order.Total,
			"notes":                  order.Notes,
			"source":                 order.Source,
			"delivery_customer_name": order.DeliveryCustomerName,
			"delivery_address":       order.DeliveryAddress,
			"delivery_phone":         order.DeliveryPhone,
		}).Error; err != nil {
			return fmt.Errorf("failed to update order: %w", err)
		}

		// Set order_id for all new items
		for i := range order.Items {
			order.Items[i].OrderID = order.ID
			order.Items[i].ID = 0 // Ensure new items are created
		}

		// Create new items
		for i := range order.Items {
			if err := tx.Create(&order.Items[i]).Error; err != nil {
				return fmt.Errorf("failed to create item: %w", err)
			}
		}

		// Deduct inventory for new items
		for _, item := range order.Items {
			if err := s.updateInventory(tx, item.ProductID, -item.Quantity,
				fmt.Sprintf("Update - Order %s (new item)", order.OrderNumber), 0); err != nil {
				return fmt.Errorf("failed to deduct inventory for new item: %w", err)
			}
		}

		// Deduct ingredients for new items
		s.ingredientSvc.DeductIngredientsInTransaction(tx, order.Items)

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

	// Validate status transition
	if !s.isValidStatusTransition(order.Status, status) {
		return fmt.Errorf("invalid status transition from '%s' to '%s'", order.Status, status)
	}

	order.Status = status

	// CRITICAL FIX: Free the table when order becomes paid or cancelled
	if (status == models.OrderStatusPaid || status == models.OrderStatusCancelled) && order.TableID != nil {
		if err := s.db.Model(&models.Table{}).
			Where("id = ?", *order.TableID).
			Update("status", "available").Error; err != nil {
			log.Printf("Warning: Failed to free table %d: %v", *order.TableID, err)
		}
	}

	// If order is ready, notify
	if status == models.OrderStatusReady {
		// Send notification through WebSocket
		s.notifyOrderReady(order)
	}

	return s.db.Save(order).Error
}

// isValidStatusTransition checks if a status transition is valid
func (s *OrderService) isValidStatusTransition(from, to models.OrderStatus) bool {
	// Allow same status (no-op)
	if from == to {
		return true
	}

	// Define valid transitions
	validTransitions := map[models.OrderStatus][]models.OrderStatus{
		models.OrderStatusPending: {
			models.OrderStatusPreparing,
			models.OrderStatusReady,
			models.OrderStatusCancelled,
			models.OrderStatusPaid,
		},
		models.OrderStatusPreparing: {
			models.OrderStatusReady,
			models.OrderStatusCancelled,
			models.OrderStatusPaid,
		},
		models.OrderStatusReady: {
			models.OrderStatusDelivered,
			models.OrderStatusPaid,
			models.OrderStatusCancelled,
		},
		models.OrderStatusDelivered: {
			models.OrderStatusPaid,
			models.OrderStatusCancelled,
		},
		// Terminal states - no transitions allowed
		models.OrderStatusPaid:      {},
		models.OrderStatusCancelled: {},
	}

	allowedNextStates, exists := validTransitions[from]
	if !exists {
		return false
	}

	for _, allowed := range allowedNextStates {
		if allowed == to {
			return true
		}
	}

	return false
}

// AddItemToOrder adds an item to an order
func (s *OrderService) AddItemToOrder(orderID uint, item *models.OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get order
		var order models.Order
		if err := tx.First(&order, orderID).Error; err != nil {
			return err
		}

		// CRITICAL FIX: Prevent adding items to paid or cancelled orders
		if order.Status == models.OrderStatusPaid {
			return fmt.Errorf("cannot add items to paid order")
		}
		if order.Status == models.OrderStatusCancelled {
			return fmt.Errorf("cannot add items to cancelled order")
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

		// CRITICAL FIX: Deduct ingredients for the new item
		itemsList := []models.OrderItem{*item}
		if err := s.ingredientSvc.DeductIngredientsInTransaction(tx, itemsList); err != nil {
			log.Printf("Warning: Failed to deduct ingredients for item %d: %v", item.ID, err)
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

		// CRITICAL FIX: Prevent removing items from paid or cancelled orders
		var order models.Order
		if err := tx.First(&order, orderID).Error; err != nil {
			return err
		}
		if order.Status == models.OrderStatusPaid {
			return fmt.Errorf("cannot remove items from paid order")
		}
		if order.Status == models.OrderStatusCancelled {
			return fmt.Errorf("cannot remove items from cancelled order")
		}

		// Return inventory
		if err := s.updateInventory(tx, item.ProductID, item.Quantity,
			fmt.Sprintf("Removed from order"), 0); err != nil {
			return err
		}

		// CRITICAL FIX: Restore ingredients for the removed item
		itemsList := []models.OrderItem{item}
		if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, itemsList); err != nil {
			log.Printf("Warning: Failed to restore ingredients for item %d: %v", item.ID, err)
		}

		// Delete item
		if err := tx.Delete(&item).Error; err != nil {
			return err
		}

		// Update order totals (reload with items)
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

		// CRITICAL FIX: Restore ingredients for all items
		if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, order.Items); err != nil {
			log.Printf("Warning: Failed to restore ingredients for cancelled order %s: %v", order.OrderNumber, err)
		}

		// CRITICAL FIX: Free the table when order is cancelled
		if order.TableID != nil {
			if err := tx.Model(&models.Table{}).
				Where("id = ?", *order.TableID).
				Update("status", "available").Error; err != nil {
				log.Printf("Warning: Failed to free table %d: %v", *order.TableID, err)
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

	err := s.db.Where("is_active = ?", true).
		Order("zone, number").
		Find(&tables).Error

	if err != nil {
		return nil, err
	}

	// Get current orders for each table
	for i := range tables {
		s.db.Where("table_id = ? AND status NOT IN ?", tables[i].ID,
			[]models.OrderStatus{models.OrderStatusPaid, models.OrderStatusCancelled}).
			First(&tables[i].CurrentOrder)
	}

	return tables, nil
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
	var totalTax float64

	// Get restaurant config to check if tax is included in price
	var config models.RestaurantConfig
	err := s.db.First(&config).Error
	taxIncludedInPrice := false
	if err == nil {
		taxIncludedInPrice = config.TaxIncludedInPrice
	}

	// Get DIAN config to check company's TypeRegimeID
	// TypeRegimeID = 2 means "No Responsable de IVA" - company CANNOT charge IVA
	var dianConfig models.DIANConfig
	s.db.First(&dianConfig)
	isResponsableIVA := dianConfig.TypeRegimeID != 2 // Default to responsible if not configured

	// Get DIAN parametric data for tax type lookups
	parametricData := models.GetDIANParametricData()

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
			log.Printf("⚠️ OrderItem had UnitPrice=0, setting from product.Price=%.2f (ProductID=%d)",
				product.Price, item.ProductID)
			item.UnitPrice = product.Price
		}

		// Calculate item subtotal
		item.Subtotal = item.UnitPrice * float64(item.Quantity)

		// Add modifiers price changes
		for _, modifier := range item.Modifiers {
			item.Subtotal += modifier.PriceChange * float64(item.Quantity)
		}

		subtotal += item.Subtotal

		// Calculate tax rate based on company's TypeRegimeID and product's TaxTypeID
		var itemTaxRate float64
		if !isResponsableIVA {
			// Company is "No Responsable de IVA" - CANNOT charge IVA
			itemTaxRate = 0.0
		} else {
			// Company is "Responsable de IVA" - use product's TaxTypeID
			taxType, exists := parametricData.TaxTypes[product.TaxTypeID]
			if exists {
				itemTaxRate = taxType.Percent
			} else {
				// Default to IVA 19% if tax type not found
				itemTaxRate = 19.0
			}
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

		// If this is a PWA order, send a special notification to all clients with sound
		if order.Source == "pwa" {
			notificationData := map[string]interface{}{
				"type":         "pwa_order",
				"order_number": order.OrderNumber,
				"order_id":     order.ID,
				"message":      fmt.Sprintf("Nuevo pedido remoto: %s", order.OrderNumber),
				"play_sound":   true,
			}
			notificationJSON, _ := json.Marshal(notificationData)

			notificationMsg := websocket.Message{
				Type:      websocket.TypeNotification,
				Timestamp: time.Now(),
				Data:      notificationJSON,
			}
			s.wsServer.BroadcastMessage(notificationMsg)
			log.Printf("OrderService: PWA order notification sent for order %s", order.OrderNumber)
		}

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

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Get order with items to restore inventory and ingredients
		var order models.Order
		if err := tx.Preload("Items").First(&order, orderID).Error; err != nil {
			return fmt.Errorf("order not found: %w", err)
		}

		tableID := order.TableID

		// CRITICAL FIX: Restore inventory for all items before deletion
		for _, item := range order.Items {
			if err := s.updateInventory(tx, item.ProductID, item.Quantity,
				fmt.Sprintf("Order %s deleted", order.OrderNumber), 0); err != nil {
				log.Printf("Warning: Failed to restore inventory for product %d: %v", item.ProductID, err)
			}
		}

		// CRITICAL FIX: Restore ingredients for all items before deletion
		if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, order.Items); err != nil {
			log.Printf("Warning: Failed to restore ingredients for deleted order %s: %v", order.OrderNumber, err)
		}

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
