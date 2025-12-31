import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  TextField,
  Button,
  Divider,
  Alert,
  Chip,
  CircularProgress,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  FormControlLabel,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  alpha,
} from '@mui/material';
import {
  CreditCard as CreditCardIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Phone as PhoneIcon,
  Link as LinkIcon,
  Sync as SyncIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  VerifiedUser as VerifiedUserIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsBoldService } from '../../services/wailsBoldService';
import { models } from '../../../wailsjs/go/models';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`bold-tabpanel-${index}`}
      aria-labelledby={`bold-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const BoldSettings: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<models.BoldConfig | null>(null);
  const [terminals, setTerminals] = useState<models.BoldTerminal[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<models.BoldPaymentMethod[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const boldConfig = await wailsBoldService.getBoldConfig();
      setConfig(boldConfig);

      if (boldConfig.enabled) {
        // Load terminals if integration is enabled
        const terminalsList = await wailsBoldService.getAllTerminals();
        setTerminals(terminalsList);
      }
    } catch (error) {
      console.error('Error loading Bold config:', error);
      toast.error('Error al cargar la configuración de Bold');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await wailsBoldService.updateBoldConfig(config);
      toast.success('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const success = await wailsBoldService.testConnection();

      if (success) {
        toast.success('Conexión exitosa con Bold API');

        // Load payment methods after successful connection
        const methods = await wailsBoldService.getPaymentMethods();
        setPaymentMethods(methods);
      } else {
        toast.error('Error al conectar con Bold API');
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast.error(error?.message || 'Error al probar la conexión');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncTerminals = async () => {
    try {
      setSyncing(true);
      await wailsBoldService.syncTerminals();
      toast.success('Terminales sincronizados exitosamente');

      // Reload terminals
      const terminalsList = await wailsBoldService.getAllTerminals();
      setTerminals(terminalsList);
    } catch (error: any) {
      console.error('Error syncing terminals:', error);
      toast.error(error?.message || 'Error al sincronizar terminales');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleTerminal = async (terminal: models.BoldTerminal) => {
    try {
      const updated = models.BoldTerminal.createFrom({ ...terminal, is_active: !terminal.is_active });
      await wailsBoldService.updateTerminal(updated);
      toast.success(`Terminal ${updated.is_active ? 'activado' : 'desactivado'}`);

      // Update local state
      setTerminals(terminals.map(t => t.id === terminal.id ? updated : t));
    } catch (error) {
      console.error('Error updating terminal:', error);
      toast.error('Error al actualizar terminal');
    }
  };

  const handleSetDefaultTerminal = async (terminal: models.BoldTerminal) => {
    try {
      // Update all terminals to not be default
      const updates = terminals.map(async t => {
        if (t.id === terminal.id) {
          await wailsBoldService.updateTerminal(models.BoldTerminal.createFrom({ ...t, is_default: true }));
        } else if (t.is_default) {
          await wailsBoldService.updateTerminal(models.BoldTerminal.createFrom({ ...t, is_default: false }));
        }
      });

      await Promise.all(updates);

      // Update config with new default terminal
      if (config) {
        await wailsBoldService.updateBoldConfig({
          ...config,
          default_terminal_model: terminal.terminal_model,
          default_terminal_serial: terminal.terminal_serial,
        });
      }

      toast.success('Terminal por defecto actualizado');

      // Reload
      await loadConfig();
    } catch (error) {
      console.error('Error setting default terminal:', error);
      toast.error('Error al establecer terminal por defecto');
    }
  };

  if (loading || !config) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CreditCardIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" fontWeight="600">
                Integración Bold
              </Typography>
              <Chip
                label="En Desarrollo"
                size="small"
                color="warning"
                icon={<span style={{ fontSize: '0.8rem', marginLeft: 4 }}>🚧</span>}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Configura la integración con datáfonos Bold para procesar pagos
            </Typography>
          </Box>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={config.enabled}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, enabled: e.target.checked }))}
              color="primary"
            />
          }
          label={config.enabled ? 'Habilitado' : 'Deshabilitado'}
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Configuración General" />
          <Tab label="Terminales" disabled={!config.enabled} />
          <Tab label="Métodos de Pago" disabled={!config.enabled} />
        </Tabs>
      </Box>

      {/* Tab Panel 0: General Configuration */}
      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Configuración de API
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
              Para obtener tus llaves de API, ingresa a{' '}
              <a href="https://panel.bold.co" target="_blank" rel="noopener noreferrer">
                panel.bold.co
              </a>{' '}
              → Integraciones → API
            </Alert>

            {/* Environment */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Ambiente</InputLabel>
              <Select
                value={config.environment}
                label="Ambiente"
                onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, environment: e.target.value as 'test' | 'production' }))}
              >
                <MenuItem value="test">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🧪 Pruebas (Sandbox)
                  </Box>
                </MenuItem>
                <MenuItem value="production">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    ✅ Producción
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* API Keys */}
            <TextField
              fullWidth
              label="API Key - Pruebas"
              value={config.api_key_test}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, api_key_test: e.target.value }))}
              type="password"
              sx={{ mb: 2 }}
              helperText="Llave para ambiente de pruebas (Sandbox)"
            />

            <TextField
              fullWidth
              label="API Key - Producción"
              value={config.api_key_production}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, api_key_production: e.target.value }))}
              type="password"
              sx={{ mb: 2 }}
              helperText="Llave para ambiente de producción"
            />

            {/* Base URL */}
            <TextField
              fullWidth
              label="URL Base de API"
              value={config.base_url}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, base_url: e.target.value }))}
              sx={{ mb: 2 }}
              helperText="URL base para las peticiones a Bold API"
            />

            {/* User Email */}
            <TextField
              fullWidth
              label="Email del Vendedor"
              value={config.user_email}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, user_email: e.target.value }))}
              type="email"
              sx={{ mb: 3 }}
              helperText="Email de la persona que realiza las ventas"
            />

            <Divider sx={{ my: 3 }} />

            {/* Webhook Configuration */}
            <Typography variant="h6" gutterBottom>
              Configuración de Webhook
            </Typography>

            <TextField
              fullWidth
              label="URL Webhook - Producción"
              value={config.webhook_url || ''}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, webhook_url: e.target.value }))}
              sx={{ mb: 2 }}
              helperText="URL para recibir notificaciones en producción"
            />

            <TextField
              fullWidth
              label="URL Webhook - Sandbox"
              value={config.webhook_url_sandbox || ''}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, webhook_url_sandbox: e.target.value }))}
              sx={{ mb: 2 }}
              helperText="URL para recibir notificaciones en pruebas"
            />

            <TextField
              fullWidth
              label="Secret de Webhook"
              value={config.webhook_secret || ''}
              onChange={(e) => setConfig(models.BoldConfig.createFrom({ ...config, webhook_secret: e.target.value }))}
              type="password"
              sx={{ mb: 3 }}
              helperText="Secreto para validar las notificaciones del webhook"
            />

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || !config.enabled}
                startIcon={saving ? <CircularProgress size={20} /> : <CheckCircleIcon />}
              >
                {saving ? 'Guardando...' : 'Guardar Configuración'}
              </Button>

              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testing || !config.enabled}
                startIcon={testing ? <CircularProgress size={20} /> : <VerifiedUserIcon />}
              >
                {testing ? 'Probando...' : 'Probar Conexión'}
              </Button>
            </Box>

            {/* Status */}
            {config.last_sync_at && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  Última sincronización: {new Date(config.last_sync_at as any).toLocaleString()}
                </Typography>
                {config.last_sync_status === 'success' && (
                  <Chip
                    label="Conectado"
                    size="small"
                    color="success"
                    icon={<CheckCircleIcon />}
                    sx={{ ml: 2 }}
                  />
                )}
                {config.last_sync_status === 'error' && (
                  <Chip
                    label="Error"
                    size="small"
                    color="error"
                    icon={<ErrorIcon />}
                    sx={{ ml: 2 }}
                  />
                )}
              </Box>
            )}

            {config.total_payments > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total de pagos procesados: <strong>{config.total_payments}</strong>
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab Panel 1: Terminals */}
      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Terminales (Datáfonos)
              </Typography>

              <Button
                variant="outlined"
                startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
                onClick={handleSyncTerminals}
                disabled={syncing}
              >
                {syncing ? 'Sincronizando...' : 'Sincronizar desde Bold'}
              </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              Asegúrate de habilitar los terminales en la app Bold: Mi perfil → Preferencias de cobro → Conexiones API
            </Alert>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Modelo</TableCell>
                    <TableCell>Serial</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Activo</TableCell>
                    <TableCell>Por Defecto</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {terminals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                          No hay terminales configurados. Haz clic en "Sincronizar desde Bold" para cargar tus datáfonos.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    terminals.map((terminal) => (
                      <TableRow key={terminal.id}>
                        <TableCell>{terminal.name}</TableCell>
                        <TableCell>{terminal.terminal_model}</TableCell>
                        <TableCell>{terminal.terminal_serial}</TableCell>
                        <TableCell>
                          <Chip
                            label={terminal.status}
                            size="small"
                            color={terminal.status === 'BINDED' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={terminal.is_active}
                            onChange={() => handleToggleTerminal(terminal)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {terminal.is_default ? (
                            <Chip label="Por defecto" size="small" color="primary" />
                          ) : (
                            <Button
                              size="small"
                              onClick={() => handleSetDefaultTerminal(terminal)}
                            >
                              Establecer
                            </Button>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              onClick={() => {
                                // TODO: Implement delete confirmation
                                console.log('Delete terminal', terminal.id);
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab Panel 2: Payment Methods */}
      <TabPanel value={tabValue} index={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Métodos de Pago Disponibles
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
              Estos son los métodos de pago habilitados en tu cuenta Bold. Para cambiarlos, debes hacerlo desde el panel de Bold.
            </Alert>

            {paymentMethods.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  No hay métodos de pago cargados
                </Typography>
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  startIcon={<RefreshIcon />}
                  sx={{ mt: 2 }}
                >
                  Cargar Métodos de Pago
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {paymentMethods.map((method) => (
                  <Card key={method.name} variant="outlined">
                    <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {method.name === 'POS' && <CreditCardIcon />}
                        {method.name === 'NEQUI' && <PhoneIcon />}
                        {method.name === 'DAVIPLATA' && <PhoneIcon />}
                        {method.name === 'PAY_BY_LINK' && <LinkIcon />}
                        <Box>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {method.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {method.name === 'POS' && 'Tarjetas de crédito/débito'}
                            {method.name === 'NEQUI' && 'Pagos con Nequi'}
                            {method.name === 'DAVIPLATA' && 'Pagos con Daviplata'}
                            {method.name === 'PAY_BY_LINK' && 'Link de pago'}
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        label={method.enabled ? 'Habilitado' : 'Deshabilitado'}
                        color={method.enabled ? 'success' : 'default'}
                      />
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </TabPanel>
    </Box>
  );
};

export default BoldSettings;
