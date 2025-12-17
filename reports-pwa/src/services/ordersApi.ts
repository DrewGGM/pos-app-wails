// Orders API Service for creating orders from PWA

export interface OrderType {
  id: number
  code: string
  name: string
  description: string
  display_color: string
  icon: string
}

export interface Category {
  id: number
  name: string
  icon: string
}

export interface Modifier {
  id: number
  name: string
  price_change: number
}

export interface ModifierGroup {
  id: number
  name: string
  required: boolean
  multiple: boolean
  min_select: number
  max_select: number
  modifiers: Modifier[]
}

export interface Product {
  id: number
  name: string
  price: number
  category_id: number
  category: string
  image: string
  modifier_groups: ModifierGroup[]
}

export interface CartItemModifier {
  modifier_id: number
  name: string
  price_change: number
}

export interface CartItem {
  product: Product
  quantity: number
  notes: string
  modifiers: CartItemModifier[]
}

export interface Table {
  id: number
  number: string
  name: string
  capacity: number
  status: string
  zone: string
}

export interface CreateOrderRequest {
  order_type_id: number
  employee_id: number
  table_id?: number
  items: {
    product_id: number
    quantity: number
    notes: string
    modifiers: {
      modifier_id: number
      price_change: number
    }[]
  }[]
  notes: string
  delivery_customer_name: string
  delivery_address: string
  delivery_phone: string
}

export interface CreateOrderResponse {
  order_id: number
  order_number: string
  total: number
}

export interface PendingOrderItem {
  id: number
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  notes: string
  status: string
  modifiers: string[]
}

export interface PendingOrder {
  id: number
  order_number: string
  status: string
  order_type: string
  order_type_code: string
  order_type_color: string
  order_type_icon: string
  source: string
  total: number
  notes: string
  items: PendingOrderItem[]
  table_id?: number
  table_number?: string
  table_name?: string
  delivery_customer_name?: string
  delivery_address?: string
  delivery_phone?: string
  created_at: string
}

export interface SaleItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface SalePayment {
  method: string
  amount: number
}

export interface Sale {
  id: number
  sale_number: string
  order_number: string
  order_type: string
  order_type_code: string
  total: number
  subtotal: number
  tax: number
  discount: number
  payment_method: string
  status: string
  customer_name?: string
  employee_name?: string
  items: SaleItem[]
  payments: SalePayment[]
  created_at: string
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

const API_URL = import.meta.env.VITE_CONFIG_API_URL || ''

class OrdersApiService {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_URL.replace(/\/$/, '')
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  // Get available order types
  async getOrderTypes(): Promise<OrderType[]> {
    const response = await this.request<ApiResponse<OrderType[]>>('/api/v1/orders/types')

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get order types')
    }

    return response.data
  }

  // Get products with categories and modifiers
  async getProducts(): Promise<{ categories: Category[], products: Product[] }> {
    const response = await this.request<ApiResponse<{ categories: Category[], products: Product[] }>>('/api/v1/orders/products')

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get products')
    }

    return response.data
  }

  // Create a new order
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    const response = await this.request<ApiResponse<CreateOrderResponse>>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create order')
    }

    return response.data
  }

  // Get pending orders
  async getPendingOrders(): Promise<PendingOrder[]> {
    const response = await this.request<ApiResponse<PendingOrder[]>>('/api/v1/orders/pending')

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get pending orders')
    }

    return response.data
  }

  // Get available tables
  async getTables(): Promise<Table[]> {
    const response = await this.request<ApiResponse<Table[]>>('/api/v1/tables')

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get tables')
    }

    return response.data
  }

  // Calculate cart total
  calculateCartTotal(items: CartItem[]): number {
    return items.reduce((total, item) => {
      const itemBase = item.product.price * item.quantity
      const modifiersTotal = item.modifiers.reduce((sum, mod) => sum + mod.price_change, 0) * item.quantity
      return total + itemBase + modifiersTotal
    }, 0)
  }

  // Calculate single item total
  calculateItemTotal(item: CartItem): number {
    const itemBase = item.product.price * item.quantity
    const modifiersTotal = item.modifiers.reduce((sum, mod) => sum + mod.price_change, 0) * item.quantity
    return itemBase + modifiersTotal
  }

  // Get sales history
  async getSales(): Promise<Sale[]> {
    const response = await this.request<ApiResponse<Sale[]>>('/api/v1/sales')

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to get sales')
    }

    return response.data
  }
}

export const ordersApiService = new OrdersApiService()
export default ordersApiService
