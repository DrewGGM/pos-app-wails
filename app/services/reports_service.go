package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ReportsService handles report generation
type ReportsService struct {
	db *gorm.DB
}

// NewReportsService creates a new reports service
func NewReportsService() *ReportsService {
	return &ReportsService{
		db: database.GetDB(),
	}
}

// Report structures

// SalesReport represents sales report data
type SalesReport struct {
	Period           string             `json:"period"`
	StartDate        time.Time          `json:"start_date"`
	EndDate          time.Time          `json:"end_date"`
	TotalSales       float64            `json:"total_sales"`
	TotalTax         float64            `json:"total_tax"`
	TotalDiscounts   float64            `json:"total_discounts"`
	NumberOfSales    int                `json:"number_of_sales"`
	AverageSale      float64            `json:"average_sale"`
	PaymentBreakdown map[string]float64 `json:"payment_breakdown"`
	TopProducts      []ProductSalesData `json:"top_products"`
	HourlySales      []HourlySalesData  `json:"hourly_sales"`
	DailySales       []DailySalesData   `json:"daily_sales"`
}

// ProductSalesData represents product sales information
type ProductSalesData struct {
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	TotalSales  float64 `json:"total_sales"`
	Percentage  float64 `json:"percentage"`
}

// HourlySalesData represents hourly sales
type HourlySalesData struct {
	Hour   int     `json:"hour"`
	Sales  float64 `json:"sales"`
	Orders int     `json:"orders"`
}

// DailySalesData represents daily sales
type DailySalesData struct {
	Date   string  `json:"date"`
	Sales  float64 `json:"sales"`
	Orders int     `json:"orders"`
}

// InventoryReport represents inventory report data
type InventoryReport struct {
	GeneratedAt       time.Time               `json:"generated_at"`
	TotalProducts     int                     `json:"total_products"`
	TotalValue        float64                 `json:"total_value"`
	LowStockItems     []models.Product        `json:"low_stock_items"`
	OutOfStockItems   []models.Product        `json:"out_of_stock_items"`
	TopMovingItems    []ProductMovementData   `json:"top_moving_items"`
	CategoryBreakdown []CategoryInventoryData `json:"category_breakdown"`
}

// ProductMovementData represents product movement information
type ProductMovementData struct {
	ProductID    uint   `json:"product_id"`
	ProductName  string `json:"product_name"`
	MovementQty  int    `json:"movement_qty"`
	CurrentStock int    `json:"current_stock"`
}

// CategoryInventoryData represents category inventory information
type CategoryInventoryData struct {
	CategoryID   uint    `json:"category_id"`
	CategoryName string  `json:"category_name"`
	ItemCount    int     `json:"item_count"`
	TotalValue   float64 `json:"total_value"`
}

// EmployeePerformanceReport represents employee performance data
type EmployeePerformanceReport struct {
	Period       string                    `json:"period"`
	StartDate    time.Time                 `json:"start_date"`
	EndDate      time.Time                 `json:"end_date"`
	EmployeeData []EmployeePerformanceData `json:"employee_data"`
}

// EmployeePerformanceData represents individual employee performance
type EmployeePerformanceData struct {
	EmployeeID     uint    `json:"employee_id"`
	EmployeeName   string  `json:"employee_name"`
	TotalSales     float64 `json:"total_sales"`
	NumberOfSales  int     `json:"number_of_sales"`
	AverageSale    float64 `json:"average_sale"`
	TotalOrders    int     `json:"total_orders"`
	WorkingDays    int     `json:"working_days"`
	CashDifference float64 `json:"cash_difference"`
}

// Sales Reports

// GetSalesReport generates a sales report for a period
func (s *ReportsService) GetSalesReport(startDate, endDate time.Time) (*SalesReport, error) {
	report := &SalesReport{
		Period:           fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		StartDate:        startDate,
		EndDate:          endDate,
		PaymentBreakdown: make(map[string]float64),
	}

	// Get sales in period
	var sales []models.Sale
	err := s.db.Preload("PaymentDetails.PaymentMethod").
		Where("created_at BETWEEN ? AND ?", startDate, endDate).
		Find(&sales).Error
	if err != nil {
		return nil, err
	}

	report.NumberOfSales = len(sales)

	// Calculate totals
	for _, sale := range sales {
		report.TotalSales += sale.Total
		report.TotalTax += sale.Tax
		report.TotalDiscounts += sale.Discount

		// Payment breakdown
		for _, payment := range sale.PaymentDetails {
			report.PaymentBreakdown[payment.PaymentMethod.Name] += payment.Amount
		}
	}

	if report.NumberOfSales > 0 {
		report.AverageSale = report.TotalSales / float64(report.NumberOfSales)
	}

	// Get top products
	report.TopProducts = s.getTopProducts(startDate, endDate, 10)

	// Get hourly sales
	report.HourlySales = s.getHourlySales(startDate, endDate)

	// Get daily sales
	report.DailySales = s.getDailySales(startDate, endDate)

	return report, nil
}

// GetDailySalesReport gets sales report for a specific day
func (s *ReportsService) GetDailySalesReport(date time.Time) (*SalesReport, error) {
	startDate := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endDate := startDate.Add(24 * time.Hour)
	return s.GetSalesReport(startDate, endDate)
}

// GetWeeklySalesReport gets sales report for the current week
func (s *ReportsService) GetWeeklySalesReport() (*SalesReport, error) {
	now := time.Now()
	startOfWeek := now.AddDate(0, 0, -int(now.Weekday()))
	startDate := time.Date(startOfWeek.Year(), startOfWeek.Month(), startOfWeek.Day(), 0, 0, 0, 0, startOfWeek.Location())
	endDate := startDate.AddDate(0, 0, 7)
	return s.GetSalesReport(startDate, endDate)
}

// GetMonthlySalesReport gets sales report for a specific month
func (s *ReportsService) GetMonthlySalesReport(year int, month time.Month) (*SalesReport, error) {
	startDate := time.Date(year, month, 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0)
	return s.GetSalesReport(startDate, endDate)
}

// GetSalesByPaymentMethod gets sales grouped by payment method
func (s *ReportsService) GetSalesByPaymentMethod(startDate, endDate time.Time) (map[string]float64, error) {
	result := make(map[string]float64)

	type PaymentSummary struct {
		MethodName string
		Total      float64
	}

	var summaries []PaymentSummary
	err := s.db.Table("payments").
		Select("payment_methods.name as method_name, SUM(payments.amount) as total").
		Joins("JOIN payment_methods ON payments.payment_method_id = payment_methods.id").
		Joins("JOIN sales ON payments.sale_id = sales.id").
		Where("sales.created_at BETWEEN ? AND ?", startDate, endDate).
		Group("payment_methods.name").
		Scan(&summaries).Error

	if err != nil {
		return nil, err
	}

	for _, summary := range summaries {
		result[summary.MethodName] = summary.Total
	}

	return result, nil
}

// Inventory Reports

// GetInventoryReport generates an inventory report
func (s *ReportsService) GetInventoryReport() (*InventoryReport, error) {
	report := &InventoryReport{
		GeneratedAt: time.Now(),
	}

	// Get all active products
	var products []models.Product
	err := s.db.Preload("Category").Where("is_active = ?", true).Find(&products).Error
	if err != nil {
		return nil, err
	}

	report.TotalProducts = len(products)

	// Analyze inventory
	categoryData := make(map[uint]*CategoryInventoryData)

	for _, product := range products {
		// Calculate value
		productValue := float64(product.Stock) * product.Price
		report.TotalValue += productValue

		// Check stock levels
		if product.Stock == 0 {
			report.OutOfStockItems = append(report.OutOfStockItems, product)
		} else if product.Stock < 10 { // Configurable threshold
			report.LowStockItems = append(report.LowStockItems, product)
		}

		// Category breakdown
		if product.Category != nil {
			if _, exists := categoryData[product.CategoryID]; !exists {
				categoryData[product.CategoryID] = &CategoryInventoryData{
					CategoryID:   product.CategoryID,
					CategoryName: product.Category.Name,
				}
			}
			categoryData[product.CategoryID].ItemCount++
			categoryData[product.CategoryID].TotalValue += productValue
		}
	}

	// Convert category map to slice
	for _, data := range categoryData {
		report.CategoryBreakdown = append(report.CategoryBreakdown, *data)
	}

	// Get top moving items (last 30 days)
	report.TopMovingItems = s.getTopMovingProducts(30, 10)

	return report, nil
}

// GetLowStockReport gets products with low stock
func (s *ReportsService) GetLowStockReport(threshold int) ([]models.Product, error) {
	var products []models.Product
	err := s.db.Preload("Category").
		Where("stock <= ? AND is_active = ?", threshold, true).
		Order("stock ASC").
		Find(&products).Error
	return products, err
}

// Employee Reports

// GetEmployeePerformanceReport generates employee performance report
func (s *ReportsService) GetEmployeePerformanceReport(startDate, endDate time.Time) (*EmployeePerformanceReport, error) {
	report := &EmployeePerformanceReport{
		Period:    fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		StartDate: startDate,
		EndDate:   endDate,
	}

	// Get all active employees
	var employees []models.Employee
	s.db.Where("is_active = ?", true).Find(&employees)

	for _, employee := range employees {
		data := EmployeePerformanceData{
			EmployeeID:   employee.ID,
			EmployeeName: employee.Name,
		}

		// Get sales by employee
		var sales []models.Sale
		s.db.Where("employee_id = ? AND created_at BETWEEN ? AND ?",
			employee.ID, startDate, endDate).Find(&sales)

		data.NumberOfSales = len(sales)
		for _, sale := range sales {
			data.TotalSales += sale.Total
		}

		if data.NumberOfSales > 0 {
			data.AverageSale = data.TotalSales / float64(data.NumberOfSales)
		}

		// Get orders processed
		var orderCount int64
		s.db.Model(&models.Order{}).
			Where("employee_id = ? AND created_at BETWEEN ? AND ?",
				employee.ID, startDate, endDate).
			Count(&orderCount)
		data.TotalOrders = int(orderCount)

		// Get cash register differences
		var registers []models.CashRegister
		s.db.Where("employee_id = ? AND opened_at BETWEEN ? AND ?",
			employee.ID, startDate, endDate).Find(&registers)

		data.WorkingDays = len(registers)
		for _, register := range registers {
			if register.Difference != nil {
				data.CashDifference += *register.Difference
			}
		}

		report.EmployeeData = append(report.EmployeeData, data)
	}

	return report, nil
}

// GetEmployeeSalesReport gets sales report for a specific employee
func (s *ReportsService) GetEmployeeSalesReport(employeeID uint, startDate, endDate time.Time) (*SalesReport, error) {
	report := &SalesReport{
		Period:           fmt.Sprintf("%s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02")),
		StartDate:        startDate,
		EndDate:          endDate,
		PaymentBreakdown: make(map[string]float64),
	}

	// Get sales by employee
	var sales []models.Sale
	err := s.db.Preload("PaymentDetails.PaymentMethod").
		Where("employee_id = ? AND created_at BETWEEN ? AND ?", employeeID, startDate, endDate).
		Find(&sales).Error
	if err != nil {
		return nil, err
	}

	// Process sales data (similar to GetSalesReport)
	// ... implementation similar to GetSalesReport but filtered by employee

	return report, nil
}

// Helper methods

func (s *ReportsService) getTopProducts(startDate, endDate time.Time, limit int) []ProductSalesData {
	var results []ProductSalesData

	query := `
		SELECT 
			p.id as product_id,
			p.name as product_name,
			SUM(oi.quantity) as quantity,
			SUM(oi.subtotal) as total_sales
		FROM order_items oi
		JOIN products p ON oi.product_id = p.id
		JOIN orders o ON oi.order_id = o.id
		JOIN sales s ON o.id = s.order_id
		WHERE s.created_at BETWEEN ? AND ?
		GROUP BY p.id, p.name
		ORDER BY total_sales DESC
		LIMIT ?
	`

	s.db.Raw(query, startDate, endDate, limit).Scan(&results)

	// Calculate percentages
	var totalSales float64
	for _, r := range results {
		totalSales += r.TotalSales
	}

	for i := range results {
		if totalSales > 0 {
			results[i].Percentage = (results[i].TotalSales / totalSales) * 100
		}
	}

	return results
}

func (s *ReportsService) getHourlySales(startDate, endDate time.Time) []HourlySalesData {
	var results []HourlySalesData

	query := `
		SELECT 
			HOUR(created_at) as hour,
			SUM(total) as sales,
			COUNT(*) as orders
		FROM sales
		WHERE created_at BETWEEN ? AND ?
		GROUP BY HOUR(created_at)
		ORDER BY hour
	`

	s.db.Raw(query, startDate, endDate).Scan(&results)

	// Fill missing hours with zeros
	hourMap := make(map[int]HourlySalesData)
	for _, r := range results {
		hourMap[r.Hour] = r
	}

	var fullResults []HourlySalesData
	for hour := 0; hour < 24; hour++ {
		if data, exists := hourMap[hour]; exists {
			fullResults = append(fullResults, data)
		} else {
			fullResults = append(fullResults, HourlySalesData{Hour: hour})
		}
	}

	return fullResults
}

func (s *ReportsService) getDailySales(startDate, endDate time.Time) []DailySalesData {
	var results []DailySalesData

	query := `
		SELECT 
			DATE(created_at) as date,
			SUM(total) as sales,
			COUNT(*) as orders
		FROM sales
		WHERE created_at BETWEEN ? AND ?
		GROUP BY DATE(created_at)
		ORDER BY date
	`

	s.db.Raw(query, startDate, endDate).Scan(&results)

	// Format dates
	for i := range results {
		if results[i].Date != "" {
			if t, err := time.Parse("2006-01-02", results[i].Date); err == nil {
				results[i].Date = t.Format("2006-01-02")
			}
		}
	}

	return results
}

func (s *ReportsService) getTopMovingProducts(days, limit int) []ProductMovementData {
	var results []ProductMovementData

	startDate := time.Now().AddDate(0, 0, -days)

	query := `
		SELECT 
			p.id as product_id,
			p.name as product_name,
			SUM(ABS(im.quantity)) as movement_qty,
			p.stock as current_stock
		FROM inventory_movements im
		JOIN products p ON im.product_id = p.id
		WHERE im.created_at >= ? AND im.type = 'sale'
		GROUP BY p.id, p.name, p.stock
		ORDER BY movement_qty DESC
		LIMIT ?
	`

	s.db.Raw(query, startDate, limit).Scan(&results)

	return results
}

// Export methods

// ExportSalesReportCSV exports sales report to CSV
func (s *ReportsService) ExportSalesReportCSV(report *SalesReport) ([]byte, error) {
	// Create CSV writer
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write headers
	headers := []string{"Date", "Sales", "Orders", "Average Sale", "Tax", "Discounts"}
	writer.Write(headers)

	// Write daily data
	for _, daily := range report.DailySales {
		row := []string{
			daily.Date,
			fmt.Sprintf("%.2f", daily.Sales),
			fmt.Sprintf("%d", daily.Orders),
			fmt.Sprintf("%.2f", daily.Sales/float64(daily.Orders)),
			"", // Tax per day would need additional calculation
			"", // Discounts per day would need additional calculation
		}
		writer.Write(row)
	}

	// Write summary
	writer.Write([]string{})
	writer.Write([]string{"Summary"})
	writer.Write([]string{"Total Sales", fmt.Sprintf("%.2f", report.TotalSales)})
	writer.Write([]string{"Total Orders", fmt.Sprintf("%d", report.NumberOfSales)})
	writer.Write([]string{"Average Sale", fmt.Sprintf("%.2f", report.AverageSale)})
	writer.Write([]string{"Total Tax", fmt.Sprintf("%.2f", report.TotalTax)})
	writer.Write([]string{"Total Discounts", fmt.Sprintf("%.2f", report.TotalDiscounts)})

	writer.Flush()
	return buf.Bytes(), writer.Error()
}

// ExportSalesReportJSON exports sales report to JSON
func (s *ReportsService) ExportSalesReportJSON(report *SalesReport) ([]byte, error) {
	return json.MarshalIndent(report, "", "  ")
}

// GetDashboardStats gets statistics for dashboard
func (s *ReportsService) GetDashboardStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// Today's sales
	today := time.Now().Format("2006-01-02")
	var todaySales float64
	s.db.Model(&models.Sale{}).
		Where("DATE(created_at) = ?", today).
		Select("COALESCE(SUM(total), 0)").
		Scan(&todaySales)
	stats["today_sales"] = todaySales

	// Today's orders
	var todayOrders int64
	s.db.Model(&models.Order{}).
		Where("DATE(created_at) = ?", today).
		Count(&todayOrders)
	stats["today_orders"] = todayOrders

	// Pending orders
	var pendingOrders int64
	s.db.Model(&models.Order{}).
		Where("status IN ?", []string{"pending", "preparing", "ready"}).
		Count(&pendingOrders)
	stats["pending_orders"] = pendingOrders

	// Low stock products
	var lowStockCount int64
	s.db.Model(&models.Product{}).
		Where("stock < ? AND is_active = ?", 10, true).
		Count(&lowStockCount)
	stats["low_stock_products"] = lowStockCount

	// Active tables (if restaurant mode)
	var activeTables int64
	s.db.Model(&models.Table{}).
		Where("status = ?", "occupied").
		Count(&activeTables)
	stats["active_tables"] = activeTables

	// Month to date sales
	firstOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Local)
	var monthSales float64
	s.db.Model(&models.Sale{}).
		Where("created_at >= ?", firstOfMonth).
		Select("COALESCE(SUM(total), 0)").
		Scan(&monthSales)
	stats["month_sales"] = monthSales

	// Yesterday's sales for comparison
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	var yesterdaySales float64
	s.db.Model(&models.Sale{}).
		Where("DATE(created_at) = ?", yesterday).
		Select("COALESCE(SUM(total), 0)").
		Scan(&yesterdaySales)
	stats["yesterday_sales"] = yesterdaySales

	// Calculate growth percentage
	if yesterdaySales > 0 {
		growth := ((todaySales - yesterdaySales) / yesterdaySales) * 100
		stats["sales_growth"] = growth
	} else {
		stats["sales_growth"] = 0
	}

	return stats, nil
}
