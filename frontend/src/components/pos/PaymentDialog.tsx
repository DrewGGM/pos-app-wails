import React, { useState, useEffect, useRef } from 'react';
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
  Collapse,
} from '@mui/material';
import {
  Payment as PaymentIcon,
  CreditCard as CardIcon,
  AccountBalance as BankIcon,
  QrCode as QRIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Email as EmailIcon,
  CameraAlt as CameraIcon,
  FileUpload as UploadIcon,
  Close as CloseIcon,
  Image as ImageIcon,
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
  defaultConsumerEmail?: string; // Email for CONSUMIDOR FINAL when no customer is selected
}

interface PaymentLine {
  payment_method_id: number;
  payment_method_name: string;
  amount: number;
  reference?: string;
  voucher_image?: string; // Base64 encoded voucher image
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
  defaultConsumerEmail = '',
}) => {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [printReceipt, setPrintReceipt] = useState(defaultPrintReceipt);
  const [sendByEmail, setSendByEmail] = useState(true); // Default to true - send invoice email by default
  // Use customer email if available, otherwise use defaultConsumerEmail for CONSUMIDOR FINAL
  const [customerEmail, setCustomerEmail] = useState(customer?.email || defaultConsumerEmail || '');
  const [error, setError] = useState('');
  const [change, setChange] = useState(0);
  // Voucher image states
  const [voucherImage, setVoucherImage] = useState<string>('');
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset all state when dialog opens or total changes (for split payments)
  useEffect(() => {
    if (open) {
      setPaymentLines([]);
      setSelectedMethod(null);
      setAmount('');
      setReference('');
      setPrintReceipt(defaultPrintReceipt);
      setSendByEmail(true);
      // Use customer email if available, otherwise use defaultConsumerEmail for CONSUMIDOR FINAL
      setCustomerEmail(customer?.email || defaultConsumerEmail || '');
      setError('');
      setChange(0);
      setVoucherImage('');
      setCameraDialogOpen(false);
      stopCamera();
    }
  }, [open, total, customer?.email, defaultPrintReceipt, defaultConsumerEmail]);

  // Cleanup camera stream when dialog closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Camera functions
  const openCameraDialog = () => {
    setCameraDialogOpen(true);
  };

  const closeCameraDialog = () => {
    stopCamera();
    setCameraDialogOpen(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      setCameraStream(stream);
      // Set video source after a small delay to ensure ref is ready
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('No se pudo acceder a la cámara');
      closeCameraDialog();
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setVoucherImage(imageData);
      closeCameraDialog();
    }
  };

  // Start camera when dialog opens
  useEffect(() => {
    if (cameraDialogOpen) {
      startCamera();
    }
  }, [cameraDialogOpen]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setVoucherImage(result);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearVoucherImage = () => {
    setVoucherImage('');
  };

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
      voucher_image: voucherImage || undefined,
    };

    setPaymentLines([...paymentLines, newLine]);
    setAmount('');
    setReference('');
    setVoucherImage(''); // Clear voucher image after adding payment

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
        voucher_image: line.voucher_image,
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
                sx={{ mb: 1 }}
              />

              {/* Quick cash denomination buttons */}
              {selectedMethod &&
               paymentMethods.find(m => m.id === selectedMethod)?.type === 'cash' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Denominaciones (click para sumar):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {[100000, 50000, 20000, 10000, 5000, 2000, 1000, 500].map(value => (
                      <Button
                        key={value}
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const currentAmount = parseFloat(amount) || 0;
                          setAmount((currentAmount + value).toString());
                        }}
                        disabled={isComplete}
                        sx={{
                          minWidth: 'auto',
                          px: 1,
                          fontSize: '0.75rem',
                        }}
                      >
                        {value >= 1000 ? `${value / 1000}k` : value}
                      </Button>
                    ))}
                  </Box>
                </Box>
              )}

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

              {/* Voucher Image Section */}
              {selectedMethod &&
               paymentMethods.find(m => m.id === selectedMethod)?.requires_voucher && (
                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Comprobante de Pago (opcional)
                  </Typography>

                  {/* Camera/Upload buttons */}
                  {!voucherImage && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CameraIcon />}
                        onClick={openCameraDialog}
                      >
                        Cámara
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        component="label"
                      >
                        Subir
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                        />
                      </Button>
                    </Box>
                  )}

                  {/* Image preview */}
                  {voucherImage && (
                    <Box sx={{ position: 'relative' }}>
                      <img
                        src={voucherImage}
                        alt="Comprobante"
                        style={{ width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 4 }}
                      />
                      <IconButton
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          bgcolor: 'error.main',
                          color: 'white',
                          '&:hover': { bgcolor: 'error.dark' }
                        }}
                        onClick={clearVoucherImage}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>
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
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {line.payment_method_name}
                        {line.voucher_image && (
                          <ImageIcon fontSize="small" color="secondary" titleAccess="Tiene comprobante" />
                        )}
                      </Box>
                    }
                    secondary={line.reference}
                  />
                  <ListItemSecondaryAction>
                    <Typography variant="subtitle1" sx={{ mr: 1, display: 'inline' }}>
                      ${line.amount.toLocaleString('es-CO')}
                    </Typography>
                    <IconButton
                      edge="end"
                      onClick={() => removePaymentLine(index)}
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

      {/* Camera Capture Dialog - Larger for better visibility */}
      <Dialog
        open={cameraDialogOpen}
        onClose={closeCameraDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'black' }
        }}
      >
        <DialogTitle sx={{ bgcolor: 'black', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CameraIcon />
            <Typography>Capturar Comprobante</Typography>
          </Box>
          <IconButton onClick={closeCameraDialog} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'black', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ width: '100%', maxWidth: 640, position: 'relative' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '60vh',
                borderRadius: 8,
                backgroundColor: '#333'
              }}
            />
            {!cameraStream && (
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: 'white',
                textAlign: 'center'
              }}>
                <CameraIcon sx={{ fontSize: 48, mb: 1 }} />
                <Typography>Iniciando cámara...</Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'black', justifyContent: 'center', pb: 3 }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<CameraIcon />}
            onClick={capturePhoto}
            disabled={!cameraStream}
            sx={{ minWidth: 200 }}
          >
            Capturar Foto
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="large"
            onClick={closeCameraDialog}
            sx={{ minWidth: 120, borderColor: 'white', color: 'white' }}
          >
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default PaymentDialog;
