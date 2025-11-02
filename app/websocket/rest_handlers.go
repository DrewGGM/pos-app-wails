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

// RESTHandlers provides HTTP REST endpoints for mobile apps
type RESTHandlers struct {
	db     *gorm.DB
	server *Server
}

// NewRESTHandlers creates a new REST handlers instance
func NewRESTHandlers(db *gorm.DB, server *Server) *RESTHandlers {
	return &RESTHandlers{
		db:     db,
		server: server,
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

// ProductResponse represents the product data for mobile apps
type ProductResponse struct {
	ID        uint    `json:"id"`
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	Category  string  `json:"category"`
	ImageURL  string  `json:"image_url,omitempty"`
	Stock     float64 `json:"stock"`
	Available bool    `json:"available"`
}

// OrderItemRequest represents an order item from mobile app
type OrderItemRequest struct {
	ProductID uint    `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
	Subtotal  float64 `json:"subtotal"`
	Notes     string  `json:"notes,omitempty"`
}

// OrderRequest represents an order from mobile app
type OrderRequest struct {
	OrderNumber string             `json:"order_number"`
	Type        string             `json:"type"`
	Status      string             `json:"status"`
	TableID     *uint              `json:"table_id,omitempty"`
	Items       []OrderItemRequest `json:"items"`
	Subtotal    float64            `json:"subtotal"`
	Tax         float64            `json:"tax"`
	Total       float64            `json:"total"`
	Notes       string             `json:"notes,omitempty"`
	Source      string             `json:"source"`
	EmployeeID  uint               `json:"employee_id"`
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
	if err := h.db.Preload("Category").Where("is_active = ?", true).Find(&products).Error; err != nil {
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

		response[i] = ProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Price:     p.Price,
			Category:  categoryName,
			ImageURL:  imageURL,
			Stock:     float64(p.Stock),
			Available: p.IsActive && p.Stock > 0,
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

	// Create order in database
	order := models.Order{
		OrderNumber: orderReq.OrderNumber,
		Type:        orderReq.Type,
		Status:      models.OrderStatus(orderReq.Status),
		TableID:     orderReq.TableID,
		Subtotal:    orderReq.Subtotal,
		Tax:         orderReq.Tax,
		Total:       orderReq.Total,
		Notes:       orderReq.Notes,
		Source:      orderReq.Source,
		EmployeeID:  orderReq.EmployeeID,
	}

	// Assign takeout number if it's a takeout order
	if order.Type == "takeout" {
		nextNumber, err := h.getNextAvailableTakeoutNumber()
		if err != nil {
			log.Printf("REST API: Error getting next takeout number: %v", err)
		} else {
			order.TakeoutNumber = &nextNumber
			log.Printf("REST API: Assigned takeout number %d to order", nextNumber)
		}
	}

	// Add items
	for _, itemReq := range orderReq.Items {
		item := models.OrderItem{
			ProductID: itemReq.ProductID,
			Quantity:  itemReq.Quantity,
			UnitPrice: itemReq.Price,
			Subtotal:  itemReq.Subtotal,
			Notes:     itemReq.Notes,
			Status:    "pending",
		}
		order.Items = append(order.Items, item)
	}

	// Save to database
	if err := h.db.Create(&order).Error; err != nil {
		log.Printf("REST API: Error creating order: %v", err)
		http.Error(w, "Error creating order", http.StatusInternalServerError)
		return
	}

	log.Printf("REST API: Order created successfully: %s (ID: %d)", order.OrderNumber, order.ID)

	// Mark table as occupied if it's a dine-in order
	if order.TableID != nil && order.Status == "pending" {
		h.db.Model(&models.Table{}).Where("id = ?", *order.TableID).Update("status", "occupied")
		log.Printf("REST API: Table %d marked as occupied", *order.TableID)
	}

	// Send order to kitchen via WebSocket
	if h.server != nil && (order.Source == "waiter_app" || order.Source == "pos") {
		go h.sendToKitchen(&order)
	}

	// Return success
	response := map[string]interface{}{
		"success":      true,
		"order_id":     order.ID,
		"order_number": order.OrderNumber,
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
	ID          uint                    `json:"id"`
	OrderNumber string                  `json:"order_number"`
	Type        string                  `json:"type"`
	Status      string                  `json:"status"`
	TableID     *uint                   `json:"table_id,omitempty"`
	TableNumber string                  `json:"table_number,omitempty"`
	Items       []OrderItemResponse     `json:"items"`
	Subtotal    float64                 `json:"subtotal"`
	Tax         float64                 `json:"tax"`
	Total       float64                 `json:"total"`
	Notes       string                  `json:"notes,omitempty"`
	Source      string                  `json:"source"`
	CreatedAt   string                  `json:"created_at"`
}

type OrderItemResponse struct {
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Subtotal    float64 `json:"subtotal"`
	Notes       string  `json:"notes,omitempty"`
	Status      string  `json:"status"`
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

	query := h.db.Preload("Items.Product").Preload("Table")

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
			ID:          o.ID,
			OrderNumber: o.OrderNumber,
			Type:        o.Type,
			Status:      string(o.Status),
			TableID:     o.TableID,
			Subtotal:    o.Subtotal,
			Tax:         o.Tax,
			Total:       o.Total,
			Notes:       o.Notes,
			Source:      o.Source,
			CreatedAt:   o.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
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

			items[j] = OrderItemResponse{
				ProductID:   item.ProductID,
				ProductName: productName,
				Quantity:    item.Quantity,
				UnitPrice:   item.UnitPrice,
				Subtotal:    item.Subtotal,
				Notes:       item.Notes,
				Status:      item.Status,
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

	// Delete order items first
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
