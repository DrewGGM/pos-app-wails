import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Avatar,
  Chip,
  Tab,
  Tabs,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Star as StarIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { wailsSalesService } from '../../services/wailsSalesService';
import { Customer } from '../../types/models';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useDIANMode } from '../../hooks';

// Customer statistics (loaded from optimized backend endpoint)
interface CustomerStatsData {
  total_customers: number;
  total_purchases: number;
  total_spent: number;
  top_customers: Array<{ id: number; name: string; total_spent: number }>;
}

const Customers: React.FC = () => {
  const { isDIANMode } = useDIANMode();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStatsData>({
    total_customers: 0,
    total_purchases: 0,
    total_spent: 0,
    top_customers: [],
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({
    name: '',
    document_type: 'CC',
    document_number: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    // DIAN corporate fields (optional, only for NIT)
    type_regime_id: undefined,
    type_liability_id: undefined,
    municipality_id: undefined,
  });

  useEffect(() => {
    loadCustomers();
  }, [isDIANMode]); // Reload when DIAN mode changes

  const loadCustomers = async () => {
    setLoading(true);
    try {
      // Load customers and stats in parallel
      const [customersData, statsData] = await Promise.all([
        wailsSalesService.getCustomers(),
        wailsSalesService.getCustomerStats(isDIANMode),
      ]);
      setCustomers(customersData);
      setStats(statsData);
    } catch (error) {
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCustomerDialog = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer);
      setCustomerForm({
        ...customer,
        document_type: customer.identification_type || customer.document_type,
        document_number: customer.identification_number || customer.document_number,
        // DIAN corporate fields
        type_regime_id: customer.type_regime_id,
        type_liability_id: customer.type_liability_id,
        municipality_id: customer.municipality_id,
      });
    } else {
      setSelectedCustomer(null);
      setCustomerForm({
        name: '',
        identification_type: 'CC',
        document_type: 'CC',
        identification_number: '',
        document_number: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        // DIAN corporate fields reset
        type_regime_id: undefined,
        type_liability_id: undefined,
        municipality_id: undefined,
      });
    }
    setCustomerDialog(true);
  };

  const handleSaveCustomer = async () => {
    // Required fields per DIAN Resolución 0165 de 2023:
    // - name, identification_number, email
    // All other fields are OPTIONAL

    if (!customerForm.name?.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!customerForm.document_number?.trim() && !customerForm.identification_number?.trim()) {
      toast.error('El número de documento es requerido');
      return;
    }
    if (!customerForm.email?.trim()) {
      toast.error('El email es requerido');
      return;
    }

    try {
      // Map form fields to backend fields
      // Only include optional DIAN fields if they were provided
      const customerData = {
        ...customerForm,
        identification_type: customerForm.document_type || customerForm.identification_type || 'CC',
        identification_number: customerForm.document_number || customerForm.identification_number || '',
        // Include DIAN corporate fields only if provided (all are optional per DIAN)
        type_regime_id: customerForm.type_regime_id || undefined,
        type_liability_id: customerForm.type_liability_id || undefined,
        municipality_id: customerForm.municipality_id || undefined,
      };

      if (selectedCustomer) {
        await wailsSalesService.updateCustomer(selectedCustomer.id!, customerData);
        toast.success('Cliente actualizado');
      } else {
        await wailsSalesService.createCustomer(customerData);
        toast.success('Cliente creado');
      }
      setCustomerDialog(false);
      loadCustomers();
    } catch (error) {
      toast.error('Error al guardar cliente');
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este cliente?')) {
      try {
        await wailsSalesService.deleteCustomer(id);
        toast.success('Cliente eliminado');
        loadCustomers();
      } catch (error) {
        toast.error('Error al eliminar cliente');
      }
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const search = searchQuery.toLowerCase();
    return (
      customer.name.toLowerCase().includes(search) ||
      customer.document_number?.includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search)
    );
  });

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Nombre',
      width: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ width: 32, height: 32 }}>
            {params.value?.[0]?.toUpperCase() || '?'}
          </Avatar>
          <Typography variant="body2">{params.value || 'Sin nombre'}</Typography>
        </Box>
      ),
    },
    {
      field: 'document_number',
      headerName: 'Documento',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {params.row.document_type} {params.value}
        </Typography>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 200,
    },
    {
      field: 'phone',
      headerName: 'Teléfono',
      width: 120,
    },
    {
      field: 'total_purchases',
      headerName: 'Compras',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip label={params.value || 0} size="small" />
      ),
    },
    {
      field: 'total_spent',
      headerName: 'Total Gastado',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" fontWeight="bold">
          ${(params.value || 0).toLocaleString('es-CO')}
        </Typography>
      ),
    },
    {
      field: 'loyalty_points',
      headerName: 'Puntos',
      width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          icon={<StarIcon />}
          label={params.value || 0}
          size="small"
          color="warning"
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Cliente Desde',
      width: 120,
      valueGetter: (params) =>
        params.value ? format(new Date(params.value), 'dd/MM/yyyy') : '',
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <>
          <IconButton
            size="small"
            onClick={() => handleOpenCustomerDialog(params.row)}
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteCustomer(params.row.id)}
          >
            <DeleteIcon />
          </IconButton>
        </>
      ),
    },
  ];

  // Top customers now come from optimized backend endpoint
  const topCustomers = stats.top_customers;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Clientes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenCustomerDialog()}
        >
          Nuevo Cliente
        </Button>
      </Box>

      {/* Stats - Using optimized backend aggregation */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <PersonIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
            <Typography variant="h4">{stats.total_customers}</Typography>
            <Typography variant="body2" color="text.secondary">
              Total Clientes
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <ReceiptIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
            <Typography variant="h4">{stats.total_purchases}</Typography>
            <Typography variant="body2" color="text.secondary">
              Total Compras
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <TrendingUpIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
            <Typography variant="h4">
              ${stats.total_spent.toLocaleString('es-CO')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ventas Totales
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <StarIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
            <Typography variant="h4">{stats.top_customers.length}</Typography>
            <Typography variant="body2" color="text.secondary">
              Top Clientes
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Tabs value={selectedTab} onChange={(_, value) => setSelectedTab(value)}>
          <Tab label="Todos" />
          <Tab label="VIP" />
          <Tab label="Nuevos" />
        </Tabs>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <TextField
              fullWidth
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            <DataGrid
              rows={filteredCustomers}
              columns={columns}
              loading={loading}
              autoHeight
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 10, page: 0 },
                },
              }}
              sx={{
                '& .MuiDataGrid-cell': {
                  borderBottom: 'none',
                },
              }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Top Clientes
            </Typography>
            {topCustomers.map((customer, index) => (
              <Box
                key={customer.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1,
                  borderBottom: index < topCustomers.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Avatar sx={{ backgroundColor: 'primary.main' }}>
                  {index + 1}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    {customer.name}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold" color="primary">
                  ${(customer.total_spent || 0).toLocaleString('es-CO')}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      {/* Customer Dialog */}
      <Dialog open={customerDialog} onClose={() => setCustomerDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Nombre Completo"
                required
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                select
                fullWidth
                label="Tipo Doc"
                value={customerForm.document_type}
                onChange={(e) => {
                  const newType = e.target.value;
                  // When changing to NIT, initialize corporate fields with defaults if not set
                  if (newType === 'NIT') {
                    setCustomerForm({
                      ...customerForm,
                      document_type: newType,
                      identification_type: newType,
                      type_regime_id: customerForm.type_regime_id ?? 2,
                      type_liability_id: customerForm.type_liability_id ?? 117,
                      municipality_id: customerForm.municipality_id ?? 820,
                    });
                  } else {
                    // When changing away from NIT, clear corporate fields
                    setCustomerForm({
                      ...customerForm,
                      document_type: newType,
                      identification_type: newType,
                      type_regime_id: undefined,
                      type_liability_id: undefined,
                      municipality_id: undefined,
                    });
                  }
                }}
                SelectProps={{ native: true }}
              >
                <option value="CC">Cédula (CC)</option>
                <option value="NIT">NIT</option>
                <option value="CE">Cédula Extranjería</option>
                <option value="TI">Tarjeta Identidad</option>
                <option value="PA">Pasaporte</option>
                <option value="PEP">PEP</option>
                <option value="PPT">PPT</option>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                label="Número Documento"
                required
                value={customerForm.document_number}
                onChange={(e) => setCustomerForm({ ...customerForm, document_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                required
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Teléfono (Opcional)"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Dirección (Opcional)"
                value={customerForm.address}
                onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LocationIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notas (Opcional)"
                multiline
                rows={2}
                value={customerForm.notes}
                onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
              />
            </Grid>

            {/* DIAN Corporate Fields - Only shown for NIT */}
            {customerForm.document_type === 'NIT' && (
              <>
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Campos adicionales opcionales para facturación electrónica (no requeridos por DIAN)
                  </Alert>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo Régimen</InputLabel>
                    <Select
                      value={customerForm.type_regime_id || 2}
                      onChange={(e) => setCustomerForm({ ...customerForm, type_regime_id: Number(e.target.value) })}
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
                      value={customerForm.type_liability_id || 117}
                      onChange={(e) => setCustomerForm({ ...customerForm, type_liability_id: Number(e.target.value) })}
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
                      value={customerForm.municipality_id || 820}
                      onChange={(e) => setCustomerForm({ ...customerForm, municipality_id: Number(e.target.value) })}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomerDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveCustomer} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
