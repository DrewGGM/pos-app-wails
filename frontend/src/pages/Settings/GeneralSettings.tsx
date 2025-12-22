import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  Chip,
  Divider,
  alpha,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  Print as PrintIcon,
  Security as SecurityIcon,
  Category as CategoryIcon,
  CloudSync as CloudSyncIcon,
  Wifi as WifiIcon,
  ViewModule as ViewModuleIcon,
  Storage as StorageIcon,
  Smartphone as SmartphoneIcon,
  Notifications as NotificationsIcon,
  SmartToy as SmartToyIcon,
  Settings as SettingsIcon,
  Lock as LockIcon,
  Router as RouterIcon,
} from '@mui/icons-material';

// Module configuration interface
export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  category: 'essential' | 'optional' | 'development' | 'experimental';
  status?: 'production' | 'beta' | 'development' | 'experimental';
}

// Default module configuration
export const defaultModuleConfig: ModuleConfig[] = [
  // Essential modules (always enabled)
  {
    id: 'empresa',
    name: 'Empresa',
    description: 'Datos de tu negocio y configuración fiscal',
    icon: <BusinessIcon />,
    enabled: true,
    category: 'essential',
    status: 'production',
  },
  {
    id: 'facturacion',
    name: 'Facturación DIAN',
    description: 'Facturación electrónica Colombia',
    icon: <ReceiptIcon />,
    enabled: true,
    category: 'essential',
    status: 'production',
  },
  {
    id: 'metodos_pago',
    name: 'Métodos de Pago',
    description: 'Efectivo, tarjeta, Nequi, etc.',
    icon: <PaymentIcon />,
    enabled: true,
    category: 'essential',
    status: 'production',
  },
  {
    id: 'impresion',
    name: 'Impresión',
    description: 'Impresoras térmicas',
    icon: <PrintIcon />,
    enabled: true,
    category: 'essential',
    status: 'production',
  },
  {
    id: 'sistema',
    name: 'Sistema',
    description: 'Idioma, moneda, zona horaria',
    icon: <SecurityIcon />,
    enabled: true,
    category: 'essential',
    status: 'production',
  },
  // Optional modules
  {
    id: 'tipos_pedido',
    name: 'Tipos de Pedido',
    description: 'Mesa, llevar, delivery',
    icon: <CategoryIcon />,
    enabled: true,
    category: 'optional',
    status: 'production',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Reportes automáticos',
    icon: <CloudSyncIcon />,
    enabled: true,
    category: 'optional',
    status: 'production',
  },
  {
    id: 'websocket',
    name: 'WebSocket',
    description: 'App cocina/meseros',
    icon: <WifiIcon />,
    enabled: false,
    category: 'optional',
    status: 'beta',
  },
  {
    id: 'red_puertos',
    name: 'Red y Puertos',
    description: 'Configuración de puertos y túneles',
    icon: <RouterIcon />,
    enabled: true,
    category: 'optional',
    status: 'production',
  },
  {
    id: 'paginas_pos',
    name: 'Páginas POS',
    description: 'Páginas personalizadas',
    icon: <ViewModuleIcon />,
    enabled: false,
    category: 'optional',
    status: 'beta',
  },
  {
    id: 'bd_dian',
    name: 'BD DIAN',
    description: 'Gestión base paramétrica',
    icon: <StorageIcon />,
    enabled: false,
    category: 'optional',
    status: 'production',
  },
  // Development modules
  {
    id: 'rappi',
    name: 'Rappi POS',
    description: 'Recibir pedidos de Rappi',
    icon: <SmartphoneIcon />,
    enabled: false,
    category: 'development',
    status: 'development',
  },
  {
    id: 'notificaciones',
    name: 'Notificaciones',
    description: 'Alertas del sistema',
    icon: <NotificationsIcon />,
    enabled: false,
    category: 'development',
    status: 'development',
  },
  // Experimental modules
  {
    id: 'ia_mcp',
    name: 'IA (MCP)',
    description: 'Integración con Claude',
    icon: <SmartToyIcon />,
    enabled: false,
    category: 'experimental',
    status: 'experimental',
  },
];

// Storage key for module configuration
const STORAGE_KEY = 'pos_module_config';

// Load module configuration from localStorage
export const loadModuleConfig = (): ModuleConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const savedConfig = JSON.parse(saved) as { id: string; enabled: boolean }[];
      // Merge with defaults to handle new modules
      return defaultModuleConfig.map(module => {
        const savedModule = savedConfig.find(s => s.id === module.id);
        return {
          ...module,
          enabled: module.category === 'essential' ? true : (savedModule?.enabled ?? module.enabled),
        };
      });
    }
  } catch (e) {
    console.error('Error loading module config:', e);
  }
  return defaultModuleConfig;
};

// Save module configuration to localStorage
export const saveModuleConfig = (config: ModuleConfig[]) => {
  try {
    const toSave = config.map(m => ({ id: m.id, enabled: m.enabled }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Error saving module config:', e);
  }
};

// Check if a specific module is enabled
export const isModuleEnabled = (moduleId: string, config: ModuleConfig[]): boolean => {
  const module = config.find(m => m.id === moduleId);
  return module?.enabled ?? false;
};

interface GeneralSettingsProps {
  moduleConfig: ModuleConfig[];
  onModuleConfigChange: (config: ModuleConfig[]) => void;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  moduleConfig,
  onModuleConfigChange,
}) => {
  const handleToggleModule = (moduleId: string) => {
    const newConfig = moduleConfig.map(module => {
      if (module.id === moduleId && module.category !== 'essential') {
        return { ...module, enabled: !module.enabled };
      }
      return module;
    });
    onModuleConfigChange(newConfig);
    saveModuleConfig(newConfig);
  };

  const getStatusChip = (status?: string) => {
    switch (status) {
      case 'beta':
        return <Chip label="Beta" size="small" color="warning" sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />;
      case 'development':
        return <Chip label="En desarrollo" size="small" color="info" icon={<span style={{ fontSize: '0.8rem', marginLeft: 4 }}>🚧</span>} sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />;
      case 'experimental':
        return <Chip label="Experimental" size="small" color="secondary" icon={<span style={{ fontSize: '0.8rem', marginLeft: 4 }}>🧪</span>} sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />;
      default:
        return null;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'essential':
        return { title: 'Módulos Esenciales', subtitle: 'Siempre activos para el funcionamiento del sistema' };
      case 'optional':
        return { title: 'Módulos Opcionales', subtitle: 'Actívalos según las necesidades de tu negocio' };
      case 'development':
        return { title: 'En Desarrollo', subtitle: 'Funcionalidades en proceso, pueden tener limitaciones' };
      case 'experimental':
        return { title: 'Experimental', subtitle: 'Funcionalidades avanzadas en pruebas' };
      default:
        return { title: '', subtitle: '' };
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'essential':
        return '#4caf50';
      case 'optional':
        return '#2196f3';
      case 'development':
        return '#ff9800';
      case 'experimental':
        return '#9c27b0';
      default:
        return '#666';
    }
  };

  const renderModuleCategory = (category: 'essential' | 'optional' | 'development' | 'experimental') => {
    const modules = moduleConfig.filter(m => m.category === category);
    const { title, subtitle } = getCategoryTitle(category);
    const color = getCategoryColor(category);

    return (
      <Card
        sx={{
          mb: 3,
          border: `1px solid ${alpha(color, 0.3)}`,
          '& .MuiCardContent-root': { pb: 2 }
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box
              sx={{
                width: 4,
                height: 24,
                bgcolor: color,
                borderRadius: 1,
                mr: 1.5,
              }}
            />
            <Box>
              <Typography variant="subtitle1" fontWeight="600">
                {title}
                {category === 'essential' && (
                  <LockIcon sx={{ ml: 1, fontSize: 16, color: 'text.secondary', verticalAlign: 'middle' }} />
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {modules.map((module) => (
              <Box
                key={module.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: module.enabled ? alpha(color, 0.05) : 'transparent',
                  border: `1px solid ${module.enabled ? alpha(color, 0.2) : 'transparent'}`,
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: alpha(color, 0.08),
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 40,
                      borderRadius: 1,
                      bgcolor: module.enabled ? alpha(color, 0.15) : 'action.hover',
                      color: module.enabled ? color : 'text.secondary',
                      mr: 2,
                    }}
                  >
                    {module.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body1" fontWeight={module.enabled ? 600 : 400}>
                        {module.name}
                      </Typography>
                      {getStatusChip(module.status)}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {module.description}
                    </Typography>
                  </Box>
                </Box>
                <Switch
                  checked={module.enabled}
                  onChange={() => handleToggleModule(module.id)}
                  disabled={module.category === 'essential'}
                  color={category === 'experimental' ? 'secondary' : category === 'development' ? 'warning' : 'primary'}
                />
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight="600">
            Configuración General
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Administra los módulos y funcionalidades activas del sistema
          </Typography>
        </Box>
      </Box>

      {renderModuleCategory('essential')}
      {renderModuleCategory('optional')}
      {renderModuleCategory('development')}
      {renderModuleCategory('experimental')}

      <Card sx={{ bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider' }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span>💡</span>
            <span>
              Los módulos desactivados no aparecerán en las pestañas de configuración.
              Puedes activarlos en cualquier momento desde esta sección.
            </span>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default GeneralSettings;
