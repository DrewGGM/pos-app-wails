package database

import (
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// LocalDB manages the local SQLite database for offline operations
type LocalDB struct {
	db          *gorm.DB
	isConnected bool
	dbPath      string
}

var localDB *LocalDB

// InitializeLocalDB initializes the local SQLite database
func InitializeLocalDB(dbPath string) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create database directory: %w", err)
	}

	// Open SQLite connection (CGO-free driver)
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})

	if err != nil {
		return fmt.Errorf("failed to connect to local database: %w", err)
	}

	localDB = &LocalDB{
		db:          db,
		isConnected: true,
		dbPath:      dbPath,
	}

	// Run migrations for local tables
	if err := localDB.runMigrations(); err != nil {
		return fmt.Errorf("failed to run local migrations: %w", err)
	}

	return nil
}

// GetLocalDB returns the local database instance
func GetLocalDB() *LocalDB {
	if localDB == nil {
		InitializeLocalDB("./data/local.db")
	}
	return localDB
}

// runMigrations creates necessary tables in local database
func (l *LocalDB) runMigrations() error {
	// Create tables for offline data
	return l.db.AutoMigrate(
		// Queue tables for sync
		&models.QueuedOrder{},
		&models.QueuedInvoice{},

		// Cached data tables
		&LocalProduct{},
		&LocalCategory{},
		&LocalTable{},
		&LocalOrder{},
		&LocalOrderItem{},
		&LocalSale{},
		&LocalCustomer{},
		&LocalPaymentMethod{},

		// Sync status
		&SyncStatus{},
		&SyncLog{},
	)
}

// LocalProduct represents cached product data
type LocalProduct struct {
	ID          uint      `gorm:"primaryKey"`
	ProductData string    `json:"product_data"` // JSON serialized product
	LastSynced  time.Time `json:"last_synced"`
	IsModified  bool      `json:"is_modified"`
}

// LocalCategory represents cached category data
type LocalCategory struct {
	ID           uint      `gorm:"primaryKey"`
	CategoryData string    `json:"category_data"`
	LastSynced   time.Time `json:"last_synced"`
}

// LocalTable represents cached table data
type LocalTable struct {
	ID         uint      `gorm:"primaryKey"`
	TableData  string    `json:"table_data"`
	LastSynced time.Time `json:"last_synced"`
}

// LocalOrder represents a locally stored order
type LocalOrder struct {
	ID           uint      `gorm:"primaryKey"`
	OrderNumber  string    `gorm:"unique"`
	OrderData    string    `json:"order_data"`
	Status       string    `json:"status"`
	IsSynced     bool      `json:"is_synced"`
	SyncAttempts int       `json:"sync_attempts"`
	LastError    string    `json:"last_error"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// LocalOrderItem represents locally stored order items
type LocalOrderItem struct {
	ID        uint      `gorm:"primaryKey"`
	OrderID   uint      `json:"order_id"`
	ItemData  string    `json:"item_data"`
	CreatedAt time.Time `json:"created_at"`
}

// LocalSale represents a locally stored sale
type LocalSale struct {
	ID           uint      `gorm:"primaryKey"`
	SaleNumber   string    `gorm:"unique"`
	SaleData     string    `json:"sale_data"`
	IsSynced     bool      `json:"is_synced"`
	NeedsInvoice bool      `json:"needs_invoice"`
	SyncAttempts int       `json:"sync_attempts"`
	LastError    string    `json:"last_error"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// LocalCustomer represents cached customer data
type LocalCustomer struct {
	ID                   uint      `gorm:"primaryKey"`
	IdentificationNumber string    `gorm:"unique"`
	CustomerData         string    `json:"customer_data"`
	LastSynced           time.Time `json:"last_synced"`
}

// LocalPaymentMethod represents cached payment method
type LocalPaymentMethod struct {
	ID                uint      `gorm:"primaryKey"`
	PaymentMethodData string    `json:"payment_method_data"`
	LastSynced        time.Time `json:"last_synced"`
}

// SyncStatus tracks synchronization status
type SyncStatus struct {
	ID              uint       `gorm:"primaryKey"`
	LastSyncAt      *time.Time `json:"last_sync_at"`
	Status          string     `json:"status"` // "syncing", "completed", "failed"
	PendingOrders   int        `json:"pending_orders"`
	PendingSales    int        `json:"pending_sales"`
	PendingInvoices int        `json:"pending_invoices"`
	LastError       string     `json:"last_error"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// SyncLog tracks synchronization history
type SyncLog struct {
	ID         uint      `gorm:"primaryKey"`
	EntityType string    `json:"entity_type"` // "order", "sale", "invoice"
	EntityID   uint      `json:"entity_id"`
	Action     string    `json:"action"` // "create", "update", "delete"
	Status     string    `json:"status"` // "success", "failed"
	Error      string    `json:"error"`
	SyncedAt   time.Time `json:"synced_at"`
}

// SaveOrder saves an order locally
func (l *LocalDB) SaveOrder(order *models.Order) error {
	// Convert order to JSON
	orderJSON, err := json.Marshal(order)
	if err != nil {
		return err
	}

	localOrder := LocalOrder{
		OrderNumber: order.OrderNumber,
		OrderData:   string(orderJSON),
		Status:      string(order.Status),
		IsSynced:    false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	return l.db.Create(&localOrder).Error
}

// GetPendingOrders gets orders pending sync
func (l *LocalDB) GetPendingOrders() ([]LocalOrder, error) {
	var orders []LocalOrder
	err := l.db.Where("is_synced = ? AND sync_attempts < ?", false, 3).Find(&orders).Error
	return orders, err
}

// SaveSale saves a sale locally
func (l *LocalDB) SaveSale(sale *models.Sale, needsInvoice bool) error {
	// Convert sale to JSON
	saleJSON, err := json.Marshal(sale)
	if err != nil {
		return err
	}

	localSale := LocalSale{
		SaleNumber:   sale.SaleNumber,
		SaleData:     string(saleJSON),
		IsSynced:     false,
		NeedsInvoice: needsInvoice,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	return l.db.Create(&localSale).Error
}

// GetPendingSales gets sales pending sync
func (l *LocalDB) GetPendingSales() ([]LocalSale, error) {
	var sales []LocalSale
	err := l.db.Where("is_synced = ? AND sync_attempts < ?", false, 3).Find(&sales).Error
	return sales, err
}

// MarkOrderSynced marks an order as synced
func (l *LocalDB) MarkOrderSynced(orderNumber string) error {
	return l.db.Model(&LocalOrder{}).Where("order_number = ?", orderNumber).Update("is_synced", true).Error
}

// MarkSaleSynced marks a sale as synced
func (l *LocalDB) MarkSaleSynced(saleNumber string) error {
	return l.db.Model(&LocalSale{}).Where("sale_number = ?", saleNumber).Update("is_synced", true).Error
}

// UpdateSyncStatus updates sync status
func (l *LocalDB) UpdateSyncStatus(status string, error string) error {
	var syncStatus SyncStatus
	l.db.FirstOrCreate(&syncStatus)

	now := time.Now()
	syncStatus.LastSyncAt = &now
	syncStatus.Status = status
	syncStatus.LastError = error
	syncStatus.UpdatedAt = now

	// Count pending items
	var pendingOrders, pendingSales, pendingInvoices int64
	l.db.Model(&LocalOrder{}).Where("is_synced = ?", false).Count(&pendingOrders)
	l.db.Model(&LocalSale{}).Where("is_synced = ?", false).Count(&pendingSales)
	l.db.Model(&models.QueuedInvoice{}).Count(&pendingInvoices)

	syncStatus.PendingOrders = int(pendingOrders)
	syncStatus.PendingSales = int(pendingSales)
	syncStatus.PendingInvoices = int(pendingInvoices)

	return l.db.Save(&syncStatus).Error
}

// GetSyncStatus gets current sync status
func (l *LocalDB) GetSyncStatus() (*SyncStatus, error) {
	var status SyncStatus
	err := l.db.FirstOrCreate(&status).Error
	return &status, err
}

// LogSync logs a sync operation
func (l *LocalDB) LogSync(entityType string, entityID uint, action string, status string, error string) {
	log := SyncLog{
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		Status:     status,
		Error:      error,
		SyncedAt:   time.Now(),
	}
	l.db.Create(&log)
}

// ClearSyncedData removes synced data older than specified days
func (l *LocalDB) ClearSyncedData(daysOld int) error {
	cutoffDate := time.Now().AddDate(0, 0, -daysOld)

	// Delete old synced orders
	if err := l.db.Where("is_synced = ? AND updated_at < ?", true, cutoffDate).Delete(&LocalOrder{}).Error; err != nil {
		return err
	}

	// Delete old synced sales
	if err := l.db.Where("is_synced = ? AND updated_at < ?", true, cutoffDate).Delete(&LocalSale{}).Error; err != nil {
		return err
	}

	// Delete old sync logs
	if err := l.db.Where("synced_at < ?", cutoffDate).Delete(&SyncLog{}).Error; err != nil {
		return err
	}

	return nil
}

// GetDB returns the underlying database connection
func (l *LocalDB) GetDB() *gorm.DB {
	return l.db
}

// Close closes the local database connection
func (l *LocalDB) Close() error {
	if l.db != nil {
		sqlDB, err := l.db.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}

// IsOfflineMode checks if system is in offline mode
func (l *LocalDB) IsOfflineMode() bool {
	// Check if we can connect to main database
	mainDB := GetDB()
	if mainDB == nil {
		return true
	}

	// Try a simple query
	var count int64
	if err := mainDB.Model(&models.SystemConfig{}).Count(&count).Error; err != nil {
		return true
	}

	return false
}

// Transaction executes a function within a database transaction
func (l *LocalDB) Transaction(fn func(*gorm.DB) error) error {
	return l.db.Transaction(fn)
}
