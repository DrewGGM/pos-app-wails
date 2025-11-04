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

	// Config check ticker - checks config every 5 minutes
	configCheckTicker := time.NewTicker(5 * time.Minute)
	defer configCheckTicker.Stop()

	// Load initial config
	config, err := s.googleSheetsService.GetConfig()
	if err != nil {
		log.Printf("Error getting initial config: %v", err)
		return
	}

	// If disabled, wait for config change
	if !config.IsEnabled || !config.AutoSync {
		log.Println("Auto-sync disabled at startup, waiting for configuration change...")
	WAIT_FOR_ENABLE:
		for {
			select {
			case <-configCheckTicker.C:
				newConfig, err := s.googleSheetsService.GetConfig()
				if err == nil && newConfig.IsEnabled && newConfig.AutoSync {
					config = newConfig
					break WAIT_FOR_ENABLE
				}
			case <-s.stopChan:
				log.Println("Scheduler stop signal received")
				return
			}
		}
	}

	// Calculate initial sync interval
	var syncInterval time.Duration
	if config.SyncMode == "daily" {
		syncInterval = s.getTimeUntilDailySync(config.SyncTime)
	} else {
		syncInterval = time.Duration(config.SyncInterval) * time.Minute
	}

	log.Printf("Google Sheets sync scheduler running with interval: %v (mode: %s)", syncInterval, config.SyncMode)

	// Create sync ticker with calculated interval
	s.ticker = time.NewTicker(syncInterval)
	defer s.ticker.Stop()

	// Main loop - keeps ticker alive
	for {
		select {
		case <-s.ticker.C:
			// Time to sync
			log.Println("Starting scheduled Google Sheets sync...")
			if err := s.executeSync(); err != nil {
				log.Printf("Scheduled sync failed: %v", err)
			} else {
				log.Println("Scheduled sync completed successfully")
			}

			// For daily mode, recalculate next sync time after execution
			if config.SyncMode == "daily" {
				s.ticker.Stop()
				newInterval := s.getTimeUntilDailySync(config.SyncTime)
				log.Printf("Daily sync completed, next sync in %v", newInterval)
				s.ticker = time.NewTicker(newInterval)
			}

		case <-configCheckTicker.C:
			// Periodically check if config has changed
			newConfig, err := s.googleSheetsService.GetConfig()
			if err != nil {
				log.Printf("Error checking config: %v", err)
				continue
			}

			// If auto-sync was disabled, pause
			if !newConfig.IsEnabled || !newConfig.AutoSync {
				log.Println("Auto-sync was disabled, pausing scheduler...")
				s.ticker.Stop()
				// Wait for re-enable
				for {
					select {
					case <-configCheckTicker.C:
						recheckConfig, err := s.googleSheetsService.GetConfig()
						if err == nil && recheckConfig.IsEnabled && recheckConfig.AutoSync {
							config = recheckConfig
							// Restart ticker with new config
							log.Println("Auto-sync re-enabled, restarting ticker...")
							s.ticker.Stop()
							var restartInterval time.Duration
							if config.SyncMode == "daily" {
								restartInterval = s.getTimeUntilDailySync(config.SyncTime)
							} else {
								restartInterval = time.Duration(config.SyncInterval) * time.Minute
							}
							log.Printf("New sync interval: %v (mode: %s)", restartInterval, config.SyncMode)
							s.ticker = time.NewTicker(restartInterval)
							break
						}
					case <-s.stopChan:
						return
					}
					// If we broke out of the select, exit the wait loop
					if config.IsEnabled && config.AutoSync {
						break
					}
				}
				continue
			}

			// Check if interval or mode changed
			configChanged := false
			if config.SyncMode != newConfig.SyncMode || config.SyncInterval != newConfig.SyncInterval || config.SyncTime != newConfig.SyncTime {
				configChanged = true
				config = newConfig
			}

			if configChanged {
				log.Println("Sync configuration changed, updating ticker...")
				s.ticker.Stop()
				var newInterval time.Duration
				if config.SyncMode == "daily" {
					newInterval = s.getTimeUntilDailySync(config.SyncTime)
				} else {
					newInterval = time.Duration(config.SyncInterval) * time.Minute
				}
				log.Printf("New sync interval: %v (mode: %s)", newInterval, config.SyncMode)
				s.ticker = time.NewTicker(newInterval)
			}

		case <-s.stopChan:
			log.Println("Scheduler stop signal received")
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
	// Generate report for today (current day with real-time data)
	today := time.Now()
	report, err := s.googleSheetsService.GenerateDailyReport(today)
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
		status["last_sync_error"] = config.LastSyncError
		status["total_syncs"] = config.TotalSyncs

		// Calculate next sync time
		if config.IsEnabled && config.AutoSync && s.running {
			var nextSyncTime time.Time
			now := time.Now()

			if config.SyncMode == "daily" {
				// Parse sync time
				targetTime, err := time.Parse("15:04", config.SyncTime)
				if err != nil {
					targetTime, _ = time.Parse("15:04", "23:00")
				}

				// Set target time for today
				nextSyncTime = time.Date(
					now.Year(),
					now.Month(),
					now.Day(),
					targetTime.Hour(),
					targetTime.Minute(),
					0, 0,
					now.Location(),
				)

				// If target time has already passed today, schedule for tomorrow
				if now.After(nextSyncTime) {
					nextSyncTime = nextSyncTime.Add(24 * time.Hour)
				}
			} else {
				// Interval mode
				if config.LastSyncAt != nil {
					nextSyncTime = config.LastSyncAt.Add(time.Duration(config.SyncInterval) * time.Minute)
				} else {
					// If never synced, next sync is now + interval
					nextSyncTime = now.Add(time.Duration(config.SyncInterval) * time.Minute)
				}
			}

			status["next_sync_at"] = nextSyncTime
			status["seconds_until_next_sync"] = int(time.Until(nextSyncTime).Seconds())
		} else {
			status["next_sync_at"] = nil
			status["seconds_until_next_sync"] = 0
		}
	}

	return status
}
