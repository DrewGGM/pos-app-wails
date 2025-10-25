import React, { useState, useEffect } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  TextField,
  Grid,
  Paper,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Storage as StorageIcon,
  Business as BusinessIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsConfigManagerService, DatabaseConfig, AppConfig, ExistingConfigData } from '../../services/wailsConfigManagerService';

const steps = ['Configuración de Base de Datos', 'Información del Negocio', 'Configuración del Sistema', 'Finalizar'];

interface SetupWizardProps {
  onSetupComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onSetupComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [existingConfig, setExistingConfig] = useState<ExistingConfigData | null>(null);

  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    host: 'localhost',
    port: 5432,
    database: 'pos_app_db',
    username: 'postgres',
    password: '',
    ssl_mode: 'disable',
  });

  const [businessConfig, setBusinessConfig] = useState({
    name: '',
    legal_name: '',
    nit: '',
    address: '',
    phone: '',
    email: '',
  });

  const [systemConfig, setSystemConfig] = useState({
    data_path: '',
    printer_name: '',
    language: 'es',
  });

  const handleNext = () => {
    if (activeStep === 0) {
      // Validate database connection before proceeding
      if (!connectionTested) {
        toast.error('Por favor, prueba la conexión a la base de datos primero');
        return;
      }
    }

    if (activeStep === steps.length - 1) {
      handleFinish();
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleSkipToFinish = () => {
    if (existingConfig && existingConfig.has_config) {
      setActiveStep(steps.length - 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await wailsConfigManagerService.testDatabaseConnection(dbConfig);
      toast.success('Conexión exitosa a la base de datos!');
      setConnectionTested(true);

      // Check if database already has configuration
      const existing = await wailsConfigManagerService.checkExistingConfig(dbConfig);
      if (existing && existing.has_config) {
        setExistingConfig(existing);
        // Pre-fill business config with existing data
        setBusinessConfig({
          name: existing.restaurant_name || '',
          legal_name: existing.business_name || '',
          nit: existing.nit || '',
          address: existing.address || '',
          phone: existing.phone || '',
          email: existing.email || '',
        });
        toast.info('Se detectó configuración existente en la base de datos. Puedes saltarla o modificarla.', {
          autoClose: 5000,
        });
      } else {
        setExistingConfig(null);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al conectar a la base de datos');
      setConnectionTested(false);
      setExistingConfig(null);
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // Step 1: Save ONLY database connection to config.json
      const appConfig: any = {
        database: dbConfig,
        first_run: true,
      };

      toast.info('Guardando configuración de base de datos...');
      await wailsConfigManagerService.saveConfig(appConfig);

      // Step 2: Initialize database (runs GORM migrations automatically)
      toast.info('Inicializando base de datos...');
      await wailsConfigManagerService.initializeDatabase(dbConfig);

      // Step 3: Save business info to database table (restaurant_configs)
      toast.info('Guardando información del negocio...');
      await wailsConfigManagerService.saveRestaurantConfig(
        businessConfig.name,
        businessConfig.legal_name,
        businessConfig.nit,
        businessConfig.address,
        businessConfig.phone,
        businessConfig.email
      );

      // Step 4: Complete setup (run seeds for admin user, etc.)
      toast.info('Configurando datos iniciales...');
      await wailsConfigManagerService.completeSetup();

      toast.success('Configuración completada exitosamente!');

      // Reload the app after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('Error completing setup:', error);
      toast.error(error?.message || 'Error al completar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <StorageIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5">Configuración de Base de Datos PostgreSQL</Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 3 }}>
                Asegúrate de tener PostgreSQL instalado y corriendo. Se creará la base de datos si no existe.
              </Alert>

              <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Host"
                    value={dbConfig.host}
                    onChange={(e) => {
                      setDbConfig({ ...dbConfig, host: e.target.value });
                      setConnectionTested(false);
                    }}
                    helperText="Dirección del servidor PostgreSQL (ej: localhost, 192.168.1.100)"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Puerto"
                    type="number"
                    value={dbConfig.port}
                    onChange={(e) => {
                      setDbConfig({ ...dbConfig, port: parseInt(e.target.value) || 5432 });
                      setConnectionTested(false);
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Nombre de Base de Datos"
                    value={dbConfig.database}
                    onChange={(e) => {
                      setDbConfig({ ...dbConfig, database: e.target.value });
                      setConnectionTested(false);
                    }}
                    helperText="Se creará automáticamente si no existe"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>SSL Mode</InputLabel>
                    <Select
                      value={dbConfig.ssl_mode}
                      label="SSL Mode"
                      onChange={(e) => {
                        setDbConfig({ ...dbConfig, ssl_mode: e.target.value });
                        setConnectionTested(false);
                      }}
                    >
                      <MenuItem value="disable">Disable</MenuItem>
                      <MenuItem value="require">Require</MenuItem>
                      <MenuItem value="verify-ca">Verify CA</MenuItem>
                      <MenuItem value="verify-full">Verify Full</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Usuario"
                    value={dbConfig.username}
                    onChange={(e) => {
                      setDbConfig({ ...dbConfig, username: e.target.value });
                      setConnectionTested(false);
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Contraseña"
                    type="password"
                    value={dbConfig.password}
                    onChange={(e) => {
                      setDbConfig({ ...dbConfig, password: e.target.value });
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
                    {testing ? 'Probando conexión...' : connectionTested ? 'Conexión exitosa ✓' : 'Probar Conexión'}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );

      case 1:
        return (
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <BusinessIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5">Información del Negocio</Typography>
              </Box>

              {existingConfig && existingConfig.has_config ? (
                <Alert severity="success" sx={{ mb: 3 }}>
                  <strong>Configuración Existente Detectada</strong>
                  <br />
                  Se ha cargado la información existente de tu negocio: <strong>{existingConfig.restaurant_name}</strong>
                  <br />
                  Puedes modificarla o continuar con la configuración actual.
                </Alert>
              ) : (
                <Alert severity="info" sx={{ mb: 3 }}>
                  Esta información se utilizará en las facturas y configuración DIAN. Podrás editarla más tarde.
                </Alert>
              )}

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Nombre Comercial"
                    value={businessConfig.name}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, name: e.target.value })}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Razón Social"
                    value={businessConfig.legal_name}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, legal_name: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="NIT"
                    value={businessConfig.nit}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, nit: e.target.value })}
                    helperText="Formato: NIT-DV (ej: 900123456-7)"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Teléfono"
                    value={businessConfig.phone}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, phone: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={businessConfig.email}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, email: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Dirección"
                    value={businessConfig.address}
                    onChange={(e) => setBusinessConfig({ ...businessConfig, address: e.target.value })}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SettingsIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5">Configuración del Sistema</Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 3 }}>
                Configuración opcional del sistema. Puedes dejarlo en blanco y configurarlo más tarde.
              </Alert>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Ruta de Datos"
                    value={systemConfig.data_path}
                    onChange={(e) => setSystemConfig({ ...systemConfig, data_path: e.target.value })}
                    helperText="Ruta donde se guardarán archivos de datos (opcional)"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Nombre de Impresora"
                    value={systemConfig.printer_name}
                    onChange={(e) => setSystemConfig({ ...systemConfig, printer_name: e.target.value })}
                    helperText="Nombre de la impresora por defecto (opcional)"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Idioma</InputLabel>
                    <Select
                      value={systemConfig.language}
                      label="Idioma"
                      onChange={(e) => setSystemConfig({ ...systemConfig, language: e.target.value })}
                    >
                      <MenuItem value="es">Español</MenuItem>
                      <MenuItem value="en">English</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card>
            <CardContent>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                <Typography variant="h4" gutterBottom>
                  ¡Listo para Comenzar!
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Se creará la configuración con los siguientes datos:
                </Typography>

                <Grid container spacing={2} sx={{ textAlign: 'left', maxWidth: 600, mx: 'auto' }}>
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">Base de Datos</Typography>
                      <Typography variant="body2">
                        {dbConfig.username}@{dbConfig.host}:{dbConfig.port}/{dbConfig.database}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">Negocio</Typography>
                      <Typography variant="body2">
                        {businessConfig.name || 'Sin configurar'}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">Idioma</Typography>
                      <Typography variant="body2">
                        {systemConfig.language === 'es' ? 'Español' : 'English'}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                <Alert severity="success" sx={{ mt: 3, maxWidth: 600, mx: 'auto' }}>
                  Se creará un usuario administrador por defecto:
                  <br />
                  <strong>Usuario:</strong> admin | <strong>Contraseña:</strong> admin
                </Alert>
              </Box>
            </CardContent>
          </Card>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      p: 3,
    }}>
      <Box sx={{ maxWidth: 900, width: '100%' }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h3" align="center" gutterBottom>
            Configuración Inicial
          </Typography>
          <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 4 }}>
            Bienvenido a PosApp. Configuremos tu sistema en unos simples pasos.
          </Typography>

          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mb: 3 }}>
            {renderStepContent(activeStep)}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
            <Button
              disabled={activeStep === 0 || loading}
              onClick={handleBack}
            >
              Atrás
            </Button>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {existingConfig && existingConfig.has_config && activeStep > 0 && activeStep < steps.length - 1 && (
                <Button
                  variant="outlined"
                  color="success"
                  onClick={handleSkipToFinish}
                  disabled={loading}
                >
                  Usar Config. Existente y Finalizar
                </Button>
              )}
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    Configurando...
                  </>
                ) : activeStep === steps.length - 1 ? (
                  'Finalizar'
                ) : (
                  'Siguiente'
                )}
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default SetupWizard;
