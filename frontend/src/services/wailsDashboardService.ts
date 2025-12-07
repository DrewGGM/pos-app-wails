// Frontend wrapper for Wails Dashboard service

type AnyObject = Record<string, any>;

function getDashboardService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.DashboardService) {
    return null;
  }
  return w.go.services.DashboardService;
}

export interface DashboardStats {
  today_sales: number;
  today_sales_count: number;
  today_orders: number;
  today_customers: number;
  pending_orders: number;
  low_stock_products: number;
  active_tables: number;
  sales_growth: number;
  average_ticket: number;
  top_selling_items: TopSellingItem[];
}

export interface TopSellingItem {
  product_id: number;
  product_name: string;
  quantity: number;
  total_sales: number;
}

export interface SalesChartData {
  date: string;
  sales: number;
  orders: number;
}

export const wailsDashboardService = {
  // Get dashboard statistics
  async getDashboardStats(): Promise<DashboardStats | null> {
    const svc = getDashboardService();
    if (!svc) return null;
    return await svc.GetDashboardStats();
  },

  // Get sales chart data for the last N days
  async getSalesChartData(days: number = 7): Promise<SalesChartData[]> {
    const svc = getDashboardService();
    if (!svc) return [];
    return await svc.GetSalesChartData(days);
  },

  // Get detailed information about pending orders
  async getPendingOrdersDetails(): Promise<any[]> {
    const svc = getDashboardService();
    if (!svc) return [];
    return await svc.GetPendingOrdersDetails();
  },

  // Get products with low stock
  async getLowStockProducts(): Promise<any[]> {
    const svc = getDashboardService();
    if (!svc) return [];
    return await svc.GetLowStockProducts();
  },

  // Get all active (occupied) tables
  async getActiveTables(): Promise<any[]> {
    const svc = getDashboardService();
    if (!svc) return [];
    return await svc.GetActiveTables();
  },

  // Get dashboard statistics filtered by DIAN electronic invoices only
  async getDashboardStatsDIAN(): Promise<DashboardStats | null> {
    const svc = getDashboardService();
    if (!svc) return null;
    return await svc.GetDashboardStatsDIAN();
  },

  // Get sales chart data filtered by DIAN electronic invoices only
  async getSalesChartDataDIAN(days: number = 7): Promise<SalesChartData[]> {
    const svc = getDashboardService();
    if (!svc) return [];
    return await svc.GetSalesChartDataDIAN(days);
  }
};
