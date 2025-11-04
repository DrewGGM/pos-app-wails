// Frontend wrapper for Wails Reports service

type AnyObject = Record<string, any>;

function getReportsService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.ReportsService) {
    console.warn('[wailsReportsService] Bindings not ready');
    return null;
  }
  return w.go.services.ReportsService;
}

export interface SalesReport {
  period: string;
  start_date: string;
  end_date: string;
  total_sales: number;
  total_tax: number;
  total_discounts: number;
  number_of_sales: number;
  average_sale: number;
  payment_breakdown: { [key: string]: number };
  top_products: ProductSalesData[];
  hourly_sales: HourlySalesData[];
  daily_sales: DailySalesData[];
}

export interface ProductSalesData {
  product_id: number;
  product_name: string;
  quantity: number;
  total_sales: number;
  percentage: number;
}

export interface HourlySalesData {
  hour: number;
  sales: number;
  orders: number;
}

export interface DailySalesData {
  date: string;
  sales: number;
  orders: number;
}

export interface CustomerStatsData {
  total_customers: number;
  new_customers_month: number;
  retention_rate: number;
  average_value_per_customer: number;
  visit_frequency: number;
}

export interface CategorySalesComparison {
  category: string;
  current_sales: number;
  previous_sales: number;
  growth_percent: number;
}

export interface KeyMetricsComparison {
  metric: string;
  current_value: number;
  previous_value: number;
  growth_percent: number;
}

export interface InventoryReport {
  generated_at: string;
  total_products: number;
  total_value: number;
  low_stock_items: any[];
  out_of_stock_items: any[];
  top_moving_items: any[];
  category_breakdown: any[];
}

export const wailsReportsService = {
  // Sales Reports
  async getSalesReport(startDate: string, endDate: string): Promise<SalesReport | null> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse dates in local timezone (not UTC) to avoid timezone offset issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0); // Start of day in local time

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999); // End of day in local time

    return await svc.GetSalesReport(start, end);
  },

  async getDailySalesReport(date: string): Promise<SalesReport | null> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse date in local timezone
    const [year, month, day] = date.split('-').map(Number);
    const reportDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    return await svc.GetDailySalesReport(reportDate);
  },

  async getWeeklySalesReport(): Promise<SalesReport | null> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.GetWeeklySalesReport();
  },

  async getMonthlySalesReport(year: number, month: number): Promise<SalesReport | null> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.GetMonthlySalesReport(year, month);
  },

  async getSalesByPaymentMethod(startDate: string, endDate: string): Promise<{ [key: string]: number } | null> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetSalesByPaymentMethod(start, end);
  },

  // Customer Stats
  async getCustomerStats(startDate: string, endDate: string): Promise<CustomerStatsData | null> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetCustomerStats(start, end);
  },

  // Category Sales
  async getSalesByCategory(startDate: string, endDate: string): Promise<CategorySalesComparison[]> {
    const svc = getReportsService();
    if (!svc) return [];

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetSalesByCategory(start, end);
  },

  // Key Metrics Comparison
  async getKeyMetricsComparison(startDate: string, endDate: string): Promise<KeyMetricsComparison[]> {
    const svc = getReportsService();
    if (!svc) return [];

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetKeyMetricsComparison(start, end);
  },

  // Inventory Reports
  async getInventoryReport(): Promise<InventoryReport | null> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.GetInventoryReport();
  },

  async getLowStockReport(threshold: number): Promise<any[]> {
    const svc = getReportsService();
    if (!svc) return [];
    return await svc.GetLowStockReport(threshold);
  },

  // Employee Reports
  async getEmployeePerformanceReport(startDate: string, endDate: string): Promise<any> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetEmployeePerformanceReport(start, end);
  },

  async getEmployeeSalesReport(employeeId: number, startDate: string, endDate: string): Promise<SalesReport | null> {
    const svc = getReportsService();
    if (!svc) return null;

    // Parse dates in local timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    return await svc.GetEmployeeSalesReport(employeeId, start, end);
  },

  // Export functions
  async exportSalesReportCSV(report: SalesReport): Promise<Uint8Array | null> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.ExportSalesReportCSV(report);
  },

  async exportSalesReportJSON(report: SalesReport): Promise<Uint8Array | null> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.ExportSalesReportJSON(report);
  },

  // Dashboard stats (legacy method)
  async getDashboardStats(): Promise<any> {
    const svc = getReportsService();
    if (!svc) return null;
    return await svc.GetDashboardStats();
  }
};
