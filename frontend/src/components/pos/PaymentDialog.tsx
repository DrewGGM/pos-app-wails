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
import BoldPaymentWaiting from './BoldPaymentWaiting';
import { wailsBoldService } from '../../services/wailsBoldService';
import { models } from '../../../wailsjs/go/models';
import { useWebSocket } from '../../hooks/useWebSocket';

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
  // Bold payment states
  const [boldPaymentWaiting, setBoldPaymentWaiting] = useState(false);
  const [boldIntegrationId, setBoldIntegrationId] = useState<string>('');
  const [boldConfig, setBoldConfig] = useState<models.BoldConfig | null>(null);
  const [boldCurrentMethod, setBoldCurrentMethod] = useState<PaymentMethod | null>(null);
  const [boldCurrentAmount, setBoldCurrentAmount] = useState<number>(0);

  // WebSocket for real-time Bold payment updates
  const { subscribe } = useWebSocket();

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
      setBoldPaymentWaiting(false);
      setBoldIntegrationId('');
    }
  }, [open, total, customer?.email, defaultPrintReceipt, defaultConsumerEmail]);

  // Load Bold configuration when dialog opens
  useEffect(() => {
    const loadBoldConfig = async () => {
      try {
        const config = await wailsBoldService.getBoldConfig();
        setBoldConfig(config);
      } catch (error) {
        console.error('Error loading Bold config:', error);
      }
    };

    if (open) {
      loadBoldConfig();
    }
  }, [open]);

  // Subscribe to WebSocket events for Bold payment updates
  useEffect(() => {
    if (!boldIntegrationId) {
      console.log('⚠️ No boldIntegrationId, skipping WebSocket subscription');
      return; // No active Bold payment, nothing to listen for
    }

    console.log(`🔌 Subscribing to WebSocket events for Bold payment: ${boldIntegrationId}`);
    console.log(`   Waiting for event type: "bold_payment_update"`);

    // Subscribe to "bold_payment_update" events from server
    const unsubscribe = subscribe('bold_payment_update', async (data: any) => {
      console.log('📡 WebSocket event received!');
      console.log('   Event data:', JSON.stringify(data, null, 2));
      console.log('   Current integration_id:', boldIntegrationId);
      console.log('   Event integration_id:', data.integration_id);

      // Check if this event is for our current payment
      if (data.integration_id === boldIntegrationId) {
        console.log(`✅ WebSocket: Payment update MATCHED! Status: ${data.status}`);

        if (data.status === 'approved') {
          // Payment approved via WebSocket - clear polling and process
          console.log('🎉 WebSocket: Payment approved! Processing immediately...');

          // Clear polling interval
          if ((window as any)._boldPollingInterval) {
            clearInterval((window as any)._boldPollingInterval);
            (window as any)._boldPollingInterval = null;
          }

          // Fetch full payment details and complete
          try {
            const pendingPayment = await wailsBoldService.getPendingPayment(boldIntegrationId);
            await handleBoldPaymentSuccess(boldIntegrationId, pendingPayment);
          } catch (error) {
            console.error('Error fetching pending payment after WebSocket event:', error);
            // Fallback: call without payment details
            await handleBoldPaymentSuccess(boldIntegrationId);
          }
        } else if (data.status === 'rejected') {
          console.log('❌ WebSocket: Payment rejected');

          // Clear polling interval
          if ((window as any)._boldPollingInterval) {
            clearInterval((window as any)._boldPollingInterval);
            (window as any)._boldPollingInterval = null;
          }

          handleBoldPaymentError('Pago rechazado por Bold');
        } else if (data.status === 'voided') {
          console.log('↩️  WebSocket: Payment voided');

          // Clear polling interval
          if ((window as any)._boldPollingInterval) {
            clearInterval((window as any)._boldPollingInterval);
            (window as any)._boldPollingInterval = null;
          }

          handleBoldPaymentError('Pago anulado');
        }
      } else {
        console.log(`ℹ️  WebSocket: Event is for different payment (${data.integration_id}), ignoring`);
      }
    });

    // Cleanup subscription when component unmounts or boldIntegrationId changes
    return () => {
      console.log(`🔌 Unsubscribing from WebSocket events for: ${boldIntegrationId}`);
      unsubscribe();
    };
  }, [boldIntegrationId, subscribe]);

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

  const addPaymentLine = async () => {
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
    const totalPaidSoFar = paymentLines.reduce((sum, line) => sum + line.amount, 0);
    const remainingBalance = total - totalPaidSoFar;

    // Calculate change if overpayment (for cash only)
    let cashChange = 0;
    if (paymentAmount > remainingBalance && method.type === 'cash') {
      cashChange = paymentAmount - remainingBalance;
      const cashReceived = paymentAmount;
      paymentAmount = remainingBalance;
      setError(`Efectivo recibido: $${cashReceived.toLocaleString('es-CO')} → Cambio a dar: $${cashChange.toLocaleString('es-CO')}`);
    } else if (paymentAmount > remainingBalance) {
      paymentAmount = remainingBalance;
    }

    // Check if this payment method uses Bold terminal
    if (method.use_bold_terminal) {
      await processBoldPayment(method, paymentAmount);
      return;
    }

    // Normal payment processing (non-Bold)
    const newLine: PaymentLine = {
      payment_method_id: selectedMethod,
      payment_method_name: method.name,
      amount: paymentAmount,
      reference: reference.trim() || undefined,
      voucher_image: voucherImage || undefined,
    };

    setPaymentLines([...paymentLines, newLine]);
    setAmount('');
    setReference('');
    setVoucherImage('');

    if (cashChange > 0) {
      setTimeout(() => setError(''), 3000);
    } else {
      setError('');
    }
  };

  const processBoldPayment = async (method: PaymentMethod, paymentAmount: number) => {
    try {
      // Validate Bold configuration
      if (!boldConfig || !boldConfig.enabled) {
        setError('La integración con Bold no está habilitada. Configure Bold en Configuración → Bold');
        return;
      }

      if (!method.bold_payment_method) {
        setError(`El método de pago "${method.name}" no tiene configurado el tipo de pago Bold`);
        return;
      }

      // Get default terminal
      const terminals = await wailsBoldService.getAllTerminals();
      const defaultTerminal = terminals.find(t => t.is_default) || terminals[0];

      if (!defaultTerminal) {
        setError('No hay terminales Bold configurados. Configure al menos un terminal en Configuración → Bold → Terminales');
        return;
      }

      // Create Bold payment request
      const boldRequest: models.BoldPaymentRequest = models.BoldPaymentRequest.createFrom({
        amount: {
          currency: 'COP',
          taxes: [
            {
              type: 'IVA_19',
            }
          ],
          tip_amount: 0,
          total_amount: paymentAmount,
        },
        payment_method: method.bold_payment_method,
        terminal_model: defaultTerminal.terminal_model,
        terminal_serial: defaultTerminal.terminal_serial,
        reference: `POS-${Date.now()}`,
        user_email: boldConfig.user_email || 'pos@restaurant.com',
        description: `Pago ${method.name}`,
        payer: customer ? {
          email: customer.email || undefined,
          phone_number: customer.phone || undefined,
          document: customer.document_number ? {
            document_type: 'CEDULA',
            document_number: customer.document_number,
          } : undefined,
        } : undefined,
      });

      // Send payment to Bold API
      const response = await wailsBoldService.createPayment(boldRequest);

      if (!response || !response.payload || !response.payload.integration_id) {
        throw new Error('Respuesta inválida de Bold API');
      }

      const integrationId = response.payload.integration_id;

      // Create pending payment record in database
      // This is CRITICAL so the webhook can find and update it when Bold sends the result
      const pendingPayment = models.BoldPendingPayment.createFrom({
        integration_id: integrationId,
        reference: boldRequest.reference,
        amount: paymentAmount,
        status: 'pending',
        payment_method_id: method.id,
        payment_method_name: method.name,
        // Store context for completing the payment later
        order_id: 0, // Will be set when order is created
        customer_id: customer?.id || 0,
        employee_id: 0, // TODO: Get from session
        cash_register_id: 0, // TODO: Get from session
      });

      await wailsBoldService.createPendingPayment(pendingPayment);

      // Store current Bold payment context
      setBoldCurrentMethod(method);
      setBoldCurrentAmount(paymentAmount);

      // Show waiting dialog
      setBoldIntegrationId(integrationId);
      setBoldPaymentWaiting(true);

      console.log('Bold payment created and pending payment recorded:', response);

      // Start polling as FALLBACK (WebSocket is the primary mechanism)
      // Reduced frequency: every 10 seconds instead of 2 seconds
      const maxPolls = 30; // 5 minutes max (30 * 10 = 300 seconds)
      let pollCount = 0;

      const pollInterval = setInterval(async () => {
        try {
          pollCount++;

          console.log(`🔄 [FALLBACK] Polling Bold payment status (${pollCount}/${maxPolls})...`);

          // Check if we've exceeded max polls (timeout)
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            await wailsBoldService.cancelPendingPayment(integrationId);
            handleBoldPaymentError('Tiempo de espera excedido. Por favor, verifique el estado del pago en Bold.');
            return;
          }

          // Poll payment status - get fresh data from database
          const pendingPayment = await wailsBoldService.getPendingPayment(integrationId);

          console.log(`📊 [FALLBACK] Payment status: ${pendingPayment.status}`);

          if (pendingPayment.status === 'approved') {
            clearInterval(pollInterval);
            console.log('✅ [FALLBACK] Payment approved! Processing...');
            await handleBoldPaymentSuccess(integrationId, pendingPayment);
          } else if (pendingPayment.status === 'rejected') {
            clearInterval(pollInterval);
            console.log('❌ [FALLBACK] Payment rejected');
            handleBoldPaymentError('Pago rechazado por Bold');
          } else if (pendingPayment.status === 'cancelled') {
            clearInterval(pollInterval);
            console.log('🚫 [FALLBACK] Payment cancelled');
            handleBoldPaymentError('Pago cancelado');
          }
        } catch (error) {
          console.error('❌ Error polling payment status:', error);
          // Don't stop polling on error, just log it
        }
      }, 10000); // 10 seconds - WebSocket should handle updates in real-time

      // Store interval ID for cleanup (you might want to add state for this)
      (window as any)._boldPollingInterval = pollInterval;

    } catch (error: any) {
      console.error('Error processing Bold payment:', error);
      setError(error?.message || 'Error al procesar el pago con Bold');
      setBoldPaymentWaiting(false);
    }
  };

  const handleBoldPaymentSuccess = async (integrationId: string, pendingPayment?: models.BoldPendingPayment) => {
    // Clear polling interval
    if ((window as any)._boldPollingInterval) {
      clearInterval((window as any)._boldPollingInterval);
      (window as any)._boldPollingInterval = null;
    }

    if (!boldCurrentMethod) return;

    // Get full payment details if not provided
    if (!pendingPayment) {
      try {
        pendingPayment = await wailsBoldService.getPendingPayment(integrationId);
      } catch (error) {
        console.error('Error getting pending payment details:', error);
      }
    }

    // Build reference with Bold transaction info
    let reference = `Bold-${integrationId}`;
    if (pendingPayment?.bold_code) {
      reference += ` | Código: ${pendingPayment.bold_code}`;
    }
    if (pendingPayment?.approval_number) {
      reference += ` | Aprob: ${pendingPayment.approval_number}`;
    }
    if (pendingPayment?.card_brand && pendingPayment?.card_masked_pan) {
      reference += ` | ${pendingPayment.card_brand} ${pendingPayment.card_masked_pan}`;
    }

    // Add payment line with complete Bold info
    const newLine: PaymentLine = {
      payment_method_id: boldCurrentMethod.id!,
      payment_method_name: boldCurrentMethod.name,
      amount: boldCurrentAmount,
      reference: reference,
    };

    console.log('✅ Bold payment approved - Adding payment line:', newLine);

    setPaymentLines([...paymentLines, newLine]);
    setAmount('');
    setReference('');
    setBoldPaymentWaiting(false);
    setBoldIntegrationId('');
    setBoldCurrentMethod(null);
    setBoldCurrentAmount(0);
  };

  const handleBoldPaymentError = (error: string) => {
    // Clear polling interval
    if ((window as any)._boldPollingInterval) {
      clearInterval((window as any)._boldPollingInterval);
      (window as any)._boldPollingInterval = null;
    }

    setError(error);
    setBoldPaymentWaiting(false);
    setBoldIntegrationId('');
    setBoldCurrentMethod(null);
    setBoldCurrentAmount(0);
  };

  const handleBoldPaymentCancel = async () => {
    // Clear polling interval
    if ((window as any)._boldPollingInterval) {
      clearInterval((window as any)._boldPollingInterval);
      (window as any)._boldPollingInterval = null;
    }

    // Cancel pending payment in backend
    if (boldIntegrationId) {
      try {
        await wailsBoldService.cancelPendingPayment(boldIntegrationId);
      } catch (error) {
        console.error('Error cancelling pending payment:', error);
      }
    }

    setBoldPaymentWaiting(false);
    setBoldIntegrationId('');
    setBoldCurrentMethod(null);
    setBoldCurrentAmount(0);
    setError('Pago con Bold cancelado');
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

      {/* Bold Payment Waiting Dialog */}
      <BoldPaymentWaiting
        open={boldPaymentWaiting}
        onClose={() => setBoldPaymentWaiting(false)}
        onSuccess={handleBoldPaymentSuccess}
        onError={handleBoldPaymentError}
        onCancel={handleBoldPaymentCancel}
        paymentAmount={parseFloat(amount) || 0}
        integrationId={boldIntegrationId}
      />
    </Dialog>
  );
};

export default PaymentDialog;
