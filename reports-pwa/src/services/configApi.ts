// Config API Service for managing invoice limits and other configurations

export interface TimeInterval {
  start_time: string // HH:MM format
  end_time: string   // HH:MM format
}

export interface InvoiceLimitConfig {
  enabled: boolean
  sync_interval: number
  day_limits: { [key: string]: number }

  // Time intervals - block electronic invoicing during specific hours
  time_intervals_enabled: boolean
  time_intervals: { [key: string]: TimeInterval[] } // key: day name (lunes, martes, etc.)

  // Alternating invoices - only invoice every X sales
  alternating_enabled: boolean
  alternating_ratio: number
  alternating_counter: number
  alternating_reset_daily: boolean
  last_alternating_reset: string

  last_sync: string
}

export interface InvoiceLimitStatus {
  available: boolean
  enabled: boolean

  // Daily amount limits
  today_limit: number
  today_sales: number
  remaining_amount: number
  day_name: string

  // Time intervals
  time_intervals_enabled: boolean
  in_blocked_time_interval: boolean
  next_available_time: string
  blocked_until: string

  // Alternating invoices
  alternating_enabled: boolean
  alternating_ratio: number
  alternating_counter: number
  next_electronic_in: number
  is_alternating_turn: boolean

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
