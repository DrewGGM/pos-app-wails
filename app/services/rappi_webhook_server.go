package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// RappiWebhookServer handles incoming webhooks from Rappi
type RappiWebhookServer struct {
	server         *http.Server
	db             *gorm.DB
	configService  *RappiConfigService
	orderService   *OrderService
	productService *ProductService
	port           int
	isRunning      bool
	mu             sync.RWMutex
}

// NewRappiWebhookServer creates a new webhook server
func NewRappiWebhookServer(configService *RappiConfigService, orderService *OrderService, productService *ProductService) *RappiWebhookServer {
	return &RappiWebhookServer{
		db:             database.GetDB(),
		configService:  configService,
		orderService:   orderService,
		productService: productService,
		port:           8081,
		isRunning:      false,
	}
}

// Start starts the webhook server
func (s *RappiWebhookServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("webhook server already running")
	}

	// Get port from environment variable first, then config, then default
	if envPort := os.Getenv("RAPPI_WEBHOOK_PORT"); envPort != "" {
		if port, err := strconv.Atoi(envPort); err == nil && port > 0 {
			s.port = port
		}
	} else {
		// Get port from config if not set in environment
		config, err := s.configService.GetConfig()
		if err == nil && config.WebhookPort > 0 {
			s.port = config.WebhookPort
		}
	}

	// Create router
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/webhooks/rappi/ping", s.handlePing)
	mux.HandleFunc("/webhooks/rappi/orders", s.handleNewOrder)
	mux.HandleFunc("/webhooks/rappi/cancel", s.handleOrderCancel)
	mux.HandleFunc("/webhooks/rappi/connectivity", s.handleConnectivity)
	mux.HandleFunc("/webhooks/rappi/tracking", s.handleTracking)

	// Create server
	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.port),
		Handler:      s.corsMiddleware(s.loggingMiddleware(mux)),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("[RAPPI WEBHOOK] Server starting on port %d", s.port)
		log.Printf("[RAPPI WEBHOOK] Endpoints available:")
		log.Printf("[RAPPI WEBHOOK]   GET  /health")
		log.Printf("[RAPPI WEBHOOK]   POST /webhooks/rappi/ping")
		log.Printf("[RAPPI WEBHOOK]   POST /webhooks/rappi/orders")
		log.Printf("[RAPPI WEBHOOK]   POST /webhooks/rappi/cancel")
		log.Printf("[RAPPI WEBHOOK]   POST /webhooks/rappi/connectivity")
		log.Printf("[RAPPI WEBHOOK]   POST /webhooks/rappi/tracking")

		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[RAPPI WEBHOOK] Server error: %v", err)
		}
	}()

	s.isRunning = true
	return nil
}

// Stop stops the webhook server
func (s *RappiWebhookServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning || s.server == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("error shutting down webhook server: %w", err)
	}

	s.isRunning = false
	log.Printf("[RAPPI WEBHOOK] Server stopped")
	return nil
}

// IsRunning returns whether the server is running
func (s *RappiWebhookServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunning
}

// GetPort returns the port the server is running on
func (s *RappiWebhookServer) GetPort() int {
	return s.port
}

// Middleware for CORS
func (s *RappiWebhookServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-authorization, rappi-signature")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Middleware for logging
func (s *RappiWebhookServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[RAPPI WEBHOOK] %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[RAPPI WEBHOOK] %s %s completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// validateSignature validates the HMAC signature from Rappi
func (s *RappiWebhookServer) validateSignature(r *http.Request, body []byte) bool {
	config, err := s.configService.GetConfig()
	if err != nil || config.WebhookSecret == "" {
		// If no secret configured, skip validation (for testing)
		log.Printf("[RAPPI WEBHOOK] Warning: No webhook secret configured, skipping signature validation")
		return true
	}

	signature := r.Header.Get("rappi-signature")
	if signature == "" {
		log.Printf("[RAPPI WEBHOOK] Warning: No rappi-signature header found")
		return false
	}

	// Parse signature: "t=timestamp,v1=signature"
	parts := strings.Split(signature, ",")
	var providedSignature string
	for _, part := range parts {
		if strings.HasPrefix(part, "v1=") {
			providedSignature = strings.TrimPrefix(part, "v1=")
			break
		}
	}

	if providedSignature == "" {
		log.Printf("[RAPPI WEBHOOK] Warning: Could not parse signature from header")
		return false
	}

	// Calculate expected signature
	signedPayload := "." + string(body)
	mac := hmac.New(sha256.New, []byte(config.WebhookSecret))
	mac.Write([]byte(signedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	// Compare signatures
	if !hmac.Equal([]byte(providedSignature), []byte(expectedSignature)) {
		log.Printf("[RAPPI WEBHOOK] Signature mismatch")
		return false
	}

	return true
}

// sendJSON sends a JSON response
func (s *RappiWebhookServer) sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// sendError sends an error response
func (s *RappiWebhookServer) sendError(w http.ResponseWriter, status int, message string) {
	s.sendJSON(w, status, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// Handler: Root
func (s *RappiWebhookServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		s.sendError(w, http.StatusNotFound, "Not found")
		return
	}

	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"service": "Rappi Webhook Server",
		"status":  "running",
		"version": "1.0.0",
		"endpoints": []string{
			"GET /health",
			"POST /webhooks/rappi/ping",
			"POST /webhooks/rappi/orders",
			"POST /webhooks/rappi/cancel",
			"POST /webhooks/rappi/connectivity",
			"POST /webhooks/rappi/tracking",
		},
	})
}

// Handler: Health check
func (s *RappiWebhookServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// Handler: Ping from Rappi
func (s *RappiWebhookServer) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	log.Printf("[RAPPI WEBHOOK] PING received from Rappi")
	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "OK",
		"message": "pong",
	})
}

// RappiOrderWebhook represents the webhook payload for new orders
type RappiOrderWebhook struct {
	Event       string          `json:"event"`
	OrderDetail RappiOrderDetail `json:"order_detail"`
}

// RappiOrderDetail represents the order details from Rappi
type RappiOrderDetail struct {
	OrderID            string           `json:"order_id"`
	StoreID            string           `json:"store_id"`
	CreatedAt          string           `json:"created_at"`
	MinCookingTime     int              `json:"min_cooking_time"`
	MaxCookingTime     int              `json:"max_cooking_time"`
	Items              []RappiOrderItem `json:"items"`
	Customer           RappiCustomer    `json:"customer"`
	DeliveryInfo       RappiDeliveryInfo `json:"delivery_information"`
	Totals             RappiTotals      `json:"totals"`
	PaymentMethod      string           `json:"payment_method"`
	IsPaid             bool             `json:"is_paid"`
}

// RappiOrderItem represents an item in the order
type RappiOrderItem struct {
	SKU       string              `json:"sku"`
	Name      string              `json:"name"`
	Quantity  int                 `json:"quantity"`
	UnitPrice float64             `json:"unit_price"`
	TotalPrice float64            `json:"total_price"`
	Comments  string              `json:"comments"`
	Subitems  []RappiOrderSubitem `json:"subitems"`
}

// RappiOrderSubitem represents a modifier/topping
type RappiOrderSubitem struct {
	SKU       string  `json:"sku"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}

// RappiCustomer represents customer information
type RappiCustomer struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
}

// RappiDeliveryInfo represents delivery information
type RappiDeliveryInfo struct {
	Address    string `json:"address"`
	Complement string `json:"complement"`
	City       string `json:"city"`
	Latitude   float64 `json:"lat"`
	Longitude  float64 `json:"lng"`
}

// RappiTotals represents order totals
type RappiTotals struct {
	Subtotal   float64 `json:"subtotal"`
	Discount   float64 `json:"discount"`
	Tax        float64 `json:"tax"`
	Total      float64 `json:"total"`
}

// Handler: New Order from Rappi
func (s *RappiWebhookServer) handleNewOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	// Validate signature
	if !s.validateSignature(r, body) {
		s.sendError(w, http.StatusUnauthorized, "Invalid signature")
		return
	}

	// Parse webhook payload
	var webhook RappiOrderWebhook
	if err := json.Unmarshal(body, &webhook); err != nil {
		log.Printf("[RAPPI WEBHOOK] Failed to parse order: %v", err)
		s.sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	log.Printf("[RAPPI WEBHOOK] New order received: %s", webhook.OrderDetail.OrderID)

	// Respond immediately to Rappi (they expect quick response)
	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"received": true,
		"order_id": webhook.OrderDetail.OrderID,
	})

	// Process order asynchronously
	go s.processRappiOrder(webhook)
}

// processRappiOrder processes the incoming Rappi order
func (s *RappiWebhookServer) processRappiOrder(webhook RappiOrderWebhook) {
	order := webhook.OrderDetail
	log.Printf("[RAPPI WEBHOOK] Processing order %s from store %s", order.OrderID, order.StoreID)

	// Save to rappi_orders table
	rappiOrder := models.RappiOrder{
		RappiOrderID: order.OrderID,
		StoreID:      order.StoreID,
		Status:       "RECEIVED",
		CookingTime:  order.MinCookingTime,
	}

	// Save raw data
	rawData, _ := json.Marshal(webhook)
	rappiOrder.RawData = string(rawData)

	if s.db != nil {
		if err := s.db.Create(&rappiOrder).Error; err != nil {
			log.Printf("[RAPPI WEBHOOK] Failed to save order to DB: %v", err)
		} else {
			log.Printf("[RAPPI WEBHOOK] Order %s saved to database", order.OrderID)
		}

		// Update statistics
		s.db.Model(&models.RappiConfig{}).Where("id > 0").Updates(map[string]interface{}{
			"total_orders_received": gorm.Expr("total_orders_received + 1"),
			"last_order_received":   time.Now(),
		})
	}

	// TODO: Create order in POS system
	// TODO: Auto-accept if configured
	// TODO: Send to kitchen display via WebSocket

	log.Printf("[RAPPI WEBHOOK] Order %s processed successfully", order.OrderID)
}

// RappiCancelWebhook represents the webhook payload for order cancellation
type RappiCancelWebhook struct {
	Event              string `json:"event"`
	OrderID            string `json:"order_id"`
	CancellationReason string `json:"cancellation_reason"`
}

// Handler: Order Cancellation
func (s *RappiWebhookServer) handleOrderCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	// Validate signature
	if !s.validateSignature(r, body) {
		s.sendError(w, http.StatusUnauthorized, "Invalid signature")
		return
	}

	var webhook RappiCancelWebhook
	if err := json.Unmarshal(body, &webhook); err != nil {
		s.sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	log.Printf("[RAPPI WEBHOOK] Order cancellation received: %s, reason: %s", webhook.OrderID, webhook.CancellationReason)

	// Update order status in database
	if s.db != nil {
		s.db.Model(&models.RappiOrder{}).
			Where("rappi_order_id = ?", webhook.OrderID).
			Updates(map[string]interface{}{
				"status":           "CANCELLED",
				"rejection_reason": webhook.CancellationReason,
			})
	}

	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"received": true,
		"order_id": webhook.OrderID,
	})
}

// RappiConnectivityWebhook represents connectivity change webhook
type RappiConnectivityWebhook struct {
	ExternalStoreID string `json:"external_store_id"`
	Enabled         bool   `json:"enabled"`
	Message         string `json:"message"`
}

// Handler: Store Connectivity
func (s *RappiWebhookServer) handleConnectivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	var webhook RappiConnectivityWebhook
	if err := json.Unmarshal(body, &webhook); err != nil {
		s.sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	status := "OFFLINE"
	if webhook.Enabled {
		status = "ONLINE"
	}

	log.Printf("[RAPPI WEBHOOK] Store %s connectivity changed to %s: %s",
		webhook.ExternalStoreID, status, webhook.Message)

	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"received": true,
	})
}

// RappiTrackingWebhook represents tracking update webhook
type RappiTrackingWebhook struct {
	OrderID      string  `json:"order_id"`
	CourierID    string  `json:"courier_id"`
	Latitude     float64 `json:"lat"`
	Longitude    float64 `json:"lng"`
	ETAInMillis  int64   `json:"eta_in_millis"`
}

// Handler: Delivery Tracking
func (s *RappiWebhookServer) handleTracking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	var webhook RappiTrackingWebhook
	if err := json.Unmarshal(body, &webhook); err != nil {
		s.sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	etaMinutes := webhook.ETAInMillis / 60000 // Convert ms to minutes

	log.Printf("[RAPPI WEBHOOK] Tracking update - Order: %s, Courier: %s, ETA: %d min, Location: (%.6f, %.6f)",
		webhook.OrderID, webhook.CourierID, etaMinutes, webhook.Latitude, webhook.Longitude)

	s.sendJSON(w, http.StatusOK, map[string]interface{}{
		"received": true,
	})
}
