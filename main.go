package main

import (
	"PosApp/app/config"
	"PosApp/app/database"
	"PosApp/app/services"
	"PosApp/app/websocket"
	"context"
	"embed"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// App struct
type App struct {
	ctx                  context.Context
	LoggerService        *services.LoggerService
	ConfigManagerService *services.ConfigManagerService
	ProductService       *services.ProductService
	OrderService         *services.OrderService
	SalesService         *services.SalesService
	DIANService          *services.DIANService
	EmployeeService      *services.EmployeeService
	ReportsService       *services.ReportsService
	PrinterService       *services.PrinterService
	ConfigService        *services.ConfigService
	ParametricService    *services.ParametricService
	DashboardService     *services.DashboardService
	UpdateService        *services.UpdateService
	WSServer             *websocket.Server
	isFirstRun           bool
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Maximise window on startup (cross-version compatible)
	runtime.WindowMaximise(a.ctx)

	// Only start background services if not first run
	if !a.isFirstRun {
		// Start WebSocket server for mobile apps
		wsPort := os.Getenv("WS_PORT")
		if wsPort == "" {
			wsPort = "8080" // Default port
		}
		a.LoggerService.LogInfo("Starting WebSocket server", "Port: "+wsPort)
		a.WSServer = websocket.NewServer(":" + wsPort)
		go func() {
			defer a.LoggerService.RecoverPanic()
			a.WSServer.Start()
		}()

		// Start sync worker for offline queue
		a.LoggerService.LogInfo("Starting sync worker for offline queue")
		go func() {
			defer a.LoggerService.RecoverPanic()
			services.StartSyncWorker()
		}()

		// Start DIAN validation worker
		a.LoggerService.LogInfo("Starting DIAN validation worker")
		go func() {
			defer a.LoggerService.RecoverPanic()
			services.StartValidationWorker()
		}()
	}
}

// domReady is called after front-end resources have been loaded
func (a *App) domReady(ctx context.Context) {
	// Add your action here
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	a.LoggerService.LogInfo("Application closing")

	// Stop WebSocket server
	if a.WSServer != nil {
		a.LoggerService.LogInfo("Stopping WebSocket server")
		a.WSServer.Stop()
	}

	// Close database connection
	if err := database.Close(); err != nil {
		a.LoggerService.LogError("Error closing database", err)
	} else {
		a.LoggerService.LogInfo("Database connection closed successfully")
	}

	a.LoggerService.LogInfo("Application shutdown complete")
	return false
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	// Perform your teardown here
}

// InitializeServicesAfterSetup initializes all services after setup is complete
func (a *App) InitializeServicesAfterSetup() error {
	// Initialize services after database is ready
	a.ProductService = services.NewProductService()
	a.OrderService = services.NewOrderService()
	a.SalesService = services.NewSalesService()
	a.DIANService = services.NewDIANService()
	a.EmployeeService = services.NewEmployeeService()
	a.ReportsService = services.NewReportsService()
	a.PrinterService = services.NewPrinterService()
	a.ConfigService = services.NewConfigService()
	a.ParametricService = services.NewParametricService()
	a.DashboardService = services.NewDashboardService()

	// Initialize default system configurations
	if err := a.ConfigService.InitializeDefaultSystemConfigs(); err != nil {
		return fmt.Errorf("failed to initialize system configs: %w", err)
	}

	// Complete setup (run seeds)
	if err := a.ConfigManagerService.CompleteSetup(); err != nil {
		return fmt.Errorf("failed to complete setup: %w", err)
	}

	a.isFirstRun = false
	return nil
}

// ConnectDatabaseWithConfig connects to database using config.json settings
func (a *App) ConnectDatabaseWithConfig(cfg *config.AppConfig) error {
	// Initialize database with config
	if err := database.InitializeWithConfig(cfg); err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}

	// Initialize all services
	if err := a.InitializeServicesAfterSetup(); err != nil {
		return err
	}

	// Start background workers
	go services.StartSyncWorker()
	go services.StartValidationWorker()

	return nil
}

func main() {
	// Initialize logger FIRST to catch all errors
	loggerService := services.NewLoggerService()
	defer loggerService.Close()

	// Recover from any panic and log it
	defer func() {
		if r := recover(); r != nil {
			loggerService.LogPanic(r)
			os.Exit(1)
		}
	}()

	loggerService.LogInfo("Application starting", "Restaurant POS System")

	// Load environment variables from .env file in project root (for development)
	if err := godotenv.Load(".env"); err != nil {
		loggerService.LogWarning(".env file not found, will use config.json if available")
	}

	// Create an instance of the app structure
	app := NewApp()
	app.LoggerService = loggerService

	// Initialize ConfigManagerService first (always available)
	app.ConfigManagerService = services.NewConfigManagerService()
	app.UpdateService = services.NewUpdateService()

	// Check if this is the first run
	isFirstRun, err := app.ConfigManagerService.IsFirstRun()
	if err != nil {
		loggerService.LogWarning("Could not check first run status", err.Error())
		isFirstRun = true
	}

	app.isFirstRun = isFirstRun

	// Always initialize services (needed for Wails bindings generation)
	// Services should handle nil database gracefully
	loggerService.LogInfo("Initializing services")
	app.ProductService = services.NewProductService()
	app.OrderService = services.NewOrderService()
	app.SalesService = services.NewSalesService()
	app.DIANService = services.NewDIANService()
	app.EmployeeService = services.NewEmployeeService()
	app.ReportsService = services.NewReportsService()
	app.PrinterService = services.NewPrinterService()
	app.ConfigService = services.NewConfigService()
	app.ParametricService = services.NewParametricService()
	app.DashboardService = services.NewDashboardService()

	if !isFirstRun {
		// Load configuration from config.json
		loggerService.LogInfo("Loading configuration from config.json")
		cfg, err := app.ConfigManagerService.GetConfig()
		if err != nil {
			loggerService.LogError("Error loading config, trying fallback to environment variables", err)
			// Fallback to environment variables
			if err := database.Initialize(); err != nil {
				loggerService.LogFatal("Failed to initialize database", err)
				return
			}
		} else {
			// Initialize database with config
			loggerService.LogInfo("Initializing database with config.json settings")
			if err := database.InitializeWithConfig(cfg); err != nil {
				loggerService.LogFatal("Failed to initialize database with config", err)
				return
			}
		}

		// CRITICAL: Reinitialize all services AFTER database is ready
		// This ensures they get the actual database connection, not nil
		loggerService.LogInfo("Reinitializing services with database connection")
		app.ProductService = services.NewProductService()
		app.OrderService = services.NewOrderService()
		app.SalesService = services.NewSalesService()
		app.DIANService = services.NewDIANService()
		app.EmployeeService = services.NewEmployeeService()
		app.ReportsService = services.NewReportsService()
		app.PrinterService = services.NewPrinterService()
		app.ConfigService = services.NewConfigService()
		app.ParametricService = services.NewParametricService()
		app.DashboardService = services.NewDashboardService()

		// Initialize default system configurations (only after DB is ready)
		loggerService.LogInfo("Initializing default system configurations")
		app.ConfigService.InitializeDefaultSystemConfigs()
	} else {
		loggerService.LogInfo("First run detected - setup wizard will be shown")
		loggerService.LogInfo("Services initialized but database will be configured via setup wizard")
	}

	// Build bind list with all services (always available for bindings generation)
	bindList := []interface{}{
		app,
		app.LoggerService,
		app.ConfigManagerService,
		app.UpdateService,
		app.ProductService,
		app.OrderService,
		app.SalesService,
		app.DIANService,
		app.EmployeeService,
		app.ReportsService,
		app.PrinterService,
		app.ConfigService,
		app.ParametricService,
		app.DashboardService,
	}

	// Create application with options
	err = wails.Run(&options.App{
		Title:  "Restaurant POS System",
		Width:  1400,
		Height: 900,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		Bind:             bindList,
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
		// App metadata (aparece en Propiedades del .exe)
		Menu: nil,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
