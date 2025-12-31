import { useState, useEffect } from 'react'
import { googleSheetsService, type ReportData, type ProductDetail, type OrderTypeDetail, type PaymentMethodDetail, type CashMovementDetail } from './services/googleSheets'
import { InvoiceLimitsSettings } from './components/InvoiceLimitsSettings'
import { Login } from './components/Login'
import { Orders } from './components/Orders'
import { authApiService, type AuthUser } from './services/authApi'
import './App.css'

type ViewPeriod = 'day' | 'week' | 'month' | 'year'
type AppView = 'reports' | 'settings' | 'orders'
type Theme = 'light' | 'dark' | 'system'

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  // Theme state
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('pwa-theme')
    return (saved as Theme) || 'system'
  })

  // App navigation
  const [currentView, setCurrentView] = useState<AppView>('reports')

  // Helper function to get current date/time in Colombia timezone
  const getColombiaDate = (): Date => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  }

  const [reports, setReports] = useState<ReportData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [missingConfig, setMissingConfig] = useState<string[]>([])

  // Date navigation - initialize with Colombia timezone
  const [selectedDate, setSelectedDate] = useState<Date>(getColombiaDate())
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('day')
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null)

  // Products tab navigation
  const [selectedProductsTab, setSelectedProductsTab] = useState<'total' | string>('total')

  // Cash movements accordion state
  const [showCashMovements, setShowCashMovements] = useState(false)

  // Apply theme to document
  useEffect(() => {
    const applyTheme = (newTheme: Theme) => {
      if (newTheme === 'system') {
        // Remove data-theme to let CSS handle it via prefers-color-scheme
        document.documentElement.removeAttribute('data-theme')
      } else {
        document.documentElement.setAttribute('data-theme', newTheme)
      }
      localStorage.setItem('pwa-theme', newTheme)
    }
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(current => {
      if (current === 'system') return 'light'
      if (current === 'light') return 'dark'
      return 'system'
    })
  }

  const getThemeIcon = () => {
    if (theme === 'light') return '☀️'
    if (theme === 'dark') return '🌙'
    return '🔄' // system
  }

  const getThemeLabel = () => {
    if (theme === 'light') return 'Claro'
    if (theme === 'dark') return 'Oscuro'
    return 'Auto'
  }

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const user = authApiService.getUser()
      if (user && authApiService.isAuthenticated()) {
        setCurrentUser(user)
        setIsAuthenticated(true)
      }
      setAuthChecking(false)
    }
    checkAuth()
  }, [])

  useEffect(() => {
    // Only check config and load reports if authenticated
    if (!isAuthenticated) return

    const configured = googleSheetsService.isConfigured()
    setIsConfigured(configured)

    if (!configured) {
      const missing = googleSheetsService.getMissingConfig()
      setMissingConfig(missing)
    } else {
      // Auto-load today's report on mount
      // Pass true to skip the isConfigured check since we just verified it
      loadReports(true)
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Update current report when date or reports change
    if (reports.length > 0) {
      updateCurrentReport()
    }
  }, [selectedDate, reports, viewPeriod])

  const loadReports = async (skipConfigCheck = false) => {
    // Check configuration - either skip if already verified, or check against service directly
    const actuallyConfigured = skipConfigCheck || googleSheetsService.isConfigured()

    if (!actuallyConfigured) {
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
    if (viewPeriod === 'day') {
      // For day view, find exact date match
      const dateStr = formatDateForFilter(selectedDate)
      const found = reports.find(r => r.fecha === dateStr)
      setCurrentReport(found || null)
    } else {
      // For week/month/year, aggregate reports in that period
      const periodReports = getReportsInPeriod()
      if (periodReports.length > 0) {
        const aggregated = aggregateReports(periodReports)
        setCurrentReport(aggregated)
      } else {
        setCurrentReport(null)
      }
    }
  }

  // CRITICAL: Format date in Colombia timezone (UTC-5) to avoid timezone issues
  // When it's 9 PM in Colombia, server might be in different timezone
  const formatDateForFilter = (date: Date): string => {
    // Use Colombia timezone (UTC-5)
    const colombiaDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const year = colombiaDate.getFullYear()
    const month = String(colombiaDate.getMonth() + 1).padStart(2, '0')
    const day = String(colombiaDate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper to parse YYYY-MM-DD date strings from CSV in Colombia timezone
  const parseDateFromCSV = (dateStr: string): Date => {
    // Parse as local date in Colombia timezone to avoid UTC conversion issues
    const [year, month, day] = dateStr.split('-').map(Number)
    // Create date at noon Colombia time to avoid edge cases with midnight
    const colombiaDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00`
    return new Date(new Date(colombiaDateStr).toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  }

  const getReportsInPeriod = (): ReportData[] => {
    const date = new Date(selectedDate)

    switch (viewPeriod) {
      case 'week': {
        // Get start of week (Sunday) in Colombia timezone
        const startOfWeek = new Date(date)
        startOfWeek.setDate(date.getDate() - date.getDay())
        startOfWeek.setHours(0, 0, 0, 0)

        // Get end of week (Saturday)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        endOfWeek.setHours(23, 59, 59, 999)

        return reports.filter(r => {
          const reportDate = parseDateFromCSV(r.fecha)
          return reportDate >= startOfWeek && reportDate <= endOfWeek
        })
      }

      case 'month': {
        const year = date.getFullYear()
        const month = date.getMonth()

        return reports.filter(r => {
          const reportDate = parseDateFromCSV(r.fecha)
          return reportDate.getFullYear() === year && reportDate.getMonth() === month
        })
      }

      case 'year': {
        const year = date.getFullYear()

        return reports.filter(r => {
          const reportDate = parseDateFromCSV(r.fecha)
          return reportDate.getFullYear() === year
        })
      }

      default:
        return []
    }
  }

  const aggregateReports = (periodReports: ReportData[]): ReportData => {
    // Combine all product details from all reports
    const allProducts: { [key: string]: ProductDetail } = {}

    periodReports.forEach(report => {
      if (report.detalle_productos) {
        report.detalle_productos.forEach(product => {
          if (allProducts[product.product_name]) {
            allProducts[product.product_name].quantity += product.quantity
            allProducts[product.product_name].total += product.total
          } else {
            allProducts[product.product_name] = { ...product }
          }
        })
      }
    })

    // Convert back to array and sort by total
    const aggregatedProducts = Object.values(allProducts).sort((a, b) => b.total - a.total)

    // Aggregate products by order type
    const orderTypeMap: { [key: string]: OrderTypeDetail } = {}

    periodReports.forEach(report => {
      if (report.detalle_tipos_pedido && Array.isArray(report.detalle_tipos_pedido)) {
        report.detalle_tipos_pedido.forEach(orderTypeDetail => {
          const orderType = orderTypeDetail.order_type

          if (!orderTypeMap[orderType]) {
            orderTypeMap[orderType] = {
              order_type: orderType,
              amount: 0,
              count: 0,
              hide_amount: orderTypeDetail.hide_amount || false,
              products: []
            }
          }

          orderTypeMap[orderType].amount += orderTypeDetail.amount
          orderTypeMap[orderType].count += orderTypeDetail.count

          // Aggregate products for this order type
          const productsMap: { [key: string]: ProductDetail } = {}

          // Convert existing products array to map
          orderTypeMap[orderType].products.forEach(p => {
            productsMap[p.product_name] = p
          })

          // Add/merge new products
          orderTypeDetail.products?.forEach(product => {
            if (productsMap[product.product_name]) {
              productsMap[product.product_name].quantity += product.quantity
              productsMap[product.product_name].total += product.total
            } else {
              productsMap[product.product_name] = { ...product }
            }
          })

          // Convert back to array and sort
          orderTypeMap[orderType].products = Object.values(productsMap).sort((a, b) => b.total - a.total)
        })
      }
    })

    const aggregatedOrderTypes = Object.values(orderTypeMap)

    // Aggregate payment methods
    const paymentMethodMap: { [key: string]: PaymentMethodDetail } = {}

    periodReports.forEach(report => {
      if (report.detalle_tipos_pago) {
        report.detalle_tipos_pago.forEach(paymentDetail => {
          const paymentMethod = paymentDetail.payment_method

          if (!paymentMethodMap[paymentMethod]) {
            paymentMethodMap[paymentMethod] = {
              payment_method: paymentMethod,
              amount: 0,
              count: 0
            }
          }

          paymentMethodMap[paymentMethod].amount += paymentDetail.amount
          paymentMethodMap[paymentMethod].count += paymentDetail.count
        })
      }
    })

    const aggregatedPaymentMethods = Object.values(paymentMethodMap)

    // Aggregate cash movements
    const allMovements: CashMovementDetail[] = []
    let totalDepositos = 0
    let totalRetiros = 0

    periodReports.forEach(report => {
      if (report.detalle_movimientos) {
        allMovements.push(...report.detalle_movimientos)
      }
      totalDepositos += (report.total_depositos || 0)
      totalRetiros += (report.total_retiros || 0)
    })

    // Sort movements by date (earliest first)
    allMovements.sort((a, b) => a.time.localeCompare(b.time))

    // Get period label for fecha field
    const getPeriodLabel = (): string => {
      switch (viewPeriod) {
        case 'week': {
          const startOfWeek = new Date(selectedDate)
          startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay())
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 6)
          return `${formatDateForFilter(startOfWeek)} a ${formatDateForFilter(endOfWeek)}`
        }
        case 'month':
          return selectedDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
        case 'year':
          return selectedDate.getFullYear().toString()
        default:
          return formatDateForFilter(selectedDate)
      }
    }

    // Sum all metrics
    return {
      fecha: getPeriodLabel(),
      ventas_totales: periodReports.reduce((sum, r) => sum + r.ventas_totales, 0),
      ventas_dian: periodReports.reduce((sum, r) => sum + r.ventas_dian, 0),
      ventas_no_dian: periodReports.reduce((sum, r) => sum + r.ventas_no_dian, 0),
      ordenes: periodReports.reduce((sum, r) => sum + r.ordenes, 0),
      productos_vendidos: periodReports.reduce((sum, r) => sum + r.productos_vendidos, 0),
      ticket_promedio: periodReports.reduce((sum, r) => sum + r.ventas_totales, 0) /
                       periodReports.reduce((sum, r) => sum + r.ordenes, 0),
      detalle_productos: aggregatedProducts,
      detalle_tipos_pago: aggregatedPaymentMethods,
      detalle_tipos_pedido: aggregatedOrderTypes,
      detalle_movimientos: allMovements,
      total_depositos: totalDepositos,
      total_retiros: totalRetiros
    }
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
    setSelectedDate(getColombiaDate())
  }

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    authApiService.logout()
    setCurrentUser(null)
    setIsAuthenticated(false)
    setReports([])
    setCurrentReport(null)
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

  // Show loading while checking auth
  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>Cargando...</div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />
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
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}>
          <div>
            <h1 style={{ margin: 0 }}>Reportes POS</h1>
            <p className="subtitle" style={{ margin: '4px 0 0 0' }}>Sistema de reportes y configuración</p>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: '14px',
            }}>
              {currentUser?.name || currentUser?.username}
            </span>
            <button
              onClick={toggleTheme}
              title={`Tema: ${getThemeLabel()}`}
              style={{
                padding: '8px 12px',
                border: 'none',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              {getThemeIcon()}
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs" style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginTop: '1rem',
        }}>
          <button
            onClick={() => setCurrentView('reports')}
            className={`nav-tab ${currentView === 'reports' ? 'active' : ''}`}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              background: currentView === 'reports' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
              color: currentView === 'reports' ? 'var(--primary-color)' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
            }}
          >
            📊 Reportes
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`nav-tab ${currentView === 'settings' ? 'active' : ''}`}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              background: currentView === 'settings' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
              color: currentView === 'settings' ? 'var(--primary-color)' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
            }}
          >
            ⚙️ Configuración
          </button>
          <button
            onClick={() => setCurrentView('orders')}
            className={`nav-tab ${currentView === 'orders' ? 'active' : ''}`}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              background: currentView === 'orders' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
              color: currentView === 'orders' ? 'var(--primary-color)' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s',
            }}
          >
            🛒 Pedidos
          </button>
        </div>
      </header>

      <main className="main">
        {/* Settings View */}
        {currentView === 'settings' && (
          <InvoiceLimitsSettings />
        )}

        {/* Orders View */}
        {currentView === 'orders' && (
          <Orders />
        )}

        {/* Reports View */}
        {currentView === 'reports' && (
          <>
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
              onClick={() => loadReports()}
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
                </div>
              </div>

              <div className="summary-card" style={{ borderLeft: '4px solid #4CAF50' }}>
                <div className="card-icon">✅</div>
                <div className="card-content">
                  <div className="card-label">Ventas DIAN</div>
                  <div className="card-value" style={{ color: '#4CAF50' }}>{formatCurrency(currentReport.ventas_dian)}</div>
                  <div className="card-detail">
                    {currentReport.ventas_totales > 0
                      ? ((currentReport.ventas_dian / currentReport.ventas_totales) * 100).toFixed(1)
                      : '0'}% del total
                  </div>
                </div>
              </div>

              <div className="summary-card" style={{ borderLeft: '4px solid #FF9800' }}>
                <div className="card-icon">📊</div>
                <div className="card-content">
                  <div className="card-label">Ventas No DIAN</div>
                  <div className="card-value" style={{ color: '#FF9800' }}>{formatCurrency(currentReport.ventas_no_dian)}</div>
                  <div className="card-detail">
                    {currentReport.ventas_totales > 0
                      ? ((currentReport.ventas_no_dian / currentReport.ventas_totales) * 100).toFixed(1)
                      : '0'}% del total
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
            </div>

            {/* Payment Methods Section */}
            {currentReport.detalle_tipos_pago && currentReport.detalle_tipos_pago.length > 0 && (
              <div className="products-section">
                <h3>Métodos de Pago</h3>
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Método de Pago</th>
                        <th>Cantidad</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentReport.detalle_tipos_pago.map((payment, idx) => (
                        <tr key={idx}>
                          <td>{payment.payment_method}</td>
                          <td>{payment.count}</td>
                          <td>{formatCurrency(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Products Section with Tabs */}
            {currentReport.detalle_productos && currentReport.detalle_productos.length > 0 && (
              <div className="products-section">
                <h3>Productos Vendidos</h3>

                {/* Tabs for Total and Order Types */}
                <div className="period-tabs" style={{ marginBottom: '20px' }}>
                  <button
                    onClick={() => setSelectedProductsTab('total')}
                    className={`tab ${selectedProductsTab === 'total' ? 'active' : ''}`}
                  >
                    Total
                  </button>

                  {(Array.isArray(currentReport.detalle_tipos_pedido) ? currentReport.detalle_tipos_pedido : []).map((orderTypeDetail) => (
                    <button
                      key={orderTypeDetail.order_type}
                      onClick={() => setSelectedProductsTab(orderTypeDetail.order_type)}
                      className={`tab ${selectedProductsTab === orderTypeDetail.order_type ? 'active' : ''}`}
                    >
                      {orderTypeDetail.order_type}
                    </button>
                  ))}
                </div>

                {/* Products Table */}
                <div className="products-table">
                  {selectedProductsTab === 'total' ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      {(() => {
                        const orderTypeDetail = (Array.isArray(currentReport.detalle_tipos_pedido) ? currentReport.detalle_tipos_pedido : []).find(
                          ot => ot.order_type === selectedProductsTab
                        )

                        if (!orderTypeDetail) return null

                        return (
                          <>
                            <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {!orderTypeDetail.hide_amount && (
                                  <div>
                                    <strong>Ventas {orderTypeDetail.order_type}:</strong> {formatCurrency(orderTypeDetail.amount)}
                                  </div>
                                )}
                                <div>
                                  <strong>Órdenes:</strong> {orderTypeDetail.count}
                                </div>
                              </div>
                            </div>

                            <table>
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Cantidad</th>
                                  {!orderTypeDetail.hide_amount && <th>Total</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {orderTypeDetail.products && orderTypeDetail.products.length > 0 ? (
                                  orderTypeDetail.products.map((product, idx) => (
                                    <tr key={idx}>
                                      <td>{product.product_name}</td>
                                      <td>{product.quantity}</td>
                                      {!orderTypeDetail.hide_amount && <td>{formatCurrency(product.total)}</td>}
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={orderTypeDetail.hide_amount ? 2 : 3} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                      No hay productos para este tipo de orden
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </>
                        )
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Cash Movements Section - Accordion */}
            {currentReport.detalle_movimientos && (currentReport.total_depositos! > 0 || currentReport.total_retiros! > 0) && (
              <div className="products-section" style={{ marginTop: '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '16px 0',
                    borderBottom: showCashMovements ? '2px solid #e0e0e0' : 'none'
                  }}
                  onClick={() => setShowCashMovements(!showCashMovements)}
                >
                  <h3 style={{ margin: 0 }}>💰 Movimientos de Caja</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>
                      Depósitos: {formatCurrency(currentReport.total_depositos || 0)} |
                      Retiros: {formatCurrency(currentReport.total_retiros || 0)} |
                      Neto: {formatCurrency((currentReport.total_depositos || 0) - (currentReport.total_retiros || 0))}
                    </span>
                    <span style={{ fontSize: '20px' }}>{showCashMovements ? '▼' : '▶'}</span>
                  </div>
                </div>

                {showCashMovements && currentReport.detalle_movimientos.length > 0 && (
                  <div className="products-table" style={{ marginTop: '16px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Hora</th>
                          <th style={{ width: '100px' }}>Tipo</th>
                          <th style={{ width: '120px', textAlign: 'right' }}>Monto</th>
                          <th>Razón</th>
                          <th style={{ width: '150px' }}>Empleado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentReport.detalle_movimientos.map((movement, idx) => (
                          <tr key={idx}>
                            <td>{movement.time}</td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                backgroundColor: movement.type === 'deposit' ? '#d4edda' : '#f8d7da',
                                color: movement.type === 'deposit' ? '#155724' : '#721c24'
                              }}>
                                {movement.type === 'deposit' ? 'Depósito' : 'Retiro'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: movement.type === 'deposit' ? '#155724' : '#721c24' }}>
                              {movement.type === 'deposit' ? '+' : '-'}{formatCurrency(Math.abs(movement.amount))}
                            </td>
                            <td>{movement.reason || movement.description}</td>
                            <td>{movement.employee}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {showCashMovements && currentReport.detalle_movimientos.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#666' }}>
                    No hay movimientos de caja para este período
                  </div>
                )}
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
          </>
        )}
      </main>

      <footer className="footer">
        <p>Disponible offline • Última actualización: {new Date().toLocaleTimeString('es-CO')}</p>
      </footer>
    </div>
  )
}

export default App
