package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"PosApp/app/models"
)

// ConfigAPIServer handles external REST API requests for system configuration
type ConfigAPIServer struct {
	server              *http.Server
	port                string
	invoiceLimitService *InvoiceLimitService
	employeeService     *EmployeeService
	orderService        *OrderService
	orderTypeService    *OrderTypeService
	productService      *ProductService
	loggerService       *LoggerService
}

// InvoiceLimitConfigRequest represents the request body for updating invoice limits
type InvoiceLimitConfigRequest struct {
	Enabled      *bool              `json:"enabled,omitempty"`
	SyncInterval *int               `json:"sync_interval,omitempty"`
	DayLimits    map[string]float64 `json:"day_limits,omitempty"`
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// AuthUserData represents the user data returned on successful authentication
type AuthUserData struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Token    string `json:"token"`
}

// APIResponse represents a standard API response
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// OrderTypeResponse - simplified order type for PWA
type OrderTypeResponse struct {
	ID           uint   `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	DisplayColor string `json:"display_color"`
	Icon         string `json:"icon"`
}

// CategoryResponse - category info for PWA
type CategoryResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Icon string `json:"icon"`
}

// ModifierGroupResponse - modifier group info for PWA
type ModifierGroupResponse struct {
	ID        uint               `json:"id"`
	Name      string             `json:"name"`
	Required  bool               `json:"required"`
	Multiple  bool               `json:"multiple"`
	MinSelect int                `json:"min_select"`
	MaxSelect int                `json:"max_select"`
	Modifiers []ModifierResponse `json:"modifiers"`
}

// ModifierResponse - modifier info for PWA
type ModifierResponse struct {
	ID          uint    `json:"id"`
	Name        string  `json:"name"`
	PriceChange float64 `json:"price_change"`
}

// ProductResponse - product with modifiers for PWA
type ProductResponse struct {
	ID             uint                    `json:"id"`
	Name           string                  `json:"name"`
	Price          float64                 `json:"price"`
	CategoryID     uint                    `json:"category_id"`
	Category       string                  `json:"category"`
	Image          string                  `json:"image"`
	ModifierGroups []ModifierGroupResponse `json:"modifier_groups"`
}

// CreateOrderRequest - order creation from PWA
type CreateOrderRequest struct {
	OrderTypeID          uint                     `json:"order_type_id"`
	EmployeeID           uint                     `json:"employee_id"`
	Items                []CreateOrderItemRequest `json:"items"`
	Notes                string                   `json:"notes"`
	DeliveryCustomerName string                   `json:"delivery_customer_name"`
	DeliveryAddress      string                   `json:"delivery_address"`
	DeliveryPhone        string                   `json:"delivery_phone"`
}

// CreateOrderItemRequest - order item for creation
type CreateOrderItemRequest struct {
	ProductID uint                         `json:"product_id"`
	Quantity  int                          `json:"quantity"`
	Notes     string                       `json:"notes"`
	Modifiers []CreateOrderModifierRequest `json:"modifiers"`
}

// CreateOrderModifierRequest - modifier for order item
type CreateOrderModifierRequest struct {
	ModifierID  uint    `json:"modifier_id"`
	PriceChange float64 `json:"price_change"`
}

// NewConfigAPIServer creates a new config API server
func NewConfigAPIServer(
	port string,
	invoiceLimitService *InvoiceLimitService,
	employeeService *EmployeeService,
	orderService *OrderService,
	orderTypeService *OrderTypeService,
	productService *ProductService,
	loggerService *LoggerService,
) *ConfigAPIServer {
	return &ConfigAPIServer{
		port:                port,
		invoiceLimitService: invoiceLimitService,
		employeeService:     employeeService,
		orderService:        orderService,
		orderTypeService:    orderTypeService,
		productService:      productService,
		loggerService:       loggerService,
	}
}

// Start starts the config API server
func (s *ConfigAPIServer) Start() error {
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", s.handleHealth)

	// API info
	mux.HandleFunc("/", s.handleInfo)

	// Invoice limit configuration endpoints
	mux.HandleFunc("/api/v1/config/invoice-limits", s.handleInvoiceLimits)
	mux.HandleFunc("/api/v1/config/invoice-limits/status", s.handleInvoiceLimitsStatus)
	mux.HandleFunc("/api/v1/config/invoice-limits/sync", s.handleInvoiceLimitsSync)

	// Authentication endpoint
	mux.HandleFunc("/api/v1/auth/login", s.handleLogin)

	// Order endpoints for PWA
	mux.HandleFunc("/api/v1/orders/types", s.handleGetOrderTypes)
	mux.HandleFunc("/api/v1/orders/products", s.handleGetProducts)
	mux.HandleFunc("/api/v1/orders", s.handleOrders)

	s.server = &http.Server{
		Addr:         s.port,
		Handler:      s.corsMiddleware(s.loggingMiddleware(mux)),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("[CONFIG API] Server starting on port %s", s.port)
	log.Printf("[CONFIG API] Endpoints available:")
	log.Printf("[CONFIG API]   GET    /health")
	log.Printf("[CONFIG API]   GET    /api/v1/config/invoice-limits")
	log.Printf("[CONFIG API]   PUT    /api/v1/config/invoice-limits")
	log.Printf("[CONFIG API]   GET    /api/v1/config/invoice-limits/status")
	log.Printf("[CONFIG API]   POST   /api/v1/config/invoice-limits/sync")
	log.Printf("[CONFIG API]   POST   /api/v1/auth/login")
	log.Printf("[CONFIG API]   GET    /api/v1/orders/types")
	log.Printf("[CONFIG API]   GET    /api/v1/orders/products")
	log.Printf("[CONFIG API]   POST   /api/v1/orders")

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("config API server error: %w", err)
	}

	return nil
}

// Stop stops the config API server
func (s *ConfigAPIServer) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		log.Printf("[CONFIG API] Server stopping...")
		return s.server.Shutdown(ctx)
	}
	return nil
}

// Middleware for CORS
func (s *ConfigAPIServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Middleware for logging
func (s *ConfigAPIServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[CONFIG API] %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[CONFIG API] %s %s completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// Helper to send JSON response
func (s *ConfigAPIServer) sendJSON(w http.ResponseWriter, status int, response APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(response)
}

// handleHealth returns server health status
func (s *ConfigAPIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Config API server is running",
		Data: map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
		},
	})
}

// handleInfo returns API information
func (s *ConfigAPIServer) handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "POS System Configuration API",
		Data: map[string]interface{}{
			"version": "1.0.0",
			"endpoints": map[string]string{
				"GET /health":                          "Health check",
				"GET /api/v1/config/invoice-limits":    "Get invoice limit configuration",
				"PUT /api/v1/config/invoice-limits":    "Update invoice limit configuration",
				"GET /api/v1/config/invoice-limits/status": "Get current invoice limit status",
				"POST /api/v1/config/invoice-limits/sync":  "Force sync with Google Sheets",
			},
		},
	})
}

// handleInvoiceLimits handles GET and PUT for invoice limit configuration
func (s *ConfigAPIServer) handleInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.getInvoiceLimits(w, r)
	case http.MethodPut:
		s.updateInvoiceLimits(w, r)
	default:
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET or PUT.",
		})
	}
}

// getInvoiceLimits returns current invoice limit configuration
func (s *ConfigAPIServer) getInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	config := s.invoiceLimitService.GetConfig()
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    config,
	})
}

// updateInvoiceLimits updates invoice limit configuration
func (s *ConfigAPIServer) updateInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	// Parse request body
	var req InvoiceLimitConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Invalid request body: %v", err),
		})
		return
	}

	// Get current config
	currentConfig := s.invoiceLimitService.GetConfig()

	// Apply updates (partial update support)
	if req.Enabled != nil {
		currentConfig.Enabled = *req.Enabled
	}
	if req.SyncInterval != nil && *req.SyncInterval > 0 {
		currentConfig.SyncInterval = *req.SyncInterval
	}
	if req.DayLimits != nil {
		// Merge day limits
		for day, limit := range req.DayLimits {
			currentConfig.DayLimits[day] = limit
		}
	}

	// Save to Google Sheets
	if err := s.invoiceLimitService.SaveConfig(currentConfig); err != nil {
		log.Printf("[CONFIG API] Error saving invoice limits: %v", err)
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to save configuration: %v", err),
		})
		return
	}

	log.Printf("[CONFIG API] Invoice limits updated successfully: enabled=%v, limits=%v",
		currentConfig.Enabled, currentConfig.DayLimits)

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Invoice limit configuration updated and synced to Google Sheets",
		Data:    currentConfig,
	})
}

// handleInvoiceLimitsStatus returns current status (available, remaining, etc.)
func (s *ConfigAPIServer) handleInvoiceLimitsStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET.",
		})
		return
	}

	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	status, err := s.invoiceLimitService.GetStatus()
	if err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to get status: %v", err),
		})
		return
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    status,
	})
}

// handleInvoiceLimitsSync forces a sync with Google Sheets
func (s *ConfigAPIServer) handleInvoiceLimitsSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	if err := s.invoiceLimitService.SyncConfig(); err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Sync failed: %v", err),
		})
		return
	}

	config := s.invoiceLimitService.GetConfig()
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Configuration synced from Google Sheets",
		Data:    config,
	})
}

// generateToken creates a simple token for the session
func (s *ConfigAPIServer) generateToken(employeeID uint) string {
	return fmt.Sprintf("%d:%d", employeeID, time.Now().UnixNano())
}

// handleLogin handles username/password login
func (s *ConfigAPIServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.employeeService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Employee service not available",
		})
		return
	}

	// Parse request body
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	// Validate required fields
	if req.Username == "" || req.Password == "" {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "Username and password are required",
		})
		return
	}

	// Authenticate
	employee, err := s.employeeService.AuthenticateEmployee(req.Username, req.Password)
	if err != nil {
		log.Printf("[CONFIG API] Failed login attempt for user: %s", req.Username)
		s.sendJSON(w, http.StatusUnauthorized, APIResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
		return
	}

	// Generate token
	token := s.generateToken(employee.ID)

	log.Printf("[CONFIG API] Successful login for user: %s (ID: %d, Role: %s)", employee.Username, employee.ID, employee.Role)

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Login successful",
		Data: AuthUserData{
			ID:       employee.ID,
			Name:     employee.Name,
			Username: employee.Username,
			Role:     employee.Role,
			Email:    employee.Email,
			Phone:    employee.Phone,
			Token:    token,
		},
	})
}

// handleGetOrderTypes returns active order types for the PWA
func (s *ConfigAPIServer) handleGetOrderTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET.",
		})
		return
	}

	if s.orderTypeService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Order type service not available",
		})
		return
	}

	orderTypes, err := s.orderTypeService.GetActiveOrderTypes()
	if err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to get order types: %v", err),
		})
		return
	}

	// Convert to response format
	response := make([]OrderTypeResponse, len(orderTypes))
	for i, ot := range orderTypes {
		response[i] = OrderTypeResponse{
			ID:           ot.ID,
			Code:         ot.Code,
			Name:         ot.Name,
			DisplayColor: ot.DisplayColor,
			Icon:         ot.Icon,
		}
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    response,
	})
}

// handleGetProducts returns products with categories and modifiers for the PWA
func (s *ConfigAPIServer) handleGetProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET.",
		})
		return
	}

	if s.productService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Product service not available",
		})
		return
	}

	// Get all categories
	categories, err := s.productService.GetAllCategories()
	if err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to get categories: %v", err),
		})
		return
	}

	// Get all products with modifiers
	products, err := s.productService.GetAllProducts()
	if err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to get products: %v", err),
		})
		return
	}

	// Convert categories to response format
	categoryResponses := make([]CategoryResponse, len(categories))
	for i, c := range categories {
		categoryResponses[i] = CategoryResponse{
			ID:   c.ID,
			Name: c.Name,
			Icon: c.Icon,
		}
	}

	// Convert products to response format
	productResponses := make([]ProductResponse, 0, len(products))
	for _, p := range products {
		if !p.IsActive {
			continue
		}

		// Get category name
		categoryName := ""
		if p.Category != nil {
			categoryName = p.Category.Name
		}

		// Group modifiers by their group
		modifierGroupMap := make(map[uint]*ModifierGroupResponse)
		for _, m := range p.Modifiers {
			if m.ModifierGroup == nil {
				continue
			}
			groupID := m.ModifierGroup.ID
			if _, exists := modifierGroupMap[groupID]; !exists {
				modifierGroupMap[groupID] = &ModifierGroupResponse{
					ID:        m.ModifierGroup.ID,
					Name:      m.ModifierGroup.Name,
					Required:  m.ModifierGroup.Required,
					Multiple:  m.ModifierGroup.Multiple,
					MinSelect: m.ModifierGroup.MinSelect,
					MaxSelect: m.ModifierGroup.MaxSelect,
					Modifiers: []ModifierResponse{},
				}
			}
			modifierGroupMap[groupID].Modifiers = append(modifierGroupMap[groupID].Modifiers, ModifierResponse{
				ID:          m.ID,
				Name:        m.Name,
				PriceChange: m.PriceChange,
			})
		}

		// Convert map to slice
		modifierGroups := make([]ModifierGroupResponse, 0, len(modifierGroupMap))
		for _, mg := range modifierGroupMap {
			modifierGroups = append(modifierGroups, *mg)
		}

		productResponses = append(productResponses, ProductResponse{
			ID:             p.ID,
			Name:           p.Name,
			Price:          p.Price,
			CategoryID:     p.CategoryID,
			Category:       categoryName,
			Image:          p.Image,
			ModifierGroups: modifierGroups,
		})
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"categories": categoryResponses,
			"products":   productResponses,
		},
	})
}

// handleOrders handles order creation from PWA
func (s *ConfigAPIServer) handleOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.orderService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Order service not available",
		})
		return
	}

	// Parse request body
	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	// Validate required fields
	if req.OrderTypeID == 0 {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "Order type is required",
		})
		return
	}

	if len(req.Items) == 0 {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   "At least one item is required",
		})
		return
	}

	// Build order items
	orderItems := make([]models.OrderItem, len(req.Items))
	for i, item := range req.Items {
		// Get product to get the price
		product, err := s.productService.GetProduct(item.ProductID)
		if err != nil {
			s.sendJSON(w, http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   fmt.Sprintf("Product not found: %d", item.ProductID),
			})
			return
		}

		// Build modifiers
		modifiers := make([]models.OrderItemModifier, len(item.Modifiers))
		for j, mod := range item.Modifiers {
			modifiers[j] = models.OrderItemModifier{
				ModifierID:  mod.ModifierID,
				PriceChange: mod.PriceChange,
			}
		}

		orderItems[i] = models.OrderItem{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			UnitPrice: product.Price,
			Notes:     item.Notes,
			Modifiers: modifiers,
		}
	}

	// Create the order
	order := &models.Order{
		OrderTypeID:          &req.OrderTypeID,
		Status:               models.OrderStatusPending,
		Items:                orderItems,
		Notes:                req.Notes,
		EmployeeID:           req.EmployeeID,
		Source:               "pwa",
		DeliveryCustomerName: req.DeliveryCustomerName,
		DeliveryAddress:      req.DeliveryAddress,
		DeliveryPhone:        req.DeliveryPhone,
	}

	createdOrder, err := s.orderService.CreateOrder(order)
	if err != nil {
		log.Printf("[CONFIG API] Failed to create order: %v", err)
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to create order: %v", err),
		})
		return
	}

	log.Printf("[CONFIG API] Order created successfully: %s (ID: %d)", createdOrder.OrderNumber, createdOrder.ID)

	s.sendJSON(w, http.StatusCreated, APIResponse{
		Success: true,
		Message: "Order created successfully",
		Data: map[string]interface{}{
			"order_id":     createdOrder.ID,
			"order_number": createdOrder.OrderNumber,
			"total":        createdOrder.Total,
		},
	})
}
