import apiClient, { cacheResponse } from './apiClient';
import { Order, OrderItem, Table } from '../types/models';

export interface CreateOrderData {
  type: 'dine_in' | 'takeout' | 'delivery';
  table_id?: number;
  customer_id?: number;
  items: Partial<OrderItem>[];
  notes?: string;
  source?: string;
}

interface AddItemData {
  product_id: number;
  quantity: number;
  modifiers?: any[];
  notes?: string;
}

class OrderService {
  // Orders
  async createOrder(orderData: CreateOrderData): Promise<Order> {
    const response = await apiClient.post('/api/orders', orderData);
    return response.data;
  }

  async getOrder(id: number): Promise<Order> {
    const response = await apiClient.get(`/api/orders/${id}`);
    return response.data;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order> {
    const response = await apiClient.get(`/api/orders/number/${orderNumber}`);
    return response.data;
  }

  async getPendingOrders(): Promise<Order[]> {
    const response = await apiClient.get('/api/orders/pending');
    return response.data;
  }

  async getKitchenQueue(): Promise<Order[]> {
    const response = await apiClient.get('/api/orders/kitchen-queue');
    return response.data;
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    const response = await apiClient.get('/api/orders', {
      params: { status },
    });
    return response.data;
  }

  async getOrdersByTable(tableId: number): Promise<Order[]> {
    const response = await apiClient.get(`/api/orders/table/${tableId}`);
    return response.data;
  }

  async getTodayOrders(): Promise<Order[]> {
    const response = await apiClient.get('/api/orders/today');
    return response.data;
  }

  async updateOrderStatus(orderId: number, status: string): Promise<Order> {
    const response = await apiClient.put(`/api/orders/${orderId}/status`, {
      status,
    });
    return response.data;
  }

  async addItemToOrder(orderId: number, item: AddItemData): Promise<OrderItem> {
    const response = await apiClient.post(`/api/orders/${orderId}/items`, item);
    return response.data;
  }

  async updateOrderItem(orderId: number, itemId: number, quantity: number): Promise<OrderItem> {
    const response = await apiClient.put(`/api/orders/${orderId}/items/${itemId}`, {
      quantity,
    });
    return response.data;
  }

  async removeItemFromOrder(orderId: number, itemId: number): Promise<void> {
    await apiClient.delete(`/api/orders/${orderId}/items/${itemId}`);
  }

  async cancelOrder(orderId: number, reason: string): Promise<void> {
    await apiClient.post(`/api/orders/${orderId}/cancel`, {
      reason,
    });
  }

  async splitOrder(orderId: number, items: number[]): Promise<Order> {
    const response = await apiClient.post(`/api/orders/${orderId}/split`, {
      items,
    });
    return response.data;
  }

  async mergeOrders(orderIds: number[]): Promise<Order> {
    const response = await apiClient.post('/api/orders/merge', {
      order_ids: orderIds,
    });
    return response.data;
  }

  // Kitchen
  async sendToKitchen(orderId: number, items?: number[]): Promise<void> {
    await apiClient.post(`/api/orders/${orderId}/send-kitchen`, {
      items,
    });
  }

  async markItemReady(orderId: number, itemId: number): Promise<void> {
    await apiClient.put(`/api/orders/${orderId}/items/${itemId}/ready`);
  }

  async markItemDelivered(orderId: number, itemId: number): Promise<void> {
    await apiClient.put(`/api/orders/${orderId}/items/${itemId}/delivered`);
  }

  // Tables
  async getTables(): Promise<Table[]> {
    const response = await apiClient.get('/api/tables');
    cacheResponse('/api/tables', response.data);
    return response.data;
  }

  async getTable(id: number): Promise<Table> {
    const response = await apiClient.get(`/api/tables/${id}`);
    return response.data;
  }

  async getAvailableTables(): Promise<Table[]> {
    const response = await apiClient.get('/api/tables/available');
    return response.data;
  }

  async createTable(table: Partial<Table>): Promise<Table> {
    const response = await apiClient.post('/api/tables', table);
    return response.data;
  }

  async updateTable(id: number, table: Partial<Table>): Promise<Table> {
    const response = await apiClient.put(`/api/tables/${id}`, table);
    return response.data;
  }

  async updateTableStatus(id: number, status: string): Promise<void> {
    await apiClient.put(`/api/tables/${id}/status`, {
      status,
    });
  }

  async assignOrderToTable(orderId: number, tableId: number): Promise<void> {
    await apiClient.put(`/api/orders/${orderId}/table`, {
      table_id: tableId,
    });
  }

  async transferTable(fromTableId: number, toTableId: number): Promise<void> {
    await apiClient.post(`/api/tables/${fromTableId}/transfer`, {
      to_table_id: toTableId,
    });
  }

  // Table layout
  async getTableLayout(): Promise<any> {
    const response = await apiClient.get('/api/table-layout');
    return response.data;
  }

  async saveTableLayout(layout: any): Promise<void> {
    await apiClient.put('/api/table-layout', layout);
  }

  // Quick actions
  async printKitchenTicket(orderId: number): Promise<void> {
    await apiClient.post(`/api/orders/${orderId}/print-kitchen`);
  }

  async printOrderReceipt(orderId: number): Promise<void> {
    await apiClient.post(`/api/orders/${orderId}/print-receipt`);
  }

  async duplicateOrder(orderId: number): Promise<Order> {
    const response = await apiClient.post(`/api/orders/${orderId}/duplicate`);
    return response.data;
  }

  // Order history
  async getOrderHistory(customerId?: number, limit: number = 50): Promise<Order[]> {
    const response = await apiClient.get('/api/orders/history', {
      params: {
        customer_id: customerId,
        limit,
      },
    });
    return response.data;
  }

  // Statistics
  async getOrderStats(date?: string): Promise<any> {
    const response = await apiClient.get('/api/orders/stats', {
      params: date ? { date } : {},
    });
    return response.data;
  }

  async getAveragePreparationTime(): Promise<number> {
    const response = await apiClient.get('/api/orders/avg-prep-time');
    return response.data.average_minutes;
  }

  // Queue management

  async reorderKitchenQueue(orderIds: number[]): Promise<void> {
    await apiClient.put('/api/kitchen/queue', {
      order_ids: orderIds,
    });
  }

  // Offline support
  saveOrderOffline(order: Partial<Order>): void {
    const offlineOrders = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
    offlineOrders.push({
      ...order,
      id: `offline_${Date.now()}`,
      created_at: new Date().toISOString(),
      is_synced: false,
    });
    localStorage.setItem('offlineOrders', JSON.stringify(offlineOrders));
  }

  getOfflineOrders(): Order[] {
    const offlineOrders = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
    return offlineOrders;
  }

  clearOfflineOrders(): void {
    localStorage.removeItem('offlineOrders');
  }

  // Table management methods
  async getTableAreas(): Promise<any[]> {
    const response = await apiClient.get('/api/table-areas');
    return response.data;
  }

  async getOrderByTable(tableId: number): Promise<Order | null> {
    try {
      const response = await apiClient.get(`/api/tables/${tableId}/order`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async deleteTable(id: number): Promise<void> {
    await apiClient.delete(`/api/tables/${id}`);
  }
}

export const orderService = new OrderService();
