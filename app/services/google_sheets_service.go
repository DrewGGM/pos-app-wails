package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"PosApp/app/models"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
	"gorm.io/gorm"
)

type GoogleSheetsService struct {
	db *gorm.DB
}

func NewGoogleSheetsService(db *gorm.DB) *GoogleSheetsService {
	return &GoogleSheetsService{db: db}
}

// GetConfig retrieves Google Sheets configuration
func (s *GoogleSheetsService) GetConfig() (*models.GoogleSheetsConfig, error) {
	var config models.GoogleSheetsConfig
	result := s.db.First(&config)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Create default config
			config = models.GoogleSheetsConfig{
				IsEnabled:       false,
				SheetName:       "Reportes",
				AutoSync:        false,
				SyncInterval:    60, // 60 minutes
				SyncMode:        "interval",
				SyncTime:        "23:00",
				IncludeSales:    true,
				IncludeOrders:   true,
				IncludeProducts: true,
				IncludeClients:  false,
				LastSyncStatus:  "pending",
			}
			if err := s.db.Create(&config).Error; err != nil {
				return nil, fmt.Errorf("failed to create default config: %w", err)
			}
		} else {
			return nil, fmt.Errorf("failed to get config: %w", result.Error)
		}
	}

	return &config, nil
}

// SaveConfig saves Google Sheets configuration
func (s *GoogleSheetsService) SaveConfig(config *models.GoogleSheetsConfig) error {
	if config.ID == 0 {
		return s.db.Create(config).Error
	}
	return s.db.Save(config).Error
}

// TestConnection tests the Google Sheets connection
func (s *GoogleSheetsService) TestConnection(config *models.GoogleSheetsConfig) error {
	if config.PrivateKey == "" || config.SpreadsheetID == "" {
		return fmt.Errorf("missing credentials or spreadsheet ID")
	}

	ctx := context.Background()

	// Create credentials from service account key
	creds, err := google.CredentialsFromJSON(ctx, []byte(config.PrivateKey), sheets.SpreadsheetsScope)
	if err != nil {
		return fmt.Errorf("invalid service account credentials: %w", err)
	}

	// Create Sheets service
	srv, err := sheets.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("unable to create sheets service: %w", err)
	}

	// Try to get spreadsheet metadata
	_, err = srv.Spreadsheets.Get(config.SpreadsheetID).Do()
	if err != nil {
		return fmt.Errorf("unable to access spreadsheet: %w", err)
	}

	return nil
}

// ProductDetail represents product sales detail
type ProductDetail struct {
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	Total       float64 `json:"total"`
}

// ReportData represents a daily report row
type ReportData struct {
	Fecha             string          `json:"fecha"`
	VentasTotales     float64         `json:"ventas_totales"`
	VentasDIAN        float64         `json:"ventas_dian"`
	VentasNoDIAN      float64         `json:"ventas_no_dian"`
	NumeroOrdenes     int             `json:"numero_ordenes"`
	ProductosVendidos int             `json:"productos_vendidos"`
	TicketPromedio    float64         `json:"ticket_promedio"`
	DetalleProductos  []ProductDetail `json:"detalle_productos"`
}

// GenerateDailyReport generates report data for a specific date
func (s *GoogleSheetsService) GenerateDailyReport(date time.Time) (*ReportData, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	report := &ReportData{
		Fecha:            date.Format("2006-01-02"),
		DetalleProductos: []ProductDetail{},
	}

	// Get total sales
	var totalSales float64
	s.db.Model(&models.Order{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status IN ?", []string{"completed", "paid"}).
		Select("COALESCE(SUM(total), 0)").
		Scan(&totalSales)
	report.VentasTotales = totalSales

	// Get DIAN sales (orders with electronic invoice)
	var dianSales float64
	s.db.Table("orders").
		Select("COALESCE(SUM(orders.total), 0)").
		Joins("INNER JOIN sales ON sales.order_id = orders.id").
		Joins("INNER JOIN electronic_invoices ON electronic_invoices.sale_id = sales.id").
		Where("orders.created_at >= ? AND orders.created_at < ?", startOfDay, endOfDay).
		Where("orders.status IN ?", []string{"completed", "paid"}).
		Scan(&dianSales)
	report.VentasDIAN = dianSales
	report.VentasNoDIAN = totalSales - dianSales

	// Get number of orders
	var numOrders int64
	s.db.Model(&models.Order{}).
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("status IN ?", []string{"completed", "paid"}).
		Count(&numOrders)
	report.NumeroOrdenes = int(numOrders)

	// Get total products sold
	var totalProducts int
	s.db.Model(&models.OrderItem{}).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Where("orders.created_at >= ? AND orders.created_at < ?", startOfDay, endOfDay).
		Where("orders.status IN ?", []string{"completed", "paid"}).
		Select("COALESCE(SUM(order_items.quantity), 0)").
		Scan(&totalProducts)
	report.ProductosVendidos = totalProducts

	// Calculate average ticket
	if report.NumeroOrdenes > 0 {
		report.TicketPromedio = report.VentasTotales / float64(report.NumeroOrdenes)
	}

	// Get product details (grouped by product)
	type ProductSummary struct {
		ProductName string
		Quantity    int
		Total       float64
	}

	var productSummaries []ProductSummary
	s.db.Table("order_items").
		Select("products.name as product_name, SUM(order_items.quantity) as quantity, SUM(order_items.subtotal) as total").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins("JOIN products ON products.id = order_items.product_id").
		Where("orders.created_at >= ? AND orders.created_at < ?", startOfDay, endOfDay).
		Where("orders.status IN ?", []string{"completed", "paid"}).
		Group("products.id, products.name").
		Order("SUM(order_items.subtotal) DESC").
		Scan(&productSummaries)

	for _, ps := range productSummaries {
		report.DetalleProductos = append(report.DetalleProductos, ProductDetail{
			ProductName: ps.ProductName,
			Quantity:    ps.Quantity,
			Total:       ps.Total,
		})
	}

	return report, nil
}

// findExistingRowIndex finds the row index for a specific date, returns -1 if not found
func (s *GoogleSheetsService) findExistingRowIndex(srv *sheets.Service, config *models.GoogleSheetsConfig, fecha string) (int, error) {
	// Read all dates from column A
	sheetRange := fmt.Sprintf("%s!A:A", config.SheetName)
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, sheetRange).Do()
	if err != nil {
		return -1, err
	}

	// Search for the date
	for i, row := range resp.Values {
		if len(row) > 0 {
			if dateStr, ok := row[0].(string); ok && dateStr == fecha {
				return i + 1, nil // +1 because sheets are 1-indexed
			}
		}
	}

	return -1, nil
}

// SendReport sends a report to Google Sheets (updates if exists, appends if new)
func (s *GoogleSheetsService) SendReport(config *models.GoogleSheetsConfig, report *ReportData) error {
	if !config.IsEnabled {
		return fmt.Errorf("Google Sheets integration is disabled")
	}

	if config.PrivateKey == "" || config.SpreadsheetID == "" {
		return fmt.Errorf("missing credentials or spreadsheet ID")
	}

	ctx := context.Background()

	// Create credentials
	creds, err := google.CredentialsFromJSON(ctx, []byte(config.PrivateKey), sheets.SpreadsheetsScope)
	if err != nil {
		return fmt.Errorf("invalid credentials: %w", err)
	}

	// Create Sheets service
	srv, err := sheets.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("unable to create sheets service: %w", err)
	}

	// Check if sheet has headers, if not, add them
	if err := s.ensureHeaders(srv, config); err != nil {
		return fmt.Errorf("failed to ensure headers: %w", err)
	}

	// Convert product details to JSON string
	productsJSON, err := json.Marshal(report.DetalleProductos)
	if err != nil {
		return fmt.Errorf("failed to marshal products: %w", err)
	}

	// Prepare row data
	row := []interface{}{
		report.Fecha,
		report.VentasTotales,
		report.VentasDIAN,
		report.VentasNoDIAN,
		report.NumeroOrdenes,
		report.ProductosVendidos,
		report.TicketPromedio,
		string(productsJSON),
	}

	// Check if a row with this date already exists
	rowIndex, err := s.findExistingRowIndex(srv, config, report.Fecha)
	if err != nil {
		return fmt.Errorf("failed to check existing row: %w", err)
	}

	valueRange := &sheets.ValueRange{
		Values: [][]interface{}{row},
	}

	if rowIndex > 0 {
		// Update existing row
		sheetRange := fmt.Sprintf("%s!A%d:H%d", config.SheetName, rowIndex, rowIndex)
		_, err = srv.Spreadsheets.Values.Update(config.SpreadsheetID, sheetRange, valueRange).
			ValueInputOption("USER_ENTERED").
			Do()
		if err != nil {
			return fmt.Errorf("unable to update data: %w", err)
		}
	} else {
		// Append new row
		sheetRange := fmt.Sprintf("%s!A:H", config.SheetName)
		_, err = srv.Spreadsheets.Values.Append(config.SpreadsheetID, sheetRange, valueRange).
			ValueInputOption("USER_ENTERED").
			Do()
		if err != nil {
			return fmt.Errorf("unable to append data: %w", err)
		}
	}

	// Update sync status
	now := time.Now()
	config.LastSyncAt = &now
	config.LastSyncStatus = "success"
	config.LastSyncError = ""
	config.TotalSyncs++
	s.db.Save(config)

	return nil
}

// ensureHeaders ensures the spreadsheet has the correct headers
func (s *GoogleSheetsService) ensureHeaders(srv *sheets.Service, config *models.GoogleSheetsConfig) error {
	// Read first row
	sheetRange := fmt.Sprintf("%s!A1:H1", config.SheetName)
	resp, err := srv.Spreadsheets.Values.Get(config.SpreadsheetID, sheetRange).Do()
	if err != nil {
		return err
	}

	// If no data or headers are missing, add them
	if len(resp.Values) == 0 || len(resp.Values[0]) < 8 {
		headers := []interface{}{
			"fecha",
			"ventas_totales",
			"ventas_dian",
			"ventas_no_dian",
			"ordenes",
			"productos_vendidos",
			"ticket_promedio",
			"detalle_productos",
		}

		valueRange := &sheets.ValueRange{
			Values: [][]interface{}{headers},
		}

		_, err := srv.Spreadsheets.Values.Update(config.SpreadsheetID, sheetRange, valueRange).
			ValueInputOption("USER_ENTERED").
			Do()

		return err
	}

	return nil
}

// SyncNow manually triggers a sync
func (s *GoogleSheetsService) SyncNow() error {
	config, err := s.GetConfig()
	if err != nil {
		return err
	}

	if !config.IsEnabled {
		return fmt.Errorf("Google Sheets integration is disabled")
	}

	// Generate report for today
	today := time.Now()
	report, err := s.GenerateDailyReport(today)
	if err != nil {
		config.LastSyncStatus = "error"
		config.LastSyncError = err.Error()
		now := time.Now()
		config.LastSyncAt = &now
		s.db.Save(config)
		return fmt.Errorf("failed to generate report: %w", err)
	}

	// Send to Google Sheets
	if err := s.SendReport(config, report); err != nil {
		config.LastSyncStatus = "error"
		config.LastSyncError = err.Error()
		now := time.Now()
		config.LastSyncAt = &now
		s.db.Save(config)
		return fmt.Errorf("failed to send report: %w", err)
	}

	return nil
}
