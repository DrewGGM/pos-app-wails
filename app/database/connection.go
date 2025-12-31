package database

import (
	"PosApp/app/config"
	"PosApp/app/models"
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return db
}

// buildDSN constructs the database connection string from environment variables
// Priority: DATABASE_URL > individual variables (DB_HOST, DB_PORT, etc.) > defaults
func buildDSN() string {
	// Option 1: Check for complete DATABASE_URL first (highest priority)
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		log.Printf("Using DATABASE_URL for database connection")
		return dsn
	}

	// Option 2: Build from individual environment variables
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	sslmode := os.Getenv("DB_SSLMODE")

	// Set defaults for development if not specified
	if host == "" {
		host = "localhost"
	}
	if port == "" {
		port = "5432"
	}
	if user == "" {
		user = "postgres"
	}
	if password == "" {
		password = "postgres"
	}
	if dbname == "" {
		dbname = "posapp"
	}
	if sslmode == "" {
		sslmode = "disable"
	}

	// Build DSN from components
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	log.Printf("Built database connection from individual variables: host=%s port=%s dbname=%s sslmode=%s",
		host, port, dbname, sslmode)

	return dsn
}

// buildDSNFromConfig builds DSN from AppConfig
func buildDSNFromConfig(cfg *config.AppConfig) string {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.Username,
		cfg.Database.Password,
		cfg.Database.Database,
		cfg.Database.SSLMode,
	)

	log.Printf("Built database connection from config.json: host=%s port=%d dbname=%s sslmode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.Database, cfg.Database.SSLMode)

	return dsn
}

// Initialize sets up the database connection
// If appConfig is provided, it uses config.json; otherwise uses environment variables
func Initialize() error {
	return InitializeWithConfig(nil)
}

// InitializeWithConfig sets up the database connection with optional AppConfig
func InitializeWithConfig(appConfig *config.AppConfig) error {
	var err error
	var dsn string

	// Build PostgreSQL connection string
	if appConfig != nil {
		dsn = buildDSNFromConfig(appConfig)
	} else {
		dsn = buildDSN()
	}

	// Configure GORM
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent), // Cambiado a Silent para reducir logs
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
		PrepareStmt: true,
		// PostgreSQL supports foreign key constraints
		DisableForeignKeyConstraintWhenMigrating: false,
	}

	// Open connection
	db, err = gorm.Open(postgres.Open(dsn), gormConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Get underlying SQL database
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}

	// Set connection pool settings
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// Run migrations
	if err := RunMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	// Seed initial data
	if err := SeedInitialData(); err != nil {
		log.Printf("Warning: failed to seed initial data: %v", err)
	}

	return nil
}

// RunMigrations runs database migrations
func RunMigrations() error {
	// Create tables
	err := db.AutoMigrate(
		// Product models
		&models.Category{},
		&models.ModifierGroup{},
		&models.Modifier{},
		&models.Product{},
		&models.ProductModifier{},
		&models.InventoryMovement{},

		// Custom page models
		&models.CustomPage{},
		&models.CustomPageProduct{},

		// Combo models
		&models.Combo{},
		&models.ComboItem{},

		// Ingredient models
		&models.Ingredient{},
		&models.ProductIngredient{},
		&models.IngredientMovement{},

		// Customer models
		&models.Customer{},

		// Employee models
		&models.Employee{},

		// Cash register models
		&models.CashRegister{},
		&models.CashMovement{},
		&models.CashRegisterReport{},

		// Order models
		&models.TableArea{},
		&models.Table{},
		&models.OrderType{},
		&models.Order{},
		&models.OrderItem{},
		&models.OrderItemModifier{},

		// Sale models
		&models.PaymentMethod{},
		&models.Sale{},
		&models.Payment{},
		&models.PaymentAllocation{},
		&models.ElectronicInvoice{},
		&models.CreditNote{},
		&models.DebitNote{},

		// Employee models
		&models.Employee{},
		&models.Session{},
		&models.CashRegister{},
		&models.CashMovement{},
		&models.CashRegisterReport{},
		&models.AuditLog{},

		// Config models
		&models.SystemConfig{},
		&models.RestaurantConfig{},
		&models.DIANConfig{},
		&models.PrinterConfig{},
		&models.TableLayout{},
		&models.UITheme{},
		&models.GoogleSheetsConfig{},
		&models.MCPConfig{},
		&models.NetworkConfig{},
		&models.TunnelConfig{},

		// Rappi integration models
		&models.RappiConfig{},
		&models.RappiOrder{},
		&models.RappiMenuSync{},
		&models.RappiWebhook{},
	)

	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	// Run additional column migrations for fields that might be missing
	if err := runAdditionalMigrations(); err != nil {
		log.Printf("Warning: Some additional migrations failed: %v", err)
	}

	// Create indexes for better performance
	createIndexes()

	return nil
}

// runAdditionalMigrations adds columns that might be missing in existing databases
func runAdditionalMigrations() error {
	// Add dian_response column to electronic_invoices if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE electronic_invoices
		ADD COLUMN IF NOT EXISTS dian_response TEXT
	`).Error; err != nil {
		return fmt.Errorf("failed to add dian_response column: %w", err)
	}

	// Add order_type_id and sequence_number columns to orders if they don't exist
	if err := db.Exec(`
		ALTER TABLE orders
		ADD COLUMN IF NOT EXISTS order_type_id INTEGER REFERENCES order_types(id),
		ADD COLUMN IF NOT EXISTS sequence_number INTEGER
	`).Error; err != nil {
		return fmt.Errorf("failed to add order type columns: %w", err)
	}

	// Add is_system_default column to payment_methods if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE payment_methods
		ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN DEFAULT false
	`).Error; err != nil {
		return fmt.Errorf("failed to add is_system_default column: %w", err)
	}

	// Mark existing system payment methods as system defaults
	if err := db.Exec(`
		UPDATE payment_methods
		SET is_system_default = true
		WHERE name IN ('Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Transferencia')
	`).Error; err != nil {
		log.Printf("Warning: Failed to mark system payment methods: %v", err)
	}

	// Migrate existing orders to use order types
	if err := migrateExistingOrderTypes(); err != nil {
		log.Printf("Warning: Failed to migrate existing order types: %v", err)
	}

	// Add hide_amount_in_reports column to order_types if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE order_types
		ADD COLUMN IF NOT EXISTS hide_amount_in_reports BOOLEAN DEFAULT false
	`).Error; err != nil {
		return fmt.Errorf("failed to add hide_amount_in_reports column: %w", err)
	}

	// Add show_in_reports column to payment_methods if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE payment_methods
		ADD COLUMN IF NOT EXISTS show_in_reports BOOLEAN DEFAULT true
	`).Error; err != nil {
		return fmt.Errorf("failed to add show_in_reports column: %w", err)
	}

	// Add requires_voucher column to payment_methods if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE payment_methods
		ADD COLUMN IF NOT EXISTS requires_voucher BOOLEAN DEFAULT false
	`).Error; err != nil {
		return fmt.Errorf("failed to add requires_voucher column: %w", err)
	}

	// Add voucher_image column to payments if it doesn't exist
	if err := db.Exec(`
		ALTER TABLE payments
		ADD COLUMN IF NOT EXISTS voucher_image TEXT
	`).Error; err != nil {
		return fmt.Errorf("failed to add voucher_image column: %w", err)
	}

	log.Println("✅ Additional migrations completed successfully")
	return nil
}

// migrateExistingOrderTypes migrates existing orders to use the new order_types table
func migrateExistingOrderTypes() error {
	// Update existing orders to link to the appropriate order type
	migrations := []struct {
		OldType     string
		NewTypeCode string
	}{
		{"dine-in", "dine-in"},
		{"takeout", "takeout"},
		{"delivery", "delivery"},
	}

	for _, m := range migrations {
		if err := db.Exec(`
			UPDATE orders
			SET order_type_id = (SELECT id FROM order_types WHERE code = ? LIMIT 1)
			WHERE type = ? AND order_type_id IS NULL
		`, m.NewTypeCode, m.OldType).Error; err != nil {
			log.Printf("Warning: Failed to migrate orders with type '%s': %v", m.OldType, err)
		}
	}

	// Copy takeout_number to sequence_number for orders that have it
	if err := db.Exec(`
		UPDATE orders
		SET sequence_number = takeout_number
		WHERE takeout_number IS NOT NULL AND sequence_number IS NULL
	`).Error; err != nil {
		log.Printf("Warning: Failed to migrate takeout numbers: %v", err)
	}

	return nil
}

// createIndexes creates database indexes for better query performance
func createIndexes() {
	// Drop old unique constraint on tables.number if it exists
	db.Exec("DROP INDEX IF EXISTS uni_tables_number")

	// Create partial unique index on tables.number (only for non-deleted rows)
	// This allows reusing table numbers after soft delete
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_number_unique ON tables(number) WHERE deleted_at IS NULL")

	// Order indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)")

	// Sale indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_sales_employee_id ON sales(employee_id)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)")

	// Product indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)")

	// Electronic invoice indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_electronic_invoices_status ON electronic_invoices(status)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_electronic_invoices_sale_id ON electronic_invoices(sale_id)")

	// Queue indexes for offline sync
	db.Exec("CREATE INDEX IF NOT EXISTS idx_queued_orders_created_at ON queued_orders(created_at)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_queued_invoices_created_at ON queued_invoices(created_at)")
}

// SeedInitialData seeds initial configuration data
func SeedInitialData() error {
	// Create only 4 system default payment methods (cannot be deleted)
	// Users can create additional payment methods as needed
	paymentMethods := []models.PaymentMethod{
		{Name: "Efectivo", Type: "cash", Icon: "💵", RequiresRef: false, IsActive: true, IsSystemDefault: true, DisplayOrder: 1},
		{Name: "Tarjeta Débito", Type: "card", Icon: "💳", RequiresRef: true, IsActive: true, IsSystemDefault: true, DisplayOrder: 2},
		{Name: "Tarjeta Crédito", Type: "card", Icon: "💳", RequiresRef: true, IsActive: true, IsSystemDefault: true, DisplayOrder: 3},
		{Name: "Transferencia", Type: "digital", Icon: "📱", RequiresRef: true, IsActive: true, IsSystemDefault: true, DisplayOrder: 4},
	}

	for _, pm := range paymentMethods {
		var count int64
		db.Model(&models.PaymentMethod{}).Where("name = ?", pm.Name).Count(&count)
		if count == 0 {
			db.Create(&pm)
		}
	}

	// Create default categories
	categories := []models.Category{
		{Name: "Entradas", Description: "Platos de entrada", Color: "#FF6B6B", DisplayOrder: 1, IsActive: true},
		{Name: "Platos Principales", Description: "Platos principales", Color: "#4ECDC4", DisplayOrder: 2, IsActive: true},
		{Name: "Bebidas", Description: "Bebidas y refrescos", Color: "#45B7D1", DisplayOrder: 3, IsActive: true},
		{Name: "Postres", Description: "Postres y dulces", Color: "#FFA07A", DisplayOrder: 4, IsActive: true},
		{Name: "Adicionales", Description: "Extras y adicionales", Color: "#98D8C8", DisplayOrder: 5, IsActive: true},
	}

	for _, cat := range categories {
		var count int64
		db.Model(&models.Category{}).Where("name = ?", cat.Name).Count(&count)
		if count == 0 {
			db.Create(&cat)
		}
	}

	// Create default table areas only if no areas exist at all (including soft-deleted)
	// This allows users to fully manage their own areas without automatic recreation
	var totalAreaCount int64
	db.Unscoped().Model(&models.TableArea{}).Count(&totalAreaCount)
	if totalAreaCount == 0 {
		tableAreas := []models.TableArea{
			{Name: "Salón Principal", Description: "Área principal del restaurante", Color: "#3B82F6", IsActive: true},
		}
		for _, area := range tableAreas {
			db.Create(&area)
		}
	}

	// Create default order types
	orderTypes := []models.OrderType{
		{
			Code:                    "dine-in",
			Name:                    "Para Comer Aquí",
			RequiresSequentialNumber: false,
			SequencePrefix:          "",
			DisplayColor:            "#3B82F6",
			Icon:                    "restaurant",
			IsActive:                true,
			DisplayOrder:            1,
		},
		{
			Code:                    "takeout",
			Name:                    "Para Llevar",
			RequiresSequentialNumber: true,
			SequencePrefix:          "",
			DisplayColor:            "#10B981",
			Icon:                    "shopping_bag",
			IsActive:                true,
			DisplayOrder:            2,
		},
		{
			Code:                    "delivery",
			Name:                    "Domicilio",
			RequiresSequentialNumber: true,
			SequencePrefix:          "D-",
			DisplayColor:            "#F59E0B",
			Icon:                    "delivery_dining",
			IsActive:                true,
			DisplayOrder:            3,
		},
	}

	for _, ot := range orderTypes {
		var count int64
		db.Model(&models.OrderType{}).Where("code = ?", ot.Code).Count(&count)
		if count == 0 {
			db.Create(&ot)
		}
	}

	// Create default system config
	configs := []models.SystemConfig{
		{Key: "sync_interval", Value: "5", Type: "number", Category: "sync"},
		{Key: "retry_attempts", Value: "3", Type: "number", Category: "sync"},
		{Key: "retry_delay", Value: "30", Type: "number", Category: "sync"},
		{Key: "enable_auto_sync", Value: "true", Type: "boolean", Category: "sync"},
		{Key: "default_tax_rate", Value: "19", Type: "number", Category: "general"},
		{Key: "currency", Value: "COP", Type: "string", Category: "general"},
		{Key: "currency_symbol", Value: "$", Type: "string", Category: "general"},
	}

	for _, cfg := range configs {
		var count int64
		db.Model(&models.SystemConfig{}).Where("key = ?", cfg.Key).Count(&count)
		if count == 0 {
			db.Create(&cfg)
		}
	}

	return nil
}

// Close closes the database connection
func Close() error {
	// Check if database is initialized
	if db == nil {
		return nil // Nothing to close
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// Transaction executes a function within a database transaction
func Transaction(fn func(*gorm.DB) error) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}
	return db.Transaction(fn)
}
