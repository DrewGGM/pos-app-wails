package main

import (
	"PosApp/app/config"
	"PosApp/app/database"
	"PosApp/app/services"
	"PosApp/app/websocket"
	"context"
	"embed"
	"fmt"
	"log"
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
	ctx                context.Context
	ConfigManagerService *services.ConfigManagerService
	ProductService     *services.ProductService
	OrderService       *services.OrderService
	SalesService       *services.SalesService
	DIANService        *services.DIANService
	EmployeeService    *services.EmployeeService
	ReportsService     *services.ReportsService
	PrinterService     *services.PrinterService
	ConfigService      *services.ConfigService
	ParametricService  *services.ParametricService
	DashboardService   *services.DashboardService
	UpdateService      *services.UpdateService
	WSServer           *websocket.Server
	isFirstRun         bool
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
		a.WSServer = websocket.NewServer(":" + wsPort)
		go a.WSServer.Start()

		// Start sync worker for offline queue
		go services.StartSyncWorker()

		// Start DIAN validation worker
		go services.StartValidationWorker()
	}
}

// domReady is called after front-end resources have been loaded
func (a *App) domReady(ctx context.Context) {
	// Add your action here
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	// Stop WebSocket server
	if a.WSServer != nil {
		a.WSServer.Stop()
	}

	// Close database connection
	database.Close()

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
	// Load environment variables from .env file in project root (for development)
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("Warning: .env file not found, will use config.json if available")
	}

	// Create an instance of the app structure
	app := NewApp()

	// Initialize ConfigManagerService first (always available)
	app.ConfigManagerService = services.NewConfigManagerService()
	app.UpdateService = services.NewUpdateService()

	// Check if this is the first run
	isFirstRun, err := app.ConfigManagerService.IsFirstRun()
	if err != nil {
		log.Printf("Warning: could not check first run status: %v", err)
		isFirstRun = true
	}

	app.isFirstRun = isFirstRun

	if !isFirstRun {
		// Load configuration from config.json
		cfg, err := app.ConfigManagerService.GetConfig()
		if err != nil {
			log.Printf("Error loading config: %v", err)
			// Fallback to environment variables
			if err := database.Initialize(); err != nil {
				fmt.Printf("Error initializing database: %v\n", err)
				return
			}
		} else {
			// Initialize database with config
			if err := database.InitializeWithConfig(cfg); err != nil {
				fmt.Printf("Error initializing database with config: %v\n", err)
				return
			}
		}

		// Initialize services after database is ready
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

		// Initialize default system configurations
		app.ConfigService.InitializeDefaultSystemConfigs()
	} else {
		log.Println("First run detected - setup wizard will be shown")
		// Services will be initialized after setup wizard completes
	}

	// Build bind list dynamically (some services may be nil on first run)
	bindList := []interface{}{
		app,
		app.ConfigManagerService, // Always available
		app.UpdateService,        // Always available
	}

	// Add other services if they're initialized
	if !app.isFirstRun {
		bindList = append(bindList,
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
		)
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
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
