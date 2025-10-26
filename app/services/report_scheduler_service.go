package services

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

type ReportSchedulerService struct {
	db                  *gorm.DB
	googleSheetsService *GoogleSheetsService
	ticker              *time.Ticker
	stopChan            chan bool
	running             bool
}

func NewReportSchedulerService(db *gorm.DB, googleSheetsService *GoogleSheetsService) *ReportSchedulerService {
	return &ReportSchedulerService{
		db:                  db,
		googleSheetsService: googleSheetsService,
		stopChan:            make(chan bool),
		running:             false,
	}
}

// Start begins the scheduler
func (s *ReportSchedulerService) Start() error {
	if s.running {
		return fmt.Errorf("scheduler is already running")
	}

	config, err := s.googleSheetsService.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get config: %w", err)
	}

	if !config.IsEnabled || !config.AutoSync {
		log.Println("Google Sheets auto-sync is disabled")
		return nil
	}

	s.running = true

	// Start scheduler goroutine
	go s.run()

	log.Println("Report scheduler started")
	return nil
}

// Stop stops the scheduler
func (s *ReportSchedulerService) Stop() {
	if !s.running {
		return
	}

	s.stopChan <- true
	s.running = false

	if s.ticker != nil {
		s.ticker.Stop()
	}

	log.Println("Report scheduler stopped")
}

// run is the main scheduler loop
func (s *ReportSchedulerService) run() {
	// Initial delay before first check
	time.Sleep(30 * time.Second)

	for {
		config, err := s.googleSheetsService.GetConfig()
		if err != nil {
			log.Printf("Error getting config: %v", err)
			time.Sleep(1 * time.Minute)
			continue
		}

		if !config.IsEnabled || !config.AutoSync {
			log.Println("Auto-sync disabled, stopping scheduler")
			s.running = false
			return
		}

		// Determine next execution time based on mode
		var duration time.Duration

		if config.SyncMode == "daily" {
			duration = s.getTimeUntilDailySync(config.SyncTime)
		} else {
			// Interval mode
			duration = time.Duration(config.SyncInterval) * time.Minute
		}

		log.Printf("Next Google Sheets sync scheduled in %v", duration)

		// Create ticker for this duration
		s.ticker = time.NewTicker(duration)

		select {
		case <-s.ticker.C:
			// Time to sync
			log.Println("Starting scheduled Google Sheets sync...")
			if err := s.executeSync(); err != nil {
				log.Printf("Scheduled sync failed: %v", err)
			} else {
				log.Println("Scheduled sync completed successfully")
			}
			s.ticker.Stop()

		case <-s.stopChan:
			log.Println("Scheduler stop signal received")
			if s.ticker != nil {
				s.ticker.Stop()
			}
			return
		}
	}
}

// getTimeUntilDailySync calculates duration until the configured daily sync time
func (s *ReportSchedulerService) getTimeUntilDailySync(syncTime string) time.Duration {
	now := time.Now()

	// Parse sync time (format: "23:00")
	targetTime, err := time.Parse("15:04", syncTime)
	if err != nil {
		log.Printf("Invalid sync time format: %s, using 23:00", syncTime)
		targetTime, _ = time.Parse("15:04", "23:00")
	}

	// Set target time for today
	target := time.Date(
		now.Year(),
		now.Month(),
		now.Day(),
		targetTime.Hour(),
		targetTime.Minute(),
		0, 0,
		now.Location(),
	)

	// If target time has already passed today, schedule for tomorrow
	if now.After(target) {
		target = target.Add(24 * time.Hour)
	}

	return target.Sub(now)
}

// executeSync performs the actual sync operation
func (s *ReportSchedulerService) executeSync() error {
	// Generate report for yesterday (completed day)
	yesterday := time.Now().AddDate(0, 0, -1)
	report, err := s.googleSheetsService.GenerateDailyReport(yesterday)
	if err != nil {
		return fmt.Errorf("failed to generate report: %w", err)
	}

	config, err := s.googleSheetsService.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get config: %w", err)
	}

	// Send report
	if err := s.googleSheetsService.SendReport(config, report); err != nil {
		return fmt.Errorf("failed to send report: %w", err)
	}

	return nil
}

// Restart stops and starts the scheduler (useful after config changes)
func (s *ReportSchedulerService) Restart() error {
	s.Stop()
	time.Sleep(1 * time.Second)
	return s.Start()
}

// GetStatus returns the current scheduler status
func (s *ReportSchedulerService) GetStatus() map[string]interface{} {
	config, _ := s.googleSheetsService.GetConfig()

	status := map[string]interface{}{
		"running": s.running,
		"enabled": false,
	}

	if config != nil {
		status["enabled"] = config.IsEnabled && config.AutoSync
		status["sync_mode"] = config.SyncMode
		status["sync_interval"] = config.SyncInterval
		status["sync_time"] = config.SyncTime
		status["last_sync_at"] = config.LastSyncAt
		status["last_sync_status"] = config.LastSyncStatus
		status["total_syncs"] = config.TotalSyncs
	}

	return status
}
