package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"time"

	"gorm.io/gorm"
)

// DashboardService handles dashboard statistics operations
type DashboardService struct {
	db *gorm.DB
}

// NewDashboardService creates a new dashboard service
func NewDashboardService() *DashboardService {
	return &DashboardService{
		db: database.GetDB(),
	}
}

// DashboardStats represents dashboard statistics
type DashboardStats struct {
	// Today's sales
	TodaySales       float64 `json:"today_sales"`
	TodaySalesCount  int     `json:"today_sales_count"`
	TodayOrders      int     `json:"today_orders"`
	TodayCustomers   int     `json:"today_customers"`

	// Pending orders
	PendingOrders    int     `json:"pending_orders"`

	// Low stock products
	LowStockProducts int     `json:"low_stock_products"`

	// Active tables
	ActiveTables     int     `json:"active_tables"`

	// Sales growth (compared to yesterday)
	SalesGrowth      float64 `json:"sales_growth"` // Percentage

	// Additional stats
	AverageTicket    float64 `json:"average_ticket"`
	TopSellingItems  []TopSellingItem `json:"top_selling_items"`
}

// TopSellingItem represents a top selling product
type TopSellingItem struct {
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	TotalSales  float64 `json:"total_sales"`
}

// GetDashboardStats retrieves all dashboard statistics
func (s *DashboardService) GetDashboardStats() (*DashboardStats, error) {
	stats := &DashboardStats{}

	// Get today's date range
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	// Get yesterday's date range for comparison
	startOfYesterday := startOfDay.Add(-24 * time.Hour)
	endOfYesterday := startOfDay

	// Today's sales
	var todaySalesTotal float64
	var todaySalesCount int64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status != ?", "cancelled").
		Count(&todaySalesCount).
		Select("COALESCE(SUM(total), 0)").
		Row().Scan(&todaySalesTotal)

	stats.TodaySales = todaySalesTotal
	stats.TodaySalesCount = int(todaySalesCount)

	// Today's orders
	var todayOrdersCount int64
	s.db.Model(&models.Order{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Count(&todayOrdersCount)
	stats.TodayOrders = int(todayOrdersCount)

	// Today's unique customers
	var todayCustomersCount int64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status != ?", "cancelled").
		Where("customer_id IS NOT NULL").
		Distinct("customer_id").
		Count(&todayCustomersCount)
	stats.TodayCustomers = int(todayCustomersCount)

	// Pending orders
	var pendingOrdersCount int64
	s.db.Model(&models.Order{}).
		Where("status IN (?)", []string{"pending", "in_progress"}).
		Count(&pendingOrdersCount)
	stats.PendingOrders = int(pendingOrdersCount)

	// Low stock products (stock below minimum_stock threshold)
	var lowStockCount int64
	s.db.Model(&models.Product{}).
		Where("track_inventory = ?", true).
		Where("stock <= minimum_stock").
		Where("is_active = ?", true).
		Count(&lowStockCount)
	stats.LowStockProducts = int(lowStockCount)

	// Active tables
	var activeTablesCount int64
	s.db.Model(&models.Table{}).
		Where("status = ?", "occupied").
		Count(&activeTablesCount)
	stats.ActiveTables = int(activeTablesCount)

	// Sales growth calculation
	var yesterdaySalesTotal float64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfYesterday, endOfYesterday).
		Where("status != ?", "cancelled").
		Select("COALESCE(SUM(total), 0)").
		Row().Scan(&yesterdaySalesTotal)

	if yesterdaySalesTotal > 0 {
		stats.SalesGrowth = ((todaySalesTotal - yesterdaySalesTotal) / yesterdaySalesTotal) * 100
	} else if todaySalesTotal > 0 {
		stats.SalesGrowth = 100 // 100% growth if there were no sales yesterday
	} else {
		stats.SalesGrowth = 0
	}

	// Average ticket
	if todaySalesCount > 0 {
		stats.AverageTicket = todaySalesTotal / float64(todaySalesCount)
	}

	// Top selling items (last 7 days)
	startOfWeek := startOfDay.Add(-7 * 24 * time.Hour)

	type TopItemResult struct {
		ProductID   uint
		ProductName string
		Quantity    int
		TotalSales  float64
	}

	var topItems []TopItemResult
	s.db.Table("order_items").
		Select("order_items.product_id, products.name as product_name, SUM(order_items.quantity) as quantity, SUM(order_items.subtotal) as total_sales").
		Joins("JOIN products ON products.id = order_items.product_id").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Where("orders.created_at >= ?", startOfWeek).
		Where("orders.status != ?", "cancelled").
		Group("order_items.product_id, products.name").
		Order("quantity DESC").
		Limit(5).
		Scan(&topItems)

	// Convert to response format
	stats.TopSellingItems = make([]TopSellingItem, len(topItems))
	for i, item := range topItems {
		stats.TopSellingItems[i] = TopSellingItem{
			ProductID:   item.ProductID,
			ProductName: item.ProductName,
			Quantity:    item.Quantity,
			TotalSales:  item.TotalSales,
		}
	}

	return stats, nil
}

// GetSalesChartData retrieves sales data for charts (last 7 days)
type SalesChartData struct {
	Date   string  `json:"date"`
	Sales  float64 `json:"sales"`
	Orders int     `json:"orders"`
}

func (s *DashboardService) GetSalesChartData(days int) ([]SalesChartData, error) {
	if days <= 0 {
		days = 7 // Default to 7 days
	}
	if days > 90 {
		days = 90 // Maximum 90 days
	}

	now := time.Now()
	startDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Add(-time.Duration(days-1) * 24 * time.Hour)

	var chartData []SalesChartData

	// Query sales grouped by date
	type DailyResult struct {
		Date   time.Time
		Sales  float64
		Orders int64
	}

	var results []DailyResult
	s.db.Model(&models.Sale{}).
		Select("DATE(created_at) as date, COALESCE(SUM(total), 0) as sales, COUNT(*) as orders").
		Where("created_at >= ?", startDate).
		Where("status != ?", "cancelled").
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&results)

	// Convert to response format
	chartData = make([]SalesChartData, len(results))
	for i, result := range results {
		chartData[i] = SalesChartData{
			Date:   result.Date.Format("2006-01-02"),
			Sales:  result.Sales,
			Orders: int(result.Orders),
		}
	}

	return chartData, nil
}

// GetPendingOrdersDetails retrieves detailed information about pending orders
func (s *DashboardService) GetPendingOrdersDetails() ([]models.Order, error) {
	var orders []models.Order
	err := s.db.Preload("Items.Product").
		Preload("Table").
		Preload("Employee").
		Where("status IN (?)", []string{"pending", "in_progress"}).
		Order("created_at ASC").
		Find(&orders).Error

	return orders, err
}

// GetLowStockProducts retrieves products with low stock
func (s *DashboardService) GetLowStockProducts() ([]models.Product, error) {
	var products []models.Product
	err := s.db.Where("track_inventory = ?", true).
		Where("stock <= minimum_stock").
		Where("is_active = ?", true).
		Order("stock ASC").
		Limit(20).
		Find(&products).Error

	return products, err
}

// GetActiveTables retrieves all active (occupied) tables
func (s *DashboardService) GetActiveTables() ([]models.Table, error) {
	var tables []models.Table
	err := s.db.Preload("Orders", "status IN (?)", []string{"pending", "in_progress"}).
		Where("status = ?", "occupied").
		Order("number ASC").
		Find(&tables).Error

	return tables, err
}

// GetDashboardStatsDIAN retrieves dashboard statistics filtered by DIAN electronic invoices only
func (s *DashboardService) GetDashboardStatsDIAN() (*DashboardStats, error) {
	stats := &DashboardStats{}

	// Get today's date range
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	// Get yesterday's date range for comparison
	startOfYesterday := startOfDay.Add(-24 * time.Hour)
	endOfYesterday := startOfDay

	// Today's sales (DIAN only - needs_electronic_invoice = true)
	var todaySalesTotal float64
	var todaySalesCount int64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status != ?", "cancelled").
		Where("needs_electronic_invoice = ?", true).
		Count(&todaySalesCount).
		Select("COALESCE(SUM(total), 0)").
		Row().Scan(&todaySalesTotal)

	stats.TodaySales = todaySalesTotal
	stats.TodaySalesCount = int(todaySalesCount)

	// Today's orders (we show all orders, not filtered by DIAN)
	var todayOrdersCount int64
	s.db.Model(&models.Order{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Count(&todayOrdersCount)
	stats.TodayOrders = int(todayOrdersCount)

	// Today's unique customers (DIAN sales only)
	var todayCustomersCount int64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status != ?", "cancelled").
		Where("needs_electronic_invoice = ?", true).
		Where("customer_id IS NOT NULL").
		Distinct("customer_id").
		Count(&todayCustomersCount)
	stats.TodayCustomers = int(todayCustomersCount)

	// Pending orders (not filtered - operational data)
	var pendingOrdersCount int64
	s.db.Model(&models.Order{}).
		Where("status IN (?)", []string{"pending", "in_progress"}).
		Count(&pendingOrdersCount)
	stats.PendingOrders = int(pendingOrdersCount)

	// Low stock products (not filtered - operational data)
	var lowStockCount int64
	s.db.Model(&models.Product{}).
		Where("track_inventory = ?", true).
		Where("stock <= minimum_stock").
		Where("is_active = ?", true).
		Count(&lowStockCount)
	stats.LowStockProducts = int(lowStockCount)

	// Active tables (not filtered - operational data)
	var activeTablesCount int64
	s.db.Model(&models.Table{}).
		Where("status = ?", "occupied").
		Count(&activeTablesCount)
	stats.ActiveTables = int(activeTablesCount)

	// Sales growth calculation (DIAN only)
	var yesterdaySalesTotal float64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ? AND created_at < ?", startOfYesterday, endOfYesterday).
		Where("status != ?", "cancelled").
		Where("needs_electronic_invoice = ?", true).
		Select("COALESCE(SUM(total), 0)").
		Row().Scan(&yesterdaySalesTotal)

	if yesterdaySalesTotal > 0 {
		stats.SalesGrowth = ((todaySalesTotal - yesterdaySalesTotal) / yesterdaySalesTotal) * 100
	} else if todaySalesTotal > 0 {
		stats.SalesGrowth = 100
	} else {
		stats.SalesGrowth = 0
	}

	// Average ticket (DIAN only)
	if todaySalesCount > 0 {
		stats.AverageTicket = todaySalesTotal / float64(todaySalesCount)
	}

	// Top selling items from DIAN sales (last 7 days)
	startOfWeek := startOfDay.Add(-7 * 24 * time.Hour)

	type TopItemResult struct {
		ProductID   uint
		ProductName string
		Quantity    int
		TotalSales  float64
	}

	var topItems []TopItemResult
	s.db.Table("order_items").
		Select("order_items.product_id, products.name as product_name, SUM(order_items.quantity) as quantity, SUM(order_items.subtotal) as total_sales").
		Joins("JOIN products ON products.id = order_items.product_id").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins("JOIN sales ON sales.order_id = orders.id").
		Where("orders.created_at >= ?", startOfWeek).
		Where("orders.status != ?", "cancelled").
		Where("sales.needs_electronic_invoice = ?", true).
		Group("order_items.product_id, products.name").
		Order("quantity DESC").
		Limit(5).
		Scan(&topItems)

	// Convert to response format
	stats.TopSellingItems = make([]TopSellingItem, len(topItems))
	for i, item := range topItems {
		stats.TopSellingItems[i] = TopSellingItem{
			ProductID:   item.ProductID,
			ProductName: item.ProductName,
			Quantity:    item.Quantity,
			TotalSales:  item.TotalSales,
		}
	}

	return stats, nil
}

// GetSalesChartDataDIAN retrieves sales data for charts filtered by DIAN electronic invoices only
func (s *DashboardService) GetSalesChartDataDIAN(days int) ([]SalesChartData, error) {
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}

	now := time.Now()
	startDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Add(-time.Duration(days-1) * 24 * time.Hour)

	var chartData []SalesChartData

	type DailyResult struct {
		Date   time.Time
		Sales  float64
		Orders int64
	}

	var results []DailyResult
	s.db.Model(&models.Sale{}).
		Select("DATE(created_at) as date, COALESCE(SUM(total), 0) as sales, COUNT(*) as orders").
		Where("created_at >= ?", startDate).
		Where("status != ?", "cancelled").
		Where("needs_electronic_invoice = ?", true).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&results)

	chartData = make([]SalesChartData, len(results))
	for i, result := range results {
		chartData[i] = SalesChartData{
			Date:   result.Date.Format("2006-01-02"),
			Sales:  result.Sales,
			Orders: int(result.Orders),
		}
	}

	return chartData, nil
}
