import {
  GetConfig,
  SaveConfig,
  TestConnection,
  SyncNow
} from '../../wailsjs/go/services/GoogleSheetsService';
import { models } from '../../wailsjs/go/models';

export type GoogleSheetsConfig = models.GoogleSheetsConfig;
// Export the class constructor as well
export const GoogleSheetsConfigClass = models.GoogleSheetsConfig;

export const wailsGoogleSheetsService = {
  async getConfig(): Promise<GoogleSheetsConfig> {
    return await GetConfig();
  },

  async saveConfig(config: GoogleSheetsConfig): Promise<void> {
    return await SaveConfig(config);
  },

  async testConnection(config: GoogleSheetsConfig): Promise<void> {
    return await TestConnection(config);
  },

  async syncNow(): Promise<void> {
    return await SyncNow();
  }
};
