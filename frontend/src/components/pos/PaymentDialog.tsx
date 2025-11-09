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
  Divider,
  FormControl,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  InputAdornment,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from '@mui/material';
import {
  Payment as PaymentIcon,
  CreditCard as CardIcon,
  AccountBalance as BankIcon,
  QrCode as QRIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { PaymentMethod, Customer } from '../../types/models';

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  total: number;
  paymentMethods: PaymentMethod[];
  onConfirm: (paymentData: any) => void;
  customer: Customer | null;
  orderItems?: any[]; // For split payment allocation
  needsElectronicInvoice?: boolean; // Flag from POS
  defaultPrintReceipt?: boolean; // Default value for print receipt checkbox from printer config
}

interface PaymentLine {
  payment_method_id: number;
  payment_method_name: string;
  amount: number;
  reference?: string;
  allocated_items?: number[]; // IDs of order items allocated to this payment
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  open,
  onClose,
  total,
  paymentMethods,
  onConfirm,
  customer,
  needsElectronicInvoice = false,
  defaultPrintReceipt = true,
}) => {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [printReceipt, setPrintReceipt] = useState(defaultPrintReceipt);
  const [sendByEmail, setSendByEmail] = useState(true); // Default to true - send invoice email by default
  const [customerEmail, setCustomerEmail] = useState(customer?.email || '');
  const [error, setError] = useState('');
  const [change, setChange] = useState(0);

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setPaymentLines([]);
      setSelectedMethod(null);
      setAmount('');
      setReference('');
      setPrintReceipt(defaultPrintReceipt);
      setSendByEmail(true);
      setCustomerEmail(customer?.email || '');
      setError('');
      setChange(0);
    }
  }, [open, customer?.email, defaultPrintReceipt]);

  useEffect(() => {
    // Set initial amount to remaining balance
    const totalPaid = paymentLines.reduce((sum, line) => sum + line.amount, 0);
    const remaining = total - totalPaid;
    if (remaining > 0) {
      setAmount(remaining.toFixed(0));
    } else {
      setAmount('');
    }
    setChange(totalPaid > total ? totalPaid - total : 0);
  }, [paymentLines, total]);

  const addPaymentLine = () => {
    if (!selectedMethod) {
      setError('Seleccione un método de pago');
      return;
    }

    let paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setError('Ingrese un monto válido');
      return;
    }

    const method = paymentMethods.find(m => m.id === selectedMethod);
    if (!method) return;

    // Check if requires reference
    if (method.requires_reference && !reference.trim()) {
      setError('Este método de pago requiere una referencia');
      return;
    }

    // IMPORTANT: Automatically cap payment at remaining balance
    // The change is calculated and displayed, but NEVER recorded in the database
    const totalPaidSoFar = paymentLines.reduce((sum, line) => sum + line.amount, 0);
    const remainingBalance = total - totalPaidSoFar;

    // Calculate change if overpayment (for cash only)
    let cashChange = 0;
    if (paymentAmount > remainingBalance && method.type === 'cash') {
      cashChange = paymentAmount - remainingBalance;
      // Store the cash received for display purposes only
      const cashReceived = paymentAmount;
      // Cap the actual payment amount to remaining balance
      paymentAmount = remainingBalance;

      // Show info message about change (non-blocking)
      setError(`Efectivo recibido: $${cashReceived.toLocaleString('es-CO')} → Cambio a dar: $${cashChange.toLocaleString('es-CO')}`);
    } else if (paymentAmount > remainingBalance) {
      // For non-cash payments, just cap at remaining balance
      paymentAmount = remainingBalance;
    }

    const newLine: PaymentLine = {
      payment_method_id: selectedMethod,
      payment_method_name: method.name,
      amount: paymentAmount, // Always the exact amount, never more
      reference: reference.trim() || undefined,
    };

    setPaymentLines([...paymentLines, newLine]);
    setAmount('');
    setReference('');

    // Clear error after 3 seconds if it's a change message
    if (cashChange > 0) {
      setTimeout(() => setError(''), 3000);
    } else {
      setError('');
    }
  };

  const removePaymentLine = (index: number) => {
    setPaymentLines(paymentLines.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const totalPaid = paymentLines.reduce((sum, line) => sum + line.amount, 0);

    if (totalPaid < total) {
      setError(`Falta por pagar: $${(total - totalPaid).toLocaleString('es-CO')}`);
      return;
    }

    const paymentData = {
      payment_data: paymentLines.map(line => ({
        payment_method_id: line.payment_method_id,
        amount: line.amount,
        reference: line.reference,
      })),
      needsInvoice: needsElectronicInvoice,
      printReceipt,
      sendByEmail,
      customerEmail: sendByEmail ? customerEmail : undefined,
      change,
    };

    onConfirm(paymentData);
  };

  const handleQuickCash = () => {
    const cashMethod = paymentMethods.find(m => m.type === 'cash');
    if (!cashMethod) return;

    // Clear existing payment lines and add cash for full amount
    setPaymentLines([{
      payment_method_id: cashMethod.id!,
      payment_method_name: cashMethod.name,
      amount: total,
    }]);
  };

  const handleQuickCard = () => {
    const cardMethod = paymentMethods.find(m => m.type === 'card');
    if (!cardMethod) return;

    // Clear existing payment lines and add card for full amount
    setPaymentLines([{
      payment_method_id: cardMethod.id!,
      payment_method_name: cardMethod.name,
      amount: total,
      reference: 'POS Terminal',
    }]);
  };

  const totalPaid = paymentLines.reduce((sum, line) => sum + line.amount, 0);
  const remaining = total - totalPaid;
  const isComplete = remaining <= 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PaymentIcon />
          <Typography variant="h6">Procesar Pago</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="h5" color="primary">
            Total: ${total.toLocaleString('es-CO')}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Payment Methods */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Método de Pago
            </Typography>

            {/* Quick buttons */}
            <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<PaymentIcon />}
                onClick={handleQuickCash}
                disabled={isComplete}
              >
                Efectivo Total
              </Button>
              <Button
                variant="contained"
                color="info"
                startIcon={<CardIcon />}
                onClick={handleQuickCard}
                disabled={isComplete}
              >
                Tarjeta Total
              </Button>
            </Box>

            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(parseInt(e.target.value))}
              >
                {paymentMethods.map(method => (
                  <FormControlLabel
                    key={method.id}
                    value={method.id}
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {method.type === 'cash' && <PaymentIcon />}
                        {method.type === 'card' && <CardIcon />}
                        {method.type === 'digital' && <QRIcon />}
                        {method.type === 'other' && <BankIcon />}
                        <Typography>{method.name}</Typography>
                      </Box>
                    }
                    disabled={isComplete}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            <Box sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Monto"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                disabled={!selectedMethod || isComplete}
                sx={{ mb: 2 }}
              />

              {selectedMethod && 
               paymentMethods.find(m => m.id === selectedMethod)?.requires_reference && (
                <TextField
                  fullWidth
                  label="Referencia / Número de Transacción"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  sx={{ mb: 2 }}
                />
              )}

              <Button
                fullWidth
                variant="contained"
                onClick={addPaymentLine}
                disabled={!selectedMethod || !amount || isComplete}
              >
                Agregar Pago
              </Button>
            </Box>
          </Grid>

          {/* Payment Summary */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Resumen de Pagos
            </Typography>

            <List>
              {paymentLines.map((line, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={line.payment_method_name}
                    secondary={line.reference}
                  />
                  <ListItemSecondaryAction>
                    <Typography variant="subtitle1" sx={{ mr: 1 }}>
                      ${line.amount.toLocaleString('es-CO')}
                    </Typography>
                    <IconButton 
                      edge="end" 
                      onClick={() => removePaymentLine(index)}
                      disabled={isComplete}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Total a Pagar:</Typography>
                <Typography fontWeight="bold">
                  ${total.toLocaleString('es-CO')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography>Total Pagado:</Typography>
                <Typography fontWeight="bold" color={isComplete ? 'success.main' : 'text.primary'}>
                  ${totalPaid.toLocaleString('es-CO')}
                </Typography>
              </Box>
              {remaining > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography color="error">Por Pagar:</Typography>
                  <Typography fontWeight="bold" color="error">
                    ${remaining.toLocaleString('es-CO')}
                  </Typography>
                </Box>
              )}
              {change > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography color="success.main">Cambio:</Typography>
                  <Typography variant="h6" color="success.main">
                    ${change.toLocaleString('es-CO')}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Invoice Options */}
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Opciones de Factura
              </Typography>

              {needsElectronicInvoice && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    Esta venta será facturada electrónicamente a través de DIAN
                  </Typography>
                </Alert>
              )}

              <FormControlLabel
                control={
                  <Checkbox
                    checked={printReceipt}
                    onChange={(e) => setPrintReceipt(e.target.checked)}
                  />
                }
                label="Imprimir Recibo"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={sendByEmail}
                    onChange={(e) => setSendByEmail(e.target.checked)}
                  />
                }
                label="Enviar por Email"
              />

              {sendByEmail && (
                <TextField
                  fullWidth
                  label="Email del Cliente"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  type="email"
                  sx={{ mt: 1 }}
                />
              )}
            </Box>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="error">
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          disabled={!isComplete}
          startIcon={<ReceiptIcon />}
        >
          Confirmar Pago
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentDialog;
