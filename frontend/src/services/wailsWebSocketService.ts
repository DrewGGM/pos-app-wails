// Frontend wrapper for Wails WebSocket Management service

type AnyObject = Record<string, any>;

function getWebSocketService(): AnyObject | null {
  const w = (window as AnyObject);
  if (!w.go || !w.go.services || !w.go.services.WebSocketManagementService) {
    return null;
  }
  return w.go.services.WebSocketManagementService;
}

export interface WebSocketStatus {
  running: boolean;
  port?: number;
  total_clients?: number;
  kitchen_clients?: number;
  waiter_clients?: number;
  pos_clients?: number;
  local_ips?: string[];
  error?: string;
}

export interface WebSocketClient {
  id: string;
  type: string;
  connected_at: string;
  remote_addr: string;
}

export const wailsWebSocketService = {
  async getStatus(): Promise<WebSocketStatus> {
    const svc = getWebSocketService();
    if (!svc) return { running: false, error: 'Service not ready' };
    return await svc.GetStatus();
  },

  async getConnectedClients(): Promise<WebSocketClient[]> {
    const svc = getWebSocketService();
    if (!svc) return [];
    return await svc.GetConnectedClients();
  },

  async disconnectClient(clientID: string): Promise<void> {
    const svc = getWebSocketService();
    if (!svc) throw new Error('Service not ready');
    await svc.DisconnectClient(clientID);
  },

  async sendTestNotification(): Promise<void> {
    const svc = getWebSocketService();
    if (!svc) throw new Error('Service not ready');
    await svc.SendTestNotification();
  }
};
