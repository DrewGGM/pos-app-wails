// Frontend wrapper for Wails DIAN service using dynamic access to avoid path coupling

type AnyObject = Record<string, any>;

function getDian(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.DIANService) {
    return null;
  }
  return w.go.services.DIANService;
}

export const wailsDianService = {
  async getConfig(): Promise<any> {
    const svc = getDian();
    if (!svc) return null;
    return await svc.GetDIANConfig();
  },

  async updateConfig(config: AnyObject): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateDIANConfig(config);
  },

  async configureCompany(): Promise<any> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    return await svc.ConfigureCompany();
  },

  async configureSoftware(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureSoftware();
  },

  async configureCertificate(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureCertificate();
  },

  async configureLogo(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureLogo();
  },

  async configureResolution(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureResolution();
  },

  async configureCreditNoteResolution(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureCreditNoteResolution();
  },

  async configureDebitNoteResolution(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ConfigureDebitNoteResolution();
  },

  async changeEnvironment(environment: 'test' | 'production'): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ChangeEnvironment(environment);
  },

  async getNumberingRanges(): Promise<any> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    return await svc.GetNumberingRanges();
  },

  async migrateToProduction(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    // MigrateToProduction now automatically extracts resolution from GetNumberingRanges
    await svc.MigrateToProduction();
  },

  async testConnection(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.TestConnection();
  },

  async resetConfigurationSteps(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ResetConfigurationSteps();
  },

  async resendInvoiceEmail(prefix: string, invoiceNumber: string): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ResendInvoiceEmail(prefix, invoiceNumber);
  },

  async resetTestResolution(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.ResetTestResolution();
  },

  async registerNewResolution(): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.RegisterNewResolution();
  },

  async getResolutionLimitStatus(): Promise<{
    remaining_invoices: number;
    alert_threshold: number;
    is_near_limit: boolean;
    current_number: number;
    end_number: number;
  }> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    return await svc.GetResolutionLimitStatus();
  },

  async updateAlertThreshold(threshold: number): Promise<void> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    await svc.UpdateAlertThreshold(threshold);
  },

  async getNextConsecutive(typeDocumentId: number, prefix: string): Promise<{
    success: boolean;
    type_document_id: number;
    prefix: string;
    number: number;
  }> {
    const svc = getDian();
    if (!svc) throw new Error('Service not ready');
    return await svc.GetNextConsecutive(typeDocumentId, prefix);
  }
};


