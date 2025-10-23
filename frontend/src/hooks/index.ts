// useAuth.ts
export { useAuth } from './useAuth';

// useWebSocket.ts
export { useWebSocket } from './useWebSocket';

// useOfflineSync.ts
export { useOfflineSync } from './useOfflineSync';


// Utility functions for handling optional IDs
export const useIdGenerator = () => {
  const generateTempId = () => {
    return Date.now() + Math.random();
  };

  const ensureId = (id: number | undefined): number => {
    return id ?? generateTempId();
  };

  return {
    generateTempId,
    ensureId,
  };
};

// Type guards
export const hasId = <T extends { id?: number }>(item: T): item is T & { id: number } => {
  return item.id !== undefined;
};

export const isValidId = (id: number | undefined): id is number => {
  return id !== undefined && id !== null && !isNaN(id);
};

// Safe number operations
export const safeNumber = (value: number | undefined, defaultValue: number = 0): number => {
  return value ?? defaultValue;
};

export const safeToLocaleString = (value: number | undefined, locale: string = 'es-CO'): string => {
  return (value ?? 0).toLocaleString(locale);
};