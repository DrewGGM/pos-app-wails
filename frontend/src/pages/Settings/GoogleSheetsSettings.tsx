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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CloudSync as CloudSyncIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Upload as UploadIcon,
  Send as SendIcon,
  Schedule as ScheduleIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  wailsGoogleSheetsService,
  GoogleSheetsConfig,
  GoogleSheetsConfigClass
} from '../../services/wailsGoogleSheetsService';
import {
  wailsReportSchedulerService,
  SchedulerStatus
} from '../../services/wailsReportSchedulerService';

const GoogleSheetsSettings: React.FC = () => {
  const [config, setConfig] = useState<GoogleSheetsConfig | null>(null);

  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [jsonKeyFile, setJsonKeyFile] = useState<string>('');

  useEffect(() => {
    loadConfig();
    loadSchedulerStatus();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await wailsGoogleSheetsService.getConfig();
      setConfig(data);
    } catch (error: any) {
      console.error('Error loading config:', error);
      toast.error('Error al cargar la configuración: ' + (error.message || error));
    } finally {
      setInitialLoading(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const status = await wailsReportSchedulerService.getStatus();
      setSchedulerStatus(status);
    } catch (error: any) {
      console.error('Error loading scheduler status:', error);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setLoading(true);
      await wailsGoogleSheetsService.saveConfig(config);
      toast.success('Configuración guardada correctamente');

      // Restart scheduler if auto-sync changed
      if (config.auto_sync) {
        await wailsReportSchedulerService.restart();
        await loadSchedulerStatus();
      }
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error('Error al guardar: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config || !config.private_key || !config.spreadsheet_id) {
      toast.error('Por favor complete las credenciales y el ID del spreadsheet');
      return;
    }

    try {
      setTesting(true);
      await wailsGoogleSheetsService.testConnection(config);
      toast.success('Conexión exitosa! Google Sheets está configurado correctamente');
    } catch (error: any) {
      console.error('Error testing connection:', error);
      toast.error('Error de conexión: ' + (error.message || error));
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      await wailsGoogleSheetsService.syncNow();
      toast.success('Reporte enviado correctamente a Google Sheets');
      await loadConfig();
      await loadSchedulerStatus();
    } catch (error: any) {
      console.error('Error syncing:', error);
      toast.error('Error al enviar reporte: ' + (error.message || error));
    } finally {
      setSyncing(false);
    }
  };

  const updateConfig = (updates: Partial<GoogleSheetsConfig>) => {
    if (!config) return;
    const updated = Object.assign(new GoogleSheetsConfigClass(config), updates);
    setConfig(updated);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const jsonData = JSON.parse(content);
        updateConfig({
          service_account_email: jsonData.client_email || '',
          private_key: content,
        });
        toast.success('Archivo de credenciales cargado correctamente');
      } catch (error) {
        toast.error('Error al leer el archivo JSON. Verifica que sea un archivo de credenciales válido');
      }
    };
    reader.readAsText(file);
  };

  const handlePasteJson = () => {
    try {
      const jsonData = JSON.parse(jsonKeyFile);
      updateConfig({
        service_account_email: jsonData.client_email || '',
        private_key: jsonKeyFile,
      });
      setShowKeyDialog(false);
      setJsonKeyFile('');
      toast.success('Credenciales configuradas correctamente');
    } catch (error) {
      toast.error('JSON inválido. Verifica el formato');
    }
  };

  if (initialLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!config) {
    return (
      <Box>
        <Alert severity="error">
          Error al cargar la configuración. Por favor recarga la página.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudSyncIcon /> Configuración de Google Sheets
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configura la integración con Google Sheets para enviar reportes automáticos
        </Typography>

        <Divider sx={{ my: 3 }} />

        {/* Habilitar/Deshabilitar */}
        <Card sx={{ mb: 3, bgcolor: config.is_enabled ? 'success.light' : 'grey.100' }}>
          <CardContent>
            <FormControlLabel
              control={
                <Switch
                  checked={config.is_enabled}
                  onChange={(e) => updateConfig({ is_enabled: e.target.checked })}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="h6">
                    {config.is_enabled ? 'Integración Activada' : 'Integración Desactivada'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {config.is_enabled
                      ? 'Los reportes se enviarán automáticamente a Google Sheets'
                      : 'Activa la integración para comenzar a enviar reportes'}
                  </Typography>
                </Box>
              }
            />
          </CardContent>
        </Card>

        {/* Credenciales */}
        <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2 }}>
          Credenciales de Google Service Account
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>¿Cómo obtener las credenciales?</strong>
              </Typography>
              <Typography variant="body2" component="ol" sx={{ ml: 2 }}>
                <li>Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                <li>Crea un proyecto o selecciona uno existente</li>
                <li>Habilita la API de Google Sheets</li>
                <li>Ve a "Credenciales" → "Crear credenciales" → "Cuenta de servicio"</li>
                <li>Descarga el archivo JSON de la clave</li>
                <li>Comparte tu hoja de cálculo con el email de la cuenta de servicio (con permisos de editor)</li>
              </Typography>
            </Alert>
          </Grid>

          <Grid item xs={12}>
            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
              >
                Cargar archivo JSON
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={handleFileUpload}
                />
              </Button>
              <Button
                variant="outlined"
                onClick={() => setShowKeyDialog(true)}
              >
                Pegar JSON manualmente
              </Button>
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Email de Service Account"
              value={config.service_account_email}
              disabled
              helperText="Se configura automáticamente al cargar el archivo JSON"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="ID del Spreadsheet"
              value={config.spreadsheet_id}
              onChange={(e) => updateConfig({ spreadsheet_id: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              helperText="El ID está en la URL de tu hoja de cálculo: docs.google.com/spreadsheets/d/[ID]/edit"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Nombre de la pestaña"
              value={config.sheet_name}
              onChange={(e) => updateConfig({ sheet_name: e.target.value })}
              placeholder="Reportes"
              helperText="Nombre de la pestaña donde se guardarán los datos"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              variant="contained"
              onClick={handleTestConnection}
              disabled={testing || !config.private_key || !config.spreadsheet_id}
              startIcon={testing ? <CircularProgress size={20} /> : <SendIcon />}
              sx={{ height: 56 }}
            >
              {testing ? 'Probando...' : 'Probar Conexión'}
            </Button>
          </Grid>
        </Grid>

        {/* Configuración de Sincronización */}
        <Divider sx={{ my: 4 }} />
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon /> Sincronización Automática
        </Typography>

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.auto_sync}
                  onChange={(e) => updateConfig({ auto_sync: e.target.checked })}
                />
              }
              label="Habilitar sincronización automática"
            />
          </Grid>

          {config.auto_sync && (
            <>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Modo de sincronización</InputLabel>
                  <Select
                    value={config.sync_mode}
                    label="Modo de sincronización"
                    onChange={(e) => updateConfig({ sync_mode: e.target.value })}
                  >
                    <MenuItem value="interval">Por intervalo de tiempo</MenuItem>
                    <MenuItem value="daily">Diaria a hora específica</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {config.sync_mode === 'interval' && (
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Intervalo (minutos)"
                    value={config.sync_interval}
                    onChange={(e) => updateConfig({ sync_interval: parseInt(e.target.value) || 60 })}
                    helperText="Cada cuántos minutos se enviará el reporte"
                    InputProps={{ inputProps: { min: 15, max: 1440 } }}
                  />
                </Grid>
              )}

              {config.sync_mode === 'daily' && (
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="time"
                    label="Hora de sincronización"
                    value={config.sync_time}
                    onChange={(e) => updateConfig({ sync_time: e.target.value })}
                    helperText="Hora del día para enviar el reporte"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              )}
            </>
          )}

          {/* Datos a Incluir */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Datos a incluir en el reporte:
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch
                    checked={config.include_sales}
                    onChange={(e) => updateConfig({ include_sales: e.target.checked })}
                  />
                }
                label="Ventas"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.include_orders}
                    onChange={(e) => updateConfig({ include_orders: e.target.checked })}
                  />
                }
                label="Órdenes"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.include_products}
                    onChange={(e) => updateConfig({ include_products: e.target.checked })}
                  />
                }
                label="Productos"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.include_clients}
                    onChange={(e) => updateConfig({ include_clients: e.target.checked })}
                  />
                }
                label="Clientes"
              />
            </Stack>
          </Grid>
        </Grid>

        {/* Estado de Sincronización */}
        {config.last_sync_at && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" gutterBottom>
              Estado de la última sincronización
            </Typography>
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">
                      Última sincronización:
                    </Typography>
                    <Typography variant="body1">
                      {new Date(config.last_sync_at as any).toLocaleString('es-CO')}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">
                      Estado:
                    </Typography>
                    <Chip
                      icon={config.last_sync_status === 'success' ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={config.last_sync_status === 'success' ? 'Exitoso' : 'Error'}
                      color={config.last_sync_status === 'success' ? 'success' : 'error'}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">
                      Total de sincronizaciones:
                    </Typography>
                    <Typography variant="body1">
                      {config.total_syncs}
                    </Typography>
                  </Grid>
                  {config.last_sync_error && (
                    <Grid item xs={12}>
                      <Alert severity="error">
                        {config.last_sync_error}
                      </Alert>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </>
        )}

        {/* Acciones */}
        <Divider sx={{ my: 4 }} />
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button
            variant="outlined"
            onClick={handleSyncNow}
            disabled={syncing || !config.is_enabled}
            startIcon={syncing ? <CircularProgress size={20} /> : <SendIcon />}
          >
            {syncing ? 'Enviando...' : 'Enviar Reporte Ahora'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
          >
            {loading ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </Stack>
      </Paper>

      {/* Dialog para pegar JSON manualmente */}
      <Dialog open={showKeyDialog} onClose={() => setShowKeyDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Pegar credenciales JSON</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pega aquí el contenido completo del archivo JSON de credenciales de tu Service Account
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={jsonKeyFile}
            onChange={(e) => setJsonKeyFile(e.target.value)}
            placeholder='{"type": "service_account", "project_id": "...", ...}'
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowKeyDialog(false)}>Cancelar</Button>
          <Button onClick={handlePasteJson} variant="contained" disabled={!jsonKeyFile}>
            Configurar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GoogleSheetsSettings;
