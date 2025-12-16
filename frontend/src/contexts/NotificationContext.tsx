import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { wailsDianService } from '../services/wailsDianService';

export interface Notification {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    path: string;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const checkResolutionLimit = useCallback(async () => {
    try {
      const status = await wailsDianService.getResolutionLimitStatus();
      if (status && status.is_near_limit) {
        const existingNotification = notifications.find(
          n => n.id === 'resolution-limit-warning'
        );

        if (!existingNotification) {
          const newNotification: Notification = {
            id: 'resolution-limit-warning',
            type: 'warning',
            title: 'Límite de Facturación Cercano',
            message: `Quedan ${status.remaining_invoices} facturas disponibles en la resolución actual. El límite de alerta está configurado en ${status.alert_threshold}.`,
            timestamp: new Date(),
            read: false,
            action: {
              label: 'Ver Configuración',
              path: '/settings',
            },
          };
          setNotifications(prev => [newNotification, ...prev.filter(n => n.id !== 'resolution-limit-warning')]);
        } else if (!existingNotification.read) {
          // Update the message with current count
          setNotifications(prev =>
            prev.map(n =>
              n.id === 'resolution-limit-warning'
                ? {
                    ...n,
                    message: `Quedan ${status.remaining_invoices} facturas disponibles en la resolución actual. El límite de alerta está configurado en ${status.alert_threshold}.`,
                    timestamp: new Date(),
                  }
                : n
            )
          );
        }
      } else {
        // Remove the warning if no longer near limit
        setNotifications(prev => prev.filter(n => n.id !== 'resolution-limit-warning'));
      }
    } catch (error) {
      // Silently fail - service might not be ready
      console.debug('Could not check resolution limit:', error);
    }
  }, [notifications]);

  const refreshNotifications = useCallback(async () => {
    await checkResolutionLimit();
  }, [checkResolutionLimit]);

  useEffect(() => {
    // Initial check
    checkResolutionLimit();

    // Check every 5 minutes
    const interval = setInterval(checkResolutionLimit, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkResolutionLimit]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
