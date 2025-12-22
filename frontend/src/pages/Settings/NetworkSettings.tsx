import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Wifi as WifiIcon,
  Cloud as CloudIcon,
  Router as RouterIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  CloudQueue as TunnelIcon,
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

interface TunnelConfig {
  id: number;
  provider: string;
  enabled: boolean;
  tunnel_url: string;
  auth_token: string;
  tunnel_name: string;
  is_connected: boolean;
  last_error: string;
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
  const [tunnelConfig, setTunnelConfig] = useState<TunnelConfig>({
    id: 0,
    provider: '',
    enabled: false,
    tunnel_url: '',
    auth_token: '',
    tunnel_name: '',
    is_connected: false,
    last_error: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [netConfig, tunConfig] = await Promise.all([
        wailsConfigService.getNetworkConfig(),
        wailsConfigService.getTunnelConfigDB(),
      ]);
      if (netConfig) setNetworkConfig(netConfig);
      if (tunConfig) setTunnelConfig(tunConfig);
    } catch (error: any) {
      console.error('Error loading network config:', error);
      toast.error('Error cargando configuracion de red');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSaveTunnelConfig = async () => {
    setSaving(true);
    try {
      await wailsConfigService.saveTunnelConfigDB(tunnelConfig);
      toast.success('Configuracion de tunnel guardada');
    } catch (error: any) {
      toast.error(error?.message || 'Error guardando configuracion');
    } finally {
      setSaving(false);
    }
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
        <Alert severity="warning" sx={{ mb: 3 }}>
          La configuracion de tunnels permite exponer tu sistema a internet de forma segura.
          Esta funcionalidad esta en desarrollo.
        </Alert>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TunnelIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Configuracion de Tunnel</Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={tunnelConfig.enabled}
                          onChange={(e) => setTunnelConfig({ ...tunnelConfig, enabled: e.target.checked })}
                          disabled
                        />
                      }
                      label="Habilitado (Proximamente)"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth disabled>
                      <InputLabel>Proveedor</InputLabel>
                      <Select
                        value={tunnelConfig.provider}
                        label="Proveedor"
                        onChange={(e) => setTunnelConfig({ ...tunnelConfig, provider: e.target.value })}
                      >
                        <MenuItem value="">Seleccionar...</MenuItem>
                        <MenuItem value="cloudflare">Cloudflare Tunnel</MenuItem>
                        <MenuItem value="ngrok">ngrok</MenuItem>
                        <MenuItem value="localtunnel">LocalTunnel</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Nombre del Tunnel"
                      value={tunnelConfig.tunnel_name}
                      onChange={(e) => setTunnelConfig({ ...tunnelConfig, tunnel_name: e.target.value })}
                      disabled
                      placeholder="mi-restaurante-pos"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Token de Autenticacion"
                      type="password"
                      value={tunnelConfig.auth_token}
                      onChange={(e) => setTunnelConfig({ ...tunnelConfig, auth_token: e.target.value })}
                      disabled
                      helperText="Token proporcionado por el servicio de tunnel"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Estado del Tunnel
                    </Typography>
                    <Chip
                      label={tunnelConfig.is_connected ? 'Conectado' : 'Desconectado'}
                      color={tunnelConfig.is_connected ? 'success' : 'default'}
                      sx={{ mr: 1 }}
                    />
                    {tunnelConfig.tunnel_url && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        URL: <strong>{tunnelConfig.tunnel_url}</strong>
                      </Typography>
                    )}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Acerca de los Tunnels</Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Los tunnels permiten exponer tu sistema POS local a internet de forma segura,
                  lo que permite:
                </Typography>
                <ul>
                  <li>
                    <Typography variant="body2" color="text.secondary">
                      Acceder a la PWA desde cualquier lugar
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2" color="text.secondary">
                      Recibir webhooks de servicios externos (Rappi, etc.)
                    </Typography>
                  </li>
                  <li>
                    <Typography variant="body2" color="text.secondary">
                      Administracion remota del sistema
                    </Typography>
                  </li>
                </ul>
                <Alert severity="info" sx={{ mt: 2 }}>
                  Esta funcionalidad estara disponible en una proxima actualizacion.
                </Alert>
              </CardContent>
            </Card>
          </Grid>

          {/* Save Button */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleSaveTunnelConfig}
                disabled={true}
                startIcon={<SaveIcon />}
              >
                Guardar Tunnel (Proximamente)
              </Button>
            </Box>
          </Grid>
        </Grid>
      </TabPanel>
    </Box>
  );
};

export default NetworkSettings;
