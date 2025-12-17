/**
 * Centralized toast notification utilities
 * This eliminates 400+ scattered toast calls across components
 */

import { toast, ToastOptions } from 'react-toastify';

// Default toast options
const defaultOptions: ToastOptions = {
  position: 'top-right',
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

// Notification messages grouped by entity/domain
export const messages = {
  // Product messages
  product: {
    created: 'Producto creado exitosamente',
    updated: 'Producto actualizado',
    deleted: 'Producto eliminado',
    createError: 'Error al crear producto',
    updateError: 'Error al actualizar producto',
    deleteError: 'Error al eliminar producto',
    loadError: 'Error al cargar productos',
    stockAdjusted: 'Stock ajustado correctamente',
    stockError: 'Error al ajustar stock',
  },

  // Category messages
  category: {
    created: 'Categoría creada exitosamente',
    updated: 'Categoría actualizada',
    deleted: 'Categoría eliminada',
    createError: 'Error al crear categoría',
    updateError: 'Error al actualizar categoría',
    deleteError: 'Error al eliminar categoría',
  },

  // Order messages
  order: {
    created: 'Orden creada exitosamente',
    updated: 'Orden actualizada',
    deleted: 'Orden eliminada',
    cancelled: 'Orden cancelada',
    sentToKitchen: 'Orden enviada a cocina',
    printed: 'Orden enviada a impresora',
    createError: 'Error al crear orden',
    updateError: 'Error al actualizar orden',
    deleteError: 'Error al eliminar orden',
    loadError: 'Error al cargar órdenes',
    kitchenError: 'Error al enviar orden a cocina',
    printError: 'Error al imprimir orden',
  },

  // Sale messages
  sale: {
    created: 'Venta registrada exitosamente',
    refunded: 'Venta reembolsada',
    printed: 'Recibo enviado a impresora',
    invoiceSent: 'Factura electrónica enviada',
    createError: 'Error al registrar venta',
    refundError: 'Error al procesar reembolso',
    printError: 'Error al imprimir recibo',
    invoiceError: 'Error al enviar factura electrónica',
    loadError: 'Error al cargar ventas',
  },

  // Customer messages
  customer: {
    created: 'Cliente creado exitosamente',
    updated: 'Cliente actualizado',
    deleted: 'Cliente eliminado',
    createError: 'Error al crear cliente',
    updateError: 'Error al actualizar cliente',
    deleteError: 'Error al eliminar cliente',
    loadError: 'Error al cargar clientes',
  },

  // Employee messages
  employee: {
    created: 'Empleado creado exitosamente',
    updated: 'Empleado actualizado',
    deleted: 'Empleado eliminado',
    passwordUpdated: 'Contraseña actualizada',
    pinUpdated: 'PIN actualizado',
    createError: 'Error al crear empleado',
    updateError: 'Error al actualizar empleado',
    deleteError: 'Error al eliminar empleado',
    loadError: 'Error al cargar empleados',
  },

  // Ingredient messages
  ingredient: {
    created: 'Ingrediente creado exitosamente',
    updated: 'Ingrediente actualizado',
    deleted: 'Ingrediente eliminado',
    stockAdjusted: 'Stock de ingrediente ajustado',
    createError: 'Error al crear ingrediente',
    updateError: 'Error al actualizar ingrediente',
    deleteError: 'Error al eliminar ingrediente',
    loadError: 'Error al cargar ingredientes',
  },

  // Cash register messages
  cashRegister: {
    opened: 'Caja abierta exitosamente',
    closed: 'Caja cerrada exitosamente',
    movementAdded: 'Movimiento registrado',
    reportPrinted: 'Reporte de caja impreso',
    openError: 'Error al abrir caja',
    closeError: 'Error al cerrar caja',
    movementError: 'Error al registrar movimiento',
    loadError: 'Error al cargar información de caja',
  },

  // Settings messages
  settings: {
    saved: 'Configuración guardada',
    saveError: 'Error al guardar configuración',
    loadError: 'Error al cargar configuración',
  },

  // Auth messages
  auth: {
    loginSuccess: 'Sesión iniciada',
    logoutSuccess: 'Sesión cerrada',
    loginError: 'Credenciales inválidas',
    sessionExpired: 'Sesión expirada, por favor inicie sesión nuevamente',
  },

  // General messages
  general: {
    operationSuccess: 'Operación completada exitosamente',
    operationError: 'Error al realizar operación',
    loadError: 'Error al cargar datos',
    saveError: 'Error al guardar',
    deleteError: 'Error al eliminar',
    networkError: 'Error de conexión',
    unexpectedError: 'Error inesperado',
    copied: 'Copiado al portapapeles',
  },

  // Printer messages
  printer: {
    success: 'Enviado a impresora',
    error: 'Error al imprimir',
    notConfigured: 'Impresora no configurada',
  },

  // Google Sheets messages
  googleSheets: {
    syncSuccess: 'Reporte enviado a Google Sheets',
    syncError: 'Error al enviar reporte a Google Sheets',
  },
};

// Helper type for nested message access
type MessagePath = string;

/**
 * Get a message by path (e.g., 'product.created')
 */
const getMessage = (path: MessagePath, fallback?: string): string => {
  const parts = path.split('.');
  let current: any = messages;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return fallback || path;
    }
  }

  return typeof current === 'string' ? current : fallback || path;
};

/**
 * Show a success notification
 */
export const showSuccess = (messageOrPath: string, options?: ToastOptions): void => {
  const message = messages.hasOwnProperty(messageOrPath.split('.')[0])
    ? getMessage(messageOrPath)
    : messageOrPath;
  toast.success(message, { ...defaultOptions, ...options });
};

/**
 * Show an error notification
 */
export const showError = (messageOrPath: string, error?: any, options?: ToastOptions): void => {
  let message = messages.hasOwnProperty(messageOrPath.split('.')[0])
    ? getMessage(messageOrPath)
    : messageOrPath;

  // Append error message if provided
  if (error?.message && !messageOrPath.includes(error.message)) {
    message = `${message}: ${error.message}`;
  }

  toast.error(message, { ...defaultOptions, ...options });
};

/**
 * Show a warning notification
 */
export const showWarning = (messageOrPath: string, options?: ToastOptions): void => {
  const message = messages.hasOwnProperty(messageOrPath.split('.')[0])
    ? getMessage(messageOrPath)
    : messageOrPath;
  toast.warning(message, { ...defaultOptions, ...options });
};

/**
 * Show an info notification
 */
export const showInfo = (messageOrPath: string, options?: ToastOptions): void => {
  const message = messages.hasOwnProperty(messageOrPath.split('.')[0])
    ? getMessage(messageOrPath)
    : messageOrPath;
  toast.info(message, { ...defaultOptions, ...options });
};

/**
 * Show a loading notification that can be updated
 */
export const showLoading = (message: string): ReturnType<typeof toast.loading> => {
  return toast.loading(message, defaultOptions);
};

/**
 * Update a loading toast to success
 */
export const updateToSuccess = (toastId: ReturnType<typeof toast.loading>, message: string): void => {
  toast.update(toastId, {
    render: message,
    type: 'success',
    isLoading: false,
    ...defaultOptions,
  });
};

/**
 * Update a loading toast to error
 */
export const updateToError = (toastId: ReturnType<typeof toast.loading>, message: string): void => {
  toast.update(toastId, {
    render: message,
    type: 'error',
    isLoading: false,
    ...defaultOptions,
  });
};

// Re-export toast for cases where direct access is needed
export { toast };

// Default export with all utilities
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  loading: showLoading,
  updateToSuccess,
  updateToError,
  messages,
};
