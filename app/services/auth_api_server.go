package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// AuthAPIServer handles external REST API requests for authentication
type AuthAPIServer struct {
	server          *http.Server
	port            string
	employeeService *EmployeeService
	loggerService   *LoggerService
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginByPINRequest represents the PIN login request body
type LoginByPINRequest struct {
	PIN string `json:"pin"`
}

// AuthResponse represents the authentication response
type AuthResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// AuthUserData represents the user data returned on successful authentication
type AuthUserData struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Token    string `json:"token"`
}

// NewAuthAPIServer creates a new auth API server
func NewAuthAPIServer(port string, employeeService *EmployeeService, loggerService *LoggerService) *AuthAPIServer {
	return &AuthAPIServer{
		port:            port,
		employeeService: employeeService,
		loggerService:   loggerService,
	}
}

// Start starts the auth API server
func (s *AuthAPIServer) Start() error {
	// Check for environment variable override
	if envPort := os.Getenv("AUTH_API_PORT"); envPort != "" {
		s.port = ":" + envPort
	}

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", s.handleHealth)

	// API info
	mux.HandleFunc("/", s.handleInfo)

	// Authentication endpoints
	mux.HandleFunc("/api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("/api/v1/auth/login-pin", s.handleLoginByPIN)
	mux.HandleFunc("/api/v1/auth/validate", s.handleValidateToken)

	s.server = &http.Server{
		Addr:         s.port,
		Handler:      s.corsMiddleware(s.loggingMiddleware(mux)),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("[AUTH API] Server starting on port %s", s.port)
	log.Printf("[AUTH API] Endpoints available:")
	log.Printf("[AUTH API]   GET    /health")
	log.Printf("[AUTH API]   POST   /api/v1/auth/login")
	log.Printf("[AUTH API]   POST   /api/v1/auth/login-pin")
	log.Printf("[AUTH API]   POST   /api/v1/auth/validate")

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("auth API server error: %w", err)
	}

	return nil
}

// Stop stops the auth API server
func (s *AuthAPIServer) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		log.Printf("[AUTH API] Server stopping...")
		return s.server.Shutdown(ctx)
	}
	return nil
}

// Middleware for CORS
func (s *AuthAPIServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Middleware for logging
func (s *AuthAPIServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[AUTH API] %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[AUTH API] %s %s completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// Helper to send JSON response
func (s *AuthAPIServer) sendJSON(w http.ResponseWriter, status int, response AuthResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(response)
}

// generateToken creates a simple token for the session
func (s *AuthAPIServer) generateToken(employeeID uint) string {
	return fmt.Sprintf("%d:%d", employeeID, time.Now().UnixNano())
}

// handleHealth returns server health status
func (s *AuthAPIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.sendJSON(w, http.StatusOK, AuthResponse{
		Success: true,
		Message: "Auth API server is running",
		Data: map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
		},
	})
}

// handleInfo returns API information
func (s *AuthAPIServer) handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	s.sendJSON(w, http.StatusOK, AuthResponse{
		Success: true,
		Message: "POS System Authentication API",
		Data: map[string]interface{}{
			"version": "1.0.0",
			"endpoints": map[string]string{
				"GET /health":              "Health check",
				"POST /api/v1/auth/login":     "Login with username and password",
				"POST /api/v1/auth/login-pin": "Login with PIN",
				"POST /api/v1/auth/validate":  "Validate authentication token",
			},
		},
	})
}

// handleLogin handles username/password login
func (s *AuthAPIServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, AuthResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.employeeService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, AuthResponse{
			Success: false,
			Error:   "Employee service not available",
		})
		return
	}

	// Parse request body
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, AuthResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	// Validate required fields
	if req.Username == "" || req.Password == "" {
		s.sendJSON(w, http.StatusBadRequest, AuthResponse{
			Success: false,
			Error:   "Username and password are required",
		})
		return
	}

	// Authenticate
	employee, err := s.employeeService.AuthenticateEmployee(req.Username, req.Password)
	if err != nil {
		log.Printf("[AUTH API] Failed login attempt for user: %s", req.Username)
		s.sendJSON(w, http.StatusUnauthorized, AuthResponse{
			Success: false,
			Error:   "Invalid credentials",
		})
		return
	}

	// Generate token
	token := s.generateToken(employee.ID)

	log.Printf("[AUTH API] Successful login for user: %s (ID: %d, Role: %s)", employee.Username, employee.ID, employee.Role)

	s.sendJSON(w, http.StatusOK, AuthResponse{
		Success: true,
		Message: "Login successful",
		Data: AuthUserData{
			ID:       employee.ID,
			Name:     employee.Name,
			Username: employee.Username,
			Role:     employee.Role,
			Email:    employee.Email,
			Phone:    employee.Phone,
			Token:    token,
		},
	})
}

// handleLoginByPIN handles PIN-based login
func (s *AuthAPIServer) handleLoginByPIN(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, AuthResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	if s.employeeService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, AuthResponse{
			Success: false,
			Error:   "Employee service not available",
		})
		return
	}

	// Parse request body
	var req LoginByPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSON(w, http.StatusBadRequest, AuthResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	// Validate required fields
	if req.PIN == "" {
		s.sendJSON(w, http.StatusBadRequest, AuthResponse{
			Success: false,
			Error:   "PIN is required",
		})
		return
	}

	// Authenticate by PIN
	employee, err := s.employeeService.AuthenticateEmployeeByPIN(req.PIN)
	if err != nil {
		log.Printf("[AUTH API] Failed PIN login attempt")
		s.sendJSON(w, http.StatusUnauthorized, AuthResponse{
			Success: false,
			Error:   "Invalid PIN",
		})
		return
	}

	// Generate token
	token := s.generateToken(employee.ID)

	log.Printf("[AUTH API] Successful PIN login for user: %s (ID: %d, Role: %s)", employee.Username, employee.ID, employee.Role)

	s.sendJSON(w, http.StatusOK, AuthResponse{
		Success: true,
		Message: "Login successful",
		Data: AuthUserData{
			ID:       employee.ID,
			Name:     employee.Name,
			Username: employee.Username,
			Role:     employee.Role,
			Email:    employee.Email,
			Phone:    employee.Phone,
			Token:    token,
		},
	})
}

// handleValidateToken validates an authentication token
func (s *AuthAPIServer) handleValidateToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendJSON(w, http.StatusMethodNotAllowed, AuthResponse{
			Success: false,
			Error:   "Method not allowed. Use POST.",
		})
		return
	}

	// Get token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		s.sendJSON(w, http.StatusUnauthorized, AuthResponse{
			Success: false,
			Error:   "Authorization header required",
		})
		return
	}

	// For now, just validate the token format (employeeID:timestamp)
	// In a production system, you would validate against stored sessions
	var employeeID uint
	var timestamp int64
	_, err := fmt.Sscanf(authHeader, "Bearer %d:%d", &employeeID, &timestamp)
	if err != nil {
		s.sendJSON(w, http.StatusUnauthorized, AuthResponse{
			Success: false,
			Error:   "Invalid token format",
		})
		return
	}

	// Get employee to verify they still exist and are active
	if s.employeeService == nil {
		s.sendJSON(w, http.StatusServiceUnavailable, AuthResponse{
			Success: false,
			Error:   "Employee service not available",
		})
		return
	}

	employee, err := s.employeeService.GetEmployeeByID(employeeID)
	if err != nil || !employee.IsActive {
		s.sendJSON(w, http.StatusUnauthorized, AuthResponse{
			Success: false,
			Error:   "Token invalid or user deactivated",
		})
		return
	}

	s.sendJSON(w, http.StatusOK, AuthResponse{
		Success: true,
		Message: "Token is valid",
		Data: AuthUserData{
			ID:       employee.ID,
			Name:     employee.Name,
			Username: employee.Username,
			Role:     employee.Role,
			Email:    employee.Email,
			Phone:    employee.Phone,
		},
	})
}
