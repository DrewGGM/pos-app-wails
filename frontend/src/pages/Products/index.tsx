import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
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
  Tab,
  Tabs,
  Chip,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Fab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Inventory as InventoryIcon,
  Category as CategoryIcon,
  Warning as WarningIcon,
  Upload as UploadIcon,
  QrCode as QrCodeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import {
  fetchProducts,
  fetchCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  createCategory,
  updateCategory,
  deleteCategory,
  setSelectedCategory,
  setSearchQuery,
} from '../../store/slices/productsSlice';
import { Product, Category } from '../../types/models';
import { toast } from 'react-toastify';
import { compressImageToBase64, getBase64Size } from '../../utils/imageUtils';
import { useAuth } from '../../hooks';

const Products: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAuth();
  const {
    products,
    categories,
    selectedCategory,
    searchQuery,
    loading,
    lowStockProducts,
  } = useSelector((state: RootState) => state.products);

  const [selectedTab, setSelectedTab] = useState(0);
  const [productDialog, setProductDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({
    name: '',
    description: '',
    price: 0,
    cost: 0,
    category_id: 0,
    stock: 0,
    min_stock: 5,
    barcode: '',
    active: true,
    tax_type_id: 1, // IVA 19% by default
    unit_measure_id: 796, // Porción by default (appropriate for restaurants)
  });
  const [stockAdjustment, setStockAdjustment] = useState({
    quantity: 0,
    reason: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<Partial<Category>>({
    name: '',
    description: '',
  });

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchCategories());
  }, [dispatch]);

  const handleOpenProductDialog = (product?: Product) => {
    if (product) {
      setSelectedProduct(product);
      setProductForm(product);
      setImagePreview(product.image || null);
    } else {
      setSelectedProduct(null);
      setProductForm({
        name: '',
        description: '',
        price: 0,
        cost: 0,
        category_id: selectedCategory || 0,
        stock: 0,
        min_stock: 5,
        barcode: '',
        active: true,
        tax_type_id: 1, // IVA 19% by default
        unit_measure_id: 796, // Porción by default
      });
      setImagePreview(null);
    }
    setProductDialog(true);
  };

  const handleCloseProductDialog = () => {
    setProductDialog(false);
    setSelectedProduct(null);
    setImagePreview(null);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);

    try {
      // Compress and convert to Base64
      const base64Image = await compressImageToBase64(file, 400, 400, 0.8);

      // Get size in KB
      const sizeKB = getBase64Size(base64Image);

      if (sizeKB > 500) {
        toast.warning(`Imagen comprimida a ${sizeKB}KB. Se recomienda usar imágenes más pequeñas.`);
      } else {
        toast.success(`Imagen cargada exitosamente (${sizeKB}KB)`);
      }

      // Update preview and form
      setImagePreview(base64Image);
      setProductForm({ ...productForm, image: base64Image });

    } catch (error: any) {
      toast.error(error.message || 'Error al cargar la imagen');
      console.error('Error uploading image:', error);
    } finally {
      setIsUploadingImage(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setProductForm({ ...productForm, image: '' });
    toast.info('Imagen eliminada');
  };

  const handleSaveProduct = async () => {
    try {
      if (selectedProduct) {
        await dispatch(updateProduct({
          id: selectedProduct.id!,
          product: productForm,
        })).unwrap();
        toast.success('Producto actualizado');
      } else {
        await dispatch(createProduct(productForm)).unwrap();
        toast.success('Producto creado');
      }
      handleCloseProductDialog();
      // Reload products to show changes
      dispatch(fetchProducts());
    } catch (error) {
      toast.error('Error al guardar producto');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este producto?')) {
      try {
        await dispatch(deleteProduct(id)).unwrap();
        toast.success('Producto eliminado');
      } catch (error) {
        toast.error('Error al eliminar producto');
      }
    }
  };

  const handleOpenStockDialog = (product: Product) => {
    setSelectedProduct(product);
    setStockAdjustment({ quantity: 0, reason: '' });
    setStockDialog(true);
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct) {
      toast.error('Seleccione un producto');
      return;
    }

    try {
      await dispatch(adjustStock({
        productId: selectedProduct.id!,
        quantity: stockAdjustment.quantity,
        reason: stockAdjustment.reason || 'Ajuste manual',
        employeeId: user?.id,
      })).unwrap();
      toast.success('Stock ajustado');
      setStockDialog(false);

      // IMPORTANTE: Recargar productos para obtener stock actualizado de la BD
      dispatch(fetchProducts());
    } catch (error) {
      toast.error('Error al ajustar stock');
    }
  };

  // Category handlers
  const handleOpenCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '' });
    }
    setCategoryDialog(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      if (editingCategory) {
        await dispatch(updateCategory({
          id: editingCategory.id!,
          category: categoryForm,
        })).unwrap();
        toast.success('Categoría actualizada');
      } else {
        await dispatch(createCategory(categoryForm)).unwrap();
        toast.success('Categoría creada');
      }
      setCategoryDialog(false);
      dispatch(fetchCategories());
    } catch (error) {
      toast.error('Error al guardar categoría');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar esta categoría?')) {
      try {
        await dispatch(deleteCategory(id)).unwrap();
        toast.success('Categoría eliminada');
        dispatch(fetchCategories());
      } catch (error) {
        toast.error('Error al eliminar categoría');
      }
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = !selectedCategory || product.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode?.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const renderProductGrid = () => (
    <Grid container spacing={2}>
      {filteredProducts.map(product => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              border: product.stock <= 0 ? '2px solid #d32f2f' : undefined,
            }}
          >
            {product.image ? (
              <CardMedia
                component="img"
                height="180"
                image={product.image}
                alt={product.name}
                sx={{
                  objectFit: 'cover',
                  backgroundColor: '#f5f5f5',
                }}
              />
            ) : (
              <Box
                sx={{
                  height: 180,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f5f5f5',
                  color: '#9e9e9e',
                }}
              >
                <Typography variant="body2">Sin imagen</Typography>
              </Box>
            )}
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography gutterBottom variant="h6" component="div" noWrap>
                {product.name}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                gutterBottom
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  minHeight: '2.5em',
                }}
              >
                {product.description || 'Sin descripción'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, alignItems: 'center' }}>
                <Typography variant="h6" color="primary">
                  ${product.price.toLocaleString('es-CO')}
                </Typography>
                <Chip
                  size="small"
                  label={`Stock: ${product.stock}`}
                  color={product.stock <= 0 ? 'error' : product.stock <= (product.min_stock || 0) ? 'warning' : 'default'}
                />
              </Box>
            </CardContent>
            <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
              <Box>
                <IconButton
                  size="small"
                  onClick={() => handleOpenProductDialog(product)}
                  title="Editar"
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleOpenStockDialog(product)}
                  title="Ajustar stock"
                >
                  <InventoryIcon />
                </IconButton>
              </Box>
              <IconButton
                size="small"
                onClick={() => product.id && handleDeleteProduct(product.id)}
                color="error"
                title="Eliminar"
              >
                <DeleteIcon />
              </IconButton>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  const renderProductList = () => (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <Box sx={{ p: 2 }}>
        {/* Implementar tabla de productos */}
        <Typography>Vista de lista (por implementar)</Typography>
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Productos</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => dispatch(fetchProducts())}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Refrescar'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<CategoryIcon />}
            onClick={() => handleOpenCategoryDialog()}
          >
            Categorías
          </Button>
          <Button
            variant="outlined"
            startIcon={<QrCodeIcon />}
          >
            Imprimir Códigos
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenProductDialog()}
          >
            Nuevo Producto
          </Button>
        </Box>
      </Box>

      {lowStockProducts.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, backgroundColor: '#fff3e0' }}>
          <Typography variant="subtitle1" color="warning.main" gutterBottom>
            ⚠️ Productos con stock bajo ({lowStockProducts.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {lowStockProducts.slice(0, 5).map(product => (
              <Chip
                key={product.id}
                label={`${product.name} (${product.stock})`}
                color="warning"
                size="small"
              />
            ))}
            {lowStockProducts.length > 5 && (
              <Chip
                label={`+${lowStockProducts.length - 5} más`}
                size="small"
              />
            )}
          </Box>
        </Paper>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Buscar producto o código..."
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />
        </Box>

        <Tabs
          value={selectedCategory ?? 'all'}
          onChange={(_, value) => dispatch(setSelectedCategory(value === 'all' ? null : value))}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab label="Todos" value="all" />
          {categories.map(category => (
            <Tab
              key={category.id}
              label={category.name}
              value={category.id}
            />
          ))}
        </Tabs>

        <Tabs value={selectedTab} onChange={(_, value) => setSelectedTab(value)}>
          <Tab label="Cuadrícula" />
          <Tab label="Lista" />
        </Tabs>
      </Paper>

      {selectedTab === 0 ? renderProductGrid() : renderProductList()}

      {/* Product Dialog */}
      <Dialog open={productDialog} onClose={handleCloseProductDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedProduct ? 'Editar Producto' : 'Nuevo Producto'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Nombre"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Código de Barras"
                value={productForm.barcode}
                onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descripción"
                multiline
                rows={2}
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={productForm.category_id || 0}
                  onChange={(e) => setProductForm({ ...productForm, category_id: Number(e.target.value) })}
                  label="Categoría"
                >
                  {categories.map(category => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={productForm.active}
                    onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })}
                  />
                }
                label="Activo"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Precio"
                type="number"
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Costo"
                type="number"
                value={productForm.cost}
                onChange={(e) => setProductForm({ ...productForm, cost: Number(e.target.value) })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Stock Mínimo"
                type="number"
                value={productForm.min_stock}
                onChange={(e) => setProductForm({ ...productForm, min_stock: Number(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de IVA</InputLabel>
                <Select
                  value={productForm.tax_type_id || 1}
                  onChange={(e) => setProductForm({ ...productForm, tax_type_id: Number(e.target.value) })}
                  label="Tipo de IVA"
                >
                  <MenuItem value={1}>IVA 19%</MenuItem>
                  <MenuItem value={5}>IVA 0% (Exento)</MenuItem>
                  <MenuItem value={6}>IVA 5%</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Unidad de Medida</InputLabel>
                <Select
                  value={productForm.unit_measure_id || 796}
                  onChange={(e) => setProductForm({ ...productForm, unit_measure_id: Number(e.target.value) })}
                  label="Unidad de Medida"
                >
                  <MenuItem value={796}>Porción</MenuItem>
                  <MenuItem value={797}>Ración</MenuItem>
                  <MenuItem value={70}>Unidad</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {imagePreview && (
                  <Box sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 400,
                    mx: 'auto',
                  }}>
                    <CardMedia
                      component="img"
                      image={imagePreview}
                      alt="Preview"
                      sx={{
                        borderRadius: 2,
                        border: '2px solid #e0e0e0',
                        maxHeight: 300,
                        objectFit: 'contain',
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={handleRemoveImage}
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
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadIcon />}
                  fullWidth
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? 'Procesando...' : imagePreview ? 'Cambiar Imagen' : 'Subir Imagen'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageUpload}
                  />
                </Button>
                <Typography variant="caption" color="text.secondary" textAlign="center">
                  Formatos: JPG, PNG, WEBP (máx 10MB). La imagen será comprimida automáticamente.
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseProductDialog}>Cancelar</Button>
          <Button onClick={handleSaveProduct} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={stockDialog} onClose={() => setStockDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ajustar Stock - {selectedProduct?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Stock actual: <strong>{selectedProduct?.stock}</strong>
            </Typography>
            <TextField
              fullWidth
              label="Cantidad a ajustar"
              type="number"
              value={stockAdjustment.quantity}
              onChange={(e) => setStockAdjustment({
                ...stockAdjustment,
                quantity: Number(e.target.value),
              })}
              helperText="Use números negativos para reducir stock"
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              fullWidth
              label="Razón del ajuste (opcional)"
              placeholder="Ajuste manual"
              multiline
              rows={2}
              value={stockAdjustment.reason}
              onChange={(e) => setStockAdjustment({
                ...stockAdjustment,
                reason: e.target.value,
              })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialog(false)}>Cancelar</Button>
          <Button onClick={handleAdjustStock} variant="contained">
            Ajustar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={categoryDialog} onClose={() => setCategoryDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {/* Category Form */}
            <TextField
              fullWidth
              label="Nombre"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Descripción"
              multiline
              rows={2}
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              sx={{ mb: 3 }}
            />

            {/* Existing Categories List */}
            {!editingCategory && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Categorías Existentes
                </Typography>
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {categories.map((cat) => (
                    <Card key={cat.id} sx={{ mb: 1, display: 'flex', alignItems: 'center', p: 1 }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle1">{cat.name}</Typography>
                        {cat.description && (
                          <Typography variant="body2" color="text.secondary">
                            {cat.description}
                          </Typography>
                        )}
                      </Box>
                      <Box>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenCategoryDialog(cat)}
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCategory(cat.id!)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Card>
                  ))}
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveCategory} variant="contained">
            {editingCategory ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => handleOpenProductDialog()}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default Products;
