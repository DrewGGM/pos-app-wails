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
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Lock as LockIcon,
  Badge as BadgeIcon,
  AccessTime as TimeIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { wailsAuthService } from '../../services/wailsAuthService';
import { Employee } from '../../types/models';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeDialog, setEmployeeDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeForm, setEmployeeForm] = useState<Partial<Employee>>({
    name: '',
    username: '',
    password: '',
    pin: '',
    role: 'waiter',
    email: '',
    phone: '',
    active: true,
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await wailsAuthService.getEmployees();
      setEmployees(data);
    } catch (error) {
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmployeeDialog = (employee?: Employee) => {
    if (employee) {
      setSelectedEmployee(employee);
      setEmployeeForm({ ...employee, password: '' }); // Don't show existing password
    } else {
      setSelectedEmployee(null);
      setEmployeeForm({
        name: '',
        username: '',
        password: '',
        pin: '',
        role: 'waiter',
        email: '',
        phone: '',
        active: true,
      });
    }
    setEmployeeDialog(true);
  };

  const handleSaveEmployee = async () => {
    if (!employeeForm.name || !employeeForm.username) {
      toast.error('Complete los campos requeridos');
      return;
    }

    if (!selectedEmployee && !employeeForm.password) {
      toast.error('La contraseña es requerida para nuevos empleados');
      return;
    }

    if (!selectedEmployee && !employeeForm.pin) {
      toast.error('El PIN es requerido para nuevos empleados');
      return;
    }

    try {
      if (selectedEmployee) {
        await wailsAuthService.updateEmployee(selectedEmployee.id!, employeeForm);
        toast.success('Empleado actualizado');
      } else {
        // CreateEmployee with password and PIN from form
        await wailsAuthService.createEmployee(
          employeeForm,
          employeeForm.password || '',
          employeeForm.pin || ''
        );
        toast.success('Empleado creado exitosamente');
      }
      setEmployeeDialog(false);
      loadEmployees();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar empleado');
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este empleado?')) {
      try {
        await wailsAuthService.deleteEmployee(id);
        toast.success('Empleado eliminado');
        loadEmployees();
      } catch (error) {
        toast.error('Error al eliminar empleado');
      }
    }
  };

  const handleToggleActive = async (employee: Employee) => {
    try {
      await wailsAuthService.updateEmployee(employee.id!, {
        is_active: !employee.active,
        active: !employee.active,
      });
      toast.success(
        employee.active ? 'Empleado desactivado' : 'Empleado activado'
      );
      loadEmployees();
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'manager':
        return 'warning';
      case 'cashier':
        return 'primary';
      case 'waiter':
        return 'info';
      case 'kitchen':
        return 'success';
      default:
        return 'default';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Gerente';
      case 'cashier':
        return 'Cajero';
      case 'waiter':
        return 'Mesero';
      case 'kitchen':
        return 'Cocina';
      default:
        return role;
    }
  };

  const filteredEmployees = employees.filter(employee => {
    const search = searchQuery.toLowerCase();
    return (
      employee.name.toLowerCase().includes(search) ||
      employee.username.toLowerCase().includes(search) ||
      employee.email?.toLowerCase().includes(search) ||
      employee.phone?.includes(search)
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
      field: 'username',
      headerName: 'Usuario',
      width: 120,
    },
    {
      field: 'role',
      headerName: 'Rol',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={getRoleLabel(params.value)}
          color={getRoleColor(params.value) as any}
          size="small"
        />
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 180,
    },
    {
      field: 'phone',
      headerName: 'Teléfono',
      width: 120,
    },
    {
      field: 'pin',
      headerName: 'PIN',
      width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {params.value ? '••••' : '-'}
        </Typography>
      ),
    },
    {
      field: 'active',
      headerName: 'Estado',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ? 'Activo' : 'Inactivo'}
          color={params.value ? 'success' : 'error'}
          size="small"
        />
      ),
    },
    {
      field: 'last_login',
      headerName: 'Último Acceso',
      width: 140,
      valueGetter: (params) =>
        params.value ? format(new Date(params.value), 'dd/MM/yyyy HH:mm') : 'Nunca',
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <>
          <IconButton
            size="small"
            onClick={() => handleOpenEmployeeDialog(params.row)}
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleToggleActive(params.row)}
            color={params.row.active ? 'error' : 'success'}
          >
            {params.row.active ? <LockIcon /> : <BadgeIcon />}
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteEmployee(params.row.id)}
          >
            <DeleteIcon />
          </IconButton>
        </>
      ),
    },
  ];

  const roleStats = {
    admin: employees.filter(e => e.role === 'admin').length,
    manager: employees.filter(e => e.role === 'manager').length,
    cashier: employees.filter(e => e.role === 'cashier').length,
    waiter: employees.filter(e => e.role === 'waiter').length,
    kitchen: employees.filter(e => e.role === 'kitchen').length,
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Empleados</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenEmployeeDialog()}
        >
          Nuevo Empleado
        </Button>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4">{employees.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total Empleados
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ backgroundColor: '#ffebee' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="error">
                {roleStats.admin}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Administradores
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ backgroundColor: '#fff3e0' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="warning.main">
                {roleStats.manager}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gerentes
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ backgroundColor: '#e3f2fd' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">
                {roleStats.cashier}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Cajeros
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ backgroundColor: '#e8f5e9' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">
                {roleStats.waiter + roleStats.kitchen}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Operativos
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <TextField
          fullWidth
          placeholder="Buscar empleado..."
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
          rows={filteredEmployees}
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

      {/* Employee Dialog */}
      <Dialog open={employeeDialog} onClose={() => setEmployeeDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Nombre Completo"
                required
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Usuario"
                required
                value={employeeForm.username}
                onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <BadgeIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Contraseña"
                type="password"
                value={employeeForm.password}
                onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                placeholder={selectedEmployee ? 'Dejar vacío para mantener actual' : ''}
                required={!selectedEmployee}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="PIN (4-6 dígitos)"
                value={employeeForm.pin}
                onChange={(e) => setEmployeeForm({ ...employeeForm, pin: e.target.value })}
                inputProps={{ maxLength: 6 }}
                placeholder={selectedEmployee ? 'Dejar vacío para mantener actual' : ''}
                required={!selectedEmployee}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Rol</InputLabel>
                <Select
                  value={employeeForm.role}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value as 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen' })}
                  label="Rol"
                >
                  <MenuItem value="admin">Administrador</MenuItem>
                  <MenuItem value="manager">Gerente</MenuItem>
                  <MenuItem value="cashier">Cajero</MenuItem>
                  <MenuItem value="waiter">Mesero</MenuItem>
                  <MenuItem value="kitchen">Cocina</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={employeeForm.active}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, active: e.target.checked })}
                  />
                }
                label="Activo"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
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
                label="Teléfono"
                value={employeeForm.phone}
                onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmployeeDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveEmployee} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Employees;
