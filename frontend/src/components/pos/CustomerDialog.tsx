import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Person as PersonIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Edit as EditIcon,
  History as HistoryIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { Customer } from '../../types/models';
import { wailsSalesService } from '../../services/wailsSalesService';
import { wailsPrinterService } from '../../services/wailsPrinterService';
import { toast } from 'react-toastify';

interface CustomerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: Customer | null) => void;
  selectedCustomer: Customer | null;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onClose,
  onSelectCustomer,
  selectedCustomer,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    identification_type: 'CC',
    identification_number: '',
    email: '',
    phone: '',
    address: '',
    // DIAN corporate fields (optional, only for NIT)
    type_regime_id: undefined,
    type_liability_id: undefined,
    municipality_id: undefined,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    // Only populate formData with selectedCustomer if we're on the search tab (tab 0)
    // This prevents overwriting the form when creating a new customer (tab 1)
    if (selectedCustomer && tabValue === 0) {
      setFormData(selectedCustomer);
      setEditMode(true);
    }
  }, [selectedCustomer, tabValue]);

  // Debug: Track formData changes for corporate fields
  useEffect(() => {
    if (formData.identification_type === 'NIT') {
      console.log('📊 FormData actualizado (NIT):', {
        type_regime_id: formData.type_regime_id,
        type_liability_id: formData.type_liability_id,
        municipality_id: formData.municipality_id,
      });
    }
  }, [formData.type_regime_id, formData.type_liability_id, formData.municipality_id, formData.identification_type]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.warning('Ingrese un término de búsqueda');
      return;
    }

    setLoading(true);
    try {
      const results = await wailsSalesService.searchCustomers(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        toast.info('No se encontraron clientes');
      }
    } catch (error) {
      toast.error('Error al buscar clientes');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Required fields per DIAN Resolución 0165 de 2023:
    // - name, identification_number, email
    // All other fields are OPTIONAL (phone, address, etc.)

    if (!formData.name?.trim()) {
      errors.name = 'El nombre es requerido';
    }

    if (!formData.identification_number?.trim()) {
      errors.identification_number = 'El número de identificación es requerido';
    } else if (!/^\d+$/.test(formData.identification_number)) {
      errors.identification_number = 'Solo se permiten números';
    }

    if (!formData.email?.trim()) {
      errors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email inválido';
    }

    // Optional field validation - only validate format if provided
    if (formData.phone && !/^\d{7,10}$/.test(formData.phone.replace(/\s/g, ''))) {
      errors.phone = 'Teléfono inválido (7-10 dígitos)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCustomer = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Guardando cliente:', formData); // Debug log

      if (editMode && formData.id) {
        await wailsSalesService.updateCustomer(formData.id, formData);
        toast.success('Cliente actualizado');
      } else {
        await wailsSalesService.createCustomer(formData);
        toast.success('Cliente registrado');
      }

      // Re-fetch to get the saved customer with ID
      const savedCustomer = formData.id
        ? await wailsSalesService.getCustomer(formData.id)
        : (await wailsSalesService.searchCustomers(formData.identification_number!))[0];

      onSelectCustomer(savedCustomer);
      handleClose();
    } catch (error: any) {
      if (error.message?.includes('duplicate') || error.message?.includes('existe')) {
        toast.error('Ya existe un cliente con ese número de identificación');
      } else {
        toast.error('Error al guardar cliente');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer);
    handleClose();
  };

  const handleRemoveCustomer = () => {
    onSelectCustomer(null);
    handleClose();
  };

  const handleClose = () => {
    setTabValue(0);
    setSearchQuery('');
    setSearchResults([]);
    setFormData({
      name: '',
      identification_type: 'CC',
      identification_number: '',
      email: '',
      phone: '',
      address: '',
      type_regime_id: undefined,
      type_liability_id: undefined,
      municipality_id: undefined,
    });
    setFormErrors({});
    setEditMode(false);
    onClose();
  };

  const handlePrintCustomerForm = async () => {
    try {
      await wailsPrinterService.printCustomerDataForm();
      toast.success('Formato impreso correctamente');
    } catch (error) {
      toast.error('Error al imprimir formato');
    }
  };

  const calculateDV = (nit: string): string => {
    // Colombian NIT check digit calculation
    const primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let sum = 0;
    
    for (let i = 0; i < nit.length && i < primes.length; i++) {
      sum += parseInt(nit[nit.length - 1 - i]) * primes[i];
    }
    
    const remainder = sum % 11;
    return remainder < 2 ? remainder.toString() : (11 - remainder).toString();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PersonIcon />
          <Typography variant="h6">Gestión de Cliente</Typography>
          {selectedCustomer && (
            <Chip
              label={selectedCustomer.name}
              color="primary"
              onDelete={handleRemoveCustomer}
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tabValue} onChange={(_, value) => {
          setTabValue(value);
          // Reset form when switching to "New Customer" tab
          if (value === 1) {
            setFormData({
              name: '',
              identification_type: 'CC',
              identification_number: '',
              email: '',
              phone: '',
              address: '',
              type_regime_id: undefined,
              type_liability_id: undefined,
              municipality_id: undefined,
            });
            setEditMode(false);
            setFormErrors({});
          }
        }}>
          <Tab label="Buscar Cliente" icon={<SearchIcon />} />
          <Tab label="Nuevo Cliente" icon={<AddIcon />} />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {/* Search Tab */}
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              label="Buscar por nombre o identificación"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              fullWidth
              variant="contained"
              onClick={handleSearch}
              sx={{ mt: 1 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Buscar'}
            </Button>
          </Box>

          {searchResults.length > 0 && (
            <List>
              {searchResults.map((customer) => (
                <ListItem key={customer.id} disablePadding>
                  <ListItemButton onClick={() => handleSelectCustomer(customer)}>
                    <Avatar sx={{ mr: 2 }}>
                      <PersonIcon />
                    </Avatar>
                    <ListItemText
                      primary={customer.name}
                      secondary={
                        <>
                          {customer.identification_type}: {customer.identification_number}
                          {customer.dv && `-${customer.dv}`}
                          {customer.phone && ` • Tel: ${customer.phone}`}
                        </>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}

          {/* Quick consumer button */}
          <Box sx={{ mt: 3 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={handleRemoveCustomer}
            >
              Consumidor Final (Sin Cliente)
            </Button>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {/* New Customer Tab */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PrintIcon />}
              onClick={handlePrintCustomerForm}
            >
              Imprimir Formato Datos
            </Button>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Tipo ID</InputLabel>
                <Select
                  value={formData.identification_type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    // When changing to NIT, initialize corporate fields with defaults if not set
                    if (newType === 'NIT') {
                      setFormData({
                        ...formData,
                        identification_type: newType,
                        type_regime_id: formData.type_regime_id ?? 2,
                        type_liability_id: formData.type_liability_id ?? 117,
                        municipality_id: formData.municipality_id ?? 820,
                      });
                    } else {
                      // When changing away from NIT, clear corporate fields
                      setFormData({
                        ...formData,
                        identification_type: newType,
                        type_regime_id: undefined,
                        type_liability_id: undefined,
                        municipality_id: undefined,
                        dv: undefined,
                      });
                    }
                  }}
                  label="Tipo ID"
                >
                  <MenuItem value="CC">Cédula</MenuItem>
                  <MenuItem value="NIT">NIT</MenuItem>
                  <MenuItem value="CE">Cédula Extranjería</MenuItem>
                  <MenuItem value="PA">Pasaporte</MenuItem>
                  <MenuItem value="TI">Tarjeta Identidad</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Número de Identificación"
                value={formData.identification_number}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setFormData({ ...formData, identification_number: value });
                  
                  // Auto-calculate DV for NIT
                  if (formData.identification_type === 'NIT' && value.length >= 8) {
                    const dv = calculateDV(value);
                    setFormData(prev => ({ ...prev, dv }));
                  }
                }}
                error={!!formErrors.identification_number}
                helperText={formErrors.identification_number}
                InputProps={{
                  endAdornment: formData.identification_type === 'NIT' && formData.dv && (
                    <InputAdornment position="end">
                      <Chip label={`DV: ${formData.dv}`} size="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nombre Completo / Razón Social"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={!!formErrors.name}
                helperText={formErrors.name}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={!!formErrors.email}
                helperText={formErrors.email}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Teléfono (Opcional)"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                error={!!formErrors.phone}
                helperText={formErrors.phone}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Dirección (Opcional)"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>

            {/* DIAN Corporate Fields - Only shown for NIT */}
            {formData.identification_type === 'NIT' && (
              <>
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ mb: 1 }}>
                    Campos adicionales opcionales para facturación electrónica (no requeridos por DIAN)
                  </Alert>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo Régimen</InputLabel>
                    <Select
                      value={formData.type_regime_id || 2}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        console.log('🔄 Cambiando Type Regime ID:', formData.type_regime_id, '→', newValue);
                        setFormData({ ...formData, type_regime_id: newValue });
                      }}
                      label="Tipo Régimen"
                    >
                      <MenuItem value={1}>Responsable de IVA</MenuItem>
                      <MenuItem value={2}>No Responsable de IVA</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Responsabilidad</InputLabel>
                    <Select
                      value={formData.type_liability_id || 117}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        console.log('🔄 Cambiando Type Liability ID:', formData.type_liability_id, '→', newValue);
                        setFormData({ ...formData, type_liability_id: newValue });
                      }}
                      label="Responsabilidad"
                    >
                      <MenuItem value={117}>No responsable</MenuItem>
                      <MenuItem value={7}>Gran contribuyente</MenuItem>
                      <MenuItem value={9}>Autorretenedor</MenuItem>
                      <MenuItem value={14}>Agente de retención IVA</MenuItem>
                      <MenuItem value={112}>Régimen Simple (SIMPLE)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Municipio</InputLabel>
                    <Select
                      value={formData.municipality_id || 820}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        console.log('🔄 Cambiando Municipality ID:', formData.municipality_id, '→', newValue);
                        setFormData({ ...formData, municipality_id: newValue });
                      }}
                      label="Municipio"
                    >
                      <MenuItem value={820}>Armenia</MenuItem>
                      <MenuItem value={821}>Buenavista</MenuItem>
                      <MenuItem value={822}>Calarcá</MenuItem>
                      <MenuItem value={823}>Circasia</MenuItem>
                      <MenuItem value={824}>Córdoba</MenuItem>
                      <MenuItem value={825}>Filandia</MenuItem>
                      <MenuItem value={826}>Génova</MenuItem>
                      <MenuItem value={827}>La Tebaida</MenuItem>
                      <MenuItem value={828}>Montenegro</MenuItem>
                      <MenuItem value={829}>Pijao</MenuItem>
                      <MenuItem value={830}>Quimbaya</MenuItem>
                      <MenuItem value={831}>Salento</MenuItem>
                      <MenuItem value={832}>Pereira</MenuItem>
                      <MenuItem value={600}>Medellín</MenuItem>
                      <MenuItem value={1}>Bogotá D.C.</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}
          </Grid>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancelar
        </Button>
        
        {tabValue === 0 && selectedCustomer && (
          <Button
            onClick={() => handleSelectCustomer(selectedCustomer)}
            variant="contained"
            color="primary"
          >
            Usar Cliente Seleccionado
          </Button>
        )}
        
        {tabValue === 1 && (
          <Button
            onClick={handleSaveCustomer}
            variant="contained"
            color="primary"
            disabled={loading}
            startIcon={editMode ? <EditIcon /> : <AddIcon />}
          >
            {loading ? <CircularProgress size={24} /> : editMode ? 'Actualizar' : 'Guardar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CustomerDialog;
