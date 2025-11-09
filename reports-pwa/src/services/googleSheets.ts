interface GoogleSheetsConfig {
  apiKey: string
  spreadsheetId: string
  range: string
}

export interface ProductDetail {
  product_name: string
  quantity: number
  total: number
}

export interface PaymentMethodDetail {
  payment_method: string
  amount: number
  count: number
}

export interface OrderTypeDetail {
  order_type: string
  amount: number
  count: number
  hide_amount: boolean
  products: ProductDetail[]
}

export interface ReportData {
  fecha: string
  ventas_totales: number
  ventas_dian: number
  ventas_no_dian: number
  ordenes: number
  productos_vendidos: number
  ticket_promedio: number
  detalle_productos: ProductDetail[]
  detalle_tipos_pago?: PaymentMethodDetail[]
  detalle_tipos_pedido?: OrderTypeDetail[]
}

class GoogleSheetsService {
  private config: GoogleSheetsConfig | null = null

  constructor() {
    this.loadConfig()
  }

  private loadConfig(): void {
    const apiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
    const spreadsheetId = import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID
    const range = import.meta.env.VITE_GOOGLE_SHEETS_RANGE

    if (apiKey && spreadsheetId && range) {
      this.config = { apiKey, spreadsheetId, range }
    }
  }

  isConfigured(): boolean {
    return this.config !== null && 
           this.config.apiKey !== '' && 
           this.config.spreadsheetId !== ''
  }

  getMissingConfig(): string[] {
    const missing: string[] = []
    
    if (!import.meta.env.VITE_GOOGLE_SHEETS_API_KEY) {
      missing.push('VITE_GOOGLE_SHEETS_API_KEY')
    }
    if (!import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID) {
      missing.push('VITE_GOOGLE_SHEETS_SPREADSHEET_ID')
    }
    if (!import.meta.env.VITE_GOOGLE_SHEETS_RANGE) {
      missing.push('VITE_GOOGLE_SHEETS_RANGE')
    }
    
    return missing
  }

  async fetchReports(): Promise<ReportData[]> {
    if (!this.isConfigured() || !this.config) {
      throw new Error('Google Sheets no está configurado. Por favor configura las variables de entorno.')
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${this.config.range}?key=${this.config.apiKey}`

    try {
      const response = await fetch(url)
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('API Key inválida o sin permisos. Verifica tu configuración en Google Cloud Console.')
        }
        if (response.status === 404) {
          throw new Error('Spreadsheet no encontrado. Verifica el ID del documento.')
        }
        throw new Error(`Error al conectar con Google Sheets: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.values || data.values.length === 0) {
        return []
      }

      return this.parseSheetData(data.values)
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Error desconocido al cargar reportes')
    }
  }

  private parseSheetData(values: string[][]): ReportData[] {
    if (values.length < 2) {
      return []
    }

    const headers = values[0].map(h => h.toLowerCase().trim())
    const rows = values.slice(1)

    const reports: ReportData[] = []

    for (const row of rows) {
      if (row.length === 0) continue

      const report: any = {}
      
      headers.forEach((header, index) => {
        const value = row[index] || ''

        // Parse JSON fields (detalle_productos, detalle_tipos_pedido, detalle_tipos_pago)
        if (header === 'detalle_productos' || header === 'detalle_tipos_pedido' || header === 'detalle_tipos_pago') {
          try {
            report[header] = value ? JSON.parse(value) : []
          } catch {
            report[header] = []
          }
        }
        // Convertir a número si parece ser numérico
        else if (header === 'ventas_totales' || header === 'ventas_dian' || header === 'ventas_no_dian' ||
            header === 'ordenes' || header === 'productos_vendidos' || header === 'ticket_promedio' ||
            header === 'total' || header === 'cantidad') {
          report[header] = this.parseNumber(value)
        } else {
          report[header] = value
        }
      })

      // Validar que tenga los campos mínimos requeridos
      if (report.fecha) {
        reports.push({
          fecha: report.fecha || '',
          ventas_totales: report.ventas_totales || 0,
          ventas_dian: report.ventas_dian || 0,
          ventas_no_dian: report.ventas_no_dian || 0,
          ordenes: report.ordenes || 0,
          productos_vendidos: report.productos_vendidos || 0,
          ticket_promedio: report.ticket_promedio || 0,
          detalle_productos: report.detalle_productos || [],
          detalle_tipos_pago: report.detalle_tipos_pago || [],
          detalle_tipos_pedido: report.detalle_tipos_pedido || []
        })
      }
    }

    return reports
  }

  private parseNumber(value: string | number): number {
    if (typeof value === 'number') return value
    
    // Remover símbolos de moneda y comas
    const cleaned = value.toString().replace(/[$,]/g, '').trim()
    const num = parseFloat(cleaned)
    
    return isNaN(num) ? 0 : num
  }
}

export const googleSheetsService = new GoogleSheetsService()
