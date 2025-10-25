import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  IconButton,
  Tab,
  Tabs,
} from '@mui/material';
import {
  DatePicker,
  LocalizationProvider,
} from '@mui/x-date-pickers';
import { Chip } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as MoneyIcon,
  ShoppingCart as CartIcon,
  People as PeopleIcon,
  Receipt as ReceiptIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
  Assessment as AssessmentIcon,
  Restaurant as RestaurantIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { wailsReportsService } from '../../services/wailsReportsService';
import { toast } from 'react-toastify';

const Reports: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  });
  const [reportType, setReportType] = useState('sales');
  const [loading, setLoading] = useState(false);

  // Real data from backend
  const [salesData, setSalesData] = useState<any[]>([]);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [customersData, setCustomersData] = useState<any[]>([]);
  const [customerStats, setCustomerStats] = useState<any>(null);
  const [keyMetrics, setKeyMetrics] = useState<any[]>([]);
  const [categoryComparison, setCategoryComparison] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    averageTicket: 0,
    totalCustomers: 0,
    totalProductsSold: 0,
    growth: 0,
  });

  useEffect(() => {
    loadReportData();
  }, [dateRange, reportType]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const startDateStr = format(dateRange.start, 'yyyy-MM-dd');
      const endDateStr = format(dateRange.end, 'yyyy-MM-dd');

      // Load sales report with all data
      const salesReport = await wailsReportsService.getSalesReport(startDateStr, endDateStr);

      if (salesReport) {
        // Load customer stats
        const custStats = await wailsReportsService.getCustomerStats(startDateStr, endDateStr);
        setCustomerStats(custStats);

        // Load key metrics comparison
        const metrics = await wailsReportsService.getKeyMetricsComparison(startDateStr, endDateStr);
        setKeyMetrics(metrics || []);

        // Load category comparison
        const catComparison = await wailsReportsService.getSalesByCategory(startDateStr, endDateStr);
        setCategoryComparison(catComparison || []);

        // Calculate growth from key metrics
        const salesMetric = metrics?.find(m => m.metric === 'Ventas Totales');

        // Calculate total products sold
        const totalProductsSold = (salesReport.top_products || []).reduce((sum, p) => sum + p.quantity, 0);

        // Update stats with real data
        setStats({
          totalSales: salesReport.total_sales || 0,
          totalOrders: salesReport.number_of_sales || 0,
          averageTicket: salesReport.average_sale || 0,
          totalCustomers: custStats?.total_customers || 0,
          totalProductsSold: totalProductsSold,
          growth: salesMetric?.growth_percent || 0,
        });

        // Set sales chart data from daily sales
        setSalesData(salesReport.daily_sales || []);

        // Set products data from top products
        const productsChartData = (salesReport.top_products || []).map(p => ({
          name: p.product_name,
          sold: p.quantity,
          revenue: p.total_sales,
        }));
        setProductsData(productsChartData);

        // Generate customer segmentation data
        if (custStats && custStats.total_customers > 0) {
          const totalCustomers = custStats.total_customers;
          const newCustomers = custStats.new_customers_month;
          const returningCustomers = totalCustomers - newCustomers;

          setCustomersData([
            { segment: 'Nuevos', value: Math.round((newCustomers / totalCustomers) * 100) || 0, color: '#8884d8' },
            { segment: 'Recurrentes', value: Math.round((returningCustomers / totalCustomers) * 100) || 0, color: '#82ca9d' },
          ]);
        } else {
          setCustomersData([]);
        }
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async () => {
    try {
      const startDateStr = format(dateRange.start, 'yyyy-MM-dd');
      const endDateStr = format(dateRange.end, 'yyyy-MM-dd');
      const salesReport = await wailsReportsService.getSalesReport(startDateStr, endDateStr);

      if (salesReport) {
        const csvData = await wailsReportsService.exportSalesReportCSV(salesReport);
        // Handle download logic here (create blob and download)
        toast.success('Reporte exportado');
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Error al exportar reporte');
    }
  };

  const handlePrintReport = () => {
    window.print();
    toast.success('Preparando impresión');
  };

  const StatCard = ({ title, value, icon, trend, color }: any) => (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography color="text.secondary" gutterBottom variant="caption">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {trend !== undefined && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                {trend > 0 ? (
                  <TrendingUpIcon sx={{ color: 'success.main', fontSize: 16 }} />
                ) : (
                  <TrendingDownIcon sx={{ color: 'error.main', fontSize: 16 }} />
                )}
                <Typography
                  variant="caption"
                  sx={{
                    color: trend > 0 ? 'success.main' : 'error.main',
                    ml: 0.5,
                  }}
                >
                  {Math.abs(trend)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}.100`,
              borderRadius: 2,
              p: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Reportes y Análisis</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrintReport}
          >
            Imprimir
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExportReport}
          >
            Exportar
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Tipo de Reporte</InputLabel>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                label="Tipo de Reporte"
              >
                <MenuItem value="sales">Ventas</MenuItem>
                <MenuItem value="products">Productos</MenuItem>
                <MenuItem value="customers">Clientes</MenuItem>
                <MenuItem value="employees">Empleados</MenuItem>
                <MenuItem value="inventory">Inventario</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Fecha Inicio"
                value={dateRange.start}
                onChange={(date) => date && setDateRange({ ...dateRange, start: date })}
                slotProps={{
                  textField: { fullWidth: true },
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Fecha Fin"
                value={dateRange.end}
                onChange={(date) => date && setDateRange({ ...dateRange, end: date })}
                slotProps={{
                  textField: { fullWidth: true },
                }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Ventas Totales"
            value={`$${stats.totalSales.toLocaleString('es-CO')}`}
            icon={<MoneyIcon sx={{ color: 'success.main' }} />}
            trend={stats.growth}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Órdenes"
            value={stats.totalOrders}
            icon={<CartIcon sx={{ color: 'primary.main' }} />}
            trend={keyMetrics.find(m => m.metric === 'Órdenes')?.growth_percent}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Ticket Promedio"
            value={`$${stats.averageTicket.toLocaleString('es-CO')}`}
            icon={<ReceiptIcon sx={{ color: 'info.main' }} />}
            trend={keyMetrics.find(m => m.metric === 'Ticket Promedio')?.growth_percent}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Clientes"
            value={stats.totalCustomers}
            icon={<PeopleIcon sx={{ color: 'warning.main' }} />}
            trend={keyMetrics.find(m => m.metric === 'Clientes Únicos')?.growth_percent}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Productos Vendidos"
            value={stats.totalProductsSold.toLocaleString('es-CO')}
            icon={<RestaurantIcon sx={{ color: 'secondary.main' }} />}
            trend={undefined}
            color="secondary"
          />
        </Grid>
      </Grid>

      {/* Tabs for different views */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={(_, value) => setSelectedTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Tendencias" />
          <Tab label="Productos" />
          <Tab label="Clientes" />
          <Tab label="Comparativo" />
        </Tabs>
      </Paper>

      {/* Charts */}
      <Grid container spacing={3}>
        {selectedTab === 0 && (
          <>
            {/* Sales Trend Chart */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Tendencia de Ventas
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#8884d8"
                      name="Ventas ($)"
                      yAxisId="left"
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#82ca9d"
                      name="Órdenes"
                      yAxisId="right"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </>
        )}

        {selectedTab === 1 && (
          <>
            {/* Top Products Chart */}
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Productos Más Vendidos
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sold" fill="#8884d8" name="Cantidad" />
                    <Bar dataKey="revenue" fill="#82ca9d" name="Ingresos ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Products Table */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Detalle de Productos
                </Typography>
                {productsData.map((product, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      py: 1,
                      borderBottom: index < productsData.length - 1 ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">{product.name}</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {product.sold} unidades
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>
          </>
        )}

        {selectedTab === 2 && (
          <>
            {/* Customer Segments Pie Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Segmentación de Clientes
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={customersData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ segment, value }) => `${segment}: ${value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {customersData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Customer Stats */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Estadísticas de Clientes
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Tasa de Retención
                    </Typography>
                    <Typography variant="h5">{customerStats?.retention_rate.toFixed(1) || 0}%</Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Valor Promedio por Cliente
                    </Typography>
                    <Typography variant="h5">${(customerStats?.average_value_per_customer || 0).toLocaleString('es-CO')}</Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Frecuencia de Visita
                    </Typography>
                    <Typography variant="h5">{(customerStats?.visit_frequency || 0).toFixed(1)} veces/mes</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Nuevos Clientes (mes)
                    </Typography>
                    <Typography variant="h5">{customerStats?.new_customers_month || 0}</Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          </>
        )}

        {selectedTab === 3 && (
          <>
            {/* Comparative Analysis */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Análisis Comparativo - Mes Actual vs Anterior
                </Typography>
                <Grid container spacing={3} sx={{ mt: 1 }}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Ventas por Categoría
                    </Typography>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={categoryComparison.map(c => ({
                          category: c.category,
                          actual: c.current_sales,
                          anterior: c.previous_sales,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="actual" fill="#8884d8" name="Período Actual" />
                        <Bar dataKey="anterior" fill="#82ca9d" name="Período Anterior" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Métricas Clave
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      {keyMetrics.map((item) => (
                        <Box
                          key={item.metric}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            py: 1,
                            borderBottom: 1,
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="body2">{item.metric}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="body2">
                              {typeof item.current_value === 'number' && item.current_value > 1000
                                ? `$${item.current_value.toLocaleString('es-CO')}`
                                : item.current_value}
                            </Typography>
                            <Chip
                              size="small"
                              label={`${item.growth_percent.toFixed(1)}%`}
                              color={item.growth_percent > 0 ? 'success' : 'error'}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default Reports;
