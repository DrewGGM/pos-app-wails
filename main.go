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
	ComboService            *services.ComboService
	UpdateService           *services.UpdateService
	GoogleSheetsService     *services.GoogleSheetsService
	ReportSchedulerService  *services.ReportSchedulerService
	RappiConfigService      *services.RappiConfigService
	RappiWebhookServer      *services.RappiWebhookServer
	InvoiceLimitService     *services.InvoiceLimitService
	ConfigAPIServer         *services.ConfigAPIServer
	MCPService              *services.MCPService
	BoldService             *services.BoldService
	BoldWebhookService      *services.BoldWebhookService
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

	runtime.WindowMaximise(a.ctx)

	if !a.isFirstRun {
		wsPort := os.Getenv("WS_PORT")
		if wsPort == "" {
			wsPort = "8080"
		}
		a.LoggerService.LogInfo("Initializing WebSocket server", "Port: "+wsPort)
		a.WSServer = websocket.NewServer(":" + wsPort)
		a.WSServer.SetDB(database.GetDB())
		if a.WSManagementService != nil {
			a.WSManagementService.SetServer(a.WSServer)
		}
		if a.OrderService != nil {
			a.OrderService.SetWebSocketServer(a.WSServer)
			a.WSServer.SetOrderService(a.OrderService)
			a.LoggerService.LogInfo("OrderService configured for WebSocket REST API")
		}
		if a.PrinterService != nil {
			a.WSServer.SetPrinterService(a.PrinterService)
			a.LoggerService.LogInfo("PrinterService configured for WebSocket print requests")
		}
		if a.BoldWebhookService != nil {
			a.BoldWebhookService.SetWebSocketServer(a.WSServer)
			a.LoggerService.LogInfo("WebSocket server configured for Bold webhook notifications")
		}
		go func() {
			defer a.LoggerService.RecoverPanic()
			if err := a.WSServer.Start(); err != nil {
				a.LoggerService.LogError("WebSocket server error", err)
			}
		}()

		a.LoggerService.LogInfo("Starting DIAN validation worker")
		go func() {
			defer a.LoggerService.RecoverPanic()
			services.StartValidationWorker()
		}()

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

func (a *App) domReady(ctx context.Context) {
}

// beforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	a.LoggerService.LogInfo("Application closing")

	if a.GoogleSheetsService != nil && !a.isFirstRun {
		a.LoggerService.LogInfo("Sending final report to Google Sheets")
		if err := a.GoogleSheetsService.SyncNow(); err != nil {
			a.LoggerService.LogWarning("Failed to send final report to Google Sheets", err.Error())
		} else {
			a.LoggerService.LogInfo("Final report sent to Google Sheets successfully")
		}
	}

	if a.ReportSchedulerService != nil {
		a.LoggerService.LogInfo("Stopping report scheduler")
		a.ReportSchedulerService.Stop()
	}

	if a.InvoiceLimitService != nil {
		a.LoggerService.LogInfo("Stopping invoice limit sync")
		a.InvoiceLimitService.StopPeriodicSync()
	}

	if a.RappiWebhookServer != nil {
		a.LoggerService.LogInfo("Stopping Rappi webhook server")
		a.RappiWebhookServer.Stop()
	}

	if a.ConfigAPIServer != nil {
		a.LoggerService.LogInfo("Stopping Config API server")
		a.ConfigAPIServer.Stop()
	}

	if a.MCPService != nil {
		a.LoggerService.LogInfo("Stopping MCP server")
		a.MCPService.Stop()
	}

	if a.WSServer != nil {
		a.LoggerService.LogInfo("Stopping WebSocket server")
		a.WSServer.Stop()
	}

	if err := database.Close(); err != nil {
		a.LoggerService.LogError("Error closing database", err)
	} else {
		a.LoggerService.LogInfo("Database connection closed successfully")
	}

	a.LoggerService.LogInfo("Application shutdown complete")
	return false
}

func (a *App) shutdown(ctx context.Context) {
}

func (a *App) InitializeServicesAfterSetup() error {
	a.ProductService = services.NewProductService()
	a.IngredientService = services.NewIngredientService()
	a.CustomPageService = services.NewCustomPageService()
	a.ComboService = services.NewComboService()
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
	a.BoldService = services.NewBoldService(database.GetDB())

	a.BoldWebhookService = services.NewBoldWebhookService(database.GetDB(), a.BoldService)

	if a.WSServer != nil {
		a.BoldWebhookService.SetWebSocketServer(a.WSServer)
		a.LoggerService.LogInfo("WebSocket server configured for Bold notifications")
	}

	a.LoggerService.LogInfo("Starting Bold webhook server")
	go func() {
		defer a.LoggerService.RecoverPanic()
		boldConfig, err := a.BoldService.GetBoldConfig()
		if err == nil && boldConfig.Enabled && boldConfig.WebhookPort > 0 {
			if err := a.BoldWebhookService.StartWebhookServer(boldConfig.WebhookPort); err != nil {
				a.LoggerService.LogWarning("Bold webhook server start error", err.Error())
			}
		} else {
			a.LoggerService.LogInfo("Bold webhook server not started - integration disabled or port not configured")
		}
	}()

	a.GoogleSheetsService = services.NewGoogleSheetsService(database.GetDB())
	a.ReportSchedulerService = services.NewReportSchedulerService(database.GetDB(), a.GoogleSheetsService)
	a.InvoiceLimitService = services.NewInvoiceLimitService(database.GetDB())

	a.RappiConfigService = services.NewRappiConfigService()
	a.RappiWebhookServer = services.NewRappiWebhookServer(a.RappiConfigService, a.OrderService, a.ProductService)

	a.LoggerService.LogInfo("Starting Rappi webhook server")
	go func() {
		defer a.LoggerService.RecoverPanic()
		if err := a.RappiWebhookServer.Start(); err != nil {
			a.LoggerService.LogWarning("Rappi webhook server start error", err.Error())
		}
	}()

	configAPIPort := os.Getenv("CONFIG_API_PORT")
	if configAPIPort == "" {
		configAPIPort = "8082"
	}
	a.ConfigAPIServer = services.NewConfigAPIServer(
		":"+configAPIPort,
		a.InvoiceLimitService,
		a.EmployeeService,
		a.OrderService,
		a.OrderTypeService,
		a.ProductService,
		a.LoggerService,
		a.SalesService,
		a.ConfigService,
	)
	a.LoggerService.LogInfo("Starting Config API server", "Port: "+configAPIPort)
	go func() {
		defer a.LoggerService.RecoverPanic()
		if err := a.ConfigAPIServer.Start(); err != nil {
			a.LoggerService.LogWarning("Config API server start error", err.Error())
		}
	}()

	a.MCPService = services.NewMCPService(
		a.ProductService,
		a.SalesService,
		a.OrderService,
		a.IngredientService,
		a.DashboardService,
		a.ReportsService,
	)
	a.LoggerService.LogInfo("MCP Service initialized")
	go func() {
		defer a.LoggerService.RecoverPanic()
		a.MCPService.AutoStart()
	}()

	if err := a.ConfigService.InitializeDefaultSystemConfigs(); err != nil {
		return fmt.Errorf("failed to initialize system configs: %w", err)
	}

	if err := a.ConfigManagerService.CompleteSetup(); err != nil {
		return fmt.Errorf("failed to complete setup: %w", err)
	}

	a.isFirstRun = false
	return nil
}

func (a *App) ConnectDatabaseWithConfig(cfg *config.AppConfig) error {
	if err := database.InitializeWithConfig(cfg); err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}

	if err := a.InitializeServicesAfterSetup(); err != nil {
		return err
	}

	wsPort := os.Getenv("WS_PORT")
	if wsPort == "" {
		wsPort = "8080"
	}
	a.LoggerService.LogInfo("Starting WebSocket server", "Port: "+wsPort)
	a.WSServer = websocket.NewServer(":" + wsPort)
	a.WSServer.SetDB(database.GetDB())

	if a.WSManagementService != nil {
		a.WSManagementService.SetServer(a.WSServer)
	}

	if a.OrderService != nil {
		a.OrderService.SetWebSocketServer(a.WSServer)
		a.WSServer.SetOrderService(a.OrderService)
	}

	if a.PrinterService != nil {
		a.WSServer.SetPrinterService(a.PrinterService)
		a.LoggerService.LogInfo("PrinterService configured for WebSocket print requests")
	}

	if a.BoldWebhookService != nil {
		a.BoldWebhookService.SetWebSocketServer(a.WSServer)
		a.LoggerService.LogInfo("WebSocket server configured for Bold webhook notifications")
	}

	go func() {
		defer a.LoggerService.RecoverPanic()
		a.WSServer.Start()
	}()

	go services.StartValidationWorker()

	return nil
}

func main() {
	loggerService := services.NewLoggerService()
	if loggerService == nil {
		fmt.Println("CRITICAL: Logger service failed to initialize")
		os.Exit(1)
	}
	defer loggerService.Close()

	defer func() {
		if r := recover(); r != nil {
			loggerService.LogPanic(r)
			os.Exit(1)
		}
	}()

	loggerService.LogInfo("Application starting", "Restaurant POS System")

	if err := godotenv.Load(".env"); err != nil {
		loggerService.LogWarning(".env file not found, will use config.json if available")
	}

	app := NewApp()
	app.LoggerService = loggerService

	app.ConfigManagerService = services.NewConfigManagerService()
	app.UpdateService = services.NewUpdateService()

	isFirstRun, err := app.ConfigManagerService.IsFirstRun()
	if err != nil {
		loggerService.LogWarning("Could not check first run status", err.Error())
		isFirstRun = true
	}

	app.isFirstRun = isFirstRun

	loggerService.LogInfo("Initializing services")
	app.ProductService = services.NewProductService()
	app.IngredientService = services.NewIngredientService()
	app.CustomPageService = services.NewCustomPageService()
	app.ComboService = services.NewComboService()
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
	app.BoldService = services.NewBoldService(nil)
	app.WSManagementService = services.NewWebSocketManagementService(nil)
	app.GoogleSheetsService = services.NewGoogleSheetsService(nil)
	app.ReportSchedulerService = services.NewReportSchedulerService(nil, app.GoogleSheetsService)
	app.RappiConfigService = services.NewRappiConfigService()
	app.InvoiceLimitService = services.NewInvoiceLimitService(nil)
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
			app.ComboService = services.NewComboService()
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
			app.BoldService = services.NewBoldService(database.GetDB())

			app.BoldWebhookService = services.NewBoldWebhookService(database.GetDB(), app.BoldService)

			loggerService.LogInfo("Starting Bold webhook server")
			go func() {
				defer loggerService.RecoverPanic()
				boldConfig, err := app.BoldService.GetBoldConfig()
				if err == nil && boldConfig.Enabled && boldConfig.WebhookPort > 0 {
					if err := app.BoldWebhookService.StartWebhookServer(boldConfig.WebhookPort); err != nil {
						loggerService.LogWarning("Bold webhook server start error", err.Error())
					}
				} else {
					loggerService.LogInfo("Bold webhook server not started - integration disabled or port not configured")
				}
			}()

			app.GoogleSheetsService = services.NewGoogleSheetsService(database.GetDB())
			app.ReportSchedulerService = services.NewReportSchedulerService(database.GetDB(), app.GoogleSheetsService)
			app.InvoiceLimitService = services.NewInvoiceLimitService(database.GetDB())

			app.RappiConfigService = services.NewRappiConfigService()
			app.RappiWebhookServer = services.NewRappiWebhookServer(app.RappiConfigService, app.OrderService, app.ProductService)

			loggerService.LogInfo("Starting Rappi webhook server")
			go func() {
				defer loggerService.RecoverPanic()
				if err := app.RappiWebhookServer.Start(); err != nil {
					loggerService.LogWarning("Rappi webhook server start error", err.Error())
				}
			}()

			configAPIPort := os.Getenv("CONFIG_API_PORT")
			if configAPIPort == "" {
				configAPIPort = "8082"
			}
			app.ConfigAPIServer = services.NewConfigAPIServer(
				":"+configAPIPort,
				app.InvoiceLimitService,
				app.EmployeeService,
				app.OrderService,
				app.OrderTypeService,
				app.ProductService,
				loggerService,
				app.SalesService,
				app.ConfigService,
			)
			loggerService.LogInfo("Starting Config API server", "Port: "+configAPIPort)
			go func() {
				defer loggerService.RecoverPanic()
				if err := app.ConfigAPIServer.Start(); err != nil {
					loggerService.LogWarning("Config API server start error", err.Error())
				}
			}()

			app.MCPService = services.NewMCPService(
				app.ProductService,
				app.SalesService,
				app.OrderService,
				app.IngredientService,
				app.DashboardService,
				app.ReportsService,
			)
			loggerService.LogInfo("MCP Service initialized")
			go func() {
				defer loggerService.RecoverPanic()
				app.MCPService.AutoStart()
			}()

			loggerService.LogInfo("Initializing default system configurations")
			app.ConfigService.InitializeDefaultSystemConfigs()

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
		app.ComboService,
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
		app.BoldService,
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
