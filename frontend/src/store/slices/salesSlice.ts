import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Sale, Customer, PaymentMethod } from '../../types/models';
import { wailsSalesService } from '../../services/wailsSalesService';

interface SalesState {
  sales: Sale[];
  todaySales: Sale[];
  currentSale: Sale | null;
  customers: Customer[];
  selectedCustomer: Customer | null;
  paymentMethods: PaymentMethod[];
  loading: boolean;
  error: string | null;
  dailyStats: {
    totalSales: number;
    totalAmount: number;
    averageSale: number;
  };
}

const initialState: SalesState = {
  sales: [],
  todaySales: [],
  currentSale: null,
  customers: [],
  selectedCustomer: null,
  paymentMethods: [],
  loading: false,
  error: null,
  dailyStats: {
    totalSales: 0,
    totalAmount: 0,
    averageSale: 0,
  },
};

// Async thunks
export const fetchTodaySales = createAsyncThunk(
  'sales/fetchToday',
  async () => {
    return await wailsSalesService.getTodaySales();
  }
);

export const fetchSalesHistory = createAsyncThunk(
  'sales/fetchHistory',
  async ({ limit = 100, offset = 0 }: { limit?: number; offset?: number }) => {
    return await wailsSalesService.getSalesHistory(limit, offset);
  }
);

export const processSale = createAsyncThunk(
  'sales/process',
  async (saleData: any) => {
    return await wailsSalesService.processSale(saleData);
  }
);

export const refundSale = createAsyncThunk(
  'sales/refund',
  async ({ saleId, amount, reason, employeeId }: { saleId: number; amount: number; reason: string; employeeId: number }) => {
    await wailsSalesService.refundSale(saleId, amount, reason, employeeId);
    return saleId;
  }
);

export const fetchPaymentMethods = createAsyncThunk(
  'sales/fetchPaymentMethods',
  async () => {
    return await wailsSalesService.getPaymentMethods();
  }
);

export const fetchCustomers = createAsyncThunk(
  'sales/fetchCustomers',
  async () => {
    return await wailsSalesService.getCustomers();
  }
);

export const searchCustomers = createAsyncThunk(
  'sales/searchCustomers',
  async (query: string) => {
    return await wailsSalesService.searchCustomers(query);
  }
);

export const createCustomer = createAsyncThunk(
  'sales/createCustomer',
  async (customer: Partial<Customer>) => {
    await wailsSalesService.createCustomer(customer);
    return customer; // Return the customer data for state update
  }
);

// Slice
const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    setCurrentSale: (state, action: PayloadAction<Sale | null>) => {
      state.currentSale = action.payload;
    },
    setSelectedCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.selectedCustomer = action.payload;
    },
    updateDailyStats: (state, action: PayloadAction<typeof initialState.dailyStats>) => {
      state.dailyStats = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch today's sales
    builder.addCase(fetchTodaySales.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchTodaySales.fulfilled, (state, action) => {
      state.loading = false;
      state.todaySales = action.payload;
      
      // Calculate daily stats
      const totalSales = action.payload.length;
      const totalAmount = action.payload.reduce((sum: number, sale: any) => sum + sale.total, 0);
      state.dailyStats = {
        totalSales,
        totalAmount,
        averageSale: totalSales > 0 ? totalAmount / totalSales : 0,
      };
    });
    builder.addCase(fetchTodaySales.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Error loading sales';
    });

    // Fetch sales history
    builder.addCase(fetchSalesHistory.fulfilled, (state, action) => {
      state.sales = action.payload.sales;
    });

    // Process sale
    builder.addCase(processSale.fulfilled, (state, action) => {
      state.todaySales.push(action.payload);
      state.currentSale = action.payload;
      
      // Update daily stats
      state.dailyStats.totalSales += 1;
      state.dailyStats.totalAmount += action.payload.total;
      state.dailyStats.averageSale = state.dailyStats.totalAmount / state.dailyStats.totalSales;
    });

    // Refund sale
    builder.addCase(refundSale.fulfilled, (state, action) => {
      const sale = state.todaySales.find(s => s.id === action.payload);
      if (sale) {
        sale.status = 'refunded';
      }
    });

    // Fetch payment methods
    builder.addCase(fetchPaymentMethods.fulfilled, (state, action) => {
      state.paymentMethods = action.payload;
    });

    // Fetch customers
    builder.addCase(fetchCustomers.fulfilled, (state, action) => {
      state.customers = action.payload;
    });

    // Search customers
    builder.addCase(searchCustomers.fulfilled, (state, action) => {
      state.customers = action.payload;
    });

    // Create customer
    builder.addCase(createCustomer.fulfilled, (state, action) => {
      state.customers.push(action.payload as any);
      state.selectedCustomer = action.payload as any;
    });
  },
});

export const {
  setCurrentSale,
  setSelectedCustomer,
  updateDailyStats,
  clearError,
} = salesSlice.actions;

export default salesSlice.reducer;
