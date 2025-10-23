import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Print as PrintIcon,
  MoreVert as MoreIcon,
  Receipt as ReceiptIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { wailsOrderService } from '../../services/wailsOrderService';
import { Order } from '../../types/models';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [selectedTab]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      let data: Order[] = [];
      switch (selectedTab) {
        case 0: // Today
          data = await wailsOrderService.getTodayOrders();
          break;
        case 1: // Pending
          data = await wailsOrderService.getPendingOrders();
          break;
        case 2: // Preparing
          data = await wailsOrderService.getOrdersByStatus('preparing');
          break;
        case 3: // Ready
          data = await wailsOrderService.getOrdersByStatus('ready');
          break;
        case 4: // Completed
          data = await wailsOrderService.getOrdersByStatus('paid');
          break;
      }
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, order: Order) => {
    setAnchorEl(event.currentTarget);
    setSelectedOrder(order);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleViewDetails = () => {
    setDetailsDialogOpen(true);
    handleMenuClose();
  };

  const handleCloseDetails = () => {
    setDetailsDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleProcessPayment = (order: Order) => {
    // Navigate to POS with the order loaded
    navigate('/pos', { state: { continueOrder: order } });
    handleMenuClose();
  };

  const handlePrintOrder = async (order: Order) => {
    try {
      if (order.id) {
        // Print order - to be implemented
        toast.info('Imprimir orden - pendiente');
      }
    } catch (error) {
      toast.error('Error al imprimir orden');
    }
    handleMenuClose();
  };

  const handleDuplicateOrder = async (order: Order) => {
    try {
      if (order.id) {
        // Duplicate order - to be implemented
        toast.info('Duplicar orden - pendiente');
      }
    } catch (error) {
      toast.error('Error al duplicar orden');
    }
    handleMenuClose();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'preparing':
        return 'info';
      case 'ready':
        return 'success';
      case 'delivered':
        return 'primary';
      case 'paid':
        return 'default';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'order_number',
      headerName: 'Número',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" fontWeight="bold">
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Tipo',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          size="small"
          label={params.value === 'dine_in' ? 'Mesa' : 'Llevar'}
          color={params.value === 'dine_in' ? 'primary' : 'secondary'}
        />
      ),
    },
    {
      field: 'table',
      headerName: 'Mesa',
      width: 80,
      valueGetter: (params) => params.row.table?.number || '-',
    },
    {
      field: 'customer',
      headerName: 'Cliente',
      width: 150,
      valueGetter: (params) => params.row.customer?.name || 'Consumidor Final',
    },
    {
      field: 'items',
      headerName: 'Items',
      width: 80,
      valueGetter: (params) => params.row.items?.length || 0,
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" fontWeight="bold">
          ${params.value?.toLocaleString('es-CO') || 0}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Estado',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          size="small"
          label={params.value}
          color={getStatusColor(params.value) as any}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Hora',
      width: 100,
      valueGetter: (params) => 
        params.value ? format(new Date(params.value), 'HH:mm') : '',
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOrder(params.row);
              setDetailsDialogOpen(true);
            }}
            title="Ver detalles"
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
          {params.row.status === 'pending' && (
            <IconButton
              size="small"
              color="primary"
              onClick={(e) => {
                e.stopPropagation();
                handleProcessPayment(params.row);
              }}
              title="Procesar pago"
            >
              <PaymentIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleMenuClick(e, params.row);
            }}
            title="Más opciones"
          >
            <MoreIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Órdenes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/pos')}
        >
          Nueva Orden
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Buscar orden..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />
          <Button startIcon={<FilterIcon />}>
            Filtros
          </Button>
        </Box>

        <Tabs
          value={selectedTab}
          onChange={(_, value) => setSelectedTab(value)}
          sx={{ mb: 2 }}
        >
          <Tab label="Hoy" />
          <Tab label="Pendientes" />
          <Tab label="Preparando" />
          <Tab label="Listas" />
          <Tab label="Completadas" />
        </Tabs>

        <DataGrid
          rows={orders}
          columns={columns}
          loading={loading}
          autoHeight
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10, page: 0 },
            },
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              borderBottom: 'none',
            },
          }}
        />
      </Paper>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedOrder && handlePrintOrder(selectedOrder)}>
          <PrintIcon sx={{ mr: 1 }} /> Imprimir
        </MenuItem>
        <MenuItem onClick={() => selectedOrder && handleDuplicateOrder(selectedOrder)}>
          <ReceiptIcon sx={{ mr: 1 }} /> Duplicar
        </MenuItem>
        {selectedOrder?.status === 'pending' && (
          <MenuItem onClick={() => navigate(`/kitchen`)}>
            Enviar a Cocina
          </MenuItem>
        )}
      </Menu>

      {/* Order Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Detalles de Orden #{selectedOrder?.order_number}
            </Typography>
            <Chip
              label={selectedOrder?.status}
              color={getStatusColor(selectedOrder?.status || '') as any}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedOrder && (
            <Box>
              {/* Order Info */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Información General
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Tipo</Typography>
                    <Chip
                      size="small"
                      label={selectedOrder.type === 'dine_in' ? 'Mesa' : 'Llevar'}
                      color={selectedOrder.type === 'dine_in' ? 'primary' : 'secondary'}
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                  {selectedOrder.table && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">Mesa</Typography>
                      <Typography variant="body1">Mesa #{selectedOrder.table.number}</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="body2" color="text.secondary">Cliente</Typography>
                    <Typography variant="body1">
                      {selectedOrder.customer?.name || 'Consumidor Final'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Fecha y Hora</Typography>
                    <Typography variant="body1">
                      {selectedOrder.created_at
                        ? format(new Date(selectedOrder.created_at), 'dd/MM/yyyy HH:mm')
                        : '-'}
                    </Typography>
                  </Box>
                  {selectedOrder.employee && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">Empleado</Typography>
                      <Typography variant="body1">{selectedOrder.employee.name}</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="body2" color="text.secondary">Origen</Typography>
                    <Typography variant="body1">{selectedOrder.source || 'POS'}</Typography>
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Order Items */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Productos
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Producto</TableCell>
                        <TableCell align="center">Cantidad</TableCell>
                        <TableCell align="right">Precio Unit.</TableCell>
                        <TableCell align="right">Subtotal</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrder.items?.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2">
                              {item.product?.name || 'Producto'}
                            </Typography>
                            {item.notes && (
                              <Typography variant="caption" color="text.secondary">
                                Nota: {item.notes}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">{item.quantity}</TableCell>
                          <TableCell align="right">
                            ${item.unit_price?.toLocaleString('es-CO')}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">
                              ${item.subtotal?.toLocaleString('es-CO')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Order Totals */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Subtotal:</Typography>
                  <Typography variant="body2">
                    ${selectedOrder.subtotal?.toLocaleString('es-CO') || 0}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Impuestos:</Typography>
                  <Typography variant="body2">
                    ${selectedOrder.tax?.toLocaleString('es-CO') || 0}
                  </Typography>
                </Box>
                {selectedOrder.discount && selectedOrder.discount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="error">Descuento:</Typography>
                    <Typography variant="body2" color="error">
                      -${selectedOrder.discount.toLocaleString('es-CO')}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6" color="primary">
                    ${selectedOrder.total?.toLocaleString('es-CO') || 0}
                  </Typography>
                </Box>
              </Box>

              {/* Notes */}
              {selectedOrder.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Notas
                    </Typography>
                    <Typography variant="body2">{selectedOrder.notes}</Typography>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Cerrar</Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => selectedOrder && handlePrintOrder(selectedOrder)}
          >
            Imprimir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Orders;
