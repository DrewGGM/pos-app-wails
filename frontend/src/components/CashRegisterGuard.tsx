import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface CashRegisterGuardProps {
  children: React.ReactNode;
}

/**
 * CashRegisterGuard - Protege rutas que requieren caja abierta
 *
 * Redirige a /cash-register si no hay caja abierta.
 * La única excepción es la página de caja registradora y settings.
 */
const CashRegisterGuard: React.FC<CashRegisterGuardProps> = ({ children }) => {
  const { cashRegisterId } = useAuth();
  const location = useLocation();

  // Rutas que NO requieren caja abierta
  const allowedWithoutCashRegister = [
    '/cash-register',
    '/settings',
    '/employees',
  ];

  // Verificar si la ruta actual está en la lista de permitidas
  const isAllowedRoute = allowedWithoutCashRegister.some(route =>
    location.pathname.startsWith(route)
  );

  // Si no hay caja abierta y no es una ruta permitida, redirigir
  if (!cashRegisterId && !isAllowedRoute) {
    return <Navigate to="/cash-register" replace />;
  }

  return <>{children}</>;
};

export default CashRegisterGuard;
