// Import Wails generated bindings
import * as BoldServiceBindings from '../../wailsjs/go/services/BoldService';

// Import generated types from Wails
import { models } from '../../wailsjs/go/models';

/**
 * Bold Service - Handles all Bold API Integrations operations
 */
class WailsBoldService {
  /**
   * Get Bold configuration
   */
  async getBoldConfig(): Promise<models.BoldConfig> {
    try {
      const config = await BoldServiceBindings.GetBoldConfig();
      return config;
    } catch (error) {
      console.error('Error getting Bold config:', error);
      throw error;
    }
  }

  /**
   * Update Bold configuration
   */
  async updateBoldConfig(config: Partial<models.BoldConfig>): Promise<void> {
    try {
      // Get current config first
      const currentConfig = await this.getBoldConfig();

      // Merge with updates and create proper instance
      const updatedConfig = models.BoldConfig.createFrom({
        ...currentConfig,
        ...config,
      });

      await BoldServiceBindings.UpdateBoldConfig(updatedConfig);
    } catch (error) {
      console.error('Error updating Bold config:', error);
      throw error;
    }
  }

  /**
   * Get available payment methods from Bold API
   */
  async getPaymentMethods(): Promise<models.BoldPaymentMethod[]> {
    try {
      const methods = await BoldServiceBindings.GetPaymentMethods();
      return methods || [];
    } catch (error) {
      console.error('Error getting payment methods:', error);
      throw error;
    }
  }

  /**
   * Get available terminals from Bold API
   */
  async getTerminalsFromAPI(): Promise<models.BoldTerminalResponse[]> {
    try {
      const terminals = await BoldServiceBindings.GetTerminals();
      return terminals || [];
    } catch (error) {
      console.error('Error getting terminals from API:', error);
      throw error;
    }
  }

  /**
   * Create a payment through Bold API
   */
  async createPayment(request: models.BoldPaymentRequest): Promise<models.BoldPaymentResponse> {
    try {
      const response = await BoldServiceBindings.CreatePayment(request);
      return response;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  /**
   * Get all terminals from database
   */
  async getAllTerminals(): Promise<models.BoldTerminal[]> {
    try {
      const terminals = await BoldServiceBindings.GetAllTerminals();
      return terminals || [];
    } catch (error) {
      console.error('Error getting terminals:', error);
      throw error;
    }
  }

  /**
   * Create a terminal in database
   */
  async createTerminal(terminal: Omit<models.BoldTerminal, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    try {
      await BoldServiceBindings.CreateTerminal(terminal as models.BoldTerminal);
    } catch (error) {
      console.error('Error creating terminal:', error);
      throw error;
    }
  }

  /**
   * Update a terminal in database
   */
  async updateTerminal(terminal: models.BoldTerminal): Promise<void> {
    try {
      await BoldServiceBindings.UpdateTerminal(terminal);
    } catch (error) {
      console.error('Error updating terminal:', error);
      throw error;
    }
  }

  /**
   * Delete a terminal from database
   */
  async deleteTerminal(id: number): Promise<void> {
    try {
      await BoldServiceBindings.DeleteTerminal(id);
    } catch (error) {
      console.error('Error deleting terminal:', error);
      throw error;
    }
  }

  /**
   * Synchronize terminals from Bold API to database
   */
  async syncTerminals(): Promise<void> {
    try {
      await BoldServiceBindings.SyncTerminals();
    } catch (error) {
      console.error('Error syncing terminals:', error);
      throw error;
    }
  }

  /**
   * Test connection to Bold API
   */
  async testConnection(): Promise<boolean> {
    try {
      await BoldServiceBindings.TestConnection();
      return true;
    } catch (error) {
      console.error('Error testing connection:', error);
      return false;
    }
  }
}

// Export singleton instance
export const wailsBoldService = new WailsBoldService();
