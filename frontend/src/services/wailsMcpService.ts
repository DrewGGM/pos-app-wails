// MCP Service - Frontend wrapper for Wails MCP service
import {
  GetConfig,
  UpdateConfig,
  Start,
  Stop,
  GetStatus,
  GetAvailableTools,
} from '../../wailsjs/go/services/MCPService';

// Simple interface matching the Go struct (avoiding class complications)
export interface MCPConfig {
  id?: number;
  enabled: boolean;
  port: number;
  api_key: string;
  allowed_ips: string;
  read_only_mode: boolean;
  disabled_tools: string;
}

export interface MCPStatus {
  configured: boolean;
  running: boolean;
  port: number;
  api_key_set: boolean;
  read_only_mode: boolean;
}

export interface MCPTool {
  name: string;
  category: string;
  description: string;
  enabled: boolean;
}

export const wailsMcpService = {
  async getConfig(): Promise<MCPConfig> {
    const config = await GetConfig();
    // Extract plain object from class instance
    return {
      id: config.id,
      enabled: config.enabled,
      port: config.port,
      api_key: config.api_key,
      allowed_ips: config.allowed_ips,
      read_only_mode: config.read_only_mode,
      disabled_tools: config.disabled_tools || '',
    };
  },

  async updateConfig(config: MCPConfig): Promise<void> {
    await UpdateConfig(config as any);
  },

  async start(): Promise<void> {
    await Start();
  },

  async stop(): Promise<void> {
    await Stop();
  },

  async getStatus(): Promise<MCPStatus> {
    const status = await GetStatus();
    return status as MCPStatus;
  },

  async getAvailableTools(): Promise<MCPTool[]> {
    const tools = await GetAvailableTools();
    return tools as MCPTool[];
  },
};
