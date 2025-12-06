package services

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"PosApp/app/models"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
	"gorm.io/gorm"
)

// InvoiceLimitConfig represents the electronic invoice limit configuration
type InvoiceLimitConfig struct {
	Enabled      bool               `json:"enabled"`       // Master switch
	SyncInterval int                `json:"sync_interval"` // Sync interval in minutes
	DayLimits    map[string]float64 `json:"day_limits"`    // Limits per day (lunes, martes, etc.)
	LastSync     time.Time          `json:"last_sync"`     // Last sync time
}

// InvoiceLimitStatus represents the current status for electronic invoicing
type InvoiceLimitStatus struct {
	Available       bool    `json:"available"`        // Whether electronic invoice is available
	Enabled         bool    `json:"enabled"`          // Master switch status
	TodayLimit      float64 `json:"today_limit"`      // Today's limit
	TodaySales      float64 `json:"today_sales"`      // Today's DIAN sales
	RemainingAmount float64 `json:"remaining_amount"` // Remaining amount before limit
	DayName         string  `json:"day_name"`         // Current day name
	Message         string  `json:"message"`          // Status message
}

// InvoiceLimitService manages electronic invoice limits stored in Google Sheets
type InvoiceLimitService struct {
	db           *gorm.DB
	sheetsSvc    *GoogleSheetsService
	config       *InvoiceLimitConfig
	configMutex  sync.RWMutex
	stopChan     chan struct{}
	isRunning    bool
	runningMutex sync.Mutex
}

// Sheet configuration
const (
	InvoiceLimitSheetName = "ConfigFE"
	ConfigColumnA         = "configuracion"
	ConfigColumnB         = "valor"
)

// Day name mappings
var dayNames = map[time.Weekday]string{
	time.Sunday:    "domingo",
	time.Monday:    "lunes",
	time.Tuesday:   "martes",
	time.Wednesday: "miercoles",
	time.Thursday:  "jueves",
	time.Friday:    "viernes",
	time.Saturday:  "sabado",
}

// NewInvoiceLimitService creates a new invoice limit service
func NewInvoiceLimitService(db *gorm.DB) *InvoiceLimitService {
	return &InvoiceLimitService{
		db:        db,
		sheetsSvc: NewGoogleSheetsService(db),
		config: &InvoiceLimitConfig{
			Enabled:      false,
			SyncInterval: 5,
			DayLimits:    make(map[string]float64),
		},
		stopChan: make(chan struct{}),
	}
}

// GetConfig returns the current configuration
func (s *InvoiceLimitService) GetConfig() *InvoiceLimitConfig {
	s.configMutex.RLock()
	defer s.configMutex.RUnlock()

	// Return a copy to prevent race conditions
	configCopy := &InvoiceLimitConfig{
		Enabled:      s.config.Enabled,
		SyncInterval: s.config.SyncInterval,
		DayLimits:    make(map[string]float64),
		LastSync:     s.config.LastSync,
	}
	for k, v := range s.config.DayLimits {
		configCopy.DayLimits[k] = v
	}
	return configCopy
}

// GetStatus checks if electronic invoicing is available based on limits
func (s *InvoiceLimitService) GetStatus() (*InvoiceLimitStatus, error) {
	s.configMutex.RLock()
	config := s.config
	s.configMutex.RUnlock()

	status := &InvoiceLimitStatus{
		Enabled: config.Enabled,
	}

	// If master switch is disabled, invoicing is not available
	if !config.Enabled {
		status.Available = false
		status.Message = "Facturación electrónica deshabilitada por configuración"
		return status, nil
	}

	// Get current day name
	now := time.Now()
	dayName := dayNames[now.Weekday()]
	status.DayName = dayName

	// Get today's limit
	limit, hasLimit := config.DayLimits["limite_"+dayName]
	if !hasLimit {
		// No limit configured for today - allow unlimited
		status.Available = true
		status.TodayLimit = 0
		status.Message = "Sin límite configurado para hoy"
		return status, nil
	}

	status.TodayLimit = limit

	// Get today's DIAN sales
	todaySales, err := s.getTodayDIANSales()
	if err != nil {
		log.Printf("Error getting today's DIAN sales: %v", err)
		// On error, allow invoicing (fail open)
		status.Available = true
		status.Message = "Error al verificar ventas, permitiendo facturación"
		return status, nil
	}

	status.TodaySales = todaySales
	status.RemainingAmount = limit - todaySales

	// Check if limit is reached
	if todaySales >= limit {
		status.Available = false
		status.Message = fmt.Sprintf("Límite diario alcanzado ($%s de $%s)",
			formatMoney(todaySales), formatMoney(limit))
	} else {
		status.Available = true
		status.Message = fmt.Sprintf("Disponible: $%s restante de $%s",
			formatMoney(status.RemainingAmount), formatMoney(limit))
	}

	return status, nil
}

// getTodayDIANSales gets the total DIAN sales for today
func (s *InvoiceLimitService) getTodayDIANSales() (float64, error) {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	var totalSales float64
	err := s.db.Model(&models.Order{}).
		Select("COALESCE(SUM(orders.total), 0)").
		Joins("INNER JOIN sales ON sales.order_id = orders.id AND sales.deleted_at IS NULL").
		Joins("INNER JOIN electronic_invoices ON electronic_invoices.sale_id = sales.id").
		Where("orders.created_at >= ? AND orders.created_at < ?", startOfDay, endOfDay).
		Where("orders.status IN ?", []string{"completed", "paid"}).
		Where("sales.status NOT IN ?", []string{"refunded"}).
		Scan(&totalSales).Error

	return totalSales, err
}

// SyncConfig syncs configuration from Google Sheets
func (s *InvoiceLimitService) SyncConfig() error {
	// Get Google Sheets config
	gsConfig, err := s.sheetsSvc.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get Google Sheets config: %w", err)
	}

	if !gsConfig.IsEnabled || gsConfig.PrivateKey == "" || gsConfig.SpreadsheetID == "" {
		return fmt.Errorf("Google Sheets integration not configured")
	}

	ctx := context.Background()

	// Create credentials
	creds, err := google.CredentialsFromJSON(ctx, []byte(gsConfig.PrivateKey), sheets.SpreadsheetsScope)
	if err != nil {
		return fmt.Errorf("invalid credentials: %w", err)
	}

	// Create Sheets service
	srv, err := sheets.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("unable to create sheets service: %w", err)
	}

	// Read configuration from sheet
	sheetRange := fmt.Sprintf("%s!A:B", InvoiceLimitSheetName)
	resp, err := srv.Spreadsheets.Values.Get(gsConfig.SpreadsheetID, sheetRange).Do()
	if err != nil {
		// Sheet might not exist - try to create it
		if strings.Contains(err.Error(), "Unable to parse range") {
			if createErr := s.createConfigSheet(srv, gsConfig.SpreadsheetID); createErr != nil {
				return fmt.Errorf("failed to create config sheet: %w", createErr)
			}
			// Return default config after creation
			return nil
		}
		return fmt.Errorf("failed to read config sheet: %w", err)
	}

	// Parse configuration
	newConfig := &InvoiceLimitConfig{
		Enabled:      false,
		SyncInterval: 5,
		DayLimits:    make(map[string]float64),
		LastSync:     time.Now(),
	}

	if len(resp.Values) > 1 { // Skip header row
		for _, row := range resp.Values[1:] {
			if len(row) < 2 {
				continue
			}

			key := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", row[0])))
			value := strings.TrimSpace(fmt.Sprintf("%v", row[1]))

			switch key {
			case "enabled":
				newConfig.Enabled = strings.ToLower(value) == "true" || value == "1"
			case "sync_interval":
				if interval, err := strconv.Atoi(value); err == nil && interval > 0 {
					newConfig.SyncInterval = interval
				}
			default:
				// Check if it's a day limit (limite_lunes, limite_martes, etc.)
				if strings.HasPrefix(key, "limite_") {
					if limit, err := parseMoneyValue(value); err == nil {
						newConfig.DayLimits[key] = limit
					}
				}
			}
		}
	}

	// Update config
	s.configMutex.Lock()
	s.config = newConfig
	s.configMutex.Unlock()

	log.Printf("Invoice limit config synced: enabled=%v, sync_interval=%d, limits=%v",
		newConfig.Enabled, newConfig.SyncInterval, newConfig.DayLimits)

	return nil
}

// SaveConfig saves configuration to Google Sheets
func (s *InvoiceLimitService) SaveConfig(config *InvoiceLimitConfig) error {
	// Get Google Sheets config
	gsConfig, err := s.sheetsSvc.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get Google Sheets config: %w", err)
	}

	if !gsConfig.IsEnabled || gsConfig.PrivateKey == "" || gsConfig.SpreadsheetID == "" {
		return fmt.Errorf("Google Sheets integration not configured")
	}

	ctx := context.Background()

	// Create credentials
	creds, err := google.CredentialsFromJSON(ctx, []byte(gsConfig.PrivateKey), sheets.SpreadsheetsScope)
	if err != nil {
		return fmt.Errorf("invalid credentials: %w", err)
	}

	// Create Sheets service
	srv, err := sheets.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("unable to create sheets service: %w", err)
	}

	// Prepare data rows
	var rows [][]interface{}

	// Header row
	rows = append(rows, []interface{}{ConfigColumnA, ConfigColumnB})

	// Configuration rows
	rows = append(rows, []interface{}{"enabled", config.Enabled})
	rows = append(rows, []interface{}{"sync_interval", config.SyncInterval})

	// Day limits
	days := []string{"lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"}
	for _, day := range days {
		key := "limite_" + day
		limit := config.DayLimits[key]
		rows = append(rows, []interface{}{key, limit})
	}

	// Clear existing data and write new data
	sheetRange := fmt.Sprintf("%s!A1:B%d", InvoiceLimitSheetName, len(rows))

	valueRange := &sheets.ValueRange{
		Values: rows,
	}

	_, err = srv.Spreadsheets.Values.Update(gsConfig.SpreadsheetID, sheetRange, valueRange).
		ValueInputOption("USER_ENTERED").
		Do()
	if err != nil {
		// Sheet might not exist - try to create it first
		if strings.Contains(err.Error(), "Unable to parse range") {
			if createErr := s.createConfigSheet(srv, gsConfig.SpreadsheetID); createErr != nil {
				return fmt.Errorf("failed to create config sheet: %w", createErr)
			}
			// Try again after creating the sheet
			_, err = srv.Spreadsheets.Values.Update(gsConfig.SpreadsheetID, sheetRange, valueRange).
				ValueInputOption("USER_ENTERED").
				Do()
			if err != nil {
				return fmt.Errorf("failed to save config: %w", err)
			}
		} else {
			return fmt.Errorf("failed to save config: %w", err)
		}
	}

	// Update local config
	s.configMutex.Lock()
	s.config = config
	s.config.LastSync = time.Now()
	s.configMutex.Unlock()

	log.Printf("Invoice limit config saved to Google Sheets")
	return nil
}

// createConfigSheet creates the ConfigFE sheet with default values
func (s *InvoiceLimitService) createConfigSheet(srv *sheets.Service, spreadsheetID string) error {
	// Add new sheet
	addSheetRequest := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				AddSheet: &sheets.AddSheetRequest{
					Properties: &sheets.SheetProperties{
						Title: InvoiceLimitSheetName,
					},
				},
			},
		},
	}

	_, err := srv.Spreadsheets.BatchUpdate(spreadsheetID, addSheetRequest).Do()
	if err != nil && !strings.Contains(err.Error(), "already exists") {
		return fmt.Errorf("failed to create sheet: %w", err)
	}

	// Write default configuration
	defaultConfig := &InvoiceLimitConfig{
		Enabled:      false,
		SyncInterval: 5,
		DayLimits: map[string]float64{
			"limite_lunes":     0,
			"limite_martes":    0,
			"limite_miercoles": 0,
			"limite_jueves":    0,
			"limite_viernes":   0,
			"limite_sabado":    0,
			"limite_domingo":   0,
		},
	}

	// Prepare rows
	var rows [][]interface{}
	rows = append(rows, []interface{}{ConfigColumnA, ConfigColumnB})
	rows = append(rows, []interface{}{"enabled", defaultConfig.Enabled})
	rows = append(rows, []interface{}{"sync_interval", defaultConfig.SyncInterval})

	days := []string{"lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"}
	for _, day := range days {
		rows = append(rows, []interface{}{"limite_" + day, 0})
	}

	sheetRange := fmt.Sprintf("%s!A1:B%d", InvoiceLimitSheetName, len(rows))
	valueRange := &sheets.ValueRange{
		Values: rows,
	}

	_, err = srv.Spreadsheets.Values.Update(spreadsheetID, sheetRange, valueRange).
		ValueInputOption("USER_ENTERED").
		Do()

	return err
}

// StartPeriodicSync starts the periodic sync goroutine
func (s *InvoiceLimitService) StartPeriodicSync() {
	s.runningMutex.Lock()
	if s.isRunning {
		s.runningMutex.Unlock()
		return
	}
	s.isRunning = true
	s.stopChan = make(chan struct{})
	s.runningMutex.Unlock()

	go func() {
		// Initial sync
		if err := s.SyncConfig(); err != nil {
			log.Printf("Initial invoice limit config sync failed: %v", err)
		}

		for {
			s.configMutex.RLock()
			interval := s.config.SyncInterval
			s.configMutex.RUnlock()

			if interval <= 0 {
				interval = 5 // Default to 5 minutes
			}

			select {
			case <-s.stopChan:
				log.Println("Invoice limit sync stopped")
				return
			case <-time.After(time.Duration(interval) * time.Minute):
				if err := s.SyncConfig(); err != nil {
					log.Printf("Invoice limit config sync failed: %v", err)
				}
			}
		}
	}()

	log.Println("Invoice limit periodic sync started")
}

// StopPeriodicSync stops the periodic sync goroutine
func (s *InvoiceLimitService) StopPeriodicSync() {
	s.runningMutex.Lock()
	defer s.runningMutex.Unlock()

	if s.isRunning {
		close(s.stopChan)
		s.isRunning = false
	}
}

// Helper functions

func parseMoneyValue(value string) (float64, error) {
	// Remove currency symbols and formatting
	cleaned := strings.ReplaceAll(value, "$", "")
	cleaned = strings.ReplaceAll(cleaned, ",", "")
	cleaned = strings.ReplaceAll(cleaned, ".", "")
	cleaned = strings.TrimSpace(cleaned)

	return strconv.ParseFloat(cleaned, 64)
}

func formatMoney(amount float64) string {
	return fmt.Sprintf("%.0f", amount)
}
