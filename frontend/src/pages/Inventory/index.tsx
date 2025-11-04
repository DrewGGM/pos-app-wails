import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Tabs,
  Tab,
  Stack,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  History as HistoryIcon,
  FilterList as FilterListIcon,
  Search as SearchIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { wailsProductService } from '../../services/wailsProductService';
import { GetInventoryMovements } from '../../../wailsjs/go/services/ProductService';
import { Product, InventoryMovement } from '../../types/models';
import { toast } from 'react-toastify';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const InventoryManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low' | 'out' | 'tracked'>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [tabValue, setTabValue] = useState(0);

  // Stock adjustment dialog
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // History dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [products, searchTerm, filterType]);

  const loadProducts = async () => {
    try {
      const data = await wailsProductService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Error al cargar productos');
    }
  };

  const applyFilters = () => {
    let filtered = [...products];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchTerm))
      );
    }

    // Apply type filter
    switch (filterType) {
      case 'low':
        filtered = filtered.filter(p =>
          p.track_inventory !== false &&
          p.stock > 0 &&
          p.stock <= (p.min_stock || 0)
        );
        break;
      case 'out':
        filtered = filtered.filter(p =>
          p.track_inventory !== false &&
          p.stock <= 0
        );
        break;
      case 'tracked':
        filtered = filtered.filter(p => p.track_inventory !== false);
        break;
      default:
        // 'all' - no additional filter
        break;
    }

    setFilteredProducts(filtered);
  };

  const getStockStatus = (product: Product): { label: string; color: 'error' | 'warning' | 'success' | 'default' } => {
    if (product.track_inventory === false) {
      return { label: 'Sin Seguimiento', color: 'default' };
    }
    if (product.stock <= 0) {
      return { label: 'Agotado', color: 'error' };
    }
    if (product.stock <= (product.min_stock || 0)) {
      return { label: 'Stock Bajo', color: 'warning' };
    }
    return { label: 'Normal', color: 'success' };
  };

  const handleOpenAdjustDialog = (product: Product) => {
    setSelectedProduct(product);
    setAdjustmentQuantity(0);
    setAdjustmentReason('');
    setAdjustDialogOpen(true);
  };

  const handleCloseAdjustDialog = () => {
    setAdjustDialogOpen(false);
    setSelectedProduct(null);
    setAdjustmentQuantity(0);
    setAdjustmentReason('');
  };

  const handleSaveAdjustment = async () => {
    if (!selectedProduct) return;
    if (adjustmentQuantity === 0) {
      toast.error('La cantidad debe ser diferente de cero');
      return;
    }
    if (!adjustmentReason.trim()) {
      toast.error('Debe ingresar una razón para el ajuste');
      return;
    }

    try {
      await wailsProductService.adjustStock(
        selectedProduct.id!,
        adjustmentQuantity,
        adjustmentReason,
        0 // employeeID - 0 for system/admin
      );
      toast.success('Inventario ajustado correctamente');
      handleCloseAdjustDialog();
      loadProducts();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      toast.error('Error al ajustar inventario');
    }
  };

  const handleOpenHistoryDialog = async (product: Product) => {
    setSelectedProduct(product);
    try {
      const data = await GetInventoryMovements(product.id!);
      // Map Wails models to frontend models
      const mappedMovements: InventoryMovement[] = data.map((m: any) => ({
        id: m.id,
        product_id: m.product_id,
        type: m.type,
        quantity: m.quantity,
        previous_qty: m.previous_qty,
        new_qty: m.new_qty,
        reference: m.reference,
        employee_id: m.employee_id,
        notes: m.notes,
        created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
      }));
      setMovements(mappedMovements);
      setHistoryDialogOpen(true);
    } catch (error) {
      console.error('Error loading movements:', error);
      toast.error('Error al cargar historial de movimientos');
    }
  };

  const handleCloseHistoryDialog = () => {
    setHistoryDialogOpen(false);
    setSelectedProduct(null);
    setMovements([]);
  };

  const getMovementTypeLabel = (type: string): string => {
    const types: { [key: string]: string } = {
      'purchase': 'Compra',
      'sale': 'Venta',
      'adjustment': 'Ajuste',
      'transfer': 'Transferencia',
      'return': 'Devolución',
    };
    return types[type] || type;
  };

  const getMovementTypeColor = (type: string): 'primary' | 'error' | 'warning' | 'info' | 'success' => {
    const colors: { [key: string]: 'primary' | 'error' | 'warning' | 'info' | 'success' } = {
      'purchase': 'success',
      'sale': 'error',
      'adjustment': 'warning',
      'transfer': 'info',
      'return': 'primary',
    };
    return colors[type] || 'primary';
  };

  // Calculate summary stats
  const stats = {
    totalProducts: products.length,
    trackedProducts: products.filter(p => p.track_inventory !== false).length,
    lowStock: products.filter(p => p.track_inventory !== false && p.stock > 0 && p.stock <= (p.min_stock || 0)).length,
    outOfStock: products.filter(p => p.track_inventory !== false && p.stock <= 0).length,
    totalValue: products.reduce((sum, p) => sum + (p.stock * (p.cost || p.price)), 0),
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InventoryIcon /> Gestión de Inventario
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Productos
              </Typography>
              <Typography variant="h4">{stats.totalProducts}</Typography>
              <Typography variant="caption" color="text.secondary">
                {stats.trackedProducts} con seguimiento
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'warning.light' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon />
                <Typography color="text.secondary" gutterBottom>
                  Stock Bajo
                </Typography>
              </Box>
              <Typography variant="h4">{stats.lowStock}</Typography>
              <Typography variant="caption">
                Productos con inventario bajo
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'error.light' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingDownIcon />
                <Typography color="text.secondary" gutterBottom>
                  Agotados
                </Typography>
              </Box>
              <Typography variant="h4">{stats.outOfStock}</Typography>
              <Typography variant="caption">
                Productos sin stock
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'success.light' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Valor Total
              </Typography>
              <Typography variant="h4">
                ${stats.totalValue.toLocaleString()}
              </Typography>
              <Typography variant="caption">
                Inventario valorizado
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Buscar por nombre o código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Filtrar por</InputLabel>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                label="Filtrar por"
                startAdornment={<FilterListIcon sx={{ ml: 1, mr: 0.5, color: 'text.secondary' }} />}
              >
                <MenuItem value="all">Todos los productos</MenuItem>
                <MenuItem value="tracked">Solo con seguimiento</MenuItem>
                <MenuItem value="low">Stock bajo</MenuItem>
                <MenuItem value="out">Agotados</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Products Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Producto</TableCell>
              <TableCell>Código</TableCell>
              <TableCell align="center">Stock Actual</TableCell>
              <TableCell align="center">Stock Mínimo</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="center">Valor Inventario</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary" sx={{ py: 4 }}>
                    No se encontraron productos
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => {
                const status = getStockStatus(product);
                const inventoryValue = product.stock * (product.cost || product.price);

                return (
                  <TableRow key={product.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body1">{product.name}</Typography>
                        {product.track_inventory === false && (
                          <Chip
                            size="small"
                            label="Sin seguimiento"
                            variant="outlined"
                            sx={{ mt: 0.5 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{product.barcode || '-'}</TableCell>
                    <TableCell align="center">
                      <Typography
                        variant="h6"
                        color={product.stock <= 0 ? 'error' : product.stock <= (product.min_stock || 0) ? 'warning.main' : 'inherit'}
                      >
                        {product.track_inventory === false ? '-' : product.stock}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {product.track_inventory === false ? '-' : (product.min_stock || 0)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={status.label} color={status.color} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {product.track_inventory === false ? '-' : `$${inventoryValue.toLocaleString()}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Tooltip title="Ajustar Stock">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenAdjustDialog(product)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Ver Historial">
                          <IconButton
                            size="small"
                            color="info"
                            onClick={() => handleOpenHistoryDialog(product)}
                          >
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onClose={handleCloseAdjustDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Ajustar Inventario - {selectedProduct?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Stock actual:</strong> {selectedProduct?.stock || 0} unidades
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                Ingrese un número positivo para aumentar o negativo para disminuir
              </Typography>
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Cantidad a ajustar"
                  type="number"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(Number(e.target.value))}
                  helperText={
                    adjustmentQuantity !== 0
                      ? `Nuevo stock: ${(selectedProduct?.stock || 0) + adjustmentQuantity}`
                      : 'Ingrese la cantidad de ajuste'
                  }
                  InputProps={{
                    startAdornment: adjustmentQuantity > 0 ? <AddIcon color="success" /> : adjustmentQuantity < 0 ? <RemoveIcon color="error" /> : null,
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Razón del ajuste"
                  multiline
                  rows={3}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Ej: Recepción de mercancía, corrección de inventario, producto dañado, etc."
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdjustDialog}>Cancelar</Button>
          <Button
            onClick={handleSaveAdjustment}
            variant="contained"
            disabled={adjustmentQuantity === 0 || !adjustmentReason.trim()}
          >
            Guardar Ajuste
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onClose={handleCloseHistoryDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Historial de Movimientos - {selectedProduct?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {movements.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                No hay movimientos registrados para este producto
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell align="center">Cantidad</TableCell>
                      <TableCell align="center">Stock Anterior</TableCell>
                      <TableCell align="center">Stock Nuevo</TableCell>
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
                            label={getMovementTypeLabel(movement.type)}
                            color={getMovementTypeColor(movement.type)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            color={movement.quantity > 0 ? 'success.main' : 'error.main'}
                            fontWeight="bold"
                          >
                            {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">{movement.previous_qty}</TableCell>
                        <TableCell align="center">{movement.new_qty}</TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {movement.reference || movement.notes || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHistoryDialog}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InventoryManagement;
