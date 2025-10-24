package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// SyncWorker handles data synchronization between local and remote databases
type SyncWorker struct {
	mainDB       *gorm.DB
	localDB      *database.LocalDB
	isRunning    bool
	stopChan     chan bool
	syncInterval time.Duration
	configSvc    *ConfigService
	invoiceSvc   *InvoiceService
}

// StartSyncWorker initializes and starts the sync worker
func StartSyncWorker() {
	worker := &SyncWorker{
		mainDB:     database.GetDB(),
		localDB:    database.GetLocalDB(),
		stopChan:   make(chan bool),
		configSvc:  NewConfigService(),
		invoiceSvc: NewInvoiceService(),
	}

	// Ensure local DB is initialised to avoid nil dereference
	if worker.localDB == nil {
		if err := database.InitializeLocalDB("./data/local.db"); err != nil {
			log.Printf("Local DB init failed: %v. Sync worker will not start.", err)
			return
		}
		worker.localDB = database.GetLocalDB()
		if worker.localDB == nil {
			log.Println("Local DB is nil after initialisation. Sync worker will not start.")
			return
		}
	}

	// Get sync configuration
	syncConfig, err := worker.configSvc.GetSyncConfig()
	if err != nil || !syncConfig.EnableAutoSync {
		log.Println("Auto-sync is disabled")
		return
	}

	worker.syncInterval = time.Duration(syncConfig.SyncInterval) * time.Minute

	// Start sync worker
	go worker.run()

	log.Printf("Sync worker started with interval: %v", worker.syncInterval)
}

// run is the main sync loop
func (worker *SyncWorker) run() {
	worker.isRunning = true
	ticker := time.NewTicker(worker.syncInterval)
	defer ticker.Stop()

	// Initial sync
	worker.performSync()

	for {
		select {
		case <-ticker.C:
			worker.performSync()
		case <-worker.stopChan:
			log.Println("Sync worker stopped")
			worker.isRunning = false
			return
		}
	}
}

// Stop stops the sync worker
func (worker *SyncWorker) Stop() {
	if worker.isRunning {
		worker.stopChan <- true
	}
}

// performSync performs the synchronization
func (worker *SyncWorker) performSync() {
	log.Println("Starting synchronization...")
	startTime := time.Now()

	if worker.localDB == nil {
		log.Println("Local DB not initialised. Skipping sync.")
		return
	}

	// Check if we have internet connection
	if !worker.checkConnection() {
		log.Println("No internet connection, skipping sync")
		if worker.localDB != nil {
			worker.localDB.UpdateSyncStatus("offline", "No internet connection")
		}
		return
	}

	// Update sync status
	if worker.localDB != nil {
		worker.localDB.UpdateSyncStatus("syncing", "")
	}

	// Sync orders
	if err := worker.syncOrders(); err != nil {
		log.Printf("Error syncing orders: %v", err)
		if worker.localDB != nil {
			worker.localDB.UpdateSyncStatus("failed", err.Error())
		}
	}

	// Sync sales
	if err := worker.syncSales(); err != nil {
		log.Printf("Error syncing sales: %v", err)
		if worker.localDB != nil {
			worker.localDB.UpdateSyncStatus("failed", err.Error())
		}
	}

	// Sync invoices
	if err := worker.syncInvoices(); err != nil {
		log.Printf("Error syncing invoices: %v", err)
		if worker.localDB != nil {
			worker.localDB.UpdateSyncStatus("failed", err.Error())
		}
	}

	// Sync customers
	if err := worker.syncCustomers(); err != nil {
		log.Printf("Error syncing customers: %v", err)
	}

	// Pull updates from main database ONLY if offline mode
	// When online, the app reads directly from main DB, no need to cache
	if worker.localDB != nil && worker.localDB.IsOfflineMode() {
		log.Println("System is offline, pulling updates to local cache...")
		if err := worker.pullUpdates(); err != nil {
			log.Printf("Error pulling updates: %v", err)
		}
	} else {
		log.Println("System is online, skipping cache pull (app reads directly from main DB)")
	}

	// Clean old synced data
	worker.cleanOldData()

	// Update sync status
	if worker.localDB != nil {
		worker.localDB.UpdateSyncStatus("completed", "")
	}

	log.Printf("Synchronization completed in %v", time.Since(startTime))
}

// syncOrders syncs pending orders to main database
func (worker *SyncWorker) syncOrders() error {
	// Get pending orders from local database
	pendingOrders, err := worker.localDB.GetPendingOrders()
	if err != nil {
		return err
	}

	log.Printf("Found %d pending orders to sync", len(pendingOrders))

	for _, localOrder := range pendingOrders {
		// Deserialize order data
		var order models.Order
		if err := json.Unmarshal([]byte(localOrder.OrderData), &order); err != nil {
			log.Printf("Failed to unmarshal order %s: %v", localOrder.OrderNumber, err)
			continue
		}

		// Try to save to main database
		err := worker.mainDB.Transaction(func(tx *gorm.DB) error {
			// Check if order already exists
			var existingOrder models.Order
			if err := tx.Where("order_number = ?", order.OrderNumber).First(&existingOrder).Error; err == nil {
				// Order already exists, update it
				order.ID = existingOrder.ID
				return tx.Save(&order).Error
			}

			// Create new order
			if err := tx.Create(&order).Error; err != nil {
				return err
			}

			// Create order items
			for _, item := range order.Items {
				item.OrderID = order.ID
				if err := tx.Create(&item).Error; err != nil {
					return err
				}

				// Update inventory
				var product models.Product
				if err := tx.First(&product, item.ProductID).Error; err == nil {
					product.Stock -= item.Quantity
					tx.Save(&product)
				}
			}

			return nil
		})

		if err != nil {
			// Update sync attempts
			localOrder.SyncAttempts++
			localOrder.LastError = err.Error()
			worker.localDB.GetDB().Save(&localOrder)

			log.Printf("Failed to sync order %s: %v", order.OrderNumber, err)
			worker.localDB.LogSync("order", order.ID, "create", "failed", err.Error())
		} else {
			// Mark as synced
			worker.localDB.MarkOrderSynced(localOrder.OrderNumber)
			worker.localDB.LogSync("order", order.ID, "create", "success", "")
			log.Printf("Successfully synced order %s", order.OrderNumber)
		}
	}

	return nil
}

// syncSales syncs pending sales to main database
func (worker *SyncWorker) syncSales() error {
	// Get pending sales from local database
	pendingSales, err := worker.localDB.GetPendingSales()
	if err != nil {
		return err
	}

	log.Printf("Found %d pending sales to sync", len(pendingSales))

	for _, localSale := range pendingSales {
		// Deserialize sale data
		var sale models.Sale
		if err := json.Unmarshal([]byte(localSale.SaleData), &sale); err != nil {
			log.Printf("Failed to unmarshal sale %s: %v", localSale.SaleNumber, err)
			continue
		}

		// Try to save to main database
		err := worker.mainDB.Transaction(func(tx *gorm.DB) error {
			// Check if sale already exists
			var existingSale models.Sale
			if err := tx.Where("sale_number = ?", sale.SaleNumber).First(&existingSale).Error; err == nil {
				// Sale already exists, skip
				return nil
			}

			// Create sale
			if err := tx.Create(&sale).Error; err != nil {
				return err
			}

			// Create payment details
			for _, payment := range sale.PaymentDetails {
				payment.SaleID = sale.ID
				if err := tx.Create(&payment).Error; err != nil {
					return err
				}
			}

			// Update order status
			if sale.OrderID > 0 {
				tx.Model(&models.Order{}).Where("id = ?", sale.OrderID).
					Updates(map[string]interface{}{
						"status":  models.OrderStatusPaid,
						"sale_id": sale.ID,
					})
			}

			return nil
		})

		if err != nil {
			// Update sync attempts
			localSale.SyncAttempts++
			localSale.LastError = err.Error()
			worker.localDB.GetDB().Save(&localSale)

			log.Printf("Failed to sync sale %s: %v", sale.SaleNumber, err)
			worker.localDB.LogSync("sale", sale.ID, "create", "failed", err.Error())
		} else {
			// Mark as synced
			worker.localDB.MarkSaleSynced(localSale.SaleNumber)
			worker.localDB.LogSync("sale", sale.ID, "create", "success", "")
			log.Printf("Successfully synced sale %s", sale.SaleNumber)

			// Process electronic invoice if needed
			if localSale.NeedsInvoice {
				go worker.processElectronicInvoice(&sale)
			}
		}
	}

	return nil
}

// syncInvoices syncs pending electronic invoices
func (worker *SyncWorker) syncInvoices() error {
	// Process queued invoices
	return worker.invoiceSvc.ProcessQueuedInvoices()
}

// syncCustomers syncs customer data
func (worker *SyncWorker) syncCustomers() error {
	// Get customers from local that need syncing
	var localCustomers []database.LocalCustomer
	worker.localDB.GetDB().Where("last_synced < ?", time.Now().Add(-24*time.Hour)).Find(&localCustomers)

	for _, localCustomer := range localCustomers {
		var customer models.Customer
		if err := json.Unmarshal([]byte(localCustomer.CustomerData), &customer); err != nil {
			continue
		}

		// Update or create in main database
		worker.mainDB.Save(&customer)

		// Update last synced
		localCustomer.LastSynced = time.Now()
		worker.localDB.GetDB().Save(&localCustomer)
	}

	return nil
}

// pullUpdates pulls updates from main database
func (worker *SyncWorker) pullUpdates() error {
	// Pull products
	if err := worker.pullProducts(); err != nil {
		return err
	}

	// Pull categories
	if err := worker.pullCategories(); err != nil {
		return err
	}

	// Pull payment methods
	if err := worker.pullPaymentMethods(); err != nil {
		return err
	}

	// Pull tables
	if err := worker.pullTables(); err != nil {
		return err
	}

	return nil
}

// pullProducts pulls product updates from main database
func (worker *SyncWorker) pullProducts() error {
	var products []models.Product
	if err := worker.mainDB.Preload("Category").Preload("Modifiers").Find(&products).Error; err != nil {
		return err
	}

	for _, product := range products {
		productData, _ := json.Marshal(product)
		localProduct := database.LocalProduct{
			ID:          product.ID,
			ProductData: string(productData),
			LastSynced:  time.Now(),
			IsModified:  false,
		}
		worker.localDB.GetDB().Save(&localProduct)
	}

	log.Printf("Pulled %d products from main database", len(products))
	return nil
}

// pullCategories pulls category updates from main database
func (worker *SyncWorker) pullCategories() error {
	var categories []models.Category
	if err := worker.mainDB.Find(&categories).Error; err != nil {
		return err
	}

	for _, category := range categories {
		categoryData, _ := json.Marshal(category)
		localCategory := database.LocalCategory{
			ID:           category.ID,
			CategoryData: string(categoryData),
			LastSynced:   time.Now(),
		}
		worker.localDB.GetDB().Save(&localCategory)
	}

	log.Printf("Pulled %d categories from main database", len(categories))
	return nil
}

// pullPaymentMethods pulls payment method updates from main database
func (worker *SyncWorker) pullPaymentMethods() error {
	var methods []models.PaymentMethod
	if err := worker.mainDB.Where("is_active = ?", true).Find(&methods).Error; err != nil {
		return err
	}

	for _, method := range methods {
		methodData, _ := json.Marshal(method)
		localMethod := database.LocalPaymentMethod{
			ID:                method.ID,
			PaymentMethodData: string(methodData),
			LastSynced:        time.Now(),
		}
		worker.localDB.GetDB().Save(&localMethod)
	}

	log.Printf("Pulled %d payment methods from main database", len(methods))
	return nil
}

// pullTables pulls table updates from main database
func (worker *SyncWorker) pullTables() error {
	var tables []models.Table
	if err := worker.mainDB.Where("is_active = ?", true).Find(&tables).Error; err != nil {
		return err
	}

	for _, table := range tables {
		tableData, _ := json.Marshal(table)
		localTable := database.LocalTable{
			ID:         table.ID,
			TableData:  string(tableData),
			LastSynced: time.Now(),
		}
		worker.localDB.GetDB().Save(&localTable)
	}

	log.Printf("Pulled %d tables from main database", len(tables))
	return nil
}

// processElectronicInvoice processes electronic invoice for a sale
func (worker *SyncWorker) processElectronicInvoice(sale *models.Sale) {
	// Load full sale data
	worker.mainDB.Preload("Order.Items.Product").
		Preload("Customer").
		Preload("PaymentDetails.PaymentMethod").
		First(sale, sale.ID)

	// Send to DIAN (default to true for sync - send email)
	invoice, err := worker.invoiceSvc.SendInvoice(sale, true)
	if err != nil {
		log.Printf("Failed to send electronic invoice for sale %s: %v", sale.SaleNumber, err)
		// Queue for retry
		queuedInvoice := models.QueuedInvoice{
			SaleID:     sale.ID,
			Type:       "invoice",
			RetryCount: 0,
			LastError:  err.Error(),
		}
		worker.mainDB.Create(&queuedInvoice)
	} else {
		// Update sale with invoice
		sale.ElectronicInvoice = invoice
		sale.InvoiceType = "electronic"
		worker.mainDB.Save(sale)
		log.Printf("Successfully sent electronic invoice for sale %s", sale.SaleNumber)
	}
}

// checkConnection checks if we have internet connection
func (worker *SyncWorker) checkConnection() bool {
	// Try to ping the main database
	sqlDB, err := worker.mainDB.DB()
	if err != nil {
		return false
	}

	if err := sqlDB.Ping(); err != nil {
		return false
	}

	return true
}

// cleanOldData cleans old synced data from local database
func (worker *SyncWorker) cleanOldData() {
	// Get config for how many days to keep
	daysToKeep := 7 // Default 7 days
	if configValue, err := worker.configSvc.GetSystemConfig("max_offline_days"); err == nil && configValue != "" {
		// Parse days from config
		fmt.Sscanf(configValue, "%d", &daysToKeep)
	}

	// Clean old data
	if err := worker.localDB.ClearSyncedData(daysToKeep); err != nil {
		log.Printf("Error cleaning old data: %v", err)
	} else {
		log.Printf("Cleaned synced data older than %d days", daysToKeep)
	}
}

// ForceSync forces an immediate synchronization
func ForceSync() error {
	worker := &SyncWorker{
		mainDB:     database.GetDB(),
		localDB:    database.GetLocalDB(),
		configSvc:  NewConfigService(),
		invoiceSvc: NewInvoiceService(),
	}

	worker.performSync()

	// Get sync status
	status, _ := worker.localDB.GetSyncStatus()
	if status != nil && status.Status == "completed" {
		return nil
	}

	return fmt.Errorf("sync failed: %s", status.LastError)
}

// GetSyncStatus gets current sync status
func GetSyncStatus() (*database.SyncStatus, error) {
	localDB := database.GetLocalDB()
	return localDB.GetSyncStatus()
}

// GetSyncLogs gets sync logs
func GetSyncLogs(limit int) ([]database.SyncLog, error) {
	localDB := database.GetLocalDB()
	var logs []database.SyncLog

	err := localDB.GetDB().Order("synced_at DESC").Limit(limit).Find(&logs).Error
	return logs, err
}
