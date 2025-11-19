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
  FormControlLabel,
  Switch,
  Chip,
  Grid,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  Restaurant as RestaurantIcon,
  ShoppingBag as TakeoutIcon,
  DeliveryDining as DeliveryIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

// Import the generated Wails bindings
import {
  GetAllOrderTypes,
  GetActiveOrderTypes,
  CreateOrderType,
  UpdateOrderType,
  DeleteOrderType,
} from '../../../wailsjs/go/services/OrderTypeService';
import { GetPaymentMethods } from '../../../wailsjs/go/services/SalesService';
import { models } from '../../../wailsjs/go/models';

type OrderType = models.OrderType;
type PaymentMethod = models.PaymentMethod;

const OrderTypesSettings: React.FC = () => {
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingType, setEditingType] = useState<OrderType | null>(null);
  const [formData, setFormData] = useState<Partial<OrderType>>({
    code: '',
    name: '',
    requires_sequential_number: false,
    sequence_prefix: '',
    display_color: '#3B82F6',
    icon: 'shopping_bag',
    is_active: true,
    display_order: 0,
    skip_payment_dialog: false,
    default_payment_method_id: undefined,
    auto_print_receipt: true,
    hide_amount_in_reports: false,
  });

  useEffect(() => {
    loadOrderTypes();
    loadPaymentMethods();
  }, []);

  const loadOrderTypes = async () => {
    try {
      const types = await GetAllOrderTypes();
      setOrderTypes(types || []);
    } catch (error) {
      toast.error('Error al cargar tipos de pedido');
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const methods = await GetPaymentMethods();
      setPaymentMethods(methods || []);
    } catch (error) {
      toast.error('Error al cargar métodos de pago');
    }
  };

  const handleOpenDialog = (type?: OrderType) => {
    if (type) {
      setEditingType(type);
      setFormData({
        code: type.code,
        name: type.name,
        requires_sequential_number: type.requires_sequential_number || false,
        sequence_prefix: type.sequence_prefix || '',
        display_color: type.display_color || '#3B82F6',
        icon: type.icon || 'shopping_bag',
        is_active: type.is_active,
        display_order: type.display_order || 0,
        skip_payment_dialog: type.skip_payment_dialog || false,
        default_payment_method_id: type.default_payment_method_id || undefined,
        auto_print_receipt: type.auto_print_receipt !== false, // Default to true if not set
        hide_amount_in_reports: type.hide_amount_in_reports || false,
      });
    } else {
      setEditingType(null);
      setFormData({
        code: '',
        name: '',
        requires_sequential_number: false,
        sequence_prefix: '',
        display_color: '#3B82F6',
        icon: 'shopping_bag',
        is_active: true,
        display_order: orderTypes.length,
        skip_payment_dialog: false,
        default_payment_method_id: undefined,
        auto_print_receipt: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingType(null);
  };

  const handleSave = async () => {
    try {
      if (!formData.code?.trim() || !formData.name?.trim()) {
        toast.error('El código y nombre son requeridos');
        return;
      }

      // Validate payment settings
      if (formData.skip_payment_dialog && !formData.default_payment_method_id) {
        toast.error('Debe seleccionar un método de pago por defecto');
        return;
      }

      // Create OrderType instance
      const typeData: any = {
        id: editingType?.id || 0,
        code: formData.code || '',
        name: formData.name || '',
        requires_sequential_number: formData.requires_sequential_number || false,
        sequence_prefix: formData.sequence_prefix || '',
        display_color: formData.display_color || '#3B82F6',
        icon: formData.icon || 'shopping_bag',
        is_active: formData.is_active !== undefined ? formData.is_active : true,
        display_order: formData.display_order || 0,
        skip_payment_dialog: formData.skip_payment_dialog || false,
        default_payment_method_id: formData.default_payment_method_id || undefined,
        auto_print_receipt: formData.auto_print_receipt !== false, // Default to true
        hide_amount_in_reports: formData.hide_amount_in_reports || false,
      };

      // Only include timestamps when editing (GORM will auto-set them when creating)
      if (editingType) {
        typeData.created_at = editingType.created_at;
        typeData.updated_at = editingType.updated_at;
        if (editingType.deleted_at) {
          typeData.deleted_at = editingType.deleted_at;
        }
      }

      if (editingType) {
        await UpdateOrderType(typeData);
        toast.success('Tipo de pedido actualizado');
      } else {
        await CreateOrderType(typeData);
        toast.success('Tipo de pedido creado');
      }

      handleCloseDialog();
      loadOrderTypes();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar tipo de pedido');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este tipo de pedido?')) {
      return;
    }

    try {
      await DeleteOrderType(id);
      toast.success('Tipo de pedido eliminado');
      loadOrderTypes();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar tipo de pedido');
    }
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'restaurant':
        return <RestaurantIcon />;
      case 'shopping_bag':
        return <TakeoutIcon />;
      case 'delivery_dining':
        return <DeliveryIcon />;
      default:
        return <TakeoutIcon />;
    }
  };

  const commonIcons = [
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'shopping_bag', label: 'Shopping Bag' },
    { value: 'delivery_dining', label: 'Delivery' },
    { value: 'local_cafe', label: 'Cafe' },
    { value: 'fastfood', label: 'Fast Food' },
    { value: 'phone_android', label: 'Mobile' },
    { value: 'computer', label: 'Computer' },
  ];

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">Tipos de Pedido</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Agregar Tipo
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Orden</TableCell>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Color</TableCell>
                <TableCell>Numeración</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orderTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>
                    <IconButton size="small" disabled>
                      <DragIcon />
                    </IconButton>
                    {type.display_order}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={type.code}
                      size="small"
                      sx={{ bgcolor: type.display_color, color: 'white' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getIconComponent(type.icon)}
                      <Typography>{type.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1,
                        bgcolor: type.display_color,
                        border: '1px solid #ddd',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {type.requires_sequential_number ? (
                      <Chip
                        label={type.sequence_prefix ? `Con prefijo: ${type.sequence_prefix}` : 'Sí'}
                        size="small"
                        color="primary"
                      />
                    ) : (
                      <Chip label="No" size="small" />
                    )}
                  </TableCell>
                  <TableCell>
                    {type.is_active ? (
                      <Chip
                        icon={<ActiveIcon />}
                        label="Activo"
                        size="small"
                        color="success"
                      />
                    ) : (
                      <Chip
                        icon={<InactiveIcon />}
                        label="Inactivo"
                        size="small"
                        color="default"
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(type)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => type.id && handleDelete(type.id)}
                      color="error"
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
            {editingType ? 'Editar Tipo de Pedido' : 'Nuevo Tipo de Pedido'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Código"
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  helperText="Identificador único (ej: dine-in, takeout, delivery)"
                  disabled={!!editingType} // Don't allow changing code when editing
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nombre"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  helperText="Nombre visible para el usuario"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Color"
                  type="color"
                  value={formData.display_color || '#3B82F6'}
                  onChange={(e) => setFormData({ ...formData, display_color: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  label="Icono"
                  value={formData.icon || 'shopping_bag'}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  SelectProps={{ native: true }}
                >
                  {commonIcons.map((icon) => (
                    <option key={icon.value} value={icon.value}>
                      {icon.label}
                    </option>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.requires_sequential_number || false}
                      onChange={(e) =>
                        setFormData({ ...formData, requires_sequential_number: e.target.checked })
                      }
                    />
                  }
                  label="Requiere numeración secuencial"
                />
              </Grid>

              {formData.requires_sequential_number && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Prefijo de secuencia (opcional)"
                    value={formData.sequence_prefix || ''}
                    onChange={(e) => setFormData({ ...formData, sequence_prefix: e.target.value })}
                    helperText="Ej: D- para Domicilios"
                    placeholder="D-"
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Orden de visualización"
                  type="number"
                  value={formData.display_order || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                  }
                  helperText="Menor número aparece primero"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
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

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.skip_payment_dialog || false}
                      onChange={(e) => setFormData({ ...formData, skip_payment_dialog: e.target.checked })}
                    />
                  }
                  label="Procesar pago automáticamente (sin diálogo)"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
                  Si se activa, el pedido se guardará directamente como venta pagada con el método de pago por defecto
                </Typography>
              </Grid>

              {formData.skip_payment_dialog && (
                <>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      select
                      label="Método de pago por defecto"
                      value={formData.default_payment_method_id || ''}
                      onChange={(e) => setFormData({ ...formData, default_payment_method_id: e.target.value ? parseInt(e.target.value) : undefined })}
                      SelectProps={{ native: true }}
                      required
                    >
                      <option value="">Seleccione un método de pago</option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.auto_print_receipt !== false}
                          onChange={(e) => setFormData({ ...formData, auto_print_receipt: e.target.checked })}
                        />
                      }
                      label="Imprimir recibo automáticamente"
                    />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
                      Si se activa, se imprimirá el recibo automáticamente al procesar el pago
                    </Typography>
                  </Grid>
                </>
              )}

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.hide_amount_in_reports || false}
                      onChange={(e) => setFormData({ ...formData, hide_amount_in_reports: e.target.checked })}
                    />
                  }
                  label="Ocultar monto en reportes"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
                  Si se activa, los reportes solo mostrarán productos y cantidades, pero no los montos de venta para este tipo de pedido
                </Typography>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancelar</Button>
            <Button onClick={handleSave} variant="contained">
              Guardar
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default OrderTypesSettings;
