import { useState, useEffect, useCallback } from 'react'
import {
  ordersApiService,
  type OrderType,
  type Category,
  type Product,
  type CartItem,
  type CartItemModifier,
  type Modifier,
  type PendingOrder,
  type Table,
  type Sale,
} from '../services/ordersApi'
import { authApiService } from '../services/authApi'

type OrdersView = 'create' | 'pending' | 'sales'

export function Orders() {
  // View state
  const [currentOrdersView, setCurrentOrdersView] = useState<OrdersView>('create')

  // Pending orders state
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null)

  // Sales history state
  const [sales, setSales] = useState<Sale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState('')
  const [expandedSale, setExpandedSale] = useState<number | null>(null)

  // Data state
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // Selection state
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Table selection state (for dine-in orders)
  const [tables, setTables] = useState<Table[]>([])
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [tablesLoading, setTablesLoading] = useState(false)

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')

  // Delivery info state
  const [deliveryInfo, setDeliveryInfo] = useState({
    name: '',
    address: '',
    phone: '',
  })

  // UI state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCartDrawer, setShowCartDrawer] = useState(false)

  // Modal state for product customization
  const [modalQuantity, setModalQuantity] = useState(1)
  const [modalNotes, setModalNotes] = useState('')
  const [modalModifiers, setModalModifiers] = useState<CartItemModifier[]>([])

  // Load pending orders
  const loadPendingOrders = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setPendingLoading(true)
    }
    setPendingError('')

    try {
      const orders = await ordersApiService.getPendingOrders()
      setPendingOrders(orders)
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : 'Error al cargar pedidos')
    } finally {
      setPendingLoading(false)
    }
  }, [])

  // Load sales history
  const loadSales = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setSalesLoading(true)
    }
    setSalesError('')

    try {
      const salesData = await ordersApiService.getSales()
      setSales(salesData)
    } catch (err) {
      setSalesError(err instanceof Error ? err.message : 'Error al cargar ventas')
    } finally {
      setSalesLoading(false)
    }
  }, [])

  // Load data on mount (including pending orders count)
  useEffect(() => {
    loadData()
    loadPendingOrders(false) // Load without showing loading spinner for counter
  }, [])

  // Reload pending orders when switching to pending view
  useEffect(() => {
    if (currentOrdersView === 'pending') {
      loadPendingOrders()
    }
  }, [currentOrdersView, loadPendingOrders])

  // Reload sales when switching to sales view
  useEffect(() => {
    if (currentOrdersView === 'sales') {
      loadSales()
    }
  }, [currentOrdersView, loadSales])

  // Prevent body scroll when modal or cart drawer is open
  useEffect(() => {
    if (showProductModal || showCartDrawer) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showProductModal, showCartDrawer])

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [orderTypesData, productsData] = await Promise.all([
        ordersApiService.getOrderTypes(),
        ordersApiService.getProducts(),
      ])

      setOrderTypes(orderTypesData)
      // Add "Todos" category at the beginning
      const allCategory: Category = { id: 0, name: 'Todos', icon: '📋' }
      setCategories([allCategory, ...productsData.categories])
      setProducts(productsData.products)

      // Select "Todos" category by default (id: 0)
      setSelectedCategory(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  // Check if order type requires table selection
  const isDineInOrderType = (code: string) => {
    const dineInCodes = ['dine_in', 'dine-in', 'comer_aqui', 'comer-aqui', 'mesa', 'local']
    return dineInCodes.includes(code.toLowerCase())
  }

  // Map icon names to emojis
  const getIconEmoji = (icon: string): string => {
    // If it's already an emoji, return it
    if (/\p{Emoji}/u.test(icon)) return icon

    // Map common icon names to emojis
    const iconMap: Record<string, string> = {
      'restaurant': '🍽️',
      'dine-in': '🍽️',
      'local_dining': '🍽️',
      'takeout': '🥡',
      'takeaway': '🥡',
      'shopping_bag': '🛍️',
      'delivery': '🚚',
      'local_shipping': '🚚',
      'motorcycle': '🏍️',
      'directions_bike': '🚴',
      'fastfood': '🍔',
      'pizza': '🍕',
      'coffee': '☕',
      'local_cafe': '☕',
      'store': '🏪',
      'home': '🏠',
      'phone': '📞',
      'app': '📱',
      'web': '🌐',
    }

    return iconMap[icon.toLowerCase()] || '📦'
  }

  // Load available tables
  const loadTables = async () => {
    setTablesLoading(true)
    try {
      const tablesData = await ordersApiService.getTables()
      setTables(tablesData)
    } catch (err) {
      console.error('Error loading tables:', err)
      setTables([])
    } finally {
      setTablesLoading(false)
    }
  }

  const handleOrderTypeSelect = (orderType: OrderType) => {
    setSelectedOrderType(orderType)
    setSelectedTable(null) // Reset table selection

    // Clear delivery info if not delivery
    if (orderType.code !== 'delivery') {
      setDeliveryInfo({ name: '', address: '', phone: '' })
    }

    // Load tables if dine-in order
    if (isDineInOrderType(orderType.code)) {
      loadTables()
    }
  }

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product)
    setModalQuantity(1)
    setModalNotes('')
    setModalModifiers([])
    setShowProductModal(true)
  }

  const handleModifierToggle = (modifier: Modifier, group: { multiple: boolean }) => {
    setModalModifiers(prev => {
      const exists = prev.find(m => m.modifier_id === modifier.id)
      if (exists) {
        // Remove modifier
        return prev.filter(m => m.modifier_id !== modifier.id)
      } else {
        if (group.multiple) {
          // Add modifier (multiple allowed)
          return [...prev, {
            modifier_id: modifier.id,
            name: modifier.name,
            price_change: modifier.price_change,
          }]
        } else {
          // Replace modifier in same group (single select)
          const otherModifiers = prev.filter(m => {
            const mod = selectedProduct?.modifier_groups
              .flatMap(g => g.modifiers)
              .find(gm => gm.id === m.modifier_id)
            return mod ? !selectedProduct?.modifier_groups.find(g =>
              g.modifiers.some(gm => gm.id === mod.id) &&
              g.modifiers.some(gm => gm.id === modifier.id)
            ) : true
          })
          return [...otherModifiers, {
            modifier_id: modifier.id,
            name: modifier.name,
            price_change: modifier.price_change,
          }]
        }
      }
    })
  }

  const handleAddToCart = () => {
    if (!selectedProduct) return

    const newItem: CartItem = {
      product: selectedProduct,
      quantity: modalQuantity,
      notes: modalNotes,
      modifiers: modalModifiers,
    }

    setCart(prev => [...prev, newItem])
    setShowProductModal(false)
    setSelectedProduct(null)
  }

  const handleRemoveFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const newQuantity = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQuantity }
      }
      return item
    }))
  }

  const handleSubmitOrder = async () => {
    if (!selectedOrderType) {
      setError('Selecciona un tipo de pedido')
      return
    }

    if (cart.length === 0) {
      setError('Agrega al menos un producto')
      return
    }

    // Validate delivery info if delivery order
    if (selectedOrderType.code === 'delivery') {
      if (!deliveryInfo.name.trim() || !deliveryInfo.address.trim() || !deliveryInfo.phone.trim()) {
        setError('Completa la informacion de entrega')
        return
      }
    }

    // Validate table selection for dine-in orders
    if (isDineInOrderType(selectedOrderType.code) && !selectedTable) {
      setError('Selecciona una mesa para el pedido')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const user = authApiService.getUser()

      const result = await ordersApiService.createOrder({
        order_type_id: selectedOrderType.id,
        employee_id: user?.id || 0,
        table_id: selectedTable?.id, // Include table_id for dine-in orders
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          notes: item.notes,
          modifiers: item.modifiers.map(m => ({
            modifier_id: m.modifier_id,
            price_change: m.price_change,
          })),
        })),
        notes: orderNotes,
        delivery_customer_name: deliveryInfo.name,
        delivery_address: deliveryInfo.address,
        delivery_phone: deliveryInfo.phone,
      })

      setSuccess(`Orden ${result.order_number} creada exitosamente!`)

      // Reset form
      setCart([])
      setOrderNotes('')
      setDeliveryInfo({ name: '', address: '', phone: '' })
      setSelectedOrderType(null)
      setSelectedTable(null) // Reset table selection

      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear orden')
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatOrderTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente'
      case 'preparing': return 'Preparando'
      case 'ready': return 'Listo'
      default: return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800'
      case 'preparing': return '#2196F3'
      case 'ready': return '#4CAF50'
      default: return '#666'
    }
  }

  // Filter products: show all if category is 0 (Todos), otherwise filter by category
  const filteredProducts = selectedCategory === 0
    ? products
    : products.filter(p => p.category_id === selectedCategory)

  const cartTotal = ordersApiService.calculateCartTotal(cart)

  if (loading) {
    return (
      <div className="orders-loading">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="orders-container">
      {/* View Tabs */}
      <div className="orders-view-tabs">
        <button
          className={`orders-view-tab ${currentOrdersView === 'create' ? 'active' : ''}`}
          onClick={() => setCurrentOrdersView('create')}
        >
          ➕ Crear Pedido
        </button>
        <button
          className={`orders-view-tab ${currentOrdersView === 'pending' ? 'active' : ''}`}
          onClick={() => setCurrentOrdersView('pending')}
        >
          📋 Ver Pedidos ({pendingOrders.length})
        </button>
        <button
          className={`orders-view-tab ${currentOrdersView === 'sales' ? 'active' : ''}`}
          onClick={() => setCurrentOrdersView('sales')}
        >
          💰 Ventas
        </button>
      </div>

      {/* Pending Orders View */}
      {currentOrdersView === 'pending' && (
        <div className="pending-orders-section">
          <div className="pending-orders-header">
            <h2>Pedidos Pendientes</h2>
            <button
              className="refresh-btn"
              onClick={() => loadPendingOrders()}
              disabled={pendingLoading}
            >
              {pendingLoading ? 'Cargando...' : '🔄 Actualizar'}
            </button>
          </div>

          {pendingError && (
            <div className="orders-error">
              {pendingError}
              <button onClick={() => setPendingError('')}>×</button>
            </div>
          )}

          {pendingLoading && <div className="orders-loading"><p>Cargando pedidos...</p></div>}

          {!pendingLoading && pendingOrders.length === 0 && (
            <div className="no-pending-orders">
              <span className="no-orders-icon">📭</span>
              <p>No hay pedidos pendientes</p>
            </div>
          )}

          {!pendingLoading && pendingOrders.length > 0 && (
            <div className="pending-orders-list">
              {pendingOrders.map(order => (
                <div
                  key={order.id}
                  className={`pending-order-card ${expandedOrder === order.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  <div className="pending-order-header">
                    <div className="pending-order-info">
                      <span
                        className="order-type-badge"
                        style={{ backgroundColor: order.order_type_color || '#1976d2' }}
                      >
                        {getIconEmoji(order.order_type_icon || '')} {order.order_type}
                      </span>
                      <span className="order-number">#{order.order_number}</span>
                      {order.source === 'pwa' && (
                        <span className="order-source-badge">📱 Remoto</span>
                      )}
                    </div>
                    <div className="pending-order-meta">
                      <span
                        className="order-status-badge"
                        style={{ backgroundColor: getStatusColor(order.status) }}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                      <span className="order-time">{formatOrderTime(order.created_at)}</span>
                    </div>
                  </div>

                  {/* Table Number - only for dine-in orders */}
                  {order.table_number && (
                    <div className="pending-order-table">
                      <span className="table-icon">🪑</span>
                      <span className="table-label">Mesa</span>
                      <span className="table-number-large">{order.table_number}</span>
                      {order.table_name && order.table_name !== order.table_number && (
                        <span className="table-name-small">{order.table_name}</span>
                      )}
                    </div>
                  )}

                  <div className="pending-order-summary">
                    <span>{order.items.length} items</span>
                    <span className="order-total">{formatCurrency(order.total)}</span>
                  </div>

                  {/* Expanded Details */}
                  {expandedOrder === order.id && (
                    <div className="pending-order-details" onClick={e => e.stopPropagation()}>
                      {/* Delivery Info */}
                      {order.delivery_customer_name && (
                        <div className="delivery-info-display">
                          <strong>🚚 Entrega:</strong>
                          <p>{order.delivery_customer_name}</p>
                          <p>{order.delivery_address}</p>
                          <p>📞 {order.delivery_phone}</p>
                        </div>
                      )}

                      {/* Order Notes */}
                      {order.notes && (
                        <div className="order-notes-display">
                          <strong>📝 Notas:</strong> {order.notes}
                        </div>
                      )}

                      {/* Items List */}
                      <div className="pending-order-items">
                        {order.items.map(item => (
                          <div key={item.id} className="pending-order-item">
                            <div className="item-main">
                              <span className="item-quantity">{item.quantity}x</span>
                              <span className="item-name">{item.product_name}</span>
                              <span className="item-price">{formatCurrency(item.subtotal)}</span>
                            </div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="item-modifiers">
                                {item.modifiers.filter(m => m).join(', ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="item-notes">{item.notes}</div>
                            )}
                            <div
                              className="item-status"
                              style={{ color: getStatusColor(item.status) }}
                            >
                              {getStatusLabel(item.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sales History View */}
      {currentOrdersView === 'sales' && (
        <div className="sales-history-section">
          <div className="sales-history-header">
            <h2>Historial de Ventas</h2>
            <button
              className="refresh-btn"
              onClick={() => loadSales()}
              disabled={salesLoading}
            >
              {salesLoading ? 'Cargando...' : '🔄 Actualizar'}
            </button>
          </div>

          {salesError && (
            <div className="orders-error">
              {salesError}
              <button onClick={() => setSalesError('')}>×</button>
            </div>
          )}

          {salesLoading && <div className="orders-loading"><p>Cargando ventas...</p></div>}

          {!salesLoading && sales.length === 0 && (
            <div className="no-sales">
              <span className="no-sales-icon">📊</span>
              <p>No hay ventas registradas hoy</p>
            </div>
          )}

          {!salesLoading && sales.length > 0 && (
            <div className="sales-list">
              {/* Sales Cards */}
              {sales.map(sale => (
                <div
                  key={sale.id}
                  className={`sale-card ${expandedSale === sale.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedSale(expandedSale === sale.id ? null : sale.id)}
                >
                  <div className="sale-card-header">
                    <div className="sale-info">
                      <span className="sale-number">#{sale.sale_number}</span>
                      <span className="sale-order-number">Orden: {sale.order_number}</span>
                    </div>
                    <div className="sale-meta">
                      <span className={`sale-status ${sale.status}`}>
                        {sale.status === 'completed' ? '✓ Completada' : sale.status}
                      </span>
                      <span className="sale-time">{formatOrderTime(sale.created_at)}</span>
                    </div>
                  </div>

                  <div className="sale-card-summary">
                    <div className="sale-type">
                      <span className="type-badge" style={{ backgroundColor: '#1976d2' }}>
                        {sale.order_type}
                      </span>
                      {sale.payment_method && (
                        <span className="payment-badge">
                          💳 {sale.payment_method}
                        </span>
                      )}
                    </div>
                    <span className="sale-total">{formatCurrency(sale.total)}</span>
                  </div>

                  {/* Expanded Details */}
                  {expandedSale === sale.id && (
                    <div className="sale-details" onClick={e => e.stopPropagation()}>
                      {/* Customer Info */}
                      {sale.customer_name && (
                        <div className="sale-customer">
                          <strong>👤 Cliente:</strong> {sale.customer_name}
                        </div>
                      )}

                      {/* Employee Info */}
                      {sale.employee_name && (
                        <div className="sale-employee">
                          <strong>👔 Empleado:</strong> {sale.employee_name}
                        </div>
                      )}

                      {/* Items List */}
                      <div className="sale-items">
                        <h4>Productos</h4>
                        {sale.items.map((item, idx) => (
                          <div key={idx} className="sale-item">
                            <div className="sale-item-main">
                              <span className="item-quantity">{item.quantity}x</span>
                              <span className="item-name">{item.product_name}</span>
                              <span className="item-price">{formatCurrency(item.subtotal)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Payments */}
                      {sale.payments && sale.payments.length > 0 && (
                        <div className="sale-payments">
                          <h4>Pagos</h4>
                          {sale.payments.map((payment, idx) => (
                            <div key={idx} className="payment-row">
                              <span className="payment-method">{payment.method}</span>
                              <span className="payment-amount">{formatCurrency(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Totals Breakdown */}
                      <div className="sale-totals">
                        <div className="total-row">
                          <span>Subtotal</span>
                          <span>{formatCurrency(sale.subtotal)}</span>
                        </div>
                        {sale.tax > 0 && (
                          <div className="total-row">
                            <span>Impuestos</span>
                            <span>{formatCurrency(sale.tax)}</span>
                          </div>
                        )}
                        {sale.discount > 0 && (
                          <div className="total-row discount">
                            <span>Descuento</span>
                            <span>-{formatCurrency(sale.discount)}</span>
                          </div>
                        )}
                        <div className="total-row total-final">
                          <span>Total</span>
                          <span>{formatCurrency(sale.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Order View */}
      {currentOrdersView === 'create' && (
        <>
      {error && (
        <div className="orders-error">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {success && (
        <div className="orders-success">
          {success}
          <button onClick={() => setSuccess('')}>×</button>
        </div>
      )}

      {/* Step 1: Order Type Selection */}
      {!selectedOrderType ? (
        <div className="orders-step">
          <h2>Selecciona el tipo de pedido</h2>
          <div className="order-types-grid">
            {orderTypes.map(type => (
              <button
                key={type.id}
                className="order-type-btn"
                style={{
                  backgroundColor: type.display_color || '#1976d2',
                  borderColor: type.display_color || '#1976d2',
                }}
                onClick={() => handleOrderTypeSelect(type)}
              >
                <span className="order-type-icon">{getIconEmoji(type.icon || '')}</span>
                <span className="order-type-name">{type.description || type.name}</span>
                {type.description && type.name && (
                  <span className="order-type-subtitle">{type.name}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Order Type Header */}
          <div className="orders-header">
            <button
              className="back-btn"
              onClick={() => setSelectedOrderType(null)}
            >
              ← Cambiar tipo
            </button>
            <div
              className="selected-order-type"
              style={{ backgroundColor: selectedOrderType.display_color || '#1976d2' }}
            >
              {selectedOrderType.icon} {selectedOrderType.name}
            </div>
          </div>

          {/* Delivery Info Form */}
          {selectedOrderType.code === 'delivery' && (
            <div className="delivery-form">
              <h3>Informacion de entrega</h3>
              <div className="delivery-fields">
                <input
                  type="text"
                  placeholder="Nombre del cliente"
                  value={deliveryInfo.name}
                  onChange={e => setDeliveryInfo(prev => ({ ...prev, name: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Direccion"
                  value={deliveryInfo.address}
                  onChange={e => setDeliveryInfo(prev => ({ ...prev, address: e.target.value }))}
                />
                <input
                  type="tel"
                  placeholder="Telefono"
                  value={deliveryInfo.phone}
                  onChange={e => setDeliveryInfo(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Table Selection (for dine-in orders) */}
          {isDineInOrderType(selectedOrderType.code) && (
            <div className="table-selection-section">
              <h3>Selecciona una mesa</h3>
              {tablesLoading ? (
                <div className="tables-loading">Cargando mesas...</div>
              ) : tables.length === 0 ? (
                <div className="no-tables">No hay mesas disponibles</div>
              ) : (
                <div className="tables-grid">
                  {tables.map(table => {
                    const isAvailable = table.status === 'available'
                    const isSelected = selectedTable?.id === table.id
                    return (
                      <button
                        key={table.id}
                        className={`table-btn ${isSelected ? 'selected' : ''} ${!isAvailable ? 'occupied' : ''}`}
                        onClick={() => isAvailable && setSelectedTable(table)}
                        disabled={!isAvailable}
                      >
                        <span className="table-number">{table.number}</span>
                        <span className="table-name">{table.name}</span>
                        <span className="table-capacity">👥 {table.capacity}</span>
                        {table.zone && <span className="table-zone">{table.zone}</span>}
                        <span className={`table-status ${table.status}`}>
                          {table.status === 'available' ? '✓ Disponible' :
                           table.status === 'occupied' ? '🔒 Ocupada' :
                           table.status === 'reserved' ? '📅 Reservada' : table.status}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedTable && (
                <div className="selected-table-info">
                  Mesa seleccionada: <strong>{selectedTable.name || selectedTable.number}</strong>
                </div>
              )}
            </div>
          )}

          <div className="orders-main">
            {/* Products Section */}
            <div className="products-section">
              {/* Category Tabs */}
              <div className="categories-tabs">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              <div className="products-grid">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="product-card"
                    onClick={() => handleProductClick(product)}
                  >
                    {product.image && (
                      <div className="product-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                    )}
                    <div className="product-info">
                      <h4>{product.name}</h4>
                      <p className="product-price">{formatCurrency(product.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart Section - Desktop */}
            <div className="cart-section cart-desktop">
              <h3>Carrito ({cart.length})</h3>

              {cart.length === 0 ? (
                <p className="cart-empty">No hay productos</p>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map((item, index) => (
                      <div key={index} className="cart-item">
                        <div className="cart-item-header">
                          <span className="cart-item-name">{item.product.name}</span>
                          <button
                            className="cart-item-remove"
                            onClick={() => handleRemoveFromCart(index)}
                          >
                            ×
                          </button>
                        </div>
                        {item.modifiers.length > 0 && (
                          <div className="cart-item-modifiers">
                            {item.modifiers.map(m => m.name).join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="cart-item-notes">{item.notes}</div>
                        )}
                        <div className="cart-item-footer">
                          <div className="cart-item-quantity">
                            <button onClick={() => handleUpdateQuantity(index, -1)}>-</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => handleUpdateQuantity(index, 1)}>+</button>
                          </div>
                          <span className="cart-item-total">
                            {formatCurrency(ordersApiService.calculateItemTotal(item))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="cart-notes">
                    <textarea
                      placeholder="Notas del pedido..."
                      value={orderNotes}
                      onChange={e => setOrderNotes(e.target.value)}
                    />
                  </div>

                  <div className="cart-total">
                    <span>Total:</span>
                    <span>{formatCurrency(cartTotal)}</span>
                  </div>

                  <button
                    className="submit-order-btn"
                    onClick={handleSubmitOrder}
                    disabled={submitting}
                  >
                    {submitting ? 'Creando...' : 'Crear Orden'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Floating Cart Button - Mobile */}
          <button
            className="cart-fab"
            onClick={() => setShowCartDrawer(true)}
          >
            <span className="cart-fab-icon">🛒</span>
            {cart.length > 0 && (
              <span className="cart-fab-badge">{cart.length}</span>
            )}
            {cart.length > 0 && (
              <span className="cart-fab-total">{formatCurrency(cartTotal)}</span>
            )}
          </button>

          {/* Cart Drawer - Mobile */}
          {showCartDrawer && (
            <div className="cart-drawer-overlay" onClick={() => setShowCartDrawer(false)}>
              <div className="cart-drawer" onClick={e => e.stopPropagation()}>
                <div className="cart-drawer-header">
                  <h3>Carrito ({cart.length})</h3>
                  <button className="cart-drawer-close" onClick={() => setShowCartDrawer(false)}>
                    ×
                  </button>
                </div>

                <div className="cart-drawer-content">
                  {cart.length === 0 ? (
                    <p className="cart-empty">No hay productos en el carrito</p>
                  ) : (
                    <>
                      <div className="cart-items">
                        {cart.map((item, index) => (
                          <div key={index} className="cart-item">
                            <div className="cart-item-header">
                              <span className="cart-item-name">{item.product.name}</span>
                              <button
                                className="cart-item-remove"
                                onClick={() => handleRemoveFromCart(index)}
                              >
                                ×
                              </button>
                            </div>
                            {item.modifiers.length > 0 && (
                              <div className="cart-item-modifiers">
                                {item.modifiers.map(m => m.name).join(', ')}
                              </div>
                            )}
                            {item.notes && (
                              <div className="cart-item-notes">{item.notes}</div>
                            )}
                            <div className="cart-item-footer">
                              <div className="cart-item-quantity">
                                <button onClick={() => handleUpdateQuantity(index, -1)}>-</button>
                                <span>{item.quantity}</span>
                                <button onClick={() => handleUpdateQuantity(index, 1)}>+</button>
                              </div>
                              <span className="cart-item-total">
                                {formatCurrency(ordersApiService.calculateItemTotal(item))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="cart-notes">
                        <textarea
                          placeholder="Notas del pedido..."
                          value={orderNotes}
                          onChange={e => setOrderNotes(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="cart-drawer-footer">
                    <div className="cart-total">
                      <span>Total:</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>

                    <button
                      className="submit-order-btn"
                      onClick={() => {
                        handleSubmitOrder()
                        if (!submitting) setShowCartDrawer(false)
                      }}
                      disabled={submitting}
                    >
                      {submitting ? 'Creando...' : 'Crear Orden'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* Product Modal */}
      {showProductModal && selectedProduct && (
        <div className="product-modal-overlay" onClick={() => setShowProductModal(false)}>
          <div className="product-modal" onClick={e => e.stopPropagation()}>
            <div className="product-modal-header">
              <h3>{selectedProduct.name}</h3>
              <button onClick={() => setShowProductModal(false)}>×</button>
            </div>

            <div className="product-modal-price">
              {formatCurrency(selectedProduct.price)}
            </div>

            {/* Modifier Groups */}
            {selectedProduct.modifier_groups.map(group => (
              <div key={group.id} className="modifier-group">
                <h4>
                  {group.name}
                  {group.required && <span className="required"> *</span>}
                </h4>
                <div className="modifiers-list">
                  {group.modifiers.map(modifier => (
                    <label key={modifier.id} className="modifier-option">
                      <input
                        type={group.multiple ? 'checkbox' : 'radio'}
                        name={`group-${group.id}`}
                        checked={modalModifiers.some(m => m.modifier_id === modifier.id)}
                        onChange={() => handleModifierToggle(modifier, group)}
                      />
                      <span className="modifier-name">{modifier.name}</span>
                      {modifier.price_change !== 0 && (
                        <span className="modifier-price">
                          {modifier.price_change > 0 ? '+' : ''}{formatCurrency(modifier.price_change)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {/* Notes */}
            <div className="product-modal-notes">
              <textarea
                placeholder="Notas especiales..."
                value={modalNotes}
                onChange={e => setModalNotes(e.target.value)}
              />
            </div>

            {/* Quantity */}
            <div className="product-modal-quantity">
              <button onClick={() => setModalQuantity(q => Math.max(1, q - 1))}>-</button>
              <span>{modalQuantity}</span>
              <button onClick={() => setModalQuantity(q => q + 1)}>+</button>
            </div>

            {/* Add to Cart Button */}
            <button className="add-to-cart-btn" onClick={handleAddToCart}>
              Agregar {formatCurrency(
                (selectedProduct.price + modalModifiers.reduce((sum, m) => sum + m.price_change, 0)) * modalQuantity
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Orders
