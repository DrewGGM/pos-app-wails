// Config API Service for managing invoice limits and other configurations

export interface InvoiceLimitConfig {
  enabled: boolean
  sync_interval: number
  day_limits: { [key: string]: number }
  last_sync: string
}

export interface InvoiceLimitStatus {
  available: boolean
  enabled: boolean
  today_limit: number
  today_sales: number
  remaining_amount: number
  day_name: string
  message: string
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

class ConfigApiService {
  private baseUrl: string = ''

  constructor() {
    this.loadConfig()
  }

  private loadConfig(): void {
    const apiUrl = import.meta.env.VITE_CONFIG_API_URL
    if (apiUrl) {
      this.baseUrl = apiUrl.replace(/\/$/, '') // Remove trailing slash
    }
  }

  isConfigured(): boolean {
    return this.baseUrl !== ''
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  getMissingConfig(): string[] {
    const missing: string[] = []
    if (!import.meta.env.VITE_CONFIG_API_URL) {
      missing.push('VITE_CONFIG_API_URL')
    }
    return missing
  }

  // Get current invoice limit configuration
  async getInvoiceLimits(): Promise<InvoiceLimitConfig> {
    if (!this.isConfigured()) {
      throw new Error('Config API no está configurado')
    }

    const response = await fetch(`${this.baseUrl}/api/v1/config/invoice-limits`)

    if (!response.ok) {
      throw new Error(`Error al obtener configuración: ${response.status} ${response.statusText}`)
    }

    const result: ApiResponse<InvoiceLimitConfig> = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido')
    }

    return result.data!
  }

  // Update invoice limit configuration
  async updateInvoiceLimits(config: Partial<InvoiceLimitConfig>): Promise<InvoiceLimitConfig> {
    if (!this.isConfigured()) {
      throw new Error('Config API no está configurado')
    }

    const response = await fetch(`${this.baseUrl}/api/v1/config/invoice-limits`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      throw new Error(`Error al actualizar configuración: ${response.status} ${response.statusText}`)
    }

    const result: ApiResponse<InvoiceLimitConfig> = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido')
    }

    return result.data!
  }

  // Get current invoice limit status
  async getInvoiceLimitStatus(): Promise<InvoiceLimitStatus> {
    if (!this.isConfigured()) {
      throw new Error('Config API no está configurado')
    }

    const response = await fetch(`${this.baseUrl}/api/v1/config/invoice-limits/status`)

    if (!response.ok) {
      throw new Error(`Error al obtener estado: ${response.status} ${response.statusText}`)
    }

    const result: ApiResponse<InvoiceLimitStatus> = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido')
    }

    return result.data!
  }

  // Force sync with Google Sheets
  async syncConfig(): Promise<InvoiceLimitConfig> {
    if (!this.isConfigured()) {
      throw new Error('Config API no está configurado')
    }

    const response = await fetch(`${this.baseUrl}/api/v1/config/invoice-limits/sync`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Error al sincronizar: ${response.status} ${response.statusText}`)
    }

    const result: ApiResponse<InvoiceLimitConfig> = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido')
    }

    return result.data!
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }
}

export const configApiService = new ConfigApiService()
