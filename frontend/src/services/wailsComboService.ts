import { Combo, ComboItem, Product } from '../types/models';

// Helper to check if Wails bindings are ready
function areBindingsReady(): boolean {
  return typeof (window as any).go !== 'undefined';
}

// Get the ComboService from Wails bindings
function getComboService() {
  if (!areBindingsReady()) {
    throw new Error('Wails bindings not ready');
  }
  const service = (window as any).go?.services?.ComboService;
  if (!service) {
    throw new Error('ComboService not available');
  }
  return service;
}

// Map backend combo to frontend model
function mapCombo(w: any): Combo {
  return {
    id: w.id as number,
    name: w.name || '',
    description: w.description || '',
    price: w.price || 0,
    image: w.image || '',
    category_id: w.category_id || undefined,
    category: w.category ? {
      id: w.category.id,
      name: w.category.name,
      description: w.category.description || '',
      display_order: w.category.display_order || 0,
      is_active: w.category.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } : undefined,
    is_active: w.is_active ?? true,
    items: w.items ? w.items.map(mapComboItem) : [],
    tax_type_id: w.tax_type_id || 1,
    display_order: w.display_order || 0,
    created_at: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString(),
    updated_at: w.updated_at ? new Date(w.updated_at).toISOString() : new Date().toISOString(),
  };
}

// Map backend combo item to frontend model
function mapComboItem(w: any): ComboItem {
  return {
    id: w.id as number,
    combo_id: w.combo_id as number,
    product_id: w.product_id as number,
    product: w.product ? {
      id: w.product.id,
      name: w.product.name || '',
      description: w.product.description || '',
      price: w.product.price || 0,
      category_id: w.product.category_id,
      image: w.product.image || '',
      stock: w.product.stock || 0,
      is_active: w.product.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Product : undefined,
    quantity: w.quantity || 1,
    position: w.position || 0,
    created_at: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString(),
    updated_at: w.updated_at ? new Date(w.updated_at).toISOString() : new Date().toISOString(),
  };
}

class WailsComboService {
  // Get all active combos (for POS)
  async getAllCombos(): Promise<Combo[]> {
    try {
      const combos = await getComboService().GetAllCombos();
      return (combos || []).map(mapCombo);
    } catch (error) {
      console.error('Error getting combos:', error);
      return [];
    }
  }

  // Get all combos including inactive (for admin)
  async getAllCombosAdmin(): Promise<Combo[]> {
    try {
      const combos = await getComboService().GetAllCombosAdmin();
      return (combos || []).map(mapCombo);
    } catch (error) {
      console.error('Error getting combos (admin):', error);
      return [];
    }
  }

  // Get single combo by ID
  async getCombo(id: number): Promise<Combo | null> {
    try {
      const combo = await getComboService().GetCombo(id);
      return combo ? mapCombo(combo) : null;
    } catch (error) {
      console.error('Error getting combo:', error);
      return null;
    }
  }

  // Create new combo
  async createCombo(combo: Partial<Combo>): Promise<Combo> {
    try {
      // Map items to backend format
      const backendCombo = {
        name: combo.name,
        description: combo.description || '',
        price: combo.price,
        image: combo.image || '',
        category_id: combo.category_id || null,
        is_active: combo.is_active ?? true,
        tax_type_id: combo.tax_type_id || 1,
        display_order: combo.display_order || 0,
        items: (combo.items || []).map((item, index) => ({
          product_id: item.product_id,
          quantity: item.quantity || 1,
          position: index,
        })),
      };

      const result = await getComboService().CreateCombo(backendCombo);
      return mapCombo(result);
    } catch (error: any) {
      console.error('Error creating combo:', error);
      throw new Error(error?.message || 'Error al crear combo');
    }
  }

  // Update existing combo
  async updateCombo(combo: Partial<Combo>): Promise<Combo> {
    try {
      const backendCombo = {
        id: combo.id,
        name: combo.name,
        description: combo.description || '',
        price: combo.price,
        image: combo.image || '',
        category_id: combo.category_id || null,
        is_active: combo.is_active ?? true,
        tax_type_id: combo.tax_type_id || 1,
        display_order: combo.display_order || 0,
        items: (combo.items || []).map((item, index) => ({
          product_id: item.product_id,
          quantity: item.quantity || 1,
          position: index,
        })),
      };

      const result = await getComboService().UpdateCombo(backendCombo);
      return mapCombo(result);
    } catch (error: any) {
      console.error('Error updating combo:', error);
      throw new Error(error?.message || 'Error al actualizar combo');
    }
  }

  // Delete combo (soft delete)
  async deleteCombo(id: number): Promise<void> {
    try {
      await getComboService().DeleteCombo(id);
    } catch (error: any) {
      console.error('Error deleting combo:', error);
      throw new Error(error?.message || 'Error al eliminar combo');
    }
  }

  // Toggle combo active status
  async toggleComboActive(id: number): Promise<Combo> {
    try {
      const result = await getComboService().ToggleComboActive(id);
      return mapCombo(result);
    } catch (error: any) {
      console.error('Error toggling combo status:', error);
      throw new Error(error?.message || 'Error al cambiar estado del combo');
    }
  }

  // Get combos by category
  async getCombosByCategory(categoryId: number): Promise<Combo[]> {
    try {
      const combos = await getComboService().GetCombosByCategory(categoryId);
      return (combos || []).map(mapCombo);
    } catch (error) {
      console.error('Error getting combos by category:', error);
      return [];
    }
  }

  // Expand combo to order items (for kitchen)
  async expandComboToOrderItems(comboId: number, quantity: number): Promise<{ items: any[], totalPrice: number }> {
    try {
      const result = await getComboService().ExpandComboToOrderItems(comboId, quantity);
      return {
        items: result[0] || [],
        totalPrice: result[1] || 0,
      };
    } catch (error: any) {
      console.error('Error expanding combo:', error);
      throw new Error(error?.message || 'Error al expandir combo');
    }
  }

  // Add item to combo
  async addItemToCombo(comboId: number, productId: number, quantity: number): Promise<Combo> {
    try {
      const result = await getComboService().AddItemToCombo(comboId, productId, quantity);
      return mapCombo(result);
    } catch (error: any) {
      console.error('Error adding item to combo:', error);
      throw new Error(error?.message || 'Error al agregar producto al combo');
    }
  }

  // Remove item from combo
  async removeItemFromCombo(comboId: number, itemId: number): Promise<Combo> {
    try {
      const result = await getComboService().RemoveItemFromCombo(comboId, itemId);
      return mapCombo(result);
    } catch (error: any) {
      console.error('Error removing item from combo:', error);
      throw new Error(error?.message || 'Error al eliminar producto del combo');
    }
  }

  // Update combo item quantity
  async updateComboItemQuantity(itemId: number, quantity: number): Promise<void> {
    try {
      await getComboService().UpdateComboItemQuantity(itemId, quantity);
    } catch (error: any) {
      console.error('Error updating combo item quantity:', error);
      throw new Error(error?.message || 'Error al actualizar cantidad');
    }
  }
}

export const wailsComboService = new WailsComboService();
