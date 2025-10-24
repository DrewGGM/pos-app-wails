package main

import (
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
	ProductService     *services.ProductService
	OrderService       *services.OrderService
	SalesService       *services.SalesService
	DIANService        *services.DIANService
	EmployeeService    *services.EmployeeService
	ReportsService     *services.ReportsService
	PrinterService     *services.PrinterService
	ConfigService      *services.ConfigService
	ParametricService  *services.ParametricService
	WSServer           *websocket.Server
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

func main() {
	// Load environment variables from .env file in project root
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("Warning: .env file not found, using system environment variables")
	}

	// Initialize database first
	if err := database.Initialize(); err != nil {
		fmt.Printf("Error initializing database: %v\n", err)
		return
	}

	// Create an instance of the app structure
	app := NewApp()

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

	// Create application with options
	err := wails.Run(&options.App{
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
		Bind: []interface{}{
			app,
			app.ProductService,
			app.OrderService,
			app.SalesService,
			app.DIANService,
			app.EmployeeService,
			app.ReportsService,
			app.PrinterService,
			app.ConfigService,
			app.ParametricService,
		},
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
