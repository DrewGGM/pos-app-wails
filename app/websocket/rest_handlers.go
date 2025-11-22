package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"gorm.io/gorm"
	"PosApp/app/models"
)

// OrderCreator interface defines the contract for creating orders
// This avoids importing the services package directly, breaking the import cycle
type OrderCreator interface {
	CreateOrder(order *models.Order) (*models.Order, error)
}

// RESTHandlers provides HTTP REST endpoints for mobile apps
type RESTHandlers struct {
	db           *gorm.DB
	server       *Server
	orderService OrderCreator
}

// NewRESTHandlers creates a new REST handlers instance
func NewRESTHandlers(db *gorm.DB, server *Server, orderService OrderCreator) *RESTHandlers {
	return &RESTHandlers{
		db:           db,
		server:       server,
		orderService: orderService,
	}
}

// HandleOrders routes between GET and POST for /api/orders
func (h *RESTHandlers) HandleOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" || r.Method == "OPTIONS" {
		h.HandleGetOrders(w, r)
	} else if r.Method == "POST" {
		h.HandleCreateOrder(w, r)
	} else {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ModifierResponse represents a modifier for mobile apps
type ModifierResponse struct {
	ID          uint    `json:"id"`
	Name        string  `json:"name"`
	PriceChange float64 `json:"price_change"`
}

// ProductResponse represents the product data for mobile apps
type ProductResponse struct {
	ID               uint               `json:"id"`
	Name             string             `json:"name"`
	Price            float64            `json:"price"`
	Category         string             `json:"category"`
	ImageURL         string             `json:"image_url,omitempty"`
	Stock            float64            `json:"stock"`
	Available        bool               `json:"available"`
	HasVariablePrice bool               `json:"has_variable_price"`
	Modifiers        []ModifierResponse `json:"modifiers,omitempty"`
}

// OrderItemModifierRequest represents a modifier for an order item from mobile app
type OrderItemModifierRequest struct {
	ModifierID  uint    `json:"modifier_id"`
	PriceChange float64 `json:"price_change"`
}

// OrderItemRequest represents an order item from mobile app
type OrderItemRequest struct {
	ProductID uint                       `json:"product_id"`
	Quantity  int                        `json:"quantity"`
	Price     float64                    `json:"price"`
	UnitPrice float64                    `json:"unit_price"`
	Subtotal  float64                    `json:"subtotal"`
	Notes     string                     `json:"notes,omitempty"`
	Modifiers []OrderItemModifierRequest `json:"modifiers,omitempty"`
}

// OrderRequest represents an order from mobile app
type OrderRequest struct {
	OrderNumber string             `json:"order_number"`
	Type        string             `json:"type"` // Deprecated: use order_type_id
	OrderTypeID *uint              `json:"order_type_id,omitempty"`
	Status      string             `json:"status"`
	TableID     *uint              `json:"table_id,omitempty"`
	Items       []OrderItemRequest `json:"items"`
	Subtotal    float64            `json:"subtotal"`
	Tax         float64            `json:"tax"`
	Total       float64            `json:"total"`
	Notes       string             `json:"notes,omitempty"`
	Source      string             `json:"source"`
	EmployeeID  uint               `json:"employee_id"`
	// Delivery information (optional, for delivery orders)
	DeliveryCustomerName string `json:"delivery_customer_name,omitempty"`
	DeliveryAddress      string `json:"delivery_address,omitempty"`
	DeliveryPhone        string `json:"delivery_phone,omitempty"`
}

// HandleGetProducts returns all available products
func (h *RESTHandlers) HandleGetProducts(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Fetching products")

	var products []models.Product
	if err := h.db.Preload("Category").Preload("Modifiers").Where("is_active = ?", true).Find(&products).Error; err != nil {
		log.Printf("REST API: Error fetching products: %v", err)
		http.Error(w, "Error fetching products", http.StatusInternalServerError)
		return
	}

	// Convert to mobile app format
	response := make([]ProductResponse, len(products))
	for i, p := range products {
		categoryName := ""
		if p.Category != nil {
			categoryName = p.Category.Name
		}

		// Format image URL for mobile app
		imageURL := p.Image

		// Log first 50 chars of original image to debug
		if imageURL != "" {
			preview := imageURL
			if len(preview) > 50 {
				preview = preview[:50] + "..."
			}
			log.Printf("REST API: Product '%s' image preview: %s", p.Name, preview)
		}

		if imageURL != "" && !strings.HasPrefix(imageURL, "data:") && !strings.HasPrefix(imageURL, "http") {
			// If it's base64 without prefix, add the data URL prefix
			imageURL = "data:image/png;base64," + imageURL
			log.Printf("REST API: Added data URL prefix for product '%s'", p.Name)
		}

		// Map modifiers
		modifiers := make([]ModifierResponse, len(p.Modifiers))
		for j, m := range p.Modifiers {
			modifiers[j] = ModifierResponse{
				ID:          m.ID,
				Name:        m.Name,
				PriceChange: m.PriceChange,
			}
		}

		response[i] = ProductResponse{
			ID:               p.ID,
			Name:             p.Name,
			Price:            p.Price,
			Category:         categoryName,
			ImageURL:         imageURL,
			Stock:            float64(p.Stock),
			Available:        p.IsActive && p.Stock > 0,
			HasVariablePrice: p.HasVariablePrice,
			Modifiers:        modifiers,
		}
	}

	log.Printf("REST API: Returning %d products", len(response))
	json.NewEncoder(w).Encode(response)
}

// HandleCreateOrder creates a new order from mobile app
func (h *RESTHandlers) HandleCreateOrder(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Creating order from mobile app")

	var orderReq OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&orderReq); err != nil {
		log.Printf("REST API: Error decoding order: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("REST API: Order data: %+v", orderReq)

	// Build order items
	var items []models.OrderItem
	for _, itemReq := range orderReq.Items {
		// Use UnitPrice if provided, otherwise fall back to Price
		unitPrice := itemReq.UnitPrice
		if unitPrice == 0 {
			unitPrice = itemReq.Price
		}

		item := models.OrderItem{
			ProductID: itemReq.ProductID,
			Quantity:  itemReq.Quantity,
			UnitPrice: unitPrice,
			Subtotal:  itemReq.Subtotal,
			Notes:     itemReq.Notes,
			Status:    "pending",
		}

		// Add modifiers for this item
		for _, modReq := range itemReq.Modifiers {
			modifier := models.OrderItemModifier{
				ModifierID:  modReq.ModifierID,
				PriceChange: modReq.PriceChange,
			}
			item.Modifiers = append(item.Modifiers, modifier)
		}

		items = append(items, item)
	}

	// Build the Order object
	order := &models.Order{
		Type:                 orderReq.Type, // Legacy field
		OrderTypeID:          orderReq.OrderTypeID,
		TableID:              orderReq.TableID,
		EmployeeID:           orderReq.EmployeeID,
		Items:                items,
		Notes:                orderReq.Notes,
		Source:               orderReq.Source,
		DeliveryCustomerName: orderReq.DeliveryCustomerName,
		DeliveryAddress:      orderReq.DeliveryAddress,
		DeliveryPhone:        orderReq.DeliveryPhone,
	}

	// LOG: Debug delivery info
	log.Printf("🚚 REST API: Delivery info received:")
	log.Printf("  - Customer Name: '%s'", orderReq.DeliveryCustomerName)
	log.Printf("  - Address: '%s'", orderReq.DeliveryAddress)
	log.Printf("  - Phone: '%s'", orderReq.DeliveryPhone)

	// Use OrderService to create the order (handles sequential numbers and order types)
	createdOrder, err := h.orderService.CreateOrder(order)
	if err != nil {
		log.Printf("REST API: Error creating order: %v", err)
		http.Error(w, fmt.Sprintf("Error creating order: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("REST API: Order created successfully: %s (ID: %d)", createdOrder.OrderNumber, createdOrder.ID)

	// Mark table as occupied if it's a dine-in order
	if createdOrder.TableID != nil && createdOrder.Status == "pending" {
		h.db.Model(&models.Table{}).Where("id = ?", *createdOrder.TableID).Update("status", "occupied")
		log.Printf("REST API: Table %d marked as occupied", *createdOrder.TableID)
	}

	// Send order to kitchen via WebSocket
	if h.server != nil && (createdOrder.Source == "waiter_app" || createdOrder.Source == "pos") {
		go h.sendToKitchen(createdOrder)
	}

	// Return success
	response := map[string]interface{}{
		"success":      true,
		"order_id":     createdOrder.ID,
		"order_number": createdOrder.OrderNumber,
	}
	json.NewEncoder(w).Encode(response)
}

// TableResponse represents the table data for mobile apps
type TableResponse struct {
	ID       uint   `json:"id"`
	Number   string `json:"number"`
	Name     string `json:"name"`
	Capacity int    `json:"capacity"`
	Status   string `json:"status"`
	Zone     string `json:"zone"`
}

// HandleGetTables returns all tables with their status
func (h *RESTHandlers) HandleGetTables(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Fetching tables")

	var tables []models.Table
	if err := h.db.Where("is_active = ?", true).Find(&tables).Error; err != nil {
		log.Printf("REST API: Error fetching tables: %v", err)
		http.Error(w, "Error fetching tables", http.StatusInternalServerError)
		return
	}

	// Convert to mobile app format
	response := make([]TableResponse, len(tables))
	for i, t := range tables {
		response[i] = TableResponse{
			ID:       t.ID,
			Number:   t.Number,
			Name:     t.Name,
			Capacity: t.Capacity,
			Status:   t.Status,
			Zone:     t.Zone,
		}
	}

	log.Printf("REST API: Returning %d tables", len(response))
	json.NewEncoder(w).Encode(response)
}

// HandleUpdateTableStatus updates the status of a table
func (h *RESTHandlers) HandleUpdateTableStatus(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "PATCH, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "PATCH" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Updating table status")

	var request struct {
		TableID uint   `json:"table_id"`
		Status  string `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		log.Printf("REST API: Error decoding request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Update table status
	if err := h.db.Model(&models.Table{}).Where("id = ?", request.TableID).Update("status", request.Status).Error; err != nil {
		log.Printf("REST API: Error updating table status: %v", err)
		http.Error(w, "Error updating table status", http.StatusInternalServerError)
		return
	}

	log.Printf("REST API: Table %d status updated to %s", request.TableID, request.Status)

	response := map[string]interface{}{
		"success": true,
		"message": "Table status updated",
	}
	json.NewEncoder(w).Encode(response)
}

// OrderResponse represents an order for mobile apps
type OrderResponse struct {
	ID             uint                    `json:"id"`
	OrderNumber    string                  `json:"order_number"`
	Type           string                  `json:"type"` // Deprecated: use order_type
	OrderType      *models.OrderType       `json:"order_type,omitempty"`
	SequenceNumber *int                    `json:"sequence_number,omitempty"`
	TakeoutNumber  *int                    `json:"takeout_number,omitempty"` // Deprecated
	Status         string                  `json:"status"`
	TableID        *uint                   `json:"table_id,omitempty"`
	TableNumber    string                  `json:"table_number,omitempty"`
	Table          *models.Table           `json:"table,omitempty"`
	Items          []OrderItemResponse     `json:"items"`
	Subtotal       float64                 `json:"subtotal"`
	Tax            float64                 `json:"tax"`
	Total          float64                 `json:"total"`
	Notes          string                  `json:"notes,omitempty"`
	Source         string                  `json:"source"`
	CreatedAt      string                  `json:"created_at"`
	// Delivery information (optional, for delivery orders)
	DeliveryCustomerName string `json:"delivery_customer_name,omitempty"`
	DeliveryAddress      string `json:"delivery_address,omitempty"`
	DeliveryPhone        string `json:"delivery_phone,omitempty"`
}

// OrderItemModifierResponse represents a modifier on an order item
type OrderItemModifierResponse struct {
	ModifierID  uint             `json:"modifier_id"`
	Modifier    *ModifierResponse `json:"modifier,omitempty"`
	PriceChange float64          `json:"price_change"`
}

type OrderItemResponse struct {
	ProductID   uint                         `json:"product_id"`
	ProductName string                       `json:"product_name"`
	Quantity    int                          `json:"quantity"`
	UnitPrice   float64                      `json:"unit_price"`
	Subtotal    float64                      `json:"subtotal"`
	Notes       string                       `json:"notes,omitempty"`
	Status      string                       `json:"status"`
	Modifiers   []OrderItemModifierResponse  `json:"modifiers,omitempty"`
}

// HandleGetOrders returns orders (optionally filtered)
func (h *RESTHandlers) HandleGetOrders(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Fetching orders")

	// Get query parameters for filtering
	status := r.URL.Query().Get("status")
	tableID := r.URL.Query().Get("table_id")

	query := h.db.Preload("Items.Product").Preload("Items.Modifiers.Modifier").Preload("Table").Preload("OrderType")

	// Apply filters
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if tableID != "" {
		query = query.Where("table_id = ?", tableID)
	}

	var orders []models.Order
	if err := query.Order("created_at DESC").Find(&orders).Error; err != nil {
		log.Printf("REST API: Error fetching orders: %v", err)
		http.Error(w, "Error fetching orders", http.StatusInternalServerError)
		return
	}

	// Convert to mobile app format
	response := make([]OrderResponse, len(orders))
	for i, o := range orders {
		orderResp := OrderResponse{
			ID:                   o.ID,
			OrderNumber:          o.OrderNumber,
			Type:                 o.Type,
			OrderType:            o.OrderType,
			SequenceNumber:       o.SequenceNumber,
			TakeoutNumber:        o.TakeoutNumber,
			Status:               string(o.Status),
			TableID:              o.TableID,
			Table:                o.Table,
			Subtotal:             o.Subtotal,
			Tax:                  o.Tax,
			Total:                o.Total,
			Notes:                o.Notes,
			Source:               o.Source,
			CreatedAt:            o.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			DeliveryCustomerName: o.DeliveryCustomerName,
			DeliveryAddress:      o.DeliveryAddress,
			DeliveryPhone:        o.DeliveryPhone,
		}

		if o.Table != nil {
			orderResp.TableNumber = o.Table.Number
		}

		// Convert items
		items := make([]OrderItemResponse, len(o.Items))
		for j, item := range o.Items {
			productName := ""
			if item.Product != nil {
				productName = item.Product.Name
			}

			// Map modifiers
			modifiers := make([]OrderItemModifierResponse, len(item.Modifiers))
			for k, mod := range item.Modifiers {
				modResp := OrderItemModifierResponse{
					ModifierID:  mod.ModifierID,
					PriceChange: mod.PriceChange,
				}
				if mod.Modifier != nil {
					modResp.Modifier = &ModifierResponse{
						ID:          mod.Modifier.ID,
						Name:        mod.Modifier.Name,
						PriceChange: mod.Modifier.PriceChange,
					}
				}
				modifiers[k] = modResp
			}

			items[j] = OrderItemResponse{
				ProductID:   item.ProductID,
				ProductName: productName,
				Quantity:    item.Quantity,
				UnitPrice:   item.UnitPrice,
				Subtotal:    item.Subtotal,
				Notes:       item.Notes,
				Status:      item.Status,
				Modifiers:   modifiers,
			}
		}
		orderResp.Items = items

		response[i] = orderResp
	}

	log.Printf("REST API: Returning %d orders", len(response))
	json.NewEncoder(w).Encode(response)
}

// HandleOrderByID handles GET, PUT, and DELETE for /api/orders/:id
func (h *RESTHandlers) HandleOrderByID(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Extract order ID from URL
	var orderID uint
	if _, err := fmt.Sscanf(r.URL.Path, "/api/orders/%d", &orderID); err != nil {
		http.Error(w, "Invalid order ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "PUT":
		h.HandleUpdateOrder(w, r, orderID)
	case "DELETE":
		h.HandleDeleteOrder(w, r, orderID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// HandleUpdateOrder updates an existing order
func (h *RESTHandlers) HandleUpdateOrder(w http.ResponseWriter, r *http.Request, orderID uint) {
	log.Printf("REST API: Updating order ID: %d", orderID)

	var orderReq OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&orderReq); err != nil {
		log.Printf("REST API: Error decoding order: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Fetch existing order
	var existingOrder models.Order
	if err := h.db.Preload("Items").First(&existingOrder, orderID).Error; err != nil {
		log.Printf("REST API: Order not found: %v", err)
		http.Error(w, "Order not found", http.StatusNotFound)
		return
	}

	// Delete old modifiers first (to avoid foreign key constraint violation)
	if err := h.db.Exec("DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)", orderID).Error; err != nil {
		log.Printf("REST API: Error deleting old modifiers: %v", err)
		http.Error(w, "Error updating order", http.StatusInternalServerError)
		return
	}

	// Delete old items
	if err := h.db.Where("order_id = ?", orderID).Delete(&models.OrderItem{}).Error; err != nil {
		log.Printf("REST API: Error deleting old items: %v", err)
		http.Error(w, "Error updating order", http.StatusInternalServerError)
		return
	}

	// Update order fields
	existingOrder.Type = orderReq.Type
	existingOrder.Status = models.OrderStatus(orderReq.Status)
	existingOrder.TableID = orderReq.TableID
	existingOrder.Subtotal = orderReq.Subtotal
	existingOrder.Tax = orderReq.Tax
	existingOrder.Total = orderReq.Total
	existingOrder.Notes = orderReq.Notes
	existingOrder.DeliveryCustomerName = orderReq.DeliveryCustomerName
	existingOrder.DeliveryAddress = orderReq.DeliveryAddress
	existingOrder.DeliveryPhone = orderReq.DeliveryPhone
	existingOrder.Items = []models.OrderItem{}

	// Add new items
	for _, itemReq := range orderReq.Items {
		item := models.OrderItem{
			ProductID: itemReq.ProductID,
			Quantity:  itemReq.Quantity,
			UnitPrice: itemReq.Price,
			Subtotal:  itemReq.Subtotal,
			Notes:     itemReq.Notes,
			Status:    "pending",
		}

		// Add modifiers if present
		for _, modReq := range itemReq.Modifiers {
			modifier := models.OrderItemModifier{
				ModifierID:  modReq.ModifierID,
				PriceChange: modReq.PriceChange,
			}
			item.Modifiers = append(item.Modifiers, modifier)
		}

		existingOrder.Items = append(existingOrder.Items, item)
	}

	// Save updated order
	if err := h.db.Save(&existingOrder).Error; err != nil {
		log.Printf("REST API: Error updating order: %v", err)
		http.Error(w, "Error updating order", http.StatusInternalServerError)
		return
	}

	// Update table status if needed
	if existingOrder.TableID != nil && existingOrder.Status == "pending" {
		h.db.Model(&models.Table{}).Where("id = ?", *existingOrder.TableID).Update("status", "occupied")
	}

	log.Printf("REST API: Order updated successfully: %s (ID: %d)", existingOrder.OrderNumber, existingOrder.ID)

	// Broadcast update to kitchen via WebSocket
	if h.server != nil {
		go h.broadcastOrderUpdate(&existingOrder)
	}

	response := map[string]interface{}{
		"success":      true,
		"order_id":     existingOrder.ID,
		"order_number": existingOrder.OrderNumber,
	}
	json.NewEncoder(w).Encode(response)
}

// HandleDeleteOrder deletes an order and updates table status if needed
func (h *RESTHandlers) HandleDeleteOrder(w http.ResponseWriter, r *http.Request, orderID uint) {
	log.Printf("REST API: Deleting order ID: %d", orderID)

	// Fetch existing order
	var order models.Order
	if err := h.db.First(&order, orderID).Error; err != nil {
		log.Printf("REST API: Order not found: %v", err)
		http.Error(w, "Order not found", http.StatusNotFound)
		return
	}

	tableID := order.TableID

	// Delete order item modifiers first (to avoid foreign key constraint violation)
	if err := h.db.Exec("DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)", orderID).Error; err != nil {
		log.Printf("REST API: Error deleting order item modifiers: %v", err)
		http.Error(w, "Error deleting order", http.StatusInternalServerError)
		return
	}

	// Delete order items
	if err := h.db.Where("order_id = ?", orderID).Delete(&models.OrderItem{}).Error; err != nil {
		log.Printf("REST API: Error deleting order items: %v", err)
		http.Error(w, "Error deleting order", http.StatusInternalServerError)
		return
	}

	// Delete order
	if err := h.db.Delete(&order).Error; err != nil {
		log.Printf("REST API: Error deleting order: %v", err)
		http.Error(w, "Error deleting order", http.StatusInternalServerError)
		return
	}

	// Check if table has any other pending orders
	if tableID != nil {
		var count int64
		h.db.Model(&models.Order{}).Where("table_id = ? AND status = ?", *tableID, "pending").Count(&count)

		// If no pending orders, mark table as available
		if count == 0 {
			h.db.Model(&models.Table{}).Where("id = ?", *tableID).Update("status", "available")
			log.Printf("REST API: Table %d marked as available (no pending orders)", *tableID)
		}
	}

	log.Printf("REST API: Order deleted successfully: %d", orderID)

	// Broadcast cancellation to kitchen via WebSocket
	if h.server != nil {
		go h.broadcastOrderCancelled(orderID)
	}

	response := map[string]interface{}{
		"success": true,
		"message": "Order deleted successfully",
	}
	json.NewEncoder(w).Encode(response)
}

// getNextAvailableTakeoutNumber finds the next available takeout number
// It reuses freed numbers (when orders are completed) instead of continuing sequence
func (h *RESTHandlers) getNextAvailableTakeoutNumber() (int, error) {
	// Get all active takeout orders (not paid or cancelled)
	var activeOrders []models.Order
	err := h.db.Select("takeout_number").
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

// sendToKitchen sends order to kitchen display via WebSocket
func (h *RESTHandlers) sendToKitchen(order *models.Order) {
	log.Printf("REST API: Sending order %s to kitchen", order.OrderNumber)

	if h.server == nil {
		log.Println("REST API: WebSocket server not initialized, skipping kitchen notification")
		return
	}

	// Preload all relationships including modifiers
	var fullOrder models.Order
	if err := h.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		First(&fullOrder, order.ID).Error; err != nil {
		log.Printf("REST API: Error loading order details: %v", err)
		return
	}

	// Create WebSocket message
	message := Message{
		Type:      TypeKitchenOrder,
		Timestamp: time.Now(),
	}

	// Serialize order data
	orderData, err := json.Marshal(fullOrder)
	if err != nil {
		log.Printf("REST API: Error marshaling order: %v", err)
		return
	}
	message.Data = orderData

	// Broadcast to kitchen clients
	h.server.BroadcastToKitchen(message)
	log.Printf("REST API: Order %s sent to kitchen successfully", order.OrderNumber)

	// Mark all items as sent to kitchen
	now := time.Now()
	for i := range fullOrder.Items {
		if !fullOrder.Items[i].SentToKitchen {
			fullOrder.Items[i].SentToKitchen = true
			fullOrder.Items[i].SentToKitchenAt = &now
			if err := h.db.Save(&fullOrder.Items[i]).Error; err != nil {
				log.Printf("REST API: Error marking item %d as sent: %v", fullOrder.Items[i].ID, err)
			}
		}
	}
	log.Printf("REST API: Marked %d items as sent to kitchen", len(fullOrder.Items))
}

// broadcastOrderUpdate broadcasts an order update to kitchen clients
func (h *RESTHandlers) broadcastOrderUpdate(order *models.Order) {
	log.Printf("REST API: Broadcasting order update %s to kitchen", order.OrderNumber)

	if h.server == nil {
		log.Println("REST API: WebSocket server not initialized, skipping kitchen notification")
		return
	}

	// Preload all relationships including modifiers
	var fullOrder models.Order
	if err := h.db.Preload("Items.Product").
		Preload("Items.Modifiers.Modifier").
		Preload("Table").
		First(&fullOrder, order.ID).Error; err != nil {
		log.Printf("REST API: Error loading order details: %v", err)
		return
	}

	// Create WebSocket message with order_update type
	message := Message{
		Type:      "order_update",
		Timestamp: time.Now(),
	}

	// Serialize order data
	orderData, err := json.Marshal(fullOrder)
	if err != nil {
		log.Printf("REST API: Error marshaling order: %v", err)
		return
	}
	message.Data = orderData

	// Broadcast to kitchen clients
	h.server.BroadcastToKitchen(message)
	log.Printf("REST API: Order update %s broadcasted to kitchen successfully", order.OrderNumber)
}

// broadcastOrderCancelled broadcasts an order cancellation to kitchen clients
func (h *RESTHandlers) broadcastOrderCancelled(orderID uint) {
	log.Printf("REST API: Broadcasting order cancellation for order ID %d to kitchen", orderID)

	if h.server == nil {
		log.Println("REST API: WebSocket server not initialized, skipping kitchen notification")
		return
	}

	// Create WebSocket message with order_cancelled type
	message := Message{
		Type:      "order_cancelled",
		Timestamp: time.Now(),
	}

	// Send order ID
	cancelData := map[string]interface{}{
		"id": orderID,
	}
	data, err := json.Marshal(cancelData)
	if err != nil {
		log.Printf("REST API: Error marshaling cancel data: %v", err)
		return
	}
	message.Data = data

	// Broadcast to kitchen clients
	h.server.BroadcastToKitchen(message)
	log.Printf("REST API: Order cancellation for ID %d broadcasted to kitchen successfully", orderID)
}

// ProductSalesItem represents sales data for a product
type ProductSalesItem struct {
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	Total       float64 `json:"total"`
}

// OrderTypeSalesData represents sales data for a specific order type
type OrderTypeSalesData struct {
	OrderType *models.OrderType  `json:"order_type"`
	Sales     float64            `json:"sales"`
	Products  []ProductSalesItem `json:"products"`
}

// TodaySalesResponse represents the complete sales report for today
type TodaySalesResponse struct {
	Total struct {
		Sales    float64            `json:"sales"`
		Products []ProductSalesItem `json:"products"`
	} `json:"total"`
	ByOrderType []OrderTypeSalesData `json:"by_order_type"`
}

// HandleGetTodaySales returns today's sales grouped by order type
func (h *RESTHandlers) HandleGetTodaySales(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get today's date range
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// Query today's sales with preloads
	var sales []models.Sale
	err := h.db.Preload("Order.OrderType").
		Preload("Order.Items.Product").
		Where("created_at >= ?", startOfDay).
		Where("status = ?", "completed").
		Find(&sales).Error

	if err != nil {
		log.Printf("REST API: Error fetching today's sales: %v", err)
		http.Error(w, "Failed to fetch sales", http.StatusInternalServerError)
		return
	}

	// Initialize response
	response := TodaySalesResponse{}
	response.Total.Sales = 0
	response.ByOrderType = []OrderTypeSalesData{}

	// Maps for aggregation
	totalProductsMap := make(map[uint]*ProductSalesItem)
	orderTypeMap := make(map[uint]*OrderTypeSalesData)

	// Process each sale
	for _, sale := range sales {
		response.Total.Sales += sale.Total

		// Get order type ID (handle nil case)
		var orderTypeID uint
		var orderType *models.OrderType

		if sale.Order != nil && sale.Order.OrderTypeID != nil {
			orderTypeID = *sale.Order.OrderTypeID
			orderType = sale.Order.OrderType
		} else {
			// Sales without order type - skip or create a "Unknown" category
			orderTypeID = 0
			orderType = nil
		}

		// Initialize order type data if not exists
		if _, exists := orderTypeMap[orderTypeID]; !exists {
			orderTypeMap[orderTypeID] = &OrderTypeSalesData{
				OrderType: orderType,
				Sales:     0,
				Products:  []ProductSalesItem{},
			}
		}

		// Add to order type total
		orderTypeMap[orderTypeID].Sales += sale.Total

		// Process order items for product aggregation
		if sale.Order != nil && sale.Order.Items != nil {
			orderTypeProductsMap := make(map[uint]*ProductSalesItem)

			for _, item := range sale.Order.Items {
				if item.Product == nil {
					continue
				}

				productID := item.Product.ID
				productName := item.Product.Name
				itemTotal := item.Subtotal // Use subtotal which already includes modifiers

				// Add to total products
				if existing, exists := totalProductsMap[productID]; exists {
					existing.Quantity += item.Quantity
					existing.Total += itemTotal
				} else {
					totalProductsMap[productID] = &ProductSalesItem{
						ProductID:   productID,
						ProductName: productName,
						Quantity:    item.Quantity,
						Total:       itemTotal,
					}
				}

				// Add to order type specific products
				if existing, exists := orderTypeProductsMap[productID]; exists {
					existing.Quantity += item.Quantity
					existing.Total += itemTotal
				} else {
					orderTypeProductsMap[productID] = &ProductSalesItem{
						ProductID:   productID,
						ProductName: productName,
						Quantity:    item.Quantity,
						Total:       itemTotal,
					}
				}
			}

			// Convert order type products map to slice
			for _, product := range orderTypeProductsMap {
				orderTypeMap[orderTypeID].Products = append(orderTypeMap[orderTypeID].Products, *product)
			}
		}
	}

	// Convert total products map to slice
	for _, product := range totalProductsMap {
		response.Total.Products = append(response.Total.Products, *product)
	}

	// Convert order type map to slice
	for _, orderTypeData := range orderTypeMap {
		response.ByOrderType = append(response.ByOrderType, *orderTypeData)
	}

	// Marshal response
	jsonData, err := json.Marshal(response)
	if err != nil {
		log.Printf("REST API: Error marshaling sales response: %v", err)
		http.Error(w, "Failed to generate response", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(jsonData)
	log.Printf("REST API: Today's sales report sent successfully")
}

// OrderTypeResponse represents the order type data for mobile apps
type OrderTypeResponse struct {
	ID                     uint   `json:"id"`
	Code                   string `json:"code"`
	Name                   string `json:"name"`
	RequiresSequentialNumber bool   `json:"requires_sequential_number"`
	SequencePrefix         string `json:"sequence_prefix"`
	DisplayColor           string `json:"display_color"`
	Icon                   string `json:"icon"`
	IsActive               bool   `json:"is_active"`
	DisplayOrder           int    `json:"display_order"`
	SkipPaymentDialog      bool   `json:"skip_payment_dialog"`
	DefaultPaymentMethodID *uint  `json:"default_payment_method_id,omitempty"`
}

// HandleGetActiveOrderTypes returns all active order types
func (h *RESTHandlers) HandleGetActiveOrderTypes(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Fetching active order types")

	var orderTypes []models.OrderType
	if err := h.db.Where("is_active = ?", true).Order("display_order ASC").Find(&orderTypes).Error; err != nil {
		log.Printf("REST API: Error fetching order types: %v", err)
		http.Error(w, "Error fetching order types", http.StatusInternalServerError)
		return
	}

	// Convert to mobile app format
	response := make([]OrderTypeResponse, len(orderTypes))
	for i, ot := range orderTypes {
		response[i] = OrderTypeResponse{
			ID:                     ot.ID,
			Code:                   ot.Code,
			Name:                   ot.Name,
			RequiresSequentialNumber: ot.RequiresSequentialNumber,
			SequencePrefix:         ot.SequencePrefix,
			DisplayColor:           ot.DisplayColor,
			Icon:                   ot.Icon,
			IsActive:               ot.IsActive,
			DisplayOrder:           ot.DisplayOrder,
			SkipPaymentDialog:      ot.SkipPaymentDialog,
			DefaultPaymentMethodID: ot.DefaultPaymentMethodID,
		}
	}

	log.Printf("REST API: Returning %d active order types", len(response))
	json.NewEncoder(w).Encode(response)
}

// CustomPageResponse represents the custom page data for mobile apps
type CustomPageResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Icon         string `json:"icon"`
	Color        string `json:"color"`
	DisplayOrder int    `json:"display_order"`
	IsActive     bool   `json:"is_active"`
}

// HandleGetCustomPages returns all active custom pages
func (h *RESTHandlers) HandleGetCustomPages(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("REST API: Fetching custom pages")

	var pages []models.CustomPage
	if err := h.db.Where("is_active = ?", true).Order("display_order ASC").Find(&pages).Error; err != nil {
		log.Printf("REST API: Error fetching custom pages: %v", err)
		http.Error(w, "Error fetching custom pages", http.StatusInternalServerError)
		return
	}

	// Convert to mobile app format
	response := make([]CustomPageResponse, len(pages))
	for i, page := range pages {
		response[i] = CustomPageResponse{
			ID:           page.ID,
			Name:         page.Name,
			Description:  page.Description,
			Icon:         page.Icon,
			Color:        page.Color,
			DisplayOrder: page.DisplayOrder,
			IsActive:     page.IsActive,
		}
	}

	log.Printf("REST API: Returning %d custom pages", len(response))
	json.NewEncoder(w).Encode(response)
}

// HandleGetCustomPageProducts returns products for a specific custom page
func (h *RESTHandlers) HandleGetCustomPageProducts(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract page ID from URL path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}

	pageID := pathParts[3]
	log.Printf("REST API: Fetching products for custom page %s", pageID)

	// Get page products ordered by position
	var pageProducts []models.CustomPageProduct
	if err := h.db.Where("custom_page_id = ?", pageID).
		Order("position").
		Preload("Product.Category").
		Preload("Product.Modifiers.ModifierGroup").
		Find(&pageProducts).Error; err != nil {
		log.Printf("REST API: Error fetching page products: %v", err)
		http.Error(w, "Error fetching page products", http.StatusInternalServerError)
		return
	}

	// Convert to product response format (reusing existing ProductResponse)
	response := make([]ProductResponse, 0)
	for _, pp := range pageProducts {
		if pp.Product != nil && pp.Product.IsActive {
			p := pp.Product

			// Get category name
			categoryName := "Sin categoría"
			if p.Category != nil {
				categoryName = p.Category.Name
			}

			// Process image URL
			imageURL := p.Image
			if imageURL != "" && !strings.HasPrefix(imageURL, "http") && !strings.HasPrefix(imageURL, "data:image") {
				imageURL = "data:image/png;base64," + imageURL
			}

			// Map modifiers
			modifiers := make([]ModifierResponse, len(p.Modifiers))
			for j, m := range p.Modifiers {
				modifiers[j] = ModifierResponse{
					ID:          m.ID,
					Name:        m.Name,
					PriceChange: m.PriceChange,
				}
			}

			productResp := ProductResponse{
				ID:        p.ID,
				Name:      p.Name,
				Price:     p.Price,
				Category:  categoryName,
				ImageURL:  imageURL,
				Stock:     float64(p.Stock),
				Available: p.IsActive && p.Stock > 0,
				Modifiers: modifiers,
			}

			response = append(response, productResp)
		}
	}

	log.Printf("REST API: Returning %d products for custom page %s", len(response), pageID)
	json.NewEncoder(w).Encode(response)
}
