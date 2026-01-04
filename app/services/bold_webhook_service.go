package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"PosApp/app/models"

	"gorm.io/gorm"
)

type BoldWebhookService struct {
	db          *gorm.DB
	boldService *BoldService
	wsServer    WebSocketServer // Interface for WebSocket notifications
}

// WebSocketServer interface for sending notifications
type WebSocketServer interface {
	BroadcastJSON(event string, data interface{})
}

func NewBoldWebhookService(db *gorm.DB, boldService *BoldService) *BoldWebhookService {
	return &BoldWebhookService{
		db:          db,
		boldService: boldService,
		wsServer:    nil, // Will be set later
	}
}

// SetWebSocketServer sets the WebSocket server for real-time notifications
func (s *BoldWebhookService) SetWebSocketServer(wsServer WebSocketServer) {
	s.wsServer = wsServer
}

// StartWebhookServer starts the HTTP server for receiving webhook notifications
func (s *BoldWebhookService) StartWebhookServer(port int) error {
	mux := http.NewServeMux()

	// Webhook endpoint
	mux.HandleFunc("/webhook/bold", s.handleWebhook)

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Test endpoint
	mux.HandleFunc("/webhook/test", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("🧪 Test endpoint called: Method=%s, RemoteAddr=%s", r.Method, r.RemoteAddr)
		w.WriteHeader(http.StatusOK)
		response := map[string]string{
			"status":  "ok",
			"message": "Bold webhook server is running",
			"port":    fmt.Sprintf("%d", port),
		}
		json.NewEncoder(w).Encode(response)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("🌐 Bold webhook server starting on port %d", port)
	log.Printf("📡 Webhook endpoint: http://localhost:%d/webhook/bold", port)

	// Start server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("❌ Webhook server error: %v", err)
		}
	}()

	return nil
}

// handleWebhook processes incoming webhook notifications from Bold
func (s *BoldWebhookService) handleWebhook(w http.ResponseWriter, r *http.Request) {
	log.Printf("🔔 Webhook request received: Method=%s, URL=%s, RemoteAddr=%s", r.Method, r.URL.Path, r.RemoteAddr)

	// Create webhook log entry to track ALL attempts
	webhookLog := &models.BoldWebhookLog{
		Method:      r.Method,
		RemoteAddr:  r.RemoteAddr,
		ContentType: r.Header.Get("Content-Type"),
		Signature:   r.Header.Get("x-bold-signature"),
	}

	// Log all headers as JSON
	headersMap := make(map[string]string)
	for key, values := range r.Header {
		if len(values) > 0 {
			headersMap[key] = values[0]
		}
	}
	headersJSON, _ := json.Marshal(headersMap)
	webhookLog.Headers = string(headersJSON)

	log.Printf("📋 All headers: %s", webhookLog.Headers)

	// Only accept POST requests
	if r.Method != http.MethodPost {
		log.Printf("❌ Method not allowed: %s", r.Method)
		webhookLog.ProcessStatus = "failed_method"
		webhookLog.ErrorMessage = fmt.Sprintf("Method not allowed: %s", r.Method)
		s.db.Create(webhookLog)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("❌ Error reading webhook body: %v", err)
		webhookLog.ProcessStatus = "failed_read"
		webhookLog.ErrorMessage = fmt.Sprintf("Error reading body: %v", err)
		s.db.Create(webhookLog)
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Store raw body in log
	webhookLog.RawBody = string(body)

	log.Printf("📦 Webhook body received (%d bytes)", len(body))
	log.Printf("📄 Webhook body: %s", string(body))

	// Get signature from header
	signature := r.Header.Get("x-bold-signature")
	log.Printf("🔑 Signature from header: %s", signature)

	// Verify signature
	config, err := s.boldService.GetBoldConfig()
	if err != nil {
		log.Printf("❌ Error getting Bold config: %v", err)
		webhookLog.ProcessStatus = "failed_config"
		webhookLog.ErrorMessage = fmt.Sprintf("Error getting Bold config: %v", err)
		s.db.Create(webhookLog)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("🌍 Bold environment: %s", config.Environment)

	// Get the appropriate secret key based on environment
	secretKey := ""
	if config.Environment == "production" {
		secretKey = config.WebhookSecret
		log.Printf("🔐 Using production secret for signature verification")
	} else {
		// Use sandbox secret for test environment
		secretKey = config.WebhookSecretSandbox
		if secretKey != "" {
			log.Printf("🧪 Using sandbox secret for signature verification")
		} else {
			log.Printf("🧪 Test environment - no sandbox secret configured, signature verification will be lenient")
		}
	}

	// Only verify signature if we have both signature and secret key
	// In test environment, signature verification is optional
	if signature != "" && secretKey != "" {
		if !s.verifySignature(body, signature, secretKey) {
			log.Printf("❌ Invalid webhook signature - Expected vs Received mismatch")
			webhookLog.ProcessStatus = "failed_signature"
			webhookLog.ErrorMessage = "Invalid signature"
			s.db.Create(webhookLog)
			http.Error(w, "Invalid signature", http.StatusUnauthorized)
			return
		}
		log.Printf("✅ Signature verified successfully")
	} else if config.Environment == "production" && signature == "" {
		log.Printf("⚠️  Production environment but no signature received - rejecting")
		webhookLog.ProcessStatus = "failed_signature"
		webhookLog.ErrorMessage = "Missing signature in production"
		s.db.Create(webhookLog)
		http.Error(w, "Missing signature", http.StatusUnauthorized)
		return
	} else {
		log.Printf("⚠️  Skipping signature verification (test environment or no signature/secret configured)")
	}

	// Parse webhook notification
	var notification models.BoldWebhookNotification
	if err := json.Unmarshal(body, &notification); err != nil {
		log.Printf("❌ Error parsing webhook notification: %v", err)
		log.Printf("   Raw body was: %s", string(body))
		webhookLog.ProcessStatus = "failed_parse"
		webhookLog.ErrorMessage = fmt.Sprintf("Error parsing JSON: %v", err)
		s.db.Create(webhookLog)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Log notification
	log.Printf("📨 Bold webhook received: Type=%s, PaymentID=%s, Subject=%s",
		notification.Type, notification.Data.PaymentID, notification.Subject)

	// Process webhook based on type
	if err := s.processWebhook(&notification); err != nil {
		log.Printf("❌ Error processing webhook: %v", err)
		webhookLog.ProcessStatus = "failed_processing"
		webhookLog.ErrorMessage = fmt.Sprintf("Error processing: %v", err)
		webhookLog.MatchedPayment = false
		s.db.Create(webhookLog)
		// Still return 200 to prevent Bold from retrying
		w.WriteHeader(http.StatusOK)
		return
	}

	// Success! Save log entry
	webhookLog.ProcessStatus = "success"
	webhookLog.MatchedPayment = true
	s.db.Create(webhookLog)

	log.Printf("✅ Webhook processed successfully and logged")

	// Respond with 200 OK
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// verifySignature verifies the webhook signature using HMAC-SHA256
func (s *BoldWebhookService) verifySignature(body []byte, signature string, secretKey string) bool {
	// Convert body to base64
	encoded := base64.StdEncoding.EncodeToString(body)

	// Create HMAC-SHA256 hash
	h := hmac.New(sha256.New, []byte(secretKey))
	h.Write([]byte(encoded))
	expectedSignature := hex.EncodeToString(h.Sum(nil))

	// Compare signatures
	return hmac.Equal([]byte(expectedSignature), []byte(signature))
}

// processWebhook processes the webhook notification and updates payment status
func (s *BoldWebhookService) processWebhook(notification *models.BoldWebhookNotification) error {
	// Find pending payment by reference (integration_id is in metadata.reference)
	var pendingPayment models.BoldPendingPayment

	// Try to find by integration_id first (should be in subject or metadata.reference)
	integrationID := notification.Subject
	if integrationID == "" {
		integrationID = notification.Data.Metadata.Reference
	}

	err := s.db.Where("integration_id = ?", integrationID).First(&pendingPayment).Error
	if err == gorm.ErrRecordNotFound {
		// Try to find by reference
		err = s.db.Where("reference = ?", notification.Data.Metadata.Reference).First(&pendingPayment).Error
		if err != nil {
			log.Printf("⚠️  No pending payment found for integration_id=%s or reference=%s",
				integrationID, notification.Data.Metadata.Reference)
			return fmt.Errorf("pending payment not found")
		}
	} else if err != nil {
		return fmt.Errorf("error finding pending payment: %w", err)
	}

	// Update pending payment with webhook data
	pendingPayment.PaymentID = notification.Data.PaymentID
	pendingPayment.BoldCode = notification.Data.BoldCode

	if notification.Data.Card != nil {
		pendingPayment.CardBrand = notification.Data.Card.Brand
		pendingPayment.CardMaskedPan = notification.Data.Card.MaskedPan
		pendingPayment.ApprovalNumber = notification.Data.ApprovalNumber
	}

	// Store full webhook data as JSON
	webhookJSON, _ := json.Marshal(notification)
	pendingPayment.WebhookData = string(webhookJSON)

	// Update status based on notification type
	switch notification.Type {
	case "SALE_APPROVED":
		pendingPayment.Status = "approved"
		log.Printf("✅ Payment approved: %s (Amount: %.2f)", pendingPayment.IntegrationID, pendingPayment.Amount)

	case "SALE_REJECTED":
		pendingPayment.Status = "rejected"
		log.Printf("❌ Payment rejected: %s", pendingPayment.IntegrationID)

	case "VOID_APPROVED":
		pendingPayment.Status = "voided"
		log.Printf("↩️  Payment voided: %s", pendingPayment.IntegrationID)

	case "VOID_REJECTED":
		// Void rejected means the original payment is still valid
		log.Printf("⚠️  Void rejected: %s", pendingPayment.IntegrationID)

	default:
		log.Printf("⚠️  Unknown notification type: %s", notification.Type)
	}

	// Save pending payment
	if err := s.db.Save(&pendingPayment).Error; err != nil {
		return fmt.Errorf("error saving pending payment: %w", err)
	}

	log.Printf("💾 Pending payment updated: ID=%d, Status=%s", pendingPayment.ID, pendingPayment.Status)

	// Send WebSocket notification to frontend
	if s.wsServer != nil {
		notificationData := map[string]interface{}{
			"integration_id":  pendingPayment.IntegrationID,
			"status":          pendingPayment.Status,
			"payment_id":      pendingPayment.PaymentID,
			"amount":          pendingPayment.Amount,
			"bold_code":       pendingPayment.BoldCode,
			"card_brand":      pendingPayment.CardBrand,
			"card_masked":     pendingPayment.CardMaskedPan,
			"approval_number": pendingPayment.ApprovalNumber,
		}
		log.Printf("📡 Sending WebSocket notification: event=bold_payment_update, integration_id=%s, status=%s",
			pendingPayment.IntegrationID, pendingPayment.Status)
		log.Printf("   Full notification data: %+v", notificationData)
		s.wsServer.BroadcastJSON("bold_payment_update", notificationData)
		log.Printf("✅ WebSocket notification broadcasted for payment %s", pendingPayment.IntegrationID)
	} else {
		log.Printf("⚠️  No WebSocket server configured for notifications")
	}

	return nil
}

// GetPendingPayment retrieves a pending payment by integration ID
func (s *BoldWebhookService) GetPendingPayment(integrationID string) (*models.BoldPendingPayment, error) {
	var payment models.BoldPendingPayment
	err := s.db.Where("integration_id = ?", integrationID).First(&payment).Error
	if err != nil {
		return nil, err
	}
	return &payment, nil
}

// CreatePendingPayment creates a new pending payment record
func (s *BoldWebhookService) CreatePendingPayment(payment *models.BoldPendingPayment) error {
	return s.db.Create(payment).Error
}

// UpdatePendingPaymentStatus updates the status of a pending payment
func (s *BoldWebhookService) UpdatePendingPaymentStatus(integrationID string, status string) error {
	return s.db.Model(&models.BoldPendingPayment{}).
		Where("integration_id = ?", integrationID).
		Update("status", status).Error
}

// GetPendingPayments retrieves all pending payments
func (s *BoldWebhookService) GetPendingPayments() ([]models.BoldPendingPayment, error) {
	var payments []models.BoldPendingPayment
	err := s.db.Where("status = ?", "pending").Find(&payments).Error
	return payments, err
}

// CleanupOldPendingPayments removes old pending payments (older than 24 hours)
func (s *BoldWebhookService) CleanupOldPendingPayments() error {
	cutoff := time.Now().Add(-24 * time.Hour)
	return s.db.Where("created_at < ? AND status = ?", cutoff, "pending").
		Delete(&models.BoldPendingPayment{}).Error
}
