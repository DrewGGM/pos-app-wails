import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Tooltip,
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
  Restaurant as RestaurantIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { wailsOrderService } from '../../services/wailsOrderService';
import { wailsPrinterService } from '../../services/wailsPrinterService';
import { Order } from '../../types/models';
import { showSuccess, showError, showInfo } from '../../utils/toastUtils';
import { getStatusChipColor } from '../../utils/statusUtils';
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
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Silent refresh without loading indicator (for auto-refresh)
  const loadOrdersSilent = useCallback(async () => {
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
      // Silent fail for auto-refresh
      console.error('Auto-refresh failed:', error);
    }
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
      showError('order.loadError');
    } finally {
      setLoading(false);
    }
  };

  // Load orders when tab changes
  useEffect(() => {
    loadOrders();
  }, [selectedTab]);

  // Auto-refresh for active order tabs (Today, Pending, Preparing)
  // This ensures kitchen acknowledgments are reflected in the UI
  useEffect(() => {
    const shouldAutoRefresh = selectedTab <= 2; // Today, Pending, Preparing

    if (shouldAutoRefresh) {
      // Refresh every 5 seconds for active orders
      refreshIntervalRef.current = setInterval(() => {
        loadOrdersSilent();
      }, 5000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [selectedTab, loadOrdersSilent]);

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
    // Navigate to POS with the order loaded for payment
    navigate('/pos', { state: { continueOrder: order } });
    handleMenuClose();
  };

  const handleEditOrder = (order: Order) => {
    // Navigate to POS with the order loaded for editing
    navigate('/pos', { state: { editOrder: order } });
    handleMenuClose();
  };

  const handlePrintOrder = async (order: Order) => {
    try {
      if (order.id) {
        await wailsPrinterService.printOrder(order);
        showSuccess(`Orden #${order.order_number} enviada a impresora`);
      }
    } catch (error: any) {
      showError('order.printError', error);
    }
    handleMenuClose();
  };

  const handleDuplicateOrder = async (order: Order) => {
    try {
      if (order.id) {
        showInfo('Duplicar orden - pendiente');
      }
    } catch (error) {
      showError('order.updateError');
    }
    handleMenuClose();
  };

  const handleSendToKitchen = async (order: Order) => {
    try {
      if (order.id) {
        await wailsOrderService.sendToKitchen(order.id);
        showSuccess(`Orden #${order.order_number} enviada a cocina`);
      }
    } catch (error) {
      showError('order.kitchenError');
    }
    handleMenuClose();
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!window.confirm(`¿Estás seguro de eliminar la orden #${order.order_number}? Esta acción no se puede deshacer.`)) {
      handleMenuClose();
      return;
    }

    try {
      if (order.id) {
        await wailsOrderService.deleteOrder(order.id);
        showSuccess(`Orden #${order.order_number} eliminada`);
        loadOrders();
      }
    } catch (error) {
      showError('order.deleteError');
    }
    handleMenuClose();
  };

  // Using centralized getStatusChipColor from utils/statusUtils.ts

  const columns: GridColDef[] = [
    {
      field: 'order_number',
      headerName: 'Número',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        const order = params.row as Order;
        // Show sequence number (#1, #2) for order types that require it, otherwise show full order number
        const displayNumber = order.sequence_number != null
          ? `#${order.sequence_number}`
          : params.value;

        // Check if order should show kitchen warning (pending/preparing orders not acknowledged)
        const shouldShowKitchenWarning =
          (order.status === 'pending' || order.status === 'preparing') &&
          !order.kitchen_acknowledged &&
          order.source !== 'split'; // Split bills are not sent to kitchen

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {shouldShowKitchenWarning && (
              <Tooltip title="No confirmado por cocina - Haz clic en el botón de cocina para reenviar">
                <WarningIcon
                  fontSize="small"
                  sx={{ color: 'warning.main', animation: 'pulse 2s infinite' }}
                />
              </Tooltip>
            )}
            <Typography variant="body2" fontWeight="bold">
              {displayNumber}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'order_type',
      headerName: 'Tipo',
      width: 130,
      renderCell: (params: GridRenderCellParams) => {
        const order = params.row as Order;
        const orderType = order.order_type;

        if (!orderType) return <Chip size="small" label="-" />;

        return (
          <Chip
            size="small"
            label={orderType.name}
            color={
              orderType.code === 'dine-in'
                ? 'primary'
                : orderType.code === 'delivery'
                ? 'warning'
                : 'secondary'
            }
            sx={{
              backgroundColor: orderType.display_color || undefined
            }}
          />
        );
      },
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
          color={getStatusChipColor(params.value)}
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
          {/* Show resend button with emphasis if not acknowledged */}
          {(params.row.status === 'pending' || params.row.status === 'preparing') &&
           !params.row.kitchen_acknowledged &&
           params.row.source !== 'split' ? (
            <Tooltip title="⚠️ Reenviar a cocina (no confirmado)">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSendToKitchen(params.row);
                }}
                sx={{
                  animation: 'pulse 2s infinite',
                  '&:hover': { backgroundColor: 'error.light' }
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <IconButton
              size="small"
              color="warning"
              onClick={(e) => {
                e.stopPropagation();
                handleSendToKitchen(params.row);
              }}
              title="Enviar a cocina"
            >
              <RestaurantIcon fontSize="small" />
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
        <MenuItem onClick={() => selectedOrder && handleEditOrder(selectedOrder)}>
          <EditIcon sx={{ mr: 1 }} /> Editar Orden
        </MenuItem>
        <MenuItem onClick={() => selectedOrder && handleViewDetails()}>
          <VisibilityIcon sx={{ mr: 1 }} /> Ver Detalles
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => selectedOrder && handlePrintOrder(selectedOrder)}>
          <PrintIcon sx={{ mr: 1 }} /> Imprimir
        </MenuItem>
        <MenuItem onClick={() => selectedOrder && handleDuplicateOrder(selectedOrder)}>
          <ReceiptIcon sx={{ mr: 1 }} /> Duplicar
        </MenuItem>
        <MenuItem onClick={() => selectedOrder && handleSendToKitchen(selectedOrder)}>
          <RestaurantIcon sx={{ mr: 1 }} /> Enviar a Cocina
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => selectedOrder && handleDeleteOrder(selectedOrder)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} /> Eliminar Orden
        </MenuItem>
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
              color={getStatusChipColor(selectedOrder?.status || '')}
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
                      label={selectedOrder.order_type?.name || (selectedOrder.type === 'dine_in' ? 'Mesa' : 'Llevar')}
                      color={
                        selectedOrder.order_type?.code === 'dine-in' || selectedOrder.type === 'dine_in' ? 'primary' :
                        selectedOrder.order_type?.code === 'delivery' ? 'warning' :
                        'secondary'
                      }
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

              {/* Delivery Info - Show if delivery information exists */}
              {(selectedOrder.delivery_customer_name || selectedOrder.delivery_address || selectedOrder.delivery_phone) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Información de Domicilio
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                      {selectedOrder.delivery_customer_name && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">Cliente</Typography>
                          <Typography variant="body1">{selectedOrder.delivery_customer_name}</Typography>
                        </Box>
                      )}
                      {selectedOrder.delivery_phone && (
                        <Box>
                          <Typography variant="body2" color="text.secondary">Teléfono</Typography>
                          <Typography variant="body1">{selectedOrder.delivery_phone}</Typography>
                        </Box>
                      )}
                      {selectedOrder.delivery_address && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                          <Typography variant="body2" color="text.secondary">Dirección</Typography>
                          <Typography variant="body1">{selectedOrder.delivery_address}</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </>
              )}

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
                            {item.modifiers && item.modifiers.length > 0 && (
                              <Box sx={{ mt: 0.5 }}>
                                {item.modifiers.map((mod, modIndex) => (
                                  <Typography
                                    key={modIndex}
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block', fontStyle: 'italic' }}
                                  >
                                    + {mod.modifier?.name}
                                    {mod.price_change !== 0 && (
                                      <span style={{ marginLeft: '4px' }}>
                                        ({mod.price_change > 0 ? '+' : ''}${mod.price_change.toLocaleString('es-CO')})
                                      </span>
                                    )}
                                  </Typography>
                                ))}
                              </Box>
                            )}
                            {item.notes && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
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
