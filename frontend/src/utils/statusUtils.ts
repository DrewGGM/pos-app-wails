/**
 * Centralized status utilities for order and payment statuses
 * This eliminates duplicated getStatusColor, getStatusLabel functions across components
 */

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'paid' | 'cancelled';
export type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

interface StatusConfig {
  color: string;
  chipColor: ChipColor;
  label: string;
  icon?: string;
}

// Order status configuration - single source of truth
export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  pending: {
    color: 'warning.main',
    chipColor: 'warning',
    label: 'Pendiente',
  },
  preparing: {
    color: 'info.main',
    chipColor: 'info',
    label: 'Preparando',
  },
  ready: {
    color: 'success.main',
    chipColor: 'success',
    label: 'Listo',
  },
  delivered: {
    color: 'primary.main',
    chipColor: 'primary',
    label: 'Entregado',
  },
  paid: {
    color: 'grey.500',
    chipColor: 'default',
    label: 'Pagado',
  },
  cancelled: {
    color: 'error.main',
    chipColor: 'error',
    label: 'Cancelado',
  },
};

/**
 * Get the MUI color string for a status (e.g., 'warning.main')
 */
export const getStatusColor = (status: string): string => {
  return ORDER_STATUS_CONFIG[status as OrderStatus]?.color || 'grey.500';
};

/**
 * Get the human-readable label for a status
 */
export const getStatusLabel = (status: string): string => {
  return ORDER_STATUS_CONFIG[status as OrderStatus]?.label || status;
};

/**
 * Get the MUI Chip color for a status
 */
export const getStatusChipColor = (status: string): ChipColor => {
  return ORDER_STATUS_CONFIG[status as OrderStatus]?.chipColor || 'default';
};

// Payment method type configuration
export type PaymentMethodType = 'cash' | 'card' | 'digital' | 'transfer' | 'other';

interface PaymentMethodConfig {
  color: ChipColor;
  label: string;
}

export const PAYMENT_METHOD_CONFIG: Record<PaymentMethodType, PaymentMethodConfig> = {
  cash: {
    color: 'success',
    label: 'Efectivo',
  },
  card: {
    color: 'primary',
    label: 'Tarjeta',
  },
  digital: {
    color: 'info',
    label: 'Digital',
  },
  transfer: {
    color: 'secondary',
    label: 'Transferencia',
  },
  other: {
    color: 'default',
    label: 'Otro',
  },
};

export const getPaymentMethodColor = (type: string): ChipColor => {
  return PAYMENT_METHOD_CONFIG[type as PaymentMethodType]?.color || 'default';
};

export const getPaymentMethodLabel = (type: string): string => {
  return PAYMENT_METHOD_CONFIG[type as PaymentMethodType]?.label || type;
};

// Order type configuration
export type OrderTypeCode = 'dine-in' | 'dine_in' | 'mesa' | 'takeout' | 'delivery' | 'rappi';

interface OrderTypeConfig {
  color: ChipColor;
  label: string;
}

export const ORDER_TYPE_CONFIG: Record<string, OrderTypeConfig> = {
  'dine-in': { color: 'primary', label: 'Mesa' },
  'dine_in': { color: 'primary', label: 'Mesa' },
  'mesa': { color: 'primary', label: 'Mesa' },
  'takeout': { color: 'secondary', label: 'Para llevar' },
  'delivery': { color: 'warning', label: 'Domicilio' },
  'rappi': { color: 'error', label: 'Rappi' },
};

export const getOrderTypeColor = (code: string): ChipColor => {
  return ORDER_TYPE_CONFIG[code]?.color || 'default';
};

export const getOrderTypeLabel = (code: string): string => {
  return ORDER_TYPE_CONFIG[code]?.label || code;
};

// Stock status helpers
export const getStockStatusColor = (stock: number, minStock: number = 5): ChipColor => {
  if (stock === 0) return 'error';
  if (stock <= minStock) return 'warning';
  return 'success';
};

export const getStockStatusLabel = (stock: number, minStock: number = 5): string => {
  if (stock === 0) return 'Agotado';
  if (stock <= minStock) return 'Bajo Stock';
  return 'Disponible';
};
