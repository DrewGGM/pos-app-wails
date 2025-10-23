import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  language: 'es' | 'en';
  notifications: Notification[];
  activeDialog: string | null;
  loading: {
    [key: string]: boolean;
  };
  alerts: Alert[];
  posMode: 'simple' | 'advanced';
  soundEnabled: boolean;
  printAutomatically: boolean;
}

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  read: boolean;
}

interface Alert {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  autoClose?: number;
}

const initialState: UIState = {
  sidebarOpen: true,
  theme: 'light',
  language: 'es',
  notifications: [],
  activeDialog: null,
  loading: {},
  alerts: [],
  posMode: 'simple',
  soundEnabled: true,
  printAutomatically: true,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'es' | 'en'>) => {
      state.language = action.payload;
    },
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp' | 'read'>>) => {
      state.notifications.unshift({
        ...action.payload,
        id: Date.now().toString(),
        timestamp: new Date(),
        read: false,
      });
    },
    markNotificationAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification) {
        notification.read = true;
      }
    },
    markAllNotificationsAsRead: (state) => {
      state.notifications.forEach(n => {
        n.read = true;
      });
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    setActiveDialog: (state, action: PayloadAction<string | null>) => {
      state.activeDialog = action.payload;
    },
    setLoading: (state, action: PayloadAction<{ key: string; value: boolean }>) => {
      state.loading[action.payload.key] = action.payload.value;
    },
    addAlert: (state, action: PayloadAction<Omit<Alert, 'id'>>) => {
      state.alerts.push({
        ...action.payload,
        id: Date.now().toString(),
      });
    },
    removeAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter(a => a.id !== action.payload);
    },
    clearAlerts: (state) => {
      state.alerts = [];
    },
    setPosMode: (state, action: PayloadAction<'simple' | 'advanced'>) => {
      state.posMode = action.payload;
    },
    toggleSound: (state) => {
      state.soundEnabled = !state.soundEnabled;
    },
    toggleAutoPrint: (state) => {
      state.printAutomatically = !state.printAutomatically;
    },
    resetUI: () => initialState,
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  setTheme,
  setLanguage,
  addNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotifications,
  setActiveDialog,
  setLoading,
  addAlert,
  removeAlert,
  clearAlerts,
  setPosMode,
  toggleSound,
  toggleAutoPrint,
  resetUI,
} = uiSlice.actions;

export default uiSlice.reducer;
