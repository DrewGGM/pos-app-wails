import {
  ProcessSale,
  GetSale,
  GetTodaySales as GetSales,
  GetPaymentMethods,
  GetCustomers,
  GetCustomerStats,
  ResendElectronicInvoice,
  ConvertToElectronicInvoice,
  GetSalesHistory,
  CreateCustomer,
  UpdateCustomer,
  DeleteCustomer,
  GetCustomer,
  CreatePaymentMethod,
  UpdatePaymentMethod,
  DeletePaymentMethod,
  RefundSale,
  DeleteSale,
  GetSalesReport,
  PrintReceipt,
  GetDIANClosingReport,
  PrintDIANClosingReport
} from '../../wailsjs/go/services/SalesService';
import { models } from '../../wailsjs/go/models';
import { Sale, Customer, PaymentMethod, ProcessSaleData } from '../types/models';

// DIAN Closing Report Types
export interface CategorySalesDetail {
  category_id: number;
  category_name: string;
  quantity: number;
  subtotal: number;
  tax: number;
  total: number;
}

export interface TaxBreakdownDetail {
  tax_type_id: number;
  tax_type_name: string;
  tax_percent: number;
  base_amount: number;
  tax_amount: number;
  total: number;
  item_count: number;
}

export interface NoteDetail {
  number: string;
  prefix: string;
  reason: string;
  amount: number;
  status: string;
  created_at: string;
}

export interface PaymentMethodSummary {
  method_id: number;
  method_name: string;
  method_type: string;
  transactions: number;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface DIANClosingReport {
  // Business Info
  business_name: string;
  commercial_name: string;
  nit: string;
  dv: string;
  regime: string;
  liability: string;
  address: string;
  city: string;
  department: string;
  phone: string;
  email: string;
  resolution: string;
  resolution_prefix: string;
  resolution_from: number;
  resolution_to: number;
  resolution_date_from: string;
  resolution_date_to: string;

  // Report Info
  report_date: string;
  generated_at: string;

  // Invoice Range
  first_invoice_number: string;
  last_invoice_number: string;
  total_invoices: number;

  // Sales by Category
  sales_by_category: CategorySalesDetail[];

  // Sales by Tax Type
  sales_by_tax: TaxBreakdownDetail[];

  // Adjustments (Credit/Debit Notes)
  credit_notes: NoteDetail[];
  debit_notes: NoteDetail[];
  total_credit_notes: number;
  total_debit_notes: number;

  // Payment Methods
  payment_methods: PaymentMethodSummary[];

  // Totals
  total_transactions: number;
  total_subtotal: number;
  total_tax: number;
  total_discount: number;
  total_sales: number;
  total_adjustments: number;
  grand_total: number;
}

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
        } : undefined,
        quantity: item.quantity || 0,
        unit_price: item.unit_price || 0,
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
        status: item.status || 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
        icon: payment.payment_method.icon || '',
        requires_ref: payment.payment_method.requires_ref || false,
        requires_reference: payment.payment_method.requires_ref || false,
        requires_voucher: payment.payment_method.requires_voucher || false,
        dian_payment_method_id: (payment.payment_method as any).dian_payment_method_id,
        affects_cash_register: (payment.payment_method as any).affects_cash_register !== false, // Default to true if undefined
        show_in_cash_summary: (payment.payment_method as any).show_in_cash_summary !== false, // Default to true if undefined
        is_active: payment.payment_method.is_active || false,
        display_order: payment.payment_method.display_order || 0,
      } : undefined,
      amount: payment.amount || 0,
      reference: payment.reference || '',
      voucher_image: (payment as any).voucher_image || '',
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
    needs_electronic_invoice: w.needs_electronic_invoice || false,
    electronic_invoice: w.electronic_invoice ? {
      id: w.electronic_invoice.id as unknown as number,
      sale_id: w.electronic_invoice.sale_id as unknown as number,
      prefix: w.electronic_invoice.prefix || '',
      invoice_number: w.electronic_invoice.invoice_number || '',
      uuid: w.electronic_invoice.uuid || '',
      cufe: w.electronic_invoice.cufe || '',
      qr_code: w.electronic_invoice.qr_code || '',
      status: w.electronic_invoice.status as 'pending' | 'sent' | 'accepted' | 'rejected' | 'error',
      dian_response: w.electronic_invoice.dian_response || '',
      request_data: (w.electronic_invoice as any).request_data || '',
      sent_at: w.electronic_invoice.sent_at ? new Date(w.electronic_invoice.sent_at as any).toISOString() : undefined,
      accepted_at: w.electronic_invoice.accepted_at ? new Date(w.electronic_invoice.accepted_at as any).toISOString() : undefined,
      retry_count: w.electronic_invoice.retry_count || 0,
      last_error: w.electronic_invoice.last_error || '',
    } : undefined,
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
    // DIAN corporate fields (optional, only for NIT)
    type_regime_id: w.type_regime_id || undefined,
    type_liability_id: w.type_liability_id || undefined,
    municipality_id: w.municipality_id || undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Customer;
}

function mapPaymentMethod(w: models.PaymentMethod): PaymentMethod {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    type: w.type as 'cash' | 'digital' | 'card' | 'check' | 'other',
    icon: w.icon || '',
    requires_ref: w.requires_ref || false,
    requires_reference: w.requires_ref || false,
    requires_voucher: w.requires_voucher || false,
    dian_payment_method_id: (w as any).dian_payment_method_id,
    affects_cash_register: (w as any).affects_cash_register !== false, // Default to true
    show_in_cash_summary: (w as any).show_in_cash_summary !== false, // Default to true
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
      // Validate required fields
      if (!saleData.order_id) {
        throw new Error('Order ID is required');
      }
      if (!saleData.employee_id) {
        throw new Error('Employee ID is required');
      }
      if (!saleData.payment_methods || saleData.payment_methods.length === 0) {
        throw new Error('At least one payment method is required');
      }

      // Get customer data if customer_id is provided
      let customerData = null;
      if (saleData.customer_id) {
        try {
          const customer = await GetCustomer(saleData.customer_id);
          customerData = customer as any;
        } catch (err) {
          // Could not fetch customer data
        }
      }

      const sale = await ProcessSale(
        saleData.order_id,
        saleData.payment_methods as any,
        customerData, // Pass actual customer data or null
        saleData.needs_electronic_invoice || false, // Use the actual flag from saleData
        saleData.send_email_to_customer || false, // Send invoice PDF to customer email
        saleData.employee_id,
        saleData.cash_register_id || 0, // Pass 0 if no cash register (will skip cash movement recording)
        saleData.print_receipt !== undefined ? saleData.print_receipt : true // Default to true if not provided
      );
      return mapSale(sale);
    } catch (error: any) {
      const errorMessage = error?.message || 'Error al procesar venta';
      throw new Error(errorMessage);
    }
  }

  async getSale(id: number): Promise<Sale> {
    try {
      const sale = await GetSale(id);
      return mapSale(sale);
    } catch (error) {
      throw new Error('Error al obtener venta');
    }
  }

  async getSales(): Promise<Sale[]> {
    try {
      const sales = await GetSales();
      return sales.map(mapSale);
    } catch (error) {
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
      throw new Error('Error al obtener historial de ventas');
    }
  }

  async resendElectronicInvoice(saleId: number): Promise<void> {
    try {
      await ResendElectronicInvoice(saleId);
    } catch (error) {
      throw new Error('Error al reenviar factura electrónica');
    }
  }

  async convertToElectronicInvoice(saleId: number): Promise<void> {
    try {
      await ConvertToElectronicInvoice(saleId);
    } catch (error) {
      throw new Error('Error al convertir a factura electrónica');
    }
  }

  async getSalesReport(startDate?: string, endDate?: string): Promise<any> {
    try {
      if (!areBindingsReady()) {
        return { sales: [], total_sales: 0, count: 0 };
      }
      return await GetSalesReport(startDate || '', endDate || '');
    } catch (error) {
      return { sales: [], total_sales: 0, count: 0 };
    }
  }

  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      if (!areBindingsReady()) {
        return [];
      }
      const methods = await GetPaymentMethods();
      return methods.map(mapPaymentMethod);
    } catch (error) {
      return [];
    }
  }

  async CreatePaymentMethod(method: PaymentMethod): Promise<void> {
    try {
      await CreatePaymentMethod(method as any);
    } catch (error) {
      throw error;
    }
  }

  async UpdatePaymentMethod(method: PaymentMethod): Promise<void> {
    try {
      await UpdatePaymentMethod(method as any);
    } catch (error) {
      throw error;
    }
  }

  async DeletePaymentMethod(id: number): Promise<void> {
    try {
      await DeletePaymentMethod(id);
    } catch (error) {
      throw error;
    }
  }

  async GetPaymentMethods(): Promise<PaymentMethod[]> {
    return this.getPaymentMethods();
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    try {
      if (!areBindingsReady()) {
        return [];
      }
      const customers = await GetCustomers();
      return customers.map(mapCustomer);
    } catch (error) {
      return [];
    }
  }

  async getCustomer(id: number): Promise<Customer> {
    try {
      const customer = await GetCustomer(id);
      return mapCustomer(customer);
    } catch (error) {
      throw new Error('Error al obtener cliente');
    }
  }

  async createCustomer(customer: Partial<Customer>): Promise<void> {
    try {
      await CreateCustomer(customer as any);
    } catch (error) {
      throw new Error('Error al crear cliente');
    }
  }

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<void> {
    try {
      await UpdateCustomer(customer as any);
    } catch (error) {
      throw new Error('Error al actualizar cliente');
    }
  }

  async deleteCustomer(id: number): Promise<void> {
    try {
      await DeleteCustomer(id);
    } catch (error) {
      throw new Error('Error al eliminar cliente');
    }
  }

  // Get aggregated customer statistics (optimized - uses SQL aggregation)
  async getCustomerStats(onlyElectronic: boolean = false): Promise<{
    total_customers: number;
    total_purchases: number;
    total_spent: number;
    top_customers: Array<{ id: number; name: string; total_spent: number }>;
  }> {
    try {
      const stats = await GetCustomerStats(onlyElectronic);
      return {
        total_customers: (stats as any).total_customers || 0,
        total_purchases: (stats as any).total_purchases || 0,
        total_spent: (stats as any).total_spent || 0,
        top_customers: ((stats as any).top_customers || []).map((c: any) => ({
          id: c.id || 0,
          name: c.name || '',
          total_spent: c.total_spent || 0,
        })),
      };
    } catch (error) {
      return { total_customers: 0, total_purchases: 0, total_spent: 0, top_customers: [] };
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
      // Printing is handled by the backend after sale completion
      await PrintReceipt(saleId);
    } catch (error) {
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
      throw new Error('Error al obtener ventas del día');
    }
  }


  async refundSale(saleId: number, amount: number, reason: string, employeeId: number): Promise<void> {
    try {
      await RefundSale(saleId, amount, reason, employeeId);
    } catch (error) {
      throw new Error('Error al reembolsar venta');
    }
  }

  async deleteSale(saleId: number, employeeId: number): Promise<void> {
    try {
      await DeleteSale(saleId, employeeId);
    } catch (error) {
      throw new Error('Error al eliminar venta');
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
      throw new Error('Error al buscar clientes');
    }
  }

  async sendElectronicInvoice(saleId: number): Promise<void> {
    try {
      await ResendElectronicInvoice(saleId);
    } catch (error: any) {
      throw new Error(error?.message || 'Error al enviar factura electrónica a DIAN');
    }
  }

  // DIAN Closing Report Methods
  async getDIANClosingReport(date: string, period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' = 'daily', endDate?: string): Promise<DIANClosingReport> {
    try {
      const windowGo = (window as any).go;

      // Handle custom period with date range
      if (period === 'custom' && endDate && windowGo?.services?.SalesService?.GetDIANClosingReportCustomRange) {
        const report = await windowGo.services.SalesService.GetDIANClosingReportCustomRange(date, endDate);
        return report as unknown as DIANClosingReport;
      }

      // Try to use the new method with period if available, fallback to old method
      if (windowGo?.services?.SalesService?.GetDIANClosingReportWithPeriod) {
        const report = await windowGo.services.SalesService.GetDIANClosingReportWithPeriod(date, period);
        return report as unknown as DIANClosingReport;
      } else {
        // Fallback to old method (only daily)
        const report = await GetDIANClosingReport(date);
        return report as unknown as DIANClosingReport;
      }
    } catch (error: any) {
      throw new Error(error?.message || 'Error al generar reporte de cierre DIAN');
    }
  }

  async printDIANClosingReport(date: string, period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' = 'daily', endDate?: string): Promise<void> {
    try {
      const windowGo = (window as any).go;

      // Handle custom period with date range
      if (period === 'custom' && endDate && windowGo?.services?.SalesService?.PrintDIANClosingReportCustomRange) {
        await windowGo.services.SalesService.PrintDIANClosingReportCustomRange(date, endDate);
        return;
      }

      // Try to use the new method with period if available, fallback to old method
      if (windowGo?.services?.SalesService?.PrintDIANClosingReportWithPeriod) {
        await windowGo.services.SalesService.PrintDIANClosingReportWithPeriod(date, period);
      } else {
        // Fallback to old method (only daily)
        await PrintDIANClosingReport(date);
      }
    } catch (error: any) {
      throw new Error(error?.message || 'Error al imprimir reporte de cierre DIAN');
    }
  }
}

export const wailsSalesService = new WailsSalesService();
