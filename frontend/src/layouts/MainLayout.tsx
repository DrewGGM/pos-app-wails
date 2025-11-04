import React, { useState } from 'react';
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
  Badge,
  Chip,
  Collapse,
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
} from '@mui/icons-material';
import { useAuth, useOfflineSync, useWebSocket } from '../hooks';

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  roles?: string[];
  children?: MenuItem[];
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
  },
  {
    text: 'Ingredientes',
    icon: <KitchenIcon />,
    path: '/ingredients',
    roles: ['admin', 'manager'],
  },
  {
    text: 'Clientes',
    icon: <PeopleIcon />,
    path: '/customers',
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
  const { isOnline, getPendingCount } = useOfflineSync();
  const { isConnected } = useWebSocket();
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);

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

  const hasPermission = (item: MenuItem): boolean => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    if (!hasPermission(item)) return null;

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
          {isOnline ? (
            <Chip
              label="Online"
              color="success"
              size="small"
            />
          ) : (
            <Chip
              label="Offline"
              color="warning"
              size="small"
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

  const pendingCount = getPendingCount();

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
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

          {/* Notifications */}
          <IconButton 
            color="inherit"
            onClick={handleNotificationClick}
          >
            <Badge badgeContent={pendingCount} color="error">
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
      >
        {pendingCount > 0 ? (
          <MenuItem>
            <Typography variant="body2">
              {pendingCount} transacciones pendientes de sincronizar
            </Typography>
          </MenuItem>
        ) : (
          <MenuItem>
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
