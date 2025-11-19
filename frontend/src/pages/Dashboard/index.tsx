import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  LinearProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as CartIcon,
  People as PeopleIcon,
  TableChart as TableIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Restaurant as RestaurantIcon,
  AttachMoney as MoneyIcon,
  Inventory as InventoryIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  PointOfSale as POSIcon,
  WifiTethering as ServerIcon,
  PhoneAndroid as MobileIcon,
  Kitchen as KitchenIcon,
  RestaurantMenu as WaiterIcon,
  PowerSettingsNew as ResetIcon,
  Router as RouterIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { wailsDashboardService } from '../../services/wailsDashboardService';
import { wailsWebSocketService, WebSocketStatus } from '../../services/wailsWebSocketService';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  today_sales: number;
  today_sales_count: number;
  today_orders: number;
  today_customers: number;
  pending_orders: number;
  low_stock_products: number;
  active_tables: number;
  sales_growth: number;
  average_ticket: number;
  top_selling_items?: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
    total_sales: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, cashRegisterId } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [hourlySales, setHourlySales] = useState<any[]>([]);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRestartServer = async () => {
    if (confirm('¿Estás seguro de que quieres reiniciar el servidor? Todas las conexiones de apps móviles se desconectarán temporalmente.')) {
      try {
        // Quit the application - user will need to manually restart it
        const w = (window as any);
        if (w.runtime && w.runtime.Quit) {
          w.runtime.Quit();
        }
      } catch (error) {
        alert('Error al reiniciar el servidor');
      }
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Get dashboard stats
      const dashboardStats = await wailsDashboardService.getDashboardStats();
      if (dashboardStats) {
        setStats(dashboardStats);
      }

      // Get pending orders
      const pendingOrdersList = await wailsDashboardService.getPendingOrdersDetails();
      setRecentOrders(pendingOrdersList || []);

      // Get low stock products
      const lowStockList = await wailsDashboardService.getLowStockProducts();
      setLowStockProducts(lowStockList || []);

      // Get sales chart data (last 7 days)
      const salesData = await wailsDashboardService.getSalesChartData(7);
      setHourlySales(salesData || []);

      // Get WebSocket server status
      const status = await wailsWebSocketService.getStatus();
      setWsStatus(status);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon, color, trend, action }: any) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ bgcolor: `${color}.light`, mr: 2 }}>
            {icon}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
              {value}
            </Typography>
          </Box>
        </Box>
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {trend > 0 ? (
              <TrendingUpIcon color="success" sx={{ mr: 0.5 }} />
            ) : (
              <TrendingDownIcon color="error" sx={{ mr: 0.5 }} />
            )}
            <Typography
              variant="body2"
              color={trend > 0 ? 'success.main' : 'error.main'}
            >
              {Math.abs(trend)}% vs ayer
            </Typography>
          </Box>
        )}
      </CardContent>
      {action && (
        <CardActions>
          <Button size="small" onClick={action.onClick}>
            {action.label}
          </Button>
        </CardActions>
      )}
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Bienvenido, {user?.name} • {format(new Date(), 'EEEE, d MMMM yyyy')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<POSIcon />}
            onClick={() => navigate('/pos')}
            disabled={!cashRegisterId}
          >
            Ir al POS
          </Button>
          <IconButton onClick={loadDashboardData}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Alerts */}
      {!cashRegisterId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No hay caja abierta. Por favor abra la caja para realizar ventas.
          <Button size="small" onClick={() => navigate('/cash-register')} sx={{ ml: 2 }}>
            Abrir Caja
          </Button>
        </Alert>
      )}

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Ventas de Hoy"
            value={`$${(stats?.today_sales ?? 0).toLocaleString('es-CO')}`}
            icon={<MoneyIcon />}
            color="primary"
            trend={stats?.sales_growth}
            action={{
              label: 'Ver Ventas',
              onClick: () => navigate('/sales'),
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Órdenes de Hoy"
            value={stats?.today_orders || 0}
            icon={<CartIcon />}
            color="success"
            action={{
              label: 'Ver Órdenes',
              onClick: () => navigate('/orders'),
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Órdenes Pendientes"
            value={stats?.pending_orders || 0}
            icon={<RestaurantIcon />}
            color="warning"
            action={{
              label: 'Ver Cocina',
              onClick: () => navigate('/kitchen'),
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Mesas Activas"
            value={`${stats?.active_tables || 0}`}
            icon={<TableIcon />}
            color="info"
            action={{
              label: 'Ver Mesas',
              onClick: () => navigate('/tables'),
            }}
          />
        </Grid>
      </Grid>

      {/* Charts and Lists */}
      <Grid container spacing={3}>
        {/* Sales Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Ventas Últimos 7 Días
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={hourlySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => `$${value.toLocaleString('es-CO')}`}
                  labelFormatter={(label) => label}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Acciones Rápidas
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<ReceiptIcon />}
                  onClick={() => navigate('/sales')}
                  sx={{ py: 2 }}
                >
                  Nueva Venta
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<PeopleIcon />}
                  onClick={() => navigate('/customers')}
                  sx={{ py: 2 }}
                >
                  Clientes
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<InventoryIcon />}
                  onClick={() => navigate('/products')}
                  sx={{ py: 2 }}
                >
                  Productos
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<PrintIcon />}
                  onClick={() => navigate('/reports')}
                  sx={{ py: 2 }}
                >
                  Reportes
                </Button>
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Ticket Promedio
            </Typography>
            <Typography variant="h4" color="primary">
              ${(stats?.average_ticket ?? 0).toLocaleString('es-CO')}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Productos con Bajo Stock
            </Typography>
            <Typography variant="h4" color="warning.main">
              {stats?.low_stock_products ?? 0}
            </Typography>
          </Paper>
        </Grid>

        {/* System Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ServerIcon color="primary" />
                <Typography variant="h6">
                  Estado del Sistema
                </Typography>
              </Box>
              <IconButton onClick={loadDashboardData} size="small">
                <RefreshIcon />
              </IconButton>
            </Box>

            {/* WebSocket Server Status */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" color="textSecondary">
                  Servidor WebSocket
                </Typography>
                <Chip
                  label={wsStatus?.running ? 'Activo' : 'Inactivo'}
                  size="small"
                  color={wsStatus?.running ? 'success' : 'error'}
                  icon={wsStatus?.running ? <CheckIcon /> : <WarningIcon />}
                />
              </Box>
              {wsStatus?.running && (
                <Typography variant="body2" color="textSecondary">
                  Puerto: {wsStatus.port} • IP: {wsStatus.local_ips?.[0] || 'N/A'}
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Connected Apps */}
            <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
              Apps Móviles Conectadas
            </Typography>

            <List dense>
              <ListItem>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: wsStatus?.kitchen_clients ? 'success.light' : 'grey.300' }}>
                    <KitchenIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="App Kitchen"
                  secondary={`${wsStatus?.kitchen_clients || 0} ${wsStatus?.kitchen_clients === 1 ? 'dispositivo' : 'dispositivos'} conectado(s)`}
                />
                <Chip
                  label={wsStatus?.kitchen_clients ? 'Conectada' : 'Desconectada'}
                  size="small"
                  color={wsStatus?.kitchen_clients ? 'success' : 'default'}
                />
              </ListItem>

              <ListItem>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: wsStatus?.waiter_clients ? 'success.light' : 'grey.300' }}>
                    <WaiterIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary="App Waiter"
                  secondary={`${wsStatus?.waiter_clients || 0} ${wsStatus?.waiter_clients === 1 ? 'dispositivo' : 'dispositivos'} conectado(s)`}
                />
                <Chip
                  label={wsStatus?.waiter_clients ? 'Conectada' : 'Desconectada'}
                  size="small"
                  color={wsStatus?.waiter_clients ? 'success' : 'default'}
                />
              </ListItem>
            </List>

            <Divider sx={{ my: 2 }} />

            {/* Restart Server Button */}
            <Button
              fullWidth
              variant="outlined"
              color="warning"
              startIcon={<ResetIcon />}
              onClick={handleRestartServer}
              sx={{ mt: 1 }}
            >
              Reiniciar Servidor
            </Button>
          </Paper>
        </Grid>

        {/* Low Stock Alert */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Productos con Bajo Stock
              </Typography>
              <Button size="small" onClick={() => navigate('/products')}>
                Ver Inventario
              </Button>
            </Box>
            <List>
              {lowStockProducts.map((product: any) => (
                <ListItem key={product.id}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'warning.light' }}>
                      <WarningIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={product.name}
                    secondary={`Stock actual: ${product.stock} unidades`}
                  />
                  <Chip
                    label={product.stock === 0 ? 'Agotado' : 'Bajo Stock'}
                    size="small"
                    color={product.stock === 0 ? 'error' : 'warning'}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

// Helper functions
const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'warning.main';
    case 'preparing':
      return 'info.main';
    case 'ready':
      return 'success.main';
    default:
      return 'grey.500';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'preparing':
      return 'Preparando';
    case 'ready':
      return 'Listo';
    case 'delivered':
      return 'Entregado';
    case 'paid':
      return 'Pagado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
};

const getStatusChipColor = (status: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'preparing':
      return 'info';
    case 'ready':
      return 'success';
    case 'cancelled':
      return 'error';
    default:
      return 'default';
  }
};

export default Dashboard;