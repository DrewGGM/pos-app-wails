// Frontend wrapper for Wails Printer service

type AnyObject = Record<string, any>;

export interface DetectedPrinter {
  name: string;
  type: string;  // "usb", "network", "serial"
  connection_type: string;  // "usb", "ethernet", "serial"
  address: string;
  port: number;
  is_default: boolean;
  status: string;  // "online", "offline", "unknown"
  model: string;
}

function getPrinterService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.PrinterService) {
    console.warn('[wailsPrinterService] Bindings not ready');
    return null;
  }
  return w.go.services.PrinterService;
}

export const wailsPrinterService = {
  // Printer Detection
  async getAvailablePrinters(): Promise<DetectedPrinter[]> {
    const svc = getPrinterService();
    if (!svc) return [];
    try {
      const printers = await svc.GetAvailablePrinters();
      return printers || [];
    } catch (error) {
      console.error('Error detecting printers:', error);
      return [];
    }
  },

  async getAvailableSerialPorts(): Promise<string[]> {
    const svc = getPrinterService();
    if (!svc) return [];
    try {
      const ports = await svc.GetAvailableSerialPorts();
      return ports || [];
    } catch (error) {
      console.error('Error detecting serial ports:', error);
      return [];
    }
  },

  // Printing
  async printReceipt(sale: any, isElectronicInvoice: boolean): Promise<void> {
    const svc = getPrinterService();
    if (!svc) throw new Error('Service not ready');
    await svc.PrintReceipt(sale, isElectronicInvoice);
  },

  async printKitchenOrder(order: any): Promise<void> {
    const svc = getPrinterService();
    if (!svc) throw new Error('Service not ready');
    await svc.PrintKitchenOrder(order);
  },

  async printOrder(order: any): Promise<void> {
    const svc = getPrinterService();
    if (!svc) throw new Error('Service not ready');
    // Use order receipt format with prices and totals
    await svc.PrintOrder(order);
  },

  async printCashRegisterReport(report: any): Promise<void> {
    const svc = getPrinterService();
    if (!svc) throw new Error('Service not ready');
    await svc.PrintCashRegisterReport(report);
  },

  async testPrinter(printerId: number): Promise<void> {
    const svc = getPrinterService();
    if (!svc) throw new Error('Service not ready');
    await svc.TestPrinter(printerId);
  }
};
