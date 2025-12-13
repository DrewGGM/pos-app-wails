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
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  SmartToy as AIIcon,
  Computer as DesktopIcon,
  Terminal as TerminalIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsMcpService, MCPConfig, MCPStatus, MCPTool } from '../../services/wailsMcpService';

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

const MCPSettings: React.FC = () => {
  const [config, setConfig] = useState<MCPConfig>({
    enabled: false,
    port: 8090,
    api_key: '',
    allowed_ips: '',
    read_only_mode: false,
    disabled_tools: '',
  });
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configTab, setConfigTab] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, statusData, toolsData] = await Promise.all([
        wailsMcpService.getConfig(),
        wailsMcpService.getStatus(),
        wailsMcpService.getAvailableTools(),
      ]);
      setConfig(configData);
      setStatus(statusData);
      setTools(toolsData);
    } catch (error: any) {
      console.error('Error loading MCP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await wailsMcpService.updateConfig(config);
      toast.success('Configuración guardada');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleStartServer = async () => {
    try {
      await wailsMcpService.updateConfig(config);
      await wailsMcpService.start();
      toast.success('Servidor MCP iniciado');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Error iniciando servidor');
    }
  };

  const handleStopServer = async () => {
    try {
      await wailsMcpService.stop();
      toast.success('Servidor MCP detenido');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Error deteniendo servidor');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.info('Copiado al portapapeles');
  };

  const getConnectionUrl = () => `http://localhost:${config.port}`;

  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, MCPTool[]>);

  const enabledToolsCount = tools.filter(t => t.enabled).length;

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    const disabledList = config.disabled_tools ? config.disabled_tools.split(',').map(t => t.trim()).filter(t => t) : [];

    if (enabled) {
      // Remove from disabled list
      const newList = disabledList.filter(t => t !== toolName);
      setConfig({ ...config, disabled_tools: newList.join(',') });
    } else {
      // Add to disabled list
      if (!disabledList.includes(toolName)) {
        disabledList.push(toolName);
      }
      setConfig({ ...config, disabled_tools: disabledList.join(',') });
    }

    // Update local tools state for immediate UI feedback
    setTools(tools.map(t => t.name === toolName ? { ...t, enabled } : t));
  };

  const handleEnableAll = () => {
    setConfig({ ...config, disabled_tools: '' });
    setTools(tools.map(t => ({ ...t, enabled: true })));
  };

  const handleDisableAll = () => {
    const allToolNames = tools.map(t => t.name).join(',');
    setConfig({ ...config, disabled_tools: allToolNames });
    setTools(tools.map(t => ({ ...t, enabled: false })));
  };

  const getClaudeDesktopConfig = () => {
    const baseConfig: any = {
      mcpServers: {
        "pos-server": {
          command: "npx",
          args: ["-y", "mcp-remote", `${getConnectionUrl()}/sse`]
        }
      }
    };
    if (config.api_key) {
      baseConfig.mcpServers["pos-server"].env = { MCP_API_KEY: config.api_key };
    }
    return JSON.stringify(baseConfig, null, 2);
  };

  const getClaudeCodeConfig = () => {
    return JSON.stringify({
      mcpServers: {
        "pos-server": {
          url: `${getConnectionUrl()}/sse`,
          ...(config.api_key && { headers: { "X-API-Key": config.api_key } })
        }
      }
    }, null, 2);
  };

  const getMcpRemoteCommand = () => {
    return `npx -y mcp-remote ${getConnectionUrl()}/sse`;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <AIIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5">Servidor MCP</Typography>
          <Typography variant="body2" color="text.secondary">
            Integración con Claude y otros modelos de IA via Model Context Protocol
          </Typography>
        </Box>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h6">Estado</Typography>
              <Chip
                label={status?.running ? 'Activo' : 'Inactivo'}
                color={status?.running ? 'success' : 'default'}
                size="small"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Actualizar">
                <IconButton onClick={loadData} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              {status?.running ? (
                <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={handleStopServer}>
                  Detener
                </Button>
              ) : (
                <Button variant="contained" color="success" startIcon={<PlayIcon />} onClick={handleStartServer}>
                  Iniciar
                </Button>
              )}
            </Box>
          </Box>

          {status?.running && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  Servidor ejecutándose en: <strong>{getConnectionUrl()}</strong>
                </Typography>
                <IconButton size="small" onClick={() => copyToClipboard(getConnectionUrl())}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Configuración</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Puerto"
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 8090 })}
                helperText="Puerto del servidor MCP (default: 8090)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="API Key (Opcional)"
                type="password"
                value={config.api_key}
                onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                helperText="Clave para autenticación"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="IPs Permitidas"
                value={config.allowed_ips}
                onChange={(e) => setConfig({ ...config, allowed_ips: e.target.value })}
                helperText="IPs separadas por coma (vacío = todas)"
                placeholder="127.0.0.1, 192.168.1.100"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.read_only_mode}
                    onChange={(e) => setConfig({ ...config, read_only_mode: e.target.checked })}
                  />
                }
                label="Modo Solo Lectura"
              />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4 }}>
                Solo permite consultas, no modificaciones
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" onClick={handleSaveConfig} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Conectar con Claude</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Tabs value={configTab} onChange={(_, v) => setConfigTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<DesktopIcon />} label="Claude Desktop" iconPosition="start" />
            <Tab icon={<TerminalIcon />} label="Claude Code" iconPosition="start" />
            <Tab icon={<CodeIcon />} label="Terminal" iconPosition="start" />
          </Tabs>

          <TabPanel value={configTab} index={0}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Archivo de configuración:
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code><br />
                • macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
              </Typography>
            </Alert>
            <Paper sx={{ bgcolor: 'grey.900', p: 2, borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: 'grey.500' }}>claude_desktop_config.json</Typography>
                <IconButton size="small" onClick={() => copyToClipboard(getClaudeDesktopConfig())} sx={{ color: 'grey.400' }}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography component="pre" sx={{ color: 'grey.100', fontSize: '0.8rem', m: 0, overflow: 'auto' }}>
                {getClaudeDesktopConfig()}
              </Typography>
            </Paper>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Requiere Node.js instalado. Reinicia Claude Desktop después de guardar.
            </Typography>
          </TabPanel>

          <TabPanel value={configTab} index={1}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Agrega esta configuración en tu archivo <code>~/.claude/settings.json</code> o en el proyecto <code>.claude/settings.json</code>
              </Typography>
            </Alert>
            <Paper sx={{ bgcolor: 'grey.900', p: 2, borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: 'grey.500' }}>settings.json</Typography>
                <IconButton size="small" onClick={() => copyToClipboard(getClaudeCodeConfig())} sx={{ color: 'grey.400' }}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography component="pre" sx={{ color: 'grey.100', fontSize: '0.8rem', m: 0, overflow: 'auto' }}>
                {getClaudeCodeConfig()}
              </Typography>
            </Paper>
          </TabPanel>

          <TabPanel value={configTab} index={2}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Usa <code>mcp-remote</code> para conectar desde cualquier cliente MCP compatible:
              </Typography>
            </Alert>
            <Paper sx={{ bgcolor: 'grey.900', p: 2, borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography component="pre" sx={{ color: 'grey.100', fontSize: '0.85rem', m: 0 }}>
                  {getMcpRemoteCommand()}
                </Typography>
                <IconButton size="small" onClick={() => copyToClipboard(getMcpRemoteCommand())} sx={{ color: 'grey.400' }}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Box>
            </Paper>
          </TabPanel>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">Herramientas Disponibles</Typography>
            <Chip
              label={`${enabledToolsCount}/${tools.length} habilitadas`}
              size="small"
              color={enabledToolsCount === tools.length ? 'success' : enabledToolsCount === 0 ? 'error' : 'warning'}
            />
            <Chip label={`${Object.keys(toolsByCategory).length} categorías`} size="small" variant="outlined" />
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button size="small" variant="outlined" onClick={handleEnableAll}>
              Habilitar Todas
            </Button>
            <Button size="small" variant="outlined" color="error" onClick={handleDisableAll}>
              Deshabilitar Todas
            </Button>
            <Button size="small" variant="contained" onClick={handleSaveConfig} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Deshabilita las herramientas que no quieras que estén disponibles para la IA.
              Los cambios se aplican al guardar y reiniciar el servidor.
            </Typography>
          </Alert>
          {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
            <Box key={category} sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{category}</Typography>
                <Chip
                  label={`${categoryTools.filter(t => t.enabled).length}/${categoryTools.length}`}
                  size="small"
                  color={categoryTools.every(t => t.enabled) ? 'success' : categoryTools.every(t => !t.enabled) ? 'default' : 'warning'}
                />
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 'bold', width: '60px' }}>Estado</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Herramienta</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Descripción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categoryTools.map((tool) => (
                      <TableRow key={tool.name} hover sx={{ opacity: tool.enabled ? 1 : 0.6 }}>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={tool.enabled}
                            onChange={(e) => handleToolToggle(tool.name, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <code style={{
                            backgroundColor: tool.enabled ? '#e8f5e9' : '#ffebee',
                            padding: '2px 6px',
                            borderRadius: 4,
                            textDecoration: tool.enabled ? 'none' : 'line-through'
                          }}>
                            {tool.name}
                          </code>
                        </TableCell>
                        <TableCell>{tool.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default MCPSettings;
