import apiClient, { cacheResponse } from './apiClient';
import { Product, Category, ModifierGroup, Modifier } from '../types/models';

class ProductService {
  // Products
  async getProducts(): Promise<Product[]> {
    const response = await apiClient.get('/api/products');
    cacheResponse('/api/products', response.data);
    return response.data;
  }

  async getProductById(id: number): Promise<Product> {
    const response = await apiClient.get(`/api/products/${id}`);
    return response.data;
  }

  async getProductsByCategory(categoryId: number): Promise<Product[]> {
    const response = await apiClient.get(`/api/products/category/${categoryId}`);
    cacheResponse(`/api/products/category/${categoryId}`, response.data);
    return response.data;
  }

  async searchProducts(query: string): Promise<Product[]> {
    const response = await apiClient.get('/api/products/search', {
      params: { q: query },
    });
    return response.data;
  }

  async createProduct(product: Partial<Product>): Promise<Product> {
    const response = await apiClient.post('/api/products', product);
    return response.data;
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<Product> {
    const response = await apiClient.put(`/api/products/${id}`, product);
    return response.data;
  }

  async deleteProduct(id: number): Promise<void> {
    await apiClient.delete(`/api/products/${id}`);
  }

  async adjustStock(productId: number, quantity: number, reason: string): Promise<void> {
    await apiClient.post(`/api/products/${productId}/adjust-stock`, {
      quantity,
      reason,
    });
  }

  async getLowStockProducts(limit: number = 10): Promise<Product[]> {
    const response = await apiClient.get('/api/products/low-stock', {
      params: { limit },
    });
    return response.data;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    const response = await apiClient.get('/api/categories');
    cacheResponse('/api/categories', response.data);
    return response.data;
  }

  async getCategoryById(id: number): Promise<Category> {
    const response = await apiClient.get(`/api/categories/${id}`);
    return response.data;
  }

  async createCategory(category: Partial<Category>): Promise<Category> {
    const response = await apiClient.post('/api/categories', category);
    return response.data;
  }

  async updateCategory(id: number, category: Partial<Category>): Promise<Category> {
    const response = await apiClient.put(`/api/categories/${id}`, category);
    return response.data;
  }

  async deleteCategory(id: number): Promise<void> {
    await apiClient.delete(`/api/categories/${id}`);
  }

  // Modifiers
  async getModifierGroups(): Promise<ModifierGroup[]> {
    const response = await apiClient.get('/api/modifier-groups');
    cacheResponse('/api/modifier-groups', response.data);
    return response.data;
  }

  async getModifierGroupById(id: number): Promise<ModifierGroup> {
    const response = await apiClient.get(`/api/modifier-groups/${id}`);
    return response.data;
  }

  async createModifierGroup(group: Partial<ModifierGroup>): Promise<ModifierGroup> {
    const response = await apiClient.post('/api/modifier-groups', group);
    return response.data;
  }

  async updateModifierGroup(id: number, group: Partial<ModifierGroup>): Promise<ModifierGroup> {
    const response = await apiClient.put(`/api/modifier-groups/${id}`, group);
    return response.data;
  }

  async deleteModifierGroup(id: number): Promise<void> {
    await apiClient.delete(`/api/modifier-groups/${id}`);
  }

  async createModifier(modifier: Partial<Modifier>): Promise<Modifier> {
    const response = await apiClient.post('/api/modifiers', modifier);
    return response.data;
  }

  async updateModifier(id: number, modifier: Partial<Modifier>): Promise<Modifier> {
    const response = await apiClient.put(`/api/modifiers/${id}`, modifier);
    return response.data;
  }

  async deleteModifier(id: number): Promise<void> {
    await apiClient.delete(`/api/modifiers/${id}`);
  }

  // Product-Modifier associations
  async assignModifierToProduct(productId: number, modifierId: number): Promise<void> {
    await apiClient.post(`/api/products/${productId}/modifiers/${modifierId}`);
  }

  async removeModifierFromProduct(productId: number, modifierId: number): Promise<void> {
    await apiClient.delete(`/api/products/${productId}/modifiers/${modifierId}`);
  }

  // Import/Export
  async importProducts(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);

    await apiClient.post('/api/products/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  async exportProducts(format: 'csv' | 'json' = 'csv'): Promise<Blob> {
    const response = await apiClient.get('/api/products/export', {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  // Inventory movements
  async getInventoryMovements(productId?: number): Promise<any[]> {
    const response = await apiClient.get('/api/inventory/movements', {
      params: productId ? { product_id: productId } : {},
    });
    return response.data;
  }

  async getInventoryReport(): Promise<any> {
    const response = await apiClient.get('/api/inventory/report');
    return response.data;
  }
}

export const productService = new ProductService();
