import React, { createContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { DIANConfig } from '../types/models';
import { wailsConfigService } from '../services/wailsConfigService';

interface DIANModeContextType {
  isDIANMode: boolean;
  toggleDIANMode: () => void;
  setDIANMode: (value: boolean) => void;
  dianConfig: DIANConfig | null;
  isElectronicInvoicingEnabled: boolean;
  dianApiUrl: string | null;
  refreshDIANConfig: () => Promise<void>;
}

export const DIANModeContext = createContext<DIANModeContextType>({
  isDIANMode: false,
  toggleDIANMode: () => {},
  setDIANMode: () => {},
  dianConfig: null,
  isElectronicInvoicingEnabled: false,
  dianApiUrl: null,
  refreshDIANConfig: async () => {},
});

interface DIANModeProviderProps {
  children: ReactNode;
}

export const DIANModeProvider: React.FC<DIANModeProviderProps> = ({ children }) => {
  const [isDIANMode, setIsDIANMode] = useState(false);
  const [dianConfig, setDianConfig] = useState<DIANConfig | null>(null);

  const fetchDIANConfig = useCallback(async () => {
    try {
      const config = await wailsConfigService.getDIANConfig();
      setDianConfig(config);
    } catch (error) {
      console.error('Error fetching DIAN config:', error);
      setDianConfig(null);
    }
  }, []);

  useEffect(() => {
    fetchDIANConfig();
  }, [fetchDIANConfig]);

  const toggleDIANMode = useCallback(() => {
    setIsDIANMode(prev => !prev);
  }, []);

  const setDIANMode = useCallback((value: boolean) => {
    setIsDIANMode(value);
  }, []);

  const isElectronicInvoicingEnabled = dianConfig?.is_enabled ?? false;
  const dianApiUrl = dianConfig?.api_url || null;

  return (
    <DIANModeContext.Provider value={{
      isDIANMode,
      toggleDIANMode,
      setDIANMode,
      dianConfig,
      isElectronicInvoicingEnabled,
      dianApiUrl,
      refreshDIANConfig: fetchDIANConfig
    }}>
      {children}
    </DIANModeContext.Provider>
  );
};
