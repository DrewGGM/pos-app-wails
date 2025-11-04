import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Fab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  InputAdornment,
  Card,
  CardContent,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { wailsIngredientService } from '../../services/wailsIngredientService';
import { Ingredient, IngredientMovement } from '../../types/models';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks';

const UNIT_OPTIONS = [
  { value: 'unidades', label: 'Unidades' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'gramos', label: 'Gramos (g)' },
  { value: 'litros', label: 'Litros (L)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'oz', label: 'Onzas (oz)' },
  { value: 'lb', label: 'Libras (lb)' },
];

const Ingredients: React.FC = () => {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [filteredIngredients, setFilteredIngredients] = useState<Ingredient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [ingredientDialog, setIngredientDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState(false);
  const [movementsDialog, setMovementsDialog] = useState(false);

  // Selected ingredient
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);

  // Forms
  const [ingredientForm, setIngredientForm] = useState<Partial<Ingredient>>({
    name: '',
    unit: 'unidades',
    stock: 0,
    min_stock: 10,
    is_active: true,
  });

  const [stockAdjustment, setStockAdjustment] = useState({
    quantity: 0,
    reason: '',
  });

  const [movements, setMovements] = useState<IngredientMovement[]>([]);

  useEffect(() => {
    loadIngredients();
  }, []);

  useEffect(() => {
    // Filter ingredients based on search query
    if (searchQuery.trim() === '') {
      setFilteredIngredients(ingredients);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredIngredients(
        ingredients.filter(
          (ing) =>
            ing.name.toLowerCase().includes(query) ||
            ing.unit.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, ingredients]);

  const loadIngredients = async () => {
    setLoading(true);
    try {
      const data = await wailsIngredientService.getIngredients();
      setIngredients(data);
      setFilteredIngredients(data);
    } catch (error) {
      console.error('Error loading ingredients:', error);
      toast.error('Error al cargar ingredientes');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenIngredientDialog = (ingredient?: Ingredient) => {
    if (ingredient) {
      setSelectedIngredient(ingredient);
      setIngredientForm({
        name: ingredient.name,
        unit: ingredient.unit,
        stock: ingredient.stock,
        min_stock: ingredient.min_stock,
        is_active: ingredient.is_active,
      });
    } else {
      setSelectedIngredient(null);
      setIngredientForm({
        name: '',
        unit: 'unidades',
        stock: 0,
        min_stock: 10,
        is_active: true,
      });
    }
    setIngredientDialog(true);
  };

  const handleCloseIngredientDialog = () => {
    setIngredientDialog(false);
    setSelectedIngredient(null);
    setIngredientForm({
      name: '',
      unit: 'unidades',
      stock: 0,
      min_stock: 10,
      is_active: true,
    });
  };

  const handleSaveIngredient = async () => {
    try {
      if (!ingredientForm.name) {
        toast.error('El nombre del ingrediente es requerido');
        return;
      }

      setLoading(true);
      if (selectedIngredient) {
        await wailsIngredientService.updateIngredient(selectedIngredient.id!, {
          id: selectedIngredient.id,
          ...ingredientForm,
        });
        toast.success('Ingrediente actualizado correctamente');
      } else {
        await wailsIngredientService.createIngredient(ingredientForm);
        toast.success('Ingrediente creado correctamente');
      }
      handleCloseIngredientDialog();
      loadIngredients();
    } catch (error) {
      console.error('Error saving ingredient:', error);
      toast.error('Error al guardar ingrediente');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIngredient = async (ingredient: Ingredient) => {
    if (!window.confirm(`¿Está seguro de eliminar el ingrediente "${ingredient.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await wailsIngredientService.deleteIngredient(ingredient.id!);
      toast.success('Ingrediente eliminado correctamente');
      loadIngredients();
    } catch (error) {
      console.error('Error deleting ingredient:', error);
      toast.error('Error al eliminar ingrediente');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStockDialog = (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
    setStockAdjustment({
      quantity: 0,
      reason: '',
    });
    setStockDialog(true);
  };

  const handleCloseStockDialog = () => {
    setStockDialog(false);
    setSelectedIngredient(null);
    setStockAdjustment({
      quantity: 0,
      reason: '',
    });
  };

  const handleAdjustStock = async () => {
    if (!selectedIngredient) return;

    try {
      if (stockAdjustment.quantity === 0) {
        toast.error('La cantidad debe ser diferente de cero');
        return;
      }

      if (!stockAdjustment.reason) {
        toast.error('Debe indicar el motivo del ajuste');
        return;
      }

      setLoading(true);
      await wailsIngredientService.adjustStock(
        selectedIngredient.id!,
        stockAdjustment.quantity,
        stockAdjustment.reason,
        user?.id || 0
      );
      toast.success('Stock ajustado correctamente');
      handleCloseStockDialog();
      loadIngredients();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      toast.error('Error al ajustar stock');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMovementsDialog = async (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient);
    setLoading(true);
    try {
      const data = await wailsIngredientService.getIngredientMovements(ingredient.id!);
      setMovements(data);
      setMovementsDialog(true);
    } catch (error) {
      console.error('Error loading movements:', error);
      toast.error('Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseMovementsDialog = () => {
    setMovementsDialog(false);
    setSelectedIngredient(null);
    setMovements([]);
  };

  const getStockStatus = (ingredient: Ingredient) => {
    if (ingredient.stock <= 0) {
      return { color: 'error' as const, label: 'AGOTADO', icon: <WarningIcon /> };
    } else if (ingredient.stock <= ingredient.min_stock) {
      return { color: 'warning' as const, label: 'BAJO', icon: <WarningIcon /> };
    }
    return { color: 'success' as const, label: 'OK' };
  };

  const lowStockIngredients = filteredIngredients.filter(
    (ing) => ing.stock <= ing.min_stock
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Gestión de Ingredientes
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenIngredientDialog()}
        >
          Nuevo Ingrediente
        </Button>
      </Box>

      {/* Low stock alert */}
      {lowStockIngredients.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>{lowStockIngredients.length}</strong> ingrediente(s) con stock bajo o agotado
          </Typography>
        </Alert>
      )}

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Buscar ingredientes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* Ingredients Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Unidad</TableCell>
              <TableCell align="right">Stock Actual</TableCell>
              <TableCell align="right">Stock Mínimo</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Activo</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredIngredients.map((ingredient) => {
              const status = getStockStatus(ingredient);
              return (
                <TableRow key={ingredient.id}>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {ingredient.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{ingredient.unit}</TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={status.color}
                      fontWeight="bold"
                    >
                      {ingredient.stock.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{ingredient.min_stock.toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip
                      label={status.label}
                      color={status.color}
                      size="small"
                      {...(status.icon && { icon: status.icon })}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ingredient.is_active ? 'Sí' : 'No'}
                      color={ingredient.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenStockDialog(ingredient)}
                      title="Ajustar stock"
                    >
                      <InventoryIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenMovementsDialog(ingredient)}
                      title="Ver movimientos"
                    >
                      <HistoryIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenIngredientDialog(ingredient)}
                      title="Editar"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteIngredient(ingredient)}
                      title="Eliminar"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredIngredients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="textSecondary">
                    {searchQuery ? 'No se encontraron ingredientes' : 'No hay ingredientes registrados'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Ingredient Dialog */}
      <Dialog open={ingredientDialog} onClose={handleCloseIngredientDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedIngredient ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nombre"
              fullWidth
              required
              value={ingredientForm.name}
              onChange={(e) =>
                setIngredientForm({ ...ingredientForm, name: e.target.value })
              }
            />
            <FormControl fullWidth required>
              <InputLabel>Unidad de Medida</InputLabel>
              <Select
                value={ingredientForm.unit}
                label="Unidad de Medida"
                onChange={(e) =>
                  setIngredientForm({ ...ingredientForm, unit: e.target.value })
                }
              >
                {UNIT_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Stock Inicial"
              type="number"
              fullWidth
              value={ingredientForm.stock}
              onChange={(e) =>
                setIngredientForm({ ...ingredientForm, stock: parseFloat(e.target.value) || 0 })
              }
              disabled={!!selectedIngredient} // Can't change stock directly when editing
              helperText={selectedIngredient ? 'Use el ajuste de stock para modificar' : ''}
            />
            <TextField
              label="Stock Mínimo"
              type="number"
              fullWidth
              required
              value={ingredientForm.min_stock}
              onChange={(e) =>
                setIngredientForm({ ...ingredientForm, min_stock: parseFloat(e.target.value) || 0 })
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={ingredientForm.is_active ?? true}
                  onChange={(e) =>
                    setIngredientForm({ ...ingredientForm, is_active: e.target.checked })
                  }
                />
              }
              label="Activo"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseIngredientDialog}>Cancelar</Button>
          <Button onClick={handleSaveIngredient} variant="contained" disabled={loading}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={stockDialog} onClose={handleCloseStockDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Ajustar Stock - {selectedIngredient?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">
              Stock actual: <strong>{selectedIngredient?.stock.toFixed(2)} {selectedIngredient?.unit}</strong>
            </Alert>
            <TextField
              label="Cantidad"
              type="number"
              fullWidth
              required
              value={stockAdjustment.quantity}
              onChange={(e) =>
                setStockAdjustment({ ...stockAdjustment, quantity: parseFloat(e.target.value) || 0 })
              }
              helperText="Positivo para agregar, negativo para reducir"
            />
            <TextField
              label="Motivo"
              fullWidth
              required
              multiline
              rows={3}
              value={stockAdjustment.reason}
              onChange={(e) =>
                setStockAdjustment({ ...stockAdjustment, reason: e.target.value })
              }
            />
            {stockAdjustment.quantity !== 0 && selectedIngredient && (
              <Alert severity="success">
                Nuevo stock: <strong>{(selectedIngredient.stock + stockAdjustment.quantity).toFixed(2)} {selectedIngredient.unit}</strong>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseStockDialog}>Cancelar</Button>
          <Button onClick={handleAdjustStock} variant="contained" disabled={loading}>
            Ajustar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Movements Dialog */}
      <Dialog open={movementsDialog} onClose={handleCloseMovementsDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Historial de Movimientos - {selectedIngredient?.name}
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Cantidad</TableCell>
                  <TableCell align="right">Stock Anterior</TableCell>
                  <TableCell align="right">Stock Nuevo</TableCell>
                  <TableCell>Referencia</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      {movement.created_at ? new Date(movement.created_at).toLocaleString('es-CO') : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={movement.type}
                        size="small"
                        color={
                          movement.type === 'purchase' ? 'success' :
                          movement.type === 'sale' ? 'info' :
                          movement.type === 'adjustment' ? 'warning' : 'error'
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {movement.quantity > 0 ? (
                          <TrendingUpIcon color="success" fontSize="small" />
                        ) : (
                          <TrendingDownIcon color="error" fontSize="small" />
                        )}
                        <Typography
                          variant="body2"
                          color={movement.quantity > 0 ? 'success.main' : 'error.main'}
                          fontWeight="bold"
                          sx={{ ml: 0.5 }}
                        >
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity.toFixed(2)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">{movement.previous_qty.toFixed(2)}</TableCell>
                    <TableCell align="right">{movement.new_qty.toFixed(2)}</TableCell>
                    <TableCell>{movement.reference || '-'}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="textSecondary">
                        No hay movimientos registrados
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMovementsDialog}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Ingredients;
