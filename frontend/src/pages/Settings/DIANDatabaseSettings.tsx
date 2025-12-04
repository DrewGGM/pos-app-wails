import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Storage as StorageIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsConfigManagerService, MySQLConfig } from '../../services/wailsConfigManagerService';

const DIANDatabaseSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const [mysqlConfig, setMysqlConfig] = useState<MySQLConfig>({
    enabled: false,
    host: 'localhost',
    port: 3306,
    database: 'dian_parametrics',
    username: 'root',
    password: '',
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const config = await wailsConfigManagerService.getDIANDatabaseConfig();
      if (config) {
        setMysqlConfig(config);
        setEnabled(config.enabled);
        if (config.enabled) {
          setConnectionTested(true);
        }
      }
    } catch (error: any) {
      console.error('Error loading DIAN database config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await wailsConfigManagerService.testMySQLConnection(mysqlConfig);
      toast.success('Conexión exitosa a la base de datos MySQL!');
      setConnectionTested(true);
    } catch (error: any) {
      toast.error(error?.message || 'Error al conectar a la base de datos MySQL');
      setConnectionTested(false);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (enabled && !connectionTested) {
      toast.warning('Por favor, prueba la conexión antes de guardar');
      return;
    }

    setSaving(true);
    try {
      const configToSave = { ...mysqlConfig, enabled };
      await wailsConfigManagerService.saveDIANDatabaseConfig(configToSave);
      toast.success('Configuración guardada exitosamente');
    } catch (error: any) {
      toast.error(error?.message || 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await wailsConfigManagerService.removeDIANDatabaseConfig();
      setEnabled(false);
      setConnectionTested(false);
      setMysqlConfig({
        enabled: false,
        host: 'localhost',
        port: 3306,
        database: 'dian_parametrics',
        username: 'root',
        password: '',
      });
      toast.success('Configuración eliminada');
    } catch (error: any) {
      toast.error(error?.message || 'Error al eliminar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <StorageIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
              <Box>
                <Typography variant="h6">Base de Datos Paramétricos DIAN (MySQL)</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configura la conexión a una base de datos MySQL externa con datos paramétricos de la DIAN
                </Typography>
              </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              Esta configuración es <strong>opcional</strong>. Permite conectar a una base de datos MySQL externa
              que contenga datos paramétricos de la DIAN como: municipios, departamentos, tipos de documentos,
              tipos de régimen, tipos de responsabilidades, etc.
            </Alert>

            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    if (!e.target.checked) {
                      setConnectionTested(false);
                    }
                  }}
                  color="primary"
                />
              }
              label="Habilitar conexión a BD Paramétricos DIAN"
              sx={{ mb: 3 }}
            />

            {enabled && (
              <>
                <Divider sx={{ mb: 3 }} />

                <Grid container spacing={3}>
                  <Grid item xs={12} md={8}>
                    <TextField
                      fullWidth
                      label="Host MySQL"
                      value={mysqlConfig.host}
                      onChange={(e) => {
                        setMysqlConfig({ ...mysqlConfig, host: e.target.value });
                        setConnectionTested(false);
                      }}
                      helperText="Dirección del servidor MySQL (ej: localhost, 192.168.1.100)"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Puerto"
                      type="number"
                      value={mysqlConfig.port}
                      onChange={(e) => {
                        setMysqlConfig({ ...mysqlConfig, port: parseInt(e.target.value) || 3306 });
                        setConnectionTested(false);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Nombre de Base de Datos"
                      value={mysqlConfig.database}
                      onChange={(e) => {
                        setMysqlConfig({ ...mysqlConfig, database: e.target.value });
                        setConnectionTested(false);
                      }}
                      helperText="Base de datos con tablas paramétricos DIAN"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Usuario"
                      value={mysqlConfig.username}
                      onChange={(e) => {
                        setMysqlConfig({ ...mysqlConfig, username: e.target.value });
                        setConnectionTested(false);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Contraseña"
                      type="password"
                      value={mysqlConfig.password}
                      onChange={(e) => {
                        setMysqlConfig({ ...mysqlConfig, password: e.target.value });
                        setConnectionTested(false);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="outlined"
                      onClick={handleTestConnection}
                      disabled={testing}
                      startIcon={testing ? <CircularProgress size={20} /> : connectionTested ? <CheckCircleIcon /> : null}
                      color={connectionTested ? 'success' : 'primary'}
                      fullWidth
                    >
                      {testing ? 'Probando conexión...' : connectionTested ? 'Conexión exitosa ✓' : 'Probar Conexión MySQL'}
                    </Button>
                  </Grid>
                </Grid>
              </>
            )}

            <Divider sx={{ my: 3 }} />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              {enabled && mysqlConfig.enabled && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleRemove}
                  disabled={saving}
                  startIcon={<DeleteIcon />}
                >
                  Eliminar Configuración
                </Button>
              )}
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || (enabled && !connectionTested)}
                startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              >
                {saving ? 'Guardando...' : 'Guardar Configuración'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Information Card */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Información sobre BD Paramétricos DIAN
            </Typography>
            <Alert severity="info">
              <Typography variant="body2" gutterBottom>
                La base de datos de paramétricos DIAN debe contener las siguientes tablas (según estructura estándar DIAN):
              </Typography>
              <ul style={{ marginTop: 8, marginBottom: 0 }}>
                <li><Typography variant="body2"><strong>countries</strong> - Países</Typography></li>
                <li><Typography variant="body2"><strong>departments</strong> - Departamentos de Colombia</Typography></li>
                <li><Typography variant="body2"><strong>municipalities</strong> - Municipios de Colombia</Typography></li>
                <li><Typography variant="body2"><strong>type_document_identifications</strong> - Tipos de documento de identificación</Typography></li>
                <li><Typography variant="body2"><strong>type_organizations</strong> - Tipos de organización</Typography></li>
                <li><Typography variant="body2"><strong>type_regimes</strong> - Tipos de régimen fiscal</Typography></li>
                <li><Typography variant="body2"><strong>type_liabilities</strong> - Tipos de responsabilidades fiscales</Typography></li>
                <li><Typography variant="body2"><strong>taxes</strong> - Impuestos (IVA, INC, etc.)</Typography></li>
                <li><Typography variant="body2"><strong>type_currencies</strong> - Tipos de moneda</Typography></li>
                <li><Typography variant="body2"><strong>payment_forms</strong> - Formas de pago</Typography></li>
                <li><Typography variant="body2"><strong>payment_methods</strong> - Métodos de pago</Typography></li>
              </ul>
            </Alert>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default DIANDatabaseSettings;
