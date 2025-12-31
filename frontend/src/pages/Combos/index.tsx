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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon,
  Remove as RemoveIcon,
  Fastfood as FastfoodIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchProducts, fetchCategories } from '../../store/slices/productsSlice';
import { Combo, ComboItem, Product, Category } from '../../types/models';
import { wailsComboService } from '../../services/wailsComboService';
import { toast } from 'react-toastify';
import { compressImageToBase64, getBase64Size } from '../../utils/imageUtils';

const Combos: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { products, categories } = useSelector((state: RootState) => state.products);

  // State for combos list
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // State for combo dialog
  const [comboDialog, setComboDialog] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<Combo | null>(null);
  const [comboForm, setComboForm] = useState<Partial<Combo>>({
    name: '',
    description: '',
    price: 0,
    image: '',
    category_id: undefined,
    is_active: true,
    tax_type_id: 1,
    display_order: 0,
    items: [],
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // State for adding products to combo
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [productQuantity, setProductQuantity] = useState<number>(1);

  // Load initial data
  useEffect(() => {
    loadCombos();
    dispatch(fetchProducts());
    dispatch(fetchCategories());
  }, [dispatch]);

  const loadCombos = async () => {
    setLoading(true);
    try {
      const data = await wailsComboService.getAllCombosAdmin();
      setCombos(data);
    } catch (error) {
      toast.error('Error al cargar combos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenComboDialog = (combo?: Combo) => {
    if (combo) {
      setSelectedCombo(combo);
      setComboForm({
        id: combo.id,
        name: combo.name,
        description: combo.description || '',
        price: combo.price,
        image: combo.image || '',
        category_id: combo.category_id,
        is_active: combo.is_active,
        tax_type_id: combo.tax_type_id || 1,
        display_order: combo.display_order || 0,
        items: combo.items || [],
      });
      setImagePreview(combo.image || null);
    } else {
      setSelectedCombo(null);
      setComboForm({
        name: '',
        description: '',
        price: 0,
        image: '',
        category_id: undefined,
        is_active: true,
        tax_type_id: 1,
        display_order: 0,
        items: [],
      });
      setImagePreview(null);
    }
    setSelectedProductId(0);
    setProductQuantity(1);
    setComboDialog(true);
  };

  const handleCloseComboDialog = () => {
    setComboDialog(false);
    setSelectedCombo(null);
    setImagePreview(null);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);

    try {
      const base64Image = await compressImageToBase64(file, 400, 400, 0.8);
      const sizeKB = getBase64Size(base64Image);

      if (sizeKB > 500) {
        toast.warning(`Imagen comprimida a ${sizeKB}KB. Se recomienda usar imágenes más pequeñas.`);
      } else {
        toast.success(`Imagen cargada exitosamente (${sizeKB}KB)`);
      }

      setImagePreview(base64Image);
      setComboForm({ ...comboForm, image: base64Image });
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar la imagen');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setComboForm({ ...comboForm, image: '' });
    toast.info('Imagen eliminada');
  };

  const handleAddProductToCombo = () => {
    if (selectedProductId === 0 || productQuantity <= 0) {
      toast.error('Seleccione un producto y una cantidad válida');
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) {
      toast.error('Producto no encontrado');
      return;
    }

    // Check if product already exists in combo
    const existingItem = comboForm.items?.find(item => item.product_id === selectedProductId);
    if (existingItem) {
      toast.error('Este producto ya está en el combo');
      return;
    }

    const newItem: Partial<ComboItem> = {
      product_id: selectedProductId,
      product: product,
      quantity: productQuantity,
      position: (comboForm.items?.length || 0),
    };

    setComboForm({
      ...comboForm,
      items: [...(comboForm.items || []), newItem as ComboItem],
    });

    setSelectedProductId(0);
    setProductQuantity(1);
  };

  const handleRemoveProductFromCombo = (productId: number) => {
    setComboForm({
      ...comboForm,
      items: (comboForm.items || []).filter(item => item.product_id !== productId),
    });
  };

  const handleUpdateProductQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) return;
    setComboForm({
      ...comboForm,
      items: (comboForm.items || []).map(item =>
        item.product_id === productId ? { ...item, quantity } : item
      ),
    });
  };

  const handleSaveCombo = async () => {
    if (!comboForm.name?.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (!comboForm.price || comboForm.price <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }

    if (!comboForm.items || comboForm.items.length === 0) {
      toast.error('Debe agregar al menos un producto al combo');
      return;
    }

    try {
      if (selectedCombo) {
        await wailsComboService.updateCombo(comboForm);
        toast.success('Combo actualizado');
      } else {
        await wailsComboService.createCombo(comboForm);
        toast.success('Combo creado');
      }
      handleCloseComboDialog();
      loadCombos();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar combo');
    }
  };

  const handleDeleteCombo = async (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este combo?')) {
      try {
        await wailsComboService.deleteCombo(id);
        toast.success('Combo eliminado');
        loadCombos();
      } catch (error: any) {
        toast.error(error.message || 'Error al eliminar combo');
      }
    }
  };

  const handleToggleActive = async (combo: Combo) => {
    try {
      await wailsComboService.toggleComboActive(combo.id!);
      toast.success(`Combo ${combo.is_active ? 'desactivado' : 'activado'}`);
      loadCombos();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    }
  };

  // Calculate total value of products in combo
  const getComboProductsTotal = () => {
    return (comboForm.items || []).reduce((total, item) => {
      const product = products.find(p => p.id === item.product_id);
      return total + (product?.price || 0) * item.quantity;
    }, 0);
  };

  // Filter combos
  const filteredCombos = combos.filter(combo => {
    const matchesCategory = !selectedCategory || combo.category_id === selectedCategory;
    const matchesSearch = !searchQuery ||
      combo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      combo.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Combos</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadCombos}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Refrescar'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenComboDialog()}
          >
            Nuevo Combo
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Buscar combo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
          onChange={(_, value) => setSelectedCategory(value === 'all' ? null : value)}
          variant="scrollable"
          scrollButtons="auto"
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
      </Paper>

      {filteredCombos.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <FastfoodIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No hay combos disponibles
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Crea tu primer combo para empezar
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenComboDialog()}
          >
            Crear Combo
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {filteredCombos.map(combo => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={combo.id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  opacity: combo.is_active ? 1 : 0.6,
                  border: combo.is_active ? undefined : '2px dashed #ccc',
                }}
              >
                {combo.image ? (
                  <CardMedia
                    component="img"
                    height="180"
                    image={combo.image}
                    alt={combo.name}
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
                    <FastfoodIcon sx={{ fontSize: 64 }} />
                  </Box>
                )}
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography gutterBottom variant="h6" component="div" noWrap sx={{ flexGrow: 1, mb: 0 }}>
                      {combo.name}
                    </Typography>
                    {!combo.is_active && (
                      <Chip label="Inactivo" size="small" color="default" />
                    )}
                  </Box>
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
                    {combo.description || 'Sin descripción'}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {combo.items?.length || 0} producto(s)
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, alignItems: 'center' }}>
                    <Typography variant="h6" color="primary">
                      ${combo.price.toLocaleString('es-CO')}
                    </Typography>
                    {combo.category && (
                      <Chip
                        size="small"
                        label={combo.category.name}
                        variant="outlined"
                      />
                    )}
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenComboDialog(combo)}
                      title="Editar"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleActive(combo)}
                      title={combo.is_active ? 'Desactivar' : 'Activar'}
                      color={combo.is_active ? 'default' : 'success'}
                    >
                      {combo.is_active ? <RemoveIcon /> : <AddIcon />}
                    </IconButton>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => combo.id && handleDeleteCombo(combo.id)}
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
      )}

      {/* Combo Dialog */}
      <Dialog open={comboDialog} onClose={handleCloseComboDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCombo ? 'Editar Combo' : 'Nuevo Combo'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Basic Info */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Nombre del Combo"
                value={comboForm.name}
                onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Precio del Combo"
                type="number"
                value={comboForm.price}
                onChange={(e) => setComboForm({ ...comboForm, price: Number(e.target.value) })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descripción"
                multiline
                rows={2}
                value={comboForm.description}
                onChange={(e) => setComboForm({ ...comboForm, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={comboForm.category_id || ''}
                  onChange={(e) => setComboForm({ ...comboForm, category_id: Number(e.target.value) || undefined })}
                  label="Categoría"
                >
                  <MenuItem value="">Sin categoría</MenuItem>
                  {categories.map(category => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de IVA</InputLabel>
                <Select
                  value={comboForm.tax_type_id || 1}
                  onChange={(e) => setComboForm({ ...comboForm, tax_type_id: Number(e.target.value) })}
                  label="Tipo de IVA"
                >
                  <MenuItem value={1}>IVA 19%</MenuItem>
                  <MenuItem value={5}>IVA 0% (Exento)</MenuItem>
                  <MenuItem value={6}>IVA 5%</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={comboForm.is_active}
                    onChange={(e) => setComboForm({ ...comboForm, is_active: e.target.checked })}
                  />
                }
                label="Activo"
              />
            </Grid>

            {/* Image */}
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
                        maxHeight: 200,
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
                        '&:hover': { bgcolor: 'error.dark' },
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
              </Box>
            </Grid>

            {/* Products Section */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Productos del Combo
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Agrega los productos que formarán parte de este combo
              </Typography>

              {/* Current products in combo */}
              {(comboForm.items?.length || 0) > 0 && (
                <Paper variant="outlined" sx={{ mt: 2, mb: 2 }}>
                  <List dense>
                    {comboForm.items?.map((item, index) => {
                      const product = products.find(p => p.id === item.product_id) || item.product;
                      return (
                        <ListItem key={item.product_id || index}>
                          <ListItemText
                            primary={product?.name || 'Producto desconocido'}
                            secondary={`$${(product?.price || 0).toLocaleString('es-CO')} c/u`}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateProductQuantity(
                                item.product_id,
                                parseInt(e.target.value) || 1
                              )}
                              sx={{ width: 70 }}
                              inputProps={{ min: 1 }}
                            />
                          </Box>
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => handleRemoveProductFromCombo(item.product_id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      );
                    })}
                  </List>
                  <Divider />
                  <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">
                      Valor total de productos:
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      ${getComboProductsTotal().toLocaleString('es-CO')}
                    </Typography>
                  </Box>
                  {comboForm.price && comboForm.price > 0 && (
                    <Box sx={{ px: 2, pb: 2, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="success.main">
                        Ahorro para el cliente:
                      </Typography>
                      <Typography variant="body1" fontWeight="bold" color="success.main">
                        ${(getComboProductsTotal() - comboForm.price).toLocaleString('es-CO')}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              )}

              {/* Add new product to combo */}
              <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel size="small">Producto</InputLabel>
                  <Select
                    size="small"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(Number(e.target.value))}
                    label="Producto"
                  >
                    <MenuItem value={0}>Seleccionar...</MenuItem>
                    {products
                      .filter(p => p.active)
                      .filter(p => !comboForm.items?.find(item => item.product_id === p.id))
                      .map(product => (
                        <MenuItem key={product.id} value={product.id}>
                          {product.name} (${product.price.toLocaleString('es-CO')})
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label="Cantidad"
                  value={productQuantity}
                  onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                  sx={{ width: 100 }}
                  inputProps={{ min: 1 }}
                />
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddProductToCombo}
                  disabled={selectedProductId === 0}
                >
                  Agregar
                </Button>
              </Box>

              {products.filter(p => p.active).length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  No hay productos disponibles. Crea productos primero.
                </Typography>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseComboDialog}>Cancelar</Button>
          <Button onClick={handleSaveCombo} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => handleOpenComboDialog()}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default Combos;
