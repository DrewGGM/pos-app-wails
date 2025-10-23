import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Receipt as ReceiptIcon,
  Print as PrintIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon,
  Palette as PaletteIcon,
  Language as LanguageIcon,
  Storage as StorageIcon,
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  QrCode as QrCodeIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Sync as SyncIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsDianService } from '../../services/wailsDianService';
import { wailsConfigService } from '../../services/wailsConfigService';
import { wailsPrinterService, DetectedPrinter } from '../../services/wailsPrinterService';
import { useEffect } from 'react';
import {
  GetDepartments,
  GetMunicipalitiesByDepartment,
  GetTypeRegimes,
  GetTypeLiabilities,
  GetTypeDocumentIdentifications,
  GetTypeOrganizations
} from '../../../wailsjs/go/services/ParametricService';
import { compressImageToBase64, validateImageFile } from '../../utils/imageUtils';

interface Department {
  id: number;
  country_id: number;
  name: string;
  code: string;
}

interface Municipality {
  id: number;
  department_id: number;
  name: string;
  code: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

const Settings: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [editMode, setEditMode] = useState(false);
  
  // Business Settings
  const [businessSettings, setBusinessSettings] = useState({
    name: '',
    legalName: '',
    nit: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo: '',
    departmentId: null as number | null,
    municipalityId: null as number | null,
    typeRegimeId: null as number | null,
    typeLiabilityId: null as number | null,
    typeDocumentId: null as number | null,
    typeOrganizationId: null as number | null,
  });

  // Parametric data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [regimes, setRegimes] = useState<any[]>([]);
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [organizationTypes, setOrganizationTypes] = useState<any[]>([]);

  // DIAN Settings (Colombian Electronic Invoice)
  const [dianSettings, setDianSettings] = useState({
    enabled: true,
    testMode: true,
    apiUrl: 'http://localhost:3000',
    resolution: '18760000001',
    prefix: 'SETT',
    startNumber: 1,
    endNumber: 100000,
    technicalKey: '',
    certificatePath: '',
    certificatePassword: '',
  });

  // Print Settings
  const [printSettings, setPrintSettings] = useState({
    defaultPrinter: 'EPSON TM-T20III',
    printLogo: true,
    printFooter: true,
    footerText: 'Gracias por su compra',
    autoPrint: true,
    copies: 1,
    paperSize: '80mm',
  });

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState({
    lowStock: true,
    newOrder: true,
    orderReady: true,
    dailyReport: true,
    soundEnabled: true,
    emailNotifications: false,
    notificationEmail: '',
  });

  // System Settings
  const [systemSettings, setSystemSettings] = useState({
    language: 'es',
    currency: 'COP',
    timezone: 'America/Bogota',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    theme: 'light',
    autoBackup: true,
    backupTime: '02:00',
  });

  // Sync Settings
  const [syncSettings, setSyncSettings] = useState({
    enableAutoSync: true,
    syncInterval: 5,
    retryAttempts: 3,
    retryDelay: 30,
  });

  // Printer Settings
  const [printerConfigs, setPrinterConfigs] = useState<any[]>([]);
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [detectingPrinters, setDetectingPrinters] = useState(false);
  const [showDetectedPrinters, setShowDetectedPrinters] = useState(false);
  const [editPrinterDialog, setEditPrinterDialog] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<any>(null);
  const [printerForm, setPrinterForm] = useState<any>({
    name: '',
    type: 'usb',
    connection_type: 'usb',
    address: '',
    port: 9100,
    model: '',
    paper_width: 80,
    is_default: false,
    is_active: true,
    print_logo: true,
    auto_cut: true,
    cash_drawer: false,
  });

  // Load configurations on mount
  useEffect(() => {
    loadBusinessConfig();
    loadDepartments();
    loadParametricData();
    loadDianConfig();
    loadPrinterConfigs();
    loadSyncConfig();
  }, []);

  // Load municipalities when department changes
  useEffect(() => {
    if (businessSettings.departmentId) {
      loadMunicipalities(businessSettings.departmentId);
    } else {
      setMunicipalities([]);
    }
  }, [businessSettings.departmentId]);

  const loadBusinessConfig = async () => {
    try {
      const config = await wailsConfigService.getRestaurantConfig();
      if (config) {
        // Combine NIT and DV for display
        const nitDisplay = (config as any).identification_number && (config as any).dv
          ? `${(config as any).identification_number}-${(config as any).dv}`
          : (config as any).identification_number || '';

        setBusinessSettings({
          name: config.name || '',
          legalName: (config as any).business_name || '',
          nit: nitDisplay,
          address: config.address || '',
          phone: config.phone || '',
          email: config.email || '',
          website: config.website || '',
          logo: config.logo || '',
          departmentId: (config as any).department_id || null,
          municipalityId: (config as any).municipality_id || null,
          typeRegimeId: (config as any).type_regime_id || null,
          typeLiabilityId: (config as any).type_liability_id || null,
          typeDocumentId: (config as any).type_document_id || null,
          typeOrganizationId: (config as any).type_organization_id || null,
        });
      }
    } catch (e) {
      console.error('Error loading business config:', e);
    }
  };

  const loadDepartments = async () => {
    try {
      const deps = await GetDepartments();
      setDepartments(deps);
    } catch (e) {
      console.error('Error loading departments:', e);
    }
  };

  const loadMunicipalities = async (departmentId: number) => {
    try {
      const muns = await GetMunicipalitiesByDepartment(departmentId);
      setMunicipalities(muns);
    } catch (e) {
      console.error('Error loading municipalities:', e);
    }
  };

  const loadParametricData = async () => {
    try {
      const [regs, liabs, docs, orgs] = await Promise.all([
        GetTypeRegimes(),
        GetTypeLiabilities(),
        GetTypeDocumentIdentifications(),
        GetTypeOrganizations()
      ]);
      setRegimes(regs);
      setLiabilities(liabs);
      setDocumentTypes(docs);
      setOrganizationTypes(orgs);
    } catch (e) {
      console.error('Error loading parametric data:', e);
    }
  };

  const loadDianConfig = async () => {
    try {
      const config = await wailsDianService.getConfig();
      if (config) {
        setDianSettings({
          enabled: config.is_enabled || false,
          testMode: config.environment === 'test',
          apiUrl: config.api_url || 'http://localhost:3000',
          resolution: config.resolution_number || '18760000001',
          prefix: config.resolution_prefix || 'SETP',
          startNumber: config.resolution_from || 990000000,
          endNumber: config.resolution_to || 995000000,
          technicalKey: config.technical_key || '',
          certificatePath: '',
          certificatePassword: '',
        });
      }
    } catch (e) {
      console.error('Error loading DIAN config:', e);
    }
  };

  const loadSyncConfig = async () => {
    try {
      const config = await wailsConfigService.getSyncConfig();
      if (config) {
        setSyncSettings({
          enableAutoSync: config.enable_auto_sync ?? true,
          syncInterval: config.sync_interval || 5,
          retryAttempts: config.retry_attempts || 3,
          retryDelay: config.retry_delay || 30,
        });
      }
    } catch (e) {
      console.error('Error loading sync config:', e);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const error = validateImageFile(file, 2); // 2MB max
    if (error) {
      toast.error(error);
      return;
    }

    try {
      toast.info('Comprimiendo imagen...');
      // Compress and convert to base64
      const base64 = await compressImageToBase64(file, 400, 400, 0.8);
      setBusinessSettings({ ...businessSettings, logo: base64 });
      toast.success('Logo cargado correctamente');
    } catch (err) {
      console.error('Error processing image:', err);
      toast.error('Error al procesar la imagen');
    }
  };

  const handleRemoveLogo = () => {
    setBusinessSettings({ ...businessSettings, logo: '' });
    toast.info('Logo eliminado');
  };

  const handleSaveBusinessSettings = async () => {
    try {
      // Split NIT and DV if format is "NIT-DV"
      const nitParts = (businessSettings.nit || '').split('-');
      const nit = nitParts[0]?.trim() || '';
      const dv = nitParts[1]?.trim() || '';

      // Get current config and update with new values
      const currentConfig = await wailsConfigService.getRestaurantConfig();
      const updatedConfig = {
        ...currentConfig,
        name: businessSettings.name,
        business_name: businessSettings.legalName,
        identification_number: nit,
        dv: dv,
        address: businessSettings.address,
        phone: businessSettings.phone,
        email: businessSettings.email,
        website: businessSettings.website,
        logo: businessSettings.logo,
        department_id: businessSettings.departmentId,
        municipality_id: businessSettings.municipalityId,
        type_regime_id: businessSettings.typeRegimeId,
        type_liability_id: businessSettings.typeLiabilityId,
        type_document_id: businessSettings.typeDocumentId,
        type_organization_id: businessSettings.typeOrganizationId,
      };

      await wailsConfigService.updateRestaurantConfig(updatedConfig);
      toast.success('Configuración guardada correctamente');
      setEditMode(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar configuración');
      console.error('Error saving business settings:', e);
    }
  };

  const handleSaveDianSettings = async () => {
    try {
      // Map local state to backend DIANConfig fields
      const current = await wailsDianService.getConfig();
      const updated = {
        ...current,
        is_enabled: dianSettings.enabled,
        environment: dianSettings.testMode ? 'test' : 'production',
        api_url: dianSettings.apiUrl,
        resolution_number: dianSettings.resolution,
        resolution_prefix: dianSettings.prefix,
        resolution_from: dianSettings.startNumber,
        resolution_to: dianSettings.endNumber,
        technical_key: dianSettings.technicalKey,
      };
      await wailsDianService.updateConfig(updated as any);
      toast.success('Configuración DIAN guardada');
    } catch (e:any) {
      toast.error(e?.message || 'Error guardando configuración DIAN');
    }
  };

  const handleTestPrint = async () => {
    try {
      // Get default printer (or any active printer)
      const defaultPrinter = await wailsConfigService.getDefaultPrinter();
      if (!defaultPrinter) {
        toast.error('No hay impresoras configuradas. Agrega una impresora primero.');
        return;
      }

      toast.info(`Enviando impresión de prueba a ${defaultPrinter.name}...`);
      await wailsPrinterService.testPrinter(defaultPrinter.id);
      toast.success('Impresión de prueba enviada correctamente');
    } catch (e: any) {
      const errorMsg = e?.message || 'Error al imprimir';
      if (errorMsg.includes('no active printer found') || errorMsg.includes('record not found')) {
        toast.error('No hay impresoras configuradas. Usa "Detectar Impresoras" o "Agregar Manualmente".');
      } else if (errorMsg.includes('no default printer configured')) {
        toast.error('Configura una impresora en Settings antes de imprimir.');
      } else {
        toast.error(`Error al imprimir: ${errorMsg}`);
      }
      console.error('Error testing printer:', e);
    }
  };

  const loadPrinterConfigs = async () => {
    try {
      const printers = await wailsConfigService.getPrinterConfigs();
      setPrinterConfigs(printers || []);
    } catch (e) {
      console.error('Error loading printers:', e);
    }
  };

  const handleSavePrinterConfig = async (config: any) => {
    try {
      await wailsConfigService.savePrinterConfig(config);
      toast.success('Configuración de impresora guardada');
      loadPrinterConfigs();
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando impresora');
    }
  };

  const handleDetectPrinters = async () => {
    setDetectingPrinters(true);
    try {
      const printers = await wailsPrinterService.getAvailablePrinters();
      setDetectedPrinters(printers);
      setShowDetectedPrinters(true);

      if (printers.length === 0) {
        toast.info('No se detectaron impresoras. Verifica que estén instaladas y encendidas.');
      } else {
        toast.success(`Se detectaron ${printers.length} impresora(s)`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Error detectando impresoras');
      console.error('Error detecting printers:', e);
    } finally {
      setDetectingPrinters(false);
    }
  };

  const handleAddDetectedPrinter = async (printer: DetectedPrinter) => {
    const config = {
      name: printer.name,
      type: printer.type,
      connection_type: printer.connection_type,
      address: printer.address,
      port: printer.port || 9100,
      model: printer.model || '',
      paper_width: 80,
      is_default: printer.is_default,
      is_active: true,
      print_logo: true,
      auto_cut: true,
      cash_drawer: false,
    };

    await handleSavePrinterConfig(config);
    setShowDetectedPrinters(false);
  };

  const handleOpenPrinterDialog = (printer?: any) => {
    if (printer) {
      setSelectedPrinter(printer);
      setPrinterForm(printer);
    } else {
      setSelectedPrinter(null);
      setPrinterForm({
        name: '',
        type: 'usb',
        connection_type: 'usb',
        address: '',
        port: 9100,
        model: '',
        paper_width: 80,
        is_default: false,
        is_active: true,
        print_logo: true,
        auto_cut: true,
        cash_drawer: false,
      });
    }
    setEditPrinterDialog(true);
  };

  const handleClosePrinterDialog = () => {
    setEditPrinterDialog(false);
    setSelectedPrinter(null);
  };

  const handleSavePrinterFromDialog = async () => {
    try {
      const config = selectedPrinter?.id
        ? { ...printerForm, id: selectedPrinter.id }
        : printerForm;

      await handleSavePrinterConfig(config);
      handleClosePrinterDialog();
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar impresora');
    }
  };

  const handleDeletePrinter = async (printerId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta impresora?')) {
      return;
    }

    try {
      await wailsConfigService.deletePrinterConfig(printerId);
      toast.success('Impresora eliminada');
      loadPrinterConfigs();
    } catch (e: any) {
      toast.error(e?.message || 'Error al eliminar impresora');
    }
  };

  const handleTestDianConnection = async () => {
    try {
      await wailsDianService.testConnection();
      toast.success('Conexión DIAN OK');
    } catch (e:any) {
      toast.error(e?.message || 'Error probando conexión DIAN');
    }
  };

  const handleConfigureCompany = async () => {
    try {
      // Este payload debe venir desde UI de empresa (NIT/DV/dir/email/etc.). Aquí tomamos mínimos de businessSettings
      const nitParts = (businessSettings.nit || '').split('-');
      const nit = nitParts[0]?.replace(/\D/g,'') || '';
      const dv = nitParts[1] || '';
      await wailsDianService.configureCompany({
        type_document_identification_id: 3,
        type_organization_id: 2,
        type_regime_id: 2,
        type_liability_id: 14,
        business_name: businessSettings.legalName || businessSettings.name,
        merchant_registration: '0000000-00',
        municipality_id: 820,
        address: businessSettings.address,
        phone: businessSettings.phone,
        email: businessSettings.email,
        mail_host: '',
        mail_port: '',
        mail_username: '',
        mail_password: '',
        mail_encryption: '',
        identification_number: nit,
        dv: dv,
      } as any);
      toast.success('Empresa configurada. Token guardado.');
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando empresa');
    }
  };

  const handleConfigureSoftware = async () => {
    try {
      await wailsDianService.configureSoftware();
      toast.success('Software configurado');
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando software');
    }
  };

  const handleConfigureCertificate = async () => {
    try {
      await wailsDianService.configureCertificate();
      toast.success('Certificado configurado');
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando certificado');
    }
  };

  const handleConfigureResolution = async () => {
    try {
      await wailsDianService.configureResolution();
      toast.success('Resolución configurada');
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando resolución');
    }
  };

  const handleChangeEnvironment = async () => {
    try {
      await wailsDianService.changeEnvironment(dianSettings.testMode ? 'test' : 'production');
      toast.success('Ambiente actualizado');
    } catch (e:any) {
      toast.error(e?.message || 'Error cambiando ambiente');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Configuración</Typography>
        <Button
          variant="contained"
          startIcon={editMode ? <SaveIcon /> : <EditIcon />}
          onClick={() => editMode ? handleSaveBusinessSettings() : setEditMode(true)}
        >
          {editMode ? 'Guardar Cambios' : 'Editar'}
        </Button>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={selectedTab}
          onChange={(_, value) => setSelectedTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<BusinessIcon />} label="Empresa" />
          <Tab icon={<ReceiptIcon />} label="Facturación" />
          <Tab icon={<PrintIcon />} label="Impresión" />
          <Tab icon={<SyncIcon />} label="Sincronización" />
          <Tab icon={<NotificationsIcon />} label="Notificaciones" />
          <Tab icon={<SecurityIcon />} label="Sistema" />
        </Tabs>

        <TabPanel value={selectedTab} index={0}>
          {/* Business Settings */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Información de la Empresa
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Nombre Comercial"
                        value={businessSettings.name}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          name: e.target.value,
                        })}
                        disabled={!editMode}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Razón Social"
                        value={businessSettings.legalName}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          legalName: e.target.value,
                        })}
                        disabled={!editMode}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="NIT"
                        value={businessSettings.nit}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          nit: e.target.value,
                        })}
                        disabled={!editMode}
                        helperText="Formato: NIT-DV (ej: 900123456-7)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Tipo de Documento</InputLabel>
                        <Select
                          value={businessSettings.typeDocumentId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            typeDocumentId: e.target.value as number,
                          })}
                          label="Tipo de Documento"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {documentTypes.map((doc: any) => (
                            <MenuItem key={doc.id} value={doc.id}>
                              {doc.code} - {doc.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Tipo de Régimen</InputLabel>
                        <Select
                          value={businessSettings.typeRegimeId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            typeRegimeId: e.target.value as number,
                          })}
                          label="Tipo de Régimen"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {regimes.map((reg: any) => (
                            <MenuItem key={reg.id} value={reg.id}>
                              {reg.code} - {reg.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Tipo de Responsabilidad</InputLabel>
                        <Select
                          value={businessSettings.typeLiabilityId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            typeLiabilityId: e.target.value as number,
                          })}
                          label="Tipo de Responsabilidad"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {liabilities.map((liab: any) => (
                            <MenuItem key={liab.id} value={liab.id}>
                              {liab.code} - {liab.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Tipo de Organización</InputLabel>
                        <Select
                          value={businessSettings.typeOrganizationId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            typeOrganizationId: e.target.value as number,
                          })}
                          label="Tipo de Organización"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {organizationTypes.map((org: any) => (
                            <MenuItem key={org.id} value={org.id}>
                              {org.code} - {org.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Departamento</InputLabel>
                        <Select
                          value={businessSettings.departmentId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            departmentId: e.target.value as number,
                            municipalityId: null, // Reset municipality when department changes
                          })}
                          label="Departamento"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {departments.map(dept => (
                            <MenuItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth disabled={!editMode || !businessSettings.departmentId}>
                        <InputLabel>Ciudad/Municipio</InputLabel>
                        <Select
                          value={businessSettings.municipalityId || ''}
                          onChange={(e) => setBusinessSettings({
                            ...businessSettings,
                            municipalityId: e.target.value as number,
                          })}
                          label="Ciudad/Municipio"
                        >
                          <MenuItem value="">
                            <em>Seleccione...</em>
                          </MenuItem>
                          {municipalities.map(mun => (
                            <MenuItem key={mun.id} value={mun.id}>
                              {mun.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Dirección"
                        value={businessSettings.address}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          address: e.target.value,
                        })}
                        disabled={!editMode}
                        InputProps={{
                          startAdornment: <LocationIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                        }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Teléfono"
                        value={businessSettings.phone}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          phone: e.target.value,
                        })}
                        disabled={!editMode}
                        InputProps={{
                          startAdornment: <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                        }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Email"
                        value={businessSettings.email}
                        onChange={(e) => setBusinessSettings({
                          ...businessSettings,
                          email: e.target.value,
                        })}
                        disabled={!editMode}
                        InputProps={{
                          startAdornment: <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                        }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="logo-upload"
                        onChange={handleLogoUpload}
                        disabled={!editMode}
                      />
                      <label htmlFor="logo-upload">
                        <Button
                          variant="outlined"
                          component="span"
                          fullWidth
                          disabled={!editMode}
                          startIcon={businessSettings.logo ? <ImageIcon /> : <UploadIcon />}
                        >
                          {businessSettings.logo ? 'Cambiar Logo' : 'Cargar Logo'}
                        </Button>
                      </label>
                    </Grid>
                    {businessSettings.logo && (
                      <Grid item xs={12}>
                        <Box
                          sx={{
                            textAlign: 'center',
                            p: 2,
                            border: '1px dashed #ccc',
                            borderRadius: 1,
                            position: 'relative',
                          }}
                        >
                          <img
                            src={businessSettings.logo}
                            alt="Logo"
                            style={{
                              maxWidth: '200px',
                              maxHeight: '200px',
                              objectFit: 'contain',
                            }}
                          />
                          {editMode && (
                            <IconButton
                              onClick={handleRemoveLogo}
                              sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                bgcolor: 'error.main',
                                color: 'white',
                                '&:hover': {
                                  bgcolor: 'error.dark',
                                },
                              }}
                              size="small"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                            Logo de la empresa (max 400x400px, comprimido)
                          </Typography>
                        </Box>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Horario de Atención
                  </Typography>
                  <List>
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day) => (
                      <ListItem key={day}>
                        <ListItemText
                          primary={day}
                          secondary="08:00 - 22:00"
                        />
                        <ListItemSecondaryAction>
                          <FormControlLabel
                            control={<Switch defaultChecked />}
                            label=""
                            disabled={!editMode}
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={selectedTab} index={1}>
          {/* DIAN Settings */}
          <Alert severity="info" sx={{ mb: 3 }}>
            Configuración para facturación electrónica según normativa DIAN Colombia
          </Alert>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dianSettings.enabled}
                    onChange={(e) => setDianSettings({
                      ...dianSettings,
                      enabled: e.target.checked,
                    })}
                  />
                }
                label="Habilitar Facturación Electrónica"
              />
            </Grid>

            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Conexión API DIAN</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="URL de API DIAN (localhost)"
                        value={dianSettings.apiUrl}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          apiUrl: e.target.value,
                        })}
                        helperText="Ejemplo: http://localhost:3000 (sin /api/ubl2.1 al final)"
                        placeholder="http://localhost:3000"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Resolución de Facturación</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número de Resolución"
                        value={dianSettings.resolution}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          resolution: e.target.value,
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Prefijo"
                        value={dianSettings.prefix}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          prefix: e.target.value,
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Inicial"
                        type="number"
                        value={dianSettings.startNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          startNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Final"
                        type="number"
                        value={dianSettings.endNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          endNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Configuración Técnica</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={dianSettings.testMode}
                            onChange={(e) => setDianSettings({
                              ...dianSettings,
                              testMode: e.target.checked,
                            })}
                          />
                        }
                        label="Modo de Pruebas"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Clave Técnica"
                        type="password"
                        value={dianSettings.technicalKey}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          technicalKey: e.target.value,
                        })}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth onClick={handleConfigureCompany}>
                        Paso 1: Configurar Empresa
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth onClick={handleConfigureSoftware}>
                        Paso 2: Configurar Software
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth onClick={handleConfigureCertificate}>
                        Paso 3: Configurar Certificado
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth onClick={handleConfigureResolution}>
                        Paso 4: Configurar Resolución
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleTestDianConnection}
                      >
                        Probar Conexión DIAN
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="contained" color="secondary" fullWidth onClick={handleChangeEnvironment}>
                        Aplicar Ambiente ({dianSettings.testMode ? 'Pruebas' : 'Producción'})
                      </Button>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleSaveDianSettings}
            >
              Guardar Configuración DIAN
            </Button>
          </Box>
        </TabPanel>

        <TabPanel value={selectedTab} index={2}>
          {/* Print Settings */}
          <Alert severity="info" sx={{ mb: 3 }}>
            Configuración de impresoras térmicas (USB/Red, formato 58/80mm)
          </Alert>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">
                      Impresoras Configuradas
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button
                        variant="outlined"
                        onClick={handleDetectPrinters}
                        disabled={detectingPrinters}
                        startIcon={<PrintIcon />}
                      >
                        {detectingPrinters ? 'Detectando...' : 'Detectar Impresoras'}
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => handleOpenPrinterDialog()}
                      >
                        Agregar Manualmente
                      </Button>
                    </Box>
                  </Box>

                  {/* Detected Printers Section */}
                  {showDetectedPrinters && detectedPrinters.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Alert severity="success" sx={{ mb: 2 }}>
                        Se detectaron {detectedPrinters.length} impresora(s) en el sistema.
                        Haz clic en "Agregar" para configurar una impresora.
                      </Alert>
                      <List>
                        {detectedPrinters.map((printer, index) => (
                          <ListItem key={index}>
                            <ListItemText
                              primary={printer.name || 'Impresora sin nombre'}
                              secondary={
                                <>
                                  <Typography component="span" variant="body2" color="text.primary">
                                    {printer.connection_type.toUpperCase()} - {printer.address}
                                  </Typography>
                                  {printer.model && ` - ${printer.model}`}
                                  {` - ${printer.status}`}
                                </>
                              }
                            />
                            <ListItemSecondaryAction>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => handleAddDetectedPrinter(printer)}
                              >
                                Agregar
                              </Button>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                      <Divider sx={{ my: 2 }} />
                    </Box>
                  )}

                  {printerConfigs.length === 0 ? (
                    <Alert severity="warning">
                      No hay impresoras configuradas. Agrega una para poder imprimir recibos.
                    </Alert>
                  ) : (
                    <List>
                      {printerConfigs.map((printer: any) => {
                        // Format connection type display
                        const connTypeDisplay =
                          printer.connection_type === 'ethernet' ? 'Red/Ethernet' :
                          printer.connection_type === 'windows_share' ? 'Windows' :
                          printer.connection_type === 'usb' ? 'USB' :
                          printer.connection_type === 'serial' ? 'Serial' :
                          printer.connection_type.toUpperCase();

                        return (
                          <ListItem key={printer.id}>
                            <ListItemText
                              primary={printer.name}
                              secondary={`${connTypeDisplay} - ${printer.paper_width}mm - ${printer.address}`}
                            />
                            <ListItemSecondaryAction>
                            <Chip
                              label={printer.is_default ? 'Principal' : 'Secundaria'}
                              color={printer.is_default ? 'primary' : 'default'}
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            <IconButton
                              onClick={() => handleOpenPrinterDialog(printer)}
                              sx={{ mr: 1 }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              onClick={() => handleDeletePrinter(printer.id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                        );
                      })}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Configuración de Formato
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={printSettings.printLogo}
                            onChange={(e) => setPrintSettings({
                              ...printSettings,
                              printLogo: e.target.checked,
                            })}
                          />
                        }
                        label="Incluir logo en recibos"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={printSettings.autoPrint}
                            onChange={(e) => setPrintSettings({
                              ...printSettings,
                              autoPrint: e.target.checked,
                            })}
                          />
                        }
                        label="Imprimir automáticamente"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={printSettings.printFooter}
                            onChange={(e) => setPrintSettings({
                              ...printSettings,
                              printFooter: e.target.checked,
                            })}
                          />
                        }
                        label="Incluir pie de página"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Texto del pie de página"
                        multiline
                        rows={3}
                        value={printSettings.footerText}
                        onChange={(e) => setPrintSettings({
                          ...printSettings,
                          footerText: e.target.value,
                        })}
                        disabled={!printSettings.printFooter}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Pruebas
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleTestPrint}
                        startIcon={<PrintIcon />}
                      >
                        Imprimir Prueba
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Copias de prueba"
                        type="number"
                        value={printSettings.copies}
                        onChange={(e) => setPrintSettings({
                          ...printSettings,
                          copies: Number(e.target.value),
                        })}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={selectedTab} index={3}>
          {/* Sync Settings */}
          <Alert severity="info" sx={{ mb: 3 }}>
            Configuración de sincronización offline y cola de reintentos
          </Alert>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Sincronización Automática
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={syncSettings.enableAutoSync}
                            onChange={(e) => setSyncSettings({
                              ...syncSettings,
                              enableAutoSync: e.target.checked,
                            })}
                          />
                        }
                        label="Habilitar sincronización automática"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Intervalo de sincronización (minutos)"
                        type="number"
                        value={syncSettings.syncInterval}
                        onChange={(e) => setSyncSettings({
                          ...syncSettings,
                          syncInterval: Number(e.target.value),
                        })}
                        disabled={!syncSettings.enableAutoSync}
                        helperText="Tiempo entre intentos de sincronización"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Intentos de reenvío"
                        type="number"
                        value={syncSettings.retryAttempts}
                        onChange={(e) => setSyncSettings({
                          ...syncSettings,
                          retryAttempts: Number(e.target.value),
                        })}
                        helperText="Número de reintentos antes de marcar como fallido"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Demora entre reintentos (segundos)"
                        type="number"
                        value={syncSettings.retryDelay}
                        onChange={(e) => setSyncSettings({
                          ...syncSettings,
                          retryDelay: Number(e.target.value),
                        })}
                        helperText="Tiempo de espera entre cada reintento"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={async () => {
                          try {
                            await wailsConfigService.updateSyncConfig(syncSettings as any);
                            toast.success('Configuración de sincronización guardada');
                          } catch (e: any) {
                            toast.error(e?.message || 'Error guardando configuración');
                          }
                        }}
                      >
                        Guardar Configuración
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Estado de Sincronización
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="Última sincronización"
                        secondary="Hace 5 minutos"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Órdenes pendientes"
                        secondary="0"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Facturas pendientes"
                        secondary="0"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Estado"
                        secondary="Sincronizado"
                      />
                    </ListItem>
                  </List>
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<SyncIcon />}
                    onClick={() => toast.info('Sincronizando...')}
                    sx={{ mt: 2 }}
                  >
                    Sincronizar Ahora
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={selectedTab} index={4}>
          {/* Notification Settings */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Notificaciones del Sistema
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="Stock Bajo"
                        secondary="Notificar cuando un producto esté por debajo del mínimo"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={notificationSettings.lowStock}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            lowStock: e.target.checked,
                          })}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Nueva Orden"
                        secondary="Notificar cuando se cree una nueva orden"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={notificationSettings.newOrder}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            newOrder: e.target.checked,
                          })}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Orden Lista"
                        secondary="Notificar cuando una orden esté lista"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={notificationSettings.orderReady}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            orderReady: e.target.checked,
                          })}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Reporte Diario"
                        secondary="Recibir resumen diario de ventas"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={notificationSettings.dailyReport}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            dailyReport: e.target.checked,
                          })}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Configuración de Notificaciones
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={notificationSettings.soundEnabled}
                            onChange={(e) => setNotificationSettings({
                              ...notificationSettings,
                              soundEnabled: e.target.checked,
                            })}
                          />
                        }
                        label="Sonido de notificaciones"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={notificationSettings.emailNotifications}
                            onChange={(e) => setNotificationSettings({
                              ...notificationSettings,
                              emailNotifications: e.target.checked,
                            })}
                          />
                        }
                        label="Notificaciones por email"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Email para notificaciones"
                        type="email"
                        value={notificationSettings.notificationEmail}
                        onChange={(e) => setNotificationSettings({
                          ...notificationSettings,
                          notificationEmail: e.target.value,
                        })}
                        disabled={!notificationSettings.emailNotifications}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={selectedTab} index={4}>
          {/* System Settings */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Configuración Regional
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Idioma</InputLabel>
                        <Select
                          value={systemSettings.language}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            language: e.target.value,
                          })}
                          label="Idioma"
                        >
                          <MenuItem value="es">Español</MenuItem>
                          <MenuItem value="en">English</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Moneda</InputLabel>
                        <Select
                          value={systemSettings.currency}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            currency: e.target.value,
                          })}
                          label="Moneda"
                        >
                          <MenuItem value="COP">COP - Peso Colombiano</MenuItem>
                          <MenuItem value="USD">USD - Dólar</MenuItem>
                          <MenuItem value="EUR">EUR - Euro</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Zona Horaria</InputLabel>
                        <Select
                          value={systemSettings.timezone}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            timezone: e.target.value,
                          })}
                          label="Zona Horaria"
                        >
                          <MenuItem value="America/Bogota">Bogotá</MenuItem>
                          <MenuItem value="America/Mexico_City">Ciudad de México</MenuItem>
                          <MenuItem value="America/New_York">Nueva York</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Formato de Hora</InputLabel>
                        <Select
                          value={systemSettings.timeFormat}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            timeFormat: e.target.value,
                          })}
                          label="Formato de Hora"
                        >
                          <MenuItem value="12h">12 horas</MenuItem>
                          <MenuItem value="24h">24 horas</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Backup y Seguridad
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={systemSettings.autoBackup}
                            onChange={(e) => setSystemSettings({
                              ...systemSettings,
                              autoBackup: e.target.checked,
                            })}
                          />
                        }
                        label="Backup automático diario"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Hora de backup"
                        type="time"
                        value={systemSettings.backupTime}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          backupTime: e.target.value,
                        })}
                        disabled={!systemSettings.autoBackup}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth>
                        Crear Backup Manual
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button variant="outlined" fullWidth color="warning">
                        Restaurar Backup
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>

      {/* Printer Edit Dialog */}
      <Dialog open={editPrinterDialog} onClose={handleClosePrinterDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedPrinter ? 'Editar Impresora' : 'Agregar Impresora'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nombre"
                value={printerForm.name}
                onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Conexión</InputLabel>
                <Select
                  value={printerForm.connection_type}
                  label="Tipo de Conexión"
                  onChange={(e) => {
                    const connType = e.target.value;
                    let type = connType;

                    // Map connection_type to backend type
                    if (connType === 'ethernet') {
                      type = 'network';
                    } else if (connType === 'windows_share') {
                      type = 'windows';
                    }

                    setPrinterForm({
                      ...printerForm,
                      connection_type: connType,
                      type: type
                    });
                  }}
                >
                  <MenuItem value="usb">USB</MenuItem>
                  <MenuItem value="ethernet">Red/Ethernet (TCP/IP)</MenuItem>
                  <MenuItem value="serial">Serial/COM</MenuItem>
                  <MenuItem value="windows_share">Windows Compartida</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Ancho de Papel</InputLabel>
                <Select
                  value={printerForm.paper_width}
                  label="Ancho de Papel"
                  onChange={(e) => setPrinterForm({ ...printerForm, paper_width: e.target.value })}
                >
                  <MenuItem value={58}>58mm</MenuItem>
                  <MenuItem value={80}>80mm</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Dirección"
                value={printerForm.address}
                onChange={(e) => setPrinterForm({ ...printerForm, address: e.target.value })}
                helperText={
                  printerForm.connection_type === 'usb' ? 'Puerto USB (ej: COM1, /dev/usb/lp0)' :
                  printerForm.connection_type === 'serial' ? 'Puerto serial (ej: COM1)' :
                  printerForm.connection_type === 'ethernet' ? 'Dirección IP (ej: 192.168.1.100)' :
                  printerForm.connection_type === 'windows_share' ? 'Ruta UNC o nombre (ej: \\\\COMPUTER\\Printer)' :
                  'Dirección de la impresora'
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Puerto"
                type="number"
                value={printerForm.port}
                onChange={(e) => setPrinterForm({ ...printerForm, port: parseInt(e.target.value) })}
                disabled={printerForm.connection_type !== 'ethernet'}
                helperText={printerForm.connection_type === 'ethernet' ? 'Puerto TCP (def: 9100)' : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Modelo (opcional)"
                value={printerForm.model}
                onChange={(e) => setPrinterForm({ ...printerForm, model: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={printerForm.is_default}
                    onChange={(e) => setPrinterForm({ ...printerForm, is_default: e.target.checked })}
                  />
                }
                label="Impresora Principal"
              />
            </Grid>
            <Grid item xs={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={printerForm.auto_cut}
                    onChange={(e) => setPrinterForm({ ...printerForm, auto_cut: e.target.checked })}
                  />
                }
                label="Corte Automático"
              />
            </Grid>
            <Grid item xs={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={printerForm.cash_drawer}
                    onChange={(e) => setPrinterForm({ ...printerForm, cash_drawer: e.target.checked })}
                  />
                }
                label="Cajón de Efectivo"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePrinterDialog}>Cancelar</Button>
          <Button onClick={handleSavePrinterFromDialog} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;
