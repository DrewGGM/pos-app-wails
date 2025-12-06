// Frontend wrapper for Wails Invoice Limit service

type AnyObject = Record<string, any>;

function getInvoiceLimitService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.InvoiceLimitService) {
    return null;
  }
  return w.go.services.InvoiceLimitService;
}

export interface InvoiceLimitConfig {
  enabled: boolean;
  sync_interval: number;
  day_limits: Record<string, number>;
  last_sync: string;
}

export interface InvoiceLimitStatus {
  available: boolean;
  enabled: boolean;
  today_limit: number;
  today_sales: number;
  remaining_amount: number;
  day_name: string;
  message: string;
}

export const wailsInvoiceLimitService = {
  /**
   * Get the current invoice limit configuration
   */
  async getConfig(): Promise<InvoiceLimitConfig | null> {
    const svc = getInvoiceLimitService();
    if (!svc) return null;
    return await svc.GetConfig();
  },

  /**
   * Get the current status of electronic invoicing availability
   */
  async getStatus(): Promise<InvoiceLimitStatus | null> {
    const svc = getInvoiceLimitService();
    if (!svc) return null;
    return await svc.GetStatus();
  },

  /**
   * Sync configuration from Google Sheets
   */
  async syncConfig(): Promise<void> {
    const svc = getInvoiceLimitService();
    if (!svc) throw new Error('Service not ready');
    await svc.SyncConfig();
  },

  /**
   * Save configuration to Google Sheets
   */
  async saveConfig(config: InvoiceLimitConfig): Promise<void> {
    const svc = getInvoiceLimitService();
    if (!svc) throw new Error('Service not ready');
    await svc.SaveConfig(config);
  },

  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return getInvoiceLimitService() !== null;
  }
};
