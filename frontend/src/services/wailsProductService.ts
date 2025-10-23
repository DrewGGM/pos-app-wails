import {
  GetAllProducts as GetProducts,
  GetProduct as GetProductById,
  CreateProduct,
  UpdateProduct,
  DeleteProduct,
  AdjustStock,
  GetAllCategories as GetCategories,
  CreateCategory,
  UpdateCategory,
  DeleteCategory,
  GetModifierGroups,
  GetModifiers,
  CreateModifierGroup,
  UpdateModifierGroup,
  DeleteModifierGroup,
  CreateModifier,
  UpdateModifier,
  DeleteModifier
} from '../../wailsjs/go/services/ProductService';
import { models } from '../../wailsjs/go/models';
import { Product, Category, ModifierGroup, Modifier } from '../types/models';

// Helper to check if Wails bindings are ready
function areBindingsReady(): boolean {
  return typeof (window as any).go !== 'undefined';
}

// Adapters: Map Wails models -> Frontend models
function mapProduct(w: models.Product): Product {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    description: w.description || '',
    price: w.price || 0,
    category_id: w.category_id as unknown as number,
    image: (w as any).image || '',
    sku: w.sku || '',
    stock: w.stock || 0,
    min_stock: (w as any).min_stock || 0,
    is_active: (w as any).is_active ?? true,
    has_modifiers: false, // Default value
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Product;
}

function mapCategory(w: models.Category | null): Category {
  if (!w) {
    throw new Error('Category data is null');
  }
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    description: w.description || '',
    icon: w.icon || '',
    color: w.color || '',
    display_order: (w as any).display_order || 0,
    is_active: (w as any).is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Category;
}

function mapModifierGroup(w: models.ModifierGroup): ModifierGroup {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    required: w.required || false,
    multiple: w.multiple || false,
    min_select: w.min_select || 0,
    max_select: w.max_select || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ModifierGroup;
}

function mapModifier(w: models.Modifier): Modifier {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    type: w.type || 'addition',
    price_change: w.price_change || 0,
    group_id: w.group_id as unknown as number,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Modifier;
}

class WailsProductService {
  // Products
  async getProducts(): Promise<Product[]> {
    try {
      if (!areBindingsReady()) {
        console.warn('[wailsProductService] Wails bindings not ready, returning empty array');
        return [];
      }
      const products = await GetProducts();
      return products.map(mapProduct);
    } catch (error) {
      console.error('Error getting products:', error);
      return [];
    }
  }

  async getProductById(id: number): Promise<Product> {
    try {
      const product = await GetProductById(id);
      return mapProduct(product);
    } catch (error) {
      console.error('Error getting product:', error);
      throw new Error('Error al obtener producto');
    }
  }

  async createProduct(product: Partial<Product>): Promise<void> {
    try {
      await CreateProduct(product as any);
    } catch (error) {
      console.error('Error creating product:', error);
      throw new Error('Error al crear producto');
    }
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<void> {
    try {
      await UpdateProduct(product as any);
    } catch (error) {
      console.error('Error updating product:', error);
      throw new Error('Error al actualizar producto');
    }
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      await DeleteProduct(id);
    } catch (error) {
      console.error('Error deleting product:', error);
      throw new Error('Error al eliminar producto');
    }
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    try {
      if (!areBindingsReady()) {
        console.warn('[wailsProductService] Wails bindings not ready, returning empty array');
        return [];
      }
      const categories = await GetCategories();
      return categories.map(mapCategory);
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  async createCategory(category: Partial<Category>): Promise<Category> {
    try {
      const created = await CreateCategory(category as any);
      return mapCategory(created as any);
    } catch (error) {
      console.error('Error creating category:', error);
      throw new Error('Error al crear categoría');
    }
  }

  async updateCategory(id: number, category: Partial<Category>): Promise<Category> {
    try {
      const updated = await UpdateCategory(category as any);
      return mapCategory(updated as any);
    } catch (error) {
      console.error('Error updating category:', error);
      throw new Error('Error al actualizar categoría');
    }
  }

  async deleteCategory(id: number): Promise<void> {
    try {
      await DeleteCategory(id);
    } catch (error) {
      console.error('Error deleting category:', error);
      throw new Error('Error al eliminar categoría');
    }
  }

  // Modifier Groups
  async getModifierGroups(): Promise<ModifierGroup[]> {
    try {
      const groups = await GetModifierGroups();
      return groups.map(mapModifierGroup);
    } catch (error) {
      console.error('Error getting modifier groups:', error);
      throw new Error('Error al obtener grupos de modificadores');
    }
  }

  async createModifierGroup(group: Partial<ModifierGroup>): Promise<ModifierGroup> {
    try {
      const created = await CreateModifierGroup(group as any);
      return mapModifierGroup(created as any);
    } catch (error) {
      console.error('Error creating modifier group:', error);
      throw new Error('Error al crear grupo de modificadores');
    }
  }

  async updateModifierGroup(id: number, group: Partial<ModifierGroup>): Promise<ModifierGroup> {
    try {
      const updated = await UpdateModifierGroup(group as any);
      return mapModifierGroup(updated as any);
    } catch (error) {
      console.error('Error updating modifier group:', error);
      throw new Error('Error al actualizar grupo de modificadores');
    }
  }

  async deleteModifierGroup(id: number): Promise<void> {
    try {
      await DeleteModifierGroup(id);
    } catch (error) {
      console.error('Error deleting modifier group:', error);
      throw new Error('Error al eliminar grupo de modificadores');
    }
  }

  // Modifiers
  async getModifiers(): Promise<Modifier[]> {
    try {
      const modifiers = await GetModifiers();
      return modifiers.map(mapModifier);
    } catch (error) {
      console.error('Error getting modifiers:', error);
      throw new Error('Error al obtener modificadores');
    }
  }

  async createModifier(modifier: Partial<Modifier>): Promise<Modifier> {
    try {
      const created = await CreateModifier(modifier as any);
      return mapModifier(created as any);
    } catch (error) {
      console.error('Error creating modifier:', error);
      throw new Error('Error al crear modificador');
    }
  }

  async updateModifier(id: number, modifier: Partial<Modifier>): Promise<Modifier> {
    try {
      const updated = await UpdateModifier(modifier as any);
      return mapModifier(updated as any);
    } catch (error) {
      console.error('Error updating modifier:', error);
      throw new Error('Error al actualizar modificador');
    }
  }

  async deleteModifier(id: number): Promise<void> {
    try {
      await DeleteModifier(id);
    } catch (error) {
      console.error('Error deleting modifier:', error);
      throw new Error('Error al eliminar modificador');
    }
  }

  // Additional methods for Redux slices
  async getLowStockProducts(): Promise<Product[]> {
    try {
      const products = await GetProducts();
      return products
        .map(mapProduct)
        .filter(product => product.stock <= (product.min_stock || 0));
    } catch (error) {
      console.error('Error getting low stock products:', error);
      throw new Error('Error al obtener productos con stock bajo');
    }
  }

  async adjustStock(productId: number, quantity: number, reason: string, employeeId: number = 0): Promise<Product> {
    try {
      // Llamar al backend para ajustar el stock en la BD
      await AdjustStock(productId, quantity, reason, employeeId);

      // Obtener el producto actualizado de la BD
      const updatedProduct = await GetProductById(productId);
      return mapProduct(updatedProduct as any);
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw new Error('Error al ajustar stock');
    }
  }
}

export const wailsProductService = new WailsProductService();
