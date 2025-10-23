import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { toast } from 'react-toastify';

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add offline header if offline
    if (!navigator.onLine) {
      config.headers['X-Offline-Mode'] = 'true';
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Handle network errors
    if (!error.response && !navigator.onLine) {
      // Store request for later sync if offline
      if (originalRequest.method !== 'GET') {
        storeOfflineRequest(originalRequest);
        
        // Return mock success for offline operations
        return Promise.resolve({
          data: {
            success: true,
            offline: true,
            message: 'Operación guardada para sincronizar',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: originalRequest,
        });
      }
      
      // Try to get data from local cache for GET requests
      return getFromLocalCache(originalRequest.url || '');
    }

    // Handle 401 unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
      
      return Promise.reject(error);
    }

    // Handle 403 forbidden
    if (error.response?.status === 403) {
      toast.error('No tienes permisos para realizar esta acción');
      return Promise.reject(error);
    }

    // Handle 404 not found
    if (error.response?.status === 404) {
      toast.error('Recurso no encontrado');
      return Promise.reject(error);
    }

    // Handle 500 server error
    if (error.response?.status === 500) {
      toast.error('Error del servidor. Por favor intenta más tarde.');
      return Promise.reject(error);
    }

    // Handle validation errors
    if (error.response?.status === 422) {
      const validationErrors = error.response.data as any;
      if (validationErrors.errors) {
        Object.values(validationErrors.errors).forEach((errorMessages: any) => {
          if (Array.isArray(errorMessages)) {
            errorMessages.forEach(msg => toast.error(msg));
          }
        });
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// Store offline requests for later sync
function storeOfflineRequest(request: AxiosRequestConfig) {
  try {
    const offlineRequests = JSON.parse(localStorage.getItem('offlineRequests') || '[]');
    offlineRequests.push({
      ...request,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem('offlineRequests', JSON.stringify(offlineRequests));
  } catch (error) {
    console.error('Failed to store offline request:', error);
  }
}

// Get data from local cache
async function getFromLocalCache(url: string): Promise<any> {
  try {
    // Try to get cached data based on URL
    const cacheKey = `cache_${url}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      
      // Check if cache is still valid (24 hours)
      const cacheTime = new Date(parsed.timestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        return {
          data: parsed.data,
          status: 200,
          statusText: 'OK (from cache)',
          headers: {},
          config: {},
        };
      }
    }
    
    throw new Error('No cached data available');
  } catch (error) {
    throw new Error('No se puede acceder a los datos sin conexión');
  }
}

// Cache response data
export function cacheResponse(url: string, data: any) {
  try {
    const cacheKey = `cache_${url}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Failed to cache response:', error);
  }
}

// Process offline requests when back online
export async function processOfflineRequests() {
  try {
    const offlineRequests = JSON.parse(localStorage.getItem('offlineRequests') || '[]');
    
    if (offlineRequests.length === 0) {
      return;
    }

    toast.info(`Sincronizando ${offlineRequests.length} operaciones offline...`);

    for (const request of offlineRequests) {
      try {
        await apiClient.request(request);
      } catch (error) {
        console.error('Failed to process offline request:', error);
      }
    }

    // Clear processed requests
    localStorage.removeItem('offlineRequests');
    toast.success('Sincronización completada');
  } catch (error) {
    console.error('Failed to process offline requests:', error);
  }
}

// Listen for online event
window.addEventListener('online', () => {
  setTimeout(processOfflineRequests, 2000);
});

export default apiClient;
