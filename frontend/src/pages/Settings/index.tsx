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
  SystemUpdate as SystemUpdateIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
  Refresh as RefreshIcon,
  Send as SendIcon,
  Close as CloseIcon,
  CloudSync as CloudSyncIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsDianService } from '../../services/wailsDianService';
import { wailsConfigService } from '../../services/wailsConfigService';
import { wailsPrinterService, DetectedPrinter } from '../../services/wailsPrinterService';
import { wailsUpdateService, UpdateInfo } from '../../services/wailsUpdateService';
import { wailsWebSocketService, WebSocketStatus, WebSocketClient } from '../../services/wailsWebSocketService';
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
import GoogleSheetsSettings from './GoogleSheetsSettings';
import PaymentMethodsSettings from './PaymentMethodsSettings';

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
    apiUrl: '', // Must be configured in Settings
    merchantRegistration: '',
    softwareId: '',
    softwarePin: '',
    emailHost: '',
    emailPort: 587,
    emailUsername: '',
    emailPassword: '',
    emailEncryption: 'tls',
    resolution: '18760000001',
    prefix: 'SETP',
    startNumber: 990000000,
    endNumber: 995000000,
    technicalKey: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
    resolutionDate: '2019-01-19',
    dateFrom: '2019-01-19',
    dateTo: '2030-01-19',
    testSetId: '',
    useTestSetId: true, // By default, use test_set_id in URL for test mode
    consecutiveNumber: 0,
    // Credit Note (NC) Resolution
    ncPrefix: 'NC',
    ncStartNumber: 1,
    ncEndNumber: 99999999,
    ncResolution: '',
    ncConsecutiveNumber: 0,
    // Debit Note (ND) Resolution
    ndPrefix: 'ND',
    ndStartNumber: 1,
    ndEndNumber: 99999999,
    ndResolution: '',
    ndConsecutiveNumber: 0,
    certificate: '',
    certificatePassword: '',
    certificateFileName: '',
    apiToken: '',
  });

  // Track which configuration steps are completed
  const [completedSteps, setCompletedSteps] = useState({
    company: false,
    software: false,
    certificate: false,
    resolution: false,
    creditNote: false,
    debitNote: false,
    production: false,
  });

  // Print Settings
  const [printSettings, setPrintSettings] = useState({
    defaultPrinter: 'Impresora Térmica 80mm',
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

  // Update Settings
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string>('');

  // WebSocket Settings
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>({ running: false });
  const [wsClients, setWsClients] = useState<WebSocketClient[]>([]);
  const [refreshingWs, setRefreshingWs] = useState(false);

  // Load configurations on mount
  useEffect(() => {
    loadBusinessConfig();
    loadDepartments();
    loadParametricData();
    loadDianConfig();
    loadPrinterConfigs();
    loadSyncConfig();
    loadWebSocketStatus();
  }, []);

  // Auto-refresh WebSocket status every 5 seconds when on WebSocket tab
  useEffect(() => {
    if (selectedTab !== 6) return; // Only refresh when on WebSocket tab

    const interval = setInterval(() => {
      loadWebSocketStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedTab]);

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
          apiUrl: config.api_url || '',
          merchantRegistration: config.merchant_registration || '',
          softwareId: config.software_id || '',
          softwarePin: config.software_pin || '',
          emailHost: config.email_host || '',
          emailPort: config.email_port || 587,
          emailUsername: config.email_username || '',
          emailPassword: config.email_password || '',
          emailEncryption: config.email_encryption || 'tls',
          resolution: config.resolution_number || '18760000001',
          prefix: config.resolution_prefix || 'SETP',
          startNumber: config.resolution_from || 990000000,
          endNumber: config.resolution_to || 995000000,
          technicalKey: config.technical_key || 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
          resolutionDate: (config.resolution_date_from &&
                          config.resolution_date_from !== '0001-01-01T00:00:00Z' &&
                          config.resolution_date_from !== '')
            ? config.resolution_date_from.split('T')[0]
            : '2019-01-19',
          dateFrom: (config.resolution_date_from &&
                    config.resolution_date_from !== '0001-01-01T00:00:00Z' &&
                    config.resolution_date_from !== '')
            ? config.resolution_date_from.split('T')[0]
            : '2019-01-19',
          dateTo: (config.resolution_date_to &&
                  config.resolution_date_to !== '0001-01-01T00:00:00Z' &&
                  config.resolution_date_to !== '')
            ? config.resolution_date_to.split('T')[0]
            : '2030-01-19',
          testSetId: config.test_set_id || '',
          useTestSetId: config.use_test_set_id !== undefined ? config.use_test_set_id : true, // Default true
          consecutiveNumber: config.last_invoice_number || 0,
          // Credit Note (NC) Resolution
          ncPrefix: config.credit_note_resolution_prefix || 'NC',
          ncStartNumber: config.credit_note_resolution_from || 1,
          ncEndNumber: config.credit_note_resolution_to || 99999999,
          ncResolution: config.credit_note_resolution_number || '',
          ncConsecutiveNumber: config.last_credit_note_number || 0,
          // Debit Note (ND) Resolution
          ndPrefix: config.debit_note_resolution_prefix || 'ND',
          ndStartNumber: config.debit_note_resolution_from || 1,
          ndEndNumber: config.debit_note_resolution_to || 99999999,
          ndResolution: config.debit_note_resolution_number || '',
          ndConsecutiveNumber: config.last_debit_note_number || 0,
          certificate: config.certificate || '',
          certificatePassword: '', // Don't load password for security
          certificateFileName: config.certificate ? 'Certificado existente' : '',
          apiToken: config.api_token || '',
        });

        // Load step completion status from database
        setCompletedSteps({
          company: config.step1_completed || false,
          software: config.step2_completed || false,
          certificate: config.step3_completed || false,
          resolution: config.step4_completed || false,
          creditNote: config.step5_completed || false,
          debitNote: config.step6_completed || false,
          production: config.step7_completed || false,
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

  const loadWebSocketStatus = async () => {
    try {
      const status = await wailsWebSocketService.getStatus();
      setWsStatus(status);

      if (status.running) {
        const clients = await wailsWebSocketService.getConnectedClients();
        setWsClients(clients);
      }
    } catch (e) {
      console.error('Error loading WebSocket status:', e);
      setWsStatus({ running: false, error: 'Failed to load status' });
    }
  };

  const handleRefreshWebSocketStatus = async () => {
    setRefreshingWs(true);
    await loadWebSocketStatus();
    setRefreshingWs(false);
    toast.success('Estado actualizado');
  };

  const handleDisconnectClient = async (clientID: string) => {
    try {
      await wailsWebSocketService.disconnectClient(clientID);
      toast.success('Cliente desconectado');
      await loadWebSocketStatus();
    } catch (e: any) {
      toast.error(e?.message || 'Error al desconectar cliente');
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await wailsWebSocketService.sendTestNotification();
      toast.success('Notificación de prueba enviada');
    } catch (e: any) {
      toast.error(e?.message || 'Error al enviar notificación');
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

      // Sync with DIANConfig
      const dianConfig = await wailsDianService.getConfig();
      const updatedDianConfig = {
        ...dianConfig,
        identification_number: nit,
        dv: dv,
        business_name: businessSettings.legalName,
        type_document_id: businessSettings.typeDocumentId,
        type_organization_id: businessSettings.typeOrganizationId,
        type_regime_id: businessSettings.typeRegimeId,
        type_liability_id: businessSettings.typeLiabilityId,
        municipality_id: businessSettings.municipalityId,
      };
      await wailsDianService.updateConfig(updatedDianConfig as any);

      toast.success('Configuración guardada correctamente');
      setEditMode(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar configuración');
      console.error('Error saving business settings:', e);
    }
  };

  const handleSaveDianSettings = async () => {
    try {
      // Sync company data from RestaurantConfig to DIANConfig
      const nitParts = (businessSettings.nit || '').split('-');
      const nit = nitParts[0]?.trim() || '';
      const dv = nitParts[1]?.trim() || '';

      // Map local state to backend DIANConfig fields
      const current = await wailsDianService.getConfig();
      const updated = {
        ...current,
        is_enabled: dianSettings.enabled,
        environment: dianSettings.testMode ? 'test' : 'production',
        api_url: dianSettings.apiUrl,
        // Sync company data from Empresa tab
        identification_number: nit,
        dv: dv,
        business_name: businessSettings.legalName,
        type_document_id: businessSettings.typeDocumentId,
        type_organization_id: businessSettings.typeOrganizationId,
        type_regime_id: businessSettings.typeRegimeId,
        type_liability_id: businessSettings.typeLiabilityId,
        municipality_id: businessSettings.municipalityId,
        // DIAN specific fields
        merchant_registration: dianSettings.merchantRegistration,
        software_id: dianSettings.softwareId,
        software_pin: dianSettings.softwarePin,
        email_host: dianSettings.emailHost,
        email_port: dianSettings.emailPort,
        email_username: dianSettings.emailUsername,
        email_password: dianSettings.emailPassword,
        email_encryption: dianSettings.emailEncryption,
        resolution_number: dianSettings.resolution,
        resolution_prefix: dianSettings.prefix,
        resolution_from: dianSettings.startNumber,
        resolution_to: dianSettings.endNumber,
        technical_key: dianSettings.technicalKey,
        resolution_date_from: new Date(dianSettings.dateFrom),
        resolution_date_to: new Date(dianSettings.dateTo),
        test_set_id: dianSettings.testSetId,
        use_test_set_id: dianSettings.useTestSetId,
        last_invoice_number: dianSettings.consecutiveNumber,
      };

      // Only save certificate if it has been changed
      if (dianSettings.certificate) {
        updated.certificate = dianSettings.certificate;
      }
      if (dianSettings.certificatePassword) {
        updated.certificate_password = dianSettings.certificatePassword;
      }

      await wailsDianService.updateConfig(updated as any);
      toast.success('Configuración DIAN guardada y sincronizada con datos de empresa');
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
      toast.info('Sincronizando datos de empresa...');

      // Sync company data from RestaurantConfig to DIANConfig first
      const nitParts = (businessSettings.nit || '').split('-');
      const nit = nitParts[0]?.trim() || '';
      const dv = nitParts[1]?.trim() || '';

      if (!nit || !dv) {
        toast.error('Por favor completa el NIT y DV en la pestaña Empresa primero.');
        return;
      }

      const currentDianConfig = await wailsDianService.getConfig();
      const syncedDianConfig = {
        ...currentDianConfig,
        identification_number: nit,
        dv: dv,
        business_name: businessSettings.legalName,
        type_document_id: businessSettings.typeDocumentId,
        type_organization_id: businessSettings.typeOrganizationId,
        type_regime_id: businessSettings.typeRegimeId,
        type_liability_id: businessSettings.typeLiabilityId,
        municipality_id: businessSettings.municipalityId,
      };
      await wailsDianService.updateConfig(syncedDianConfig as any);

      toast.info('Configurando empresa con DIAN...');

      // Now call backend to configure company
      const result = await wailsDianService.configureCompany();

      // El token ya fue guardado automáticamente por el backend
      if (result?.token || result?.api_token) {
        toast.success(`Empresa configurada exitosamente. Token recibido y guardado.`);
        // Mark step as completed
        setCompletedSteps(prev => ({ ...prev, company: true }));
      } else {
        toast.success('Empresa configurada exitosamente.');
      }

      // Reload DIAN config to show updated token
      await loadDianConfig();
    } catch (e: any) {
      toast.error(e?.message || 'Error configurando empresa. Verifica que hayas completado la configuración de empresa y DIAN.');
      console.error('Error configuring company:', e);
    }
  };

  const handleConfigureSoftware = async () => {
    try {
      if (!dianSettings.softwareId || !dianSettings.softwarePin) {
        toast.error('Por favor ingresa el ID de Software y PIN primero y guarda la configuración.');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('Primero debes completar el Paso 1: Configurar Empresa para obtener el token.');
        return;
      }

      toast.info('Configurando software con DIAN...');

      // Ensure software config is saved
      const currentDianConfig = await wailsDianService.getConfig();
      const updatedConfig = {
        ...currentDianConfig,
        software_id: dianSettings.softwareId,
        software_pin: dianSettings.softwarePin,
      };
      await wailsDianService.updateConfig(updatedConfig as any);

      // Call backend to configure software with DIAN API
      await wailsDianService.configureSoftware();

      toast.success('Software configurado exitosamente con DIAN');
      // Mark step as completed
      setCompletedSteps(prev => ({ ...prev, software: true }));

      // Reload config
      await loadDianConfig();
    } catch (e: any) {
      toast.error(e?.message || 'Error configurando software');
      console.error('Error configuring software:', e);
    }
  };

  const handleCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file extension (should be .p12 or .pfx)
    const validExtensions = ['.p12', '.pfx'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      toast.error('El archivo debe ser un certificado .p12 o .pfx');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        // Remove the data:application/xxx;base64, prefix
        const base64Content = base64.split(',')[1];
        setDianSettings({
          ...dianSettings,
          certificate: base64Content,
          certificateFileName: file.name,
        });
        toast.success(`Certificado ${file.name} cargado correctamente`);
      };
      reader.onerror = () => {
        toast.error('Error al leer el archivo del certificado');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Error al cargar el certificado');
      console.error('Error loading certificate:', error);
    }
  };

  const handleConfigureCertificate = async () => {
    try {
      if (!dianSettings.certificate || !dianSettings.certificatePassword) {
        toast.error('Por favor carga el certificado y su contraseña primero.');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('Primero debes completar los pasos anteriores para obtener el token.');
        return;
      }

      toast.info('Configurando certificado con DIAN...');

      // Ensure certificate config is saved
      const currentDianConfig = await wailsDianService.getConfig();
      const updatedConfig = {
        ...currentDianConfig,
        certificate: dianSettings.certificate,
        certificate_password: dianSettings.certificatePassword,
      };
      await wailsDianService.updateConfig(updatedConfig as any);

      // Call backend to configure certificate with DIAN API
      await wailsDianService.configureCertificate();

      toast.success('Certificado configurado exitosamente con DIAN');
      // Mark step as completed
      setCompletedSteps(prev => ({ ...prev, certificate: true }));

      // Reload config
      await loadDianConfig();
    } catch (e: any) {
      toast.error(e?.message || 'Error configurando certificado');
      console.error('Error configuring certificate:', e);
    }
  };

  const handleConfigureResolution = async () => {
    try {
      // Validate required fields
      if (!dianSettings.resolution || !dianSettings.prefix || !dianSettings.technicalKey) {
        toast.error('Por favor completa todos los campos requeridos de la resolución (Número, Prefijo y Clave Técnica)');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('Primero debes completar los pasos anteriores para obtener el token.');
        return;
      }

      toast.info('Configurando resolución con DIAN...');

      // Ensure resolution config is saved
      const currentDianConfig = await wailsDianService.getConfig();
      const updatedConfig = {
        ...currentDianConfig,
        resolution_number: dianSettings.resolution,
        resolution_prefix: dianSettings.prefix,
        resolution_from: dianSettings.startNumber,
        resolution_to: dianSettings.endNumber,
        technical_key: dianSettings.technicalKey,
        resolution_date_from: new Date(dianSettings.dateFrom),
        resolution_date_to: new Date(dianSettings.dateTo),
        test_set_id: dianSettings.testSetId,
        use_test_set_id: dianSettings.useTestSetId,
        last_invoice_number: dianSettings.consecutiveNumber,
      };
      await wailsDianService.updateConfig(updatedConfig as any);

      // Call backend to configure resolution with DIAN API
      await wailsDianService.configureResolution();

      toast.success('Resolución configurada exitosamente con DIAN');
      setCompletedSteps(prev => ({ ...prev, resolution: true }));

      await loadDianConfig();
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando resolución');
      console.error('Error configuring resolution:', e);
    }
  };

  const handleConfigureCreditNoteResolution = async () => {
    try {
      // Validate required fields
      if (!dianSettings.ncPrefix) {
        toast.error('Por favor completa el prefijo de la resolución de Notas Crédito (NC)');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('Primero debes completar los pasos anteriores para obtener el token.');
        return;
      }

      toast.info('Configurando resolución de Notas Crédito (NC) con DIAN...');

      // Ensure NC resolution config is saved
      const currentDianConfig = await wailsDianService.getConfig();
      const updatedConfig = {
        ...currentDianConfig,
        credit_note_resolution_prefix: dianSettings.ncPrefix,
        credit_note_resolution_from: dianSettings.ncStartNumber || 1,
        credit_note_resolution_to: dianSettings.ncEndNumber || 99999999,
        credit_note_resolution_number: dianSettings.ncResolution || '',
        last_credit_note_number: dianSettings.ncConsecutiveNumber || 0,
      };
      await wailsDianService.updateConfig(updatedConfig as any);

      // Call backend to configure NC resolution with DIAN API
      await wailsDianService.configureCreditNoteResolution();

      toast.success('Resolución de Notas Crédito (NC) configurada exitosamente con DIAN');
      setCompletedSteps(prev => ({ ...prev, creditNote: true }));

      await loadDianConfig();
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando resolución de NC');
      console.error('Error configuring credit note resolution:', e);
    }
  };

  const handleConfigureDebitNoteResolution = async () => {
    try {
      // Validate required fields
      if (!dianSettings.ndPrefix) {
        toast.error('Por favor completa el prefijo de la resolución de Notas Débito (ND)');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('Primero debes completar los pasos anteriores para obtener el token.');
        return;
      }

      toast.info('Configurando resolución de Notas Débito (ND) con DIAN...');

      // Ensure ND resolution config is saved
      const currentDianConfig = await wailsDianService.getConfig();
      const updatedConfig = {
        ...currentDianConfig,
        debit_note_resolution_prefix: dianSettings.ndPrefix,
        debit_note_resolution_from: dianSettings.ndStartNumber || 1,
        debit_note_resolution_to: dianSettings.ndEndNumber || 99999999,
        debit_note_resolution_number: dianSettings.ndResolution || '',
        last_debit_note_number: dianSettings.ndConsecutiveNumber || 0,
      };
      await wailsDianService.updateConfig(updatedConfig as any);

      // Call backend to configure ND resolution with DIAN API
      await wailsDianService.configureDebitNoteResolution();

      toast.success('Resolución de Notas Débito (ND) configurada exitosamente con DIAN');
      setCompletedSteps(prev => ({ ...prev, debitNote: true }));

      await loadDianConfig();
    } catch (e:any) {
      toast.error(e?.message || 'Error configurando resolución de ND');
      console.error('Error configuring debit note resolution:', e);
    }
  };

  const handleMigrateToProduction = async () => {
    try {
      // Validate all previous steps are completed
      if (!completedSteps.debitNote) {
        toast.error('Por favor completa todos los pasos anteriores primero');
        return;
      }

      if (!dianSettings.apiToken) {
        toast.error('No se ha configurado el token de API');
        return;
      }

      toast.info('Migrando ambiente a Producción...');

      // Call backend to perform complete production migration
      // This will: 1) Change environment, 2) Get numbering ranges, 3) Update config, 4) Register resolution
      await wailsDianService.migrateToProduction();

      toast.success('Migración a Producción completada exitosamente. Resolución de producción configurada.');
      setCompletedSteps(prev => ({ ...prev, production: true }));

      // Update DIAN settings to reflect production mode
      setDianSettings(prev => ({ ...prev, testMode: false }));

      await loadDianConfig();
    } catch (e: any) {
      toast.error(e?.message || 'Error migrando a producción');
      console.error('Error migrating to production:', e);
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

  // Update handlers
  const loadCurrentVersion = async () => {
    try {
      const version = await wailsUpdateService.getCurrentVersion();
      if (version) {
        setCurrentVersion(version);
      }
    } catch (error) {
      console.error('Error loading current version:', error);
    }
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateProgress('Verificando actualizaciones...');
    try {
      const info = await wailsUpdateService.checkForUpdates();
      if (info) {
        setUpdateInfo(info);
        if (info.update_available) {
          toast.success(`Nueva versión ${info.latest_version} disponible!`);
        } else {
          toast.info('Ya tienes la última versión instalada');
        }
      }
    } catch (error: any) {
      console.error('Error checking for updates:', error);
      toast.error(error?.message || 'Error al verificar actualizaciones');
    } finally {
      setCheckingUpdate(false);
      setUpdateProgress('');
    }
  };

  const handleDownloadAndInstallUpdate = async () => {
    if (!updateInfo || !updateInfo.update_available) {
      toast.error('No hay actualizaciones disponibles');
      return;
    }

    setDownloadingUpdate(true);
    try {
      setUpdateProgress('Descargando actualización...');
      await wailsUpdateService.performUpdate();

      toast.success('Actualización instalada correctamente. Por favor, reinicia la aplicación.');
      setUpdateProgress('Actualización completada. Reinicia la aplicación.');
    } catch (error: any) {
      console.error('Error downloading/installing update:', error);
      toast.error(error?.message || 'Error al instalar la actualización');
      setUpdateProgress('');
    } finally {
      setDownloadingUpdate(false);
    }
  };

  // Load version on mount
  useEffect(() => {
    loadCurrentVersion();
  }, []);

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
          <Tab icon={<PaymentIcon />} label="Métodos de Pago" />
          <Tab icon={<PrintIcon />} label="Impresión" />
          <Tab icon={<SyncIcon />} label="Sincronización" />
          <Tab icon={<CloudSyncIcon />} label="Google Sheets" />
          <Tab icon={<NotificationsIcon />} label="Notificaciones" />
          <Tab icon={<SecurityIcon />} label="Sistema" />
          <Tab icon={<WifiIcon />} label="WebSocket" />
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

            {/* Configuration Status */}
            <Grid item xs={12}>
              {dianSettings.apiToken ? (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    Estado de Configuración: Empresa configurada
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                    Token API: {dianSettings.apiToken.substring(0, 20)}...
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    La empresa ha sido configurada exitosamente con DIAN. Ahora puedes proceder con los pasos de configuración de Software, Certificado y Resolución.
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    Estado de Configuración: Pendiente
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Debes completar "Paso 1: Configurar Empresa" para obtener el token API de DIAN.
                    Asegúrate de haber configurado correctamente los datos de la empresa y DIAN antes de continuar.
                  </Typography>
                </Alert>
              )}
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
                        label="URL de API DIAN *"
                        value={dianSettings.apiUrl}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          apiUrl: e.target.value,
                        })}
                        helperText="Ejemplo: http://localhost:3000 o http://api-dian.miempresa.com (sin /api/ubl2.1 al final)"
                        placeholder="http://localhost:3000"
                        required
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
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Clave Técnica (Technical Key)"
                        value={dianSettings.technicalKey}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          technicalKey: e.target.value,
                        })}
                        helperText="Clave técnica proporcionada por la DIAN para la resolución"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Fecha de Resolución"
                        type="date"
                        value={dianSettings.resolutionDate}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          resolutionDate: e.target.value,
                        })}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Vigencia Desde"
                        type="date"
                        value={dianSettings.dateFrom}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          dateFrom: e.target.value,
                        })}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Vigencia Hasta"
                        type="date"
                        value={dianSettings.dateTo}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          dateTo: e.target.value,
                        })}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Resolución de Notas Crédito (NC) */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Resolución de Notas Crédito (NC)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          Configura la resolución para Notas Crédito (NC). El prefijo y rango de numeración son requeridos.
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Prefijo NC"
                        value={dianSettings.ncPrefix}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ncPrefix: e.target.value,
                        })}
                        helperText="Prefijo para Notas Crédito (ej: NC)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número de Resolución NC"
                        value={dianSettings.ncResolution}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ncResolution: e.target.value,
                        })}
                        helperText="Número de resolución (opcional)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Inicial NC"
                        type="number"
                        value={dianSettings.ncStartNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ncStartNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Final NC"
                        type="number"
                        value={dianSettings.ncEndNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ncEndNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Último Consecutivo NC"
                        type="number"
                        value={dianSettings.ncConsecutiveNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ncConsecutiveNumber: Number(e.target.value),
                        })}
                        helperText="Último número de NC generado"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Resolución de Notas Débito (ND) */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Resolución de Notas Débito (ND)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          Configura la resolución para Notas Débito (ND). El prefijo y rango de numeración son requeridos.
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Prefijo ND"
                        value={dianSettings.ndPrefix}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ndPrefix: e.target.value,
                        })}
                        helperText="Prefijo para Notas Débito (ej: ND)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número de Resolución ND"
                        value={dianSettings.ndResolution}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ndResolution: e.target.value,
                        })}
                        helperText="Número de resolución (opcional)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Inicial ND"
                        type="number"
                        value={dianSettings.ndStartNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ndStartNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Número Final ND"
                        type="number"
                        value={dianSettings.ndEndNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ndEndNumber: Number(e.target.value),
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Último Consecutivo ND"
                        type="number"
                        value={dianSettings.ndConsecutiveNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          ndConsecutiveNumber: Number(e.target.value),
                        })}
                        helperText="Último número de ND generado"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Datos Adicionales de Facturación */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Datos Adicionales de Facturación</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          Estos campos se utilizan para el seguimiento interno de la facturación electrónica.
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Test Set ID"
                        value={dianSettings.testSetId}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          testSetId: e.target.value,
                        })}
                        helperText="ID del conjunto de pruebas DIAN (se asigna automáticamente)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={dianSettings.useTestSetId}
                            onChange={(e) => setDianSettings({
                              ...dianSettings,
                              useTestSetId: e.target.checked,
                            })}
                            color="primary"
                          />
                        }
                        label="Usar Test Set ID en URL"
                      />
                      <Typography variant="caption" color="textSecondary" display="block">
                        Activa esto para incluir el test_set_id en la URL de las pruebas.
                        Algunos conjuntos de pruebas no lo requieren.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Último Consecutivo"
                        type="number"
                        value={dianSettings.consecutiveNumber}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          consecutiveNumber: Number(e.target.value),
                        })}
                        helperText="Último número de factura generado"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Datos de Empresa (Referencia) */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Datos de Empresa para DIAN</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                          Datos cargados desde configuración de Empresa
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Los siguientes datos se toman de la pestaña "Empresa".
                          Si necesitas modificarlos, ve a la pestaña Empresa y guarda los cambios.
                          Se sincronizarán automáticamente con DIAN.
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="NIT"
                        value={businessSettings.nit}
                        disabled
                        helperText="Configurado en pestaña Empresa"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Razón Social"
                        value={businessSettings.legalName}
                        disabled
                        helperText="Configurado en pestaña Empresa"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Matrícula Mercantil"
                        value={dianSettings.merchantRegistration}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          merchantRegistration: e.target.value,
                        })}
                        placeholder="0000000-00"
                        helperText="Número de matrícula mercantil de la empresa (por defecto: 0000000-00)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Dirección"
                        value={businessSettings.address}
                        disabled
                        helperText="Configurado en pestaña Empresa"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Teléfono"
                        value={businessSettings.phone}
                        disabled
                        helperText="Configurado en pestaña Empresa"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Email"
                        value={businessSettings.email}
                        disabled
                        helperText="Configurado en pestaña Empresa"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Configuración de Email */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Configuración de Email (Envío de Facturas)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={8}>
                      <TextField
                        fullWidth
                        label="Host SMTP"
                        value={dianSettings.emailHost}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          emailHost: e.target.value,
                        })}
                        helperText="Ej: smtp.gmail.com"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Puerto"
                        type="number"
                        value={dianSettings.emailPort}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          emailPort: Number(e.target.value),
                        })}
                        helperText="Ej: 587"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Usuario Email"
                        type="email"
                        value={dianSettings.emailUsername}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          emailUsername: e.target.value,
                        })}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Contraseña Email"
                        type="password"
                        value={dianSettings.emailPassword}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          emailPassword: e.target.value,
                        })}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel>Tipo de Encriptación</InputLabel>
                        <Select
                          value={dianSettings.emailEncryption}
                          onChange={(e) => setDianSettings({
                            ...dianSettings,
                            emailEncryption: e.target.value,
                          })}
                          label="Tipo de Encriptación"
                        >
                          <MenuItem value="tls">TLS</MenuItem>
                          <MenuItem value="ssl">SSL</MenuItem>
                          <MenuItem value="none">Ninguna</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Software Configuration */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Configuración de Software DIAN</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="ID de Software"
                        value={dianSettings.softwareId}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          softwareId: e.target.value,
                        })}
                        helperText="UUID del software proporcionado por DIAN"
                        placeholder="82bf0c5e-0117-434d-9471-8a5ee58ae682"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="PIN de Software"
                        type="password"
                        value={dianSettings.softwarePin}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          softwarePin: e.target.value,
                        })}
                        helperText="PIN numérico del software"
                        placeholder="12345"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Certificate Configuration */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Configuración de Certificado DIAN</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <input
                        accept=".p12,.pfx"
                        style={{ display: 'none' }}
                        id="certificate-upload"
                        type="file"
                        onChange={handleCertificateUpload}
                      />
                      <label htmlFor="certificate-upload">
                        <Button variant="outlined" component="span" fullWidth>
                          {dianSettings.certificateFileName || 'Cargar Certificado (.p12 o .pfx)'}
                        </Button>
                      </label>
                      {dianSettings.certificateFileName && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1 }}>
                          ✓ Certificado cargado: {dianSettings.certificateFileName}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Contraseña del Certificado"
                        type="password"
                        value={dianSettings.certificatePassword}
                        onChange={(e) => setDianSettings({
                          ...dianSettings,
                          certificatePassword: e.target.value,
                        })}
                        helperText="Contraseña del archivo .p12 o .pfx"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Configuration Steps */}
            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Pasos de Configuración DIAN</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          Completa los siguientes pasos en orden para configurar la facturación electrónica con DIAN.
                          El sistema inicia en modo de pruebas por defecto.
                        </Typography>
                      </Alert>
                    </Grid>

                    {/* Step 1: Configure Company */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.company ? "contained" : "outlined"}
                        color={completedSteps.company ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureCompany}
                        disabled={completedSteps.company}
                        startIcon={completedSteps.company ? <span>✓</span> : null}
                      >
                        {completedSteps.company ? "✓ Paso 1 Completado: Empresa Configurada" : "Paso 1: Configurar Empresa"}
                      </Button>
                    </Grid>

                    {/* Step 2: Configure Software */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.software ? "contained" : "outlined"}
                        color={completedSteps.software ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureSoftware}
                        disabled={!completedSteps.company || completedSteps.software}
                        startIcon={completedSteps.software ? <span>✓</span> : null}
                      >
                        {completedSteps.software ? "✓ Paso 2 Completado: Software Configurado" : "Paso 2: Configurar Software"}
                      </Button>
                      {!completedSteps.company && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa el Paso 1 primero
                        </Typography>
                      )}
                    </Grid>

                    {/* Step 3: Configure Certificate */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.certificate ? "contained" : "outlined"}
                        color={completedSteps.certificate ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureCertificate}
                        disabled={!completedSteps.software || completedSteps.certificate}
                        startIcon={completedSteps.certificate ? <span>✓</span> : null}
                      >
                        {completedSteps.certificate ? "✓ Paso 3 Completado: Certificado Configurado" : "Paso 3: Configurar Certificado"}
                      </Button>
                      {!completedSteps.software && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa el Paso 2 primero
                        </Typography>
                      )}
                    </Grid>

                    {/* Step 4: Configure Resolution */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.resolution ? "contained" : "outlined"}
                        color={completedSteps.resolution ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureResolution}
                        disabled={!completedSteps.certificate || completedSteps.resolution}
                        startIcon={completedSteps.resolution ? <span>✓</span> : null}
                      >
                        {completedSteps.resolution ? "✓ Paso 4 Completado: Resolución de Factura Configurada" : "Paso 4: Configurar Resolución de Factura"}
                      </Button>
                      {!completedSteps.certificate && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa el Paso 3 primero
                        </Typography>
                      )}
                    </Grid>

                    {/* Step 5: Configure Credit Note Resolution */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.creditNote ? "contained" : "outlined"}
                        color={completedSteps.creditNote ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureCreditNoteResolution}
                        disabled={!completedSteps.resolution || completedSteps.creditNote}
                        startIcon={completedSteps.creditNote ? <span>✓</span> : null}
                      >
                        {completedSteps.creditNote ? "✓ Paso 5 Completado: Resolución NC Configurada" : "Paso 5: Configurar Resolución de Notas Crédito (NC)"}
                      </Button>
                      {!completedSteps.resolution && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa el Paso 4 primero
                        </Typography>
                      )}
                    </Grid>

                    {/* Step 6: Configure Debit Note Resolution */}
                    <Grid item xs={12}>
                      <Button
                        variant={completedSteps.debitNote ? "contained" : "outlined"}
                        color={completedSteps.debitNote ? "success" : "primary"}
                        fullWidth
                        onClick={handleConfigureDebitNoteResolution}
                        disabled={!completedSteps.resolution || completedSteps.debitNote}
                        startIcon={completedSteps.debitNote ? <span>✓</span> : null}
                      >
                        {completedSteps.debitNote ? "✓ Paso 6 Completado: Resolución ND Configurada" : "Paso 6: Configurar Resolución de Notas Débito (ND)"}
                      </Button>
                      {!completedSteps.resolution && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa el Paso 4 primero
                        </Typography>
                      )}
                    </Grid>

                    {/* Step 7: Migrate to Production */}
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleMigrateToProduction}
                        disabled={!completedSteps.debitNote || completedSteps.production}
                        startIcon={completedSteps.production ? <span>✓</span> : null}
                        sx={{
                          backgroundColor: completedSteps.production ? 'success.main' : 'warning.main',
                          '&:hover': {
                            backgroundColor: completedSteps.production ? 'success.dark' : 'warning.dark',
                          }
                        }}
                      >
                        {completedSteps.production ? "✓ Paso 7 Completado: En Producción" : "Paso 7: Migrar a Producción"}
                      </Button>
                      {!completedSteps.debitNote && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 2 }}>
                          Completa todos los pasos anteriores primero
                        </Typography>
                      )}
                      {!completedSteps.production && completedSteps.debitNote && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5, ml: 2, fontWeight: 'bold' }}>
                          ⚠️ Este paso cambiará el ambiente de pruebas a producción. Asegúrate de haber completado todas las pruebas necesarias.
                        </Typography>
                      )}
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
          {/* Payment Methods Settings */}
          <PaymentMethodsSettings />
        </TabPanel>

        <TabPanel value={selectedTab} index={3}>
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

        <TabPanel value={selectedTab} index={4}>
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

        <TabPanel value={selectedTab} index={5}>
          {/* Google Sheets Settings */}
          <GoogleSheetsSettings />
        </TabPanel>

        <TabPanel value={selectedTab} index={6}>
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

        <TabPanel value={selectedTab} index={7}>
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

            {/* Update Section */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SystemUpdateIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Actualizaciones del Sistema
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Alert severity="info" icon={<InfoIcon />}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          Versión Actual: {currentVersion || 'Cargando...'}
                        </Typography>
                        {updateInfo && (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            {updateInfo.update_available
                              ? `Nueva versión disponible: ${updateInfo.latest_version}`
                              : 'Estás utilizando la última versión'}
                          </Typography>
                        )}
                      </Alert>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Box sx={{ display: 'flex', gap: 2, height: '100%', alignItems: 'center' }}>
                        <Button
                          variant="outlined"
                          fullWidth
                          onClick={handleCheckForUpdates}
                          disabled={checkingUpdate || downloadingUpdate}
                          startIcon={<SystemUpdateIcon />}
                        >
                          {checkingUpdate ? 'Verificando...' : 'Verificar Actualizaciones'}
                        </Button>
                        {updateInfo?.update_available && (
                          <Button
                            variant="contained"
                            color="primary"
                            fullWidth
                            onClick={handleDownloadAndInstallUpdate}
                            disabled={downloadingUpdate || checkingUpdate}
                            startIcon={<CheckCircleIcon />}
                          >
                            {downloadingUpdate ? 'Instalando...' : 'Instalar Actualización'}
                          </Button>
                        )}
                      </Box>
                    </Grid>

                    {updateProgress && (
                      <Grid item xs={12}>
                        <Alert severity="info">
                          <Typography variant="body2">{updateProgress}</Typography>
                        </Alert>
                      </Grid>
                    )}

                    {updateInfo?.update_available && updateInfo.release_notes && (
                      <Grid item xs={12}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" gutterBottom>
                          Notas de la Versión {updateInfo.latest_version}
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: 200, overflow: 'auto' }}>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {updateInfo.release_notes}
                          </Typography>
                        </Paper>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Tamaño: {(updateInfo.file_size / 1024 / 1024).toFixed(2)} MB
                          {' • '}
                          Publicado: {new Date(updateInfo.published_at).toLocaleDateString('es-CO')}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={selectedTab} index={8}>
          {/* WebSocket Management */}
          <Grid container spacing={3}>
            {/* Server Status */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {wsStatus.running ? <WifiIcon sx={{ mr: 1, color: 'success.main' }} /> : <WifiOffIcon sx={{ mr: 1, color: 'error.main' }} />}
                      <Typography variant="h6">
                        Estado del Servidor
                      </Typography>
                    </Box>
                    <IconButton onClick={handleRefreshWebSocketStatus} disabled={refreshingWs}>
                      <RefreshIcon />
                    </IconButton>
                  </Box>

                  {wsStatus.error ? (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {wsStatus.error}
                    </Alert>
                  ) : (
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                            Estado:
                          </Typography>
                          <Chip
                            label={wsStatus.running ? 'Activo' : 'Inactivo'}
                            color={wsStatus.running ? 'success' : 'error'}
                            size="small"
                          />
                        </Box>
                      </Grid>

                      {wsStatus.running && (
                        <>
                          <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                                Puerto:
                              </Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {wsStatus.port}
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              Direcciones IP:
                            </Typography>
                            {wsStatus.local_ips && wsStatus.local_ips.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {wsStatus.local_ips.map((ip, idx) => (
                                  <Chip
                                    key={idx}
                                    label={`ws://${ip}:${wsStatus.port}`}
                                    size="small"
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No disponible
                              </Typography>
                            )}
                          </Grid>

                          <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                          </Grid>

                          <Grid item xs={6}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="primary.main">
                                {wsStatus.total_clients || 0}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Clientes Totales
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={6}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="info.main">
                                {wsStatus.kitchen_clients || 0}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Cocinas
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={6}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="warning.main">
                                {wsStatus.waiter_clients || 0}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Meseros
                              </Typography>
                            </Box>
                          </Grid>

                          <Grid item xs={6}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="success.main">
                                {wsStatus.pos_clients || 0}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                POS
                              </Typography>
                            </Box>
                          </Grid>
                        </>
                      )}
                    </Grid>
                  )}

                  {wsStatus.running && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="outlined"
                        startIcon={<SendIcon />}
                        onClick={handleSendTestNotification}
                        fullWidth
                      >
                        Enviar Notificación de Prueba
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Connected Clients */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Clientes Conectados
                  </Typography>

                  {wsClients.length === 0 ? (
                    <Alert severity="info">
                      No hay clientes conectados
                    </Alert>
                  ) : (
                    <List>
                      {wsClients.map((client) => (
                        <ListItem
                          key={client.id}
                          secondaryAction={
                            <IconButton
                              edge="end"
                              onClick={() => handleDisconnectClient(client.id)}
                              color="error"
                            >
                              <CloseIcon />
                            </IconButton>
                          }
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight="bold">
                                  {client.type.toUpperCase()}
                                </Typography>
                                <Chip
                                  label={
                                    client.type === 'kitchen' ? 'Cocina' :
                                    client.type === 'waiter' ? 'Mesero' :
                                    client.type === 'pos' ? 'POS' : client.type
                                  }
                                  size="small"
                                  color={
                                    client.type === 'kitchen' ? 'info' :
                                    client.type === 'waiter' ? 'warning' : 'success'
                                  }
                                />
                              </Box>
                            }
                            secondary={
                              <>
                                <Typography variant="caption" component="div">
                                  ID: {client.id.substring(0, 8)}...
                                </Typography>
                                <Typography variant="caption" component="div">
                                  IP: {client.remote_addr}
                                </Typography>
                                <Typography variant="caption" component="div">
                                  Conectado: {new Date(client.connected_at).toLocaleString('es-CO')}
                                </Typography>
                              </>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* WebSocket Information */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Información del WebSocket
                  </Typography>
                  <Alert severity="info">
                    <Typography variant="body2" gutterBottom>
                      El servidor WebSocket permite la comunicación en tiempo real con las aplicaciones móviles (Cocina y Meseros).
                    </Typography>
                    <Typography variant="body2" gutterBottom sx={{ mt: 1 }}>
                      <strong>Puerto:</strong> {wsStatus.port || '8080'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Tipos de clientes:</strong>
                    </Typography>
                    <ul style={{ marginTop: 8, marginBottom: 0 }}>
                      <li><Typography variant="body2">Kitchen - Recibe nuevas órdenes de cocina</Typography></li>
                      <li><Typography variant="body2">Waiter - Carga productos y envía órdenes</Typography></li>
                      <li><Typography variant="body2">POS - Notificaciones del sistema principal</Typography></li>
                    </ul>
                  </Alert>
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
