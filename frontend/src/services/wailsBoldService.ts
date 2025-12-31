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

  /**
   * Create a pending payment record
   */
  async createPendingPayment(pendingPayment: models.BoldPendingPayment): Promise<void> {
    try {
      await BoldServiceBindings.CreatePendingPayment(pendingPayment);
    } catch (error) {
      console.error('Error creating pending payment:', error);
      throw error;
    }
  }

  /**
   * Get pending payment by integration ID
   */
  async getPendingPayment(integrationId: string): Promise<models.BoldPendingPayment> {
    try {
      const payment = await BoldServiceBindings.GetPendingPayment(integrationId);
      return payment;
    } catch (error) {
      console.error('Error getting pending payment:', error);
      throw error;
    }
  }

  /**
   * Get pending payment status
   */
  async getPendingPaymentStatus(integrationId: string): Promise<{ status: string; payment: models.BoldPendingPayment }> {
    try {
      // GetPendingPaymentStatus returns [status, payment, error] tuple in Go
      const result = await (BoldServiceBindings as any).GetPendingPaymentStatus(integrationId);

      // The Go function returns (string, *BoldPendingPayment, error)
      // Wails bindings will give us the payment directly or throw error
      const payment = await this.getPendingPayment(integrationId);
      return { status: payment.status || 'pending', payment };
    } catch (error) {
      console.error('Error getting pending payment status:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending payment (e.g., due to timeout)
   */
  async cancelPendingPayment(integrationId: string): Promise<void> {
    try {
      await BoldServiceBindings.CancelPendingPayment(integrationId);
    } catch (error) {
      console.error('Error cancelling pending payment:', error);
      throw error;
    }
  }

  /**
   * Get recent webhook notifications
   */
  async getRecentWebhooks(limit: number = 50): Promise<models.BoldPendingPayment[]> {
    try {
      const webhooks = await BoldServiceBindings.GetRecentWebhooks(limit);
      return webhooks || [];
    } catch (error) {
      console.error('Error getting recent webhooks:', error);
      return [];
    }
  }

  /**
   * Get webhook debug logs (raw webhook attempts)
   */
  async getWebhookLogs(limit: number = 50): Promise<models.BoldWebhookLog[]> {
    try {
      const logs = await BoldServiceBindings.GetWebhookLogs(limit);
      return logs || [];
    } catch (error) {
      console.error('Error getting webhook logs:', error);
      return [];
    }
  }
}

// Export singleton instance
export const wailsBoldService = new WailsBoldService();
