import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Restaurant as RestaurantIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as WaitingIcon,
  Block as BlockedIcon,
  Settings as SettingsIcon,
  GridOn as GridIcon,
  CropSquare as SquareIcon,
  Circle as CircleIcon,
  Rectangle as RectangleIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { wailsOrderService } from '../../services/wailsOrderService';
import { Table, TableArea } from '../../types/models';
import { toast } from 'react-toastify';

const GRID_SIZE = 20;
const TABLE_BASE_SIZE = 80;
const SIDEBAR_WIDTH = 300;

const Tables: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [selectedArea, setSelectedArea] = useState<number | null>(() => {
    const saved = localStorage.getItem('tables_selectedArea');
    return saved ? Number(saved) : null;
  });
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showGrid, setShowGrid] = useState(() => {
    const saved = localStorage.getItem('tables_showGrid');
    return saved !== null ? saved === 'true' : true;
  });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Drag state
  const [draggingTable, setDraggingTable] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Dialogs
  const [tableDialog, setTableDialog] = useState(false);
  const [areaDialog, setAreaDialog] = useState(false);
  const [areaManageDialog, setAreaManageDialog] = useState(false);
  const [editingArea, setEditingArea] = useState<TableArea | null>(null);

  // Forms
  const [tableForm, setTableForm] = useState<Partial<Table>>({
    number: '',
    area_id: undefined,
    capacity: 4,
    status: 'available',
    position_x: 100,
    position_y: 100,
    shape: 'square',
  });

  const [areaForm, setAreaForm] = useState<Partial<TableArea>>({
    name: '',
    description: '',
    color: '#1976d2',
    is_active: true,
  });

  useEffect(() => {
    loadTables();
    loadAreas();
  }, []);

  // Track container size for responsive canvas
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: Math.floor(rect.width) - 4, // -4 for border
          height: Math.floor(rect.height) - 4,
        });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Also observe container size changes
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      resizeObserver.disconnect();
    };
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
      if (data.length > 0) {
        // Check if saved area exists in loaded areas
        const savedAreaExists = selectedArea && data.some(a => a.id === selectedArea);
        if (!savedAreaExists) {
          const firstAreaId = data[0].id || null;
          setSelectedArea(firstAreaId);
          if (firstAreaId) {
            localStorage.setItem('tables_selectedArea', String(firstAreaId));
          }
        }
      }
    } catch (error) {
      console.error('Error loading areas:', error);
    }
  };

  // Table dialog handlers
  const handleOpenTableDialog = (table?: Table) => {
    if (table) {
      setSelectedTable(table);
      setTableForm({
        ...table,
        area_id: table.area_id,
      });
    } else {
      setSelectedTable(null);
      setTableForm({
        number: '',
        area_id: selectedArea || (areas.length > 0 ? areas[0].id : undefined),
        capacity: 4,
        status: 'available',
        position_x: 100,
        position_y: 100,
        shape: 'square',
      });
    }
    setTableDialog(true);
  };

  const handleCloseTableDialog = () => {
    setTableDialog(false);
    setSelectedTable(null);
  };

  const handleSaveTable = async () => {
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
        const tableData = {
          ...tableForm,
          id: selectedTable.id,
        };
        await wailsOrderService.updateTable(selectedTable.id, tableData);
        toast.success('Mesa actualizada');
      } else {
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
    console.log('handleDeleteTable called with id:', id);
    if (window.confirm('¿Está seguro de eliminar esta mesa?')) {
      console.log('User confirmed deletion');
      try {
        console.log('Calling wailsOrderService.deleteTable...');
        await wailsOrderService.deleteTable(id);
        console.log('Delete successful');
        toast.success('Mesa eliminada');
        // Force reload tables from backend
        console.log('Reloading tables...');
        const data = await wailsOrderService.getTables();
        console.log('Tables reloaded:', data.length, 'tables');
        setTables(data);
      } catch (error: any) {
        console.error('Delete error:', error);
        toast.error(error?.message || 'Error al eliminar mesa');
      }
    } else {
      console.log('User cancelled deletion');
    }
  };

  // Area dialog handlers
  const handleOpenAreaDialog = (area?: TableArea) => {
    if (area) {
      setEditingArea(area);
      setAreaForm(area);
    } else {
      setEditingArea(null);
      setAreaForm({
        name: '',
        description: '',
        color: '#1976d2',
        is_active: true,
      });
    }
    setAreaDialog(true);
  };

  const handleCloseAreaDialog = () => {
    setAreaDialog(false);
    setEditingArea(null);
  };

  const handleSaveArea = async () => {
    if (!areaForm.name) {
      toast.error('El nombre del área es requerido');
      return;
    }

    try {
      if (editingArea && editingArea.id) {
        await wailsOrderService.updateTableArea({ ...areaForm, id: editingArea.id });
        toast.success('Área actualizada');
      } else {
        await wailsOrderService.createTableArea(areaForm);
        toast.success('Área creada');
      }
      handleCloseAreaDialog();
      loadAreas();
    } catch (error) {
      toast.error('Error al guardar área');
    }
  };

  const handleDeleteArea = async (id: number) => {
    const tablesInArea = tables.filter(t => t.area_id === id);
    if (tablesInArea.length > 0) {
      toast.error(`No se puede eliminar el área porque tiene ${tablesInArea.length} mesa(s) asignadas`);
      return;
    }
    if (window.confirm('¿Está seguro de eliminar esta área?')) {
      try {
        await wailsOrderService.deleteTableArea(id);
        toast.success('Área eliminada');
        if (selectedArea === id) {
          const newAreaId = areas.find(a => a.id !== id)?.id || null;
          setSelectedArea(newAreaId);
          if (newAreaId) {
            localStorage.setItem('tables_selectedArea', String(newAreaId));
          } else {
            localStorage.removeItem('tables_selectedArea');
          }
        }
        loadAreas();
      } catch (error) {
        toast.error('Error al eliminar área');
      }
    }
  };

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, table: Table) => {
    if (!editMode || !table.id) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDraggingTable(table.id);
    setDragOffset({
      x: x - (table.position_x || 0),
      y: y - (table.position_y || 0),
    });
  }, [editMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingTable || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left - dragOffset.x;
    let y = e.clientY - rect.top - dragOffset.y;

    // Snap to grid
    if (showGrid) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    // Keep within bounds
    x = Math.max(0, Math.min(canvasSize.width - TABLE_BASE_SIZE, x));
    y = Math.max(0, Math.min(canvasSize.height - TABLE_BASE_SIZE, y));

    setTables(prev => prev.map(t =>
      t.id === draggingTable ? { ...t, position_x: x, position_y: y } : t
    ));
  }, [draggingTable, dragOffset, showGrid, canvasSize]);

  const handleMouseUp = useCallback(async () => {
    if (!draggingTable) return;

    const table = tables.find(t => t.id === draggingTable);
    if (table) {
      try {
        await wailsOrderService.updateTable(table.id!, {
          ...table,
          position_x: table.position_x,
          position_y: table.position_y,
        });
      } catch (error) {
        console.error('Error saving position:', error);
      }
    }

    setDraggingTable(null);
  }, [draggingTable, tables]);

  // Table click handler
  const handleTableClick = async (table: Table) => {
    if (editMode) return;

    if (table.status === 'occupied') {
      const order = await wailsOrderService.getOrderByTable(table.id!);
      if (order) {
        navigate(`/pos?orderId=${order.id}`);
      }
    } else if (table.status === 'available') {
      navigate(`/pos?tableId=${table.id}`);
    } else {
      toast.info('Mesa no disponible');
    }
  };

  const handleToggleTableStatus = async (table: Table, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Status helpers
  const getTableStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#4caf50';
      case 'occupied': return '#ff9800';
      case 'reserved': return '#2196f3';
      case 'blocked': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getTableStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return <CheckIcon />;
      case 'occupied': return <RestaurantIcon />;
      case 'reserved': return <WaitingIcon />;
      case 'blocked': return <BlockedIcon />;
      default: return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return 'Disponible';
      case 'occupied': return 'Ocupada';
      case 'reserved': return 'Reservada';
      case 'blocked': return 'Bloqueada';
      default: return status;
    }
  };

  // Filter tables by selected area
  const filteredTables = tables.filter(table =>
    selectedArea === null || table.area_id === selectedArea
  );

  // Stats
  const tableStats = {
    total: filteredTables.length,
    available: filteredTables.filter(t => t.status === 'available').length,
    occupied: filteredTables.filter(t => t.status === 'occupied').length,
    reserved: filteredTables.filter(t => t.status === 'reserved').length,
    blocked: filteredTables.filter(t => t.status === 'blocked').length,
  };

  // Render table shape
  const renderTableShape = (table: Table) => {
    const size = TABLE_BASE_SIZE;
    const color = getTableStatusColor(table.status);
    const isSelected = selectedTable?.id === table.id;
    const isDragging = draggingTable === table.id;

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: table.position_x || 0,
      top: table.position_y || 0,
      width: table.shape === 'rectangle' ? size * 1.5 : size,
      height: size,
      backgroundColor: color + '20',
      border: `3px solid ${color}`,
      borderRadius: table.shape === 'round' ? '50%' : table.shape === 'rectangle' ? '8px' : '8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: editMode ? 'move' : (table.status === 'blocked' ? 'not-allowed' : 'pointer'),
      transition: isDragging ? 'none' : 'box-shadow 0.2s',
      boxShadow: isSelected ? `0 0 0 3px ${color}` : isDragging ? '0 8px 16px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
      zIndex: isDragging ? 100 : 1,
      userSelect: 'none',
    };

    return (
      <Box
        key={table.id}
        sx={baseStyle}
        onMouseDown={(e) => handleMouseDown(e, table)}
        onClick={() => !editMode && handleTableClick(table)}
      >
        <Typography variant="h5" fontWeight="bold" sx={{ color, lineHeight: 1 }}>
          {table.number}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PeopleIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {table.capacity}
          </Typography>
        </Box>
        {table.current_order && (
          <Chip
            size="small"
            label={`$${table.current_order.total?.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}`}
            sx={{
              mt: 0.5,
              height: 18,
              fontSize: 11,
              fontWeight: 'bold',
              backgroundColor: '#4caf50',
              color: 'white',
              '& .MuiChip-label': { px: 1 }
            }}
          />
        )}

        {/* Edit mode actions */}
        {editMode && (
          <Box sx={{ position: 'absolute', top: -12, right: -12, display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              sx={{
                backgroundColor: 'white',
                boxShadow: 1,
                width: 24,
                height: 24,
                '&:hover': { backgroundColor: '#f5f5f5' }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenTableDialog(table);
              }}
            >
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton
              size="small"
              sx={{
                backgroundColor: 'white',
                boxShadow: 1,
                width: 24,
                height: 24,
                '&:hover': { backgroundColor: '#ffebee' }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (table.id) {
                  handleDeleteTable(table.id);
                }
              }}
            >
              <DeleteIcon sx={{ fontSize: 14, color: 'error.main' }} />
            </IconButton>
          </Box>
        )}

        {/* Status icon */}
        {!editMode && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -8,
              right: -8,
              backgroundColor: color,
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={(e) => handleToggleTableStatus(table, e)}
          >
            {React.cloneElement(getTableStatusIcon(table.status) as React.ReactElement, {
              sx: { fontSize: 12, color: 'white' }
            })}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Main Canvas Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, overflow: 'hidden' }}>
        {/* Canvas */}
        <Paper
          ref={containerRef}
          sx={{
            flex: 1,
            overflow: 'hidden',
            backgroundColor: '#f5f5f5',
            position: 'relative',
          }}
        >
          <Box
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            sx={{
              width: canvasSize.width,
              height: canvasSize.height,
              position: 'relative',
              backgroundColor: 'white',
              backgroundImage: showGrid
                ? `linear-gradient(#e0e0e0 1px, transparent 1px), linear-gradient(90deg, #e0e0e0 1px, transparent 1px)`
                : 'none',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              border: '1px solid #e0e0e0',
            }}
          >
            {filteredTables.map(table => renderTableShape(table))}

            {/* Empty state */}
            {filteredTables.length === 0 && (
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}>
                <Typography color="text.secondary" gutterBottom>
                  No hay mesas en esta área
                </Typography>
                {editMode && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenTableDialog()}
                  >
                    Agregar Mesa
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      {/* Right Sidebar */}
      <Paper
        sx={{
          width: SIDEBAR_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e0e0e0',
          overflow: 'auto',
        }}
        elevation={0}
      >
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" gutterBottom>Gestión de Mesas</Typography>

          {/* Edit Mode Toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={editMode}
                onChange={() => setEditMode(!editMode)}
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {editMode ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
                <span>{editMode ? 'Modo Edición' : 'Modo Vista'}</span>
              </Box>
            }
          />
        </Box>

        {/* Area Selector */}
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">Área</Typography>
            <IconButton size="small" onClick={() => setAreaManageDialog(true)}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Box>

          {areas.length === 0 ? (
            <Alert severity="info" sx={{ py: 0.5 }}>
              <Button size="small" onClick={() => handleOpenAreaDialog()}>Crear área</Button>
            </Alert>
          ) : (
            <FormControl fullWidth size="small">
              <Select
                value={selectedArea || ''}
                onChange={(e) => {
                  const newValue = e.target.value ? Number(e.target.value) : null;
                  setSelectedArea(newValue);
                  if (newValue) {
                    localStorage.setItem('tables_selectedArea', String(newValue));
                  } else {
                    localStorage.removeItem('tables_selectedArea');
                  }
                }}
                displayEmpty
              >
                {areas.map(area => (
                  <MenuItem key={area.id} value={area.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: area.color }} />
                      {area.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Stats */}
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="subtitle2" gutterBottom>Resumen</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Total:</Typography>
              <Chip label={tableStats.total} size="small" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: '#4caf50' }}>Disponibles:</Typography>
              <Chip label={tableStats.available} size="small" color="success" variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: '#ff9800' }}>Ocupadas:</Typography>
              <Chip label={tableStats.occupied} size="small" color="warning" variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: '#2196f3' }}>Reservadas:</Typography>
              <Chip label={tableStats.reserved} size="small" color="info" variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: '#f44336' }}>Bloqueadas:</Typography>
              <Chip label={tableStats.blocked} size="small" color="error" variant="outlined" />
            </Box>
          </Box>
        </Box>

        {/* View Options */}
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="subtitle2" gutterBottom>Opciones de Vista</Typography>

          <FormControlLabel
            control={
              <Switch
                checked={showGrid}
                onChange={() => {
                  const newValue = !showGrid;
                  setShowGrid(newValue);
                  localStorage.setItem('tables_showGrid', String(newValue));
                }}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GridIcon fontSize="small" />
                <span>Mostrar cuadrícula</span>
              </Box>
            }
          />
        </Box>

        {/* Actions */}
        {editMode && (
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Acciones</Typography>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenTableDialog()}
              sx={{ mb: 1 }}
            >
              Nueva Mesa
            </Button>
            <Typography variant="caption" color="text.secondary">
              Arrastra las mesas para posicionarlas en el plano
            </Typography>
          </Box>
        )}

        {/* Legend */}
        <Box sx={{ p: 2, mt: 'auto', borderTop: '1px solid #e0e0e0' }}>
          <Typography variant="subtitle2" gutterBottom>Leyenda</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {['available', 'occupied', 'reserved', 'blocked'].map(status => (
              <Box key={status} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '4px',
                    backgroundColor: getTableStatusColor(status) + '40',
                    border: `2px solid ${getTableStatusColor(status)}`,
                  }}
                />
                <Typography variant="caption">{getStatusLabel(status)}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Table Dialog */}
      <Dialog open={tableDialog} onClose={handleCloseTableDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedTable ? 'Editar Mesa' : 'Nueva Mesa'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Número de Mesa"
                value={tableForm.number}
                onChange={(e) => setTableForm({ ...tableForm, number: e.target.value })}
              />
              <TextField
                fullWidth
                label="Capacidad"
                type="number"
                value={tableForm.capacity}
                onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth required>
                <InputLabel>Área</InputLabel>
                <Select
                  value={tableForm.area_id || ''}
                  onChange={(e) => setTableForm({ ...tableForm, area_id: e.target.value ? Number(e.target.value) : undefined })}
                  label="Área"
                >
                  {areas.map(area => (
                    <MenuItem key={area.id} value={area.id}>
                      {area.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  value={tableForm.status}
                  onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as any })}
                  label="Estado"
                >
                  <MenuItem value="available">Disponible</MenuItem>
                  <MenuItem value="reserved">Reservada</MenuItem>
                  <MenuItem value="blocked">Bloqueada</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>Forma de la Mesa</Typography>
              <ToggleButtonGroup
                value={tableForm.shape}
                exclusive
                onChange={(_, value) => value && setTableForm({ ...tableForm, shape: value })}
              >
                <ToggleButton value="square">
                  <Tooltip title="Cuadrada">
                    <SquareIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="round">
                  <Tooltip title="Redonda">
                    <CircleIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="rectangle">
                  <Tooltip title="Rectangular">
                    <RectangleIcon />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Position inputs */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Posición X"
                type="number"
                value={tableForm.position_x}
                onChange={(e) => setTableForm({ ...tableForm, position_x: Number(e.target.value) })}
                InputProps={{ inputProps: { min: 0, max: canvasSize.width - TABLE_BASE_SIZE } }}
              />
              <TextField
                fullWidth
                label="Posición Y"
                type="number"
                value={tableForm.position_y}
                onChange={(e) => setTableForm({ ...tableForm, position_y: Number(e.target.value) })}
                InputProps={{ inputProps: { min: 0, max: canvasSize.height - TABLE_BASE_SIZE } }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTableDialog}>Cancelar</Button>
          <Button onClick={handleSaveTable} variant="contained">Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Area Dialog */}
      <Dialog open={areaDialog} onClose={handleCloseAreaDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingArea ? 'Editar Área' : 'Nueva Área'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Nombre del Área"
              value={areaForm.name}
              onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })}
            />
            <TextField
              fullWidth
              label="Descripción"
              value={areaForm.description}
              onChange={(e) => setAreaForm({ ...areaForm, description: e.target.value })}
              multiline
              rows={2}
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Color</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#d32f2f', '#0288d1', '#7b1fa2'].map(color => (
                  <Box
                    key={color}
                    onClick={() => setAreaForm({ ...areaForm, color })}
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: color,
                      borderRadius: 1,
                      cursor: 'pointer',
                      border: areaForm.color === color ? '3px solid #000' : '1px solid #ccc',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAreaDialog}>Cancelar</Button>
          <Button onClick={handleSaveArea} variant="contained">Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Area Management Dialog */}
      <Dialog open={areaManageDialog} onClose={() => setAreaManageDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Gestionar Áreas</DialogTitle>
        <DialogContent>
          {areas.length === 0 ? (
            <Alert severity="info">No hay áreas configuradas</Alert>
          ) : (
            <List>
              {areas.map(area => (
                <ListItem
                  key={area.id}
                  sx={{
                    borderLeft: `4px solid ${area.color}`,
                    mb: 1,
                    backgroundColor: '#f9f9f9',
                    borderRadius: 1,
                  }}
                >
                  <ListItemText
                    primary={area.name}
                    secondary={`${tables.filter(t => t.area_id === area.id).length} mesa(s) • ${area.description || 'Sin descripción'}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton onClick={() => handleOpenAreaDialog(area)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => area.id && handleDeleteArea(area.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAreaManageDialog(false)}>Cerrar</Button>
          <Button
            onClick={() => {
              setAreaManageDialog(false);
              handleOpenAreaDialog();
            }}
            variant="contained"
            startIcon={<AddIcon />}
          >
            Nueva Área
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Tables;
