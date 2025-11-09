import {
  GetAllPages,
  GetPage,
  GetPageWithProducts,
  CreatePage,
  UpdatePage,
  DeletePage,
  AddProductToPage,
  RemoveProductFromPage,
  SetPageProducts,
} from '../../wailsjs/go/services/CustomPageService';
import { models } from '../../wailsjs/go/models';
import { Product, ModifierGroup, Modifier } from '../types/models';

// Mapping functions to transform Wails models to frontend models
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
    group: (w as any).modifier_group ? mapModifierGroup((w as any).modifier_group) : undefined, // Transform modifier_group -> group
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Modifier;
}

function mapProduct(w: models.Product): Product {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    description: w.description || '',
    price: w.price || 0,
    category_id: w.category_id as unknown as number,
    image: (w as any).image || '',
    stock: w.stock || 0,
    min_stock: (w as any).min_stock || 0,
    track_inventory: (w as any).track_inventory ?? true,
    is_active: (w as any).is_active ?? true,
    has_variable_price: (w as any).has_variable_price ?? false,
    has_modifiers: false,
    modifiers: (w as any).modifiers ? (w as any).modifiers.map(mapModifier) : [], // Map modifiers and transform modifier_group -> group
    tax_type_id: w.tax_type_id || 1,
    unit_measure_id: w.unit_measure_id || 796,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Product;
}

export const wailsCustomPageService = {
  getAllPages: async () => {
    try {
      const pages = await GetAllPages();
      return pages || [];
    } catch (error) {
      console.error('Error getting custom pages:', error);
      throw error;
    }
  },

  getPage: async (id: number) => {
    try {
      return await GetPage(id);
    } catch (error) {
      console.error('Error getting custom page:', error);
      throw error;
    }
  },

  getPageWithProducts: async (pageID: number) => {
    try {
      const products = await GetPageWithProducts(pageID);
      // Transform Wails models to frontend models (modifier_group -> group)
      return products.map(mapProduct);
    } catch (error) {
      console.error('Error getting page with products:', error);
      throw error;
    }
  },

  createPage: async (page: any) => {
    try {
      const newPage = new models.CustomPage(page);
      return await CreatePage(newPage);
    } catch (error) {
      console.error('Error creating custom page:', error);
      throw error;
    }
  },

  updatePage: async (page: any) => {
    try {
      await UpdatePage(new models.CustomPage(page));
    } catch (error) {
      console.error('Error updating custom page:', error);
      throw error;
    }
  },

  deletePage: async (id: number) => {
    try {
      await DeletePage(id);
    } catch (error) {
      console.error('Error deleting custom page:', error);
      throw error;
    }
  },

  addProductToPage: async (pageId: number, productId: number, position: number) => {
    try {
      await AddProductToPage(pageId, productId, position);
    } catch (error) {
      console.error('Error adding product to page:', error);
      throw error;
    }
  },

  removeProductFromPage: async (pageId: number, productId: number) => {
    try {
      await RemoveProductFromPage(pageId, productId);
    } catch (error) {
      console.error('Error removing product from page:', error);
      throw error;
    }
  },

  setPageProducts: async (pageId: number, productIds: number[]) => {
    try {
      await SetPageProducts(pageId, productIds);
    } catch (error) {
      console.error('Error setting page products:', error);
      throw error;
    }
  },
};
