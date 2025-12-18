package services

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"PosApp/app/database"
	"PosApp/app/mcp"
	"PosApp/app/models"
)

// MCPService manages the MCP server
type MCPService struct {
	server *mcp.MCPServer
	config *models.MCPConfig
	mu     sync.RWMutex

	// Service adapters
	productAdapter    *ProductMCPAdapter
	salesAdapter      *SalesMCPAdapter
	orderAdapter      *OrderMCPAdapter
	ingredientAdapter *IngredientMCPAdapter
	dashboardAdapter  *DashboardMCPAdapter
	reportsAdapter    *ReportsMCPAdapter
}

// NewMCPService creates a new MCP service
func NewMCPService(
	productService *ProductService,
	salesService *SalesService,
	orderService *OrderService,
	ingredientService *IngredientService,
	dashboardService *DashboardService,
	reportsService *ReportsService,
) *MCPService {
	svc := &MCPService{
		productAdapter:    NewProductMCPAdapter(productService),
		salesAdapter:      NewSalesMCPAdapter(salesService),
		orderAdapter:      NewOrderMCPAdapter(orderService),
		ingredientAdapter: NewIngredientMCPAdapter(ingredientService),
		dashboardAdapter:  NewDashboardMCPAdapter(dashboardService),
		reportsAdapter:    NewReportsMCPAdapter(reportsService),
	}

	// Load config
	svc.loadConfig()

	return svc
}

// loadConfig loads the MCP configuration from database
func (s *MCPService) loadConfig() {
	db := database.GetDB()
	if db == nil {
		s.config = &models.MCPConfig{
			Enabled: false,
			Port:    8090,
		}
		return
	}

	var config models.MCPConfig
	result := db.First(&config)
	if result.Error != nil {
		// Create default config
		config = models.MCPConfig{
			Enabled:      false,
			Port:         8090,
			ReadOnlyMode: false,
		}
		db.Create(&config)
	}
	s.config = &config
}

// GetConfig returns the current MCP configuration
func (s *MCPService) GetConfig() models.MCPConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.config == nil {
		return models.MCPConfig{}
	}
	return *s.config
}

// UpdateConfig updates the MCP configuration
func (s *MCPService) UpdateConfig(config models.MCPConfig) error {
	s.mu.Lock()

	db := database.GetDB()
	if db == nil {
		s.mu.Unlock()
		return fmt.Errorf("database not available")
	}

	// Check if server is running and if disabled_tools changed
	serverWasRunning := s.server != nil && s.server.IsRunning()
	disabledToolsChanged := s.config != nil && s.config.DisabledTools != config.DisabledTools

	// Update in database
	if s.config != nil && s.config.ID > 0 {
		config.ID = s.config.ID
	}
	if err := db.Save(&config).Error; err != nil {
		s.mu.Unlock()
		return err
	}

	s.config = &config
	s.mu.Unlock()

	// If server was running and disabled_tools changed, restart to apply changes
	if serverWasRunning && disabledToolsChanged {
		log.Printf("MCP: Disabled tools changed, restarting server to apply changes...")
		if err := s.Stop(); err != nil {
			log.Printf("MCP: Error stopping server for restart: %v", err)
		}
		if err := s.Start(); err != nil {
			log.Printf("MCP: Error restarting server: %v", err)
			return fmt.Errorf("configuration saved but server restart failed: %w", err)
		}
		log.Printf("MCP: Server restarted with updated disabled tools")
	}

	return nil
}

// Start starts the MCP server
func (s *MCPService) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil && s.server.IsRunning() {
		return fmt.Errorf("server already running")
	}

	if s.config == nil {
		return fmt.Errorf("configuration not loaded")
	}

	// Create service dependencies
	deps := &mcp.ServiceDependencies{
		ProductService:    s.productAdapter,
		SalesService:      s.salesAdapter,
		OrderService:      s.orderAdapter,
		IngredientService: s.ingredientAdapter,
		DashboardService:  s.dashboardAdapter,
		ReportsService:    s.reportsAdapter,
	}

	// Create and start server
	s.server = mcp.NewMCPServer(
		s.config.Port,
		s.config.APIKey,
		s.config.AllowedIPs,
		s.config.ReadOnlyMode,
		s.config.DisabledTools,
		deps,
	)

	if err := s.server.Start(); err != nil {
		return err
	}

	// Update config to enabled
	s.config.Enabled = true
	db := database.GetDB()
	if db != nil {
		db.Save(s.config)
	}

	log.Printf("MCP Server started on port %d", s.config.Port)
	return nil
}

// Stop stops the MCP server
func (s *MCPService) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server == nil {
		return nil
	}

	if err := s.server.Stop(); err != nil {
		return err
	}

	s.server = nil

	// Update config to disabled
	s.config.Enabled = false
	db := database.GetDB()
	if db != nil {
		db.Save(s.config)
	}

	log.Printf("MCP Server stopped")
	return nil
}

// GetStatus returns the current server status
func (s *MCPService) GetStatus() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	status := map[string]interface{}{
		"configured": s.config != nil,
		"running":    false,
		"port":       0,
	}

	if s.config != nil {
		status["port"] = s.config.Port
		status["api_key_set"] = s.config.APIKey != ""
		status["read_only_mode"] = s.config.ReadOnlyMode
	}

	if s.server != nil {
		status["running"] = s.server.IsRunning()
	}

	return status
}

// getAllTools returns the complete list of MCP tools with their metadata
func getAllTools() []map[string]interface{} {
	return []map[string]interface{}{
		// Customers
		{"name": "list_customers", "category": "Clientes", "description": "Listar todos los clientes"},
		{"name": "get_customer", "category": "Clientes", "description": "Obtener cliente por ID"},
		{"name": "create_customer", "category": "Clientes", "description": "Crear nuevo cliente"},
		{"name": "update_customer", "category": "Clientes", "description": "Actualizar cliente"},
		{"name": "search_customers", "category": "Clientes", "description": "Buscar clientes"},

		// Products
		{"name": "list_products", "category": "Productos", "description": "Listar todos los productos"},
		{"name": "get_product", "category": "Productos", "description": "Obtener producto por ID"},
		{"name": "create_product", "category": "Productos", "description": "Crear nuevo producto"},
		{"name": "update_product", "category": "Productos", "description": "Actualizar producto"},
		{"name": "delete_product", "category": "Productos", "description": "Eliminar producto"},
		{"name": "search_products", "category": "Productos", "description": "Buscar productos"},
		{"name": "get_product_modifiers", "category": "Productos", "description": "Obtener modificadores de producto"},
		{"name": "list_categories", "category": "Productos", "description": "Listar categorías"},
		{"name": "create_category", "category": "Productos", "description": "Crear categoría"},

		// Inventory
		{"name": "get_inventory_status", "category": "Inventario", "description": "Estado del inventario"},
		{"name": "adjust_stock", "category": "Inventario", "description": "Ajustar stock de producto"},
		{"name": "get_stock_movements", "category": "Inventario", "description": "Historial de movimientos"},
		{"name": "get_low_stock_alerts", "category": "Inventario", "description": "Alertas de stock bajo"},

		// Ingredients
		{"name": "list_ingredients", "category": "Ingredientes", "description": "Listar ingredientes"},
		{"name": "get_ingredient", "category": "Ingredientes", "description": "Obtener ingrediente por ID"},
		{"name": "create_ingredient", "category": "Ingredientes", "description": "Crear ingrediente"},
		{"name": "update_ingredient", "category": "Ingredientes", "description": "Actualizar ingrediente"},
		{"name": "adjust_ingredient_stock", "category": "Ingredientes", "description": "Ajustar stock de ingrediente"},
		{"name": "get_product_recipe", "category": "Ingredientes", "description": "Obtener receta de producto"},

		// Sales
		{"name": "create_sale", "category": "Ventas", "description": "Crear venta simple"},
		{"name": "create_electronic_invoice", "category": "Ventas", "description": "Crear factura electrónica"},
		{"name": "create_electronic_invoice_consumidor_final", "category": "Ventas", "description": "Factura electrónica consumidor final"},
		{"name": "get_sale", "category": "Ventas", "description": "Obtener venta por ID"},
		{"name": "list_sales", "category": "Ventas", "description": "Listar ventas"},
		{"name": "get_today_sales", "category": "Ventas", "description": "Ventas de hoy"},
		{"name": "refund_sale", "category": "Ventas", "description": "Reembolsar venta"},

		// Orders
		{"name": "create_order", "category": "Órdenes", "description": "Crear orden"},
		{"name": "get_order", "category": "Órdenes", "description": "Obtener orden por ID"},
		{"name": "update_order_status", "category": "Órdenes", "description": "Actualizar estado de orden"},
		{"name": "add_items_to_order", "category": "Órdenes", "description": "Agregar items a orden"},
		{"name": "remove_item_from_order", "category": "Órdenes", "description": "Eliminar item de orden"},
		{"name": "list_orders", "category": "Órdenes", "description": "Listar órdenes"},
		{"name": "send_to_kitchen", "category": "Órdenes", "description": "Enviar a cocina"},
		{"name": "mark_order_ready", "category": "Órdenes", "description": "Marcar orden como lista"},
		{"name": "get_pending_orders", "category": "Órdenes", "description": "Órdenes pendientes"},

		// Reports
		{"name": "get_daily_sales_report", "category": "Reportes", "description": "Reporte diario de ventas"},
		{"name": "get_sales_by_period", "category": "Reportes", "description": "Ventas por período"},
		{"name": "get_top_products", "category": "Reportes", "description": "Productos más vendidos"},
		{"name": "get_sales_by_payment_method", "category": "Reportes", "description": "Ventas por método de pago"},
		{"name": "get_sales_by_employee", "category": "Reportes", "description": "Ventas por empleado"},
		{"name": "get_cash_register_status", "category": "Reportes", "description": "Estado de caja"},
		{"name": "get_inventory_report", "category": "Reportes", "description": "Reporte de inventario"},
	}
}

// isToolDisabled checks if a tool is in the disabled list
func (s *MCPService) isToolDisabled(toolName string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.config == nil || s.config.DisabledTools == "" {
		return false
	}

	disabledList := strings.Split(s.config.DisabledTools, ",")
	for _, disabled := range disabledList {
		if strings.TrimSpace(disabled) == toolName {
			return true
		}
	}
	return false
}

// GetAvailableTools returns the list of all MCP tools with their enabled status
func (s *MCPService) GetAvailableTools() []map[string]interface{} {
	allTools := getAllTools()
	result := make([]map[string]interface{}, len(allTools))

	for i, tool := range allTools {
		toolCopy := make(map[string]interface{})
		for k, v := range tool {
			toolCopy[k] = v
		}
		toolCopy["enabled"] = !s.isToolDisabled(tool["name"].(string))
		result[i] = toolCopy
	}

	return result
}

// GetEnabledTools returns only the enabled tools (for MCP server)
func (s *MCPService) GetEnabledTools() []map[string]interface{} {
	allTools := getAllTools()
	var result []map[string]interface{}

	for _, tool := range allTools {
		if !s.isToolDisabled(tool["name"].(string)) {
			result = append(result, tool)
		}
	}

	return result
}

// AutoStart starts the server if enabled in config
func (s *MCPService) AutoStart() {
	s.mu.RLock()
	enabled := s.config != nil && s.config.Enabled
	s.mu.RUnlock()

	if enabled {
		if err := s.Start(); err != nil {
			log.Printf("Failed to auto-start MCP server: %v", err)
		}
	}
}

// ========== Service Adapters ==========
// These adapters convert the actual services to the MCP interfaces

// ProductMCPAdapter adapts ProductService to mcp.ProductServiceInterface
type ProductMCPAdapter struct {
	svc *ProductService
}

func NewProductMCPAdapter(svc *ProductService) *ProductMCPAdapter {
	return &ProductMCPAdapter{svc: svc}
}

func (a *ProductMCPAdapter) GetAllProducts() ([]map[string]interface{}, error) {
	products, err := a.svc.GetAllProducts()
	if err != nil {
		return nil, err
	}
	return toMapSlice(products), nil
}

func (a *ProductMCPAdapter) GetProduct(id uint) (map[string]interface{}, error) {
	product, err := a.svc.GetProduct(id)
	if err != nil {
		return nil, err
	}
	return toMap(product), nil
}

func (a *ProductMCPAdapter) CreateProduct(data map[string]interface{}) (map[string]interface{}, error) {
	var product models.Product
	if err := mapToStruct(data, &product); err != nil {
		return nil, err
	}
	createdProduct, err := a.svc.CreateProduct(&product)
	if err != nil {
		return nil, err
	}
	return toMap(createdProduct), nil
}

func (a *ProductMCPAdapter) UpdateProduct(id uint, data map[string]interface{}) (map[string]interface{}, error) {
	// Get existing product first for partial update
	existingProduct, err := a.svc.GetProduct(id)
	if err != nil {
		return nil, fmt.Errorf("product not found: %w", err)
	}

	// Apply only the fields that were provided in the update
	if name, ok := data["name"].(string); ok {
		existingProduct.Name = name
	}
	if price, ok := data["price"].(float64); ok {
		existingProduct.Price = price
	}
	if description, ok := data["description"].(string); ok {
		existingProduct.Description = description
	}
	if categoryID, ok := data["category_id"].(float64); ok {
		existingProduct.CategoryID = uint(categoryID)
	}
	if stock, ok := data["stock"].(float64); ok {
		existingProduct.Stock = int(stock)
	}
	if minStock, ok := data["minimum_stock"].(float64); ok {
		existingProduct.MinimumStock = int(minStock)
	}
	if isActive, ok := data["is_active"].(bool); ok {
		existingProduct.IsActive = isActive
	}
	if trackInventory, ok := data["track_inventory"].(bool); ok {
		existingProduct.TrackInventory = trackInventory
	}
	if hasVariablePrice, ok := data["has_variable_price"].(bool); ok {
		existingProduct.HasVariablePrice = hasVariablePrice
	}
	if taxTypeID, ok := data["tax_type_id"].(float64); ok {
		existingProduct.TaxTypeID = int(taxTypeID)
	}
	if unitMeasureID, ok := data["unit_measure_id"].(float64); ok {
		existingProduct.UnitMeasureID = int(unitMeasureID)
	}
	if image, ok := data["image"].(string); ok {
		existingProduct.Image = image
	}

	if err := a.svc.UpdateProduct(existingProduct); err != nil {
		return nil, err
	}
	return toMap(existingProduct), nil
}

func (a *ProductMCPAdapter) DeleteProduct(id uint) error {
	return a.svc.DeleteProduct(id)
}

func (a *ProductMCPAdapter) SearchProducts(query string, categoryID *uint) ([]map[string]interface{}, error) {
	products, err := a.svc.SearchProducts(query)
	if err != nil {
		return nil, err
	}
	return toMapSlice(products), nil
}

func (a *ProductMCPAdapter) GetAllCategories() ([]map[string]interface{}, error) {
	categories, err := a.svc.GetAllCategories()
	if err != nil {
		return nil, err
	}
	return toMapSlice(categories), nil
}

func (a *ProductMCPAdapter) CreateCategory(data map[string]interface{}) (map[string]interface{}, error) {
	var category models.Category
	if err := mapToStruct(data, &category); err != nil {
		return nil, err
	}
	created, err := a.svc.CreateCategory(&category)
	if err != nil {
		return nil, err
	}
	return toMap(created), nil
}

func (a *ProductMCPAdapter) AdjustStock(productID uint, quantity int, reason string, movementType string) error {
	// movementType is ignored - AdjustStock uses quantity sign for direction
	// employeeID set to 0 for MCP operations
	return a.svc.AdjustStock(productID, quantity, reason, 0)
}

func (a *ProductMCPAdapter) GetInventoryMovements(productID uint) ([]map[string]interface{}, error) {
	movements, err := a.svc.GetInventoryMovements(productID)
	if err != nil {
		return nil, err
	}
	return toMapSlice(movements), nil
}

func (a *ProductMCPAdapter) GetLowStockProducts() ([]map[string]interface{}, error) {
	// Default threshold of 10 for low stock alerts
	products, err := a.svc.GetLowStockProducts(10)
	if err != nil {
		return nil, err
	}
	return toMapSlice(products), nil
}

func (a *ProductMCPAdapter) GetModifierGroupsForProduct(productID uint) ([]map[string]interface{}, error) {
	// GetModifierGroups returns all modifier groups; productID filtering would need to be done differently
	// For now, return all modifier groups
	groups, err := a.svc.GetModifierGroups()
	if err != nil {
		return nil, err
	}
	return toMapSlice(groups), nil
}

// SalesMCPAdapter adapts SalesService to mcp.SalesServiceInterface
type SalesMCPAdapter struct {
	svc *SalesService
}

func NewSalesMCPAdapter(svc *SalesService) *SalesMCPAdapter {
	return &SalesMCPAdapter{svc: svc}
}

func (a *SalesMCPAdapter) GetCustomers() ([]map[string]interface{}, error) {
	customers, err := a.svc.GetCustomers()
	if err != nil {
		return nil, err
	}
	return toMapSlice(customers), nil
}

func (a *SalesMCPAdapter) GetCustomer(id uint) (map[string]interface{}, error) {
	customer, err := a.svc.GetCustomer(id)
	if err != nil {
		return nil, err
	}
	return toMap(customer), nil
}

func (a *SalesMCPAdapter) CreateCustomer(data map[string]interface{}) (map[string]interface{}, error) {
	var customer models.Customer
	if err := mapToStruct(data, &customer); err != nil {
		return nil, err
	}
	err := a.svc.CreateCustomer(&customer)
	if err != nil {
		return nil, err
	}
	return toMap(customer), nil
}

func (a *SalesMCPAdapter) UpdateCustomer(id uint, data map[string]interface{}) (map[string]interface{}, error) {
	// Get existing customer first for partial update
	existingCustomer, err := a.svc.GetCustomer(id)
	if err != nil {
		return nil, fmt.Errorf("customer not found: %w", err)
	}

	// Apply only the fields that were provided in the update
	if name, ok := data["name"].(string); ok {
		existingCustomer.Name = name
	}
	if email, ok := data["email"].(string); ok {
		existingCustomer.Email = email
	}
	if phone, ok := data["phone"].(string); ok {
		existingCustomer.Phone = phone
	}
	if address, ok := data["address"].(string); ok {
		existingCustomer.Address = address
	}
	if identificationType, ok := data["identification_type"].(string); ok {
		existingCustomer.IdentificationType = identificationType
	}
	if identificationNumber, ok := data["identification_number"].(string); ok {
		existingCustomer.IdentificationNumber = identificationNumber
	}
	if dv, ok := data["dv"].(string); ok {
		existingCustomer.DV = &dv
	}
	if isActive, ok := data["is_active"].(bool); ok {
		existingCustomer.IsActive = isActive
	}

	err = a.svc.UpdateCustomer(existingCustomer)
	if err != nil {
		return nil, err
	}
	return toMap(existingCustomer), nil
}

func (a *SalesMCPAdapter) SearchCustomers(query string) ([]map[string]interface{}, error) {
	customers, err := a.svc.SearchCustomers(query)
	if err != nil {
		return nil, err
	}
	return toMapSlice(customers), nil
}

func (a *SalesMCPAdapter) ProcessSale(data map[string]interface{}) (map[string]interface{}, error) {
	// Parse items from the request
	itemsRaw, ok := data["items"].([]interface{})
	if !ok || len(itemsRaw) == 0 {
		return nil, fmt.Errorf("items array is required")
	}

	var items []QuickSaleItem
	for _, itemRaw := range itemsRaw {
		itemMap, ok := itemRaw.(map[string]interface{})
		if !ok {
			continue
		}

		productID, _ := itemMap["product_id"].(float64)
		quantity, _ := itemMap["quantity"].(float64)
		if quantity == 0 {
			quantity = 1
		}
		unitPrice, _ := itemMap["price"].(float64)

		items = append(items, QuickSaleItem{
			ProductID: uint(productID),
			Quantity:  int(quantity),
			UnitPrice: unitPrice,
		})
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no valid items found")
	}

	// Parse payment method
	paymentMethodID, _ := data["payment_method_id"].(float64)
	if paymentMethodID == 0 {
		paymentMethodID = 1 // Default to cash
	}

	// Parse customer ID
	var customerID *uint
	if custID, ok := data["customer_id"].(float64); ok && custID > 0 {
		custIDUint := uint(custID)
		customerID = &custIDUint
	}

	// Parse invoice type
	invoiceType, _ := data["invoice_type"].(string)
	needsElectronicInvoice := invoiceType == "electronic"

	// Parse discount
	discount, _ := data["discount"].(float64)
	discountType, _ := data["discount_type"].(string)

	// Parse notes
	notes, _ := data["notes"].(string)

	// Parse send email
	sendEmail, _ := data["send_email"].(bool)

	// Create the quick sale request
	req := QuickSaleRequest{
		Items:                  items,
		PaymentMethodID:        uint(paymentMethodID),
		CustomerID:             customerID,
		NeedsElectronicInvoice: needsElectronicInvoice,
		SendEmailToCustomer:    sendEmail,
		Notes:                  notes,
		Discount:               discount,
		DiscountType:           discountType,
	}

	// Process the sale
	sale, err := a.svc.CreateQuickSale(req)
	if err != nil {
		return nil, err
	}

	return toMap(sale), nil
}

func (a *SalesMCPAdapter) GetSale(id uint) (map[string]interface{}, error) {
	sale, err := a.svc.GetSale(id)
	if err != nil {
		return nil, err
	}
	return toMap(sale), nil
}

func (a *SalesMCPAdapter) GetSalesByDateRange(from, to string) ([]map[string]interface{}, error) {
	fromTime, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, fmt.Errorf("invalid from date format: %w", err)
	}
	toTime, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, fmt.Errorf("invalid to date format: %w", err)
	}
	sales, err := a.svc.GetSalesByDateRange(fromTime, toTime)
	if err != nil {
		return nil, err
	}
	return toMapSlice(sales), nil
}

func (a *SalesMCPAdapter) GetTodaySales() ([]map[string]interface{}, error) {
	sales, err := a.svc.GetTodaySales()
	if err != nil {
		return nil, err
	}
	return toMapSlice(sales), nil
}

func (a *SalesMCPAdapter) RefundSale(id uint, reason string) error {
	// Full refund (amount 0 means full refund), employeeID 0 for MCP operations
	return a.svc.RefundSale(id, 0, reason, 0)
}

// OrderMCPAdapter adapts OrderService to mcp.OrderServiceInterface
type OrderMCPAdapter struct {
	svc *OrderService
}

func NewOrderMCPAdapter(svc *OrderService) *OrderMCPAdapter {
	return &OrderMCPAdapter{svc: svc}
}

func (a *OrderMCPAdapter) CreateOrder(data map[string]interface{}) (map[string]interface{}, error) {
	// Parse order type ID
	var orderTypeID *uint
	if otID, ok := data["order_type_id"].(float64); ok && otID > 0 {
		id := uint(otID)
		orderTypeID = &id
	}

	// Parse table ID (optional)
	var tableID *uint
	if tID, ok := data["table_id"].(float64); ok && tID > 0 {
		id := uint(tID)
		tableID = &id
	}

	// Parse customer ID (optional)
	var customerID *uint
	if cID, ok := data["customer_id"].(float64); ok && cID > 0 {
		id := uint(cID)
		customerID = &id
	}

	// Parse items
	var orderItems []models.OrderItem
	var subtotal float64

	if itemsRaw, ok := data["items"].([]interface{}); ok {
		for _, itemRaw := range itemsRaw {
			itemMap, ok := itemRaw.(map[string]interface{})
			if !ok {
				continue
			}

			productID, _ := itemMap["product_id"].(float64)
			quantity, _ := itemMap["quantity"].(float64)
			if quantity == 0 {
				quantity = 1
			}
			unitPrice, _ := itemMap["unit_price"].(float64)
			notes, _ := itemMap["notes"].(string)

			itemSubtotal := unitPrice * quantity
			subtotal += itemSubtotal

			orderItems = append(orderItems, models.OrderItem{
				ProductID: uint(productID),
				Quantity:  int(quantity),
				UnitPrice: unitPrice,
				Subtotal:  itemSubtotal,
				Notes:     notes,
				Status:    "pending",
			})
		}
	}

	// Parse notes
	notes, _ := data["notes"].(string)

	// Create order - use employee ID 1 (admin) as default for MCP operations
	order := &models.Order{
		OrderTypeID: orderTypeID,
		TableID:     tableID,
		CustomerID:  customerID,
		EmployeeID:  1,
		Items:       orderItems,
		Subtotal:    subtotal,
		Total:       subtotal,
		Notes:       notes,
	}

	createdOrder, err := a.svc.CreateOrder(order)
	if err != nil {
		return nil, err
	}

	return toMap(createdOrder), nil
}

func (a *OrderMCPAdapter) GetOrder(id uint) (map[string]interface{}, error) {
	order, err := a.svc.GetOrder(id)
	if err != nil {
		return nil, err
	}
	return toMap(order), nil
}

func (a *OrderMCPAdapter) UpdateOrderStatus(id uint, status string) error {
	return a.svc.UpdateOrderStatus(id, models.OrderStatus(status))
}

func (a *OrderMCPAdapter) AddItemsToOrder(orderID uint, items []map[string]interface{}) error {
	for _, itemMap := range items {
		productID, _ := itemMap["product_id"].(float64)
		quantity, _ := itemMap["quantity"].(float64)
		if quantity == 0 {
			quantity = 1
		}
		unitPrice, _ := itemMap["unit_price"].(float64)
		notes, _ := itemMap["notes"].(string)

		item := &models.OrderItem{
			ProductID: uint(productID),
			Quantity:  int(quantity),
			UnitPrice: unitPrice,
			Subtotal:  unitPrice * quantity,
			Notes:     notes,
			Status:    "pending",
		}

		if err := a.svc.AddItemToOrder(orderID, item); err != nil {
			return err
		}
	}
	return nil
}

func (a *OrderMCPAdapter) RemoveItemFromOrder(orderID uint, itemID uint) error {
	return a.svc.RemoveItemFromOrder(orderID, itemID)
}

func (a *OrderMCPAdapter) GetOrdersByStatus(status string) ([]map[string]interface{}, error) {
	orders, err := a.svc.GetOrdersByStatus(models.OrderStatus(status))
	if err != nil {
		return nil, err
	}
	return toMapSlice(orders), nil
}

func (a *OrderMCPAdapter) GetOrdersByDateRange(from, to string) ([]map[string]interface{}, error) {
	fromTime, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, fmt.Errorf("invalid from date format (use YYYY-MM-DD): %w", err)
	}
	toTime, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, fmt.Errorf("invalid to date format (use YYYY-MM-DD): %w", err)
	}

	orders, err := a.svc.GetOrdersByDateRange(fromTime, toTime)
	if err != nil {
		return nil, err
	}
	return toMapSlice(orders), nil
}

func (a *OrderMCPAdapter) SendOrderToKitchen(id uint) error {
	return a.svc.SendToKitchen(id)
}

func (a *OrderMCPAdapter) MarkOrderReady(id uint) error {
	return a.svc.UpdateOrderStatus(id, models.OrderStatusReady)
}

// IngredientMCPAdapter adapts IngredientService to mcp.IngredientServiceInterface
type IngredientMCPAdapter struct {
	svc *IngredientService
}

func NewIngredientMCPAdapter(svc *IngredientService) *IngredientMCPAdapter {
	return &IngredientMCPAdapter{svc: svc}
}

func (a *IngredientMCPAdapter) GetAllIngredients() ([]map[string]interface{}, error) {
	ingredients, err := a.svc.GetAllIngredients()
	if err != nil {
		return nil, err
	}
	return toMapSlice(ingredients), nil
}

func (a *IngredientMCPAdapter) GetIngredient(id uint) (map[string]interface{}, error) {
	ingredient, err := a.svc.GetIngredient(id)
	if err != nil {
		return nil, err
	}
	return toMap(ingredient), nil
}

func (a *IngredientMCPAdapter) CreateIngredient(data map[string]interface{}) (map[string]interface{}, error) {
	var ingredient models.Ingredient
	if err := mapToStruct(data, &ingredient); err != nil {
		return nil, err
	}
	err := a.svc.CreateIngredient(&ingredient)
	if err != nil {
		return nil, err
	}
	return toMap(ingredient), nil
}

func (a *IngredientMCPAdapter) UpdateIngredient(id uint, data map[string]interface{}) (map[string]interface{}, error) {
	// Get existing ingredient first for partial update
	existingIngredient, err := a.svc.GetIngredient(id)
	if err != nil {
		return nil, fmt.Errorf("ingredient not found: %w", err)
	}

	// Apply only the fields that were provided in the update
	if name, ok := data["name"].(string); ok {
		existingIngredient.Name = name
	}
	if unit, ok := data["unit"].(string); ok {
		existingIngredient.Unit = unit
	}
	if stock, ok := data["stock"].(float64); ok {
		existingIngredient.Stock = stock
	}
	if minStock, ok := data["min_stock"].(float64); ok {
		existingIngredient.MinStock = minStock
	}
	if isActive, ok := data["is_active"].(bool); ok {
		existingIngredient.IsActive = isActive
	}

	err = a.svc.UpdateIngredient(existingIngredient)
	if err != nil {
		return nil, err
	}
	return toMap(existingIngredient), nil
}

func (a *IngredientMCPAdapter) AdjustIngredientStock(id uint, quantity float64, reason string, movementType string) error {
	// employeeID set to 0 for MCP operations
	return a.svc.AdjustIngredientStock(id, quantity, reason, 0)
}

func (a *IngredientMCPAdapter) GetProductIngredients(productID uint) ([]map[string]interface{}, error) {
	ingredients, err := a.svc.GetProductIngredients(productID)
	if err != nil {
		return nil, err
	}
	return toMapSlice(ingredients), nil
}

func (a *IngredientMCPAdapter) GetLowStockIngredients() ([]map[string]interface{}, error) {
	ingredients, err := a.svc.GetLowStockIngredients()
	if err != nil {
		return nil, err
	}
	return toMapSlice(ingredients), nil
}

// DashboardMCPAdapter adapts DashboardService to mcp.DashboardServiceInterface
type DashboardMCPAdapter struct {
	svc *DashboardService
}

func NewDashboardMCPAdapter(svc *DashboardService) *DashboardMCPAdapter {
	return &DashboardMCPAdapter{svc: svc}
}

func (a *DashboardMCPAdapter) GetDashboardStats() (map[string]interface{}, error) {
	stats, err := a.svc.GetDashboardStats()
	if err != nil {
		return nil, err
	}
	return toMap(stats), nil
}

func (a *DashboardMCPAdapter) GetTopSellingItems(limit int) ([]map[string]interface{}, error) {
	// GetTopSellingItems not available in DashboardService
	// Return empty list for now
	return []map[string]interface{}{}, nil
}

func (a *DashboardMCPAdapter) GetCashRegisterStatus() (map[string]interface{}, error) {
	// GetCashRegisterStatus not available in DashboardService
	// Return basic status from dashboard stats
	stats, err := a.svc.GetDashboardStats()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"today_sales": stats.TodaySales,
		"message":     "Cash register status from dashboard stats",
	}, nil
}

// ReportsMCPAdapter adapts ReportsService to mcp.ReportsServiceInterface
type ReportsMCPAdapter struct {
	svc *ReportsService
}

func NewReportsMCPAdapter(svc *ReportsService) *ReportsMCPAdapter {
	return &ReportsMCPAdapter{svc: svc}
}

func (a *ReportsMCPAdapter) GetDailySalesReport(date string) (map[string]interface{}, error) {
	var reportDate time.Time
	var err error
	if date == "" {
		reportDate = time.Now()
	} else {
		reportDate, err = time.Parse("2006-01-02", date)
		if err != nil {
			return nil, fmt.Errorf("invalid date format: %w", err)
		}
	}
	report, err := a.svc.GetDailySalesReport(reportDate)
	if err != nil {
		return nil, err
	}
	return toMap(report), nil
}

func (a *ReportsMCPAdapter) GetSalesByPeriod(from, to, groupBy string) ([]map[string]interface{}, error) {
	fromTime, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, fmt.Errorf("invalid from date format (use YYYY-MM-DD): %w", err)
	}
	toTime, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, fmt.Errorf("invalid to date format (use YYYY-MM-DD): %w", err)
	}

	report, err := a.svc.GetSalesReport(fromTime, toTime)
	if err != nil {
		return nil, err
	}

	// Return daily sales breakdown
	result := make([]map[string]interface{}, len(report.DailySales))
	for i, ds := range report.DailySales {
		result[i] = map[string]interface{}{
			"date":   ds.Date,
			"sales":  ds.Sales,
			"orders": ds.Orders,
		}
	}
	return result, nil
}

func (a *ReportsMCPAdapter) GetSalesByPaymentMethod(from, to string) ([]map[string]interface{}, error) {
	fromTime, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, fmt.Errorf("invalid from date format: %w", err)
	}
	toTime, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, fmt.Errorf("invalid to date format: %w", err)
	}
	report, err := a.svc.GetSalesByPaymentMethod(fromTime, toTime)
	if err != nil {
		return nil, err
	}
	// Convert map[string]float64 to []map[string]interface{}
	result := make([]map[string]interface{}, 0)
	for method, amount := range report {
		result = append(result, map[string]interface{}{
			"payment_method": method,
			"amount":         amount,
		})
	}
	return result, nil
}

func (a *ReportsMCPAdapter) GetSalesByEmployee(from, to string) ([]map[string]interface{}, error) {
	fromTime, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, fmt.Errorf("invalid from date format (use YYYY-MM-DD): %w", err)
	}
	toTime, err := time.Parse("2006-01-02", to)
	if err != nil {
		return nil, fmt.Errorf("invalid to date format (use YYYY-MM-DD): %w", err)
	}

	report, err := a.svc.GetEmployeePerformanceReport(fromTime, toTime)
	if err != nil {
		return nil, err
	}

	// Convert employee performance data to map slice
	result := make([]map[string]interface{}, len(report.EmployeeData))
	for i, ed := range report.EmployeeData {
		result[i] = map[string]interface{}{
			"employee_id":     ed.EmployeeID,
			"employee_name":   ed.EmployeeName,
			"total_sales":     ed.TotalSales,
			"number_of_sales": ed.NumberOfSales,
			"average_sale":    ed.AverageSale,
			"total_orders":    ed.TotalOrders,
			"working_days":    ed.WorkingDays,
		}
	}
	return result, nil
}

func (a *ReportsMCPAdapter) GetInventoryReport() (map[string]interface{}, error) {
	report, err := a.svc.GetInventoryReport()
	if err != nil {
		return nil, err
	}
	return toMap(report), nil
}

// ========== Helper Functions ==========

// Fields that commonly contain base64 images and should be excluded from MCP responses
var excludedFields = map[string]bool{
	"image":          true,
	"image_url":      true,
	"image_base64":   true,
	"base64":         true,
	"photo":          true,
	"picture":        true,
	"thumbnail":      true,
	"logo":           true,
	"avatar":         true,
	"icon":           true,
	"file_content":   true,
	"binary_data":    true,
	"cufe_qr":        true, // QR code for DIAN invoices
	"qr_code":        true,
	"pdf_data":       true,
	"xml_signed":     true, // Large XML content
	"attached_document": true,
}

// cleanMapForMCP removes base64/image fields from a map to reduce response size
func cleanMapForMCP(m map[string]interface{}) map[string]interface{} {
	if m == nil {
		return nil
	}
	result := make(map[string]interface{})
	for key, value := range m {
		// Skip excluded fields
		if excludedFields[strings.ToLower(key)] {
			result[key] = "[OMITTED - large data]"
			continue
		}

		// Check if value is a string that looks like base64 or is very long
		if str, ok := value.(string); ok {
			// Skip base64 data URIs
			if strings.HasPrefix(str, "data:image") || strings.HasPrefix(str, "data:application") {
				result[key] = "[OMITTED - base64 data]"
				continue
			}
			// Skip very long strings (likely binary/base64 data)
			if len(str) > 5000 {
				result[key] = fmt.Sprintf("[OMITTED - large string (%d chars)]", len(str))
				continue
			}
		}

		// Recursively clean nested maps
		if nestedMap, ok := value.(map[string]interface{}); ok {
			result[key] = cleanMapForMCP(nestedMap)
			continue
		}

		// Recursively clean slices of maps
		if slice, ok := value.([]interface{}); ok {
			cleanedSlice := make([]interface{}, len(slice))
			for i, item := range slice {
				if itemMap, ok := item.(map[string]interface{}); ok {
					cleanedSlice[i] = cleanMapForMCP(itemMap)
				} else {
					cleanedSlice[i] = item
				}
			}
			result[key] = cleanedSlice
			continue
		}

		result[key] = value
	}
	return result
}

// toMap converts any struct to map[string]interface{} using JSON marshaling
// and removes base64/image fields to reduce response size for AI clients
func toMap(v interface{}) map[string]interface{} {
	if v == nil {
		return nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var result map[string]interface{}
	json.Unmarshal(data, &result)
	return cleanMapForMCP(result)
}

// toMapSlice converts a slice of structs to []map[string]interface{}
// and removes base64/image fields to reduce response size for AI clients
func toMapSlice(v interface{}) []map[string]interface{} {
	if v == nil {
		return nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var result []map[string]interface{}
	json.Unmarshal(data, &result)

	// Clean each map in the slice
	for i := range result {
		result[i] = cleanMapForMCP(result[i])
	}
	return result
}

// mapToStruct converts map[string]interface{} to a struct using JSON
func mapToStruct(m map[string]interface{}, v interface{}) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}
