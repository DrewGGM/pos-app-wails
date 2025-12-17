// Context hooks
export { useAuth } from './useAuth';
export { useWebSocket } from './useWebSocket';
export { useDIANMode } from './useDIANMode';
export { useNotifications } from '../contexts/NotificationContext';

// Reusable hooks
export { useDialog, useMultipleDialogs, useConfirmDialog } from './useDialog';
export type { UseDialogOptions, UseDialogReturn, ConfirmDialogOptions } from './useDialog';

export { useCRUD, useFilteredItems } from './useCRUD';
export type { CRUDConfig, UseCRUDReturn, UseFilteredItemsOptions } from './useCRUD';