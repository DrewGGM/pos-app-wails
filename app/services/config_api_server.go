package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// ConfigAPIServer handles external REST API requests for system configuration
type ConfigAPIServer struct {
	server              *http.Server
	port                string
	invoiceLimitService *InvoiceLimitService
	loggerService       *LoggerService
}

// InvoiceLimitConfigRequest represents the request body for updating invoice limits
type InvoiceLimitConfigRequest struct {
	Enabled      *bool              `json:"enabled,omitempty"`
	SyncInterval *int               `json:"sync_interval,omitempty"`
	DayLimits    map[string]float64 `json:"day_limits,omitempty"`
}

// APIResponse represents a standard API response
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// NewConfigAPIServer creates a new config API server
func NewConfigAPIServer(port string, invoiceLimitService *InvoiceLimitService, loggerService *LoggerService) *ConfigAPIServer {
	return &ConfigAPIServer{
		port:                port,
		invoiceLimitService: invoiceLimitService,
		loggerService:       loggerService,
	}
}

// Start starts the config API server
func (s *ConfigAPIServer) Start() error {
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", s.handleHealth)

	// API info
	mux.HandleFunc("/", s.handleInfo)

	// Invoice limit configuration endpoints
	mux.HandleFunc("/api/v1/config/invoice-limits", s.handleInvoiceLimits)
	mux.HandleFunc("/api/v1/config/invoice-limits/status", s.handleInvoiceLimitsStatus)
	mux.HandleFunc("/api/v1/config/invoice-limits/sync", s.handleInvoiceLimitsSync)

	s.server = &http.Server{
		Addr:         s.port,
		Handler:      s.corsMiddleware(s.loggingMiddleware(mux)),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("[CONFIG API] Server starting on port %s", s.port)
	log.Printf("[CONFIG API] Endpoints available:")
	log.Printf("[CONFIG API]   GET    /health")
	log.Printf("[CONFIG API]   GET    /api/v1/config/invoice-limits")
	log.Printf("[CONFIG API]   PUT    /api/v1/config/invoice-limits")
	log.Printf("[CONFIG API]   GET    /api/v1/config/invoice-limits/status")
	log.Printf("[CONFIG API]   POST   /api/v1/config/invoice-limits/sync")

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("config API server error: %w", err)
	}

	return nil
}

// Stop stops the config API server
func (s *ConfigAPIServer) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		log.Printf("[CONFIG API] Server stopping...")
		return s.server.Shutdown(ctx)
	}
	return nil
}

// Middleware for CORS
func (s *ConfigAPIServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Middleware for logging
func (s *ConfigAPIServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[CONFIG API] %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[CONFIG API] %s %s completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// Helper to send JSON response
func (s *ConfigAPIServer) sendJSON(w http.ResponseWriter, status int, response APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(response)
}

// handleHealth returns server health status
func (s *ConfigAPIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Config API server is running",
		Data: map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
		},
	})
}

// handleInfo returns API information
func (s *ConfigAPIServer) handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "POS System Configuration API",
		Data: map[string]interface{}{
			"version": "1.0.0",
			"endpoints": map[string]string{
				"GET /health":                          "Health check",
				"GET /api/v1/config/invoice-limits":    "Get invoice limit configuration",
				"PUT /api/v1/config/invoice-limits":    "Update invoice limit configuration",
				"GET /api/v1/config/invoice-limits/status": "Get current invoice limit status",
				"POST /api/v1/config/invoice-limits/sync":  "Force sync with Google Sheets",
			},
		},
	})
}

// handleInvoiceLimits handles GET and PUT for invoice limit configuration
func (s *ConfigAPIServer) handleInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.getInvoiceLimits(w, r)
	case http.MethodPut:
		s.updateInvoiceLimits(w, r)
	default:
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET or PUT.",
		})
	}
}

// getInvoiceLimits returns current invoice limit configuration
func (s *ConfigAPIServer) getInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	config := s.invoiceLimitService.GetConfig()
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    config,
	})
}

// updateInvoiceLimits updates invoice limit configuration
func (s *ConfigAPIServer) updateInvoiceLimits(w http.ResponseWriter, r *http.Request) {
	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	// Parse request body
	var req InvoiceLimitConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Invalid request body: %v", err),
		})
		return
	}

	// Get current config
	currentConfig := s.invoiceLimitService.GetConfig()

	// Apply updates (partial update support)
	if req.Enabled != nil {
		currentConfig.Enabled = *req.Enabled
	}
	if req.SyncInterval != nil && *req.SyncInterval > 0 {
		currentConfig.SyncInterval = *req.SyncInterval
	}
	if req.DayLimits != nil {
		// Merge day limits
		for day, limit := range req.DayLimits {
			currentConfig.DayLimits[day] = limit
		}
	}

	// Save to Google Sheets
	if err := s.invoiceLimitService.SaveConfig(currentConfig); err != nil {
		log.Printf("[CONFIG API] Error saving invoice limits: %v", err)
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to save configuration: %v", err),
		})
		return
	}

	log.Printf("[CONFIG API] Invoice limits updated successfully: enabled=%v, limits=%v",
		currentConfig.Enabled, currentConfig.DayLimits)

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Invoice limit configuration updated and synced to Google Sheets",
		Data:    currentConfig,
	})
}

// handleInvoiceLimitsStatus returns current status (available, remaining, etc.)
func (s *ConfigAPIServer) handleInvoiceLimitsStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use GET.",
		})
		return
	}

	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	status, err := s.invoiceLimitService.GetStatus()
	if err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to get status: %v", err),
		})
		return
	}

	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data:    status,
	})
}

// handleInvoiceLimitsSync forces a sync with Google Sheets
func (s *ConfigAPIServer) handleInvoiceLimitsSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.invoiceLimitService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, APIResponse{
			Success: false,
			Error:   "Invoice limit service not available",
		})
		return
	}

	if err := s.invoiceLimitService.SyncConfig(); err != nil {
		s.sendJSON(w, http.StatusInternalServerError, APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Sync failed: %v", err),
		})
		return
	}

	config := s.invoiceLimitService.GetConfig()
	s.sendJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Message: "Configuration synced from Google Sheets",
		Data:    config,
	})
}
