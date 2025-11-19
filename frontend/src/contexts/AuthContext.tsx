import React, { createContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { wailsAuthService } from '../services/wailsAuthService';
import { Employee } from '../types/models';

interface AuthContextType {
  isAuthenticated: boolean;
  user: Employee | null;
  loading: boolean;
  cashRegisterId: number | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithPIN: (pin: string) => Promise<void>;
  logout: () => void;
  openCashRegister: (openingAmount: number, notes: string) => Promise<void>;
  closeCashRegister: (closingAmount: number, notes: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashRegisterId, setCashRegisterId] = useState<number | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userData = await wailsAuthService.validateToken(token);
          if (userData) {
            setUser(userData);
            setIsAuthenticated(true);

            // Check for open cash register
            const register = await wailsAuthService.getOpenCashRegister(userData.id!);
            if (register && register.id) {
              setCashRegisterId(register.id);
            }
          } else {
            localStorage.removeItem('token');
          }
        }
      } catch (error: any) {
        // Clear token if database not initialized (first run) or any other error
        if (error?.message?.includes('database not initialized') ||
            error?.message?.includes('invalid memory address')) {
        }
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await wailsAuthService.login(username, password);
      localStorage.setItem('token', response.token);
      setUser(response.employee);
      setIsAuthenticated(true);
      
      // Check for open cash register
      const register = await wailsAuthService.getOpenCashRegister(response.employee.id!);
      if (register && register.id) {
        setCashRegisterId(register.id);
        toast.info(`Caja abierta: ${register.opening_amount}`);
      } else {
        toast.warning('No hay caja abierta. Por favor abra la caja para realizar ventas.');
      }
      
      toast.success(`Bienvenido ${response.employee.name}`);
    } catch (error: any) {
      toast.error(error.message || 'Error al iniciar sesión');
      throw error;
    }
  }, []);

  const loginWithPIN = useCallback(async (pin: string) => {
    try {
      const response = await wailsAuthService.loginWithPIN(pin);
      localStorage.setItem('token', response.token);
      setUser(response.employee);
      setIsAuthenticated(true);
      
      // Check for open cash register
      const register = await wailsAuthService.getOpenCashRegister(response.employee.id!);
      if (register && register.id) {
        setCashRegisterId(register.id);
        toast.info(`Caja abierta: ${register.opening_amount}`);
      } else {
        toast.warning('No hay caja abierta. Por favor abra la caja para realizar ventas.');
      }
      
      toast.success(`Bienvenido ${response.employee.name}`);
    } catch (error: any) {
      toast.error(error.message || 'PIN incorrecto');
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    setIsAuthenticated(false);
    setCashRegisterId(null);
    toast.info('Sesión cerrada');
  }, []);

  const openCashRegister = useCallback(async (openingAmount: number, notes: string) => {
    if (!user) {
      throw new Error('No hay usuario autenticado');
    }

    try {
      const register = await wailsAuthService.openCashRegister(user.id!, openingAmount, notes);
      if (register && register.id) {
        setCashRegisterId(register.id);
      }
      toast.success('Caja abierta exitosamente');
    } catch (error: any) {
      toast.error(error.message || 'Error al abrir la caja');
      throw error;
    }
  }, [user]);

  const closeCashRegister = useCallback(async (closingAmount: number, notes: string) => {
    if (!cashRegisterId) {
      throw new Error('No hay caja abierta');
    }

    try {
      const report = await wailsAuthService.closeCashRegister(cashRegisterId, closingAmount, notes);
      setCashRegisterId(null);
      
      // Show cash difference if any
      if (report.difference !== 0) {
        const differenceType = report.difference > 0 ? 'Sobrante' : 'Faltante';
        const differenceAmount = Math.abs(report.difference);
        toast.warning(`${differenceType}: $${differenceAmount.toLocaleString('es-CO')}`);
      }
      
      toast.success('Caja cerrada exitosamente');
      return report;
    } catch (error: any) {
      toast.error(error.message || 'Error al cerrar la caja');
      throw error;
    }
  }, [cashRegisterId]);

  const value = {
    isAuthenticated,
    user,
    loading,
    cashRegisterId,
    login,
    loginWithPIN,
    logout,
    openCashRegister,
    closeCashRegister,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

export { AuthContext };
export default AuthContext;
