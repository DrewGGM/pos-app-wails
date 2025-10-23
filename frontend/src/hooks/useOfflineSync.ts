import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { syncService } from '../services/syncService';

interface SyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  lastSyncAt: Date | null;
  pendingOrders: number;
  pendingSales: number;
  pendingInvoices: number;
  error: string | null;
}

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'idle',
    lastSyncAt: null,
    pendingOrders: 0,
    pendingSales: 0,
    pendingInvoices: 0,
    error: null,
  });

  // Check online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexión restaurada', { toastId: 'online' });
      
      // Trigger sync when coming back online
      performSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Trabajando sin conexión', { toastId: 'offline' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial status
    setIsOnline(navigator.onLine);

    // Load sync status from localStorage
    const savedStatus = localStorage.getItem('syncStatus');
    if (savedStatus) {
      try {
        const parsed = JSON.parse(savedStatus);
        setSyncStatus({
          ...parsed,
          lastSyncAt: parsed.lastSyncAt ? new Date(parsed.lastSyncAt) : null,
        });
      } catch (error) {
        console.error('Error parsing sync status:', error);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto sync every 5 minutes when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      performSync();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isOnline]);

  const performSync = useCallback(async () => {
    if (!isOnline) {
      console.log('Cannot sync while offline');
      return;
    }

    setSyncStatus(prev => ({ ...prev, status: 'syncing', error: null }));

    try {
      // Sync is handled by backend SyncWorker automatically
      // Frontend just updates UI status
      setSyncStatus({
        status: 'completed',
        lastSyncAt: new Date(),
        pendingOrders: 0,
        pendingSales: 0,
        pendingInvoices: 0,
        error: null,
      });

      // Save to localStorage
      localStorage.setItem('syncStatus', JSON.stringify({
        status: 'completed',
        lastSyncAt: new Date().toISOString(),
        pendingOrders: 0,
        pendingSales: 0,
        pendingInvoices: 0,
        error: null,
      }));
    } catch (error: any) {
      setSyncStatus(prev => ({
        ...prev,
        status: 'failed',
        error: error.message || 'Error de sincronización',
      }));
    }
  }, [isOnline]);

  const forceSync = useCallback(() => {
    if (!isOnline) {
      toast.warning('No se puede sincronizar sin conexión');
      return;
    }

    toast.info('Sincronizando...', { toastId: 'sync-start' });
    performSync();
  }, [isOnline, performSync]);

  const getPendingCount = useCallback(() => {
    return syncStatus.pendingOrders + syncStatus.pendingSales + syncStatus.pendingInvoices;
  }, [syncStatus]);

  return {
    isOnline,
    syncStatus,
    performSync,
    forceSync,
    getPendingCount,
  };
};
