/**
 * Reusable CRUD operations hook
 * This eliminates ~2000+ lines of duplicated CRUD logic across pages
 */

import { useState, useCallback, useEffect } from 'react';
import { showSuccess, showError } from '../utils/toastUtils';

export interface CRUDConfig<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  // Required functions
  fetchAll: () => Promise<T[]>;

  // Optional CRUD functions
  fetchOne?: (id: number) => Promise<T>;
  create?: (data: CreateDTO) => Promise<T>;
  update?: (id: number, data: UpdateDTO) => Promise<T>;
  remove?: (id: number) => Promise<void>;

  // Messages for notifications
  entityName: string; // e.g., 'producto', 'cliente'

  // Optional callbacks
  onFetchSuccess?: (items: T[]) => void;
  onCreateSuccess?: (item: T) => void;
  onUpdateSuccess?: (item: T) => void;
  onDeleteSuccess?: (id: number) => void;
  onError?: (error: any, operation: string) => void;

  // Options
  fetchOnMount?: boolean; // Default: true
  idField?: keyof T; // Default: 'id'
}

export interface UseCRUDReturn<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  // State
  items: T[];
  loading: boolean;
  error: string | null;
  selectedItem: T | null;

  // CRUD operations
  fetchItems: () => Promise<void>;
  fetchItem: (id: number) => Promise<T | null>;
  createItem: (data: CreateDTO) => Promise<T | null>;
  updateItem: (id: number, data: UpdateDTO) => Promise<T | null>;
  deleteItem: (id: number) => Promise<boolean>;

  // Selection
  selectItem: (item: T | null) => void;

  // State setters
  setItems: React.Dispatch<React.SetStateAction<T[]>>;

  // Helpers
  findById: (id: number) => T | undefined;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing CRUD operations with loading states and notifications
 *
 * @example
 * const products = useCRUD({
 *   fetchAll: () => wailsProductService.getAllProducts(),
 *   create: (data) => wailsProductService.createProduct(data),
 *   update: (id, data) => wailsProductService.updateProduct(id, data),
 *   remove: (id) => wailsProductService.deleteProduct(id),
 *   entityName: 'producto',
 * });
 *
 * // Fetch all
 * await products.fetchItems();
 *
 * // Create
 * await products.createItem({ name: 'New Product', price: 100 });
 *
 * // Update
 * await products.updateItem(1, { name: 'Updated Product' });
 *
 * // Delete
 * await products.deleteItem(1);
 */
export function useCRUD<T extends Record<string, any>, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>(
  config: CRUDConfig<T, CreateDTO, UpdateDTO>
): UseCRUDReturn<T, CreateDTO, UpdateDTO> {
  const {
    fetchAll,
    fetchOne,
    create,
    update,
    remove,
    entityName,
    onFetchSuccess,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onError,
    fetchOnMount = true,
    idField = 'id' as keyof T,
  } = config;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  // Capitalize first letter helper
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  // Fetch all items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll();
      setItems(data || []);
      onFetchSuccess?.(data || []);
    } catch (err: any) {
      const errorMsg = `Error al cargar ${entityName}s`;
      setError(errorMsg);
      showError(errorMsg, err);
      onError?.(err, 'fetch');
    } finally {
      setLoading(false);
    }
  }, [fetchAll, entityName, onFetchSuccess, onError]);

  // Fetch single item
  const fetchItem = useCallback(async (id: number): Promise<T | null> => {
    if (!fetchOne) {
      console.warn('fetchOne not configured for useCRUD');
      return null;
    }

    try {
      const item = await fetchOne(id);
      return item;
    } catch (err: any) {
      const errorMsg = `Error al cargar ${entityName}`;
      showError(errorMsg, err);
      onError?.(err, 'fetchOne');
      return null;
    }
  }, [fetchOne, entityName, onError]);

  // Create item
  const createItem = useCallback(async (data: CreateDTO): Promise<T | null> => {
    if (!create) {
      console.warn('create not configured for useCRUD');
      return null;
    }

    setLoading(true);
    try {
      const newItem = await create(data);
      setItems(prev => [...prev, newItem]);
      showSuccess(`${capitalize(entityName)} creado exitosamente`);
      onCreateSuccess?.(newItem);
      return newItem;
    } catch (err: any) {
      const errorMsg = `Error al crear ${entityName}`;
      showError(errorMsg, err);
      onError?.(err, 'create');
      return null;
    } finally {
      setLoading(false);
    }
  }, [create, entityName, onCreateSuccess, onError]);

  // Update item
  const updateItem = useCallback(async (id: number, data: UpdateDTO): Promise<T | null> => {
    if (!update) {
      console.warn('update not configured for useCRUD');
      return null;
    }

    setLoading(true);
    try {
      const updatedItem = await update(id, data);
      setItems(prev => prev.map(item =>
        item[idField] === id ? updatedItem : item
      ));
      showSuccess(`${capitalize(entityName)} actualizado`);
      onUpdateSuccess?.(updatedItem);
      return updatedItem;
    } catch (err: any) {
      const errorMsg = `Error al actualizar ${entityName}`;
      showError(errorMsg, err);
      onError?.(err, 'update');
      return null;
    } finally {
      setLoading(false);
    }
  }, [update, entityName, idField, onUpdateSuccess, onError]);

  // Delete item
  const deleteItem = useCallback(async (id: number): Promise<boolean> => {
    if (!remove) {
      console.warn('remove not configured for useCRUD');
      return false;
    }

    setLoading(true);
    try {
      await remove(id);
      setItems(prev => prev.filter(item => item[idField] !== id));
      showSuccess(`${capitalize(entityName)} eliminado`);
      onDeleteSuccess?.(id);
      return true;
    } catch (err: any) {
      const errorMsg = `Error al eliminar ${entityName}`;
      showError(errorMsg, err);
      onError?.(err, 'delete');
      return false;
    } finally {
      setLoading(false);
    }
  }, [remove, entityName, idField, onDeleteSuccess, onError]);

  // Select item
  const selectItem = useCallback((item: T | null) => {
    setSelectedItem(item);
  }, []);

  // Find by ID
  const findById = useCallback((id: number): T | undefined => {
    return items.find(item => item[idField] === id);
  }, [items, idField]);

  // Refresh (alias for fetchItems)
  const refresh = fetchItems;

  // Fetch on mount
  useEffect(() => {
    if (fetchOnMount) {
      fetchItems();
    }
  }, [fetchOnMount]); // Intentionally not including fetchItems to avoid infinite loop

  return {
    items,
    loading,
    error,
    selectedItem,
    fetchItems,
    fetchItem,
    createItem,
    updateItem,
    deleteItem,
    selectItem,
    setItems,
    findById,
    refresh,
  };
}

/**
 * Hook for filtered/searched items
 */
export interface UseFilteredItemsOptions<T> {
  items: T[];
  searchFields: (keyof T)[];
  defaultFilters?: Record<string, any>;
}

export interface UseFilteredItemsReturn<T> {
  filteredItems: T[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: Record<string, any>;
  setFilter: (key: string, value: any) => void;
  clearFilters: () => void;
}

export function useFilteredItems<T extends Record<string, any>>(
  options: UseFilteredItemsOptions<T>
): UseFilteredItemsReturn<T> {
  const { items, searchFields, defaultFilters = {} } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>(defaultFilters);

  const setFilter = useCallback((key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilters(defaultFilters);
  }, [defaultFilters]);

  const filteredItems = items.filter(item => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = searchFields.some(field => {
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        if (typeof value === 'number') {
          return value.toString().includes(query);
        }
        return false;
      });
      if (!matchesSearch) return false;
    }

    // Custom filters
    for (const [key, filterValue] of Object.entries(filters)) {
      if (filterValue === null || filterValue === undefined || filterValue === '') {
        continue;
      }
      if (item[key] !== filterValue) {
        return false;
      }
    }

    return true;
  });

  return {
    filteredItems,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    clearFilters,
  };
}

export default useCRUD;
