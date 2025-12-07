import React, { createContext, useState, useCallback, ReactNode } from 'react';

interface DIANModeContextType {
  isDIANMode: boolean;
  toggleDIANMode: () => void;
  setDIANMode: (value: boolean) => void;
}

export const DIANModeContext = createContext<DIANModeContextType>({
  isDIANMode: false,
  toggleDIANMode: () => {},
  setDIANMode: () => {},
});

interface DIANModeProviderProps {
  children: ReactNode;
}

export const DIANModeProvider: React.FC<DIANModeProviderProps> = ({ children }) => {
  const [isDIANMode, setIsDIANMode] = useState(false);

  const toggleDIANMode = useCallback(() => {
    setIsDIANMode(prev => !prev);
  }, []);

  const setDIANMode = useCallback((value: boolean) => {
    setIsDIANMode(value);
  }, []);

  return (
    <DIANModeContext.Provider value={{ isDIANMode, toggleDIANMode, setDIANMode }}>
      {children}
    </DIANModeContext.Provider>
  );
};
