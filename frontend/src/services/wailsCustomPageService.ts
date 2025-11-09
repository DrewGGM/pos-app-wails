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
      return await GetPageWithProducts(pageID);
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
