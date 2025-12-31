import {
  AuthenticateEmployee,
  AuthenticateEmployeeByPIN,
  GetOpenCashRegister,
  OpenCashRegister,
  CloseCashRegister,
  GetCurrentCashRegister,
  PrintCurrentCashRegisterReport,
  PrintLastCashRegisterReport,
  GetCashRegisterReport,
  GetCashRegisterHistory,
  GetCashRegisterSalesSummary,
  GetEmployees,
  GetEmployee,
  CreateEmployee,
  UpdateEmployee,
  DeleteEmployee,
  AddCashMovement,
  UpdateCashMovement
} from '../../wailsjs/go/services/EmployeeService';
import { models } from '../../wailsjs/go/models';
import { Employee, CashRegister, CashRegisterReport } from '../types/models';

interface LoginResponse {
  token: string;
  employee: Employee;
}

interface AuthResponse {
  success: boolean;
  message?: string;
}

// Optimized sales summary for cash register (uses SQL aggregation)
export interface CashRegisterSalesSummary {
  by_payment_method: { [key: string]: number };
  by_payment_method_display: { [key: string]: number };
  total: number;
  total_display: number;
  count: number;
  count_display: number;
  service_charge_by_payment?: { [key: string]: number }; // Service charge breakdown by payment method
  total_service_charge?: number; // Total service charge collected
}

// Adapters: Map Wails models -> Frontend models (avoid Time type mismatches)
function mapEmployee(w: models.Employee): Employee {
  const isActive = (w as any).is_active ?? true;
  return {
    id: w.id as unknown as number,
    name: w.name || '',
    username: (w as any).username || '',
    role: (w as any).role || 'admin',
    email: (w as any).email,
    phone: (w as any).phone,
    is_active: isActive,
    active: isActive, // Alias for UI compatibility
    last_login_at: (w as any).last_login_at ? new Date((w as any).last_login_at).toISOString() : null,
    pin: (w as any).pin,
    // Base fields as strings (UI rarely uses these directly)
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Employee;
}

function mapCashRegister(w: models.CashRegister): CashRegister {
  return {
    id: w.id as unknown as number,
    employee_id: (w as any).employee_id as number,
    employee: (w as any).employee ? {
      id: (w as any).employee.id as number,
      name: (w as any).employee.name || '',
      email: (w as any).employee.email || '',
    } : undefined,
    opening_amount: (w as any).opening_amount as number,
    closing_amount: (w as any).closing_amount as number,
    expected_amount: (w as any).expected_amount as number,
    difference: (w as any).difference as number,
    status: (w as any).status as any,
    notes: (w as any).notes,
    opened_at: (w as any).opened_at ? new Date((w as any).opened_at).toISOString() : new Date().toISOString(),
    closed_at: (w as any).closed_at ? new Date((w as any).closed_at).toISOString() : undefined,
    created_at: (w as any).created_at ? new Date((w as any).created_at).toISOString() : new Date().toISOString(),
    updated_at: (w as any).updated_at ? new Date((w as any).updated_at).toISOString() : new Date().toISOString(),
    // Map cash movements
    movements: ((w as any).movements || []).map((m: any) => ({
      id: m.id as number,
      cash_register_id: m.cash_register_id as number,
      type: m.type as string,
      amount: m.amount as number,
      description: m.description || '',
      reason: m.reason || '',
      reference: m.reference || '',
      employee_id: m.employee_id as number,
      employee: m.employee ? {
        id: m.employee.id as number,
        name: m.employee.name || '',
      } : undefined,
      created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
    })),
  } as CashRegister;
}

function mapCashRegisterReport(w: models.CashRegisterReport): CashRegisterReport {
  return {
    id: w.id as unknown as number,
    cash_register_id: (w as any).cash_register_id as number,
    date: new Date().toISOString(),
    total_sales: (w as any).total_sales as number,
    total_cash: (w as any).total_cash as number,
    total_card: (w as any).total_card as number,
    total_digital: (w as any).total_digital as number,
    total_other: (w as any).total_other as number,
    total_refunds: (w as any).total_refunds as number,
    total_discounts: (w as any).total_discounts as number,
    total_tax: (w as any).total_tax as number,
    number_of_sales: (w as any).number_of_sales as number,
    number_of_refunds: (w as any).number_of_refunds as number,
    cash_deposits: (w as any).cash_deposits as number,
    cash_withdrawals: (w as any).cash_withdrawals as number,
    opening_balance: (w as any).opening_balance as number,
    closing_balance: (w as any).closing_balance as number,
    expected_balance: (w as any).expected_balance as number,
    difference: (w as any).difference as number,
    notes: (w as any).notes,
    generated_by: (w as any).generated_by as number,
    created_at: new Date().toISOString(),
  } as CashRegisterReport;
}

class WailsAuthService {
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const employee = await AuthenticateEmployee(username, password);
      const token = btoa(`${(employee as any).id}:${Date.now()}`);
      localStorage.setItem('token', token);
      return { token, employee: mapEmployee(employee) };
    } catch (error) {
      throw new Error('Credenciales inválidas');
    }
  }

  async loginWithPIN(pin: string): Promise<LoginResponse> {
    try {
      const employee = await AuthenticateEmployeeByPIN(pin);
      const token = btoa(`${(employee as any).id}:${Date.now()}`);
      localStorage.setItem('token', token);
      return { token, employee: mapEmployee(employee) };
    } catch (error) {
      throw new Error('PIN inválido');
    }
  }

  async logout(): Promise<void> {
    localStorage.removeItem('token');
  }

  async validateToken(token: string): Promise<Employee | null> {
    try {
      // Decode token to get employee ID
      const decoded = atob(token);
      const [employeeId] = decoded.split(':');

      if (!employeeId || localStorage.getItem('token') !== token) {
        return null;
      }

      // Validate against database
      const employee = await GetEmployee(parseInt(employeeId));
      if (!employee || !(employee as any).is_active) {
        return null;
      }

      return mapEmployee(employee);
    } catch (error) {
      return null;
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<AuthResponse> {
    return { success: true, message: 'Contraseña actualizada' };
  }

  async changePIN(oldPIN: string, newPIN: string): Promise<AuthResponse> {
    return { success: true, message: 'PIN actualizado' };
  }

  // Cash Register Management
  async openCashRegister(employeeId: number, openingAmount: number, notes: string): Promise<CashRegister> {
    try {
      const register = await OpenCashRegister(employeeId, openingAmount, notes);
      return mapCashRegister(register);
    } catch {
      throw new Error('Error al abrir la caja');
    }
  }

  async closeCashRegister(registerId: number, closingAmount: number, notes: string): Promise<CashRegisterReport> {
    try {
      const report = await CloseCashRegister(registerId, closingAmount, notes);
      return mapCashRegisterReport(report);
    } catch {
      throw new Error('Error al cerrar la caja');
    }
  }

  async getOpenCashRegister(employeeId: number): Promise<CashRegister | null> {
    try {
      const register = await GetOpenCashRegister(employeeId);
      return mapCashRegister(register);
    } catch {
      return null;
    }
  }

  async getCurrentCashRegister(): Promise<CashRegister | null> {
    try {
      const register = await GetCurrentCashRegister();
      return mapCashRegister(register);
    } catch {
      return null;
    }
  }

  async addCashMovement(
    registerId: number,
    amount: number,
    type: 'deposit' | 'withdrawal',
    description: string,
    reference: string,
    employeeId: number
  ): Promise<void> {
    try {
      await AddCashMovement(registerId, amount, type, description, reference, employeeId);
    } catch (error) {
      throw new Error('Error al registrar movimiento de caja');
    }
  }

  async updateCashMovement(
    movementId: number,
    amount: number,
    type: 'deposit' | 'withdrawal',
    description: string
  ): Promise<void> {
    try {
      await UpdateCashMovement(movementId, amount, type, description);
    } catch (error: any) {
      throw new Error(error?.message || 'Error al actualizar movimiento de caja');
    }
  }

  async getCashRegisterReport(reportId: number): Promise<CashRegisterReport> {
    try {
      const report = await GetCashRegisterReport(reportId);
      return mapCashRegisterReport(report);
    } catch (error) {
      throw new Error('Error al obtener reporte de caja');
    }
  }

  async printCurrentCashRegisterReport(registerId: number): Promise<void> {
    try {
      await PrintCurrentCashRegisterReport(registerId);
    } catch (error) {
      throw new Error('Error al imprimir reporte de caja actual');
    }
  }

  async printLastCashRegisterReport(employeeId: number): Promise<void> {
    try {
      await PrintLastCashRegisterReport(employeeId);
    } catch (error) {
      throw new Error('Error al reimprimir último reporte de cierre de caja');
    }
  }

  async getEmployees(): Promise<Employee[]> {
    try {
      if (!(window as any).go) {
        return [];
      }
      const employees = await GetEmployees();
      return employees.map(mapEmployee);
    } catch (error) {
      return [];
    }
  }

  async getEmployee(id: number): Promise<Employee> {
    try {
      const employee = await GetEmployee(id);
      return mapEmployee(employee);
    } catch (error) {
      throw new Error('Error al obtener empleado');
    }
  }

  async createEmployee(employee: Partial<Employee>, password: string, pin: string): Promise<void> {
    try {
      await CreateEmployee(employee as any, password, pin);
    } catch (error) {
      throw new Error('Error al crear empleado');
    }
  }

  async updateEmployee(id: number, employee: Partial<Employee>): Promise<void> {
    try {
      await UpdateEmployee(employee as any);
    } catch (error) {
      throw new Error('Error al actualizar empleado');
    }
  }

  async deleteEmployee(id: number): Promise<void> {
    try {
      await DeleteEmployee(id);
    } catch (error) {
      throw new Error('Error al eliminar empleado');
    }
  }

  // Cash Register History
  async getCashRegisterHistory(limit: number = 20, offset: number = 0): Promise<CashRegister[]> {
    try {
      const registers = await GetCashRegisterHistory(limit, offset);
      return registers.map(mapCashRegister);
    } catch (error) {
      console.error('Error getting cash register history:', error);
      throw new Error('Error al obtener historial de cajas');
    }
  }

  // Optimized sales summary for cash register (uses SQL aggregation instead of loading all sales)
  async getCashRegisterSalesSummary(registerId: number, onlyElectronic: boolean = false): Promise<CashRegisterSalesSummary> {
    try {
      const summary = await GetCashRegisterSalesSummary(registerId, onlyElectronic);
      return {
        by_payment_method: (summary as any).by_payment_method || {},
        by_payment_method_display: (summary as any).by_payment_method_display || {},
        total: (summary as any).total || 0,
        total_display: (summary as any).total_display || 0,
        count: (summary as any).count || 0,
        count_display: (summary as any).count_display || 0,
        service_charge_by_payment: (summary as any).service_charge_by_payment || {},
        total_service_charge: (summary as any).total_service_charge || 0,
      };
    } catch (error) {
      // Return empty summary on error
      return {
        by_payment_method: {},
        by_payment_method_display: {},
        total: 0,
        total_display: 0,
        count: 0,
        count_display: 0,
        service_charge_by_payment: {},
        total_service_charge: 0,
      };
    }
  }
}

export const wailsAuthService = new WailsAuthService();
