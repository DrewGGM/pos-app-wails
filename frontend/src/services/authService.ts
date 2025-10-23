import axios from './apiClient';
import { Employee, CashRegister, CashRegisterReport } from '../types/models';

interface LoginResponse {
  token: string;
  employee: Employee;
}

interface AuthResponse {
  success: boolean;
  message?: string;
}

class AuthService {
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await axios.post('/api/auth/login', {
      username,
      password,
    });
    return response.data;
  }

  async loginWithPIN(pin: string): Promise<LoginResponse> {
    const response = await axios.post('/api/auth/login-pin', {
      pin,
    });
    return response.data;
  }

  async logout(): Promise<void> {
    await axios.post('/api/auth/logout');
    localStorage.removeItem('token');
  }

  async validateToken(token: string): Promise<Employee | null> {
    try {
      const response = await axios.get('/api/auth/validate', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<AuthResponse> {
    const response = await axios.post('/api/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword,
    });
    return response.data;
  }

  async changePIN(oldPIN: string, newPIN: string): Promise<AuthResponse> {
    const response = await axios.post('/api/auth/change-pin', {
      old_pin: oldPIN,
      new_pin: newPIN,
    });
    return response.data;
  }

  // Cash Register Management
  async openCashRegister(employeeId: number, openingAmount: number, notes: string): Promise<CashRegister> {
    const response = await axios.post('/api/cash-register/open', {
      employee_id: employeeId,
      opening_amount: openingAmount,
      notes,
    });
    return response.data;
  }

  async closeCashRegister(registerId: number, closingAmount: number, notes: string): Promise<CashRegisterReport> {
    const response = await axios.post(`/api/cash-register/${registerId}/close`, {
      closing_amount: closingAmount,
      notes,
    });
    return response.data;
  }

  async getOpenCashRegister(employeeId: number): Promise<CashRegister | null> {
    try {
      const response = await axios.get(`/api/cash-register/open/${employeeId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async addCashMovement(
    registerId: number,
    amount: number,
    type: 'deposit' | 'withdrawal',
    description: string,
    reference: string
  ): Promise<void> {
    await axios.post(`/api/cash-register/${registerId}/movement`, {
      amount,
      type,
      description,
      reference,
    });
  }

  async getCashRegisterReport(registerId: number): Promise<CashRegisterReport> {
    const response = await axios.get(`/api/cash-register/${registerId}/report`);
    return response.data;
  }

  // Employee management methods
  async getEmployees(): Promise<Employee[]> {
    const response = await axios.get('/api/employees');
    return response.data;
  }

  async createEmployee(employee: Partial<Employee>): Promise<Employee> {
    const response = await axios.post('/api/employees', employee);
    return response.data;
  }

  async updateEmployee(id: number, employee: Partial<Employee>): Promise<Employee> {
    const response = await axios.put(`/api/employees/${id}`, employee);
    return response.data;
  }

  async deleteEmployee(id: number): Promise<void> {
    await axios.delete(`/api/employees/${id}`);
  }
}

export const authService = new AuthService();
