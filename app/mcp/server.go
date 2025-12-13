package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// MCPServer implements the MCP protocol with HTTP transport
type MCPServer struct {
	httpServer    *http.Server
	port          int
	apiKey        string
	allowedIPs    []string
	readOnlyMode  bool
	disabledTools []string
	isRunning     bool
	mu            sync.RWMutex

	// Service dependencies
	deps *ServiceDependencies
}

// ServiceDependencies holds references to all services needed by MCP tools
type ServiceDependencies struct {
	ProductService    ProductServiceInterface
	SalesService      SalesServiceInterface
	OrderService      OrderServiceInterface
	IngredientService IngredientServiceInterface
	DashboardService  DashboardServiceInterface
	ReportsService    ReportsServiceInterface
}

// ProductServiceInterface defines methods needed from ProductService
type ProductServiceInterface interface {
	GetAllProducts() ([]map[string]interface{}, error)
	GetProduct(id uint) (map[string]interface{}, error)
	CreateProduct(data map[string]interface{}) (map[string]interface{}, error)
	UpdateProduct(id uint, data map[string]interface{}) (map[string]interface{}, error)
	DeleteProduct(id uint) error
	SearchProducts(query string, categoryID *uint) ([]map[string]interface{}, error)
	GetAllCategories() ([]map[string]interface{}, error)
	CreateCategory(data map[string]interface{}) (map[string]interface{}, error)
	AdjustStock(productID uint, quantity int, reason string, movementType string) error
	GetInventoryMovements(productID uint) ([]map[string]interface{}, error)
	GetLowStockProducts() ([]map[string]interface{}, error)
	GetModifierGroupsForProduct(productID uint) ([]map[string]interface{}, error)
}

// SalesServiceInterface defines methods needed from SalesService
type SalesServiceInterface interface {
	GetCustomers() ([]map[string]interface{}, error)
	GetCustomer(id uint) (map[string]interface{}, error)
	CreateCustomer(data map[string]interface{}) (map[string]interface{}, error)
	UpdateCustomer(id uint, data map[string]interface{}) (map[string]interface{}, error)
	SearchCustomers(query string) ([]map[string]interface{}, error)
	ProcessSale(data map[string]interface{}) (map[string]interface{}, error)
	GetSale(id uint) (map[string]interface{}, error)
	GetSalesByDateRange(from, to string) ([]map[string]interface{}, error)
	GetTodaySales() ([]map[string]interface{}, error)
	RefundSale(id uint, reason string) error
}

// OrderServiceInterface defines methods needed from OrderService
type OrderServiceInterface interface {
	CreateOrder(data map[string]interface{}) (map[string]interface{}, error)
	GetOrder(id uint) (map[string]interface{}, error)
	UpdateOrderStatus(id uint, status string) error
	AddItemsToOrder(orderID uint, items []map[string]interface{}) error
	RemoveItemFromOrder(orderID uint, itemID uint) error
	GetOrdersByStatus(status string) ([]map[string]interface{}, error)
	GetOrdersByDateRange(from, to string) ([]map[string]interface{}, error)
	SendOrderToKitchen(id uint) error
	MarkOrderReady(id uint) error
}

// IngredientServiceInterface defines methods needed from IngredientService
type IngredientServiceInterface interface {
	GetAllIngredients() ([]map[string]interface{}, error)
	GetIngredient(id uint) (map[string]interface{}, error)
	CreateIngredient(data map[string]interface{}) (map[string]interface{}, error)
	UpdateIngredient(id uint, data map[string]interface{}) (map[string]interface{}, error)
	AdjustIngredientStock(id uint, quantity float64, reason string, movementType string) error
	GetProductIngredients(productID uint) ([]map[string]interface{}, error)
	GetLowStockIngredients() ([]map[string]interface{}, error)
}

// DashboardServiceInterface defines methods needed from DashboardService
type DashboardServiceInterface interface {
	GetDashboardStats() (map[string]interface{}, error)
	GetTopSellingItems(limit int) ([]map[string]interface{}, error)
	GetCashRegisterStatus() (map[string]interface{}, error)
}

// ReportsServiceInterface defines methods needed from ReportsService
type ReportsServiceInterface interface {
	GetDailySalesReport(date string) (map[string]interface{}, error)
	GetSalesByPeriod(from, to, groupBy string) ([]map[string]interface{}, error)
	GetSalesByPaymentMethod(from, to string) ([]map[string]interface{}, error)
	GetSalesByEmployee(from, to string) ([]map[string]interface{}, error)
	GetInventoryReport() (map[string]interface{}, error)
}

// NewMCPServer creates a new MCP server instance
func NewMCPServer(port int, apiKey string, allowedIPs string, readOnlyMode bool, disabledTools string, deps *ServiceDependencies) *MCPServer {
	// Parse allowed IPs
	var ips []string
	if allowedIPs != "" {
		for _, ip := range strings.Split(allowedIPs, ",") {
			ips = append(ips, strings.TrimSpace(ip))
		}
	}

	// Parse disabled tools
	var disabled []string
	if disabledTools != "" {
		for _, tool := range strings.Split(disabledTools, ",") {
			disabled = append(disabled, strings.TrimSpace(tool))
		}
	}

	s := &MCPServer{
		port:          port,
		apiKey:        apiKey,
		allowedIPs:    ips,
		readOnlyMode:  readOnlyMode,
		disabledTools: disabled,
		deps:          deps,
	}

	return s
}

// Start starts the MCP server
func (s *MCPServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("server already running")
	}

	// Create HTTP handler with SSE transport
	handler := s.createHTTPHandler()

	s.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.port),
		Handler: handler,
	}

	go func() {
		log.Printf("MCP Server starting on port %d", s.port)
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("MCP Server error: %v", err)
		}
	}()

	s.isRunning = true
	return nil
}

// Stop stops the MCP server
func (s *MCPServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return nil
	}

	if s.httpServer != nil {
		if err := s.httpServer.Shutdown(context.Background()); err != nil {
			return err
		}
	}

	s.isRunning = false
	log.Printf("MCP Server stopped")
	return nil
}

// IsRunning returns whether the server is running
func (s *MCPServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunning
}

// createHTTPHandler creates the HTTP handler with middleware
func (s *MCPServer) createHTTPHandler() http.Handler {
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"server":  "POS-MCP-Server",
			"version": "1.0.0",
		})
	})

	// MCP SSE endpoint
	mux.HandleFunc("/sse", s.handleSSE)

	// MCP message endpoint (for JSON-RPC over HTTP POST)
	mux.HandleFunc("/message", s.handleMessage)

	// Wrap with middleware
	return s.authMiddleware(s.corsMiddleware(mux))
}

// corsMiddleware adds CORS headers
func (s *MCPServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// authMiddleware handles API key and IP validation
func (s *MCPServer) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health check
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Check API key if configured
		if s.apiKey != "" {
			apiKey := r.Header.Get("X-API-Key")
			if apiKey == "" {
				apiKey = r.URL.Query().Get("api_key")
			}
			if apiKey != s.apiKey {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
		}

		// Check allowed IPs if configured
		if len(s.allowedIPs) > 0 {
			clientIP := getClientIP(r)
			allowed := false
			for _, ip := range s.allowedIPs {
				if ip == clientIP || ip == "*" {
					allowed = true
					break
				}
			}
			if !allowed {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// SSE client for tracking connections
type sseClient struct {
	id       string
	messages chan []byte
	done     chan struct{}
}

var (
	sseClients   = make(map[string]*sseClient)
	sseClientsMu sync.RWMutex
)

// handleSSE handles both SSE connections (GET) and Streamable HTTP transport (POST)
func (s *MCPServer) handleSSE(w http.ResponseWriter, r *http.Request) {
	// Handle POST for Streamable HTTP transport (used by mcp-remote with http-first strategy)
	if r.Method == "POST" {
		s.handleStreamableHTTP(w, r)
		return
	}

	// Handle GET for traditional SSE transport
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	// Create client ID
	clientID := fmt.Sprintf("client-%d", time.Now().UnixNano())
	client := &sseClient{
		id:       clientID,
		messages: make(chan []byte, 100),
		done:     make(chan struct{}),
	}

	// Register client
	sseClientsMu.Lock()
	sseClients[clientID] = client
	sseClientsMu.Unlock()

	defer func() {
		sseClientsMu.Lock()
		delete(sseClients, clientID)
		sseClientsMu.Unlock()
		close(client.done)
	}()

	// Get the host from request
	host := r.Host
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}

	// Send endpoint event - tells client where to POST messages
	messageURL := fmt.Sprintf("%s://%s/message?session=%s", scheme, host, clientID)
	fmt.Fprintf(w, "event: endpoint\ndata: %s\n\n", messageURL)
	flusher.Flush()

	log.Printf("MCP SSE client connected: %s, message endpoint: %s", clientID, messageURL)

	// Send messages to client
	for {
		select {
		case msg := <-client.messages:
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", string(msg))
			flusher.Flush()
		case <-r.Context().Done():
			log.Printf("MCP SSE client disconnected: %s", clientID)
			return
		case <-client.done:
			return
		}
	}
}

// handleStreamableHTTP handles the Streamable HTTP transport for MCP
// This is used by mcp-remote with http-first strategy
func (s *MCPServer) handleStreamableHTTP(w http.ResponseWriter, r *http.Request) {
	var request map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("MCP Streamable HTTP request: %v", request)

	// Handle the MCP request
	response := s.handleMCPRequest(r.Context(), request)

	log.Printf("MCP Streamable HTTP response: %v", response)

	// Send response as JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleMessage handles JSON-RPC messages
func (s *MCPServer) handleMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Get session ID from query params
	sessionID := r.URL.Query().Get("session")

	// Handle the MCP request
	response := s.handleMCPRequest(r.Context(), request)

	// If we have a session ID, send response via SSE
	if sessionID != "" {
		sseClientsMu.RLock()
		client, exists := sseClients[sessionID]
		sseClientsMu.RUnlock()

		if exists {
			responseJSON, _ := json.Marshal(response)
			select {
			case client.messages <- responseJSON:
				// Response sent via SSE
			default:
				log.Printf("MCP: Failed to send response to client %s (channel full)", sessionID)
			}
		}
	}

	// Also send response directly in the HTTP response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleMCPRequest processes MCP JSON-RPC requests
func (s *MCPServer) handleMCPRequest(ctx context.Context, request map[string]interface{}) map[string]interface{} {
	method, _ := request["method"].(string)
	id := request["id"]
	params, _ := request["params"].(map[string]interface{})

	switch method {
	case "initialize":
		return s.handleInitialize(id)
	case "tools/list":
		return s.handleToolsList(id)
	case "tools/call":
		return s.handleToolCall(ctx, id, params)
	default:
		return map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"error": map[string]interface{}{
				"code":    -32601,
				"message": "Method not found",
			},
		}
	}
}

// handleInitialize handles the initialize request
func (s *MCPServer) handleInitialize(id interface{}) map[string]interface{} {
	return map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
			"serverInfo": map[string]interface{}{
				"name":    "POS-MCP-Server",
				"version": "1.0.0",
			},
		},
	}
}

// isToolDisabled checks if a tool is disabled
func (s *MCPServer) isToolDisabled(toolName string) bool {
	for _, disabled := range s.disabledTools {
		if disabled == toolName {
			return true
		}
	}
	return false
}

// handleToolsList handles the tools/list request
func (s *MCPServer) handleToolsList(id interface{}) map[string]interface{} {
	allTools := s.getToolDefinitions()

	// Filter out disabled tools
	var enabledTools []map[string]interface{}
	for _, tool := range allTools {
		if name, ok := tool["name"].(string); ok {
			if !s.isToolDisabled(name) {
				enabledTools = append(enabledTools, tool)
			}
		}
	}

	return map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"tools": enabledTools,
		},
	}
}

// handleToolCall handles tool execution
func (s *MCPServer) handleToolCall(ctx context.Context, id interface{}, params map[string]interface{}) map[string]interface{} {
	toolName, _ := params["name"].(string)
	toolArgs, _ := params["arguments"].(map[string]interface{})

	// Check if tool is disabled
	if s.isToolDisabled(toolName) {
		return map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"result": map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": fmt.Sprintf("Error: Tool '%s' is disabled.", toolName),
					},
				},
				"isError": true,
			},
		}
	}

	// Check read-only mode for write operations
	if s.readOnlyMode && isWriteOperation(toolName) {
		return map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"result": map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "Error: Server is in read-only mode. Write operations are not allowed.",
					},
				},
				"isError": true,
			},
		}
	}

	// Execute the tool
	result, err := s.executeTool(ctx, toolName, toolArgs)
	if err != nil {
		return map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"result": map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": fmt.Sprintf("Error: %s", err.Error()),
					},
				},
				"isError": true,
			},
		}
	}

	// Convert result to JSON string
	resultJSON, _ := json.MarshalIndent(result, "", "  ")

	return map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result": map[string]interface{}{
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": string(resultJSON),
				},
			},
		},
	}
}

// isWriteOperation checks if a tool performs write operations
func isWriteOperation(toolName string) bool {
	writeOps := []string{
		"create_", "update_", "delete_", "adjust_",
		"add_", "remove_", "send_", "mark_", "refund_",
	}
	for _, prefix := range writeOps {
		if strings.HasPrefix(toolName, prefix) {
			return true
		}
	}
	return false
}

// getClientIP extracts client IP from request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check X-Real-IP header
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}

// getToolDefinitions returns all tool definitions for the MCP protocol
func (s *MCPServer) getToolDefinitions() []map[string]interface{} {
	tools := []map[string]interface{}{}

	// Add tools from each category
	tools = append(tools, getCustomerTools()...)
	tools = append(tools, getProductTools()...)
	tools = append(tools, getInventoryTools()...)
	tools = append(tools, getIngredientTools()...)
	tools = append(tools, getSalesTools()...)
	tools = append(tools, getOrderTools()...)
	tools = append(tools, getReportTools()...)

	return tools
}

// executeTool executes a tool by name
func (s *MCPServer) executeTool(ctx context.Context, name string, args map[string]interface{}) (interface{}, error) {
	switch {
	// Customer tools
	case strings.HasPrefix(name, "list_customers"), strings.HasPrefix(name, "get_customer"),
		strings.HasPrefix(name, "create_customer"), strings.HasPrefix(name, "update_customer"),
		strings.HasPrefix(name, "search_customers"):
		return executeCustomerTool(s.deps.SalesService, name, args)

	// Product tools
	case strings.HasPrefix(name, "list_products"), strings.HasPrefix(name, "get_product"),
		strings.HasPrefix(name, "create_product"), strings.HasPrefix(name, "update_product"),
		strings.HasPrefix(name, "delete_product"), strings.HasPrefix(name, "search_products"),
		strings.HasPrefix(name, "get_product_modifiers"), strings.HasPrefix(name, "list_categories"),
		strings.HasPrefix(name, "create_category"):
		return executeProductTool(s.deps.ProductService, name, args)

	// Inventory tools
	case strings.HasPrefix(name, "get_inventory"), strings.HasPrefix(name, "adjust_stock"),
		strings.HasPrefix(name, "get_stock_movements"), strings.HasPrefix(name, "get_low_stock"):
		return executeInventoryTool(s.deps.ProductService, name, args)

	// Ingredient tools
	case strings.HasPrefix(name, "list_ingredients"), strings.HasPrefix(name, "get_ingredient"),
		strings.HasPrefix(name, "create_ingredient"), strings.HasPrefix(name, "update_ingredient"),
		strings.HasPrefix(name, "adjust_ingredient"), strings.HasPrefix(name, "get_product_recipe"):
		return executeIngredientTool(s.deps.IngredientService, name, args)

	// Sales tools
	case strings.HasPrefix(name, "create_sale"), strings.HasPrefix(name, "create_electronic"),
		strings.HasPrefix(name, "get_sale"), strings.HasPrefix(name, "list_sales"),
		strings.HasPrefix(name, "get_today"), strings.HasPrefix(name, "refund_sale"):
		return executeSalesTool(s.deps.SalesService, name, args)

	// Order tools
	case strings.HasPrefix(name, "create_order"), strings.HasPrefix(name, "get_order"),
		strings.HasPrefix(name, "update_order"), strings.HasPrefix(name, "add_items"),
		strings.HasPrefix(name, "remove_item"), strings.HasPrefix(name, "list_orders"),
		strings.HasPrefix(name, "send_to_kitchen"), strings.HasPrefix(name, "mark_order"),
		strings.HasPrefix(name, "get_pending"):
		return executeOrderTool(s.deps.OrderService, name, args)

	// Report tools
	case strings.HasPrefix(name, "get_daily"), strings.HasPrefix(name, "get_sales_by"),
		strings.HasPrefix(name, "get_top"), strings.HasPrefix(name, "get_cash_register"),
		strings.HasPrefix(name, "get_inventory_report"):
		return executeReportTool(s.deps.DashboardService, s.deps.ReportsService, name, args)

	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}
