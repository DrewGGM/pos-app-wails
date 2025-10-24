import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Receipt as ReceiptIcon,
  DateRange as DateRangeIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
  Visibility as ViewIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  ShoppingCart as ShoppingIcon,
  People as PeopleIcon,
  MoreVert as MoreIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import {
  fetchTodaySales,
  fetchSalesHistory,
  refundSale,
} from '../../store/slices/salesSlice';
import { Sale } from '../../types/models';
import { wailsSalesService } from '../../services/wailsSalesService';
import { useAuth } from '../../hooks';
import { toast } from 'react-toastify';

const Sales: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAuth();
  const {
    todaySales,
    sales,
    loading,
    dailyStats,
  } = useSelector((state: RootState) => state.sales);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailDialog, setDetailDialog] = useState(false);
  const [refundDialog, setRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    dispatch(fetchTodaySales());
    loadSalesHistory();
  }, [dispatch]);

  const loadSalesHistory = async () => {
    dispatch(fetchSalesHistory({}));
  };

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setDetailDialog(true);
  };

  const handlePrintReceipt = async (sale: Sale) => {
    try {
      if (sale.id) {
        await wailsSalesService.printReceipt(sale.id);
        toast.success('Recibo enviado a imprimir');
      }
    } catch (error) {
      toast.error('Error al imprimir recibo');
    }
  };

  const handlePrintInvoice = async (sale: Sale) => {
    try {
      if (sale.id) {
        await wailsSalesService.printInvoice(sale.id);
        toast.success('Factura enviada a imprimir');
      }
    } catch (error) {
      toast.error('Error al imprimir factura');
    }
  };

  const handleSendElectronicInvoice = async (sale: Sale) => {
    try {
      if (!sale.id) {
        toast.error('Venta inválida');
        return;
      }

      if (!sale.needs_electronic_invoice) {
        toast.warning('Esta venta no requiere factura electrónica');
        return;
      }

      if (sale.electronic_invoice?.status === 'sent' || sale.electronic_invoice?.status === 'accepted') {
        toast.info('La factura electrónica ya fue enviada');
        return;
      }

      toast.info('Enviando factura electrónica a DIAN...');
      await wailsSalesService.sendElectronicInvoice(sale.id);
      toast.success('Factura electrónica enviada exitosamente');
      loadSalesHistory();
    } catch (error: any) {
      toast.error(error?.message || 'Error al enviar factura electrónica');
      console.error('Error sending electronic invoice:', error);
    }
  };

  const handleOpenRefundDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setRefundAmount(sale.total);
    setRefundReason('');
    setRefundDialog(true);
    handleMenuClose();
  };

  const handleRefund = async () => {
    if (!selectedSale || !refundReason || !user) {
      toast.error('Complete todos los campos');
      return;
    }

    try {
      await dispatch(refundSale({
        saleId: selectedSale.id!,
        amount: refundAmount,
        reason: refundReason,
        employeeId: user.id!,
      })).unwrap();
      toast.success('Reembolso procesado');
      setRefundDialog(false);
      loadSalesHistory();
    } catch (error) {
      toast.error('Error al procesar reembolso');
    }
  };

  const handleExportReport = async () => {
    try {
      const report = await wailsSalesService.exportSalesReport(
        startDate ? startOfDay(startDate) : undefined,
        endDate ? endOfDay(endDate) : undefined
      );
      // Handle download
      toast.success('Reporte exportado');
    } catch (error) {
      toast.error('Error al exportar reporte');
    }
  };

  const handleResendInvoice = async (sale: Sale) => {
    try {
      if (sale.id) {
        await wailsSalesService.resendElectronicInvoice(sale.id);
        toast.success('Factura electrónica reenviada exitosamente');
        loadSalesHistory();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al reenviar factura');
    }
    handleMenuClose();
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, sale: Sale) => {
    setAnchorEl(event.currentTarget);
    setSelectedSale(sale);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const filteredSales = sales.filter(sale => {
    const matchesSearch = !searchQuery ||
      sale.sale_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customer?.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getPaymentMethodChip = (method: string) => {
    const colors: any = {
      cash: 'success',
      card: 'primary',
      transfer: 'info',
    };
    return (
      <Chip
        size="small"
        label={method}
        color={colors[method] || 'default'}
      />
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Ventas</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportReport}
          >
            Exportar
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Ventas Hoy
                  </Typography>
                  <Typography variant="h4">
                    {dailyStats.totalSales}
                  </Typography>
                </Box>
                <ShoppingIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Total Hoy
                  </Typography>
                  <Typography variant="h4">
                    ${dailyStats.totalAmount.toLocaleString('es-CO')}
                  </Typography>
                </Box>
                <MoneyIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Ticket Promedio
                  </Typography>
                  <Typography variant="h4">
                    ${dailyStats.averageSale.toLocaleString('es-CO')}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Clientes
                  </Typography>
                  <Typography variant="h4">
                    {new Set(todaySales.map(s => s.customer?.id)).size}
                  </Typography>
                </Box>
                <PeopleIcon sx={{ fontSize: 40, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              placeholder="Buscar por factura o cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Desde"
                value={startDate}
                onChange={setStartDate}
                slotProps={{
                  textField: { fullWidth: true },
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Hasta"
                value={endDate}
                onChange={setEndDate}
                slotProps={{
                  textField: { fullWidth: true },
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<DateRangeIcon />}
              onClick={loadSalesHistory}
            >
              Filtrar
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Sales Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Factura</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Método</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>FE DIAN</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSales
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {sale.sale_number || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {sale.created_at ? format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell>{sale.customer?.name || 'Consumidor Final'}</TableCell>
                    <TableCell>{sale.order?.items?.length || 0}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        ${sale.total.toLocaleString('es-CO')}
                      </Typography>
                    </TableCell>
                    <TableCell>{getPaymentMethodChip(sale.payment_details?.[0]?.payment_method?.name || 'cash')}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={sale.status}
                        color={sale.status === 'completed' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell>
                      {sale.needs_electronic_invoice ? (
                        sale.electronic_invoice ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {/* Envío Status */}
                            {sale.electronic_invoice.status === 'accepted' ? (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon />}
                                label="Aceptada"
                                color="success"
                              />
                            ) : sale.electronic_invoice.status === 'sent' ? (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon />}
                                label="Enviada"
                                color="success"
                              />
                            ) : sale.electronic_invoice.status === 'validating' ? (
                              <Chip
                                size="small"
                                icon={<PendingIcon />}
                                label="Validando DIAN..."
                                color="warning"
                              />
                            ) : sale.electronic_invoice.status === 'error' || sale.electronic_invoice.status === 'rejected' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                  size="small"
                                  icon={<ErrorIcon />}
                                  label="Error"
                                  color="error"
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => handleSendElectronicInvoice(sale)}
                                  title="Reintentar envío"
                                >
                                  <SendIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Chip
                                size="small"
                                icon={<PendingIcon />}
                                label="Pendiente"
                                color="warning"
                              />
                            )}

                            {/* Validación DIAN Status */}
                            {sale.electronic_invoice.is_valid === true && (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon />}
                                label="✓ Validado DIAN"
                                color="success"
                                variant="outlined"
                                title={sale.electronic_invoice.validation_message}
                              />
                            )}
                            {sale.electronic_invoice.is_valid === false && (
                              <Chip
                                size="small"
                                icon={<ErrorIcon />}
                                label="✗ Rechazado DIAN"
                                color="error"
                                variant="outlined"
                                title={sale.electronic_invoice.validation_message}
                              />
                            )}
                          </Box>
                        ) : (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleSendElectronicInvoice(sale)}
                            title="Enviar factura electrónica"
                          >
                            <SendIcon fontSize="small" />
                          </IconButton>
                        )
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(sale)}
                      >
                        <ViewIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, sale)}
                      >
                        <MoreIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50]}
          component="div"
          count={filteredSales.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedSale && handlePrintReceipt(selectedSale)}>
          <PrintIcon sx={{ mr: 1 }} /> Imprimir Recibo
        </MenuItem>
        <MenuItem onClick={() => selectedSale && handlePrintInvoice(selectedSale)}>
          <ReceiptIcon sx={{ mr: 1 }} /> Imprimir Factura
        </MenuItem>
        {selectedSale?.invoice_type === 'electronic' && (
          <MenuItem onClick={() => selectedSale && handleResendInvoice(selectedSale)}>
            <ReceiptIcon sx={{ mr: 1 }} /> Reenviar Factura Electrónica
          </MenuItem>
        )}
        {selectedSale?.status === 'completed' && (
          <MenuItem onClick={() => selectedSale && handleOpenRefundDialog(selectedSale)}>
            Reembolso
          </MenuItem>
        )}
      </Menu>

      {/* Sale Detail Dialog */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Detalle de Venta #{selectedSale?.sale_number}
            </Typography>
            <Chip
              label={selectedSale?.status}
              color={selectedSale?.status === 'completed' ? 'success' : 'error'}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedSale && (
            <Box>
              {/* Sale Info */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Información General
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Número de Factura</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {selectedSale.sale_number || '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Fecha y Hora</Typography>
                    <Typography variant="body1">
                      {selectedSale.created_at
                        ? format(new Date(selectedSale.created_at), 'dd/MM/yyyy HH:mm')
                        : '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Cliente</Typography>
                    <Typography variant="body1">
                      {selectedSale.customer?.name || 'Consumidor Final'}
                    </Typography>
                    {selectedSale.customer?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {selectedSale.customer.email}
                      </Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Vendedor</Typography>
                    <Typography variant="body1">
                      {selectedSale.employee?.name || '-'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Tipo de Factura</Typography>
                    <Chip
                      size="small"
                      label={selectedSale.invoice_type === 'electronic' ? 'Electrónica' : 'Física'}
                      color={selectedSale.invoice_type === 'electronic' ? 'primary' : 'default'}
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                  {selectedSale.order?.type && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">Tipo de Orden</Typography>
                      <Chip
                        size="small"
                        label={selectedSale.order.type === 'dine_in' ? 'Mesa' : 'Llevar'}
                        color={selectedSale.order.type === 'dine_in' ? 'primary' : 'secondary'}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  )}
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
                      {selectedSale.order?.items?.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2">
                              {item.product?.name || 'Producto'}
                            </Typography>
                            {item.notes && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                Nota: {item.notes}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">{item.quantity}</TableCell>
                          <TableCell align="right">
                            ${(item.unit_price || 0).toLocaleString('es-CO')}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">
                              ${(item.subtotal || 0).toLocaleString('es-CO')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Payment Details */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Detalles de Pago
                </Typography>
                {selectedSale.payment_details && selectedSale.payment_details.length > 0 ? (
                  <Box sx={{ mt: 1 }}>
                    {selectedSale.payment_details.map((payment, index) => (
                      <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            size="small"
                            label={payment.payment_method?.name || 'Efectivo'}
                            color={
                              payment.payment_method?.name === 'cash' ? 'success' :
                              payment.payment_method?.name === 'card' ? 'primary' : 'info'
                            }
                          />
                          {payment.reference && (
                            <Typography variant="caption" color="text.secondary">
                              Ref: {payment.reference}
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="body2" fontWeight="bold">
                          ${(payment.amount || 0).toLocaleString('es-CO')}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No hay información de pago disponible
                  </Typography>
                )}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Sale Totals */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Subtotal:</Typography>
                  <Typography variant="body2">
                    ${(selectedSale.subtotal || 0).toLocaleString('es-CO')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Impuestos:</Typography>
                  <Typography variant="body2">
                    ${(selectedSale.tax || 0).toLocaleString('es-CO')}
                  </Typography>
                </Box>
                {selectedSale.discount && selectedSale.discount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="error">Descuento:</Typography>
                    <Typography variant="body2" color="error">
                      -${selectedSale.discount.toLocaleString('es-CO')}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6" color="primary">
                    ${selectedSale.total.toLocaleString('es-CO')}
                  </Typography>
                </Box>
                {selectedSale.payment_details && selectedSale.payment_details.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="body2">Recibido:</Typography>
                      <Typography variant="body2">
                        ${(selectedSale.amount_paid || 0).toLocaleString('es-CO')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="success.main">Cambio:</Typography>
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        ${(selectedSale.change || 0).toLocaleString('es-CO')}
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>

              {/* Notes */}
              {selectedSale.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Notas
                    </Typography>
                    <Typography variant="body2">{selectedSale.notes}</Typography>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(false)}>Cerrar</Button>
          <Button
            variant="outlined"
            startIcon={<ReceiptIcon />}
            onClick={() => selectedSale && handlePrintInvoice(selectedSale)}
          >
            Factura
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => selectedSale && handlePrintReceipt(selectedSale)}
          >
            Recibo
          </Button>
        </DialogActions>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialog} onClose={() => setRefundDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Procesar Reembolso</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Monto a reembolsar"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(Number(e.target.value))}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Razón del reembolso"
              multiline
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundDialog(false)}>Cancelar</Button>
          <Button onClick={handleRefund} variant="contained" color="error">
            Procesar Reembolso
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Sales;
