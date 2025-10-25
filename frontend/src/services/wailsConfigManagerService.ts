import {
  GetConfig,
  SaveConfig,
  ConfigExists,
  IsFirstRun,
  CreateDefaultConfig,
  TestDatabaseConnection,
  InitializeDatabase,
  CompleteSetup,
  GetConfigPath
} from '../../wailsjs/go/services/ConfigManagerService';

import { config } from '../../wailsjs/go/models';

// Re-export types from generated models
export type AppConfig = config.AppConfig;
export type DatabaseConfig = config.DatabaseConfig;
export type DianConfig = config.DianConfig;
export type BusinessConfig = config.BusinessConfig;
export type SystemConfig = config.SystemConfig;

export const wailsConfigManagerService = {
  async getConfig(): Promise<AppConfig | null> {
    try {
      const config = await GetConfig();
      return config;
    } catch (error) {
      console.error('Error getting config:', error);
      return null;
    }
  },

  async saveConfig(config: AppConfig): Promise<void> {
    try {
      await SaveConfig(config);
    } catch (error) {
      console.error('Error saving config:', error);
      throw error;
    }
  },

  async configExists(): Promise<boolean> {
    try {
      const exists = await ConfigExists();
      return exists;
    } catch (error) {
      console.error('Error checking if config exists:', error);
      return false;
    }
  },

  async isFirstRun(): Promise<boolean> {
    try {
      const firstRun = await IsFirstRun();
      return firstRun;
    } catch (error) {
      console.error('Error checking first run:', error);
      return true;
    }
  },

  async createDefaultConfig(): Promise<AppConfig | null> {
    try {
      const config = await CreateDefaultConfig();
      return config;
    } catch (error) {
      console.error('Error creating default config:', error);
      return null;
    }
  },

  async testDatabaseConnection(dbConfig: DatabaseConfig): Promise<void> {
    try {
      await TestDatabaseConnection(dbConfig);
    } catch (error) {
      console.error('Error testing database connection:', error);
      throw error;
    }
  },

  async initializeDatabase(dbConfig: DatabaseConfig): Promise<void> {
    try {
      await InitializeDatabase(dbConfig);
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  },

  async completeSetup(): Promise<void> {
    try {
      await CompleteSetup();
    } catch (error) {
      console.error('Error completing setup:', error);
      throw error;
    }
  },

  async getConfigPath(): Promise<string | null> {
    try {
      const path = await GetConfigPath();
      return path;
    } catch (error) {
      console.error('Error getting config path:', error);
      return null;
    }
  },
};
