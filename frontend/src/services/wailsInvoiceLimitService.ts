// Frontend wrapper for Wails Invoice Limit service

type AnyObject = Record<string, any>;

function getInvoiceLimitService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.InvoiceLimitService) {
    return null;
  }
  return w.go.services.InvoiceLimitService;
}

export interface TimeInterval {
  start_time: string; // HH:MM format
  end_time: string;   // HH:MM format
}

export interface InvoiceLimitConfig {
  enabled: boolean;
  sync_interval: number;
  day_limits: Record<string, number>;

  // Time intervals - block electronic invoicing during specific hours
  time_intervals_enabled: boolean;
  time_intervals: Record<string, TimeInterval[]>; // key: day name (lunes, martes, etc.)

  // Alternating invoices - only invoice every X sales
  alternating_enabled: boolean;
  alternating_ratio: number;
  alternating_counter: number;
  alternating_reset_daily: boolean;
  last_alternating_reset: string;

  last_sync: string;
}

export interface InvoiceLimitStatus {
  available: boolean;
  enabled: boolean;

  // Daily amount limits
  today_limit: number;
  today_sales: number;
  remaining_amount: number;
  day_name: string;

  // Time intervals
  time_intervals_enabled: boolean;
  in_blocked_time_interval: boolean;
  next_available_time: string;
  blocked_until: string;

  // Alternating invoices
  alternating_enabled: boolean;
  alternating_ratio: number;
  alternating_counter: number;
  next_electronic_in: number;
  is_alternating_turn: boolean;

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
