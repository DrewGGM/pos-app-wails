import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Employee, CashRegister } from '../../types/models';
import { wailsAuthService } from '../../services/wailsAuthService';

interface AuthState {
  isAuthenticated: boolean;
  user: Employee | null;
  cashRegister: CashRegister | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  cashRegister: null,
  token: localStorage.getItem('token'),
  loading: false,
  error: null,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }: { username: string; password: string }) => {
    const response = await wailsAuthService.login(username, password);
    localStorage.setItem('token', response.token);
    return response;
  }
);

export const loginWithPIN = createAsyncThunk(
  'auth/loginWithPIN',
  async (pin: string) => {
    const response = await wailsAuthService.loginWithPIN(pin);
    localStorage.setItem('token', response.token);
    return response;
  }
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await wailsAuthService.logout();
  localStorage.removeItem('token');
});

export const openCashRegister = createAsyncThunk(
  'auth/openCashRegister',
  async ({ openingAmount, notes }: { openingAmount: number; notes: string }, { getState }) => {
    const state = getState() as { auth: AuthState };
    const employeeId = state.auth.user?.id;
    if (!employeeId) throw new Error('No user authenticated');
    
    return await wailsAuthService.openCashRegister(employeeId, openingAmount, notes);
  }
);

export const closeCashRegister = createAsyncThunk(
  'auth/closeCashRegister',
  async ({ closingAmount, notes }: { closingAmount: number; notes: string }, { getState }) => {
    const state = getState() as { auth: AuthState };
    const registerId = state.auth.cashRegister?.id;
    if (!registerId) throw new Error('No cash register open');
    
    return await wailsAuthService.closeCashRegister(registerId, closingAmount, notes);
  }
);

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<Employee | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setCashRegister: (state, action: PayloadAction<CashRegister | null>) => {
      state.cashRegister = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder.addCase(login.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(login.fulfilled, (state, action) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.employee;
      state.token = action.payload.token;
    });
    builder.addCase(login.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Login failed';
    });

    // Login with PIN
    builder.addCase(loginWithPIN.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(loginWithPIN.fulfilled, (state, action) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.employee;
      state.token = action.payload.token;
    });
    builder.addCase(loginWithPIN.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Invalid PIN';
    });

    // Logout
    builder.addCase(logout.fulfilled, (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.cashRegister = null;
      state.token = null;
    });

    // Open Cash Register
    builder.addCase(openCashRegister.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(openCashRegister.fulfilled, (state, action) => {
      state.loading = false;
      state.cashRegister = action.payload;
    });
    builder.addCase(openCashRegister.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to open cash register';
    });

    // Close Cash Register
    builder.addCase(closeCashRegister.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(closeCashRegister.fulfilled, (state) => {
      state.loading = false;
      state.cashRegister = null;
    });
    builder.addCase(closeCashRegister.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to close cash register';
    });
  },
});

export const { setUser, setCashRegister, clearError } = authSlice.actions;
export default authSlice.reducer;
