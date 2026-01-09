package services

import (
	"context"
	"encoding/json"
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

// TimeInterval represents a time range when electronic invoicing is blocked
type TimeInterval struct {
	StartTime string `json:"start_time"` // HH:MM format
	EndTime   string `json:"end_time"`   // HH:MM format
}

// InvoiceLimitConfig represents the electronic invoice limit configuration
type InvoiceLimitConfig struct {
	Enabled      bool               `json:"enabled"`       // Master switch
	SyncInterval int                `json:"sync_interval"` // Sync interval in minutes
	DayLimits    map[string]float64 `json:"day_limits"`    // Limits per day (lunes, martes, etc.)

	// Time intervals - block electronic invoicing during specific hours
	TimeIntervalsEnabled bool                           `json:"time_intervals_enabled"`
	TimeIntervals        map[string][]TimeInterval      `json:"time_intervals"` // key: day name (lunes, martes, etc.)

	// Alternating invoices - only invoice every X sales
	AlternatingEnabled   bool `json:"alternating_enabled"`
	AlternatingRatio     int  `json:"alternating_ratio"`      // e.g., 5 means 1 out of every 5
	AlternatingCounter   int  `json:"alternating_counter"`    // current position in cycle (1-based)
	AlternatingResetDaily bool `json:"alternating_reset_daily"` // reset counter daily or continuous
	LastAlternatingReset time.Time `json:"last_alternating_reset"` // last time counter was reset

	LastSync     time.Time          `json:"last_sync"`     // Last sync time
}

// InvoiceLimitStatus represents the current status for electronic invoicing
type InvoiceLimitStatus struct {
	Available       bool    `json:"available"`        // Whether electronic invoice is available
	Enabled         bool    `json:"enabled"`          // Master switch status

	// Daily amount limits
	TodayLimit      float64 `json:"today_limit"`      // Today's limit
	TodaySales      float64 `json:"today_sales"`      // Today's DIAN sales
	RemainingAmount float64 `json:"remaining_amount"` // Remaining amount before limit
	DayName         string  `json:"day_name"`         // Current day name

	// Time intervals
	TimeIntervalsEnabled bool   `json:"time_intervals_enabled"` // Time intervals feature enabled
	InBlockedTimeInterval bool  `json:"in_blocked_time_interval"` // Currently in a blocked time interval
	NextAvailableTime    string `json:"next_available_time"`    // HH:MM when next available (if blocked)
	BlockedUntil         string `json:"blocked_until"`          // HH:MM when current block ends

	// Alternating invoices
	AlternatingEnabled bool `json:"alternating_enabled"` // Alternating feature enabled
	AlternatingRatio   int  `json:"alternating_ratio"`   // 1 out of every X sales
	AlternatingCounter int  `json:"alternating_counter"` // Current position in cycle
	NextElectronicIn   int  `json:"next_electronic_in"`  // Sales until next electronic invoice
	IsAlternatingTurn  bool `json:"is_alternating_turn"` // Current sale should be electronic

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
			Enabled:              false,
			SyncInterval:         5,
			DayLimits:            make(map[string]float64),
			TimeIntervalsEnabled: false,
			TimeIntervals:        make(map[string][]TimeInterval),
			AlternatingEnabled:   false,
			AlternatingRatio:     1,
			AlternatingCounter:   1,
			AlternatingResetDaily: false,
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
		Enabled:              s.config.Enabled,
		SyncInterval:         s.config.SyncInterval,
		DayLimits:            make(map[string]float64),
		TimeIntervalsEnabled: s.config.TimeIntervalsEnabled,
		TimeIntervals:        make(map[string][]TimeInterval),
		AlternatingEnabled:   s.config.AlternatingEnabled,
		AlternatingRatio:     s.config.AlternatingRatio,
		AlternatingCounter:   s.config.AlternatingCounter,
		AlternatingResetDaily: s.config.AlternatingResetDaily,
		LastAlternatingReset: s.config.LastAlternatingReset,
		LastSync:             s.config.LastSync,
	}
	for k, v := range s.config.DayLimits {
		configCopy.DayLimits[k] = v
	}
	for k, v := range s.config.TimeIntervals {
		intervals := make([]TimeInterval, len(v))
		copy(intervals, v)
		configCopy.TimeIntervals[k] = intervals
	}
	return configCopy
}

// GetStatus checks if electronic invoicing is available based on all limit types
func (s *InvoiceLimitService) GetStatus() (*InvoiceLimitStatus, error) {
	s.configMutex.RLock()
	config := s.config
	s.configMutex.RUnlock()

	status := &InvoiceLimitStatus{
		Enabled:              config.Enabled,
		TimeIntervalsEnabled: config.TimeIntervalsEnabled,
		AlternatingEnabled:   config.AlternatingEnabled,
		AlternatingRatio:     config.AlternatingRatio,
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

	// Assume available by default
	available := true
	var messages []string

	// ===== CHECK 1: Daily Amount Limits =====
	limit, hasLimit := config.DayLimits["limite_"+dayName]
	status.TodayLimit = limit

	if hasLimit && limit > 0 {
		// Get today's DIAN sales
		todaySales, err := s.getTodayDIANSales()
		if err != nil {
			log.Printf("Error getting today's DIAN sales: %v", err)
			// On error, allow invoicing (fail open)
		} else {
			status.TodaySales = todaySales
			status.RemainingAmount = limit - todaySales

			// Check if limit is reached
			if todaySales >= limit {
				available = false
				messages = append(messages, fmt.Sprintf("Límite diario alcanzado ($%s de $%s)",
					formatMoney(todaySales), formatMoney(limit)))
			} else {
				messages = append(messages, fmt.Sprintf("Disponible: $%s restante de $%s",
					formatMoney(status.RemainingAmount), formatMoney(limit)))
			}
		}
	}

	// ===== CHECK 2: Time Intervals =====
	if config.TimeIntervalsEnabled {
		blocked, blockedUntil, nextAvailable := s.checkTimeIntervals(dayName)
		status.InBlockedTimeInterval = blocked
		status.BlockedUntil = blockedUntil
		status.NextAvailableTime = nextAvailable

		if blocked {
			available = false
			messages = append(messages, fmt.Sprintf("Fuera de horario de facturación (disponible a las %s)", blockedUntil))
		}
	}

	// ===== CHECK 3: Alternating Invoices =====
	if config.AlternatingEnabled {
		shouldBeElectronic, counter, nextIn := s.checkAlternating()
		status.AlternatingCounter = counter
		status.NextElectronicIn = nextIn
		status.IsAlternatingTurn = shouldBeElectronic

		if !shouldBeElectronic {
			available = false
			if nextIn == 1 {
				messages = append(messages, "Próxima venta será factura electrónica")
			} else {
				messages = append(messages, fmt.Sprintf("Factura electrónica en %d ventas", nextIn))
			}
		} else {
			messages = append(messages, "Esta venta debe ser factura electrónica")
		}
	}

	// Set final availability
	status.Available = available

	// Combine messages
	if len(messages) == 0 {
		status.Message = "Facturación electrónica disponible"
	} else {
		status.Message = strings.Join(messages, " | ")
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
		Enabled:              false,
		SyncInterval:         5,
		DayLimits:            make(map[string]float64),
		TimeIntervalsEnabled: false,
		TimeIntervals:        make(map[string][]TimeInterval),
		AlternatingEnabled:   false,
		AlternatingRatio:     1,
		AlternatingCounter:   1,
		AlternatingResetDaily: false,
		LastSync:             time.Now(),
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
			case "time_intervals_enabled":
				newConfig.TimeIntervalsEnabled = strings.ToLower(value) == "true" || value == "1"
			case "alternating_enabled":
				newConfig.AlternatingEnabled = strings.ToLower(value) == "true" || value == "1"
			case "alternating_ratio":
				if ratio, err := strconv.Atoi(value); err == nil && ratio > 0 {
					newConfig.AlternatingRatio = ratio
				}
			case "alternating_counter":
				if counter, err := strconv.Atoi(value); err == nil && counter > 0 {
					newConfig.AlternatingCounter = counter
				}
			case "alternating_reset_daily":
				newConfig.AlternatingResetDaily = strings.ToLower(value) == "true" || value == "1"
			default:
				// Check if it's a day limit (limite_lunes, limite_martes, etc.)
				if strings.HasPrefix(key, "limite_") {
					if limit, err := parseMoneyValue(value); err == nil {
						newConfig.DayLimits[key] = limit
					}
				}
				// Check if it's a time interval (time_intervals_lunes, etc.)
				if strings.HasPrefix(key, "time_intervals_") && !strings.HasSuffix(key, "_enabled") {
					dayName := strings.TrimPrefix(key, "time_intervals_")
					if value != "" && value != "[]" {
						var intervals []TimeInterval
						if err := parseJSON(value, &intervals); err == nil {
							newConfig.TimeIntervals[dayName] = intervals
						}
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

	// Time intervals configuration
	rows = append(rows, []interface{}{"time_intervals_enabled", config.TimeIntervalsEnabled})
	for _, day := range days {
		intervals := config.TimeIntervals[day]
		intervalsJSON := "[]"
		if len(intervals) > 0 {
			if jsonBytes, err := json.Marshal(intervals); err == nil {
				intervalsJSON = string(jsonBytes)
			}
		}
		rows = append(rows, []interface{}{"time_intervals_" + day, intervalsJSON})
	}

	// Alternating invoices configuration
	rows = append(rows, []interface{}{"alternating_enabled", config.AlternatingEnabled})
	rows = append(rows, []interface{}{"alternating_ratio", config.AlternatingRatio})
	rows = append(rows, []interface{}{"alternating_counter", config.AlternatingCounter})
	rows = append(rows, []interface{}{"alternating_reset_daily", config.AlternatingResetDaily})

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
		Enabled:              false,
		SyncInterval:         5,
		TimeIntervalsEnabled: false,
		TimeIntervals:        make(map[string][]TimeInterval),
		AlternatingEnabled:   false,
		AlternatingRatio:     1,
		AlternatingCounter:   1,
		AlternatingResetDaily: false,
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

	// Time intervals (all days empty by default)
	rows = append(rows, []interface{}{"time_intervals_enabled", false})
	for _, day := range days {
		rows = append(rows, []interface{}{"time_intervals_" + day, "[]"})
	}

	// Alternating invoices
	rows = append(rows, []interface{}{"alternating_enabled", false})
	rows = append(rows, []interface{}{"alternating_ratio", 1})
	rows = append(rows, []interface{}{"alternating_counter", 1})
	rows = append(rows, []interface{}{"alternating_reset_daily", false})

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

// checkTimeIntervals checks if current time is in a blocked interval
func (s *InvoiceLimitService) checkTimeIntervals(dayName string) (blocked bool, blockedUntil string, nextAvailable string) {
	if !s.config.TimeIntervalsEnabled {
		return false, "", ""
	}

	intervals, hasIntervals := s.config.TimeIntervals[dayName]
	if !hasIntervals || len(intervals) == 0 {
		return false, "", ""
	}

	now := time.Now()
	currentTime := now.Format("15:04")

	for _, interval := range intervals {
		if isTimeInInterval(currentTime, interval.StartTime, interval.EndTime) {
			// Currently blocked - return end time of this interval
			return true, interval.EndTime, interval.EndTime
		}
	}

	// Not currently blocked - find next blocked interval today
	for _, interval := range intervals {
		if currentTime < interval.StartTime {
			// This interval starts later today
			nextAvailable = interval.EndTime
			break
		}
	}

	return false, "", nextAvailable
}

// isTimeInInterval checks if a time is within a time interval
func isTimeInInterval(current, start, end string) bool {
	// Handle case where interval crosses midnight (e.g., 22:00 - 02:00)
	if end < start {
		return current >= start || current < end
	}
	return current >= start && current < end
}

// parseTimeString parses time in HH:MM format
func parseTimeString(timeStr string) (hour, minute int, err error) {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid time format: %s", timeStr)
	}

	hour, err = strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		return 0, 0, fmt.Errorf("invalid hour: %s", parts[0])
	}

	minute, err = strconv.Atoi(parts[1])
	if err != nil || minute < 0 || minute > 59 {
		return 0, 0, fmt.Errorf("invalid minute: %s", parts[1])
	}

	return hour, minute, nil
}

// checkAlternating checks if current sale should be electronic based on alternating pattern
func (s *InvoiceLimitService) checkAlternating() (shouldBeElectronic bool, counter int, nextIn int) {
	if !s.config.AlternatingEnabled || s.config.AlternatingRatio <= 0 {
		return false, 0, 0
	}

	// Check if we need to reset counter (daily reset)
	if s.config.AlternatingResetDaily {
		now := time.Now()
		lastReset := s.config.LastAlternatingReset

		// Check if it's a new day
		if lastReset.IsZero() || !isSameDay(now, lastReset) {
			s.resetAlternatingCounter()
		}
	}

	counter = s.config.AlternatingCounter
	ratio := s.config.AlternatingRatio

	// Determine if this sale should be electronic
	// Counter is 1-based, so when counter == ratio, it's time for electronic invoice
	shouldBeElectronic = (counter == ratio)

	// Calculate sales until next electronic
	if shouldBeElectronic {
		nextIn = 0 // This sale IS electronic
	} else {
		nextIn = ratio - counter
	}

	return shouldBeElectronic, counter, nextIn
}

// IncrementAlternatingCounter increments the alternating counter after a sale
func (s *InvoiceLimitService) IncrementAlternatingCounter() error {
	s.configMutex.Lock()
	defer s.configMutex.Unlock()

	if !s.config.AlternatingEnabled {
		return nil
	}

	// Increment counter
	s.config.AlternatingCounter++

	// Reset to 1 if we've completed a cycle
	if s.config.AlternatingCounter > s.config.AlternatingRatio {
		s.config.AlternatingCounter = 1
	}

	// Save updated counter to Google Sheets
	return s.saveCounterToSheets()
}

// resetAlternatingCounter resets the counter to 1
func (s *InvoiceLimitService) resetAlternatingCounter() {
	s.config.AlternatingCounter = 1
	s.config.LastAlternatingReset = time.Now()
	log.Printf("Alternating counter reset to 1")
}

// saveCounterToSheets saves the alternating counter to Google Sheets
func (s *InvoiceLimitService) saveCounterToSheets() error {
	// Get Google Sheets config
	gsConfig, err := s.sheetsSvc.GetConfig()
	if err != nil || !gsConfig.IsEnabled {
		// If sheets not configured, just update in memory (counter will persist until restart)
		return nil
	}

	ctx := context.Background()

	// Create credentials
	creds, err := google.CredentialsFromJSON(ctx, []byte(gsConfig.PrivateKey), sheets.SpreadsheetsScope)
	if err != nil {
		return nil // Fail silently for counter updates
	}

	// Create Sheets service
	srv, err := sheets.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return nil
	}

	// Update just the counter row
	// Find the row for alternating_counter and update it
	sheetRange := fmt.Sprintf("%s!A:B", InvoiceLimitSheetName)
	resp, err := srv.Spreadsheets.Values.Get(gsConfig.SpreadsheetID, sheetRange).Do()
	if err != nil {
		return nil
	}

	// Find the row index for alternating_counter
	rowIndex := -1
	if len(resp.Values) > 1 {
		for i, row := range resp.Values {
			if len(row) > 0 {
				key := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", row[0])))
				if key == "alternating_counter" {
					rowIndex = i + 1 // +1 for 1-based indexing
					break
				}
			}
		}
	}

	// Update the counter value
	if rowIndex > 0 {
		updateRange := fmt.Sprintf("%s!B%d", InvoiceLimitSheetName, rowIndex)
		valueRange := &sheets.ValueRange{
			Values: [][]interface{}{{s.config.AlternatingCounter}},
		}
		_, err = srv.Spreadsheets.Values.Update(gsConfig.SpreadsheetID, updateRange, valueRange).
			ValueInputOption("USER_ENTERED").
			Do()
	}

	return nil
}

// isSameDay checks if two times are on the same calendar day
func isSameDay(t1, t2 time.Time) bool {
	y1, m1, d1 := t1.Date()
	y2, m2, d2 := t2.Date()
	return y1 == y2 && m1 == m2 && d1 == d2
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

func parseJSON(jsonStr string, v interface{}) error {
	return json.Unmarshal([]byte(jsonStr), v)
}
