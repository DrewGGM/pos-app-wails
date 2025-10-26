package services

import (
	"PosApp/app/websocket"
	"fmt"
	"log"
	"net"
	"time"
)

// WebSocketManagementService handles WebSocket server management
type WebSocketManagementService struct {
	server *websocket.Server
}

// NewWebSocketManagementService creates a new WebSocket management service
func NewWebSocketManagementService(server *websocket.Server) *WebSocketManagementService {
	log.Printf("WebSocketManagementService: Creating new instance (server=%v)", server != nil)
	return &WebSocketManagementService{
		server: server,
	}
}

// SetServer updates the WebSocket server instance
func (s *WebSocketManagementService) SetServer(server *websocket.Server) {
	log.Printf("WebSocketManagementService: Setting server instance (server=%v)", server != nil)
	s.server = server
}

// GetStatus returns the current WebSocket server status
func (s *WebSocketManagementService) GetStatus() map[string]interface{} {
	log.Printf("WebSocketManagementService: GetStatus called (server=%v)", s.server != nil)

	if s.server == nil {
		log.Println("WebSocketManagementService: Server is nil, returning error")
		return map[string]interface{}{
			"running": false,
			"error":   "Server not initialized",
		}
	}

	status := s.server.GetServerStatus()
	log.Printf("WebSocketManagementService: Server status: %+v", status)

	// Add local IP addresses
	ips := getLocalIPAddresses()
	status["local_ips"] = ips
	log.Printf("WebSocketManagementService: Local IPs: %v", ips)

	return status
}

// GetConnectedClients returns list of connected clients
func (s *WebSocketManagementService) GetConnectedClients() []map[string]interface{} {
	log.Printf("WebSocketManagementService: GetConnectedClients called (server=%v)", s.server != nil)

	if s.server == nil {
		log.Println("WebSocketManagementService: Server is nil, returning empty list")
		return []map[string]interface{}{}
	}

	clients := s.server.GetConnectedClients()
	log.Printf("WebSocketManagementService: Returning %d clients: %+v", len(clients), clients)
	return clients
}

// DisconnectClient disconnects a specific client
func (s *WebSocketManagementService) DisconnectClient(clientID string) error {
	if s.server == nil {
		return fmt.Errorf("server not initialized")
	}

	return s.server.DisconnectClient(clientID)
}

// SendTestNotification sends a test notification to all clients
func (s *WebSocketManagementService) SendTestNotification() error {
	if s.server == nil {
		return fmt.Errorf("server not initialized")
	}

	message := websocket.Message{
		Type:      websocket.TypeNotification,
		Timestamp: time.Now(),
		Data:      []byte(`{"message":"Test notification from POS server"}`),
	}

	s.server.BroadcastMessage(message)
	return nil
}

// getLocalIPAddresses returns all local IP addresses
func getLocalIPAddresses() []string {
	var ips []string

	interfaces, err := net.Interfaces()
	if err != nil {
		return ips
	}

	for _, iface := range interfaces {
		// Skip down interfaces
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		// Skip loopback
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}

			if ip == nil || ip.IsLoopback() {
				continue
			}

			// Only IPv4
			ip = ip.To4()
			if ip != nil {
				ips = append(ips, ip.String())
			}
		}
	}

	return ips
}

// getCurrentTime returns the current time as a string
func getCurrentTime() string {
	return time.Now().Format(time.RFC3339)
}
