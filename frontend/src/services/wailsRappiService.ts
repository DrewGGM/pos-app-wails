import {
  GetConfig,
  SaveConfig,
  TestConnection,
  GetConnectionStatus,
  ResetStatistics
} from '../../wailsjs/go/services/RappiConfigService';
import { models, services } from '../../wailsjs/go/models';

// Use the auto-generated types from Wails
export type RappiConfig = models.RappiConfig;
export const RappiConfigClass = models.RappiConfig;

export type TestConnectionResponse = services.TestConnectionResponse;
export type ConnectionStatus = services.ConnectionStatus;

export const wailsRappiService = {
  async getConfig(): Promise<RappiConfig> {
    return await GetConfig();
  },

  async saveConfig(config: RappiConfig): Promise<void> {
    return await SaveConfig(config);
  },

  async testConnection(config: RappiConfig): Promise<TestConnectionResponse> {
    return await TestConnection(config);
  },

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return await GetConnectionStatus();
  },

  async resetStatistics(): Promise<void> {
    return await ResetStatistics();
  }
};
