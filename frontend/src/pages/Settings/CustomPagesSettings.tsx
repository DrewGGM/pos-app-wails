import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { wailsCustomPageService } from '../../services/wailsCustomPageService';
import { wailsProductService } from '../../services/wailsProductService';

const CustomPagesSettings: React.FC = () => {
  const [pages, setPages] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [productsDialogOpen, setProductsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<any | null>(null);
  const [selectedPage, setSelectedPage] = useState<any | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [orderedProducts, setOrderedProducts] = useState<any[]>([]);
  const [pageForm, setPageForm] = useState({
    name: '',
    description: '',
    icon: 'grid_view',
    color: '#3B82F6',
    display_order: 0,
  });

  useEffect(() => {
    loadPages();
    loadProducts();
  }, []);

  const loadPages = async () => {
    try {
      const data = await wailsCustomPageService.getAllPages();
      setPages(data);
    } catch (error) {
      toast.error('Error al cargar páginas');
    }
  };

  const loadProducts = async () => {
    try {
      const data = await wailsProductService.getProducts();
      setProducts(data);
    } catch (error) {
      toast.error('Error al cargar productos');
    }
  };

  const handleOpenPageDialog = (page?: any) => {
    if (page) {
      setEditingPage(page);
      setPageForm({
        name: page.name,
        description: page.description || '',
        icon: page.icon || 'grid_view',
        color: page.color || '#3B82F6',
        display_order: page.display_order || 0,
      });
    } else {
      setEditingPage(null);
      setPageForm({
        name: '',
        description: '',
        icon: 'grid_view',
        color: '#3B82F6',
        display_order: pages.length,
      });
    }
    setPageDialogOpen(true);
  };

  const handleSavePage = async () => {
    if (!pageForm.name) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      if (editingPage) {
        await wailsCustomPageService.updatePage({
          ...editingPage,
          ...pageForm,
        });
        toast.success('Página actualizada');
      } else {
        await wailsCustomPageService.createPage({
          ...pageForm,
          is_active: true,
        });
        toast.success('Página creada');
      }
      setPageDialogOpen(false);
      loadPages();
    } catch (error) {
      toast.error('Error al guardar página');
    }
  };

  const handleDeletePage = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar esta página?')) return;

    try {
      await wailsCustomPageService.deletePage(id);
      toast.success('Página eliminada');
      loadPages();
    } catch (error) {
      toast.error('Error al eliminar página');
    }
  };

  const handleOpenProductsDialog = async (page: any) => {
    setSelectedPage(page);
    try {
      const pageProducts = await wailsCustomPageService.getPageWithProducts(page.id);
      const ids = pageProducts.map((p: any) => p.id);
      setSelectedProductIds(ids);
      setOrderedProducts(pageProducts); // Store ordered products
      setProductsDialogOpen(true);
    } catch (error) {
      toast.error('Error al cargar productos de la página');
    }
  };

  const handleToggleProduct = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (selectedProductIds.includes(productId)) {
      setSelectedProductIds(selectedProductIds.filter(id => id !== productId));
      setOrderedProducts(orderedProducts.filter(p => p.id !== productId));
    } else {
      setSelectedProductIds([...selectedProductIds, productId]);
      setOrderedProducts([...orderedProducts, product]);
    }
  };

  const handleMoveProductUp = (index: number) => {
    if (index === 0) return;
    const newOrdered = [...orderedProducts];
    [newOrdered[index - 1], newOrdered[index]] = [newOrdered[index], newOrdered[index - 1]];
    setOrderedProducts(newOrdered);
  };

  const handleMoveProductDown = (index: number) => {
    if (index === orderedProducts.length - 1) return;
    const newOrdered = [...orderedProducts];
    [newOrdered[index], newOrdered[index + 1]] = [newOrdered[index + 1], newOrdered[index]];
    setOrderedProducts(newOrdered);
  };

  const handleSaveProducts = async () => {
    if (!selectedPage) return;

    try {
      // Save in the order they appear in orderedProducts
      const productIds = orderedProducts.map(p => p.id);
      await wailsCustomPageService.setPageProducts(selectedPage.id, productIds);
      toast.success('Productos guardados');
      setProductsDialogOpen(false);
    } catch (error) {
      toast.error('Error al guardar productos');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5">Páginas Personalizadas del POS</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenPageDialog()}
        >
          Nueva Página
        </Button>
      </Box>

      <Grid container spacing={2}>
        {pages.map((page) => (
          <Grid item xs={12} sm={6} md={4} key={page.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1,
                      backgroundColor: page.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      mr: 2,
                    }}
                  >
                    <span className="material-icons">{page.icon}</span>
                  </Box>
                  <Typography variant="h6">{page.name}</Typography>
                </Box>
                {page.description && (
                  <Typography variant="body2" color="text.secondary">
                    {page.description}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  onClick={() => handleOpenProductsDialog(page)}
                >
                  Productos
                </Button>
                <IconButton size="small" onClick={() => handleOpenPageDialog(page)}>
                  <EditIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleDeletePage(page.id)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Page Dialog */}
      <Dialog open={pageDialogOpen} onClose={() => setPageDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingPage ? 'Editar Página' : 'Nueva Página'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nombre"
              value={pageForm.name}
              onChange={(e) => setPageForm({ ...pageForm, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Descripción"
              value={pageForm.description}
              onChange={(e) => setPageForm({ ...pageForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              label="Color"
              type="color"
              value={pageForm.color}
              onChange={(e) => setPageForm({ ...pageForm, color: e.target.value })}
              fullWidth
            />
            <TextField
              label="Orden de Visualización"
              type="number"
              value={pageForm.display_order}
              onChange={(e) => setPageForm({ ...pageForm, display_order: Number(e.target.value) })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPageDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSavePage} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Products Dialog */}
      <Dialog
        open={productsDialogOpen}
        onClose={() => setProductsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Seleccionar y Ordenar Productos para: {selectedPage?.name}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {/* Available Products */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Productos Disponibles
              </Typography>
              <Box sx={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #ddd', borderRadius: 1, p: 1 }}>
                <List dense>
                  {products
                    .filter(p => !selectedProductIds.includes(p.id))
                    .map((product) => (
                      <ListItem key={product.id}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={false}
                              onChange={() => handleToggleProduct(product.id)}
                            />
                          }
                          label={`${product.name} - $${product.price.toLocaleString('es-CO')}`}
                        />
                      </ListItem>
                    ))}
                </List>
              </Box>
            </Grid>

            {/* Selected Products (Ordered) */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Productos Seleccionados (Orden de visualización)
              </Typography>
              <Box sx={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #ddd', borderRadius: 1, p: 1 }}>
                <List dense>
                  {orderedProducts.map((product, index) => (
                    <ListItem
                      key={product.id}
                      secondaryAction={
                        <Box>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleMoveProductUp(index)}
                            disabled={index === 0}
                          >
                            <ArrowUpwardIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleMoveProductDown(index)}
                            disabled={index === orderedProducts.length - 1}
                          >
                            <ArrowDownwardIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleToggleProduct(product.id)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemText
                        primary={`${index + 1}. ${product.name}`}
                        secondary={`$${product.price.toLocaleString('es-CO')}`}
                      />
                    </ListItem>
                  ))}
                  {orderedProducts.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                      No hay productos seleccionados
                    </Typography>
                  )}
                </List>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductsDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSaveProducts} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomPagesSettings;
