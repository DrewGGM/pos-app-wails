import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  History as HistoryIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { wailsAuthService } from '../../services/wailsAuthService';

interface CashMovement {
  id: number;
  type: string;
  amount: number;
  reason: string;
  reference?: string;
  created_at: Date;
  created_by: string;
}

interface CashRegisterHistoryItem {
  id: number;
  employee_id: number;
  employee?: {
    id: number;
    name: string;
    email: string;
  };
  opening_amount: number;
  closing_amount: number;
  expected_amount: number;
  difference: number;
  status: string;
  opened_at: string;
  closed_at?: string;
  notes?: string;
  movements: CashMovement[];
  sales_summary?: {
    by_payment_method: { [key: string]: number };
    total: number;
    count: number;
  };
}

const CashRegisterHistory: React.FC = () => {
  const [history, setHistory] = useState<CashRegisterHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const registers = await wailsAuthService.getCashRegisterHistory(20, 0);

      // Use optimized backend endpoint for each register's sales summary
      // This uses SQL aggregation instead of loading 500+ sales
      const registersWithSummary = await Promise.all(
        registers.map(async (register: any) => {
          try {
            const summary = await wailsAuthService.getCashRegisterSalesSummary(register.id || 0, false);
            return {
              ...register,
              sales_summary: {
                by_payment_method: summary.by_payment_method || {},
                total: summary.total || 0,
                count: summary.count || 0,
              },
            };
          } catch {
            return {
              ...register,
              sales_summary: { by_payment_method: {}, total: 0, count: 0 },
            };
          }
        })
      );

      setHistory(registersWithSummary.filter((r: any) => r.status === 'closed'));
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccordionChange = (registerId: number) => {
    setExpandedId(expandedId === registerId ? null : registerId);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <HistoryIcon fontSize="large" color="primary" />
          <Typography variant="h4" component="h1">
            Historial de Cierres de Caja
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Registro completo de todos los cierres de caja realizados
        </Typography>
      </Box>

      {history.length === 0 ? (
        <Alert severity="info">
          No hay cierres de caja registrados
        </Alert>
      ) : (
        <Box>
          {history.map((register) => (
            <Accordion
              key={register.id}
              expanded={expandedId === register.id}
              onChange={() => handleAccordionChange(register.id)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {format(new Date(register.opened_at), 'dd/MM/yyyy HH:mm')}
                      {register.closed_at && ` - ${format(new Date(register.closed_at), 'dd/MM/yyyy HH:mm')}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {register.employee?.name || 'Usuario desconocido'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Efectivo esperado
                    </Typography>
                    <Typography variant="h6" color="primary">
                      ${(register.expected_amount || 0).toLocaleString('es-CO')}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="caption" color="text.secondary">
                      Diferencia
                    </Typography>
                    <Typography
                      variant="h6"
                      color={
                        (register.difference || 0) === 0
                          ? 'success.main'
                          : (register.difference || 0) > 0
                          ? 'primary'
                          : 'error.main'
                      }
                    >
                      ${(register.difference || 0).toLocaleString('es-CO')}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <Chip
                      label={`${register.sales_summary?.count || 0} ventas`}
                      color="primary"
                      variant="outlined"
                      size="small"
                    />
                  </Grid>
                </Grid>
              </AccordionSummary>

              <AccordionDetails>
                <Grid container spacing={3}>
                  {/* Left Column - Balance Summary */}
                  <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <MoneyIcon color="primary" />
                        <Typography variant="h6">Balance de Caja</Typography>
                      </Box>
                      <List>
                        <ListItem>
                          <ListItemText primary="Apertura" />
                          <ListItemSecondaryAction>
                            <Typography variant="body1">
                              ${register.opening_amount.toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>

                        {/* Desglose de ventas por método de pago */}
                        <ListItem>
                          <ListItemText
                            primary={<strong>Ventas que afectan caja</strong>}
                            secondary="Desglose por método de pago"
                          />
                        </ListItem>
                        {Object.entries(register.sales_summary?.by_payment_method || {}).map(([methodName, amount]) => (
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
                        {Object.keys(register.sales_summary?.by_payment_method || {}).length === 0 && (
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
                              +${register.movements
                                .filter((m: CashMovement) => m.type === 'in' && m.reference !== 'OPENING')
                                .reduce((sum: number, m: CashMovement) => sum + m.amount, 0)
                                .toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Gastos/Retiros" />
                          <ListItemSecondaryAction>
                            <Typography variant="body1" color="error.main">
                              -${register.movements
                                .filter((m: CashMovement) => m.type === 'out')
                                .reduce((sum: number, m: CashMovement) => sum + m.amount, 0)
                                .toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>
                        <Divider sx={{ my: 2 }} />
                        <ListItem>
                          <ListItemText primary={<strong>Efectivo Esperado</strong>} />
                          <ListItemSecondaryAction>
                            <Typography variant="h6" color="primary">
                              ${(register.expected_amount || 0).toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>
                        <ListItem>
                          <ListItemText primary={<strong>Efectivo Real (Cierre)</strong>} />
                          <ListItemSecondaryAction>
                            <Typography variant="h6">
                              ${(register.closing_amount || 0).toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>
                        <Divider sx={{ my: 2 }} />
                        <ListItem>
                          <ListItemText primary={<strong>Diferencia</strong>} />
                          <ListItemSecondaryAction>
                            <Typography
                              variant="h6"
                              fontWeight="bold"
                              color={
                                (register.difference || 0) === 0
                                  ? 'success.main'
                                  : (register.difference || 0) > 0
                                  ? 'primary'
                                  : 'error.main'
                              }
                            >
                              ${(register.difference || 0).toLocaleString('es-CO')}
                            </Typography>
                          </ListItemSecondaryAction>
                        </ListItem>
                      </List>

                      {register.notes && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Notas del Cierre:
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {register.notes}
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  </Grid>

                  {/* Right Column - Movements Table */}
                  <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom>
                        Movimientos de Caja
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Tipo</TableCell>
                              <TableCell>Razón</TableCell>
                              <TableCell align="right">Monto</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {register.movements
                              .filter((m: CashMovement) => m.reference !== 'OPENING')
                              .map((movement: CashMovement, index: number) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Chip
                                      label={movement.type === 'in' ? 'Ingreso' : 'Egreso'}
                                      color={movement.type === 'in' ? 'success' : 'error'}
                                      size="small"
                                    />
                                  </TableCell>
                                  <TableCell>{movement.reason}</TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{
                                      color: movement.type === 'in' ? 'success.main' : 'error.main',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    {movement.type === 'in' ? '+' : '-'}${movement.amount.toLocaleString('es-CO')}
                                  </TableCell>
                                </TableRow>
                              ))}
                            {register.movements.filter((m: CashMovement) => m.reference !== 'OPENING').length === 0 && (
                              <TableRow>
                                <TableCell colSpan={3} align="center">
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
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Container>
  );
};

export default CashRegisterHistory;
