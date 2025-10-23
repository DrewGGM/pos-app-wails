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
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../../hooks';
import { wailsAuthService } from '../../services/wailsAuthService';
import { wailsSalesService } from '../../services/wailsSalesService';
import { toast } from 'react-toastify';

interface CashRegisterStatus {
  id: number;
  opening_amount: number;
  closing_amount: number;
  current_amount: number;
  opened_at: Date;
  closed_at?: Date;
  opened_by: string;
  status: 'open' | 'closed';
  movements: CashMovement[];
  sales_summary: {
    cash: number;
    card: number;
    transfer: number;
    total: number;
    count: number;
  };
}

interface CashMovement {
  id: number;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  created_at: Date;
  created_by: string;
}

const CashRegister: React.FC = () => {
  const { user, cashRegisterId } = useAuth();
  const [registerStatus, setRegisterStatus] = useState<CashRegisterStatus | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [movement, setMovement] = useState({
    type: 'in' as 'in' | 'out',
    amount: '',
    reason: '',
  });

  useEffect(() => {
    loadRegisterStatus();
  }, [cashRegisterId]);

  const loadRegisterStatus = async () => {
    try {
      if (cashRegisterId && user) {
        const register = await wailsAuthService.getOpenCashRegister(user.id!);
        if (register) {
          // Get sales for this cash register to calculate summary
          let salesSummary = { cash: 0, card: 0, transfer: 0, total: 0, count: 0 };
          
          try {
            const sales = await wailsSalesService.getSales();
            const registerSales = sales.filter((s: any) => s.cash_register_id === register.id);
            
            registerSales.forEach((sale: any) => {
              salesSummary.total += sale.total;
              salesSummary.count++;
              
              // Calculate by payment method (simplified - assumes single payment method per sale)
              if (sale.payment_method === 'cash' || sale.payment_method === 'Efectivo') {
                salesSummary.cash += sale.total;
              } else if (sale.payment_method?.includes('Tarjeta') || sale.payment_method?.includes('card')) {
                salesSummary.card += sale.total;
              } else {
                salesSummary.transfer += sale.total;
              }
            });
          } catch (e) {
            console.error('Error loading sales summary:', e);
          }

          setRegisterStatus({
            id: register.id || 0,
            opening_amount: register.opening_amount || 0,
            closing_amount: register.closing_amount || 0,
            current_amount: register.expected_amount || register.opening_amount || 0,
            opened_at: new Date(register.opened_at),
            opened_by: user.name,
            status: register.status as 'open' | 'closed',
            movements: (register.movements || []).map(m => ({
              id: m.id || 0,
              type: m.type as 'in' | 'out',
              amount: m.amount || 0,
              description: m.description || '',
              reason: m.reason || '',
              created_at: new Date(m.created_at || new Date()),
              created_by: m.created_by || ''
            })),
            sales_summary: salesSummary
          });
          
          // Set default closing amount
          if (register.expected_amount) {
            setClosingAmount(register.expected_amount.toString());
          }
        }
      }
    } catch (error) {
      console.error('Error loading cash register:', error);
    }
  };

  const handleOpenRegister = async () => {
    if (!openingAmount) {
      toast.error('Ingrese el monto de apertura');
      return;
    }

    try {
      if (user) {
        await wailsAuthService.openCashRegister(user.id!, Number(openingAmount), '');
        toast.success('Caja abierta exitosamente');
        setOpenDialog(false);
        setOpeningAmount('');
        loadRegisterStatus();
      }
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
      if (cashRegisterId) {
        await wailsAuthService.closeCashRegister(cashRegisterId, Number(closingAmount), closingNotes);
        toast.success('Caja cerrada exitosamente');
        setCloseDialog(false);
        setClosingAmount('');
        setClosingNotes('');
        loadRegisterStatus();
      }
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

  const handlePrintReport = async () => {
    try {
      // This should use a Wails service for printing
      // await wailsSalesService.printCashRegisterReport(cashRegisterId!);
      toast.info('Impresión de reporte no implementada con Wails aún.');
    } catch (error) {
      toast.error('Error al imprimir reporte');
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

  const calculateDifference = () => {
    if (!registerStatus) return 0;
    const expected = registerStatus.opening_amount + 
                    registerStatus.sales_summary.cash +
                    registerStatus.movements.reduce((sum, m) => 
                      sum + (m.type === 'in' ? m.amount : -m.amount), 0);
    return registerStatus.current_amount - expected;
  };

  const isRegisterOpen = registerStatus?.status === 'open';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Control de Caja</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {isRegisterOpen && (
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

      {!isRegisterOpen && !registerStatus && (
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

      {registerStatus && (
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
                  <ListItem>
                    <ListItemText primary="Efectivo" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" fontWeight="bold">
                        ${registerStatus.sales_summary.cash.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Tarjeta" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" fontWeight="bold">
                        ${registerStatus.sales_summary.card.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Transferencia" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" fontWeight="bold">
                        ${registerStatus.sales_summary.transfer.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemText primary={<strong>Total Ventas</strong>} />
                    <ListItemSecondaryAction>
                      <Typography variant="h6" color="primary">
                        ${registerStatus.sales_summary.total.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Cantidad de ventas" />
                    <ListItemSecondaryAction>
                      <Chip label={registerStatus.sales_summary.count} />
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
                  <ListItem>
                    <ListItemText primary="Ventas en efectivo" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" color="success.main">
                        +${registerStatus.sales_summary.cash.toLocaleString('es-CO')}
                      </Typography>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Otros ingresos" />
                    <ListItemSecondaryAction>
                      <Typography variant="body1" color="success.main">
                        +${registerStatus.movements
                          .filter(m => m.type === 'in')
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
                        ${(registerStatus.opening_amount + 
                          registerStatus.sales_summary.cash +
                          registerStatus.movements.reduce((sum, m) => 
                            sum + (m.type === 'in' ? m.amount : -m.amount), 0))
                          .toLocaleString('es-CO')}
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
                          label={movement.type === 'in' ? 'Entrada' : 'Salida'}
                          color={movement.type === 'in' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>{movement.reason}</TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={movement.type === 'in' ? 'success.main' : 'error.main'}
                        >
                          {movement.type === 'in' ? '+' : '-'}
                          ${movement.amount.toLocaleString('es-CO')}
                        </Typography>
                      </TableCell>
                      <TableCell>{movement.created_by}</TableCell>
                    </TableRow>
                  ))}
                  {registerStatus.movements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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
            type="number"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
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
            type="number"
            value={closingAmount}
            onChange={(e) => setClosingAmount(e.target.value)}
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
                type="number"
                value={movement.amount}
                onChange={(e) => setMovement({ ...movement, amount: e.target.value })}
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
    </Box>
  );
};

export default CashRegister;
