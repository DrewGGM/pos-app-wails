import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  IconButton,
  Chip,
  Divider,
  Tab,
  Tabs,
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Drawer,
  Alert,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Receipt as ReceiptIcon,
  Person as PersonIcon,
  TableChart as TableIcon,
  Restaurant as RestaurantIcon,
  LocalOffer as DiscountIcon,
  Print as PrintIcon,
  Payment as PaymentIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Fastfood as FastfoodIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuth,useWebSocket } from '../../hooks';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { wailsProductService } from '../../services/wailsProductService';
import { wailsOrderService, CreateOrderData } from '../../services/wailsOrderService';
import { wailsSalesService } from '../../services/wailsSalesService';
import { GetRestaurantConfig } from '../../../wailsjs/go/services/ConfigService';
import { Category, Product, Order, OrderItem, Table, Customer, PaymentMethod } from '../../types/models';
import { posColors } from '../../theme';

import PaymentDialog from '../../components/pos/PaymentDialog';
import CustomerDialog from '../../components/pos/CustomerDialog';
import ModifierDialog from '../../components/pos/ModifierDialog';
import PriceInputDialog from '../../components/pos/PriceInputDialog';
import TableSelector from '../../components/pos/TableSelector';
import QuickPad from '../../components/pos/QuickPad';
import OrderList from '../../components/pos/OrderList';

const POS: React.FC = () => {
  // Context hooks
  const { user, cashRegisterId } = useAuth();
  const { sendMessage, subscribe } = useWebSocket();
  const { isOnline } = useOfflineSync();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // State
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Dialogs
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [priceInputDialogOpen, setPriceInputDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedProductForModifier, setSelectedProductForModifier] = useState<Product | null>(null);
  const [selectedProductForPrice, setSelectedProductForPrice] = useState<Product | null>(null);
  const [selectedItemForModifierEdit, setSelectedItemForModifierEdit] = useState<OrderItem | null>(null);
  const [selectedItemForNotes, setSelectedItemForNotes] = useState<OrderItem | null>(null);
  const [itemNotes, setItemNotes] = useState('');

  // Electronic invoice flag per sale
  const [needsElectronicInvoice, setNeedsElectronicInvoice] = useState(false);

  // Company fiscal liability (for IVA calculation)
  const [companyLiabilityId, setCompanyLiabilityId] = useState<number | null>(null);

  // Loading states
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Load initial data
  useEffect(() => {
    // Wait for Wails bindings to be ready
    const timer = setTimeout(() => {
      loadCategories();
      loadProducts();
      loadPaymentMethods();
      loadCompanyConfig();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Subscribe to WebSocket events
  useEffect(() => {
    const unsubscribeOrderReady = subscribe('order_ready', (data) => {
      toast.success(`Orden ${data.order_number} está lista!`, {
        position: 'top-center',
        autoClose: false,
      });
    });

    return () => {
      unsubscribeOrderReady();
    };
  }, [subscribe]);

  // Load order from navigation state (when continuing or editing from Orders page)
  useEffect(() => {
    const state = location.state as { continueOrder?: Order; editOrder?: Order };
    const order = state?.continueOrder || state?.editOrder;

    if (order) {
      const isEditing = !!state?.editOrder;
      setCurrentOrder(order);
      setOrderItems(order.items || []);
      setSelectedTable(order.table || null);
      setSelectedCustomer(order.customer || null);
      toast.info(`Orden ${order.order_number} ${isEditing ? 'lista para editar' : 'cargada'}`);

      // Clear the state to avoid reloading on future renders
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Load order/table from query parameters (when coming from Tables page)
  useEffect(() => {
    const orderId = searchParams.get('orderId');
    const tableId = searchParams.get('tableId');

    const loadFromParams = async () => {
      try {
        if (orderId) {
          // Load specific order
          const order = await wailsOrderService.getOrder(Number(orderId));
          if (order) {
            setCurrentOrder(order);
            setOrderItems(order.items || []);
            setSelectedTable(order.table || null);
            setSelectedCustomer(order.customer || null);
            toast.info(`Orden ${order.order_number} cargada`);
          }
        } else if (tableId) {
          // Load table and check for existing order
          const tables = await wailsOrderService.getTables();
          const table = tables.find(t => t.id === Number(tableId));

          if (table) {
            setSelectedTable(table);

            // Check if table has an active order
            const existingOrder = await wailsOrderService.getOrderByTable(Number(tableId));
            if (existingOrder) {
              setCurrentOrder(existingOrder);
              setOrderItems(existingOrder.items || []);
              setSelectedCustomer(existingOrder.customer || null);
              toast.info(`Orden de mesa ${table.number} cargada`);
            } else {
              toast.info(`Nueva orden para mesa ${table.number}`);
            }
          }
        }
      } catch (error) {
        console.error('Error loading from params:', error);
        toast.error('Error al cargar datos');
      }
    };

    if (orderId || tableId) {
      loadFromParams();
    }
  }, [searchParams]);

  const loadCategories = async () => {
    try {
      const data = await wailsProductService.getCategories();
      setCategories(data);
      // No establecer categoría por defecto - dejar en null (Todos)
    } catch (error) {
      toast.error('Error al cargar categorías');
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

  const loadPaymentMethods = async () => {
    try {
      const data = await wailsSalesService.getPaymentMethods();
      setPaymentMethods(data);
    } catch (error) {
      toast.error('Error al cargar métodos de pago');
    }
  };

  const loadCompanyConfig = async () => {
    try {
      const config = await GetRestaurantConfig();
      if (config) {
        setCompanyLiabilityId(config.type_liability_id || null);
      }
    } catch (error) {
      console.error('Error loading company config:', error);
      // Don't show error toast to user, just log it
    }
  };

  // Helper function to check if two order items are identical
  const areItemsIdentical = (item1: OrderItem, item2: OrderItem): boolean => {
    // Check if same product
    if (item1.product_id !== item2.product_id) return false;

    // Check if same notes
    if ((item1.notes || '') !== (item2.notes || '')) return false;

    // Check if same modifiers
    const mods1 = item1.modifiers || [];
    const mods2 = item2.modifiers || [];

    if (mods1.length !== mods2.length) return false;

    // Sort and compare modifier IDs
    const modIds1 = mods1.map(m => m.modifier_id).sort();
    const modIds2 = mods2.map(m => m.modifier_id).sort();

    return modIds1.every((id, index) => id === modIds2[index]);
  };

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesCategory = !selectedCategory || product.category_id === selectedCategory;
      const matchesSearch = !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Add product to order
  const addProductToOrder = useCallback((product: Product) => {
    console.log('addProductToOrder called with product:', product);
    console.log('Product has_variable_price:', product.has_variable_price);
    console.log('Product modifiers:', product.modifiers);

    // Check if cash register is open
    if (!cashRegisterId) {
      toast.error('Debe abrir la caja antes de realizar ventas');
      return;
    }

    // Warning for low stock (but allow to continue)
    if (product.stock <= 0) {
      toast.warning('Producto sin stock - Se agregará con stock negativo', {
        position: 'bottom-center',
        autoClose: 2000,
      });
    }

    // Check if product has variable price - show price input dialog first
    if (product.has_variable_price === true) {
      console.log('Opening price input dialog for variable price product');
      setSelectedProductForPrice(product);
      setPriceInputDialogOpen(true);
      return;
    }

    // Check if product has modifiers
    if (product.modifiers && product.modifiers.length > 0) {
      console.log('Opening modifier dialog, modifiers:', product.modifiers);
      setSelectedProductForModifier(product);
      setModifierDialogOpen(true);
      return;
    }

    console.log('Adding product directly to cart (no modifiers, no variable price)');

    // Create new item
    const newItem: OrderItem = {
      id: Date.now(), // Temporary ID for frontend tracking
      product_id: product.id!,
      product: product,
      quantity: 1,
      unit_price: product.price,
      subtotal: product.price,
      notes: '',
      modifiers: [],
    };

    // Only stack identical items (same product, same modifiers, same notes)
    const existingItem = orderItems.find(item => areItemsIdentical(item, newItem));

    if (existingItem) {
      updateItemQuantity(existingItem.id!, existingItem.quantity + 1);
    } else {
      setOrderItems([...orderItems, newItem]);
    }

    toast.success(`${product.name} añadido`, {
      position: 'bottom-center',
      autoClose: 1000,
    });
  }, [cashRegisterId, orderItems]);

  // Update item quantity
  const updateItemQuantity = useCallback((itemId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }

    setOrderItems(items => 
      items.map(item => {
        // Compare with both real ID and temporary ID
        const currentItemId = item.id ?? Date.now();
        return currentItemId === itemId 
          ? { ...item, quantity: newQuantity, subtotal: (item.unit_price || 0) * newQuantity }
          : item
      })
    );
  }, []);

  // Remove item from order
  const removeItem = useCallback((itemId: number) => {
    setOrderItems(items => items.filter(item => {
      const currentItemId = item.id ?? Date.now();
      return currentItemId !== itemId;
    }));
  }, []);

  // Calculate order totals
  const orderTotals = useMemo(() => {
    const subtotal = orderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    // Only apply IVA if company is responsible for IVA
    // ID 117 = "No responsable" (R-99-PN) - Does NOT charge IVA
    // Other IDs (7, 9, 14, 112) are responsible for IVA
    const isIVAResponsible = companyLiabilityId !== null && companyLiabilityId !== 117;
    // Tax is calculated by the backend based on restaurant configuration
    // Frontend shows 0 for preview, actual tax will be calculated in backend
    const tax = 0; // Backend will calculate the correct tax based on configuration
    const total = subtotal; // Total will be recalculated by backend with correct tax

    return {
      subtotal,
      tax,
      total,
      itemCount: orderItems.reduce((sum, item) => sum + item.quantity, 0),
      isIVAResponsible, // Include for UI display
    };
  }, [orderItems, companyLiabilityId]);

  // Clear order (delete if exists and free table)
  const clearOrder = useCallback(async () => {
    try {
      // If there's a saved order, delete it from database
      if (currentOrder && currentOrder.id) {
        await wailsOrderService.deleteOrder(currentOrder.id);

        // Free the table if it was occupied
        if (selectedTable && selectedTable.id) {
          await wailsOrderService.updateTableStatus(selectedTable.id, 'available');
        }

        toast.success('Pedido eliminado y mesa liberada');
      } else {
        toast.info('Orden cancelada');
      }
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error('Error al eliminar pedido: ' + (error.message || 'Error desconocido'));
    }

    // Clear local state
    setOrderItems([]);
    setCurrentOrder(null);
    setSelectedTable(null);
    setSelectedCustomer(null);
    setNeedsElectronicInvoice(false);
  }, [currentOrder, selectedTable]);

  // Save order without payment (draft/pending)
  const saveOrder = useCallback(async () => {
    if (orderItems.length === 0) {
      toast.error('Agrega productos a la orden');
      return;
    }

    setIsSavingOrder(true);
    try {
      const orderData: CreateOrderData = {
        type: selectedTable ? 'dine_in' : 'takeout',
        table_id: selectedTable?.id,
        customer_id: selectedCustomer?.id,
        employee_id: user?.id,
        items: orderItems,
        notes: '',
        source: 'pos',
      };

      let resultOrder: Order;

      // Check if we're updating an existing order or creating a new one
      if (currentOrder && currentOrder.id) {
        // Update existing order
        resultOrder = await wailsOrderService.updateOrder(currentOrder.id, orderData);
        toast.success('Orden actualizada exitosamente');
      } else {
        // Create new order
        resultOrder = await wailsOrderService.createOrder(orderData);
        toast.success('Orden guardada exitosamente');
      }

      // Send to kitchen if dine-in
      if (selectedTable) {
        sendMessage({
          type: 'kitchen_order',
          timestamp: new Date().toISOString(),
          data: {
            order: resultOrder,
            table: selectedTable,
          },
        });

        // Update table status to occupied
        if (selectedTable.status === 'available') {
          await wailsOrderService.updateTableStatus(selectedTable.id!, 'occupied');
        }
      }

      // Clear local state only (don't delete the order from DB)
      setOrderItems([]);
      setCurrentOrder(null);
      setSelectedTable(null);
      setSelectedCustomer(null);
      setNeedsElectronicInvoice(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la orden');
    } finally {
      setIsSavingOrder(false);
    }
  }, [selectedTable, selectedCustomer, orderItems, user, sendMessage, currentOrder]);

  // Process payment
  const processPayment = useCallback(async (paymentData: any) => {
    if (!cashRegisterId) {
      toast.error('No hay caja abierta');
      return;
    }

    setIsProcessingPayment(true);
    try {
      let orderToProcess: Order;

      // Check if we're continuing an existing order or creating a new one
      if (currentOrder && currentOrder.id) {
        // Use existing order
        orderToProcess = currentOrder;
      } else {
        // Create new order
        const orderData: CreateOrderData = {
          type: selectedTable ? 'dine_in' : 'takeout',
          table_id: selectedTable?.id,
          customer_id: selectedCustomer?.id,
          employee_id: user?.id,
          items: orderItems,
          notes: '',
          source: 'pos',
        };

        orderToProcess = await wailsOrderService.createOrder(orderData);
      }

      // Process sale
      const sale = await wailsSalesService.processSale({
        order_id: orderToProcess.id!,
        customer_id: selectedCustomer?.id,
        payment_methods: paymentData.payment_data || [], // Extract payment_data array
        discount: 0,
        notes: '',
        employee_id: user?.id!,
        cash_register_id: cashRegisterId!,
        needs_electronic_invoice: paymentData.needsInvoice || false,
        send_email_to_customer: paymentData.sendByEmail || false,
        print_receipt: paymentData.printReceipt !== undefined ? paymentData.printReceipt : true, // Checkbox has priority over config
      });

      // Update table status to available after payment
      if (selectedTable) {
        try {
          await wailsOrderService.updateTableStatus(selectedTable.id!, 'available');
        } catch (error) {
          console.error('Error updating table status:', error);
          // Don't fail the entire payment if table update fails
        }
      }

      toast.success('Venta procesada exitosamente');

      // Clear order
      clearOrder();
      setPaymentDialogOpen(false);

      // Note: Receipt printing is now controlled by the printReceipt checkbox
      // The checkbox has priority over system configuration

    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la venta');
    } finally {
      setIsProcessingPayment(false);
    }
  }, [cashRegisterId, selectedTable, selectedCustomer, orderItems, orderTotals, user, clearOrder, currentOrder]);

  // Handle edit notes for an order item
  const handleEditNotes = useCallback((item: OrderItem) => {
    setSelectedItemForNotes(item);
    setItemNotes(item.notes || '');
    setNotesDialogOpen(true);
  }, []);

  // Save notes for the selected item
  const handleSaveNotes = useCallback(() => {
    if (selectedItemForNotes) {
      setOrderItems(items =>
        items.map(item => {
          const currentItemId = item.id ?? Date.now();
          const selectedItemId = selectedItemForNotes.id ?? Date.now();
          return currentItemId === selectedItemId
            ? { ...item, notes: itemNotes }
            : item;
        })
      );
    }
    setNotesDialogOpen(false);
    setSelectedItemForNotes(null);
    setItemNotes('');
  }, [selectedItemForNotes, itemNotes]);

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Left Panel - Categories and Products */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
        {/* Search Bar */}
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Buscar productos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {/* Categories */}
        <Tabs
          value={selectedCategory ?? 'all'}
          onChange={(_, value) => setSelectedCategory(value === 'all' ? null : value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab
            value="all"
            label="Todos"
            icon={<FastfoodIcon />}
          />
          {categories.map((category) => (
            <Tab
              key={category.id}
              value={category.id}
              label={category.name}
              icon={<FastfoodIcon />}
              sx={{
                backgroundColor: selectedCategory === category.id ? category.color : 'transparent',
                color: selectedCategory === category.id ? '#fff' : 'inherit',
                '&:hover': {
                  backgroundColor: category.color,
                  opacity: 0.8,
                  color: '#fff',
                },
              }}
            />
          ))}
        </Tabs>

        {/* Products Grid */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Grid container spacing={2}>
            {filteredProducts.map((product) => (
              <Grid item xs={6} sm={4} md={3} key={product.id}>
                <Card
                  sx={{
                    height: '100%',
                    border: product.stock <= 0 ? '3px solid #d32f2f' : 'none',
                    boxShadow: product.stock <= 0 ? '0 0 10px rgba(211, 47, 47, 0.5)' : undefined,
                  }}
                >
                  <CardActionArea
                    onClick={() => addProductToOrder(product)}
                  >
                    {product.image && (
                      <CardMedia
                        component="img"
                        height="120"
                        image={product.image}
                        alt={product.name}
                      />
                    )}
                    <CardContent sx={{ p: 1 }}>
                      <Typography variant="body2" noWrap>
                        {product.name}
                      </Typography>
                      <Typography variant="h6" color="primary">
                        ${product.price.toLocaleString('es-CO')}
                      </Typography>
                      {product.stock <= 5 && (
                        <Chip
                          size="small"
                          label={`Stock: ${product.stock}`}
                          color={product.stock <= 0 ? 'error' : 'warning'}
                        />
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* Right Panel - Order */}
      <Paper sx={{ width: 400, display: 'flex', flexDirection: 'column' }} elevation={3}>
        {/* Order Header */}
        <Box sx={{ p: 2, backgroundColor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Orden Actual</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {selectedTable && (
              <Chip
                icon={<TableIcon />}
                label={`Mesa ${selectedTable.number}`}
                color="secondary"
                size="small"
              />
            )}
            {selectedCustomer && (
              <Chip
                icon={<PersonIcon />}
                label={selectedCustomer.name}
                color="secondary"
                size="small"
              />
            )}
            {!isOnline && (
              <Chip
                label="Offline"
                color="warning"
                size="small"
              />
            )}
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ p: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            startIcon={<TableIcon />}
            onClick={() => setTableDialogOpen(true)}
            variant={selectedTable ? 'contained' : 'outlined'}
            size="small"
          >
            Mesa
          </Button>
          <Button
            startIcon={<PersonIcon />}
            onClick={() => setCustomerDialogOpen(true)}
            variant={selectedCustomer ? 'contained' : 'outlined'}
            size="small"
            color={selectedCustomer ? 'primary' : 'inherit'}
          >
            {selectedCustomer ? selectedCustomer.name : 'Cliente'}
          </Button>
          <Button
            startIcon={<DiscountIcon />}
            size="small"
            variant="outlined"
          >
            Descuento
          </Button>
        </Box>

        <Divider />

        {/* Order Items */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {orderItems.length === 0 ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary'
            }}>
              <RestaurantIcon sx={{ fontSize: 64, mb: 2 }} />
              <Typography>No hay productos en la orden</Typography>
            </Box>
          ) : (
            <OrderList
              items={orderItems}
              onUpdateQuantity={updateItemQuantity}
              onRemoveItem={removeItem}
              onEditNotes={handleEditNotes}
              onEditItem={(item) => {
                console.log('onEditItem called with item:', item);
                const product = products.find(p => p.id === item.product_id);
                console.log('Found product for editing:', product);
                if (product) {
                  setSelectedItemForModifierEdit(item);
                  setSelectedProductForModifier(product);
                  setModifierDialogOpen(true);
                }
              }}
            />
          )}
        </Box>

        <Divider />

        {/* Order Totals */}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Subtotal:</Typography>
            <Typography>${orderTotals.subtotal.toLocaleString('es-CO')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>
              {orderTotals.isIVAResponsible ? 'IVA (19%):' : 'IVA (N/A):'}
            </Typography>
            <Typography>${orderTotals.tax.toLocaleString('es-CO')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Total:</Typography>
            <Typography variant="h6" color="primary">
              ${orderTotals.total.toLocaleString('es-CO')}
            </Typography>
          </Box>

          {/* Electronic Invoice Option */}
          <FormControlLabel
            control={
              <Checkbox
                checked={needsElectronicInvoice}
                onChange={(e) => setNeedsElectronicInvoice(e.target.checked)}
                color="primary"
              />
            }
            label="Factura Electrónica"
            sx={{ mb: 2 }}
          />

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Row 1: Management Actions */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                color="error"
                startIcon={<ClearIcon />}
                onClick={clearOrder}
                disabled={orderItems.length === 0}
              >
                Cancelar
              </Button>
              <Button
                fullWidth
                variant="outlined"
                color="primary"
                startIcon={isSavingOrder ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={saveOrder}
                disabled={orderItems.length === 0 || isSavingOrder || isProcessingPayment}
              >
                {isSavingOrder ? 'Guardando...' : 'Guardar'}
              </Button>
            </Box>

            {/* Row 2: Payment Action (Primary) */}
            <Button
              fullWidth
              variant="contained"
              color="success"
              size="large"
              startIcon={isProcessingPayment ? <CircularProgress size={20} color="inherit" /> : <PaymentIcon />}
              onClick={() => setPaymentDialogOpen(true)}
              disabled={orderItems.length === 0 || !cashRegisterId || isSavingOrder || isProcessingPayment}
            >
              {isProcessingPayment ? 'Procesando...' : 'Pagar'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Dialogs */}
      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        total={orderTotals.total}
        paymentMethods={paymentMethods}
        onConfirm={processPayment}
        customer={selectedCustomer}
        needsElectronicInvoice={needsElectronicInvoice}
      />

      <CustomerDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onSelectCustomer={setSelectedCustomer}
        selectedCustomer={selectedCustomer}
      />

      {selectedProductForModifier && (
        <ModifierDialog
          open={modifierDialogOpen}
          onClose={() => {
            setModifierDialogOpen(false);
            setSelectedProductForModifier(null);
            setSelectedItemForModifierEdit(null);
          }}
          product={selectedProductForModifier}
          initialModifiers={selectedItemForModifierEdit?.modifiers?.map(m => m.modifier!).filter(Boolean) || []}
          onConfirm={(modifiers) => {
            const totalPrice = selectedProductForModifier.price +
              modifiers.reduce((sum, mod) => sum + mod.price_change, 0);

            if (selectedItemForModifierEdit) {
              // Editing existing item - update it
              console.log('Updating existing item with new modifiers');
              const updatedItem: OrderItem = {
                ...selectedItemForModifierEdit,
                unit_price: totalPrice,
                subtotal: totalPrice * selectedItemForModifierEdit.quantity,
                modifiers: modifiers.map(mod => ({
                  order_item_id: selectedItemForModifierEdit.id || 0,
                  modifier_id: mod.id!,
                  modifier: mod,
                  price_change: mod.price_change,
                })),
              };

              setOrderItems(orderItems.map(item =>
                item.id === selectedItemForModifierEdit.id ? updatedItem : item
              ));
            } else {
              // Adding new product with modifiers
              console.log('Adding new product with modifiers');
              const newItem: OrderItem = {
                id: Date.now(),
                product_id: selectedProductForModifier.id!,
                product: selectedProductForModifier,
                quantity: 1,
                unit_price: totalPrice,
                subtotal: totalPrice,
                modifiers: modifiers.map(mod => ({
                  order_item_id: 0, // Will be set when order is created
                  modifier_id: mod.id!,
                  modifier: mod,
                  price_change: mod.price_change,
                })),
                notes: '',
              };

              setOrderItems([...orderItems, newItem]);
            }

            setModifierDialogOpen(false);
            setSelectedProductForModifier(null);
            setSelectedItemForModifierEdit(null);
          }}
        />
      )}

      {selectedProductForPrice && (
        <PriceInputDialog
          open={priceInputDialogOpen}
          onClose={() => {
            setPriceInputDialogOpen(false);
            setSelectedProductForPrice(null);
          }}
          productName={selectedProductForPrice.name}
          suggestedPrice={selectedProductForPrice.price}
          onConfirm={(customPrice) => {
            // Create item with custom price
            const newItem: OrderItem = {
              id: Date.now(),
              product_id: selectedProductForPrice.id!,
              product: selectedProductForPrice,
              quantity: 1,
              unit_price: customPrice,
              subtotal: customPrice,
              notes: '',
              modifiers: [],
            };

            setOrderItems([...orderItems, newItem]);
            setPriceInputDialogOpen(false);
            setSelectedProductForPrice(null);

            toast.success(`${selectedProductForPrice.name} añadido con precio $${customPrice.toLocaleString('es-CO')}`, {
              position: 'bottom-center',
              autoClose: 1500,
            });
          }}
        />
      )}

      <TableSelector
        open={tableDialogOpen}
        onClose={() => setTableDialogOpen(false)}
        onSelectTable={setSelectedTable}
        selectedTable={selectedTable}
        onlyAvailable={!!(currentOrder && currentOrder.id && currentOrder.table_id)}
      />

      {/* Notes Dialog */}
      <Dialog
        open={notesDialogOpen}
        onClose={() => {
          setNotesDialogOpen(false);
          setSelectedItemForNotes(null);
          setItemNotes('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Agregar Comentario
        </DialogTitle>
        <DialogContent>
          {selectedItemForNotes && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {selectedItemForNotes.product?.name}
              </Typography>
            </Box>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Comentario"
            placeholder="Ej: Sin cebolla, sin tomate, etc."
            value={itemNotes}
            onChange={(e) => setItemNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setNotesDialogOpen(false);
              setSelectedItemForNotes(null);
              setItemNotes('');
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveNotes}
            variant="contained"
            color="primary"
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default POS;