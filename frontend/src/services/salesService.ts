import apiClient from './apiClient';
import { Sale, Customer, PaymentMethod } from '../types/models';

interface ProcessSaleData {
  order_id: number;
  payment_data: PaymentData[];
  customer?: Customer | null;
  needs_electronic_invoice: boolean;
  send_email_to_customer?: boolean;
  employee_id: number;
  cash_register_id: number;
}

interface PaymentData {
  payment_method_id: number;
  amount: number;
  reference?: string;
}

interface SalesReport {
  total_sales: number;
  total_tax: number;
  total_discounts: number;
  number_of_sales: number;
  average_sale: number;
  payment_breakdown: Record<string, number>;
  top_products: any[];
  hourly_sales: any[];
  daily_sales: any[];
}

class SalesService {
  // Sales
  async processSale(saleData: ProcessSaleData): Promise<Sale> {
    const response = await apiClient.post('/api/sales', saleData);
    return response.data;
  }

  async getSale(id: number): Promise<Sale> {
    const response = await apiClient.get(`/api/sales/${id}`);
    return response.data;
  }

  async getSaleByNumber(saleNumber: string): Promise<Sale> {
    const response = await apiClient.get(`/api/sales/number/${saleNumber}`);
    return response.data;
  }

  async getTodaySales(): Promise<Sale[]> {
    const response = await apiClient.get('/api/sales/today');
    return response.data;
  }

  async getDashboardStats(): Promise<any> {
    const response = await apiClient.get('/api/sales/dashboard-stats');
    return response.data;
  }


  async getSalesHistory(limit: number = 50, offset: number = 0): Promise<{
    sales: Sale[];
    total: number;
  }> {
    const response = await apiClient.get('/api/sales/history', {
      params: { limit, offset },
    });
    return response.data;
  }

  async refundSale(saleId: number, amount: number, reason: string): Promise<void> {
    await apiClient.post(`/api/sales/${saleId}/refund`, {
      amount,
      reason,
    });
  }

  async resendElectronicInvoice(saleId: number): Promise<void> {
    await apiClient.post(`/api/sales/${saleId}/resend-invoice`);
  }

  async printReceipt(saleId: number): Promise<void> {
    await apiClient.post(`/api/sales/${saleId}/print-receipt`);
  }

  async printInvoice(saleId: number): Promise<void> {
    await apiClient.post(`/api/sales/${saleId}/print-invoice`);
  }

  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const response = await apiClient.get('/api/payment-methods');
    // Cache payment methods
    localStorage.setItem('paymentMethods', JSON.stringify(response.data));
    return response.data;
  }

  async createPaymentMethod(method: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const response = await apiClient.post('/api/payment-methods', method);
    return response.data;
  }

  async updatePaymentMethod(id: number, method: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const response = await apiClient.put(`/api/payment-methods/${id}`, method);
    return response.data;
  }

  async deletePaymentMethod(id: number): Promise<void> {
    await apiClient.delete(`/api/payment-methods/${id}`);
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    const response = await apiClient.get('/api/customers');
    return response.data;
  }

  async getCustomer(id: number): Promise<Customer> {
    const response = await apiClient.get(`/api/customers/${id}`);
    return response.data;
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    const response = await apiClient.get('/api/customers/search', {
      params: { q: query },
    });
    return response.data;
  }

  async createCustomer(customer: Partial<Customer>): Promise<Customer> {
    const response = await apiClient.post('/api/customers', customer);
    return response.data;
  }

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer> {
    const response = await apiClient.put(`/api/customers/${id}`, customer);
    return response.data;
  }

  async getCustomerHistory(customerId: number): Promise<Sale[]> {
    const response = await apiClient.get(`/api/customers/${customerId}/history`);
    return response.data;
  }

  async getCustomerStats(customerId: number): Promise<any> {
    const response = await apiClient.get(`/api/customers/${customerId}/stats`);
    return response.data;
  }

  async deleteCustomer(id: number): Promise<void> {
    await apiClient.delete(`/api/customers/${id}`);
  }

  // Reports
  async getSalesReport(startDate: string, endDate: string): Promise<SalesReport> {
    const response = await apiClient.get('/api/reports/sales', {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  }

  async getDailySalesReport(date?: string): Promise<SalesReport> {
    const response = await apiClient.get('/api/reports/daily-sales', {
      params: date ? { date } : {},
    });
    return response.data;
  }

  async getWeeklySalesReport(): Promise<SalesReport> {
    const response = await apiClient.get('/api/reports/weekly-sales');
    return response.data;
  }

  async getMonthlySalesReport(year?: number, month?: number): Promise<SalesReport> {
    const response = await apiClient.get('/api/reports/monthly-sales', {
      params: { year, month },
    });
    return response.data;
  }

  async getSalesByPaymentMethod(startDate: string, endDate: string): Promise<Record<string, number>> {
    const response = await apiClient.get('/api/reports/sales-by-payment', {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  }

  async getTopSellingProducts(limit: number = 10): Promise<any[]> {
    const response = await apiClient.get('/api/reports/top-products', {
      params: { limit },
    });
    return response.data;
  }

  async exportSalesReport(startDate?: Date, endDate?: Date): Promise<Blob> {
    const response = await apiClient.get('/api/reports/export-sales', {
      params: {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      },
      responseType: 'blob',
    });
    return response.data;
  }

  // Electronic Invoicing
  async checkInvoiceStatus(saleId: number): Promise<any> {
    const response = await apiClient.get(`/api/sales/${saleId}/invoice-status`);
    return response.data;
  }

  async downloadInvoice(saleId: number, format: 'pdf' | 'xml' = 'pdf'): Promise<Blob> {
    const response = await apiClient.get(`/api/sales/${saleId}/invoice/download`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  async sendInvoiceByEmail(saleId: number, email: string): Promise<void> {
    await apiClient.post(`/api/sales/${saleId}/invoice/send-email`, {
      email,
    });
  }

  // Offline support
  saveSaleOffline(sale: Partial<Sale>): void {
    const offlineSales = JSON.parse(localStorage.getItem('offlineSales') || '[]');
    offlineSales.push({
      ...sale,
      id: `offline_${Date.now()}`,
      created_at: new Date().toISOString(),
      is_synced: false,
    });
    localStorage.setItem('offlineSales', JSON.stringify(offlineSales));
  }

  getOfflineSales(): Sale[] {
    const offlineSales = JSON.parse(localStorage.getItem('offlineSales') || '[]');
    return offlineSales;
  }

  clearOfflineSales(): void {
    localStorage.removeItem('offlineSales');
  }

  // Quick calculations
  calculateTax(amount: number, taxRate: number = 0.19): number {
    return amount * taxRate;
  }

  calculateTotal(subtotal: number, tax: number, discount: number = 0): number {
    return subtotal + tax - discount;
  }

  calculateChange(total: number, paid: number): number {
    return paid - total;
  }

  // Cash Register Management
  // Note: Cash register operations (open, close, status) are handled by wailsAuthService
  // Use: wailsAuthService.getOpenCashRegister(), openCashRegister(), closeCashRegister(), addCashMovement()
  // Only HTTP API methods remain below for legacy/offline support

  async registerCashMovement(type: 'in' | 'out', amount: number, reason: string): Promise<void> {
    await apiClient.post('/api/cash-register/movement', {
      type,
      amount,
      reason,
    });
  }

  async printCashRegisterReport(cashRegisterId: number): Promise<void> {
    await apiClient.post(`/api/cash-register/${cashRegisterId}/print-report`);
  }
}

export const salesService = new SalesService();
