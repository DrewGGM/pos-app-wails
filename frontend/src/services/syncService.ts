import apiClient from './apiClient';

interface SyncResult {
  success: boolean;
  syncedItems: number;
  pendingOrders: number;
  pendingSales: number;
  pendingInvoices: number;
  errors: string[];
}

interface SyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  lastSyncAt: Date | null;
  pendingOrders: number;
  pendingSales: number;
  pendingInvoices: number;
  error: string | null;
}

class SyncService {
  async sync(): Promise<SyncResult> {
    try {
      const response = await apiClient.post('/api/sync');
      return response.data;
    } catch (error) {
      // If offline, return mock result
      if (!navigator.onLine) {
        return {
          success: false,
          syncedItems: 0,
          pendingOrders: this.getOfflinePendingCount('orders'),
          pendingSales: this.getOfflinePendingCount('sales'),
          pendingInvoices: this.getOfflinePendingCount('invoices'),
          errors: ['Sin conexión a internet'],
        };
      }
      throw error;
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const response = await apiClient.get('/api/sync/status');
      return response.data;
    } catch (error) {
      // Return local status if offline
      return this.getLocalSyncStatus();
    }
  }

  async getSyncHistory(limit: number = 50): Promise<any[]> {
    const response = await apiClient.get('/api/sync/history', {
      params: { limit },
    });
    return response.data;
  }

  async forceSyncOrder(orderId: string): Promise<boolean> {
    try {
      const response = await apiClient.post(`/api/sync/order/${orderId}`);
      return response.data.success;
    } catch (error) {
      return false;
    }
  }

  async forceSyncSale(saleId: string): Promise<boolean> {
    try {
      const response = await apiClient.post(`/api/sync/sale/${saleId}`);
      return response.data.success;
    } catch (error) {
      return false;
    }
  }

  // Local storage management
  getOfflineData(type: 'orders' | 'sales' | 'invoices'): any[] {
    const key = `offline${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  saveOfflineData(type: 'orders' | 'sales' | 'invoices', data: any): void {
    const key = `offline${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const existing = this.getOfflineData(type);
    existing.push({
      ...data,
      offline_id: `${type}_${Date.now()}`,
      created_at: new Date().toISOString(),
      is_synced: false,
    });
    localStorage.setItem(key, JSON.stringify(existing));
  }

  removeOfflineData(type: 'orders' | 'sales' | 'invoices', offlineId: string): void {
    const key = `offline${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const existing = this.getOfflineData(type);
    const filtered = existing.filter(item => item.offline_id !== offlineId);
    localStorage.setItem(key, JSON.stringify(filtered));
  }

  getOfflinePendingCount(type: 'orders' | 'sales' | 'invoices'): number {
    const data = this.getOfflineData(type);
    return data.filter(item => !item.is_synced).length;
  }

  getTotalPendingCount(): number {
    return (
      this.getOfflinePendingCount('orders') +
      this.getOfflinePendingCount('sales') +
      this.getOfflinePendingCount('invoices')
    );
  }

  getLocalSyncStatus(): SyncStatus {
    const statusJson = localStorage.getItem('syncStatus');
    if (statusJson) {
      const status = JSON.parse(statusJson);
      return {
        ...status,
        lastSyncAt: status.lastSyncAt ? new Date(status.lastSyncAt) : null,
      };
    }

    return {
      status: 'idle',
      lastSyncAt: null,
      pendingOrders: this.getOfflinePendingCount('orders'),
      pendingSales: this.getOfflinePendingCount('sales'),
      pendingInvoices: this.getOfflinePendingCount('invoices'),
      error: null,
    };
  }

  updateLocalSyncStatus(status: Partial<SyncStatus>): void {
    const current = this.getLocalSyncStatus();
    const updated = {
      ...current,
      ...status,
      lastSyncAt: status.lastSyncAt ? status.lastSyncAt.toISOString() : current.lastSyncAt,
    };
    localStorage.setItem('syncStatus', JSON.stringify(updated));
  }

  // Process offline queue
  async processOfflineQueue(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedItems: 0,
      pendingOrders: 0,
      pendingSales: 0,
      pendingInvoices: 0,
      errors: [],
    };

    // Process offline orders
    const offlineOrders = this.getOfflineData('orders');
    for (const order of offlineOrders.filter(o => !o.is_synced)) {
      try {
        await apiClient.post('/api/orders', order);
        order.is_synced = true;
        result.syncedItems++;
      } catch (error: any) {
        result.errors.push(`Order ${order.offline_id}: ${error.message}`);
        result.pendingOrders++;
      }
    }

    // Process offline sales
    const offlineSales = this.getOfflineData('sales');
    for (const sale of offlineSales.filter(s => !s.is_synced)) {
      try {
        await apiClient.post('/api/sales', sale);
        sale.is_synced = true;
        result.syncedItems++;
      } catch (error: any) {
        result.errors.push(`Sale ${sale.offline_id}: ${error.message}`);
        result.pendingSales++;
      }
    }

    // Update local storage with synced status
    localStorage.setItem('offlineOrders', JSON.stringify(offlineOrders));
    localStorage.setItem('offlineSales', JSON.stringify(offlineSales));

    return result;
  }

  // Cache management
  clearCache(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('cache_')) {
        localStorage.removeItem(key);
      }
    });
  }

  getCacheSize(): number {
    let size = 0;
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('cache_')) {
        const item = localStorage.getItem(key);
        if (item) {
          size += new Blob([item]).size;
        }
      }
    });
    return size;
  }

  clearOldCache(daysOld: number = 7): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('cache_')) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const cached = JSON.parse(item);
            const cacheDate = new Date(cached.timestamp);
            if (cacheDate < cutoff) {
              localStorage.removeItem(key);
            }
          } catch (error) {
            // Invalid cache item, remove it
            localStorage.removeItem(key);
          }
        }
      }
    });
  }
}

export const syncService = new SyncService();
