import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Container,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  AccountBalance as BankIcon,
  CreditCard as CardIcon,
  LocalAtm as CashIcon,
  Print as PrintIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Receipt as ReceiptIcon,
  Assessment as ReportIcon,
  ExpandMore as ExpandMoreIcon,
  History as HistoryIcon,
  Description as DIANReportIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth, useDIANMode } from '../../hooks';
import { wailsAuthService } from '../../services/wailsAuthService';
import { wailsSalesService, DIANClosingReport } from '../../services/wailsSalesService';
import { toast } from 'react-toastify';

interface CashRegisterStatus {
  id: number;
  opening_amount: number;
  closing_amount: number;
  current_amount: number;
  expected_amount: number;  // Expected cash based on sales and movements
  opened_at: Date;
  closed_at?: Date;
  opened_by: string;
  status: 'open' | 'closed';
  movements: CashMovement[];
  sales_summary: {
    by_payment_method: { [key: string]: number }; // For cash register balance (affects_cash_register=true)
    total: number;
    count: number;
  };
  sales_summary_for_display: {
    by_payment_method: { [key: string]: number }; // For sales summary display (show_in_cash_summary=true)
    total: number;
    count: number;
  };
}

interface CashMovement {
  id: number;
  type: 'sale' | 'deposit' | 'withdrawal' | 'refund' | 'in' | 'out' | 'adjustment';
  amount: number;
  reason?: string;
  description?: string;
  reference?: string;  // Added to filter out OPENING movement
  created_at: Date;
  created_by: string;
}

const CashRegister: React.FC = () => {
  const { user, cashRegisterId, openCashRegister: openCashRegisterContext, closeCashRegister: closeCashRegisterContext } = useAuth();
  const { isDIANMode } = useDIANMode();
  const navigate = useNavigate();
  const [registerStatus, setRegisterStatus] = useState<CashRegisterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');

  // DIAN Closing Report state
  const [dianReportDialog, setDianReportDialog] = useState(false);
  const [dianReportDate, setDianReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dianReport, setDianReport] = useState<DIANClosingReport | null>(null);
  const [loadingDianReport, setLoadingDianReport] = useState(false);
  const [printingDianReport, setPrintingDianReport] = useState(false);
  const [closingNotes, setClosingNotes] = useState('');
  const [movement, setMovement] = useState({
    type: 'in' as 'in' | 'out',
    amount: '',
    reason: '',
  });
  const [editMovementDialog, setEditMovementDialog] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovement | null>(null);

  useEffect(() => {
    loadRegisterStatus();
  }, [cashRegisterId, isDIANMode]); // Reload when DIAN mode changes

  const loadRegisterStatus = async () => {
    try {
      setLoading(true);
      if (cashRegisterId && user) {
        const register = await wailsAuthService.getOpenCashRegister(user.id!);
        if (register) {
          // Get optimized sales summary using SQL aggregation (much faster than loading all sales)
          let salesSummary = { by_payment_method: {} as { [key: string]: number }, total: 0, count: 0 };
          let salesSummaryForDisplay = { by_payment_method: {} as { [key: string]: number }, total: 0, count: 0 };

          try {
            // Use optimized backend endpoint that uses SQL aggregation
            // instead of loading 500+ sales with 12 nested preloads each
            const summary = await wailsAuthService.getCashRegisterSalesSummary(register.id || 0, isDIANMode);

            salesSummary = {
              by_payment_method: summary.by_payment_method || {},
              total: summary.total || 0,
              count: summary.count || 0,
            };
            salesSummaryForDisplay = {
              by_payment_method: summary.by_payment_method_display || {},
              total: summary.total_display || 0,
              count: summary.count_display || 0,
            };
          } catch (e) {
            // Error loading sales summary - use empty defaults
          }

          // Calculate expected amount based on DIAN mode
          // In DIAN mode, use frontend-calculated value from filtered sales
          // In normal mode, use backend-calculated value
          const movements = (register.movements || []);
          const deposits = movements
            .filter((m: any) => (m.type === 'deposit' || m.type === 'in') && m.reference !== 'OPENING')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0);
          const withdrawals = movements
            .filter((m: any) => m.type === 'withdrawal' || m.type === 'out')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0);

          // Sales that affect cash register from salesSummary
          const salesAffectingCash = Object.values(salesSummary.by_payment_method).reduce(
            (sum: number, amount) => sum + (amount as number), 0
          );

          const calculatedExpectedAmount = isDIANMode
            ? (register.opening_amount || 0) + salesAffectingCash + deposits - withdrawals
            : register.expected_amount || register.opening_amount || 0;

          setRegisterStatus({
            id: register.id || 0,
            opening_amount: register.opening_amount || 0,
            closing_amount: register.closing_amount || 0,
            current_amount: register.opening_amount || 0,  // Start with opening amount, user enters actual cash
            expected_amount: calculatedExpectedAmount,  // Use calculated amount in DIAN mode
            opened_at: new Date(register.opened_at),
            opened_by: user.name,
            status: register.status as 'open' | 'closed',
            movements: (register.movements || []).map(m => ({
              id: m.id || 0,
              // CRITICAL FIX: Convert backend types to frontend types
              type: (m.type === 'deposit' ? 'in' : m.type === 'withdrawal' ? 'out' : m.type) as 'in' | 'out',
              amount: m.amount || 0,
              description: m.description || '',
              reason: m.reason || '',
              reference: m.reference || '',  // Include reference to filter OPENING
              created_at: new Date(m.created_at || new Date()),
              created_by: m.created_by || ''
            })),
            sales_summary: salesSummary,
            sales_summary_for_display: salesSummaryForDisplay
          });

          // Set default closing amount
          if (register.expected_amount) {
            setClosingAmount(register.expected_amount.toString());
          }
        }
      }
    } catch (error) {
      // Error loading cash register
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRegister = async () => {
    if (!openingAmount) {
      toast.error('Ingrese el monto de apertura');
      return;
    }

    try {
      // Usa la función del contexto que actualiza el estado global
      await openCashRegisterContext(Number(openingAmount), '');
      setOpenDialog(false);
      setOpeningAmount('');
      // Espera un momento para que se actualice el contexto
      setTimeout(() => {
        loadRegisterStatus();
      }, 100);
    } catch (error: any) {
      toast.error(error.message || 'Error al abrir la caja');
    }
  };

  const handleCloseRegister = async () => {
    if (!closingAmount) {
      toast.error('Ingrese el monto de cierre');
      return;
    }

    try {
      // Usa la función del contexto que actualiza el estado global
      await closeCashRegisterContext(Number(closingAmount), closingNotes);
      setCloseDialog(false);
      setClosingAmount('');
      setClosingNotes('');
      // Espera un momento para que se actualice el contexto
      setTimeout(() => {
        loadRegisterStatus();
      }, 100);
    } catch (error: any) {
      toast.error(error.message || 'Error al cerrar la caja');
    }
  };

  const handleCashMovement = async () => {
    if (!movement.amount || !movement.reason || !cashRegisterId || !user) {
      toast.error('Complete todos los campos');
      return;
    }

    try {
      const movementType = movement.type === 'in' ? 'deposit' : 'withdrawal';
      await wailsAuthService.addCashMovement(
        cashRegisterId,
        Number(movement.amount),
        movementType,
        movement.reason,
        '',
        user.id!
      );
      toast.success('Movimiento de caja registrado');
      setMovementDialog(false);
      setMovement({ type: 'in', amount: '', reason: '' });
      loadRegisterStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error al registrar movimiento');
    }
  };

  const handleEditMovement = (movement: CashMovement) => {
    setEditingMovement(movement);
    setEditMovementDialog(true);
  };

  const handleUpdateMovement = async () => {
    if (!editingMovement || !editingMovement.amount || !editingMovement.reason) {
      toast.error('Complete todos los campos');
      return;
    }

    try {
      const movementType = editingMovement.type === 'in' ? 'deposit' : 'withdrawal';
      await wailsAuthService.updateCashMovement(
        editingMovement.id,
        Number(editingMovement.amount),
        movementType,
        editingMovement.reason
      );
      toast.success('Movimiento actualizado correctamente');
      setEditMovementDialog(false);
      setEditingMovement(null);
      loadRegisterStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error al actualizar movimiento');
    }
  };

  const handlePrintReport = async () => {
    try {
      if (!user?.id) {
        toast.error('Usuario no identificado');
        return;
      }
      await wailsAuthService.printLastCashRegisterReport(user.id);
      toast.success('Reporte de cierre enviado a imprimir');
    } catch (error: any) {
      toast.error(error?.message || 'Error al imprimir reporte');
    }
  };

  const handlePrintCurrentReport = async () => {
    try {
      if (cashRegisterId) {
        await wailsAuthService.printCurrentCashRegisterReport(cashRegisterId);
        toast.success('Reporte de caja actual enviado a imprimir');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al imprimir reporte actual');
    }
  };

  // DIAN Closing Report handlers
  const handleOpenDianReport = () => {
    setDianReportDate(format(new Date(), 'yyyy-MM-dd'));
    setDianReport(null);
    setDianReportDialog(true);
  };

  const handleLoadDianReport = async () => {
    try {
      setLoadingDianReport(true);
      const report = await wailsSalesService.getDIANClosingReport(dianReportDate);
      setDianReport(report);
    } catch (error: any) {
      toast.error(error?.message || 'Error al generar reporte DIAN');
    } finally {
      setLoadingDianReport(false);
    }
  };

  const handlePrintDianReport = async () => {
    try {
      setPrintingDianReport(true);
      await wailsSalesService.printDIANClosingReport(dianReportDate);
      toast.success('Reporte DIAN enviado a imprimir');
    } catch (error: any) {
      toast.error(error?.message || 'Error al imprimir reporte DIAN');
    } finally {
      setPrintingDianReport(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-CO')}`;
  };

  // Format number input with thousands separator
  const formatNumberInput = (value: string): string => {
    // Remove all non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d]/g, '');
    if (!cleaned) return '';
    // Format with thousands separator
    return Number(cleaned).toLocaleString('es-CO');
  };

  // Parse formatted input back to number
  const parseNumberInput = (value: string): string => {
    return value.replace(/\./g, '');
  };

  const calculateDifference = () => {
    if (!registerStatus) return 0;
    // Use backend-calculated expected amount (already considers affects_cash_register flag)
    return registerStatus.current_amount - registerStatus.expected_amount;
  };

  const isRegisterOpen = registerStatus?.status === 'open';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Control de Caja</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {isRegisterOpen && (
            <>
              {!isDIANMode && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<PrintIcon />}
                    onClick={handlePrintReport}
                  >
                    Imprimir Reporte
                  </Button>
                  <Button
                    variant="outlined"
                    color="info"
                    startIcon={<ReportIcon />}
                    onClick={handlePrintCurrentReport}
                  >
                    Reporte Actual
                  </Button>
                </>
              )}
              <Button
                variant="contained"
                color="error"
                startIcon={<LockIcon />}
                onClick={() => setCloseDialog(true)}
              >
                Cerrar Caja
              </Button>
            </>
          )}
          {!isRegisterOpen && (
            <Button
              variant="contained"
              color="success"
              startIcon={<LockOpenIcon />}
              onClick={() => setOpenDialog(true)}
            >
              Abrir Caja
            </Button>
          )}
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !isRegisterOpen && !registerStatus && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <LockIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Caja Cerrada
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            La caja debe estar abierta para procesar ventas
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<LockOpenIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Abrir Caja
          </Button>
        </Paper>
      )}

      {!loading && registerStatus && (
        <>
          {/* Status Card */}
          <Card sx={{ mb: 3, backgroundColor: isRegisterOpen ? '#e8f5e9' : '#ffebee' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Estado: <Chip
                      label={isRegisterOpen ? 'ABIERTA' : 'CERRADA'}
                      color={isRegisterOpen ? 'success' : 'error'}
                    />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Abierta por: {registerStatus.opened_by}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Fecha apertura: {format(new Date(registerStatus.opened_at), 'dd/MM/yyyy HH:mm')}
                  </Typography>
                  {registerStatus.closed_at && (
                    <Typography variant="body2" color="text.secondary">
                      Fecha cierre: {format(new Date(registerStatus.closed_at), 'dd/MM/yyyy HH:mm')}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h4" color="primary">
                    ${registerStatus.current_amount.toLocaleString('es-CO')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Monto actual en caja
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Summary Grid */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Resumen de Ventas
                </Typography>
                <List dense>
                  {/* Show each payment method separately */}
                  {Object.entries(registerStatus.sales_summary_for_display.by_payment_method).map(([methodName, amount]) => (
                    <ListItem key={methodName}>
                      <ListItemText primary={methodName} />
                      <ListItemSecondaryAction>
                        <Typography variant="body1" fontWeight="bold">
                          ${(amount as number).toLocaleString('es-CO')}
                        </Typography>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                  <Divider />
                  <ListItem>
                    <ListItemText primary={<strong>Total Ventas</strong>} />
                    <ListItemSecondaryAction>
                      <Typography variant="h6" color="primary">
                        ${registerStatus.sales_summary_for_display.total.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Cantidad de ventas" />
                    <ListItemSecondaryAction>
                      <Chip label={registerStatus.sales_summary_for_display.count} />
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Balance de Caja
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="Apertura" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1">
                        ${registerStatus.opening_amount.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {/* Ventas por método de pago que afectan caja */}
                  <ListItem>
                    <ListItemText
                      primary={<strong>Ventas que afectan caja</strong>}
                      secondary="Desglose por método de pago"
                    />
                  </ListItem>
                  {Object.entries(registerStatus.sales_summary.by_payment_method).map(([methodName, amount]) => (
                    <ListItem key={methodName} sx={{ pl: 4 }}>
                      <ListItemText
                        primary={methodName}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                      <ListItemSecondaryAction>
                        <Typography variant="body2" color="success.main">
                          +${(amount as number).toLocaleString('es-CO')}
                        </Typography>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                  {Object.keys(registerStatus.sales_summary.by_payment_method).length === 0 && (
                    <ListItem sx={{ pl: 4 }}>
                      <ListItemText
                        primary="Sin ventas"
                        primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                      />
                    </ListItem>
                  )}
                  <ListItem>
                    <ListItemText primary="Otros ingresos" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" color="success.main">
                        +${registerStatus.movements
                          .filter(m => m.type === 'in' && m.reference !== 'OPENING')
                          .reduce((sum, m) => sum + m.amount, 0)
                          .toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Salidas" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" color="error.main">
                        -${registerStatus.movements
                          .filter(m => m.type === 'out')
                          .reduce((sum, m) => sum + m.amount, 0)
                          .toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemText primary={<strong>Efectivo esperado</strong>} />
                    <ListItemSecondaryAction>
                      <Typography variant="h6" color="primary">
                        ${registerStatus.expected_amount.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
                
                {calculateDifference() !== 0 && (
                  <Alert severity={calculateDifference() > 0 ? 'success' : 'error'} sx={{ mt: 2 }}>
                    Diferencia: ${calculateDifference().toLocaleString('es-CO')}
                  </Alert>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Movements */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Movimientos de Caja</Typography>
              {isRegisterOpen && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setMovementDialog(true)}
                >
                  Registrar Movimiento
                </Button>
              )}
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Hora</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Razón</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell>Usuario</TableCell>
                    {isRegisterOpen && <TableCell align="center">Acciones</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {registerStatus.movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        {format(new Date(movement.created_at), 'HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={['deposit', 'in', 'sale', 'refund'].includes(movement.type) ? 'Entrada' : 'Salida'}
                          color={['deposit', 'in', 'sale', 'refund'].includes(movement.type) ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>{movement.reason || movement.description}</TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={['deposit', 'in', 'sale', 'refund'].includes(movement.type) ? 'success.main' : 'error.main'}
                        >
                          {['deposit', 'in', 'sale', 'refund'].includes(movement.type) ? '+' : '-'}
                          ${movement.amount.toLocaleString('es-CO')}
                        </Typography>
                      </TableCell>
                      <TableCell>{movement.created_by}</TableCell>
                      {isRegisterOpen && (
                        <TableCell align="center">
                          {movement.type === 'in' || movement.type === 'out' ? (
                            <IconButton
                              size="small"
                              onClick={() => handleEditMovement(movement)}
                              title="Editar movimiento"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {registerStatus.movements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isRegisterOpen ? 6 : 5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No hay movimientos registrados
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Link to Cash Register History and DIAN Report */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            {!isDIANMode && (
              <Button
                variant="outlined"
                size="large"
                startIcon={<HistoryIcon />}
                onClick={() => navigate('/cash-register-history')}
                sx={{ px: 4 }}
              >
                Ver Historial de Cierres de Caja
              </Button>
            )}
            <Button
              variant="contained"
              size="large"
              color="primary"
              startIcon={<DIANReportIcon />}
              onClick={handleOpenDianReport}
              sx={{ px: 4 }}
            >
              Reporte Cierre DIAN
            </Button>
          </Box>
        </>
      )}

      {/* Open Register Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Abrir Caja</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Registre el monto inicial de efectivo en caja
          </Alert>
          <TextField
            autoFocus
            fullWidth
            label="Monto de apertura"
            type="text"
            value={openingAmount ? formatNumberInput(openingAmount) : ''}
            onChange={(e) => setOpeningAmount(parseNumberInput(e.target.value))}
            placeholder="0"
            InputProps={{
              startAdornment: '$',
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
          <Button onClick={handleOpenRegister} variant="contained" color="success">
            Abrir Caja
          </Button>
        </DialogActions>
      </Dialog>

      {/* Close Register Dialog */}
      <Dialog open={closeDialog} onClose={() => setCloseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cerrar Caja</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Cuente el efectivo actual y registre el monto de cierre
          </Alert>
          <TextField
            autoFocus
            fullWidth
            label="Monto de cierre"
            type="text"
            value={closingAmount ? formatNumberInput(closingAmount) : ''}
            onChange={(e) => setClosingAmount(parseNumberInput(e.target.value))}
            placeholder="0"
            InputProps={{
              startAdornment: '$',
            }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Observaciones (opcional)"
            multiline
            rows={2}
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseDialog(false)}>Cancelar</Button>
          <Button onClick={handleCloseRegister} variant="contained" color="error">
            Cerrar Caja
          </Button>
        </DialogActions>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementDialog} onClose={() => setMovementDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Registrar Movimiento de Caja</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="Tipo"
                value={movement.type}
                onChange={(e) => setMovement({ ...movement, type: e.target.value as 'in' | 'out' })}
                SelectProps={{ native: true }}
              >
                <option value="in">Entrada</option>
                <option value="out">Salida</option>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Monto"
                type="text"
                value={movement.amount ? formatNumberInput(movement.amount) : ''}
                onChange={(e) => setMovement({ ...movement, amount: parseNumberInput(e.target.value) })}
                InputProps={{
                  startAdornment: '$',
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Razón"
                multiline
                rows={2}
                value={movement.reason}
                onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
                placeholder="Ej: Pago a proveedor, cambio de billetes, etc."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovementDialog(false)}>Cancelar</Button>
          <Button onClick={handleCashMovement} variant="contained">
            Registrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Movement Dialog */}
      <Dialog open={editMovementDialog} onClose={() => setEditMovementDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar Movimiento de Caja</DialogTitle>
        <DialogContent>
          {editingMovement && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  select
                  fullWidth
                  label="Tipo"
                  value={editingMovement.type}
                  onChange={(e) => setEditingMovement({ ...editingMovement, type: e.target.value as 'in' | 'out' })}
                  SelectProps={{ native: true }}
                >
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Monto"
                  type="text"
                  value={editingMovement.amount ? formatNumberInput(editingMovement.amount.toString()) : ''}
                  onChange={(e) => setEditingMovement({ ...editingMovement, amount: Number(parseNumberInput(e.target.value)) })}
                  InputProps={{
                    startAdornment: '$',
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Razón"
                  multiline
                  rows={2}
                  value={editingMovement.reason}
                  onChange={(e) => setEditingMovement({ ...editingMovement, reason: e.target.value })}
                  placeholder="Ej: Pago a proveedor, cambio de billetes, etc."
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditMovementDialog(false)}>Cancelar</Button>
          <Button onClick={handleUpdateMovement} variant="contained" color="primary">
            Actualizar
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIAN Closing Report Dialog */}
      <Dialog
        open={dianReportDialog}
        onClose={() => setDianReportDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DIANReportIcon /> Reporte Diario de Cierre DIAN
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Este reporte muestra un resumen de las ventas procesadas por la DIAN (facturación electrónica) para control fiscal.
          </Alert>

          {/* Date Selector */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
            <TextField
              type="date"
              label="Fecha del Reporte"
              value={dianReportDate}
              onChange={(e) => setDianReportDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 200 }}
            />
            <Button
              variant="contained"
              onClick={handleLoadDianReport}
              disabled={loadingDianReport}
              startIcon={loadingDianReport ? <CircularProgress size={20} /> : <ReportIcon />}
            >
              {loadingDianReport ? 'Generando...' : 'Generar Reporte'}
            </Button>
          </Box>

          {/* Report Content */}
          {dianReport && (
            <Box>
              {/* Business Header */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                <Typography variant="h6" align="center">{dianReport.business_name}</Typography>
                {dianReport.commercial_name && dianReport.commercial_name !== dianReport.business_name && (
                  <Typography variant="body2" align="center">{dianReport.commercial_name}</Typography>
                )}
                <Typography variant="body2" align="center">
                  NIT: {dianReport.nit}{dianReport.dv ? `-${dianReport.dv}` : ''}
                </Typography>
                {dianReport.regime && <Typography variant="body2" align="center">{dianReport.regime}</Typography>}
              </Paper>

              {/* Invoice Range */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Rango de Facturas Electrónicas
                </Typography>
                {dianReport.total_invoices > 0 ? (
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Primera:</Typography>
                      <Typography variant="body1" fontWeight="bold">{dianReport.first_invoice_number}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Última:</Typography>
                      <Typography variant="body1" fontWeight="bold">{dianReport.last_invoice_number}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Total:</Typography>
                      <Typography variant="body1" fontWeight="bold">{dianReport.total_invoices} facturas</Typography>
                    </Grid>
                  </Grid>
                ) : (
                  <Typography variant="body2" color="text.secondary">Sin facturas emitidas en esta fecha</Typography>
                )}
              </Paper>

              {/* Sales by Tax Type */}
              {dianReport.sales_by_tax && dianReport.sales_by_tax.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Ventas por Tipo de Impuesto
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Tipo</TableCell>
                          <TableCell align="right">Base</TableCell>
                          <TableCell align="right">Impuesto</TableCell>
                          <TableCell align="right">Items</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dianReport.sales_by_tax.map((tax, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{tax.tax_type_name} ({tax.tax_percent > 0 ? `${tax.tax_percent}%` : 'N/A'})</TableCell>
                            <TableCell align="right">{formatCurrency(tax.base_amount)}</TableCell>
                            <TableCell align="right">{formatCurrency(tax.tax_amount)}</TableCell>
                            <TableCell align="right">{tax.item_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}

              {/* Sales by Category */}
              {dianReport.sales_by_category && dianReport.sales_by_category.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Ventas por Categoría
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Categoría</TableCell>
                          <TableCell align="right">Cantidad</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dianReport.sales_by_category.map((cat, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{cat.category_name}</TableCell>
                            <TableCell align="right">{cat.quantity}</TableCell>
                            <TableCell align="right">{formatCurrency(cat.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}

              {/* Payment Methods */}
              {dianReport.payment_methods && dianReport.payment_methods.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Medios de Pago
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Método</TableCell>
                          <TableCell align="right">Transacciones</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dianReport.payment_methods.map((pm, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{pm.method_name}</TableCell>
                            <TableCell align="right">{pm.transactions}</TableCell>
                            <TableCell align="right">{formatCurrency(pm.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}

              {/* Adjustments (Credit/Debit Notes) */}
              {((dianReport.credit_notes && dianReport.credit_notes.length > 0) ||
                (dianReport.debit_notes && dianReport.debit_notes.length > 0)) && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Ajustes (Notas Crédito/Débito)
                  </Typography>
                  {dianReport.credit_notes && dianReport.credit_notes.length > 0 && (
                    <>
                      <Typography variant="body2" color="error.main" fontWeight="bold">Notas Crédito:</Typography>
                      {dianReport.credit_notes.map((cn, idx) => (
                        <Typography key={idx} variant="body2">
                          {cn.prefix}{cn.number}: -{formatCurrency(cn.amount)} ({cn.reason})
                        </Typography>
                      ))}
                      <Typography variant="body2" fontWeight="bold" color="error.main" sx={{ mb: 1 }}>
                        Total NC: -{formatCurrency(dianReport.total_credit_notes)}
                      </Typography>
                    </>
                  )}
                  {dianReport.debit_notes && dianReport.debit_notes.length > 0 && (
                    <>
                      <Typography variant="body2" color="success.main" fontWeight="bold">Notas Débito:</Typography>
                      {dianReport.debit_notes.map((dn, idx) => (
                        <Typography key={idx} variant="body2">
                          {dn.prefix}{dn.number}: +{formatCurrency(dn.amount)} ({dn.reason})
                        </Typography>
                      ))}
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        Total ND: +{formatCurrency(dianReport.total_debit_notes)}
                      </Typography>
                    </>
                  )}
                </Paper>
              )}

              {/* Totals Summary */}
              <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Resumen de Totales
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2">Transacciones:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" fontWeight="bold">
                      {dianReport.total_transactions}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Subtotal:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {formatCurrency(dianReport.total_subtotal)}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Impuestos:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {formatCurrency(dianReport.total_tax)}
                    </Typography>
                  </Grid>
                  {dianReport.total_discount > 0 && (
                    <>
                      <Grid item xs={6}>
                        <Typography variant="body2">Descuentos:</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="right" color="error.main">
                          -{formatCurrency(dianReport.total_discount)}
                        </Typography>
                      </Grid>
                    </>
                  )}
                  <Grid item xs={6}>
                    <Typography variant="body2">Total Ventas:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" fontWeight="bold">
                      {formatCurrency(dianReport.total_sales)}
                    </Typography>
                  </Grid>
                  {dianReport.total_adjustments !== 0 && (
                    <>
                      <Grid item xs={6}>
                        <Typography variant="body2">Ajustes:</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography
                          variant="body2"
                          align="right"
                          color={dianReport.total_adjustments > 0 ? 'success.main' : 'error.main'}
                        >
                          {dianReport.total_adjustments > 0 ? '+' : ''}
                          {formatCurrency(dianReport.total_adjustments)}
                        </Typography>
                      </Grid>
                    </>
                  )}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="h6">TOTAL:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="h6" align="right" color="primary">
                      {formatCurrency(dianReport.grand_total)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {!dianReport && !loadingDianReport && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <DIANReportIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body1" color="text.secondary">
                Seleccione una fecha y haga clic en "Generar Reporte" para ver el resumen de ventas DIAN.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDianReportDialog(false)}>Cerrar</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={printingDianReport ? <CircularProgress size={20} /> : <PrintIcon />}
            onClick={handlePrintDianReport}
            disabled={!dianReport || printingDianReport}
          >
            {printingDianReport ? 'Imprimiendo...' : 'Imprimir Reporte'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CashRegister;
