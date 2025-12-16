import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuthContext } from './AuthContext';
import { useNotifications } from './NotificationContext';

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
  const { addNotification } = useNotifications();

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

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      // Create an audio context and play a notification beep
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant notification sound (two-tone beep)
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1); // C#6
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2); // A5

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } catch (error) {
      console.debug('Could not play notification sound:', error);
    }
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
        // Check if this is a PWA order notification
        if (message.data.type === 'pwa_order') {
          // Play sound for remote orders
          if (message.data.play_sound) {
            playNotificationSound();
          }
          toast.info(`📱 ${message.data.message}`, {
            position: 'top-center',
            autoClose: 10000,
            style: {
              background: '#1976d2',
              color: 'white',
              fontWeight: 'bold',
            },
          });
          // Add to notification center (bell icon)
          addNotification({
            type: 'info',
            title: 'Pedido Remoto',
            message: message.data.message,
            action: {
              label: 'Ver Pedidos',
              path: '/orders',
            },
          });
        } else {
          toast(message.data.message, {
            type: message.data.type || 'info',
          });
        }
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
