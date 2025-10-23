import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Order, OrderItem } from '../../types/models';
import { orderService } from '../../services/orderService';

interface KitchenState {
  queue: Order[];
  preparingOrders: Order[];
  readyOrders: Order[];
  selectedOrder: Order | null;
  averagePreparationTime: number;
  filter: 'all' | 'pending' | 'preparing' | 'ready';
  sortBy: 'time' | 'priority' | 'table';
  loading: boolean;
  error: string | null;
  stats: {
    pendingCount: number;
    preparingCount: number;
    readyCount: number;
    averageTime: number;
  };
}

const initialState: KitchenState = {
  queue: [],
  preparingOrders: [],
  readyOrders: [],
  selectedOrder: null,
  averagePreparationTime: 0,
  filter: 'pending',
  sortBy: 'time',
  loading: false,
  error: null,
  stats: {
    pendingCount: 0,
    preparingCount: 0,
    readyCount: 0,
    averageTime: 0,
  },
};

// Async thunks
export const fetchKitchenQueue = createAsyncThunk(
  'kitchen/fetchQueue',
  async () => {
    return await orderService.getKitchenQueue();
  }
);

export const startPreparation = createAsyncThunk(
  'kitchen/startPreparation',
  async (orderId: number) => {
    return await orderService.updateOrderStatus(orderId, 'preparing');
  }
);

export const markOrderReady = createAsyncThunk(
  'kitchen/markReady',
  async (orderId: number) => {
    return await orderService.updateOrderStatus(orderId, 'ready');
  }
);

export const markItemReady = createAsyncThunk(
  'kitchen/markItemReady',
  async ({ orderId, itemId }: { orderId: number; itemId: number }) => {
    return await orderService.markItemReady(orderId, itemId);
  }
);

export const fetchAveragePreparationTime = createAsyncThunk(
  'kitchen/fetchAvgTime',
  async () => {
    return await orderService.getAveragePreparationTime();
  }
);

// Slice
const kitchenSlice = createSlice({
  name: 'kitchen',
  initialState,
  reducers: {
    setSelectedOrder: (state, action: PayloadAction<Order | null>) => {
      state.selectedOrder = action.payload;
    },
    setFilter: (state, action: PayloadAction<typeof initialState.filter>) => {
      state.filter = action.payload;
    },
    setSortBy: (state, action: PayloadAction<typeof initialState.sortBy>) => {
      state.sortBy = action.payload;
    },
    updateOrderInQueue: (state, action: PayloadAction<Order>) => {
      const index = state.queue.findIndex(o => o.id === action.payload.id);
      if (index !== -1) {
        state.queue[index] = action.payload;
      }
    },
    removeFromQueue: (state, action: PayloadAction<number>) => {
      state.queue = state.queue.filter(o => o.id !== action.payload);
    },
    addToQueue: (state, action: PayloadAction<Order>) => {
      state.queue.push(action.payload);
      state.stats.pendingCount++;
    },
    moveToPreparing: (state, action: PayloadAction<Order>) => {
      state.queue = state.queue.filter(o => o.id !== action.payload.id);
      state.preparingOrders.push(action.payload);
      state.stats.pendingCount--;
      state.stats.preparingCount++;
    },
    moveToReady: (state, action: PayloadAction<Order>) => {
      state.preparingOrders = state.preparingOrders.filter(o => o.id !== action.payload.id);
      state.readyOrders.push(action.payload);
      state.stats.preparingCount--;
      state.stats.readyCount++;
    },
    updateStats: (state) => {
      state.stats = {
        pendingCount: state.queue.filter(o => o.status === 'pending').length,
        preparingCount: state.preparingOrders.length,
        readyCount: state.readyOrders.length,
        averageTime: state.averagePreparationTime,
      };
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch kitchen queue
    builder.addCase(fetchKitchenQueue.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchKitchenQueue.fulfilled, (state, action) => {
      state.loading = false;
      state.queue = action.payload.filter(o => o.status === 'pending');
      state.preparingOrders = action.payload.filter(o => o.status === 'preparing');
      state.readyOrders = action.payload.filter(o => o.status === 'ready');
      
      // Update stats
      state.stats = {
        pendingCount: state.queue.length,
        preparingCount: state.preparingOrders.length,
        readyCount: state.readyOrders.length,
        averageTime: state.averagePreparationTime,
      };
    });
    builder.addCase(fetchKitchenQueue.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Error loading kitchen queue';
    });

    // Start preparation
    builder.addCase(startPreparation.fulfilled, (state, action) => {
      const order = state.queue.find(o => o.id === action.payload.id);
      if (order) {
        state.queue = state.queue.filter(o => o.id !== action.payload.id);
        state.preparingOrders.push({ ...order, status: 'preparing' });
        state.stats.pendingCount--;
        state.stats.preparingCount++;
      }
    });

    // Mark order ready
    builder.addCase(markOrderReady.fulfilled, (state, action) => {
      const order = state.preparingOrders.find(o => o.id === action.payload.id);
      if (order) {
        state.preparingOrders = state.preparingOrders.filter(o => o.id !== action.payload.id);
        state.readyOrders.push({ ...order, status: 'ready' });
        state.stats.preparingCount--;
        state.stats.readyCount++;
      }
    });

    // Fetch average preparation time
    builder.addCase(fetchAveragePreparationTime.fulfilled, (state, action) => {
      state.averagePreparationTime = action.payload;
      state.stats.averageTime = action.payload;
    });
  },
});

export const {
  setSelectedOrder,
  setFilter,
  setSortBy,
  updateOrderInQueue,
  removeFromQueue,
  addToQueue,
  moveToPreparing,
  moveToReady,
  updateStats,
  clearError,
} = kitchenSlice.actions;

export default kitchenSlice.reducer;
