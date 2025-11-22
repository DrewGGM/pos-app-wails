package models

import (
	"time"
)

// RappiConfig represents Rappi integration configuration
type RappiConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// Enable/Disable Integration
	IsEnabled bool `json:"is_enabled"`

	// Environment
	Environment string `json:"environment"` // "development", "production"

	// Authentication Credentials
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"` // Encrypted in database

	// Store Configuration
	StoreIDs string `json:"store_ids"` // Comma-separated list of store IDs

	// Webhook Configuration
	UseWebhooks    bool   `json:"use_webhooks"`     // true = webhooks, false = polling
	WebhookBaseURL string `json:"webhook_base_url"` // URL where Rappi will send webhooks
	WebhookPort    int    `json:"webhook_port"`     // Port for webhook server (default: 8081)
	WebhookSecret  string `json:"webhook_secret"`   // Secret for HMAC validation

	// Menu Sync Configuration
	AutoSyncMenu      bool `json:"auto_sync_menu"`       // Automatically sync menu on product changes
	SyncMenuOnStartup bool `json:"sync_menu_on_startup"` // Sync menu when application starts

	// Order Configuration
	DefaultCookingTime int  `json:"default_cooking_time"` // Default cooking time in minutes
	AutoAcceptOrders   bool `json:"auto_accept_orders"`   // Automatically accept incoming orders

	// API URLs (auto-filled based on environment)
	BaseURL string `json:"base_url"` // API base URL
	AuthURL string `json:"auth_url"` // Authentication URL

	// Connection Status
	LastConnectionTest     *time.Time `json:"last_connection_test,omitempty"`
	LastConnectionStatus   string     `json:"last_connection_status"` // "success", "error", "never_tested"
	LastConnectionError    string     `json:"last_connection_error"`
	CurrentToken           string     `json:"current_token"`           // Cached access token
	TokenExpiresAt         *time.Time `json:"token_expires_at,omitempty"`

	// Statistics
	TotalOrdersReceived  int        `json:"total_orders_received"`
	TotalOrdersAccepted  int        `json:"total_orders_accepted"`
	TotalOrdersRejected  int        `json:"total_orders_rejected"`
	LastMenuSync         *time.Time `json:"last_menu_sync,omitempty"`
	LastMenuSyncStatus   string     `json:"last_menu_sync_status"`   // "success", "error", "never_synced"
	LastOrderReceived    *time.Time `json:"last_order_received,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RappiOrder represents an order received from Rappi
type RappiOrder struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	RappiOrderID  string `gorm:"uniqueIndex;not null" json:"rappi_order_id"` // Rappi's order ID
	POSOrderID    *uint  `json:"pos_order_id,omitempty"`                     // Link to internal Order
	StoreID       string `json:"store_id"`
	Status        string `json:"status"` // RECEIVED, ACCEPTED, REJECTED, READY, COMPLETED, CANCELLED
	CookingTime   int    `json:"cooking_time"`
	RawData       string `gorm:"type:text" json:"raw_data"`         // Full JSON payload from Rappi
	RejectionReason string `json:"rejection_reason,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// RappiMenuSync represents a menu synchronization event
type RappiMenuSync struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	StoreID       string    `json:"store_id"`
	SyncStatus    string    `json:"sync_status"` // PENDING, SENT, APPROVED, REJECTED
	ItemsCount    int       `json:"items_count"`
	ErrorMessage  string    `gorm:"type:text" json:"error_message,omitempty"`
	SyncedAt      time.Time `json:"synced_at"`
}

// RappiWebhook represents a registered webhook
type RappiWebhook struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	EventType     string    `json:"event_type"` // NEW_ORDER, ORDER_EVENT_CANCEL, PING, STORE_CONNECTIVITY
	URL           string    `json:"url"`
	StoreIDs      string    `json:"store_ids"` // Comma-separated
	IsActive      bool      `json:"is_active"`
	RegisteredAt  time.Time `json:"registered_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TableName overrides for GORM
func (RappiConfig) TableName() string {
	return "rappi_configs"
}

func (RappiOrder) TableName() string {
	return "rappi_orders"
}

func (RappiMenuSync) TableName() string {
	return "rappi_menu_syncs"
}

func (RappiWebhook) TableName() string {
	return "rappi_webhooks"
}
