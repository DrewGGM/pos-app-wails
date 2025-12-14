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
	ctx                     context.Context
	LoggerService           *services.LoggerService
	ConfigManagerService    *services.ConfigManagerService
	ProductService          *services.ProductService
	IngredientService       *services.IngredientService
	CustomPageService       *services.CustomPageService
	OrderService            *services.OrderService
	OrderTypeService        *services.OrderTypeService
	SalesService            *services.SalesService
	DIANService             *services.DIANService
	EmployeeService         *services.EmployeeService
	ReportsService          *services.ReportsService
	PrinterService          *services.PrinterService
	ConfigService           *services.ConfigService
	ParametricService       *services.ParametricService
	DashboardService        *services.DashboardService
	UpdateService           *services.UpdateService
	GoogleSheetsService     *services.GoogleSheetsService
	ReportSchedulerService  *services.ReportSchedulerService
	RappiConfigService      *services.RappiConfigService
	RappiWebhookServer      *services.RappiWebhookServer
	InvoiceLimitService     *services.InvoiceLimitService
	ConfigAPIServer         *services.ConfigAPIServer
	AuthAPIServer           *services.AuthAPIServer
	MCPService              *services.MCPService
	WSServer                *websocket.Server
	WSManagementService     *services.WebSocketManagementService
	isFirstRun              bool
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
		// Initialize WebSocket server for mobile apps
		wsPort := os.Getenv("WS_PORT")
		if wsPort == "" {
			wsPort = "8080" // Default port
		}
		a.LoggerService.LogInfo("Initializing WebSocket server", "Port: "+wsPort)
		a.WSServer = websocket.NewServer(":" + wsPort)
		// Set database connection for REST API endpoints
		a.WSServer.SetDB(database.GetDB())
		// Update the WebSocket management service with the server instance
		if a.WSManagementService != nil {
			a.WSManagementService.SetServer(a.WSServer)
		}
		// Set OrderService on WebSocket server for REST API endpoints
		if a.OrderService != nil {
			a.OrderService.SetWebSocketServer(a.WSServer)
			a.WSServer.SetOrderService(a.OrderService)
			a.LoggerService.LogInfo("OrderService configured for WebSocket REST API")
		}
		// Now start the WebSocket server with all handlers properly configured
		go func() {
			defer a.LoggerService.RecoverPanic()
			if err := a.WSServer.Start(); err != nil {
				a.LoggerService.LogError("WebSocket server error", err)
			}
		}()

		// Start DIAN validation worker
		a.LoggerService.LogInfo("Starting DIAN validation worker")
		go func() {
			defer a.LoggerService.RecoverPanic()
			services.StartValidationWorker()
		}()

		// Start Google Sheets report scheduler
		if a.ReportSchedulerService != nil {
			a.LoggerService.LogInfo("Starting Google Sheets report scheduler")
			go func() {
				defer a.LoggerService.RecoverPanic()
				if err := a.ReportSchedulerService.Start(); err != nil {
					a.LoggerService.LogWarning("Report scheduler start error", err.Error())
				}
			}()
		}
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

	// Send final report to Google Sheets if enabled
	if a.GoogleSheetsService != nil && !a.isFirstRun {
		a.LoggerService.LogInfo("Sending final report to Google Sheets")
		if err := a.GoogleSheetsService.SyncNow(); err != nil {
			a.LoggerService.LogWarning("Failed to send final report to Google Sheets", err.Error())
		} else {
			a.LoggerService.LogInfo("Final report sent to Google Sheets successfully")
		}
	}

	// Stop report scheduler
	if a.ReportSchedulerService != nil {
		a.LoggerService.LogInfo("Stopping report scheduler")
		a.ReportSchedulerService.Stop()
	}

	// Stop invoice limit sync
	if a.InvoiceLimitService != nil {
		a.LoggerService.LogInfo("Stopping invoice limit sync")
		a.InvoiceLimitService.StopPeriodicSync()
	}

	// Stop Rappi webhook server
	if a.RappiWebhookServer != nil {
		a.LoggerService.LogInfo("Stopping Rappi webhook server")
		a.RappiWebhookServer.Stop()
	}

	// Stop Config API server
	if a.ConfigAPIServer != nil {
		a.LoggerService.LogInfo("Stopping Config API server")
		a.ConfigAPIServer.Stop()
	}

	// Stop Auth API server
	if a.AuthAPIServer != nil {
		a.LoggerService.LogInfo("Stopping Auth API server")
		a.AuthAPIServer.Stop()
	}

	// Stop MCP server
	if a.MCPService != nil {
		a.LoggerService.LogInfo("Stopping MCP server")
		a.MCPService.Stop()
	}

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
	a.IngredientService = services.NewIngredientService()
	a.CustomPageService = services.NewCustomPageService()
	a.OrderService = services.NewOrderService()
	a.OrderTypeService = services.NewOrderTypeService()
	a.SalesService = services.NewSalesService()
	a.DIANService = services.NewDIANService()
	a.EmployeeService = services.NewEmployeeService()
	a.ReportsService = services.NewReportsService()
	a.PrinterService = services.NewPrinterService()
	a.ConfigService = services.NewConfigService()
	a.ParametricService = services.NewParametricService()
	a.DashboardService = services.NewDashboardService()

	// Set WebSocket server on OrderService if available
	if a.WSServer != nil && a.OrderService != nil {
		a.OrderService.SetWebSocketServer(a.WSServer)
		// Also set OrderService on WebSocket server for REST API endpoints
		a.WSServer.SetOrderService(a.OrderService)

		// NOW start the WebSocket server with all handlers properly initialized
		a.LoggerService.LogInfo("Starting WebSocket server with REST API endpoints")
		go func() {
			defer a.LoggerService.RecoverPanic()
			if err := a.WSServer.Start(); err != nil {
				a.LoggerService.LogError("WebSocket server error", err)
			}
		}()
	}

	// Initialize Google Sheets services
	a.GoogleSheetsService = services.NewGoogleSheetsService(database.GetDB())
	a.ReportSchedulerService = services.NewReportSchedulerService(database.GetDB(), a.GoogleSheetsService)
	a.InvoiceLimitService = services.NewInvoiceLimitService(database.GetDB())

	// Initialize Rappi service
	a.RappiConfigService = services.NewRappiConfigService()
	a.RappiWebhookServer = services.NewRappiWebhookServer(a.RappiConfigService, a.OrderService, a.ProductService)

	// Start Rappi webhook server
	a.LoggerService.LogInfo("Starting Rappi webhook server")
	go func() {
		defer a.LoggerService.RecoverPanic()
		if err := a.RappiWebhookServer.Start(); err != nil {
			a.LoggerService.LogWarning("Rappi webhook server start error", err.Error())
		}
	}()

	// Start Config API server for external configuration management
	configAPIPort := os.Getenv("CONFIG_API_PORT")
	if configAPIPort == "" {
		configAPIPort = "8082" // Default port
	}
	a.ConfigAPIServer = services.NewConfigAPIServer(":"+configAPIPort, a.InvoiceLimitService, a.LoggerService)
	a.LoggerService.LogInfo("Starting Config API server", "Port: "+configAPIPort)
	go func() {
		defer a.LoggerService.RecoverPanic()
		if err := a.ConfigAPIServer.Start(); err != nil {
			a.LoggerService.LogWarning("Config API server start error", err.Error())
		}
	}()

	// Start Auth API server for external authentication
	authAPIPort := os.Getenv("AUTH_API_PORT")
	if authAPIPort == "" {
		authAPIPort = "8083" // Default port
	}
	a.AuthAPIServer = services.NewAuthAPIServer(":"+authAPIPort, a.EmployeeService, a.LoggerService)
	a.LoggerService.LogInfo("Starting Auth API server", "Port: "+authAPIPort)
	go func() {
		defer a.LoggerService.RecoverPanic()
		if err := a.AuthAPIServer.Start(); err != nil {
			a.LoggerService.LogWarning("Auth API server start error", err.Error())
		}
	}()

	// Initialize MCP service
	a.MCPService = services.NewMCPService(
		a.ProductService,
		a.SalesService,
		a.OrderService,
		a.IngredientService,
		a.DashboardService,
		a.ReportsService,
	)
	a.LoggerService.LogInfo("MCP Service initialized")
	// Auto-start MCP server if enabled
	go func() {
		defer a.LoggerService.RecoverPanic()
		a.MCPService.AutoStart()
	}()

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

	// Initialize WebSocket server
	wsPort := os.Getenv("WS_PORT")
	if wsPort == "" {
		wsPort = "8080" // Default port
	}
	a.LoggerService.LogInfo("Starting WebSocket server", "Port: "+wsPort)
	a.WSServer = websocket.NewServer(":" + wsPort)
	a.WSServer.SetDB(database.GetDB())

	// Update the WebSocket management service with the server instance
	if a.WSManagementService != nil {
		a.WSManagementService.SetServer(a.WSServer)
	}

	// Update the OrderService with the server instance
	if a.OrderService != nil {
		a.OrderService.SetWebSocketServer(a.WSServer)
	}

	go func() {
		defer a.LoggerService.RecoverPanic()
		a.WSServer.Start()
	}()

	// Start background workers
	go services.StartValidationWorker()

	return nil
}

func main() {
	// Initialize logger FIRST to catch all errors
	loggerService := services.NewLoggerService()
	if loggerService == nil {
		fmt.Println("CRITICAL: Logger service failed to initialize")
		os.Exit(1)
	}
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
	loggerService.LogInfo("Initializing services")
	app.ProductService = services.NewProductService()
	app.IngredientService = services.NewIngredientService()
	app.CustomPageService = services.NewCustomPageService()
	app.OrderService = services.NewOrderService()
	app.OrderTypeService = services.NewOrderTypeService()
	app.SalesService = services.NewSalesService()
	app.DIANService = services.NewDIANService()
	app.EmployeeService = services.NewEmployeeService()
	app.ReportsService = services.NewReportsService()
	app.PrinterService = services.NewPrinterService()
	app.ConfigService = services.NewConfigService()
	app.ParametricService = services.NewParametricService()
	app.DashboardService = services.NewDashboardService()
	app.WSManagementService = services.NewWebSocketManagementService(nil)
	app.GoogleSheetsService = services.NewGoogleSheetsService(nil)
	app.ReportSchedulerService = services.NewReportSchedulerService(nil, app.GoogleSheetsService)
	app.RappiConfigService = services.NewRappiConfigService()
	app.InvoiceLimitService = services.NewInvoiceLimitService(nil)
	// Initialize MCP Service with nil services (will be reinitialized when database is available)
	app.MCPService = services.NewMCPService(nil, nil, nil, nil, nil, nil)

	if !isFirstRun {
		loggerService.LogInfo("Loading configuration from config.json")
		cfg, err := app.ConfigManagerService.GetConfig()
		if err != nil {
			loggerService.LogError("Error loading config, will show setup wizard", err)
			app.isFirstRun = true
			isFirstRun = true
		} else {
			loggerService.LogInfo("Initializing database with config.json settings")
			if err := database.InitializeWithConfig(cfg); err != nil {
				loggerService.LogError("Failed to initialize database with config", err)
				app.isFirstRun = true
				isFirstRun = true
			}
		}

		if !isFirstRun {
			loggerService.LogInfo("Reinitializing services with database connection")
			app.ProductService = services.NewProductService()
			app.IngredientService = services.NewIngredientService()
			app.CustomPageService = services.NewCustomPageService()
			app.OrderService = services.NewOrderService()
			app.OrderTypeService = services.NewOrderTypeService()
			app.SalesService = services.NewSalesService()
			app.DIANService = services.NewDIANService()
			app.EmployeeService = services.NewEmployeeService()
			app.ReportsService = services.NewReportsService()
			app.PrinterService = services.NewPrinterService()
			app.ConfigService = services.NewConfigService()
			app.ParametricService = services.NewParametricService()
			app.DashboardService = services.NewDashboardService()

			// Initialize Google Sheets services
			app.GoogleSheetsService = services.NewGoogleSheetsService(database.GetDB())
			app.ReportSchedulerService = services.NewReportSchedulerService(database.GetDB(), app.GoogleSheetsService)
			app.InvoiceLimitService = services.NewInvoiceLimitService(database.GetDB())

			// Initialize Rappi service
			app.RappiConfigService = services.NewRappiConfigService()
			app.RappiWebhookServer = services.NewRappiWebhookServer(app.RappiConfigService, app.OrderService, app.ProductService)

			// Start Rappi webhook server
			loggerService.LogInfo("Starting Rappi webhook server")
			go func() {
				defer loggerService.RecoverPanic()
				if err := app.RappiWebhookServer.Start(); err != nil {
					loggerService.LogWarning("Rappi webhook server start error", err.Error())
				}
			}()

			// Start Config API server for external configuration management
			configAPIPort := os.Getenv("CONFIG_API_PORT")
			if configAPIPort == "" {
				configAPIPort = "8082" // Default port
			}
			app.ConfigAPIServer = services.NewConfigAPIServer(":"+configAPIPort, app.InvoiceLimitService, loggerService)
			loggerService.LogInfo("Starting Config API server", "Port: "+configAPIPort)
			go func() {
				defer loggerService.RecoverPanic()
				if err := app.ConfigAPIServer.Start(); err != nil {
					loggerService.LogWarning("Config API server start error", err.Error())
				}
			}()

			// Start Auth API server for external authentication
			authAPIPort := os.Getenv("AUTH_API_PORT")
			if authAPIPort == "" {
				authAPIPort = "8083" // Default port
			}
			app.AuthAPIServer = services.NewAuthAPIServer(":"+authAPIPort, app.EmployeeService, loggerService)
			loggerService.LogInfo("Starting Auth API server", "Port: "+authAPIPort)
			go func() {
				defer loggerService.RecoverPanic()
				if err := app.AuthAPIServer.Start(); err != nil {
					loggerService.LogWarning("Auth API server start error", err.Error())
				}
			}()

			// Initialize MCP service
			app.MCPService = services.NewMCPService(
				app.ProductService,
				app.SalesService,
				app.OrderService,
				app.IngredientService,
				app.DashboardService,
				app.ReportsService,
			)
			loggerService.LogInfo("MCP Service initialized")
			// Auto-start MCP server if enabled
			go func() {
				defer loggerService.RecoverPanic()
				app.MCPService.AutoStart()
			}()

			loggerService.LogInfo("Initializing default system configurations")
			app.ConfigService.InitializeDefaultSystemConfigs()

			// Start invoice limit periodic sync
			app.InvoiceLimitService.StartPeriodicSync()
		}
	}

	if isFirstRun {
		loggerService.LogInfo("First run detected - setup wizard will be shown")
	}

	bindList := []interface{}{
		app,
		app.LoggerService,
		app.ConfigManagerService,
		app.UpdateService,
		app.ProductService,
		app.IngredientService,
		app.CustomPageService,
		app.OrderService,
		app.OrderTypeService,
		app.SalesService,
		app.DIANService,
		app.EmployeeService,
		app.ReportsService,
		app.PrinterService,
		app.ConfigService,
		app.ParametricService,
		app.DashboardService,
		app.GoogleSheetsService,
		app.ReportSchedulerService,
		app.RappiConfigService,
		app.InvoiceLimitService,
		app.WSManagementService,
		app.MCPService,
	}

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
		Menu: nil,
	})

	if err != nil {
		loggerService.LogError("Wails application error", err)
		println("Error:", err.Error())
	}
}
