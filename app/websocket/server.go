package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/grandcat/zeroconf"
	"gorm.io/gorm"
)

// MessageType represents the type of WebSocket message
type MessageType string

const (
	// Message types
	TypeOrderNew        MessageType = "order_new"
	TypeOrderUpdate     MessageType = "order_update"
	TypeOrderReady      MessageType = "order_ready"
	TypeOrderCancelled  MessageType = "order_cancelled"
	TypeTableUpdate     MessageType = "table_update"
	TypeKitchenOrder    MessageType = "kitchen_order"
	TypeKitchenUpdate   MessageType = "kitchen_update"
	TypeKitchenAck      MessageType = "kitchen_ack"      // Kitchen acknowledges order receipt
	TypeKitchenAckResult MessageType = "kitchen_ack_result" // Result broadcast to source apps
	TypeNotification    MessageType = "notification"
	TypeHeartbeat       MessageType = "heartbeat"
	TypeAuthenticate    MessageType = "authenticate"
	TypeAuthResponse    MessageType = "auth_response"
)

// ClientType represents the type of connected client
type ClientType string

const (
	ClientPOS     ClientType = "pos"
	ClientKitchen ClientType = "kitchen"
	ClientWaiter  ClientType = "waiter"
)

// Message represents a WebSocket message
type Message struct {
	Type      MessageType     `json:"type"`
	ClientID  string          `json:"client_id,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

// Client represents a connected WebSocket client
type Client struct {
	ID          string
	Type        ClientType
	Connection  *websocket.Conn
	Send        chan []byte
	Server      *Server
	ConnectedAt time.Time
	RemoteAddr  string
}

// Server represents the WebSocket server
type Server struct {
	clients      map[string]*Client
	broadcast    chan []byte
	register     chan *Client
	unregister   chan *Client
	upgrader     websocket.Upgrader
	mu           sync.RWMutex
	port         string
	db           *gorm.DB
	orderService OrderCreator
	restHandlers *RESTHandlers
	mdnsServer   interface{} // zeroconf.Server
	mdnsShutdown chan bool
}

// NewServer creates a new WebSocket server
func NewServer(port string) *Server {
	return &Server{
		clients:      make(map[string]*Client),
		broadcast:    make(chan []byte),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		port:         port,
		mdnsShutdown: make(chan bool),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from local network
				return true
			},
		},
	}
}

// SetDB sets the database connection for REST API endpoints
func (s *Server) SetDB(db *gorm.DB) {
	s.db = db
	// Initialize REST handlers if we have orderService, otherwise wait for SetOrderService
	if s.orderService != nil {
		s.restHandlers = NewRESTHandlers(db, s, s.orderService)
		log.Println("WebSocket server: Database connection set for REST API with OrderService")
	} else {
		log.Println("WebSocket server: Database connection set, waiting for OrderService")
	}
}

// SetOrderService sets the order service for creating orders via REST API
func (s *Server) SetOrderService(orderService OrderCreator) {
	s.orderService = orderService
	// Initialize REST handlers if we have DB, otherwise wait for SetDB
	if s.db != nil {
		s.restHandlers = NewRESTHandlers(s.db, s, orderService)
		log.Println("WebSocket server: OrderService set for REST API")
	} else {
		log.Println("WebSocket server: OrderService set, waiting for Database")
	}
}

// Start starts the WebSocket server
func (s *Server) Start() error {
	// Start the hub
	go s.run()

	// Set up HTTP server
	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/health", s.handleHealth)

	// REST API endpoints for mobile apps
	if s.restHandlers != nil {
		http.HandleFunc("/api/products", s.restHandlers.HandleGetProducts)
		http.HandleFunc("/api/orders/", s.restHandlers.HandleOrderByID)
		http.HandleFunc("/api/orders", s.restHandlers.HandleOrders)
		http.HandleFunc("/api/tables", s.restHandlers.HandleGetTables)
		http.HandleFunc("/api/tables/status", s.restHandlers.HandleUpdateTableStatus)
		http.HandleFunc("/api/table-areas", s.restHandlers.HandleGetTableAreas)
		http.HandleFunc("/api/order-types/active", s.restHandlers.HandleGetActiveOrderTypes)
		http.HandleFunc("/api/custom-pages", s.restHandlers.HandleGetCustomPages)
		http.HandleFunc("/api/custom-pages/", s.restHandlers.HandleGetCustomPageProducts)
		http.HandleFunc("/api/sales/today", s.restHandlers.HandleGetTodaySales)
		log.Println("WebSocket server: REST API endpoints registered")
	}

	// Start mDNS service announcement
	go s.startMDNS()

	log.Printf("WebSocket server starting on port %s", s.port)
	return http.ListenAndServe(s.port, nil)
}

// startMDNS announces the POS server via mDNS/Zeroconf
func (s *Server) startMDNS() {
	// Extract port number from ":8080" format
	portStr := strings.TrimPrefix(s.port, ":")
	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Printf("mDNS: Invalid port format %s: %v", s.port, err)
		return
	}

	// Register mDNS service
	server, err := zeroconf.Register(
		"POS Server",              // Service instance name
		"_posserver._tcp",         // Service type
		"local.",                  // Domain
		port,                      // Port
		[]string{"version=1.0"},   // TXT records
		nil,                       // Network interfaces (nil = all)
	)
	if err != nil {
		log.Printf("mDNS: Failed to register service: %v", err)
		return
	}

	s.mdnsServer = server
	log.Println("mDNS: POS Server announced successfully on _posserver._tcp.local")

	// Wait for shutdown signal
	<-s.mdnsShutdown
	if server != nil {
		server.Shutdown()
		log.Println("mDNS: Service announcement stopped")
	}
}

// Stop stops the WebSocket server
func (s *Server) Stop() {
	// Stop mDNS announcement
	select {
	case s.mdnsShutdown <- true:
		log.Println("mDNS: Shutdown signal sent")
	default:
		log.Println("mDNS: Shutdown channel already closed or not listening")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Close all client connections
	for _, client := range s.clients {
		close(client.Send)
		client.Connection.Close()
	}
}

// run handles the main server loop
func (s *Server) run() {
	ticker := time.NewTicker(30 * time.Second) // Heartbeat every 30 seconds
	defer ticker.Stop()

	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client.ID] = client
			s.mu.Unlock()
			log.Printf("Client registered: %s (type: %s)", client.ID, client.Type)
			s.sendAuthResponse(client, true, "Connected successfully")

		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client.ID]; ok {
				delete(s.clients, client.ID)
				s.mu.Unlock()

				// Close channel safely
				go func(c *Client) {
					defer func() {
						if r := recover(); r != nil {
							// Channel already closed, ignore
						}
					}()
					close(c.Send)
				}(client)

				log.Printf("Client unregistered: %s", client.ID)
			} else {
				s.mu.Unlock()
			}

		case message := <-s.broadcast:
			s.mu.Lock()
			for id, client := range s.clients {
				select {
				case client.Send <- message:
				default:
					// Client buffer is full, disconnect
					delete(s.clients, id)
					go func(c *Client) {
						defer func() {
							if r := recover(); r != nil {
								// Channel already closed, ignore
							}
						}()
						close(c.Send)
					}(client)
				}
			}
			s.mu.Unlock()

		case <-ticker.C:
			// Send heartbeat to all clients
			s.sendHeartbeat()
		}
	}
}

// handleWebSocket handles WebSocket connection upgrades
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get client type from query parameters
	clientType := ClientType(r.URL.Query().Get("type"))
	if clientType == "" {
		clientType = ClientPOS
	}

	// Upgrade connection
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Create client
	client := &Client{
		ID:          generateClientID(),
		Type:        clientType,
		Connection:  conn,
		Send:        make(chan []byte, 256),
		Server:      s,
		ConnectedAt: time.Now(),
		RemoteAddr:  r.RemoteAddr,
	}

	// Register client
	s.register <- client

	// Start client goroutines
	go client.writePump()
	go client.readPump()
}

// handleHealth handles health check endpoint
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	clientCount := len(s.clients)
	s.mu.RUnlock()

	response := map[string]interface{}{
		"status":  "healthy",
		"clients": clientCount,
		"time":    time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Client methods

// readPump handles reading messages from the client
func (c *Client) readPump() {
	defer func() {
		c.Server.unregister <- c
		c.Connection.Close()
	}()

	c.Connection.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Connection.SetPongHandler(func(string) error {
		c.Connection.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, messageBytes, err := c.Connection.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Parse message
		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		// Handle message based on type
		c.handleMessage(&message)
	}
}

// writePump handles writing messages to the client
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Connection.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Connection.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Connection.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.Connection.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			c.Connection.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Connection.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage handles incoming messages from clients
func (c *Client) handleMessage(message *Message) {
	log.Printf("Received message type %s from client %s", message.Type, c.ID)

	switch message.Type {
	case TypeOrderNew:
		// Handle new order from waiter app
		c.Server.broadcastToKitchen(message)
		c.Server.broadcastToPOS(message)

	case TypeOrderUpdate:
		// Handle order update
		c.Server.broadcastToAll(message)

	case TypeOrderCancelled:
		// Handle order cancellation from waiter app or REST API
		log.Printf("Broadcasting order cancellation to kitchen and POS")
		c.Server.broadcastToKitchen(message)
		c.Server.broadcastToPOS(message)

	case TypeKitchenUpdate:
		// Handle kitchen status update
		if c.Type == ClientKitchen {
			c.Server.broadcastToPOS(message)
			c.Server.broadcastToWaiters(message)
		}

	case TypeTableUpdate:
		// Handle table status update
		c.Server.broadcastToAll(message)

	case TypeHeartbeat:
		// Respond with heartbeat
		c.sendMessage(Message{
			Type:      TypeHeartbeat,
			Timestamp: time.Now(),
			Data:      json.RawMessage(`{"status":"alive"}`),
		})

	case TypeKitchenAck:
		// Handle kitchen acknowledgment of order receipt
		if c.Type == ClientKitchen {
			c.handleKitchenAck(message)
		}

	default:
		log.Printf("Unknown message type: %s", message.Type)
	}
}

// KitchenAckData represents the data in a kitchen acknowledgment message
type KitchenAckData struct {
	OrderID     uint   `json:"order_id"`
	OrderNumber string `json:"order_number"`
}

// handleKitchenAck handles kitchen acknowledgment of order receipt
func (c *Client) handleKitchenAck(message *Message) {
	log.Printf("Kitchen client %s acknowledging order", c.ID)

	// Parse the acknowledgment data
	var ackData KitchenAckData
	if err := json.Unmarshal(message.Data, &ackData); err != nil {
		log.Printf("Error parsing kitchen ack data: %v", err)
		return
	}

	log.Printf("Kitchen acknowledged order ID: %d, Number: %s", ackData.OrderID, ackData.OrderNumber)

	// Update the order in the database
	if c.Server.db != nil {
		now := time.Now()
		result := c.Server.db.Model(&struct{}{}).Table("orders").
			Where("id = ?", ackData.OrderID).
			Updates(map[string]interface{}{
				"kitchen_acknowledged":    true,
				"kitchen_acknowledged_at": now,
			})
		if result.Error != nil {
			log.Printf("Error updating kitchen acknowledgment: %v", result.Error)
		} else {
			log.Printf("Order %d marked as acknowledged by kitchen", ackData.OrderID)
		}
	}

	// Broadcast acknowledgment result to POS and waiter apps
	resultData, _ := json.Marshal(map[string]interface{}{
		"order_id":     ackData.OrderID,
		"order_number": ackData.OrderNumber,
		"acknowledged": true,
		"timestamp":    time.Now(),
	})

	resultMessage := Message{
		Type:      TypeKitchenAckResult,
		Timestamp: time.Now(),
		Data:      resultData,
	}

	c.Server.broadcastToPOS(&resultMessage)
	c.Server.broadcastToWaiters(&resultMessage)
	log.Printf("Kitchen acknowledgment result broadcast to POS and waiters")
}

// sendMessage sends a message to the client
func (c *Client) sendMessage(message Message) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	select {
	case c.Send <- data:
		return nil
	default:
		return fmt.Errorf("client send channel is full")
	}
}

// Server broadcast methods

// BroadcastMessage broadcasts a message to all connected clients
func (s *Server) BroadcastMessage(message Message) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message: %v", err)
		return
	}

	s.broadcast <- data
}

// broadcastToAll broadcasts a message to all clients
func (s *Server) broadcastToAll(message *Message) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, client := range s.clients {
		select {
		case client.Send <- data:
		default:
			log.Printf("Failed to send to client %s", client.ID)
		}
	}
}

// broadcastToKitchen broadcasts a message to all kitchen clients
func (s *Server) broadcastToKitchen(message *Message) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, client := range s.clients {
		if client.Type == ClientKitchen {
			select {
			case client.Send <- data:
			default:
				log.Printf("Failed to send to kitchen client %s", client.ID)
			}
		}
	}
}

// BroadcastToKitchen broadcasts a message to all kitchen clients (public method)
func (s *Server) BroadcastToKitchen(message Message) {
	s.broadcastToKitchen(&message)
}

// broadcastToPOS broadcasts a message to all POS clients
func (s *Server) broadcastToPOS(message *Message) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, client := range s.clients {
		if client.Type == ClientPOS {
			select {
			case client.Send <- data:
			default:
				log.Printf("Failed to send to POS client %s", client.ID)
			}
		}
	}
}

// broadcastToWaiters broadcasts a message to all waiter clients
func (s *Server) broadcastToWaiters(message *Message) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, client := range s.clients {
		if client.Type == ClientWaiter {
			select {
			case client.Send <- data:
			default:
				log.Printf("Failed to send to waiter client %s", client.ID)
			}
		}
	}
}

// sendHeartbeat sends heartbeat to all clients
func (s *Server) sendHeartbeat() {
	message := Message{
		Type:      TypeHeartbeat,
		Timestamp: time.Now(),
		Data:      json.RawMessage(`{"ping":"pong"}`),
	}

	s.broadcastToAll(&message)
}

// sendAuthResponse sends authentication response to a client
func (s *Server) sendAuthResponse(client *Client, success bool, message string) {
	response := map[string]interface{}{
		"success": success,
		"message": message,
		"client_id": client.ID,
	}

	data, _ := json.Marshal(response)

	msg := Message{
		Type:      TypeAuthResponse,
		Timestamp: time.Now(),
		Data:      json.RawMessage(data),
	}

	client.sendMessage(msg)
}

// Notification methods

// SendOrderNotification sends order notification
func (s *Server) SendOrderNotification(orderID uint, status string) {
	data := map[string]interface{}{
		"order_id": orderID,
		"status":   status,
		"time":     time.Now(),
	}

	dataBytes, _ := json.Marshal(data)

	message := Message{
		Type:      TypeOrderUpdate,
		Timestamp: time.Now(),
		Data:      json.RawMessage(dataBytes),
	}

	s.broadcastToAll(&message)
}

// SendKitchenOrder sends order to kitchen
func (s *Server) SendKitchenOrder(orderData interface{}) {
	dataBytes, _ := json.Marshal(orderData)

	message := Message{
		Type:      TypeKitchenOrder,
		Timestamp: time.Now(),
		Data:      json.RawMessage(dataBytes),
	}

	s.broadcastToKitchen(&message)
}

// SendTableUpdate sends table status update
func (s *Server) SendTableUpdate(tableID uint, status string) {
	data := map[string]interface{}{
		"table_id": tableID,
		"status":   status,
		"time":     time.Now(),
	}

	dataBytes, _ := json.Marshal(data)

	message := Message{
		Type:      TypeTableUpdate,
		Timestamp: time.Now(),
		Data:      json.RawMessage(dataBytes),
	}

	s.broadcastToAll(&message)
}

// GetConnectedClients returns list of connected clients
func (s *Server) GetConnectedClients() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	clients := make([]map[string]interface{}, 0, len(s.clients))
	for _, client := range s.clients {
		clientData := map[string]interface{}{
			"id":           client.ID,
			"type":         string(client.Type),
			"connected_at": client.ConnectedAt.Format(time.RFC3339),
			"remote_addr":  client.RemoteAddr,
		}
		log.Printf("GetConnectedClients: Client data: %+v", clientData)
		clients = append(clients, clientData)
	}

	log.Printf("GetConnectedClients: Returning %d clients", len(clients))
	return clients
}

// GetServerStatus returns current server status
func (s *Server) GetServerStatus() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Count clients by type
	kitchenCount := 0
	waiterCount := 0
	posCount := 0

	for _, client := range s.clients {
		switch client.Type {
		case ClientKitchen:
			kitchenCount++
		case ClientWaiter:
			waiterCount++
		case ClientPOS:
			posCount++
		}
	}

	return map[string]interface{}{
		"running":        true,
		"port":           s.port,
		"total_clients":  len(s.clients),
		"kitchen_clients": kitchenCount,
		"waiter_clients":  waiterCount,
		"pos_clients":     posCount,
	}
}

// GetPort returns the server port
func (s *Server) GetPort() string {
	return s.port
}

// DisconnectClient disconnects a specific client
func (s *Server) DisconnectClient(clientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	client, exists := s.clients[clientID]
	if !exists {
		return fmt.Errorf("client not found: %s", clientID)
	}

	// Close the client connection
	client.Connection.Close()
	delete(s.clients, clientID)

	return nil
}

// Helper functions

func generateClientID() string {
	return fmt.Sprintf("%d-%d", time.Now().Unix(), time.Now().Nanosecond())
}
