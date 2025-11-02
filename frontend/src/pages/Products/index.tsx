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
  AddCircleOutline as ModifierIcon,
  Close as CloseIcon,
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
import {
  GetModifierGroups,
  GetModifiers,
  CreateModifierGroup,
  UpdateModifierGroup,
  DeleteModifierGroup,
  CreateModifier,
  UpdateModifier,
  DeleteModifier,
  AssignModifierToProduct,
  RemoveModifierFromProduct
} from '../../../wailsjs/go/services/ProductService';

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

  // Modifiers state
  const [modifiersDialog, setModifiersDialog] = useState(false);
  const [modifiersTab, setModifiersTab] = useState(0);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [groupDialog, setGroupDialog] = useState(false);
  const [modifierDialog, setModifierDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [editingModifier, setEditingModifier] = useState<any | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    required: false,
    multiple: false,
    min_select: 0,
    max_select: 1,
  });
  const [modifierForm, setModifierForm] = useState({
    name: '',
    type: 'add',
    price_change: 0,
    group_id: 0,
  });
  const [productModifiers, setProductModifiers] = useState<number[]>([]);

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchCategories());
  }, [dispatch]);

  const handleOpenProductDialog = async (product?: Product) => {
    if (product) {
      setSelectedProduct(product);
      setProductForm(product);
      setImagePreview(product.image || null);
      // Get product modifiers
      const productModifierIds = product.modifiers?.map((m: any) => m.id) || [];
      setProductModifiers(productModifierIds);
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
        has_variable_price: false, // Variable price disabled by default
        tax_type_id: 1, // IVA 19% by default
        unit_measure_id: 796, // Porción by default
      });
      setImagePreview(null);
      setProductModifiers([]);
    }
    // Load available modifiers
    try {
      const mods = await GetModifiers();
      setModifiers(mods || []);
    } catch (error) {
      console.error('Error loading modifiers:', error);
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
      let productId: number;

      if (selectedProduct) {
        await dispatch(updateProduct({
          id: selectedProduct.id!,
          product: productForm,
        })).unwrap();
        productId = selectedProduct.id!;
        toast.success('Producto actualizado');
      } else {
        const result = await dispatch(createProduct(productForm)).unwrap();
        productId = result.id!;
        toast.success('Producto creado');
      }

      // Update modifier assignments
      const previousModifiers = selectedProduct?.modifiers?.map((m: any) => m.id) || [];
      const currentModifiers = productModifiers;

      // Find modifiers to add and remove
      const toAdd = currentModifiers.filter(id => !previousModifiers.includes(id));
      const toRemove = previousModifiers.filter((id: number) => !currentModifiers.includes(id));

      // Assign new modifiers
      for (const modifierId of toAdd) {
        try {
          await AssignModifierToProduct(productId, modifierId);
        } catch (error) {
          console.error('Error assigning modifier:', error);
        }
      }

      // Remove old modifiers
      for (const modifierId of toRemove) {
        try {
          await RemoveModifierFromProduct(productId, modifierId);
        } catch (error) {
          console.error('Error removing modifier:', error);
        }
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

  // Modifiers handlers
  const loadModifiersData = async () => {
    try {
      const [groups, mods] = await Promise.all([
        GetModifierGroups(),
        GetModifiers()
      ]);
      setModifierGroups(groups || []);
      setModifiers(mods || []);
    } catch (error) {
      console.error('Error loading modifiers:', error);
      toast.error('Error al cargar modificadores');
    }
  };

  const handleOpenModifiersDialog = () => {
    setModifiersDialog(true);
    loadModifiersData();
  };

  const handleOpenGroupDialog = (group?: any) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        required: group.required,
        multiple: group.multiple,
        min_select: group.min_select,
        max_select: group.max_select,
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: '',
        required: false,
        multiple: false,
        min_select: 0,
        max_select: 1,
      });
    }
    setGroupDialog(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      const payload = {
        ...groupForm,
        id: editingGroup?.id
      };

      if (editingGroup) {
        await UpdateModifierGroup(payload as any);
        toast.success('Grupo actualizado');
      } else {
        await CreateModifierGroup(payload as any);
        toast.success('Grupo creado');
      }
      setGroupDialog(false);
      loadModifiersData();
    } catch (error) {
      toast.error('Error al guardar grupo');
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este grupo?')) {
      try {
        await DeleteModifierGroup(id);
        toast.success('Grupo eliminado');
        loadModifiersData();
      } catch (error) {
        toast.error('Error al eliminar grupo');
      }
    }
  };

  const handleOpenModifierDialog = (modifier?: any) => {
    if (modifier) {
      setEditingModifier(modifier);
      setModifierForm({
        name: modifier.name,
        type: modifier.type || 'add',
        price_change: modifier.price_change || 0,
        group_id: modifier.group_id || 0,
      });
    } else {
      setEditingModifier(null);
      setModifierForm({
        name: '',
        type: 'add',
        price_change: 0,
        group_id: 0,
      });
    }
    setModifierDialog(true);
  };

  const handleSaveModifier = async () => {
    if (!modifierForm.name) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      const payload = {
        ...modifierForm,
        id: editingModifier?.id
      };

      if (editingModifier) {
        await UpdateModifier(payload as any);
        toast.success('Modificador actualizado');
      } else {
        await CreateModifier(payload as any);
        toast.success('Modificador creado');
      }
      setModifierDialog(false);
      loadModifiersData();
    } catch (error) {
      toast.error('Error al guardar modificador');
    }
  };

  const handleDeleteModifier = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este modificador?')) {
      try {
        await DeleteModifier(id);
        toast.success('Modificador eliminado');
        loadModifiersData();
      } catch (error) {
        toast.error('Error al eliminar modificador');
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
            startIcon={<ModifierIcon />}
            onClick={handleOpenModifiersDialog}
          >
            Modificadores
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
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={productForm.has_variable_price || false}
                    onChange={(e) => setProductForm({ ...productForm, has_variable_price: e.target.checked })}
                  />
                }
                label="Precio Variable (requiere digitar precio en venta)"
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
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Modificadores
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Selecciona los modificadores disponibles para este producto (extras, ingredientes, etc.)
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {modifiers.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No hay modificadores disponibles. Créalos primero en la sección de Modificadores.
                  </Typography>
                ) : (
                  modifiers.map((modifier) => (
                    <Chip
                      key={modifier.id}
                      label={`${modifier.name} (${modifier.price_change >= 0 ? '+' : ''}$${modifier.price_change})`}
                      onClick={() => {
                        if (productModifiers.includes(modifier.id)) {
                          setProductModifiers(productModifiers.filter(id => id !== modifier.id));
                        } else {
                          setProductModifiers([...productModifiers, modifier.id]);
                        }
                      }}
                      color={productModifiers.includes(modifier.id) ? 'primary' : 'default'}
                      variant={productModifiers.includes(modifier.id) ? 'filled' : 'outlined'}
                      icon={productModifiers.includes(modifier.id) ? <CloseIcon /> : <AddIcon />}
                    />
                  ))
                )}
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

      {/* Modifiers Management Dialog */}
      <Dialog open={modifiersDialog} onClose={() => setModifiersDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Gestión de Modificadores
        </DialogTitle>
        <DialogContent>
          <Tabs value={modifiersTab} onChange={(_, v) => setModifiersTab(v)} sx={{ mb: 2 }}>
            <Tab label="Grupos de Modificadores" />
            <Tab label="Modificadores" />
          </Tabs>

          {/* Modifier Groups Tab */}
          {modifiersTab === 0 && (
            <Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenGroupDialog()}
                sx={{ mb: 2 }}
              >
                Nuevo Grupo
              </Button>

              <Grid container spacing={2}>
                {modifierGroups.map((group) => (
                  <Grid item xs={12} sm={6} key={group.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6">{group.name}</Typography>
                        <Box sx={{ mt: 1 }}>
                          <Chip
                            label={group.required ? 'Requerido' : 'Opcional'}
                            size="small"
                            color={group.required ? 'primary' : 'default'}
                            sx={{ mr: 1 }}
                          />
                          <Chip
                            label={group.multiple ? 'Múltiple' : 'Único'}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                          {group.multiple && (
                            <Chip
                              label={`Min: ${group.min_select} Max: ${group.max_select}`}
                              size="small"
                            />
                          )}
                        </Box>
                      </CardContent>
                      <CardActions>
                        <IconButton size="small" onClick={() => handleOpenGroupDialog(group)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteGroup(group.id)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Modifiers Tab */}
          {modifiersTab === 1 && (
            <Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenModifierDialog()}
                sx={{ mb: 2 }}
              >
                Nuevo Modificador
              </Button>

              <Grid container spacing={2}>
                {modifiers.map((modifier) => (
                  <Grid item xs={12} sm={6} md={4} key={modifier.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6">{modifier.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {modifier.modifier_group?.name || 'Sin grupo'}
                        </Typography>
                        <Typography variant="h6" color={modifier.price_change >= 0 ? 'primary' : 'error'} sx={{ mt: 1 }}>
                          {modifier.price_change >= 0 ? '+' : ''}${modifier.price_change?.toLocaleString('es-CO')}
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <IconButton size="small" onClick={() => handleOpenModifierDialog(modifier)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteModifier(modifier.id)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifiersDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modifier Group Dialog */}
      <Dialog open={groupDialog} onClose={() => setGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingGroup ? 'Editar Grupo' : 'Nuevo Grupo de Modificadores'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre del Grupo"
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              required
            />
            <FormControlLabel
              control={
                <Switch
                  checked={groupForm.required}
                  onChange={(e) => setGroupForm({ ...groupForm, required: e.target.checked })}
                />
              }
              label="Requerido (el cliente debe seleccionar al menos uno)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={groupForm.multiple}
                  onChange={(e) => setGroupForm({ ...groupForm, multiple: e.target.checked })}
                />
              }
              label="Selección múltiple (permitir seleccionar varios)"
            />
            {groupForm.multiple && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Mínimo a seleccionar"
                  type="number"
                  value={groupForm.min_select}
                  onChange={(e) => setGroupForm({ ...groupForm, min_select: Number(e.target.value) })}
                />
                <TextField
                  fullWidth
                  label="Máximo a seleccionar"
                  type="number"
                  value={groupForm.max_select}
                  onChange={(e) => setGroupForm({ ...groupForm, max_select: Number(e.target.value) })}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveGroup} variant="contained">
            {editingGroup ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modifier Dialog */}
      <Dialog open={modifierDialog} onClose={() => setModifierDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingModifier ? 'Editar Modificador' : 'Nuevo Modificador'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre"
              value={modifierForm.name}
              onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })}
              required
            />
            <FormControl fullWidth>
              <InputLabel>Grupo</InputLabel>
              <Select
                value={modifierForm.group_id || ''}
                onChange={(e) => setModifierForm({ ...modifierForm, group_id: Number(e.target.value) })}
                label="Grupo"
              >
                <MenuItem value={0}>Sin grupo</MenuItem>
                {modifierGroups.map(group => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Cambio de Precio"
              type="number"
              value={modifierForm.price_change}
              onChange={(e) => setModifierForm({ ...modifierForm, price_change: Number(e.target.value) })}
              helperText="Use números positivos para agregar al precio, negativos para restar"
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifierDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveModifier} variant="contained">
            {editingModifier ? 'Actualizar' : 'Crear'}
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
