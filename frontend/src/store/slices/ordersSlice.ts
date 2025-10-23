import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Order, OrderItem, Table } from '../../types/models';
import { wailsOrderService } from '../../services/wailsOrderService';

interface OrdersState {
  orders: Order[];
  currentOrder: Order | null;
  pendingOrders: Order[];
  selectedTable: Table | null;
  orderItems: OrderItem[];
  loading: boolean;
  error: string | null;
}

const initialState: OrdersState = {
  orders: [],
  currentOrder: null,
  pendingOrders: [],
  selectedTable: null,
  orderItems: [],
  loading: false,
  error: null,
};

// Async thunks
export const fetchOrders = createAsyncThunk(
  'orders/fetchOrders',
  async () => {
    return await wailsOrderService.getTodayOrders();
  }
);

export const fetchPendingOrders = createAsyncThunk(
  'orders/fetchPending',
  async () => {
    return await wailsOrderService.getPendingOrders();
  }
);

export const createOrder = createAsyncThunk(
  'orders/create',
  async (orderData: any) => {
    return await wailsOrderService.createOrder(orderData);
  }
);

export const updateOrderStatus = createAsyncThunk(
  'orders/updateStatus',
  async ({ orderId, status }: { orderId: number; status: string }) => {
    return await wailsOrderService.updateOrderStatus(orderId, status);
  }
);

// Slice
const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    setCurrentOrder: (state, action: PayloadAction<Order | null>) => {
      state.currentOrder = action.payload;
    },
    setSelectedTable: (state, action: PayloadAction<Table | null>) => {
      state.selectedTable = action.payload;
    },
    addOrderItem: (state, action: PayloadAction<OrderItem>) => {
      state.orderItems.push(action.payload);
    },
    updateOrderItem: (state, action: PayloadAction<{ id: number; updates: Partial<OrderItem> }>) => {
      const index = state.orderItems.findIndex(item => item.id === action.payload.id);
      if (index !== -1) {
        state.orderItems[index] = { ...state.orderItems[index], ...action.payload.updates };
      }
    },
    removeOrderItem: (state, action: PayloadAction<number>) => {
      state.orderItems = state.orderItems.filter(item => item.id !== action.payload);
    },
    clearCurrentOrder: (state) => {
      state.currentOrder = null;
      state.orderItems = [];
      state.selectedTable = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch orders
    builder.addCase(fetchOrders.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchOrders.fulfilled, (state, action) => {
      state.loading = false;
      state.orders = action.payload;
    });
    builder.addCase(fetchOrders.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Error loading orders';
    });

    // Fetch pending orders
    builder.addCase(fetchPendingOrders.fulfilled, (state, action) => {
      state.pendingOrders = action.payload;
    });

    // Create order
    builder.addCase(createOrder.fulfilled, (state, action) => {
      state.orders.push(action.payload);
      state.currentOrder = null;
      state.orderItems = [];
      state.selectedTable = null;
    });

    // Update order status
    builder.addCase(updateOrderStatus.fulfilled, (state, action) => {
      const index = state.orders.findIndex(order => order.id === action.payload.id);
      if (index !== -1) {
        state.orders[index] = action.payload;
      }
    });
  },
});

export const {
  setCurrentOrder,
  setSelectedTable,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  clearCurrentOrder,
  clearError,
} = ordersSlice.actions;

export default ordersSlice.reducer;
