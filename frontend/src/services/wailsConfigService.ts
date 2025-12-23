// Frontend wrapper for Wails Config service

type AnyObject = Record<string, any>;

function getConfigService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.ConfigService) {
    return null;
  }
  return w.go.services.ConfigService;
}

export const wailsConfigService = {
  // Restaurant Config
  async getRestaurantConfig(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetRestaurantConfig();
  },

  async updateRestaurantConfig(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateRestaurantConfig(config);
  },

  // DIAN Config
  async getDIANConfig(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetDIANConfig();
  },

  async updateDIANConfig(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateDIANConfig(config);
  },

  // Printer Config
  async getPrinterConfigs(): Promise<any[]> {
    const svc = getConfigService();
    if (!svc) return [];
    return await svc.GetPrinterConfigs();
  },

  async getDefaultPrinter(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetDefaultPrinter();
  },

  async savePrinterConfig(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.SavePrinterConfig(config);
  },

  async deletePrinterConfig(id: number): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.DeletePrinterConfig(id);
  },

  // Sync Config
  async getSyncConfig(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetSyncConfig();
  },

  async updateSyncConfig(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateSyncConfig(config);
  },

  // System Config
  async getSystemConfig(key: string): Promise<string> {
    const svc = getConfigService();
    if (!svc) return '';
    return await svc.GetSystemConfig(key);
  },

  async setSystemConfig(key: string, value: string, type: string, category: string): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.SetSystemConfig(key, value, type, category);
  },

  async getAllSystemConfigs(): Promise<any[]> {
    const svc = getConfigService();
    if (!svc) return [];
    return await svc.GetAllSystemConfigs();
  },

  // UI Theme
  async getUITheme(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetUITheme();
  },

  async updateUITheme(theme: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateUITheme(theme);
  },

  // Table Layout
  async getTableLayout(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetTableLayout();
  },

  async saveTableLayout(layout: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.SaveTableLayout(layout);
  },

  // Validation
  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const svc = getConfigService();
    if (!svc) return { valid: false, errors: ['Service not ready'] };
    const result = await svc.ValidateConfiguration();
    return result;
  },

  // Network Config
  async getNetworkConfig(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetNetworkConfig();
  },

  async saveNetworkConfig(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.SaveNetworkConfig(config);
  },

  // Tunnel Config (DB model)
  async getTunnelConfigDB(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetTunnelConfigDB();
  },

  async saveTunnelConfigDB(config: AnyObject): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.SaveTunnelConfigDB(config);
  },

  // Tunnel Management
  async getTunnelStatus(): Promise<any> {
    const svc = getConfigService();
    if (!svc) return null;
    return await svc.GetTunnelStatus();
  },

  async startQuickTunnel(port: number): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.StartQuickTunnel(port);
  },

  async startTunnelWithToken(token: string): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.StartTunnelWithToken(token);
  },

  async stopTunnel(): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.StopTunnel();
  },

  async downloadCloudflared(): Promise<void> {
    const svc = getConfigService();
    if (!svc) throw new Error('Service not ready');
    await svc.DownloadCloudflared();
  },

  async isTunnelInstalled(): Promise<boolean> {
    const svc = getConfigService();
    if (!svc) return false;
    return await svc.IsTunnelInstalled();
  },

  async getTunnelDownloadURL(): Promise<string> {
    const svc = getConfigService();
    if (!svc) return '';
    return await svc.GetTunnelDownloadURL();
  },

  async clearTunnelOutput(): Promise<void> {
    const svc = getConfigService();
    if (!svc) return;
    await svc.ClearTunnelOutput();
  }
};

