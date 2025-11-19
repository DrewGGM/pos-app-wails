import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Grid,
  IconButton,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Avatar,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
  Person as PersonIcon,
  Pin as PinIcon,
  Restaurant as RestaurantIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { toast } from 'react-toastify';
import { wailsConfigService } from '../../services/wailsConfigService';

type LoginMode = 'credentials' | 'pin';

interface RestaurantConfig {
  name?: string;
  logo?: string;
  business_name?: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithPIN, isAuthenticated, cashRegisterId } = useAuth();
  const [mode, setMode] = useState<LoginMode>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig | null>(null);

  // Credentials mode
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIN mode
  const [pin, setPin] = useState('');

  // PIN pad layout (constant)
  const pinPad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  // Load restaurant configuration
  useEffect(() => {
    const loadRestaurantConfig = async () => {
      try {
        const config = await wailsConfigService.getRestaurantConfig();
        if (config) {
          setRestaurantConfig(config);
        }
      } catch (error) {
      }
    };
    loadRestaurantConfig();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // Si no hay caja abierta, redirigir a caja registradora
      if (!cashRegisterId) {
        navigate('/cash-register');
      } else {
        navigate('/dashboard');
      }
    }
  }, [isAuthenticated, cashRegisterId, navigate]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setError('Por favor ingrese usuario y contraseña');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(username, password);
      toast.success('Inicio de sesión exitoso');
      // La redirección se maneja en el useEffect basado en cashRegisterId
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      toast.error('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async () => {
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await loginWithPIN(pin);
      toast.success('Inicio de sesión exitoso');
      // La redirección se maneja en el useEffect basado en cashRegisterId
    } catch (err: any) {
      setError(err.message || 'PIN incorrecto');
      toast.error('PIN incorrecto');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinPadClick = (value: string) => {
    if (value === 'C') {
      setPin('');
      setError('');
    } else if (value === '⌫') {
      setPin(pin.slice(0, -1));
    } else if (pin.length < 6) {
      setPin(pin + value);
    }
    
    // Auto-submit when 4 digits
    if (pin.length === 3 && value !== 'C' && value !== '⌫') {
      setTimeout(() => {
        handlePinLogin();
      }, 100);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Card sx={{ maxWidth: 450, width: '100%', boxShadow: 3 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo and Title */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            {restaurantConfig?.logo ? (
              <Avatar
                src={restaurantConfig.logo}
                alt={restaurantConfig.name || 'Restaurant'}
                sx={{
                  width: 100,
                  height: 100,
                  mx: 'auto',
                  mb: 2,
                  border: '2px solid',
                  borderColor: 'primary.main',
                }}
              />
            ) : (
              <RestaurantIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
            )}
            <Typography variant="h4" component="h1" gutterBottom>
              {restaurantConfig?.name || restaurantConfig?.business_name || 'Restaurant POS'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sistema de Punto de Venta
            </Typography>
          </Box>

          {/* Login Mode Selector */}
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, value) => value && setMode(value)}
            fullWidth
            sx={{ mb: 3 }}
          >
            <ToggleButton value="credentials">
              <PersonIcon sx={{ mr: 1 }} />
              Usuario
            </ToggleButton>
            <ToggleButton value="pin">
              <PinIcon sx={{ mr: 1 }} />
              PIN Rápido
            </ToggleButton>
          </ToggleButtonGroup>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Credentials Login */}
          {mode === 'credentials' && (
            <form onSubmit={handleCredentialsLogin}>
              <TextField
                fullWidth
                label="Usuario"
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
                autoFocus
                disabled={loading}
              />

              <TextField
                fullWidth
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 3 }}
                disabled={loading}
              />

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mb: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Iniciar Sesión'}
              </Button>
            </form>
          )}

          {/* PIN Login */}
          {mode === 'pin' && (
            <>
              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="PIN"
                  type="password"
                  variant="outlined"
                  value={pin}
                  InputProps={{
                    readOnly: true,
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                  disabled={loading}
                />

                {/* PIN Pad */}
                <Grid container spacing={1}>
                  {pinPad.map((digit) => (
                    <Grid item xs={4} key={digit}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => handlePinPadClick(digit)}
                        sx={{
                          height: 60,
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                        }}
                        disabled={loading}
                      >
                        {digit}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handlePinLogin}
                disabled={loading || pin.length < 4}
              >
                {loading ? <CircularProgress size={24} /> : 'Ingresar'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
