import { useContext } from 'react';
import { DIANModeContext } from '../contexts/DIANModeContext';

export const useDIANMode = () => {
  const context = useContext(DIANModeContext);
  if (!context) {
    throw new Error('useDIANMode must be used within a DIANModeProvider');
  }
  return context;
};
