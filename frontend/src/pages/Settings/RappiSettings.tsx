import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Card,
  CardContent,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  InputAdornment,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Smartphone as SmartphoneIcon,
  Restaurant as RestaurantIcon,
  CloudSync as CloudSyncIcon,
  VpnKey as VpnKeyIcon,
  Webhook as WebhookIcon,
  Schedule as ScheduleIcon,
  BarChart as BarChartIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Shield as ShieldIcon,
  Storage as StorageIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  wailsRappiService,
  RappiConfig,
  RappiConfigClass,
  TestConnectionResponse,
  ConnectionStatus
} from '../../services/wailsRappiService';

const RappiSettings: React.FC = () => {
  const [config, setConfig] = useState<RappiConfig | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);

  useEffect(() => {
    loadConfig();
    loadStatus();

    // Update status every 10 seconds
    const statusInterval = setInterval(() => {
      loadStatus();
    }, 10000);

    return () => clearInterval(statusInterval);
  }, []);

  const loadConfig = async () => {
    try {
      const data = await wailsRappiService.getConfig();
      setConfig(data);
    } catch (error: any) {
      toast.error('Error al cargar la configuración: ' + (error.message || error));
    } finally {
      setInitialLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const data = await wailsRappiService.getConnectionStatus();
      setStatus(data);
    } catch (error: any) {
      // Silent fail for status updates
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setLoading(true);
      await wailsRappiService.saveConfig(config);
      toast.success('✓ Configuración guardada correctamente');
      await loadConfig();
      await loadStatus();
    } catch (error: any) {
      toast.error('Error al guardar: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config) return;

    if (!config.client_id || !config.client_secret) {
      toast.error('Por favor complete Client ID y Client Secret');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const result = await wailsRappiService.testConnection(config);
      setTestResult(result);

      if (result.success) {
        toast.success(result.message);
        await loadConfig();
        await loadStatus();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      const errorMsg = error.message || error;
      toast.error('Error de conexión: ' + errorMsg);
      // Don't set test result on error, just show toast
      setTestResult(null);
    } finally {
      setTesting(false);
    }
  };

  const handleResetStats = async () => {
    if (!confirm('¿Está seguro de que desea resetear las estadísticas?')) {
      return;
    }

    try {
      await wailsRappiService.resetStatistics();
      toast.success('Estadísticas reseteadas');
      await loadStatus();
    } catch (error: any) {
      toast.error('Error al resetear estadísticas: ' + (error.message || error));
    }
  };

  const updateConfig = (field: keyof RappiConfig, value: any) => {
    if (!config) return;
    // Create a new instance to maintain the correct type
    const updated = Object.assign(Object.create(Object.getPrototypeOf(config)), config, { [field]: value });
    setConfig(updated);
  };

  const formatDate = (date?: any) => {
    if (!date) return 'Nunca';
    try {
      // Handle both string and Time object
      const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
      return dateObj.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Nunca';
    }
  };

  if (initialLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!config) {
    return (
      <Alert severity="error">
        Error al cargar la configuración de Rappi
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SmartphoneIcon />
        Configuración Rappi POS
      </Typography>

      <Typography variant="body2" color="text.secondary" paragraph>
        Configure la integración con Rappi para recibir pedidos automáticamente
      </Typography>

      {/* Connection Status Card */}
      {status && (
        <Card sx={{ mb: 3, bgcolor: status.is_configured ? 'success.50' : 'warning.50' }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <Stack direction="row" spacing={2} alignItems="center">
                  {status.has_valid_token ? (
                    <CheckCircleIcon color="success" fontSize="large" />
                  ) : (
                    <ErrorIcon color="error" fontSize="large" />
                  )}
                  <Box>
                    <Typography variant="h6">
                      {status.is_configured ? 'Configurado' : 'No Configurado'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Estado: {status.has_valid_token ? 'Conectado' : 'Desconectado'}
                      {status.is_enabled && ' (Activo)'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Ambiente</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {status.environment === 'production' ? 'Producción' : 'Desarrollo'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Tiendas</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {status.store_count}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Pedidos Recibidos</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {status.total_orders_received}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Pedidos Aceptados</Typography>
                    <Typography variant="body2" fontWeight="bold" color="success.main">
                      {status.total_orders_accepted}
                    </Typography>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Test Result Card */}
      {testResult && (
        <Alert
          severity={testResult.success ? 'success' : 'error'}
          sx={{ mb: 3 }}
          onClose={() => setTestResult(null)}
        >
          <Typography variant="body2" fontWeight="bold">
            {testResult.message}
          </Typography>
          {testResult.success && testResult.expires_at && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Token válido hasta: {formatDate(testResult.expires_at)}
            </Typography>
          )}
          {!testResult.success && testResult.error && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Error: {testResult.error}
            </Typography>
          )}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Basic Configuration */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SettingsIcon />
              Configuración Básica
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.is_enabled || false}
                    onChange={(e) => updateConfig('is_enabled', e.target.checked)}
                  />
                }
                label="Habilitar integración Rappi"
              />

              <FormControl fullWidth>
                <InputLabel>Ambiente</InputLabel>
                <Select
                  value={config.environment || 'development'}
                  label="Ambiente"
                  onChange={(e) => updateConfig('environment', e.target.value)}
                >
                  <MenuItem value="development">Desarrollo (Testing)</MenuItem>
                  <MenuItem value="production">Producción</MenuItem>
                </Select>
              </FormControl>

              <Alert severity="info" icon={<InfoIcon />}>
                <Typography variant="caption">
                  <strong>Desarrollo:</strong> api.dev.rappi.com<br />
                  <strong>Producción:</strong> api.col.rappi.com
                </Typography>
              </Alert>
            </Stack>
          </Paper>
        </Grid>

        {/* Authentication */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VpnKeyIcon />
              Autenticación
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Stack spacing={2}>
              <TextField
                label="Client ID"
                fullWidth
                value={config.client_id || ''}
                onChange={(e) => updateConfig('client_id', e.target.value)}
                placeholder="Tu client_id de Rappi"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ShieldIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Client Secret"
                fullWidth
                type={showClientSecret ? 'text' : 'password'}
                value={config.client_secret || ''}
                onChange={(e) => updateConfig('client_secret', e.target.value)}
                placeholder="Tu client_secret de Rappi"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ShieldIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowClientSecret(!showClientSecret)}
                        edge="end"
                      >
                        {showClientSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleTestConnection}
                disabled={testing || !config.client_id || !config.client_secret}
                startIcon={testing ? <CircularProgress size={20} /> : <SendIcon />}
              >
                {testing ? 'Probando Conexión...' : 'Probar Conexión'}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Store Configuration */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RestaurantIcon />
              Configuración de Tiendas
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Stack spacing={2}>
              <TextField
                label="Store IDs"
                fullWidth
                value={config.store_ids || ''}
                onChange={(e) => updateConfig('store_ids', e.target.value)}
                placeholder="store1, store2, store3"
                helperText="IDs de tiendas separados por comas"
                multiline
                rows={2}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <StorageIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Tiempo de Cocina por Defecto (minutos)"
                type="number"
                fullWidth
                value={config.default_cooking_time || 15}
                onChange={(e) => updateConfig('default_cooking_time', parseInt(e.target.value))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ScheduleIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={config.auto_accept_orders || false}
                    onChange={(e) => updateConfig('auto_accept_orders', e.target.checked)}
                  />
                }
                label="Aceptar pedidos automáticamente"
              />
            </Stack>
          </Paper>
        </Grid>

        {/* Webhook Configuration */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WebhookIcon />
              Configuración de Webhooks
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.use_webhooks !== false}
                    onChange={(e) => updateConfig('use_webhooks', e.target.checked)}
                  />
                }
                label="Usar Webhooks (recomendado)"
              />

              {config.use_webhooks !== false && (
                <>
                  <TextField
                    label="Webhook Base URL"
                    fullWidth
                    value={config.webhook_base_url || ''}
                    onChange={(e) => updateConfig('webhook_base_url', e.target.value)}
                    placeholder="https://tu-servidor.com"
                    helperText="URL pública donde Rappi enviará webhooks"
                  />

                  <TextField
                    label="Webhook Port"
                    type="number"
                    fullWidth
                    value={config.webhook_port || 8081}
                    onChange={(e) => updateConfig('webhook_port', parseInt(e.target.value))}
                    helperText="Puerto del servidor de webhooks (default: 8081)"
                  />

                  <TextField
                    label="Webhook Secret"
                    fullWidth
                    type={showWebhookSecret ? 'text' : 'password'}
                    value={config.webhook_secret || ''}
                    onChange={(e) => updateConfig('webhook_secret', e.target.value)}
                    placeholder="Secret para validación HMAC"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                            edge="end"
                          >
                            {showWebhookSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </>
              )}

              {!config.use_webhooks && (
                <Alert severity="warning" icon={<InfoIcon />}>
                  <Typography variant="caption">
                    Sin webhooks, se usará polling cada 45 segundos (menos eficiente)
                  </Typography>
                </Alert>
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Menu Sync Configuration */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CloudSyncIcon />
              Sincronización de Menú
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.sync_menu_on_startup || false}
                    onChange={(e) => updateConfig('sync_menu_on_startup', e.target.checked)}
                  />
                }
                label="Sincronizar menú al iniciar"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={config.auto_sync_menu || false}
                    onChange={(e) => updateConfig('auto_sync_menu', e.target.checked)}
                  />
                }
                label="Sincronizar automáticamente al cambiar productos"
              />

              {status && status.last_menu_sync && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Última sincronización:
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(status.last_menu_sync)}
                  </Typography>
                  <Chip
                    label={status.last_menu_sync_status === 'success' ? 'Exitosa' : 'Nunca sincronizado'}
                    size="small"
                    color={status.last_menu_sync_status === 'success' ? 'success' : 'default'}
                    sx={{ mt: 1 }}
                  />
                </Box>
              )}

              <Alert severity="info" icon={<InfoIcon />}>
                <Typography variant="caption">
                  El menú se sincroniza automáticamente si está habilitado.
                  Puede tomar unos minutos en ser aprobado por Rappi.
                </Typography>
              </Alert>
            </Stack>
          </Paper>
        </Grid>

        {/* Statistics */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BarChartIcon />
              Estadísticas
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <List>
              <ListItem>
                <ListItemIcon>
                  <AssignmentIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Pedidos Recibidos"
                  secondary={status?.total_orders_received || 0}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" />
                </ListItemIcon>
                <ListItemText
                  primary="Pedidos Aceptados"
                  secondary={status?.total_orders_accepted || 0}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <InfoIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Última Prueba de Conexión"
                  secondary={formatDate(status?.last_connection_test)}
                />
              </ListItem>
            </List>

            <Button
              variant="outlined"
              color="warning"
              fullWidth
              size="small"
              onClick={handleResetStats}
              sx={{ mt: 2 }}
            >
              Resetear Estadísticas
            </Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={loadConfig}
          startIcon={<RefreshIcon />}
        >
          Recargar
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
        >
          {loading ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </Box>
    </Box>
  );
};

export default RappiSettings;
