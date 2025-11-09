import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
} from '@mui/material';
import {
  DeliveryDining as DeliveryIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';

interface DeliveryInfoDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (deliveryInfo: DeliveryInfo) => void;
  initialData?: DeliveryInfo;
}

export interface DeliveryInfo {
  customerName: string;
  address: string;
  phone: string;
}

const DeliveryInfoDialog: React.FC<DeliveryInfoDialogProps> = ({
  open,
  onClose,
  onConfirm,
  initialData,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  // Reset state when dialog opens or initialData changes
  useEffect(() => {
    if (open) {
      setCustomerName(initialData?.customerName || '');
      setAddress(initialData?.address || '');
      setPhone(initialData?.phone || '');
    }
  }, [open, initialData]);

  const handleConfirm = () => {
    onConfirm({
      customerName: customerName.trim(),
      address: address.trim(),
      phone: phone.trim(),
    });
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DeliveryIcon color="primary" />
          <Typography variant="h6">Información de Domicilio</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nombre del Cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre completo del cliente (opcional)"
                InputProps={{
                  startAdornment: (
                    <PersonIcon sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                }}
                helperText="Campo opcional"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Dirección de Entrega"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Dirección completa de entrega (opcional)"
                multiline
                rows={2}
                InputProps={{
                  startAdornment: (
                    <LocationIcon sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                }}
                helperText="Campo opcional"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Teléfono de Contacto"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Número de teléfono (opcional)"
                type="tel"
                InputProps={{
                  startAdornment: (
                    <PhoneIcon sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                }}
                helperText="Campo opcional"
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.lighter', borderRadius: 1 }}>
            <Typography variant="body2" color="info.dark">
              Todos los campos son opcionales. Esta información aparecerá en el recibo impreso.
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel} color="inherit">
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          startIcon={<DeliveryIcon />}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeliveryInfoDialog;
