import { useState, useEffect } from 'react'
import { googleSheetsService, type ReportData } from './services/googleSheets'
import './App.css'

type ViewPeriod = 'day' | 'week' | 'month' | 'year'

function App() {
  const [reports, setReports] = useState<ReportData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [missingConfig, setMissingConfig] = useState<string[]>([])

  // Date navigation
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('day')
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null)

  useEffect(() => {
    const configured = googleSheetsService.isConfigured()
    setIsConfigured(configured)

    if (!configured) {
      const missing = googleSheetsService.getMissingConfig()
      setMissingConfig(missing)
    } else {
      // Auto-load today's report on mount
      loadReports()
    }
  }, [])

  useEffect(() => {
    // Update current report when date or reports change
    if (reports.length > 0) {
      updateCurrentReport()
    }
  }, [selectedDate, reports, viewPeriod])

  const loadReports = async () => {
    if (!isConfigured) {
      setError('La aplicación no está configurada.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await googleSheetsService.fetchReports()
      setReports(data)

      if (data.length === 0) {
        setError('No hay datos en la hoja de cálculo.')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(errorMessage)
      console.error('Error loading reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateCurrentReport = () => {
    const dateStr = formatDateForFilter(selectedDate)
    const found = reports.find(r => r.fecha === dateStr)
    setCurrentReport(found || null)
  }

  const formatDateForFilter = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)

    switch (viewPeriod) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
        break
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
        break
      case 'year':
        newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
        break
    }

    setSelectedDate(newDate)
  }

  const goToToday = () => {
    setSelectedDate(new Date())
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getDateRangeText = () => {
    const date = selectedDate

    switch (viewPeriod) {
      case 'day':
        return date.toLocaleDateString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      case 'week':
        const startOfWeek = new Date(date)
        startOfWeek.setDate(date.getDate() - date.getDay())
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        return `${startOfWeek.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}`
      case 'month':
        return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
      case 'year':
        return date.getFullYear().toString()
    }
  }

  if (!isConfigured) {
    return (
      <div className="app">
        <header className="header">
          <h1>Reportes POS</h1>
          <p className="subtitle">Sistema de reportes diarios</p>
        </header>

        <main className="main">
          <div className="config-error">
            <div className="config-icon">⚙️</div>
            <h2>Configuración Requerida</h2>
            <p>La aplicación necesita ser configurada antes de usarse.</p>

            <div className="missing-config">
              <h3>Variables de entorno faltantes:</h3>
              <ul>
                {missingConfig.map(config => (
                  <li key={config}><code>{config}</code></li>
                ))}
              </ul>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Reportes POS</h1>
        <p className="subtitle">Sistema de reportes diarios</p>
      </header>

      <main className="main">
        {/* Controls */}
        <div className="controls">
          <div className="date-nav">
            <button onClick={() => navigateDate('prev')} className="btn-icon">
              ←
            </button>
            <div className="date-display">
              <h2>{getDateRangeText()}</h2>
            </div>
            <button onClick={() => navigateDate('next')} className="btn-icon">
              →
            </button>
          </div>

          <div className="view-controls">
            <button
              onClick={goToToday}
              className="btn-secondary"
            >
              Hoy
            </button>

            <div className="period-tabs">
              {(['day', 'week', 'month', 'year'] as ViewPeriod[]).map(period => (
                <button
                  key={period}
                  onClick={() => setViewPeriod(period)}
                  className={`tab ${viewPeriod === period ? 'active' : ''}`}
                >
                  {period === 'day' ? 'Día' : period === 'week' ? 'Semana' : period === 'month' ? 'Mes' : 'Año'}
                </button>
              ))}
            </div>

            <button
              onClick={loadReports}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {currentReport ? (
          <>
            {/* Summary Cards */}
            <div className="summary-grid">
              <div className="summary-card">
                <div className="card-icon">💰</div>
                <div className="card-content">
                  <div className="card-label">Ventas Totales</div>
                  <div className="card-value">{formatCurrency(currentReport.ventas_totales)}</div>
                  <div className="card-detail">
                    DIAN: {formatCurrency(currentReport.ventas_dian)}
                  </div>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">📋</div>
                <div className="card-content">
                  <div className="card-label">Órdenes</div>
                  <div className="card-value">{currentReport.ordenes}</div>
                  <div className="card-detail">
                    Promedio: {formatCurrency(currentReport.ticket_promedio)}
                  </div>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">🍽️</div>
                <div className="card-content">
                  <div className="card-label">Productos Vendidos</div>
                  <div className="card-value">{currentReport.productos_vendidos}</div>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">📊</div>
                <div className="card-content">
                  <div className="card-label">Ventas No DIAN</div>
                  <div className="card-value">{formatCurrency(currentReport.ventas_no_dian)}</div>
                  <div className="card-detail">
                    {((currentReport.ventas_no_dian / currentReport.ventas_totales) * 100).toFixed(1)}% del total
                  </div>
                </div>
              </div>
            </div>

            {/* Products Table */}
            {currentReport.detalle_productos && currentReport.detalle_productos.length > 0 && (
              <div className="products-section">
                <h3>Productos Vendidos</h3>
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentReport.detalle_productos.map((product, idx) => (
                        <tr key={idx}>
                          <td>{product.product_name}</td>
                          <td>{product.quantity}</td>
                          <td>{formatCurrency(product.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No hay datos para la fecha seleccionada</p>
            <p className="empty-hint">Intenta seleccionar otra fecha o actualiza los reportes</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Disponible offline • Última actualización: {new Date().toLocaleTimeString('es-CO')}</p>
      </footer>
    </div>
  )
}

export default App
