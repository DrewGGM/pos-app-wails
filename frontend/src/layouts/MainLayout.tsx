import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Collapse,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  PointOfSale as POSIcon,
  Restaurant as RestaurantIcon,
  Receipt as ReceiptIcon,
  Inventory as InventoryIcon,
  Warehouse as WarehouseIcon,
  People as PeopleIcon,
  TableChart as TableIcon,
  Assessment as ReportIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  ExpandLess,
  ExpandMore,
  Person as PersonIcon,
  Notifications as NotificationsIcon,
  MonetizationOn as MoneyIcon,
  Group as GroupIcon,
  AccountCircle,
  Kitchen as KitchenIcon,
  Fastfood as FastfoodIcon,
  VerifiedUser as DIANIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useAuth, useWebSocket, useDIANMode, useNotifications } from '../hooks';
import { Warning as WarningIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon, Info as InfoIcon } from '@mui/icons-material';
import { wailsConfigService } from '../services/wailsConfigService';

// Module visibility configuration from backend
interface ModuleVisibility {
  enable_inventory_module: boolean;
  enable_ingredients_module: boolean;
  enable_combos_module: boolean;
  enable_customers_module: boolean;
  enable_reports_module: boolean;
  enable_discounts_module: boolean;
}

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  roles?: string[];
  children?: MenuItem[];
  moduleKey?: keyof ModuleVisibility; // Key to check in module visibility config
}

const menuItems: MenuItem[] = [
  {
    text: 'Dashboard',
    icon: <DashboardIcon />,
    path: '/dashboard',
  },
  {
    text: 'Punto de Venta',
    icon: <POSIcon />,
    path: '/pos',
    roles: ['admin', 'cashier', 'waiter'],
  },
  {
    text: 'Órdenes',
    icon: <ReceiptIcon />,
    path: '/orders',
  },
  {
    text: 'Mesas',
    icon: <TableIcon />,
    path: '/tables',
  },
  {
    text: 'Ventas',
    icon: <MoneyIcon />,
    path: '/sales',
    children: [
      {
        text: 'Historial',
        icon: <ReceiptIcon />,
        path: '/sales',
      },
      {
        text: 'Caja',
        icon: <MoneyIcon />,
        path: '/cash-register',
      },
    ],
  },
  {
    text: 'Productos',
    icon: <InventoryIcon />,
    path: '/products',
    roles: ['admin', 'manager'],
  },
  {
    text: 'Inventario',
    icon: <WarehouseIcon />,
    path: '/inventory',
    roles: ['admin', 'manager'],
    moduleKey: 'enable_inventory_module',
  },
  {
    text: 'Ingredientes',
    icon: <KitchenIcon />,
    path: '/ingredients',
    roles: ['admin', 'manager'],
    moduleKey: 'enable_ingredients_module',
  },
  {
    text: 'Combos',
    icon: <FastfoodIcon />,
    path: '/combos',
    roles: ['admin', 'manager'],
    moduleKey: 'enable_combos_module',
  },
  {
    text: 'Clientes',
    icon: <PeopleIcon />,
    path: '/customers',
    moduleKey: 'enable_customers_module',
  },
  {
    text: 'Empleados',
    icon: <GroupIcon />,
    path: '/employees',
    roles: ['admin'],
  },
  {
    text: 'Reportes',
    icon: <ReportIcon />,
    path: '/reports',
    roles: ['admin', 'manager'],
    moduleKey: 'enable_reports_module',
  },
  {
    text: 'Configuración',
    icon: <SettingsIcon />,
    path: '/settings',
    roles: ['admin'],
  },
];

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, cashRegisterId } = useAuth();
  const { isConnected } = useWebSocket();
  const { isDIANMode, toggleDIANMode, isElectronicInvoicingEnabled, dianApiUrl } = useDIANMode();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [moduleVisibility, setModuleVisibility] = useState<ModuleVisibility>({
    enable_inventory_module: true,
    enable_ingredients_module: false,
    enable_combos_module: false,
    enable_customers_module: true,
    enable_reports_module: true,
    enable_discounts_module: true,
  });

  // Load module visibility from backend
  useEffect(() => {
    const loadModuleVisibility = async () => {
      try {
        const config = await wailsConfigService.getRestaurantConfig();
        if (config) {
          setModuleVisibility({
            enable_inventory_module: config.enable_inventory_module ?? true,
            enable_ingredients_module: config.enable_ingredients_module ?? false,
            enable_combos_module: config.enable_combos_module ?? false,
            enable_customers_module: config.enable_customers_module ?? true,
            enable_reports_module: config.enable_reports_module ?? true,
            enable_discounts_module: config.enable_discounts_module ?? true,
          });
        }
      } catch (error) {
        console.error('Error loading module visibility:', error);
      }
    };
    loadModuleVisibility();
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <WarningIcon sx={{ color: 'warning.main' }} />;
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      case 'success':
        return <CheckCircleIcon sx={{ color: 'success.main' }} />;
      default:
        return <InfoIcon sx={{ color: 'info.main' }} />;
    }
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchor(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const toggleExpand = (text: string) => {
    setExpandedItems(prev =>
      prev.includes(text)
        ? prev.filter(item => item !== text)
        : [...prev, text]
    );
  };

  const handleOpenDIANPanel = () => {
    if (dianApiUrl) {
      window.open(dianApiUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const hasPermission = (item: MenuItem): boolean => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    if (!hasPermission(item)) return null;

    // Check module visibility - if moduleKey is defined, check if module is enabled
    if (item.moduleKey && !moduleVisibility[item.moduleKey]) return null;

    const isSelected = location.pathname === item.path;
    const isExpanded = expandedItems.includes(item.text);
    const hasChildren = item.children && item.children.length > 0;

    // Rutas que requieren caja abierta (todas excepto estas)
    const allowedWithoutCash = ['/cash-register', '/settings', '/employees'];
    const requiresCashRegister = !allowedWithoutCash.some(route => item.path.startsWith(route));
    const isDisabled = requiresCashRegister && !cashRegisterId;

    return (
      <React.Fragment key={item.text}>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            onClick={() => {
              if (isDisabled) return; // No hacer nada si está deshabilitado
              if (hasChildren) {
                toggleExpand(item.text);
              } else {
                handleNavigate(item.path);
              }
            }}
            selected={isSelected}
            disabled={isDisabled}
            sx={{
              minHeight: 48,
              justifyContent: 'initial',
              px: level === 0 ? 2.5 : 4,
              backgroundColor: isSelected ? 'action.selected' : 'transparent',
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              '&:hover': {
                backgroundColor: isDisabled ? 'transparent' : 'action.hover',
              },
              '&.Mui-disabled': {
                opacity: 0.5,
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: 3,
                justifyContent: 'center',
                color: isDisabled ? 'text.disabled' : (isSelected ? 'primary.main' : 'inherit'),
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.text}
              sx={{
                opacity: 1,
                '& .MuiListItemText-primary': {
                  fontWeight: isSelected ? 600 : 400,
                  color: isDisabled ? 'text.disabled' : 'inherit',
                },
              }}
            />
            {hasChildren && (
              <>
                {isExpanded ? <ExpandLess /> : <ExpandMore />}
              </>
            )}
          </ListItemButton>
        </ListItem>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children?.map(child => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold' }}>
          Restaurant POS
        </Typography>
      </Toolbar>
      <Divider />

      {/* User Info */}
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
            {user?.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="subtitle2">{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.role}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Menu Items */}
      <List>
        {menuItems.map(item => renderMenuItem(item))}
      </List>

      <Divider />

      {/* Status */}
      <Box sx={{ p: 2 }}>
        {!cashRegisterId && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>
              ⚠️ Debe abrir la caja para operar
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {cashRegisterId ? (
            <Chip
              label="Caja Abierta"
              color="success"
              size="small"
            />
          ) : (
            <Chip
              label="Caja Cerrada"
              color="error"
              size="small"
              onClick={() => navigate('/cash-register')}
              sx={{ cursor: 'pointer' }}
            />
          )}
          {!isConnected && (
            <Chip
              label="Desconectado"
              color="error"
              size="small"
            />
          )}
        </Box>
      </Box>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          ...(isDIANMode && {
            bgcolor: '#1565c0',
            backgroundImage: 'linear-gradient(45deg, #1565c0 30%, #1976d2 90%)',
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find(item => item.path === location.pathname)?.text || 'Restaurant POS'}
          </Typography>

          {/* Electronic Invoicing Panel - Only visible if DIAN is enabled */}
          {isElectronicInvoicingEnabled && dianApiUrl && (
            <Tooltip title="Panel Facturación Electrónica">
              <IconButton
                color="inherit"
                onClick={handleOpenDIANPanel}
                sx={{ mr: 1 }}
              >
                <OpenInNewIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* DIAN Mode Toggle - Only visible if DIAN is enabled */}
          {isElectronicInvoicingEnabled && (
            <Tooltip title={isDIANMode ? 'Desactivar Modo DIAN' : 'Activar Modo DIAN'}>
              <IconButton
                color="inherit"
                onClick={toggleDIANMode}
                disableRipple
                sx={{
                  transition: 'none',
                  bgcolor: isDIANMode ? 'rgba(255,255,0,0.15)' : 'transparent',
                  '&:hover': {
                    bgcolor: isDIANMode ? 'rgba(255,255,0,0.20)' : 'transparent',
                  },
                }}
              >
                <DIANIcon sx={{ color: isDIANMode ? '#ffeb3b' : 'inherit' }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Notifications */}
          <IconButton
            color="inherit"
            onClick={handleNotificationClick}
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          {/* User Menu */}
          <IconButton
            onClick={handleMenuClick}
            color="inherit"
          >
            <AccountCircle />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* User Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { handleMenuClose(); navigate('/settings/profile'); }}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Mi Perfil
        </MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); navigate('/settings'); }}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Configuración
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Cerrar Sesión
        </MenuItem>
      </Menu>

      {/* Notifications Menu */}
      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={handleNotificationClose}
        PaperProps={{
          sx: { minWidth: 320, maxWidth: 400, maxHeight: 400 }
        }}
      >
        {notifications.length > 0 ? (
          <>
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">Notificaciones</Typography>
              {unreadCount > 0 && (
                <Typography
                  variant="caption"
                  sx={{ cursor: 'pointer', color: 'primary.main' }}
                  onClick={() => markAllAsRead()}
                >
                  Marcar todas como leídas
                </Typography>
              )}
            </Box>
            <Divider />
            {notifications.map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => {
                  markAsRead(notification.id);
                  if (notification.action?.path) {
                    navigate(notification.action.path);
                    handleNotificationClose();
                  }
                }}
                sx={{
                  bgcolor: notification.read ? 'transparent' : 'action.hover',
                  whiteSpace: 'normal',
                  py: 1.5,
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getNotificationIcon(notification.type)}
                </ListItemIcon>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: notification.read ? 400 : 600 }}>
                    {notification.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {notification.message}
                  </Typography>
                  {notification.action && (
                    <Typography variant="caption" color="primary">
                      {notification.action.label}
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </>
        ) : (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No hay notificaciones
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
