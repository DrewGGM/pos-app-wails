import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuthContext } from './AuthContext';

interface WebSocketMessage {
  type: string;
  client_id?: string;
  timestamp: string;
  data: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => void;
  subscribe: (eventType: string, callback: (data: any) => void) => () => void;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number>();
  const listeners = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const { isAuthenticated } = useAuthContext();

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN || !isAuthenticated) {
      return;
    }

    try {
      // Get WebSocket URL from environment or use default
      const wsUrl = (window as any).env?.REACT_APP_WS_URL || 'ws://localhost:8080/ws';
      const clientType = 'pos'; // This is the POS client
      
      ws.current = new WebSocket(`${wsUrl}?type=${clientType}`);

      ws.current.onopen = () => {
        setIsConnected(true);
        toast.success('Conectado al servidor', { toastId: 'ws-connected' });

        // Send authentication message
        if (ws.current?.readyState === WebSocket.OPEN) {
          const authMessage: WebSocketMessage = {
            type: 'authenticate',
            timestamp: new Date().toISOString(),
            data: {
              token: localStorage.getItem('token'),
            },
          };
          ws.current.send(JSON.stringify(authMessage));
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          // Handle heartbeat
          if (message.type === 'heartbeat') {
            return;
          }

          // Notify all listeners for this message type
          const eventListeners = listeners.current.get(message.type);
          if (eventListeners) {
            eventListeners.forEach(callback => callback(message.data));
          }

          // Show notifications for specific events
          handleNotifications(message);
        } catch (error) {
          // Error parsing WebSocket message
        }
      };

      ws.current.onerror = (error) => {
        toast.error('Error en la conexión WebSocket');
      };

      ws.current.onclose = () => {
        setIsConnected(false);

        // Auto-reconnect after 5 seconds if authenticated
        if (isAuthenticated) {
          toast.warning('Conexión perdida, reconectando...', { toastId: 'ws-reconnect' });
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
    } catch (error) {
      toast.error('No se pudo conectar al servidor');
    }
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      toast.warning('No hay conexión con el servidor');
    }
  }, []);

  const subscribe = useCallback((eventType: string, callback: (data: any) => void) => {
    if (!listeners.current.has(eventType)) {
      listeners.current.set(eventType, new Set());
    }
    listeners.current.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const eventListeners = listeners.current.get(eventType);
      if (eventListeners) {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          listeners.current.delete(eventType);
        }
      }
    };
  }, []);

  const handleNotifications = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'order_new':
        toast.info(`Nueva orden: ${message.data.order_number}`, {
          position: 'bottom-right',
        });
        break;
      
      case 'order_ready':
        toast.success(`Orden lista: ${message.data.order_number}`, {
          position: 'bottom-right',
          autoClose: false,
        });
        break;
      
      case 'kitchen_update':
        if (message.data.status === 'preparing') {
          toast.info(`Preparando: ${message.data.item_name}`, {
            position: 'bottom-left',
          });
        }
        break;
      
      case 'table_update':
        // Handle table status updates silently
        break;
      
      case 'notification':
        toast(message.data.message, {
          type: message.data.type || 'info',
        });
        break;
    }
  };

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  const value = {
    isConnected,
    sendMessage,
    subscribe,
    connect,
    disconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = React.useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
};

export { WebSocketContext };
export default WebSocketContext;
