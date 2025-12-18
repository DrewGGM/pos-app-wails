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
function mapOrder(w: models.Order | null): Order {
  if (!w) {
    throw new Error('Order is null or undefined');
  }
  return {
    id: w.id as unknown as number,
    order_number: w.order_number || '',
    type: w.type as 'dine_in' | 'takeout' | 'delivery',
    order_type_id: w.order_type_id as unknown as number | undefined,
    order_type: w.order_type ? {
      id: w.order_type.id as unknown as number,
      code: w.order_type.code || '',
      name: w.order_type.name || '',
      requires_sequential_number: w.order_type.requires_sequential_number || false,
      sequence_prefix: w.order_type.sequence_prefix || undefined,
      display_color: w.order_type.display_color || '#000000',
      icon: w.order_type.icon || '',
      is_active: w.order_type.is_active !== false,
      display_order: w.order_type.display_order || 0,
    } : undefined,
    sequence_number: (w as any).sequence_number,
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
      modifiers: (item.modifiers || []).map((mod) => ({
        id: mod.id as unknown as number,
        order_item_id: mod.order_item_id as unknown as number,
        modifier_id: mod.modifier_id as unknown as number,
        modifier: mod.modifier ? {
          id: mod.modifier.id as unknown as number,
          name: mod.modifier.name || '',
          price_change: mod.modifier.price_change || 0,
        } : undefined,
        price_change: mod.price_change || 0,
      })),
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
    delivery_customer_name: (w as any).delivery_customer_name || undefined,
    delivery_address: (w as any).delivery_address || undefined,
    delivery_phone: (w as any).delivery_phone || undefined,
    created_at: w.created_at || new Date().toISOString(),
    updated_at: w.updated_at || new Date().toISOString(),
  } as Order;
}

function mapTable(w: models.Table): Table {
  const currentOrder = (w as any).current_order;
  return {
    id: w.id as unknown as number,
    number: w.number || '',
    name: w.name || '',
    capacity: w.capacity || 0,
    zone: w.zone || 'interior',
    area_id: (w as any).area_id as number | undefined,
    area: (w as any).area ? {
      id: (w as any).area.id as number,
      name: (w as any).area.name || '',
      description: (w as any).area.description || '',
      color: (w as any).area.color || '#1976d2',
      is_active: (w as any).area.is_active ?? true,
    } : undefined,
    status: w.status as 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked',
    position_x: w.position_x || 0,
    position_y: w.position_y || 0,
    shape: (w.shape || 'square') as 'square' | 'round' | 'rectangle',
    is_active: (w as any).is_active ?? true,
    current_order: currentOrder ? {
      id: currentOrder.id as number,
      order_number: currentOrder.order_number || '',
      total: currentOrder.total || 0,
      subtotal: currentOrder.subtotal || 0,
      status: currentOrder.status || 'pending',
    } : undefined,
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
      throw new Error('Error al crear orden');
    }
  }

  async getOrder(id: number): Promise<Order> {
    try {
      const order = await GetOrder(id);
      return mapOrder(order);
    } catch (error) {
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
      throw new Error('Error al actualizar orden');
    }
  }

  async deleteOrder(id: number): Promise<void> {
    try {
      await DeleteOrder(id);
    } catch (error) {
      throw new Error('Error al eliminar orden');
    }
  }

  async cancelOrder(id: number, reason: string): Promise<void> {
    try {
      await CancelOrder(id, reason);
    } catch (error) {
      throw new Error('Error al cancelar orden');
    }
  }

  async getOrders(): Promise<Order[]> {
    try {
      const orders = await GetPendingOrders();
      return orders.map(mapOrder);
    } catch (error) {
      throw new Error('Error al obtener órdenes');
    }
  }

  async getOrderByTable(tableId: number): Promise<Order | null> {
    try {
      const orders = await GetOrderByTable(tableId);
      return orders.length > 0 ? mapOrder(orders[0]) : null;
    } catch (error) {
      return null;
    }
  }

  // Tables
  async getTables(): Promise<Table[]> {
    try {
      const tables = await GetTables();
      return tables.map(mapTable);
    } catch (error) {
      throw new Error('Error al obtener mesas');
    }
  }

  async createTable(table: Partial<Table>): Promise<void> {
    try {
      await CreateTable(table as any);
    } catch (error) {
      throw new Error('Error al crear mesa');
    }
  }

  async updateTable(id: number, table: Partial<Table>): Promise<Table> {
    try {
      const updated = await UpdateTable(table as any);
      return mapTable(updated as any);
    } catch (error) {
      throw new Error('Error al actualizar mesa');
    }
  }

  async deleteTable(id: number): Promise<void> {
    try {
      await DeleteTable(id);
    } catch (error: any) {
      throw new Error(error?.message || 'Error al eliminar mesa');
    }
  }

  async updateTableStatus(tableId: number, status: string): Promise<void> {
    try {
      await UpdateTableStatus(tableId, status);
    } catch (error) {
      throw new Error('Error al actualizar estado de mesa');
    }
  }

  async getTableAreas(): Promise<any[]> {
    try {
      const areas = await GetTableAreas();
      return areas || [];
    } catch (error) {
      throw new Error('Error al obtener áreas de mesas');
    }
  }

  async createTableArea(area: any): Promise<any> {
    try {
      return await CreateTableArea(area);
    } catch (error) {
      throw new Error('Error al crear área de mesas');
    }
  }

  async updateTableArea(area: any): Promise<any> {
    try {
      return await UpdateTableArea(area);
    } catch (error) {
      throw new Error('Error al actualizar área de mesas');
    }
  }

  async deleteTableArea(id: number): Promise<void> {
    try {
      await DeleteTableArea(id);
    } catch (error) {
      throw new Error('Error al eliminar área de mesas');
    }
  }

  // Additional methods for Redux slices
  async getTodayOrders(): Promise<Order[]> {
    try {
      const orders = await GetTodayOrders();
      return orders.map(mapOrder);
    } catch (error) {
      throw new Error('Error al obtener órdenes del día');
    }
  }

  async getPendingOrders(): Promise<Order[]> {
    try {
      const orders = await GetPendingOrders();
      return orders.map(mapOrder);
    } catch (error) {
      throw new Error('Error al obtener órdenes pendientes');
    }
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    try {
      const orders = await GetOrdersByStatus(status);
      return orders.map(mapOrder);
    } catch (error) {
      throw new Error('Error al obtener órdenes por estado');
    }
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    try {
      const order = await GetOrder(id);
      const updatedOrder = { ...order, status };
      return mapOrder(updatedOrder as any);
    } catch (error) {
      throw new Error('Error al actualizar estado de orden');
    }
  }

  async sendToKitchen(orderId: number): Promise<void> {
    try {
      await SendToKitchen(orderId);
    } catch (error) {
      throw new Error('Error al enviar orden a cocina');
    }
  }
}

export const wailsOrderService = new WailsOrderService();
