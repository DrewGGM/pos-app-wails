import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  CircularProgress,
  Button,
  LinearProgress,
} from '@mui/material';
import {
  CreditCard as CreditCardIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

interface BoldPaymentWaitingProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (integrationId: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  paymentAmount: number;
  integrationId?: string;
}

const BoldPaymentWaiting: React.FC<BoldPaymentWaitingProps> = ({
  open,
  onClose,
  onSuccess,
  onError,
  onCancel,
  paymentAmount,
  integrationId,
}) => {
  const [status, setStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [message, setMessage] = useState('Procesando pago en datáfono Bold...');
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Simulate progress bar (visual feedback only)
  useEffect(() => {
    if (!open || status !== 'waiting') return;

    const interval = setInterval(() => {
      setProgress(prev => {
        // Progress slows down as it approaches 90%
        if (prev < 30) return prev + 3;
        if (prev < 60) return prev + 2;
        if (prev < 85) return prev + 0.5;
        return prev; // Stop at 85% until we get actual confirmation
      });
    }, 500);

    return () => clearInterval(interval);
  }, [open, status]);

  // Track elapsed time
  useEffect(() => {
    if (!open || status !== 'waiting') return;

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [open, status]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStatus('waiting');
      setMessage('Procesando pago en datáfono Bold...');
      setProgress(0);
      setElapsedTime(0);
    }
  }, [open]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = () => {
    setStatus('error');
    setMessage('Pago cancelado por el usuario');
    onCancel();
  };

  return (
    <Dialog
      open={open}
      onClose={() => {}} // Prevent closing by clicking outside
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: 'hidden',
        }
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box
          sx={{
            background: status === 'waiting'
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : status === 'success'
              ? 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
              : 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
            color: 'white',
            p: 4,
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <Box sx={{ mb: 3 }}>
            {status === 'waiting' && (
              <CircularProgress
                size={80}
                thickness={3}
                sx={{
                  color: 'white',
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
                }}
              />
            )}
            {status === 'success' && (
              <CheckCircleIcon
                sx={{
                  fontSize: 80,
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
                }}
              />
            )}
            {status === 'error' && (
              <ErrorIcon
                sx={{
                  fontSize: 80,
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
                }}
              />
            )}
          </Box>

          {/* Amount */}
          <Typography variant="h3" fontWeight="700" sx={{ mb: 2 }}>
            ${paymentAmount.toLocaleString('es-CO')}
          </Typography>

          {/* Message */}
          <Typography variant="h6" sx={{ mb: 1, opacity: 0.9 }}>
            {message}
          </Typography>

          {/* Integration ID */}
          {integrationId && (
            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 2 }}>
              ID: {integrationId}
            </Typography>
          )}

          {/* Elapsed time */}
          {status === 'waiting' && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Tiempo transcurrido: {formatTime(elapsedTime)}
            </Typography>
          )}
        </Box>

        {/* Progress bar */}
        {status === 'waiting' && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              backgroundColor: 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'primary.main',
              }
            }}
          />
        )}

        {/* Instructions */}
        <Box sx={{ p: 3, backgroundColor: 'background.default' }}>
          {status === 'waiting' && (
            <>
              <Typography variant="body1" gutterBottom align="center" sx={{ mb: 2 }}>
                <CreditCardIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Por favor, completa la transacción en el datáfono Bold
              </Typography>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  • El cliente debe presentar su tarjeta o método de pago
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  • Sigue las instrucciones en el datáfono
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  • El sistema se actualizará automáticamente al confirmar el pago
                </Typography>

                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleCancel}
                  startIcon={<CancelIcon />}
                  sx={{ mt: 1 }}
                >
                  Cancelar Transacción
                </Button>
              </Box>
            </>
          )}

          {status === 'success' && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body1" color="success.main" gutterBottom>
                ¡Pago procesado exitosamente!
              </Typography>
              <Button
                variant="contained"
                color="success"
                onClick={onClose}
                sx={{ mt: 2 }}
              >
                Continuar
              </Button>
            </Box>
          )}

          {status === 'error' && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body1" color="error" gutterBottom>
                {message}
              </Typography>
              <Button
                variant="contained"
                color="error"
                onClick={onClose}
                sx={{ mt: 2 }}
              >
                Cerrar
              </Button>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default BoldPaymentWaiting;
