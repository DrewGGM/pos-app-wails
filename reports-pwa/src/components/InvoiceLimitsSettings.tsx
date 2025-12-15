import { useState, useEffect } from 'react'
import { configApiService, type InvoiceLimitConfig, type InvoiceLimitStatus } from '../services/configApi'

const DAY_NAMES: { [key: string]: string } = {
  'limite_lunes': 'Lunes',
  'limite_martes': 'Martes',
  'limite_miercoles': 'Miércoles',
  'limite_jueves': 'Jueves',
  'limite_viernes': 'Viernes',
  'limite_sabado': 'Sábado',
  'limite_domingo': 'Domingo',
}

const DAY_ORDER = [
  'limite_lunes',
  'limite_martes',
  'limite_miercoles',
  'limite_jueves',
  'limite_viernes',
  'limite_sabado',
  'limite_domingo',
]

export function InvoiceLimitsSettings() {
  const [config, setConfig] = useState<InvoiceLimitConfig | null>(null)
  const [status, setStatus] = useState<InvoiceLimitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  // Editable state
  const [editEnabled, setEditEnabled] = useState(false)
  const [editLimits, setEditLimits] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    checkConfiguration()
  }, [])

  const checkConfiguration = async () => {
    const configured = configApiService.isConfigured()
    setIsConfigured(configured)

    if (configured) {
      const connected = await configApiService.healthCheck()
      setIsConnected(connected)

      if (connected) {
        await loadData()
      } else {
        setLoading(false)
        setError('No se puede conectar con el servidor de configuración')
      }
    } else {
      setLoading(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [configData, statusData] = await Promise.all([
        configApiService.getInvoiceLimits(),
        configApiService.getInvoiceLimitStatus(),
      ])

      setConfig(configData)
      setStatus(statusData)
      setEditEnabled(configData.enabled)

      // Initialize edit limits
      const limits: { [key: string]: string } = {}
      DAY_ORDER.forEach(day => {
        limits[day] = formatNumber(configData.day_limits[day] || 0)
      })
      setEditLimits(limits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar configuración')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Parse limits
      const dayLimits: { [key: string]: number } = {}
      DAY_ORDER.forEach(day => {
        dayLimits[day] = parseNumber(editLimits[day] || '0')
      })

      const updatedConfig = await configApiService.updateInvoiceLimits({
        enabled: editEnabled,
        day_limits: dayLimits,
      })

      setConfig(updatedConfig)
      setSuccess('Configuración guardada y sincronizada con Google Sheets')

      // Reload status
      const newStatus = await configApiService.getInvoiceLimitStatus()
      setStatus(newStatus)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setError('')
    setSuccess('')

    try {
      const syncedConfig = await configApiService.syncConfig()
      setConfig(syncedConfig)
      setEditEnabled(syncedConfig.enabled)

      // Update edit limits
      const limits: { [key: string]: string } = {}
      DAY_ORDER.forEach(day => {
        limits[day] = formatNumber(syncedConfig.day_limits[day] || 0)
      })
      setEditLimits(limits)

      // Reload status
      const newStatus = await configApiService.getInvoiceLimitStatus()
      setStatus(newStatus)

      setSuccess('Configuración sincronizada desde Google Sheets')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const formatNumber = (num: number): string => {
    return num.toLocaleString('es-CO')
  }

  const parseNumber = (str: string): number => {
    const cleaned = str.replace(/[.,\s]/g, '')
    return parseInt(cleaned) || 0
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handleLimitChange = (day: string, value: string) => {
    // Only allow numbers and formatting characters
    const cleaned = value.replace(/[^\d]/g, '')
    const num = parseInt(cleaned) || 0
    setEditLimits(prev => ({
      ...prev,
      [day]: formatNumber(num),
    }))
  }

  if (!isConfigured) {
    return (
      <div className="config-error">
        <div className="config-icon">⚙️</div>
        <h2>Configuración Requerida</h2>
        <p>Para usar esta función, configura la URL del servidor de configuración.</p>
        <div className="missing-config">
          <h3>Variable de entorno faltante:</h3>
          <ul>
            <li><code>VITE_CONFIG_API_URL</code></li>
          </ul>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Ejemplo: <code>https://tu-dominio.com</code> o <code>http://localhost:8082</code>
          </p>
        </div>
      </div>
    )
  }

  if (!isConnected && !loading) {
    return (
      <div className="config-error">
        <div className="config-icon">🔌</div>
        <h2>Sin Conexión</h2>
        <p>No se puede conectar con el servidor de configuración.</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
          Verifica tu conexión a internet y que el servidor esté en línea.
        </p>
        <button onClick={checkConfiguration} className="btn-primary" style={{ marginTop: '1.5rem' }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⏳</div>
        <p>Cargando configuración...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Status Card */}
      {status && (
        <div className="summary-card" style={{
          borderLeft: `4px solid ${status.available ? 'var(--success-color)' : 'var(--error-color)'}`,
        }}>
          <div className="card-icon">{status.available ? '✅' : '🚫'}</div>
          <div className="card-content">
            <div className="card-label">Estado Facturación Electrónica</div>
            <div className="card-value" style={{
              color: status.available ? 'var(--success-color)' : 'var(--error-color)',
              fontSize: '1.25rem',
            }}>
              {status.available ? 'Disponible' : 'No Disponible'}
            </div>
            <div className="card-detail">{status.message}</div>
            {status.enabled && status.today_limit > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                <strong>Hoy ({status.day_name}):</strong> {formatCurrency(status.today_sales)} de {formatCurrency(status.today_limit)}
                {status.remaining_amount > 0 && (
                  <span style={{ color: 'var(--success-color)', marginLeft: '0.5rem' }}>
                    (Restante: {formatCurrency(status.remaining_amount)})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          background: 'var(--success-color)',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          ✅ {success}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="products-section">
        <h3>⚡ Control General</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editEnabled}
              onChange={(e) => setEditEnabled(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 500 }}>
              {editEnabled ? 'Límites Activados' : 'Límites Desactivados'}
            </span>
          </label>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {editEnabled
              ? 'Los límites diarios están activos'
              : 'No hay límites, facturación siempre disponible'}
          </span>
        </div>
      </div>

      {/* Day Limits */}
      <div className="products-section">
        <h3>📅 Límites por Día</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Configura el monto máximo de facturación electrónica para cada día de la semana.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          opacity: editEnabled ? 1 : 0.5,
          pointerEvents: editEnabled ? 'auto' : 'none',
        }}>
          {DAY_ORDER.map(day => (
            <div key={day} style={{
              background: 'var(--bg-color)',
              padding: '1rem',
              borderRadius: '8px',
            }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                {DAY_NAMES[day]}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>$</span>
                <input
                  type="text"
                  value={editLimits[day] || ''}
                  onChange={(e) => handleLimitChange(day, e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    textAlign: 'right',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-secondary"
        >
          {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar desde Sheets'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? '⏳ Guardando...' : '💾 Guardar Cambios'}
        </button>
      </div>

      {/* Info */}
      {config && (
        <div style={{
          background: 'var(--bg-color)',
          padding: '1rem',
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
        }}>
          <strong>ℹ️ Información:</strong>
          <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
            <li>Los cambios se guardan automáticamente en Google Sheets</li>
            <li>Intervalo de sincronización: {config.sync_interval} minutos</li>
            {config.last_sync && (
              <li>Última sincronización: {new Date(config.last_sync).toLocaleString('es-CO')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
