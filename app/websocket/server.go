package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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
	ID         string
	Type       ClientType
	Connection *websocket.Conn
	Send       chan []byte
	Server     *Server
}

// Server represents the WebSocket server
type Server struct {
	clients    map[string]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	upgrader   websocket.Upgrader
	mu         sync.RWMutex
	port       string
}

// NewServer creates a new WebSocket server
func NewServer(port string) *Server {
	return &Server{
		clients:    make(map[string]*Client),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		port:       port,
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

// Start starts the WebSocket server
func (s *Server) Start() error {
	// Start the hub
	go s.run()

	// Set up HTTP server
	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/health", s.handleHealth)

	log.Printf("WebSocket server starting on port %s", s.port)
	return http.ListenAndServe(s.port, nil)
}

// Stop stops the WebSocket server
func (s *Server) Stop() {
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
		ID:         generateClientID(),
		Type:       clientType,
		Connection: conn,
		Send:       make(chan []byte, 256),
		Server:     s,
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

	default:
		log.Printf("Unknown message type: %s", message.Type)
	}
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
		clients = append(clients, map[string]interface{}{
			"id":   client.ID,
			"type": client.Type,
		})
	}

	return clients
}

// Helper functions

func generateClientID() string {
	return fmt.Sprintf("%d-%d", time.Now().Unix(), time.Now().Nanosecond())
}
