import {
  CreateOrder,
  GetOrder,
  UpdateOrder,
  GetPendingOrders,
  GetTodayOrders,
  GetOrdersByStatus,
  GetOrdersByTable as GetOrderByTable,
  GetTables,
  CreateTable,
  UpdateTable,
  DeleteTable,
  UpdateTableStatus,
  GetTableAreas,
  CreateTableArea,
  UpdateTableArea,
  DeleteTableArea,
  CancelOrder,
  DeleteOrder,
  SendToKitchen
} from '../../wailsjs/go/services/OrderService';
import { models } from '../../wailsjs/go/models';
import { Order, Table, OrderItem, CreateOrderData } from '../types/models';

// Re-export for external use
export type { CreateOrderData };

// Adapters: Map Wails models -> Frontend models
function mapOrder(w: models.Order): Order {
  return {
    id: w.id as unknown as number,
    order_number: w.order_number || '',
    type: w.type as 'dine_in' | 'takeout' | 'delivery',
    status: w.status as 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'paid',
    takeout_number: (w as any).takeout_number,
    table_id: w.table_id as unknown as number,
    table: w.table ? mapTable(w.table) : undefined,
    customer_id: w.customer_id as unknown as number,
    customer: w.customer ? {
      id: w.customer.id as unknown as number,
      name: w.customer.name || '',
      email: w.customer.email || '',
      phone: w.customer.phone || '',
    } : undefined,
    employee_id: w.employee_id as unknown as number,
    employee: w.employee ? {
      id: w.employee.id as unknown as number,
      name: w.employee.name || '',
      email: w.employee.email || '',
      role: w.employee.role || 'cashier',
    } : undefined,
    items: (w.items || []).map((item) => ({
      id: item.id as unknown as number,
      order_id: item.order_id as unknown as number,
      product_id: item.product_id as unknown as number,
      product: item.product ? {
        id: item.product.id as unknown as number,
        name: item.product.name || '',
        price: item.product.price || 0,
        category_id: item.product.category_id as unknown as number,
      } : undefined,
      quantity: item.quantity || 0,
      unit_price: item.unit_price || 0,
      price: item.unit_price || 0,
      subtotal: item.subtotal || 0,
      notes: item.notes || '',
      status: item.status as 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled',
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString(),
    })),
    subtotal: w.subtotal || 0,
    tax: w.tax || 0,
    discount: w.discount || 0,
    total: w.total || 0,
    notes: w.notes || '',
    source: w.source || 'pos',
    is_synced: w.is_synced || false,
    created_at: w.created_at || new Date().toISOString(),
    updated_at: w.updated_at || new Date().toISOString(),
  } as Order;
}

function mapTable(w: models.Table): Table {
  return {
    id: w.id as unknown as number,
    number: w.number || '',
    name: w.name || '',
    capacity: w.capacity || 0,
    zone: w.zone || 'interior',
    status: w.status as 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked',
    position_x: w.position_x || 0,
    position_y: w.position_y || 0,
    shape: w.shape || 'square',
    is_active: (w as any).is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Table;
}

function mapOrderItem(w: models.OrderItem): OrderItem {
  return {
    id: w.id as unknown as number,
    order_id: w.order_id as unknown as number,
    product_id: w.product_id as unknown as number,
    quantity: w.quantity || 0,
    unit_price: (w as any).price || 0,
    price: (w as any).price || 0,
    subtotal: ((w as any).price || 0) * (w.quantity || 0),
    notes: w.notes || '',
    status: w.status as 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as OrderItem;
}

class WailsOrderService {
  // Orders
  async createOrder(orderData: CreateOrderData): Promise<Order> {
    try {
      const order = await CreateOrder(orderData as any);
      return mapOrder(order as any);
    } catch (error) {
      console.error('Error creating order:', error);
      throw new Error('Error al crear orden');
    }
  }

  async getOrder(id: number): Promise<Order> {
    try {
      const order = await GetOrder(id);
      return mapOrder(order);
    } catch (error) {
      console.error('Error getting order:', error);
      throw new Error('Error al obtener orden');
    }
  }

  async updateOrder(id: number, orderData: CreateOrderData): Promise<Order> {
    try {
      // Add the ID to the order data for update
      const orderWithId = {
        ...orderData,
        id: id
      };
      const order = await UpdateOrder(orderWithId as any);
      return mapOrder(order as any);
    } catch (error) {
      console.error('Error updating order:', error);
      throw new Error('Error al actualizar orden');
    }
  }

  async deleteOrder(id: number): Promise<void> {
    try {
      await DeleteOrder(id);
    } catch (error) {
      console.error('Error deleting order:', error);
      throw new Error('Error al eliminar orden');
    }
  }

  async cancelOrder(id: number, reason: string): Promise<void> {
    try {
      await CancelOrder(id, reason);
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw new Error('Error al cancelar orden');
    }
  }

  async getOrders(): Promise<Order[]> {
    try {
      const orders = await GetPendingOrders();
      return orders.map(mapOrder);
    } catch (error) {
      console.error('Error getting orders:', error);
      throw new Error('Error al obtener órdenes');
    }
  }

  async getOrderByTable(tableId: number): Promise<Order | null> {
    try {
      const orders = await GetOrderByTable(tableId);
      return orders.length > 0 ? mapOrder(orders[0]) : null;
    } catch (error) {
      console.error('Error getting order by table:', error);
      return null;
    }
  }

  // Tables
  async getTables(): Promise<Table[]> {
    try {
      const tables = await GetTables();
      return tables.map(mapTable);
    } catch (error) {
      console.error('Error getting tables:', error);
      throw new Error('Error al obtener mesas');
    }
  }

  async createTable(table: Partial<Table>): Promise<void> {
    try {
      await CreateTable(table as any);
    } catch (error) {
      console.error('Error creating table:', error);
      throw new Error('Error al crear mesa');
    }
  }

  async updateTable(id: number, table: Partial<Table>): Promise<Table> {
    try {
      const updated = await UpdateTable(table as any);
      return mapTable(updated as any);
    } catch (error) {
      console.error('Error updating table:', error);
      throw new Error('Error al actualizar mesa');
    }
  }

  async deleteTable(id: number): Promise<void> {
    try {
      await DeleteTable(id);
    } catch (error) {
      console.error('Error deleting table:', error);
      throw new Error('Error al eliminar mesa');
    }
  }

  async updateTableStatus(tableId: number, status: string): Promise<void> {
    try {
      await UpdateTableStatus(tableId, status);
    } catch (error) {
      console.error('Error updating table status:', error);
      throw new Error('Error al actualizar estado de mesa');
    }
  }

  async getTableAreas(): Promise<any[]> {
    try {
      const areas = await GetTableAreas();
      return areas || [];
    } catch (error) {
      console.error('Error getting table areas:', error);
      throw new Error('Error al obtener áreas de mesas');
    }
  }

  async createTableArea(area: any): Promise<any> {
    try {
      return await CreateTableArea(area);
    } catch (error) {
      console.error('Error creating table area:', error);
      throw new Error('Error al crear área de mesas');
    }
  }

  async updateTableArea(area: any): Promise<any> {
    try {
      return await UpdateTableArea(area);
    } catch (error) {
      console.error('Error updating table area:', error);
      throw new Error('Error al actualizar área de mesas');
    }
  }

  async deleteTableArea(id: number): Promise<void> {
    try {
      await DeleteTableArea(id);
    } catch (error) {
      console.error('Error deleting table area:', error);
      throw new Error('Error al eliminar área de mesas');
    }
  }

  // Additional methods for Redux slices
  async getTodayOrders(): Promise<Order[]> {
    try {
      const orders = await GetTodayOrders();
      return orders.map(mapOrder);
    } catch (error) {
      console.error('Error getting today orders:', error);
      throw new Error('Error al obtener órdenes del día');
    }
  }

  async getPendingOrders(): Promise<Order[]> {
    try {
      const orders = await GetPendingOrders();
      return orders.map(mapOrder);
    } catch (error) {
      console.error('Error getting pending orders:', error);
      throw new Error('Error al obtener órdenes pendientes');
    }
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    try {
      const orders = await GetOrdersByStatus(status);
      return orders.map(mapOrder);
    } catch (error) {
      console.error('Error getting orders by status:', error);
      throw new Error('Error al obtener órdenes por estado');
    }
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    try {
      const order = await GetOrder(id);
      const updatedOrder = { ...order, status };
      return mapOrder(updatedOrder as any);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw new Error('Error al actualizar estado de orden');
    }
  }

  async sendToKitchen(orderId: number): Promise<void> {
    try {
      await SendToKitchen(orderId);
    } catch (error) {
      console.error('Error sending order to kitchen:', error);
      throw new Error('Error al enviar orden a cocina');
    }
  }
}

export const wailsOrderService = new WailsOrderService();
