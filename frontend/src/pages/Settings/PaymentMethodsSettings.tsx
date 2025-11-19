import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Chip,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  CreditCard as CardIcon,
  AccountBalance as BankIcon,
  QrCode as QRIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { PaymentMethod } from '../../types/models';
import { wailsSalesService } from '../../services/wailsSalesService';

interface DIANPaymentMethod {
  id: number;
  name: string;
  code: string;
}

const PaymentMethodsSettings: React.FC = () => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [dianPaymentMethods, setDIANPaymentMethods] = useState<DIANPaymentMethod[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [formData, setFormData] = useState<Partial<PaymentMethod>>({
    name: '',
    type: 'cash',
    icon: '',
    requires_ref: false,
    dian_payment_method_id: undefined,
    affects_cash_register: true,
    show_in_cash_summary: true,
    show_in_reports: true,
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    loadPaymentMethods();
    loadDIANPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    try {
      // Import GetAllPaymentMethods to show both active and inactive payment methods
      const { GetAllPaymentMethods } = await import('../../../wailsjs/go/services/SalesService');
      const methods = await GetAllPaymentMethods();
      setPaymentMethods((methods || []) as unknown as PaymentMethod[]);
    } catch (error) {
      toast.error('Error al cargar métodos de pago');
    }
  };

  const loadDIANPaymentMethods = async () => {
    try {
      // Import the parametric service to get DIAN payment methods
      const { GetPaymentMethods } = await import('../../../wailsjs/go/services/ParametricService');
      const methods = await GetPaymentMethods();
      setDIANPaymentMethods(methods || []);
    } catch (error) {
    }
  };

  const handleOpenDialog = (method?: PaymentMethod) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        type: method.type,
        icon: method.icon || '',
        requires_ref: method.requires_ref || false,
        dian_payment_method_id: method.dian_payment_method_id,
        affects_cash_register: method.affects_cash_register !== false, // Default to true
        show_in_cash_summary: method.show_in_cash_summary !== false, // Default to true
        show_in_reports: method.show_in_reports !== false, // Default to true
        is_active: method.is_active,
        display_order: method.display_order || 0,
      });
    } else {
      setEditingMethod(null);
      setFormData({
        name: '',
        type: 'cash',
        icon: '',
        requires_ref: false,
        dian_payment_method_id: undefined,
        affects_cash_register: true,
        show_in_cash_summary: true,
        is_active: true,
        display_order: paymentMethods.length,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingMethod(null);
  };

  const handleSave = async () => {
    try {
      if (!formData.name?.trim()) {
        toast.error('El nombre es requerido');
        return;
      }

      const methodData: PaymentMethod = {
        ...formData,
        id: editingMethod?.id,
      } as PaymentMethod;

      if (editingMethod) {
        await wailsSalesService.UpdatePaymentMethod(methodData);
        toast.success('Método de pago actualizado');
      } else {
        await wailsSalesService.CreatePaymentMethod(methodData);
        toast.success('Método de pago creado');
      }

      handleCloseDialog();
      loadPaymentMethods();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar método de pago');
    }
  };

  const handleDelete = async (method: PaymentMethod) => {
    // Prevent deletion of system default payment methods
    if (method.is_system_default) {
      toast.error('No se puede eliminar un método de pago del sistema');
      return;
    }

    try {
      // Get the count of sales associated with this payment method
      const salesCount = await (window as any).go.services.SalesService.GetPaymentMethodSalesCount(method.id!);

      let confirmMessage = '¿Está seguro de eliminar este método de pago?';
      if (salesCount > 0) {
        confirmMessage = `¿Está seguro de eliminar este método de pago?\n\nEsto eliminará ${salesCount} venta${salesCount > 1 ? 's' : ''} asociada${salesCount > 1 ? 's' : ''} a este método de pago.\n\nEsta acción no se puede deshacer.`;
      }

      if (!window.confirm(confirmMessage)) {
        return;
      }

      await wailsSalesService.DeletePaymentMethod(method.id!);
      toast.success('Método de pago eliminado correctamente');
      loadPaymentMethods();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar método de pago');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cash':
        return <PaymentIcon />;
      case 'card':
        return <CardIcon />;
      case 'digital':
        return <QRIcon />;
      default:
        return <BankIcon />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'cash':
        return 'Efectivo';
      case 'card':
        return 'Tarjeta';
      case 'digital':
        return 'Digital';
      case 'check':
        return 'Cheque';
      default:
        return 'Otro';
    }
  };

  const getDIANMethodName = (id?: number) => {
    if (!id) return 'No configurado';
    const method = dianPaymentMethods.find((m) => m.id === id);
    return method ? `${method.name} (${method.code})` : `ID: ${id}`;
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">Métodos de Pago</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Agregar Método
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Requiere Ref.</TableCell>
                <TableCell>Afecta Caja</TableCell>
                <TableCell>DIAN</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentMethods
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((method) => (
                  <TableRow key={method.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getTypeIcon(method.type)}
                        {method.name}
                        {method.is_system_default && (
                          <Chip
                            label="Sistema"
                            size="small"
                            color="default"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{getTypeName(method.type)}</TableCell>
                    <TableCell>
                      {method.requires_ref ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {method.affects_cash_register !== false ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {getDIANMethodName(method.dian_payment_method_id)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={method.is_active ? 'Activo' : 'Inactivo'}
                        color={method.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(method)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(method)}
                        color="error"
                        disabled={method.is_system_default}
                        title={method.is_system_default ? 'No se puede eliminar un método de pago del sistema' : 'Eliminar'}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Dialog for Add/Edit */}
        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle>
            {editingMethod ? 'Editar Método de Pago' : 'Agregar Método de Pago'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nombre"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Tipo</InputLabel>
                  <Select
                    value={formData.type}
                    label="Tipo"
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  >
                    <MenuItem value="cash">Efectivo</MenuItem>
                    <MenuItem value="card">Tarjeta</MenuItem>
                    <MenuItem value="digital">Digital</MenuItem>
                    <MenuItem value="check">Cheque</MenuItem>
                    <MenuItem value="other">Otro</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Orden de visualización"
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({ ...formData, display_order: parseInt(e.target.value) })
                  }
                />
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Método de Pago DIAN (para facturación electrónica)</InputLabel>
                  <Select
                    value={formData.dian_payment_method_id || ''}
                    label="Método de Pago DIAN (para facturación electrónica)"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        dian_payment_method_id: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  >
                    <MenuItem value="">
                      <em>No configurado (usar inferencia automática)</em>
                    </MenuItem>
                    {dianPaymentMethods.map((method) => (
                      <MenuItem key={method.id} value={method.id}>
                        {method.name} ({method.code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.requires_ref || false}
                      onChange={(e) =>
                        setFormData({ ...formData, requires_ref: e.target.checked })
                      }
                    />
                  }
                  label="Requiere Referencia"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.affects_cash_register !== false}
                      onChange={(e) =>
                        setFormData({ ...formData, affects_cash_register: e.target.checked })
                      }
                    />
                  }
                  label="Afecta Cuadre de Caja"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.show_in_cash_summary !== false}
                      onChange={(e) =>
                        setFormData({ ...formData, show_in_cash_summary: e.target.checked })
                      }
                    />
                  }
                  label="Mostrar en Resumen de Ventas"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.show_in_reports !== false}
                      onChange={(e) =>
                        setFormData({ ...formData, show_in_reports: e.target.checked })
                      }
                    />
                  }
                  label="Mostrar en Reportes (Google Sheets)"
                />
              </Grid>

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_active !== false}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                  }
                  label="Activo"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancelar</Button>
            <Button onClick={handleSave} variant="contained" color="primary">
              {editingMethod ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodsSettings;
