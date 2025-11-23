import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import CashRegister from './pages/CashRegister';
import CashRegisterHistory from './pages/CashRegisterHistory';
import Tables from './pages/Tables';
import Customers from './pages/Customers';
import Employees from './pages/Employees';
import Inventory from './pages/Inventory';
import Ingredients from './pages/Ingredients';

// Hooks
import { useAuth,useWebSocket } from './hooks';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import CashRegisterGuard from './components/CashRegisterGuard';
import LoadingScreen from './components/LoadingScreen';
import SetupWizard from './components/SetupWizard';

// Services
import { wailsConfigManagerService } from './services/wailsConfigManagerService';

const App: React.FC = () => {
  const { isAuthenticated, loading, cashRegisterId } = useAuth();
  const { connect, disconnect } = useWebSocket();
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        const firstRun = await wailsConfigManagerService.isFirstRun();
        setIsFirstRun(firstRun);
      } catch (error) {
        setIsFirstRun(false);
      }
    };

    checkFirstRun();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  if (loading || isFirstRun === null) {
    return <LoadingScreen />;
  }

  // Show setup wizard on first run
  if (isFirstRun) {
    return <SetupWizard onSetupComplete={() => setIsFirstRun(false)} />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Routes>
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />} />
        </Route>

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><CashRegisterGuard><MainLayout /></CashRegisterGuard></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/products" element={<Products />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/cash-register" element={<CashRegister />} />
          <Route path="/cash-register-history" element={<CashRegisterHistory />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/settings/*" element={<Settings />} />
        </Route>

        {/* Default Redirect */}
        <Route path="/" element={<Navigate to={isAuthenticated ? (cashRegisterId ? "/dashboard" : "/cash-register") : "/login"} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Box>
  );
};

export default App;