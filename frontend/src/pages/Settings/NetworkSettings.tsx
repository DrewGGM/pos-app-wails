import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Alert,
  Card,
  CardContent,
  Tabs,
  Tab,
  Chip,
  Divider,
  Paper,
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  Wifi as WifiIcon,
  Cloud as CloudIcon,
  Router as RouterIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  CloudQueue as TunnelIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  Delete as ClearIcon,
  OpenInNew as OpenIcon,
  CheckCircle as ConnectedIcon,
  Cancel as DisconnectedIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsConfigService } from '../../services/wailsConfigService';

interface NetworkConfig {
  id: number;
  websocket_port: number;
  websocket_enabled: boolean;
  config_api_port: number;
  config_api_enabled: boolean;
  mcp_port: number;
  mcp_enabled: boolean;
  rappi_webhook_port: number;
  rappi_webhook_enabled: boolean;
}

interface RestaurantConfigPartial {
  id?: number;
  enable_kitchen_ack?: boolean;
}

interface TunnelStatus {
  is_running: boolean;
  is_installed: boolean;
  tunnel_url: string;
  last_error: string;
  output: string[];
  provider: string;
  connected_at?: string;
  binary_path: string;
  binary_exists: boolean;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const NetworkSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    id: 0,
    websocket_port: 8080,
    websocket_enabled: true,
    config_api_port: 8082,
    config_api_enabled: true,
    mcp_port: 8090,
    mcp_enabled: false,
    rappi_webhook_port: 8081,
    rappi_webhook_enabled: false,
  });
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>({
    is_running: false,
    is_installed: false,
    tunnel_url: '',
    last_error: '',
    output: [],
    provider: 'cloudflare',
    binary_path: '',
    binary_exists: false,
  });
  const [tunnelToken, setTunnelToken] = useState('');
  const [tunnelPort, setTunnelPort] = useState(8082);
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfigPartial>({
    enable_kitchen_ack: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMobileConfig, setSavingMobileConfig] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installingViaPM, setInstallingViaPM] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [canUsePM, setCanUsePM] = useState(false);
  const [pmCommand, setPmCommand] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
    checkPackageManager();
  }, []);

  const checkPackageManager = async () => {
    try {
      const canUse = await wailsConfigService.canUsePackageManager();
      setCanUsePM(canUse);
      if (canUse) {
        const cmd = await wailsConfigService.getPackageManagerCommand();
        setPmCommand(cmd);
      }
    } catch (error) {
      console.error('Error checking package manager:', error);
    }
  };

  // Poll for tunnel status when on tunnel tab
  useEffect(() => {
    if (activeTab === 1) {
      pollTunnelStatus();
      pollIntervalRef.current = setInterval(pollTunnelStatus, 2000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [activeTab]);

  // Auto-scroll output log
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [tunnelStatus.output]);

  const loadData = async () => {
    setLoading(true);
    try {
      const netConfig = await wailsConfigService.getNetworkConfig();
      if (netConfig) {
        setNetworkConfig(netConfig);
        setTunnelPort(netConfig.config_api_port);
      }

      // Load restaurant config for mobile apps settings
      const restConfig = await wailsConfigService.getRestaurantConfig();
      if (restConfig) {
        setRestaurantConfig({
          id: restConfig.id,
          enable_kitchen_ack: restConfig.enable_kitchen_ack ?? false,
        });
      }
    } catch (error: any) {
      console.error('Error loading network config:', error);
      toast.error('Error cargando configuracion de red');
    } finally {
      setLoading(false);
    }
  };

  const pollTunnelStatus = useCallback(async () => {
    try {
      const status = await wailsConfigService.getTunnelStatus();
      if (status) {
        setTunnelStatus(status);
      }
    } catch (error) {
      console.error('Error polling tunnel status:', error);
    }
  }, []);

  const handleSaveNetworkConfig = async () => {
    setSaving(true);
    try {
      await wailsConfigService.saveNetworkConfig(networkConfig);
      toast.success('Configuracion de puertos guardada. Reinicia la aplicacion para aplicar cambios.');
    } catch (error: any) {
      toast.error(error?.message || 'Error guardando configuracion');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMobileConfig = async () => {
    setSavingMobileConfig(true);
    try {
      // Get full restaurant config and update only kitchen ack
      const fullConfig = await wailsConfigService.getRestaurantConfig();
      if (fullConfig) {
        await wailsConfigService.updateRestaurantConfig({
          ...fullConfig,
          enable_kitchen_ack: restaurantConfig.enable_kitchen_ack,
        });
        toast.success('Configuracion de apps moviles guardada');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error guardando configuracion');
    } finally {
      setSavingMobileConfig(false);
    }
  };

  const handleDownloadCloudflared = async () => {
    setDownloading(true);
    try {
      await wailsConfigService.downloadCloudflared();
      toast.success('Cloudflared descargado correctamente');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error descargando cloudflared');
    } finally {
      setDownloading(false);
    }
  };

  const handleInstallViaPackageManager = async () => {
    setInstallingViaPM(true);
    try {
      await wailsConfigService.installCloudflaredViaPackageManager();
      toast.success('Cloudflared instalado via gestor de paquetes');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error instalando cloudflared');
    } finally {
      setInstallingViaPM(false);
    }
  };

  const handleLoginToCloudflare = async () => {
    setLoggingIn(true);
    try {
      await wailsConfigService.loginToCloudflare();
      toast.success('Login completado. Revisa el log para mas detalles.');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error en login de Cloudflare');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStartQuickTunnel = async () => {
    setStarting(true);
    try {
      await wailsConfigService.startQuickTunnel(tunnelPort);
      toast.success('Iniciando tunnel...');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error iniciando tunnel');
    } finally {
      setStarting(false);
    }
  };

  const handleStartTokenTunnel = async () => {
    if (!tunnelToken.trim()) {
      toast.error('Ingresa un token de Cloudflare');
      return;
    }
    setStarting(true);
    try {
      await wailsConfigService.startTunnelWithToken(tunnelToken);
      toast.success('Iniciando tunnel con token...');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error iniciando tunnel');
    } finally {
      setStarting(false);
    }
  };

  const handleStopTunnel = async () => {
    setStopping(true);
    try {
      await wailsConfigService.stopTunnel();
      toast.success('Tunnel detenido');
      await pollTunnelStatus();
    } catch (error: any) {
      toast.error(error?.message || 'Error deteniendo tunnel');
    } finally {
      setStopping(false);
    }
  };

  const handleClearOutput = async () => {
    try {
      await wailsConfigService.clearTunnelOutput();
      await pollTunnelStatus();
    } catch (error) {
      console.error('Error clearing output:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copiada al portapapeles');
  };

  const openInBrowser = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Configuracion de puertos de red y servicios expuestos. Los cambios en los puertos requieren reiniciar la aplicacion.
      </Alert>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab icon={<RouterIcon />} label="Puertos" />
        <Tab icon={<TunnelIcon />} label="Tunnel" />
      </Tabs>

      {/* Ports Configuration Tab */}
      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={3}>
          {/* WebSocket Server */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <WifiIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">WebSocket Server</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Comunicacion en tiempo real con apps moviles (Cocina, Meseros)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={networkConfig.websocket_enabled}
                          onChange={(e) => setNetworkConfig({ ...networkConfig, websocket_enabled: e.target.checked })}
                        />
                      }
                      label="Habilitado"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Puerto"
                      type="number"
                      value={networkConfig.websocket_port}
                      onChange={(e) => setNetworkConfig({ ...networkConfig, websocket_port: parseInt(e.target.value) || 8080 })}
                      disabled={!networkConfig.websocket_enabled}
                      helperText="Por defecto: 8080"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Config API Server (PWA) */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CloudIcon sx={{ mr: 1, color: 'secondary.main' }} />
                  <Typography variant="h6">API de Configuracion (PWA)</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  API REST para la PWA de pedidos remotos
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={networkConfig.config_api_enabled}
                          onChange={(e) => setNetworkConfig({ ...networkConfig, config_api_enabled: e.target.checked })}
                        />
                      }
                      label="Habilitado"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Puerto"
                      type="number"
                      value={networkConfig.config_api_port}
                      onChange={(e) => setNetworkConfig({ ...networkConfig, config_api_port: parseInt(e.target.value) || 8082 })}
                      disabled={!networkConfig.config_api_enabled}
                      helperText="Por defecto: 8082"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* MCP Server */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <RouterIcon sx={{ mr: 1, color: 'info.main' }} />
                  <Typography variant="h6">MCP Server (IA)</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Model Context Protocol para integracion con Claude
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={networkConfig.mcp_enabled}
                          onChange={(e) => setNetworkConfig({ ...networkConfig, mcp_enabled: e.target.checked })}
                        />
                      }
                      label="Habilitado"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Puerto"
                      type="number"
                      value={networkConfig.mcp_port}
                      onChange={(e) => setNetworkConfig({ ...networkConfig, mcp_port: parseInt(e.target.value) || 8090 })}
                      disabled={!networkConfig.mcp_enabled}
                      helperText="Por defecto: 8090"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Rappi Webhook Server */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <RouterIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography variant="h6">Rappi Webhook</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Recibe pedidos desde Rappi
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={networkConfig.rappi_webhook_enabled}
                          onChange={(e) => setNetworkConfig({ ...networkConfig, rappi_webhook_enabled: e.target.checked })}
                        />
                      }
                      label="Habilitado"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Puerto"
                      type="number"
                      value={networkConfig.rappi_webhook_port}
                      onChange={(e) => setNetworkConfig({ ...networkConfig, rappi_webhook_port: parseInt(e.target.value) || 8081 })}
                      disabled={!networkConfig.rappi_webhook_enabled}
                      helperText="Por defecto: 8081"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Mobile Apps Configuration */}
          <Grid item xs={12}>
            <Card sx={{ border: '1px solid', borderColor: 'primary.main' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <WifiIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Configuracion de Apps Moviles</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Opciones para las aplicaciones de Cocina y Meseros
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={restaurantConfig.enable_kitchen_ack ?? false}
                          onChange={(e) => setRestaurantConfig({ ...restaurantConfig, enable_kitchen_ack: e.target.checked })}
                        />
                      }
                      label="Activar confirmaciones de cocina"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 7 }}>
                      Cuando esta activo, la app de meseros mostrara una alerta si la cocina no confirma recepcion del pedido
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSaveMobileConfig}
                        disabled={savingMobileConfig}
                        startIcon={<SaveIcon />}
                        size="small"
                      >
                        {savingMobileConfig ? 'Guardando...' : 'Guardar Apps Moviles'}
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Summary */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Resumen de Puertos</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    icon={<WifiIcon />}
                    label={`WebSocket: ${networkConfig.websocket_port}`}
                    color={networkConfig.websocket_enabled ? 'success' : 'default'}
                    variant={networkConfig.websocket_enabled ? 'filled' : 'outlined'}
                  />
                  <Chip
                    icon={<CloudIcon />}
                    label={`API PWA: ${networkConfig.config_api_port}`}
                    color={networkConfig.config_api_enabled ? 'success' : 'default'}
                    variant={networkConfig.config_api_enabled ? 'filled' : 'outlined'}
                  />
                  <Chip
                    icon={<RouterIcon />}
                    label={`MCP: ${networkConfig.mcp_port}`}
                    color={networkConfig.mcp_enabled ? 'success' : 'default'}
                    variant={networkConfig.mcp_enabled ? 'filled' : 'outlined'}
                  />
                  <Chip
                    icon={<RouterIcon />}
                    label={`Rappi: ${networkConfig.rappi_webhook_port}`}
                    color={networkConfig.rappi_webhook_enabled ? 'success' : 'default'}
                    variant={networkConfig.rappi_webhook_enabled ? 'filled' : 'outlined'}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Save Button */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={loadData}
                disabled={loading}
                startIcon={<RefreshIcon />}
              >
                Recargar
              </Button>
              <Button
                variant="contained"
                onClick={handleSaveNetworkConfig}
                disabled={saving}
                startIcon={<SaveIcon />}
              >
                {saving ? 'Guardando...' : 'Guardar Puertos'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tunnel Configuration Tab */}
      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={3}>
          {/* Status Card */}
          <Grid item xs={12}>
            <Card sx={{ bgcolor: tunnelStatus.is_running ? 'success.dark' : 'grey.800' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {tunnelStatus.is_running ? (
                      <ConnectedIcon sx={{ fontSize: 40, color: 'success.light' }} />
                    ) : (
                      <DisconnectedIcon sx={{ fontSize: 40, color: 'grey.500' }} />
                    )}
                    <Box>
                      <Typography variant="h5" sx={{ color: 'white' }}>
                        {tunnelStatus.is_running ? 'Tunnel Activo' : 'Tunnel Inactivo'}
                      </Typography>
                      {tunnelStatus.tunnel_url && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Typography variant="body1" sx={{ color: 'grey.300', fontFamily: 'monospace' }}>
                            {tunnelStatus.tunnel_url}
                          </Typography>
                          <Tooltip title="Copiar URL">
                            <IconButton size="small" onClick={() => copyToClipboard(tunnelStatus.tunnel_url)} sx={{ color: 'grey.300' }}>
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Abrir en navegador">
                            <IconButton size="small" onClick={() => openInBrowser(tunnelStatus.tunnel_url)} sx={{ color: 'grey.300' }}>
                              <OpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  <Box>
                    {tunnelStatus.is_running ? (
                      <Button
                        variant="contained"
                        color="error"
                        onClick={handleStopTunnel}
                        disabled={stopping}
                        startIcon={stopping ? <CircularProgress size={20} /> : <StopIcon />}
                      >
                        {stopping ? 'Deteniendo...' : 'Detener'}
                      </Button>
                    ) : (
                      <Chip label="Cloudflare Quick Tunnel" color="info" />
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Installation Status */}
          {!tunnelStatus.binary_exists && (
            <Grid item xs={12}>
              <Card sx={{ borderColor: 'warning.main', borderWidth: 2, borderStyle: 'solid' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DownloadIcon color="warning" />
                    Cloudflared no instalado
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Necesitas instalar <strong>cloudflared</strong> para usar tunnels. Elige un metodo de instalacion:
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {/* Install via Package Manager */}
                    {canUsePM && (
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleInstallViaPackageManager}
                        disabled={installingViaPM || downloading}
                        startIcon={installingViaPM ? <CircularProgress size={20} /> : <DownloadIcon />}
                      >
                        {installingViaPM ? 'Instalando...' : `Instalar via ${pmCommand.split(' ')[0]}`}
                      </Button>
                    )}

                    {/* Manual Download */}
                    <Button
                      variant={canUsePM ? 'outlined' : 'contained'}
                      color={canUsePM ? 'secondary' : 'primary'}
                      onClick={handleDownloadCloudflared}
                      disabled={downloading || installingViaPM}
                      startIcon={downloading ? <CircularProgress size={20} /> : <DownloadIcon />}
                    >
                      {downloading ? 'Descargando...' : 'Descarga Manual'}
                    </Button>
                  </Box>

                  {(downloading || installingViaPM) && <LinearProgress sx={{ mt: 2 }} />}

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {canUsePM && (
                      <>
                        <strong>Recomendado:</strong> Usar el gestor de paquetes instala cloudflared en el sistema y lo mantiene actualizado.
                        <br />
                      </>
                    )}
                    <strong>Descarga manual:</strong> Descarga el binario directamente desde GitHub.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Cloudflare Login Button */}
          {tunnelStatus.binary_exists && !tunnelStatus.is_running && (
            <Grid item xs={12}>
              <Alert
                severity="info"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={handleLoginToCloudflare}
                    disabled={loggingIn}
                    startIcon={loggingIn ? <CircularProgress size={16} /> : <OpenIcon />}
                  >
                    {loggingIn ? 'Iniciando login...' : 'Login Cloudflare'}
                  </Button>
                }
              >
                <Typography variant="body2">
                  <strong>Opcional:</strong> Inicia sesion en Cloudflare para obtener un tunnel con nombre permanente y dominio personalizado.
                </Typography>
              </Alert>
            </Grid>
          )}

          {/* Quick Tunnel Controls */}
          {tunnelStatus.binary_exists && !tunnelStatus.is_running && (
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TunnelIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6">Quick Tunnel (Sin cuenta)</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Inicia un tunnel rapido sin necesidad de cuenta de Cloudflare.
                    La URL cambiara cada vez que reinicies el tunnel.
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Puerto a exponer"
                        type="number"
                        value={tunnelPort}
                        onChange={(e) => setTunnelPort(parseInt(e.target.value) || 8082)}
                        helperText="Por defecto: Puerto de la API PWA"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        fullWidth
                        variant="contained"
                        color="primary"
                        onClick={handleStartQuickTunnel}
                        disabled={starting}
                        startIcon={starting ? <CircularProgress size={20} /> : <StartIcon />}
                      >
                        {starting ? 'Iniciando...' : 'Iniciar Quick Tunnel'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Token-based Tunnel */}
          {tunnelStatus.binary_exists && !tunnelStatus.is_running && (
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TunnelIcon sx={{ mr: 1, color: 'secondary.main' }} />
                    <Typography variant="h6">Tunnel con Token (URL fija)</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Usa un token de Cloudflare para una URL permanente.
                    Requiere cuenta gratuita en Cloudflare.
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Token de Cloudflare"
                        type="password"
                        value={tunnelToken}
                        onChange={(e) => setTunnelToken(e.target.value)}
                        placeholder="eyJhIjoiYWNjb3VudC..."
                        helperText="Obten el token desde el dashboard de Cloudflare"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        fullWidth
                        variant="contained"
                        color="secondary"
                        onClick={handleStartTokenTunnel}
                        disabled={starting || !tunnelToken.trim()}
                        startIcon={starting ? <CircularProgress size={20} /> : <StartIcon />}
                      >
                        {starting ? 'Iniciando...' : 'Iniciar con Token'}
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Output Log */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Log del Tunnel</Typography>
                  <Box>
                    <Tooltip title="Limpiar log">
                      <IconButton onClick={handleClearOutput} size="small">
                        <ClearIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Actualizar">
                      <IconButton onClick={pollTunnelStatus} size="small">
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Paper
                  ref={outputRef}
                  sx={{
                    bgcolor: 'grey.900',
                    color: 'grey.300',
                    p: 2,
                    height: 200,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                  }}
                >
                  {tunnelStatus.output && tunnelStatus.output.length > 0 ? (
                    tunnelStatus.output.map((line, index) => (
                      <Box key={index} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {line}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ color: 'grey.600', fontStyle: 'italic' }}>
                      No hay actividad en el tunnel...
                    </Typography>
                  )}
                </Paper>
                {tunnelStatus.last_error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {tunnelStatus.last_error}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Info Card */}
          <Grid item xs={12}>
            <Card sx={{ bgcolor: 'info.dark' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>
                  Acerca de Cloudflare Tunnel
                </Typography>
                <Typography variant="body2" sx={{ color: 'grey.300' }}>
                  Cloudflare Tunnel permite exponer tu sistema POS a internet de forma segura y gratuita:
                </Typography>
                <Box component="ul" sx={{ color: 'grey.300', mt: 1, pl: 2 }}>
                  <li>HTTPS automatico sin configuracion</li>
                  <li>Sin necesidad de abrir puertos en el router</li>
                  <li>Proteccion DDoS incluida</li>
                  <li>Acceso remoto a la PWA desde cualquier lugar</li>
                </Box>
                <Divider sx={{ my: 2, borderColor: 'grey.600' }} />
                <Typography variant="body2" sx={{ color: 'grey.400' }}>
                  <strong>Quick Tunnel:</strong> URL temporal que cambia cada vez (ideal para pruebas)
                  <br />
                  <strong>Token Tunnel:</strong> URL permanente con tu dominio (requiere cuenta Cloudflare gratuita)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
    </Box>
  );
};

export default NetworkSettings;
