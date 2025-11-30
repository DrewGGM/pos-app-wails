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
  GoogleSheetsConfigClass,
  FullSyncResult
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
  const [fullSyncing, setFullSyncing] = useState(false);
  const [fullSyncResult, setFullSyncResult] = useState<FullSyncResult | null>(null);
  const [showFullSyncDialog, setShowFullSyncDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [jsonKeyFile, setJsonKeyFile] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    loadConfig();
    loadSchedulerStatus();

    // Update scheduler status every 5 seconds
    const statusInterval = setInterval(() => {
      loadSchedulerStatus();
    }, 5000);

    return () => clearInterval(statusInterval);
  }, []);

  // Update countdown every second
  useEffect(() => {
    if (schedulerStatus?.seconds_until_next_sync) {
      setSecondsRemaining(schedulerStatus.seconds_until_next_sync);
    }

    const countdownInterval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [schedulerStatus]);

  const loadConfig = async () => {
    try {
      const data = await wailsGoogleSheetsService.getConfig();
      setConfig(data);
    } catch (error: any) {
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
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setLoading(true);
      await wailsGoogleSheetsService.saveConfig(config);
      toast.success('Configuración guardada correctamente');

      // Always restart scheduler to pick up new configuration
      // If auto_sync is disabled, the scheduler will detect this and stop itself
      await wailsReportSchedulerService.restart();
      await loadSchedulerStatus();
    } catch (error: any) {
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
      toast.error('Error al enviar reporte: ' + (error.message || error));
    } finally {
      setSyncing(false);
    }
  };

  const handleFullSync = async () => {
    try {
      setFullSyncing(true);
      setShowFullSyncDialog(true);
      const result = await wailsGoogleSheetsService.syncAllDays();
      setFullSyncResult(result);

      if (result.status === 'success') {
        toast.success(result.message);
      } else if (result.status === 'partial') {
        toast.warning(result.message);
      } else {
        toast.error(result.message);
      }

      await loadConfig();
      await loadSchedulerStatus();
    } catch (error: any) {
      toast.error('Error en sincronización total: ' + (error.message || error));
      setFullSyncResult({
        total_days: 0,
        synced_days: 0,
        failed_days: 0,
        errors: [error.message || error],
        start_date: '',
        end_date: '',
        status: 'error',
        message: 'Error al ejecutar la sincronización total'
      });
    } finally {
      setFullSyncing(false);
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

  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return '0s';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
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

          {/* Formato de Exportación */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Formato de exportación:
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={config.separate_by_order_type || false}
                  onChange={(e) => updateConfig({ separate_by_order_type: e.target.checked })}
                />
              }
              label="Separar ventas por tipo de pedido en columnas individuales"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: 0.5 }}>
              Cuando está activado, se crearán columnas separadas para cada tipo de pedido (Ej: domicilio_ventas, domicilio_ordenes, dine-in_ventas, etc.)
            </Typography>
          </Grid>
        </Grid>

        {/* Estado en Tiempo Real */}
        {schedulerStatus && config.auto_sync && (
          <>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoIcon /> Estado del Sincronizador
            </Typography>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Status Card */}
              <Grid item xs={12} md={6}>
                <Card sx={{
                  bgcolor: schedulerStatus.running && schedulerStatus.enabled ? 'success.light' : 'grey.100',
                  borderLeft: 6,
                  borderColor: schedulerStatus.running && schedulerStatus.enabled ? 'success.main' : 'grey.400'
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      {schedulerStatus.running && schedulerStatus.enabled ? (
                        <CloudSyncIcon sx={{ fontSize: 40, color: 'success.main' }} />
                      ) : (
                        <InfoIcon sx={{ fontSize: 40, color: 'grey.500' }} />
                      )}
                      <Box>
                        <Typography variant="h6">
                          {schedulerStatus.running && schedulerStatus.enabled ? 'Activo' : 'Inactivo'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {schedulerStatus.running && schedulerStatus.enabled
                            ? 'Sincronización automática en ejecución'
                            : 'Sincronización automática detenida'}
                        </Typography>
                      </Box>
                    </Box>

                    {schedulerStatus.running && schedulerStatus.enabled && secondsRemaining > 0 && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Próxima sincronización en:
                        </Typography>
                        <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold', fontFamily: 'monospace' }}>
                          {formatCountdown(secondsRemaining)}
                        </Typography>
                        {schedulerStatus.next_sync_at && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(schedulerStatus.next_sync_at as any).toLocaleString('es-CO')}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Last Sync Status Card */}
              <Grid item xs={12} md={6}>
                <Card sx={{
                  bgcolor: config.last_sync_status === 'success' ? 'info.light' : 'error.light',
                  borderLeft: 6,
                  borderColor: config.last_sync_status === 'success' ? 'info.main' : 'error.main'
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      {config.last_sync_status === 'success' ? (
                        <CheckCircleIcon sx={{ fontSize: 40, color: 'info.main' }} />
                      ) : (
                        <ErrorIcon sx={{ fontSize: 40, color: 'error.main' }} />
                      )}
                      <Box>
                        <Typography variant="h6">
                          Último Envío
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {config.last_sync_status === 'success' ? 'Exitoso' : 'Con errores'}
                        </Typography>
                      </Box>
                    </Box>

                    {config.last_sync_at && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Fecha:
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                          {new Date(config.last_sync_at as any).toLocaleString('es-CO')}
                        </Typography>

                        <Box sx={{ mt: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Sincronizaciones totales:
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                            {config.total_syncs}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {config.last_sync_error && (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        <Typography variant="caption">
                          {config.last_sync_error}
                        </Typography>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}

        {/* Acciones */}
        <Divider sx={{ my: 4 }} />
        <Stack direction="row" spacing={2} justifyContent="flex-end" flexWrap="wrap">
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleFullSync}
            disabled={fullSyncing || !config.is_enabled}
            startIcon={fullSyncing ? <CircularProgress size={20} /> : <CloudSyncIcon />}
          >
            {fullSyncing ? 'Sincronizando...' : 'Sincronización Total'}
          </Button>
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

      {/* Dialog para mostrar resultados de sincronización total */}
      <Dialog
        open={showFullSyncDialog}
        onClose={() => !fullSyncing && setShowFullSyncDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudSyncIcon />
          Sincronización Total de Google Sheets
        </DialogTitle>
        <DialogContent>
          {fullSyncing ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
              <CircularProgress size={60} />
              <Typography variant="h6">Sincronizando todos los días...</Typography>
              <Typography variant="body2" color="text.secondary">
                Este proceso puede tomar varios minutos dependiendo de la cantidad de datos
              </Typography>
            </Box>
          ) : fullSyncResult ? (
            <Box>
              {/* Estado general */}
              <Alert
                severity={fullSyncResult.status === 'success' ? 'success' : fullSyncResult.status === 'partial' ? 'warning' : 'error'}
                sx={{ mb: 3 }}
              >
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {fullSyncResult.message}
                </Typography>
              </Alert>

              {/* Estadísticas */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total de Días
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        {fullSyncResult.total_days}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Sincronizados
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                        {fullSyncResult.synced_days}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Fallidos
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                        {fullSyncResult.failed_days}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Rango de fechas */}
              {fullSyncResult.start_date && fullSyncResult.end_date && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Rango de sincronización:
                  </Typography>
                  <Typography variant="body1">
                    <strong>Desde:</strong> {fullSyncResult.start_date} <strong>Hasta:</strong> {fullSyncResult.end_date}
                  </Typography>
                </Box>
              )}

              {/* Errores */}
              {fullSyncResult.errors && fullSyncResult.errors.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Errores encontrados:
                  </Typography>
                  <Box sx={{ maxHeight: 300, overflow: 'auto', p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                    {fullSyncResult.errors.map((error: any, index: number) => (
                      <Typography key={index} variant="body2" sx={{ mb: 1, fontFamily: 'monospace' }}>
                        • {error}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No hay resultados disponibles
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowFullSyncDialog(false)}
            disabled={fullSyncing}
            variant="contained"
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GoogleSheetsSettings;
