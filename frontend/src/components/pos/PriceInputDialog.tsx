import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  Paper,
} from '@mui/material';
import {
  Backspace as BackspaceIcon,
  Clear as ClearIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

interface PriceInputDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (price: number) => void;
  productName: string;
  suggestedPrice?: number;
}

const PriceInputDialog: React.FC<PriceInputDialogProps> = ({
  open,
  onClose,
  onConfirm,
  productName,
  suggestedPrice = 0,
}) => {
  const [price, setPrice] = useState('');

  // Reset price when dialog opens
  React.useEffect(() => {
    if (open) {
      setPrice(suggestedPrice > 0 ? suggestedPrice.toString() : '');
    }
  }, [open, suggestedPrice]);

  const handleNumberClick = (num: string) => {
    // Prevent multiple decimal points
    if (num === '.' && price.includes('.')) return;

    // Limit to 2 decimal places
    if (price.includes('.')) {
      const decimalPart = price.split('.')[1];
      if (decimalPart && decimalPart.length >= 2) return;
    }

    setPrice(price + num);
  };

  const handleBackspace = () => {
    setPrice(price.slice(0, -1));
  };

  const handleClear = () => {
    setPrice('');
  };

  const handleConfirm = () => {
    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue <= 0) {
      return; // Don't allow invalid prices
    }
    onConfirm(priceValue);
    onClose();
  };

  const isValidPrice = price !== '' && parseFloat(price) > 0 && !isNaN(parseFloat(price));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box>
          <Typography variant="h6">Ingresar Precio</Typography>
          <Typography variant="body2" color="text.secondary">
            {productName}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            backgroundColor: 'primary.light',
            textAlign: 'center',
          }}
        >
          <Typography variant="h3" color="primary.dark">
            ${price || '0'}
          </Typography>
        </Paper>

        <Grid container spacing={1}>
          {/* Keypad numbers */}
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <Grid item xs={4} key={num}>
              <Button
                fullWidth
                variant="outlined"
                size="large"
                onClick={() => handleNumberClick(num)}
                sx={{ height: 60, fontSize: '1.5rem' }}
              >
                {num}
              </Button>
            </Grid>
          ))}

          {/* Decimal point */}
          <Grid item xs={4}>
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={() => handleNumberClick('.')}
              sx={{ height: 60, fontSize: '1.5rem' }}
              disabled={price.includes('.')}
            >
              .
            </Button>
          </Grid>

          {/* Zero */}
          <Grid item xs={4}>
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={() => handleNumberClick('0')}
              sx={{ height: 60, fontSize: '1.5rem' }}
            >
              0
            </Button>
          </Grid>

          {/* Backspace */}
          <Grid item xs={4}>
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={handleBackspace}
              sx={{ height: 60 }}
              disabled={price === ''}
            >
              <BackspaceIcon />
            </Button>
          </Grid>

          {/* Clear */}
          <Grid item xs={6}>
            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<ClearIcon />}
              onClick={handleClear}
              sx={{ height: 50 }}
              disabled={price === ''}
            >
              Limpiar
            </Button>
          </Grid>

          {/* Quick amounts */}
          <Grid item xs={6}>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => setPrice((suggestedPrice || 1000).toString())}
              sx={{ height: 50 }}
            >
              Precio Sugerido
            </Button>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="error" startIcon={<CloseIcon />}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          disabled={!isValidPrice}
          startIcon={<CheckIcon />}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PriceInputDialog;
