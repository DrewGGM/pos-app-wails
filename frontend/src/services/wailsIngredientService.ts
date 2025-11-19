import {
  GetAllIngredients,
  GetIngredient,
  CreateIngredient,
  UpdateIngredient,
  DeleteIngredient,
  AdjustIngredientStock,
  GetIngredientMovements,
  GetProductIngredients,
  AddProductIngredient,
  UpdateProductIngredient,
  DeleteProductIngredient,
  SetProductIngredients
} from '../../wailsjs/go/services/IngredientService';
import { models } from '../../wailsjs/go/models';
import { Ingredient, ProductIngredient, IngredientMovement } from '../types/models';

// Helper to check if Wails bindings are ready
function areBindingsReady(): boolean {
  return typeof (window as any).go !== 'undefined';
}

// Adapters: Map Wails models -> Frontend models
function mapIngredient(w: models.Ingredient): Ingredient {
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    unit: w.unit || 'unidades',
    stock: w.stock || 0,
    min_stock: w.min_stock || 0,
    is_active: (w as any).is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Ingredient;
}

function mapProductIngredient(w: models.ProductIngredient): ProductIngredient {
  return {
    id: w.id as unknown as number,
    product_id: w.product_id as unknown as number,
    ingredient_id: w.ingredient_id as unknown as number,
    quantity: w.quantity || 0,
    ingredient: (w as any).ingredient ? mapIngredient((w as any).ingredient) : undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ProductIngredient;
}

function mapIngredientMovement(w: models.IngredientMovement): IngredientMovement {
  return {
    id: w.id as unknown as number,
    ingredient_id: w.ingredient_id as unknown as number,
    type: w.type as 'purchase' | 'sale' | 'adjustment' | 'loss',
    quantity: w.quantity || 0,
    previous_qty: w.previous_qty || 0,
    new_qty: w.new_qty || 0,
    reference: w.reference || '',
    employee_id: w.employee_id as unknown as number,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as IngredientMovement;
}

class WailsIngredientService {
  // Ingredients CRUD
  async getIngredients(): Promise<Ingredient[]> {
    try {
      if (!areBindingsReady()) {
        return [];
      }
      const ingredients = await GetAllIngredients();
      return ingredients.map(mapIngredient);
    } catch (error) {
      return [];
    }
  }

  async getIngredientById(id: number): Promise<Ingredient> {
    try {
      const ingredient = await GetIngredient(id);
      return mapIngredient(ingredient);
    } catch (error) {
      throw new Error('Error al obtener ingrediente');
    }
  }

  async createIngredient(ingredient: Partial<Ingredient>): Promise<void> {
    try {
      await CreateIngredient(ingredient as any);
    } catch (error) {
      throw new Error('Error al crear ingrediente');
    }
  }

  async updateIngredient(id: number, ingredient: Partial<Ingredient>): Promise<void> {
    try {
      await UpdateIngredient(ingredient as any);
    } catch (error) {
      throw new Error('Error al actualizar ingrediente');
    }
  }

  async deleteIngredient(id: number): Promise<void> {
    try {
      await DeleteIngredient(id);
    } catch (error) {
      throw new Error('Error al eliminar ingrediente');
    }
  }

  async adjustStock(ingredientId: number, quantity: number, reason: string, employeeId: number = 0): Promise<Ingredient> {
    try {
      // Call backend to adjust stock in database
      await AdjustIngredientStock(ingredientId, quantity, reason, employeeId);

      // Get updated ingredient from database
      const updatedIngredient = await GetIngredient(ingredientId);
      return mapIngredient(updatedIngredient as any);
    } catch (error) {
      throw new Error('Error al ajustar stock de ingrediente');
    }
  }

  async getIngredientMovements(ingredientId: number): Promise<IngredientMovement[]> {
    try {
      const movements = await GetIngredientMovements(ingredientId);
      return movements.map(mapIngredientMovement);
    } catch (error) {
      throw new Error('Error al obtener movimientos de ingrediente');
    }
  }

  // Product Ingredients (Recipes)
  async getProductIngredients(productId: number): Promise<ProductIngredient[]> {
    try {
      const productIngredients = await GetProductIngredients(productId);
      return productIngredients.map(mapProductIngredient);
    } catch (error) {
      return [];
    }
  }

  async addProductIngredient(productIngredient: Partial<ProductIngredient>): Promise<void> {
    try {
      await AddProductIngredient(productIngredient as any);
    } catch (error) {
      throw new Error('Error al agregar ingrediente al producto');
    }
  }

  async updateProductIngredient(id: number, productIngredient: Partial<ProductIngredient>): Promise<void> {
    try {
      await UpdateProductIngredient(productIngredient as any);
    } catch (error) {
      throw new Error('Error al actualizar ingrediente del producto');
    }
  }

  async deleteProductIngredient(id: number): Promise<void> {
    try {
      await DeleteProductIngredient(id);
    } catch (error) {
      throw new Error('Error al eliminar ingrediente del producto');
    }
  }

  async setProductIngredients(productId: number, ingredients: Partial<ProductIngredient>[]): Promise<void> {
    try {
      await SetProductIngredients(productId, ingredients as any);
    } catch (error) {
      throw new Error('Error al configurar ingredientes del producto');
    }
  }

  // Utility methods
  async getLowStockIngredients(): Promise<Ingredient[]> {
    try {
      const ingredients = await GetAllIngredients();
      return ingredients
        .map(mapIngredient)
        .filter(ingredient => ingredient.stock <= ingredient.min_stock);
    } catch (error) {
      throw new Error('Error al obtener ingredientes con stock bajo');
    }
  }
}

export const wailsIngredientService = new WailsIngredientService();
