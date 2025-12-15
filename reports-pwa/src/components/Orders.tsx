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
} from '../services/ordersApi'
import { authApiService } from '../services/authApi'

type OrdersView = 'create' | 'pending'

export function Orders() {
  // View state
  const [currentOrdersView, setCurrentOrdersView] = useState<OrdersView>('create')

  // Pending orders state
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null)

  // Data state
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // Selection state
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

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

  // Modal state for product customization
  const [modalQuantity, setModalQuantity] = useState(1)
  const [modalNotes, setModalNotes] = useState('')
  const [modalModifiers, setModalModifiers] = useState<CartItemModifier[]>([])

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [])

  // Load pending orders when switching to pending view
  const loadPendingOrders = useCallback(async () => {
    setPendingLoading(true)
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

  useEffect(() => {
    if (currentOrdersView === 'pending') {
      loadPendingOrders()
    }
  }, [currentOrdersView, loadPendingOrders])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showProductModal) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showProductModal])

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [orderTypesData, productsData] = await Promise.all([
        ordersApiService.getOrderTypes(),
        ordersApiService.getProducts(),
      ])

      setOrderTypes(orderTypesData)
      setCategories(productsData.categories)
      setProducts(productsData.products)

      // Select first category by default
      if (productsData.categories.length > 0) {
        setSelectedCategory(productsData.categories[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  const handleOrderTypeSelect = (orderType: OrderType) => {
    setSelectedOrderType(orderType)
    // Clear delivery info if not delivery
    if (orderType.code !== 'delivery') {
      setDeliveryInfo({ name: '', address: '', phone: '' })
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

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const user = authApiService.getUser()

      const result = await ordersApiService.createOrder({
        order_type_id: selectedOrderType.id,
        employee_id: user?.id || 0,
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

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products

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
      </div>

      {/* Pending Orders View */}
      {currentOrdersView === 'pending' && (
        <div className="pending-orders-section">
          <div className="pending-orders-header">
            <h2>Pedidos Pendientes</h2>
            <button
              className="refresh-btn"
              onClick={loadPendingOrders}
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
                        {order.order_type_icon} {order.order_type}
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
                <span className="order-type-icon">{type.icon || '📦'}</span>
                <span className="order-type-name">{type.name}</span>
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

            {/* Cart Section */}
            <div className="cart-section">
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
