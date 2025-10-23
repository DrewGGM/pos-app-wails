import {
  ProcessSale,
  GetSale,
  GetTodaySales as GetSales,
  GetPaymentMethods,
  GetCustomers,
  ResendElectronicInvoice,
  GetSalesHistory,
  CreateCustomer,
  UpdateCustomer,
  DeleteCustomer,
  GetCustomer,
  CreatePaymentMethod,
  UpdatePaymentMethod,
  DeletePaymentMethod,
  RefundSale,
  GetSalesReport,
  PrintReceipt
} from '../../wailsjs/go/services/SalesService';
import { models } from '../../wailsjs/go/models';
import { Sale, Customer, PaymentMethod, ProcessSaleData } from '../types/models';

// Helper to check if Wails bindings are ready
function areBindingsReady(): boolean {
  return typeof (window as any).go !== 'undefined';
}

// Adapters: Map Wails models -> Frontend models
function mapSale(w: models.Sale): Sale {
  return {
    id: w.id as unknown as number,
    sale_number: w.sale_number || '',
    order_id: w.order_id as unknown as number,
    order: w.order ? {
      id: w.order.id as unknown as number,
      order_number: w.order.order_number || '',
      type: w.order.type as 'dine_in' | 'takeout' | 'delivery',
      status: w.order.status as 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'paid',
      items: (w.order.items || []).map((item) => ({
        id: item.id as unknown as number,
        order_id: item.order_id as unknown as number,
        product_id: item.product_id as unknown as number,
        product: item.product ? {
          id: item.product.id as unknown as number,
          name: item.product.name || '',
          price: item.product.price || 0,
          sku: item.product.sku || '',
        } : undefined,
        quantity: item.quantity || 0,
        unit_price: item.unit_price || 0,
        subtotal: item.subtotal || 0,
        notes: item.notes || '',
      })),
      subtotal: w.order.subtotal || 0,
      tax: w.order.tax || 0,
      total: w.order.total || 0,
    } : undefined,
    customer_id: w.customer_id as unknown as number,
    customer: w.customer ? {
      id: w.customer.id as unknown as number,
      name: w.customer.name || '',
      email: w.customer.email || '',
      phone: w.customer.phone || '',
      identification_type: w.customer.identification_type || '',
      identification_number: w.customer.identification_number || '',
    } : undefined,
    employee_id: w.employee_id as unknown as number,
    employee: w.employee ? {
      id: w.employee.id as unknown as number,
      name: w.employee.name || '',
      email: w.employee.email || '',
    } : undefined,
    payment_details: (w.payment_details || []).map((payment) => ({
      id: payment.id as unknown as number,
      sale_id: payment.sale_id as unknown as number,
      payment_method_id: payment.payment_method_id as unknown as number,
      payment_method: payment.payment_method ? {
        id: payment.payment_method.id as unknown as number,
        name: payment.payment_method.name || '',
        type: payment.payment_method.type as 'cash' | 'digital' | 'card' | 'check',
      } : undefined,
      amount: payment.amount || 0,
      reference: payment.reference || '',
    })),
    subtotal: w.subtotal || 0,
    tax: w.tax || 0,
    discount: w.discount || 0,
    total: w.total || 0,
    amount_paid: (w as any).amount_paid || 0,
    change: (w as any).change || 0,
    payment_method: w.payment_method || '',
    status: w.status as 'completed' | 'refunded' | 'partial_refund',
    invoice_type: w.invoice_type || 'none',
    cash_register_id: w.cash_register_id as unknown as number,
    notes: w.notes || '',
    is_synced: w.is_synced || false,
    created_at: w.created_at ? new Date(w.created_at as any).toISOString() : new Date().toISOString(),
    updated_at: w.updated_at ? new Date(w.updated_at as any).toISOString() : new Date().toISOString(),
  } as Sale;
}

function mapCustomer(w: models.Customer): Customer {
  return {
    id: w.id as unknown as number,
    identification_type: w.identification_type || '',
    identification_number: w.identification_number || '',
    document_type: w.identification_type, // Alias
    document_number: w.identification_number, // Alias
    dv: w.dv || '',
    name: w.name || '',
    email: w.email || '',
    phone: w.phone || '',
    address: w.address || '',
    city: (w as any).city || '',
    is_active: (w as any).is_active ?? true,
    notes: (w as any).notes || '',
    total_spent: (w as any).total_spent || 0,
    total_purchases: (w as any).total_purchases || 0,
    loyalty_points: (w as any).loyalty_points || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Customer;
}

function mapPaymentMethod(w: models.PaymentMethod): PaymentMethod {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    type: w.type as 'cash' | 'digital' | 'card' | 'check',
    icon: w.icon || '',
    requires_ref: w.requires_ref || false,
    requires_reference: w.requires_ref || false,
    code: (w as any).code || '',
    is_active: w.is_active || false,
    display_order: w.display_order || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as PaymentMethod;
}

class WailsSalesService {
  // Sales
  async processSale(saleData: ProcessSaleData): Promise<Sale> {
    try {
      const sale = await ProcessSale(
        saleData.order_id,
        saleData.payment_methods as any,
        {} as any, // customer
        false, // needs_electronic_invoice
        saleData.employee_id,
        saleData.cash_register_id
      );
      return mapSale(sale);
    } catch (error) {
      console.error('Error processing sale:', error);
      throw new Error('Error al procesar venta');
    }
  }

  async getSale(id: number): Promise<Sale> {
    try {
      const sale = await GetSale(id);
      return mapSale(sale);
    } catch (error) {
      console.error('Error getting sale:', error);
      throw new Error('Error al obtener venta');
    }
  }

  async getSales(): Promise<Sale[]> {
    try {
      const sales = await GetSales();
      return sales.map(mapSale);
    } catch (error) {
      console.error('Error getting sales:', error);
      throw new Error('Error al obtener ventas');
    }
  }

  async getSalesHistory(limit: number = 100, offset: number = 0): Promise<{ sales: Sale[]; total: number }> {
    try {
      const result = await GetSalesHistory(limit, offset);
      const sales = (result as any).sales?.map(mapSale) || [];
      const total = (result as any).total || 0;
      return { sales, total };
    } catch (error) {
      console.error('Error getting sales history:', error);
      throw new Error('Error al obtener historial de ventas');
    }
  }

  async resendElectronicInvoice(saleId: number): Promise<void> {
    try {
      await ResendElectronicInvoice(saleId);
    } catch (error) {
      console.error('Error resending electronic invoice:', error);
      throw new Error('Error al reenviar factura electrónica');
    }
  }

  async getSalesReport(startDate?: string, endDate?: string): Promise<any> {
    try {
      if (!areBindingsReady()) {
        console.warn('[wailsSalesService] Bindings not ready for getSalesReport');
        return { sales: [], total_sales: 0, count: 0 };
      }
      return await GetSalesReport(startDate || '', endDate || '');
    } catch (error) {
      console.error('Error getting sales report:', error);
      return { sales: [], total_sales: 0, count: 0 };
    }
  }

  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      if (!areBindingsReady()) {
        console.warn('[wailsSalesService] Wails bindings not ready, returning empty array');
        return [];
      }
      const methods = await GetPaymentMethods();
      return methods.map(mapPaymentMethod);
    } catch (error) {
      console.error('Error getting payment methods:', error);
      return [];
    }
  }

  async createPaymentMethod(method: Partial<PaymentMethod>): Promise<void> {
    try {
      await CreatePaymentMethod(method as any);
    } catch (error) {
      console.error('Error creating payment method:', error);
      throw new Error('Error al crear método de pago');
    }
  }

  async updatePaymentMethod(id: number, method: Partial<PaymentMethod>): Promise<void> {
    try {
      await UpdatePaymentMethod(method as any);
    } catch (error) {
      console.error('Error updating payment method:', error);
      throw new Error('Error al actualizar método de pago');
    }
  }

  async deletePaymentMethod(id: number): Promise<void> {
    try {
      await DeletePaymentMethod(id);
    } catch (error) {
      console.error('Error deleting payment method:', error);
      throw new Error('Error al eliminar método de pago');
    }
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    try {
      if (!areBindingsReady()) {
        console.warn('[wailsSalesService] Bindings not ready');
        return [];
      }
      const customers = await GetCustomers();
      return customers.map(mapCustomer);
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  }

  async getCustomer(id: number): Promise<Customer> {
    try {
      const customer = await GetCustomer(id);
      return mapCustomer(customer);
    } catch (error) {
      console.error('Error getting customer:', error);
      throw new Error('Error al obtener cliente');
    }
  }

  async createCustomer(customer: Partial<Customer>): Promise<void> {
    try {
      await CreateCustomer(customer as any);
    } catch (error) {
      console.error('Error creating customer:', error);
      throw new Error('Error al crear cliente');
    }
  }

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<void> {
    try {
      await UpdateCustomer(customer as any);
    } catch (error) {
      console.error('Error updating customer:', error);
      throw new Error('Error al actualizar cliente');
    }
  }

  async deleteCustomer(id: number): Promise<void> {
    try {
      await DeleteCustomer(id);
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw new Error('Error al eliminar cliente');
    }
  }

  // Utility methods
  calculateSubtotal(items: any[]): number {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  calculateTax(subtotal: number, taxRate: number = 0.19): number {
    return subtotal * taxRate;
  }

  calculateTotal(subtotal: number, tax: number, discount: number = 0): number {
    return subtotal + tax - discount;
  }

  calculateChange(total: number, paid: number): number {
    return paid - total;
  }

  // Additional methods that might be needed
  async printReceipt(saleId: number): Promise<void> {
    await PrintReceipt(saleId);
  }

  async printInvoice(saleId: number): Promise<void> {
    try {
      // This would need to be implemented in the Go service
      console.log('Print invoice for sale:', saleId);
    } catch (error) {
      console.error('Error printing invoice:', error);
      throw new Error('Error al imprimir factura');
    }
  }

  async exportSalesReport(startDate?: Date, endDate?: Date): Promise<Blob> {
    try {
      // This would need to be implemented in the Go service
      const report = await this.getSalesReport(
        startDate?.toISOString(),
        endDate?.toISOString()
      );
      // Convert to blob (this is a simplified implementation)
      return new Blob([JSON.stringify(report)], { type: 'application/json' });
    } catch (error) {
      console.error('Error exporting sales report:', error);
      throw new Error('Error al exportar reporte de ventas');
    }
  }

  // Additional methods for Redux slices
  async getTodaySales(): Promise<Sale[]> {
    try {
      const sales = await GetSales();
      const today = new Date().toISOString().split('T')[0];
      return sales
        .map(mapSale)
        .filter(sale => sale.created_at?.startsWith(today));
    } catch (error) {
      console.error('Error getting today sales:', error);
      throw new Error('Error al obtener ventas del día');
    }
  }


  async refundSale(saleId: number, amount: number, reason: string, employeeId: number): Promise<void> {
    try {
      await RefundSale(saleId, amount, reason, employeeId);
    } catch (error) {
      console.error('Error refunding sale:', error);
      throw new Error('Error al reembolsar venta');
    }
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    try {
      const customers = await GetCustomers();
      return customers
        .map(mapCustomer)
        .filter(customer => 
          customer.name.toLowerCase().includes(query.toLowerCase()) ||
          customer.identification_number.includes(query) ||
          customer.email?.toLowerCase().includes(query.toLowerCase())
        );
    } catch (error) {
      console.error('Error searching customers:', error);
      throw new Error('Error al buscar clientes');
    }
  }
}

export const wailsSalesService = new WailsSalesService();
