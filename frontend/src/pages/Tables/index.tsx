import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  CardActions,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Fab,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  TableChart as TableIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Restaurant as RestaurantIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as WaitingIcon,
  Block as BlockedIcon,
  ViewModule as GridIcon,
  ViewList as ListIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { wailsOrderService } from '../../services/wailsOrderService';
import { Table, TableArea } from '../../types/models';
import { toast } from 'react-toastify';

const Tables: React.FC = () => {
  const navigate = useNavigate();
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tableDialog, setTableDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState<Partial<Table>>({
    number: '',
    area_id: 0,
    capacity: 4,
    status: 'available',
  });

  useEffect(() => {
    loadTables();
    loadAreas();
  }, []);

  const loadTables = async () => {
    try {
      const data = await wailsOrderService.getTables();
      setTables(data);
    } catch (error) {
      toast.error('Error al cargar mesas');
    }
  };

  const loadAreas = async () => {
    try {
      const data = await wailsOrderService.getTableAreas();
      setAreas(data);
      // No establecer área por defecto - dejar en null (Todas)
    } catch (error) {
    }
  };

  const handleOpenTableDialog = (table?: Table) => {
    if (table) {
      setSelectedTable(table);
      setTableForm(table);
    } else {
      setSelectedTable(null);
      // Ensure area_id is always set to a valid value
      const defaultAreaId = areas.length > 0 ? areas[0].id! : undefined;
      setTableForm({
        number: '',
        area_id: defaultAreaId,
        capacity: 4,
        status: 'available',
      });
    }
    setTableDialog(true);
  };

  const handleCloseTableDialog = () => {
    setTableDialog(false);
    setSelectedTable(null);
    setTableForm({
      number: '',
      area_id: areas.length > 0 ? areas[0].id : undefined,
      capacity: 4,
      status: 'available',
    });
  };

  const handleSaveTable = async () => {
    // Validate required fields
    if (!tableForm.number) {
      toast.error('El número de mesa es requerido');
      return;
    }
    if (!tableForm.area_id) {
      toast.error('Debe seleccionar un área');
      return;
    }

    try {
      if (selectedTable && selectedTable.id) {
        // Update existing table - ensure ID is included
        const tableData = {
          ...tableForm,
          id: selectedTable.id,
        };
        await wailsOrderService.updateTable(selectedTable.id, tableData);
        toast.success('Mesa actualizada');
      } else {
        // Create new table - remove any ID that might exist
        const { id, ...tableData } = tableForm as any;
        await wailsOrderService.createTable(tableData);
        toast.success('Mesa creada');
      }
      handleCloseTableDialog();
      loadTables();
    } catch (error: any) {
      const errorMsg = error.message || 'Error al guardar mesa';
      if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
        toast.error('Ya existe una mesa con ese número');
      } else {
        toast.error(errorMsg);
      }
    }
  };

  const handleDeleteTable = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar esta mesa?')) {
      try {
        await wailsOrderService.deleteTable(id);
        toast.success('Mesa eliminada');
        loadTables();
      } catch (error) {
        toast.error('Error al eliminar mesa');
      }
    }
  };

  const handleTableClick = async (table: Table) => {
    if (table.status === 'occupied') {
      // Go to the order
      const order = await wailsOrderService.getOrderByTable(table.id!);
      if (order) {
        navigate(`/pos?orderId=${order.id}`);
      }
    } else if (table.status === 'available') {
      // Create new order for this table
      navigate(`/pos?tableId=${table.id}`);
    } else {
      toast.info('Mesa no disponible');
    }
  };

  const handleToggleTableStatus = async (table: Table) => {
    const newStatus = table.status === 'available' ? 'reserved' : 
                     table.status === 'reserved' ? 'blocked' : 'available';
    
    try {
      await wailsOrderService.updateTableStatus(table.id!, newStatus);
      toast.success('Estado actualizado');
      loadTables();
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  const getTableStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#4caf50';
      case 'occupied':
        return '#ff9800';
      case 'reserved':
        return '#2196f3';
      case 'blocked':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  const getTableStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckIcon />;
      case 'occupied':
        return <RestaurantIcon />;
      case 'reserved':
        return <WaitingIcon />;
      case 'blocked':
        return <BlockedIcon />;
      default:
        return <TableIcon />;
    }
  };

  const filteredTables = tables.filter(table =>
    selectedArea === null || table.area_id === selectedArea
  );

  const tableStats = {
    total: tables.length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
    blocked: tables.filter(t => t.status === 'blocked').length,
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Gestión de Mesas</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, value) => value && setViewMode(value)}
          >
            <ToggleButton value="grid">
              <GridIcon />
            </ToggleButton>
            <ToggleButton value="list">
              <ListIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenTableDialog()}
          >
            Nueva Mesa
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4">{tableStats.total}</Typography>
            <Typography variant="body2" color="text.secondary">
              Total Mesas
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e8f5e9' }}>
            <Typography variant="h4" color="#4caf50">
              {tableStats.available}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Disponibles
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#fff3e0' }}>
            <Typography variant="h4" color="#ff9800">
              {tableStats.occupied}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ocupadas
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e3f2fd' }}>
            <Typography variant="h4" color="#2196f3">
              {tableStats.reserved}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reservadas
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#ffebee' }}>
            <Typography variant="h4" color="#f44336">
              {tableStats.blocked}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Bloqueadas
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Area Selector */}
      {areas.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <ToggleButtonGroup
            value={selectedArea ?? 'all'}
            exclusive
            onChange={(_, value) => setSelectedArea(value === 'all' ? null : value)}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="all">
              Todas las Áreas
            </ToggleButton>
            {areas.map(area => (
              <ToggleButton key={area.id} value={area.id || 0}>
                {area.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Paper>
      )}

      {/* Tables Grid */}
      {viewMode === 'grid' ? (
        <Grid container spacing={2}>
          {filteredTables.map(table => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={table.id}>
              <Card
                sx={{
                  cursor: table.status === 'blocked' ? 'not-allowed' : 'pointer',
                  borderTop: '4px solid',
                  borderColor: getTableStatusColor(table.status),
                  '&:hover': {
                    boxShadow: 3,
                  },
                }}
              >
                <CardContent
                  onClick={() => handleTableClick(table)}
                  sx={{ pb: 0 }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h5">
                      Mesa {table.number}
                    </Typography>
                    {getTableStatusIcon(table.status)}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {areas.find(a => a.id === table.area_id)?.name || 'Sin área'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <PeopleIcon sx={{ fontSize: 16, mr: 0.5 }} />
                    <Typography variant="body2">
                      Capacidad: {table.capacity}
                    </Typography>
                  </Box>
                  {table.current_order && (
                    <Box sx={{ mt: 1 }}>
                      <Chip
                        size="small"
                        label={`Orden #${table.current_order.order_number}`}
                        color="primary"
                      />
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTableDialog(table);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleTableStatus(table);
                    }}
                  >
                    {table.status === 'blocked' ? <CheckIcon /> : <BlockedIcon />}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      table.id && handleDeleteTable(table.id);
                    }}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper>
          {/* List view implementation */}
          <Typography sx={{ p: 2 }}>Vista de lista (por implementar)</Typography>
        </Paper>
      )}

      {/* Table Dialog */}
      <Dialog open={tableDialog} onClose={handleCloseTableDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedTable ? 'Editar Mesa' : 'Nueva Mesa'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Número de Mesa"
                value={tableForm.number}
                onChange={(e) => setTableForm({ ...tableForm, number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Área</InputLabel>
                <Select
                  value={tableForm.area_id ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTableForm({ ...tableForm, area_id: value ? Number(value) : undefined });
                  }}
                  label="Área"
                >
                  {areas.length === 0 ? (
                    <MenuItem disabled value="">
                      No hay áreas disponibles
                    </MenuItem>
                  ) : (
                    areas.map(area => (
                      <MenuItem key={area.id} value={area.id}>
                        {area.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Capacidad"
                type="number"
                value={tableForm.capacity}
                onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  value={tableForm.status}
                  onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked' })}
                  label="Estado"
                >
                  <MenuItem value="available">Disponible</MenuItem>
                  <MenuItem value="reserved">Reservada</MenuItem>
                  <MenuItem value="blocked">Bloqueada</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTableDialog}>Cancelar</Button>
          <Button onClick={handleSaveTable} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => handleOpenTableDialog()}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default Tables;
