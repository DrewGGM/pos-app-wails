import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  DeliveryDining as DeliveryIcon,
  SplitscreenOutlined as SplitIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuth,useWebSocket } from '../../hooks';
import { wailsProductService } from '../../services/wailsProductService';
import { wailsCustomPageService } from '../../services/wailsCustomPageService';
import { wailsOrderService, CreateOrderData } from '../../services/wailsOrderService';
import { wailsSalesService } from '../../services/wailsSalesService';
import { wailsConfigService } from '../../services/wailsConfigService';
import { GetRestaurantConfig } from '../../../wailsjs/go/services/ConfigService';
import { GetActiveOrderTypes } from '../../../wailsjs/go/services/OrderTypeService';
import { Category, Product, Order, OrderItem, Table, Customer, PaymentMethod } from '../../types/models';
import { models } from '../../../wailsjs/go/models';
import { posColors } from '../../theme';

import PaymentDialog from '../../components/pos/PaymentDialog';
import CustomerDialog from '../../components/pos/CustomerDialog';
import ModifierDialog from '../../components/pos/ModifierDialog';
import PriceInputDialog from '../../components/pos/PriceInputDialog';
import TableSelector from '../../components/pos/TableSelector';
import QuickPad from '../../components/pos/QuickPad';
import OrderList from '../../components/pos/OrderList';
import DeliveryInfoDialog, { DeliveryInfo } from '../../components/pos/DeliveryInfoDialog';
import SplitBillDialog, { BillSplit } from '../../components/pos/SplitBillDialog';

const POS: React.FC = () => {
  // Context hooks
  const { user, cashRegisterId } = useAuth();
  const { sendMessage, subscribe } = useWebSocket();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // State
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(() => {
    const saved = localStorage.getItem('pos_selected_category');
    return saved ? Number(saved) : null;
  });
  const [customPages, setCustomPages] = useState<any[]>([]);
  const [selectedCustomPage, setSelectedCustomPage] = useState<number | null>(() => {
    const saved = localStorage.getItem('pos_selected_custom_page');
    return saved ? Number(saved) : null;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orderTypes, setOrderTypes] = useState<models.OrderType[]>([]);
  const [selectedOrderType, setSelectedOrderType] = useState<models.OrderType | null>(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true); // Default to true

  // Refs
  const loadedOrderIdRef = useRef<number | null>(null);

  // Dialogs
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [priceInputDialogOpen, setPriceInputDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [orderTypeDialogOpen, setOrderTypeDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [splitBillDialogOpen, setSplitBillDialogOpen] = useState(false);
  const [billSplits, setBillSplits] = useState<BillSplit[]>([]);
  const [activeSplitIndex, setActiveSplitIndex] = useState(0);
  const [selectedProductForModifier, setSelectedProductForModifier] = useState<Product | null>(null);
  const [selectedProductForPrice, setSelectedProductForPrice] = useState<Product | null>(null);
  const [selectedItemForModifierEdit, setSelectedItemForModifierEdit] = useState<OrderItem | null>(null);
  const [selectedItemForNotes, setSelectedItemForNotes] = useState<OrderItem | null>(null);
  const [itemNotes, setItemNotes] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({ customerName: '', address: '', phone: '' });

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
      // Don't load products here - let the dedicated useEffect handle it based on selection
      loadPaymentMethods();
      loadOrderTypes();
      loadCompanyConfig();
      loadCustomPages();
      loadPrinterSettings();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Persist selectedCategory in localStorage
  useEffect(() => {
    if (selectedCategory !== null) {
      localStorage.setItem('pos_selected_category', String(selectedCategory));
      localStorage.removeItem('pos_selected_custom_page');
    } else {
      localStorage.removeItem('pos_selected_category');
    }
  }, [selectedCategory]);

  // Persist selectedCustomPage in localStorage
  useEffect(() => {
    if (selectedCustomPage !== null) {
      localStorage.setItem('pos_selected_custom_page', String(selectedCustomPage));
      localStorage.removeItem('pos_selected_category');
    } else {
      localStorage.removeItem('pos_selected_custom_page');
    }
  }, [selectedCustomPage]);

  // Validate selectedCustomPage exists after customPages loads
  useEffect(() => {
    if (selectedCustomPage !== null && customPages.length > 0) {
      const pageExists = customPages.some(p => p.id === selectedCustomPage);
      if (!pageExists) {
        // Saved page doesn't exist anymore, clear it
        setSelectedCustomPage(null);
        localStorage.removeItem('pos_selected_custom_page');
      }
    }
  }, [customPages, selectedCustomPage]);

  // Load products when custom page is selected
  useEffect(() => {
    const loadPageProducts = async () => {
      if (selectedCustomPage) {
        // Only load if customPages has been loaded and the page exists
        if (customPages.length > 0) {
          const pageExists = customPages.some(p => p.id === selectedCustomPage);
          if (pageExists) {
            try {
              const pageProducts = await wailsCustomPageService.getPageWithProducts(selectedCustomPage);
              setProducts(pageProducts as any);
            } catch (error) {
              toast.error('Error al cargar productos de la página');
            }
          }
        }
      } else {
        // Reload all products when switching back to categories/all
        loadProducts();
      }
    };
    loadPageProducts();
  }, [selectedCustomPage, customPages]);

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
      // Prevent loading the same order twice (React Strict Mode can cause double execution)
      if (loadedOrderIdRef.current === order.id) {
        return;
      }

      const isEditing = !!state?.editOrder;

      // Mark this order as loaded
      loadedOrderIdRef.current = order.id ?? null;

      // IMPORTANT: Set currentOrder FIRST to trigger the protection in auto-switch useEffect
      setCurrentOrder(order);

      // Then restore the order type BEFORE setting table (to avoid auto-switch interference)
      if (order.order_type_id && order.order_type) {
        setSelectedOrderType(order.order_type as unknown as models.OrderType);
      }

      // Now set the rest of the order data
      setOrderItems(order.items || []);
      setSelectedTable(order.table || null);
      setSelectedCustomer(order.customer || null);

      // CRITICAL FIX: Load delivery info if present
      if (order.delivery_customer_name || order.delivery_address || order.delivery_phone) {
        setDeliveryInfo({
          customerName: order.delivery_customer_name || '',
          address: order.delivery_address || '',
          phone: order.delivery_phone || ''
        });
      }

      toast.info(`Orden ${order.order_number} ${isEditing ? 'lista para editar' : 'cargada'}`);

      // Clear the state to avoid reloading on future renders
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Track all changes to selectedOrderType
  useEffect(() => {
    // No logging needed
  }, [selectedOrderType]);

  // Set default order type when orderTypes are loaded (only for brand new orders)
  useEffect(() => {
    if (orderTypes.length > 0 && !selectedOrderType && !currentOrder && orderItems.length === 0) {
      // Try to find "takeout" (Para Llevar) as default, otherwise use first available
      const takeoutType = orderTypes.find(ot => ot.code === 'takeout');
      setSelectedOrderType(takeoutType || orderTypes[0]);
    }
  }, [orderTypes, selectedOrderType, currentOrder, orderItems]);

  // Update order type when table is selected/deselected (only for new orders)
  useEffect(() => {
    // NEVER auto-switch if there's an existing order loaded (has an ID)
    if (currentOrder && currentOrder.id) {
      return; // Don't touch order type when editing an existing order
    }

    // Don't auto-switch if we have order items (editing mode without currentOrder ID yet)
    if (orderItems.length > 0) {
      return;
    }

    // Only auto-switch for brand new orders (no currentOrder at all)
    if (selectedTable && selectedOrderType?.code !== 'dine-in') {
      const dineInType = orderTypes.find(ot => ot.code === 'dine-in');
      if (dineInType) {
        setSelectedOrderType(dineInType);
      }
    } else if (!selectedTable && selectedOrderType?.code === 'dine-in') {
      // When deselecting table, go back to first order type in list (not hardcoded to takeout)
      if (orderTypes.length > 0) {
        setSelectedOrderType(orderTypes[0]);
      }
    } else {
    }
  }, [selectedTable, orderTypes, currentOrder, orderItems]);

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
            // IMPORTANT: Set currentOrder FIRST to trigger the protection in auto-switch useEffect
            setCurrentOrder(order);

            // Then restore the order type BEFORE setting table (to avoid auto-switch interference)
            if (order.order_type_id && order.order_type) {
              setSelectedOrderType(order.order_type as unknown as models.OrderType);
            }

            // Now set the rest of the order data
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
            // Check if table has an active order BEFORE setting the table
            const existingOrder = await wailsOrderService.getOrderByTable(Number(tableId));

            if (existingOrder) {
              // If there's an existing order, set it FIRST
              setCurrentOrder(existingOrder);

              // Then restore the order type BEFORE setting table (to avoid auto-switch interference)
              if (existingOrder.order_type_id && existingOrder.order_type) {
                setSelectedOrderType(existingOrder.order_type as unknown as models.OrderType);
              }

              // Now set the table and other data
              setSelectedTable(table);
              setOrderItems(existingOrder.items || []);
              setSelectedCustomer(existingOrder.customer || null);

              toast.info(`Orden de mesa ${table.number} cargada`);
            } else {
              // New order - set table first (auto-switch will handle order type)
              setSelectedTable(table);
              toast.info(`Nueva orden para mesa ${table.number}`);
            }
          }
        }
      } catch (error) {
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

  const loadOrderTypes = async () => {
    try {
      const data = await GetActiveOrderTypes();
      setOrderTypes(data);
      // Note: Default order type is set in a useEffect below, not here
    } catch (error) {
      toast.error('Error al cargar tipos de pedido');
    }
  };

  const loadCompanyConfig = async () => {
    try {
      const config = await GetRestaurantConfig();
      if (config) {
        setCompanyLiabilityId(config.type_liability_id || null);
      }
    } catch (error) {
      // Don't show error toast to user, just log it
    }
  };

  const loadCustomPages = async () => {
    try {
      const data = await wailsCustomPageService.getAllPages();
      setCustomPages(data);
    } catch (error) {
    }
  };

  const loadPrinterSettings = async () => {
    try {
      const autoPrintValue = await wailsConfigService.getSystemConfig('printer_auto_print');
      if (autoPrintValue) {
        setAutoPrintReceipt(autoPrintValue === 'true');
      }
    } catch (error) {
      // If config doesn't exist, use default value (true)
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

  // Filter products by category/custom page and search
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by custom page or category
    if (selectedCustomPage) {
      // When custom page is selected, products are already filtered by the useEffect
      filtered = products;
    } else if (selectedCategory) {
      // Traditional category filtering
      filtered = products.filter(product => product.category_id === selectedCategory);
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [products, selectedCategory, selectedCustomPage, searchQuery]);

  // Add product to order
  const addProductToOrder = useCallback((product: Product) => {

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
      setSelectedProductForPrice(product);
      setPriceInputDialogOpen(true);
      return;
    }

    // Check if product has modifiers
    if (product.modifiers && product.modifiers.length > 0) {
      setSelectedProductForModifier(product);
      setModifierDialogOpen(true);
      return;
    }


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
        if (currentItemId === itemId) {
          // Calculate new subtotal including modifiers
          // unit_price is base product price (no modifiers)
          // Add modifiers separately
          const basePrice = item.unit_price || 0;
          const modifiersPrice = item.modifiers?.reduce((sum, mod) => sum + mod.price_change, 0) || 0;
          const newSubtotal = (basePrice + modifiersPrice) * newQuantity;

          return { ...item, quantity: newQuantity, subtotal: newSubtotal };
        }
        return item;
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
  const clearOrder = useCallback(async (skipDelete = false) => {
    try {
      // If there's a saved order and it hasn't been paid yet, delete it from database
      // Don't delete paid orders - they should remain in the system
      if (currentOrder && currentOrder.id && !skipDelete && currentOrder.status !== 'paid') {
        await wailsOrderService.deleteOrder(currentOrder.id);

        // Free the table if it was occupied
        if (selectedTable && selectedTable.id) {
          await wailsOrderService.updateTableStatus(selectedTable.id, 'available');
        }

        toast.success('Pedido eliminado y mesa liberada');
      } else if (!skipDelete && currentOrder?.status === 'paid') {
        // Order was already paid, just clear local state
      } else if (!skipDelete) {
        toast.info('Orden cancelada');
      }
    } catch (error: any) {
      toast.error('Error al eliminar pedido: ' + (error.message || 'Error desconocido'));
    }

    // Clear local state
    setOrderItems([]);
    setCurrentOrder(null);
    setSelectedTable(null);
    setSelectedCustomer(null);
    setNeedsElectronicInvoice(false);
    setDeliveryInfo({ customerName: '', address: '', phone: '' });
    loadedOrderIdRef.current = null; // Reset to allow loading new orders
  }, [currentOrder, selectedTable]);

  // Save order without payment (draft/pending)
  const saveOrder = useCallback(async () => {
    if (orderItems.length === 0) {
      toast.error('Agrega productos a la orden');
      return;
    }

    // Validation: dine-in requires a table
    if (selectedOrderType?.code === 'dine-in' && !selectedTable) {
      toast.error('Debes seleccionar una mesa para pedidos "Para Comer Aquí"');
      return;
    }


    setIsSavingOrder(true);
    try {
      const orderData: CreateOrderData = {
        type: selectedOrderType?.code as 'dine_in' | 'takeout' | 'delivery' || 'takeout',
        order_type_id: selectedOrderType?.id as unknown as number,
        table_id: selectedTable?.id,
        customer_id: selectedCustomer?.id,
        employee_id: user?.id,
        items: orderItems,
        notes: '',
        source: 'pos',
        // Include delivery info if exists (check for actual data, not just order type)
        ...((deliveryInfo.customerName || deliveryInfo.address || deliveryInfo.phone) && {
          delivery_customer_name: deliveryInfo.customerName,
          delivery_address: deliveryInfo.address,
          delivery_phone: deliveryInfo.phone,
        }),
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
      setDeliveryInfo({ customerName: '', address: '', phone: '' });
      loadedOrderIdRef.current = null; // Reset to allow loading new orders
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la orden');
    } finally {
      setIsSavingOrder(false);
    }
  }, [selectedTable, selectedCustomer, orderItems, user, sendMessage, currentOrder, selectedOrderType, deliveryInfo]);

  // Process payment
  const processPayment = useCallback(async (paymentData: any, splitItems?: { itemId: number; quantity: number }[]) => {
    if (!cashRegisterId) {
      toast.error('No hay caja abierta');
      return;
    }

    // Validation: dine-in requires a table
    if (selectedOrderType?.code === 'dine-in' && !selectedTable) {
      toast.error('Debes seleccionar una mesa para pedidos "Para Comer Aquí"');
      return;
    }

    setIsProcessingPayment(true);
    try {
      let orderToProcess: Order;

      // Determine which items to process
      let itemsToProcess = orderItems;
      if (splitItems && splitItems.length > 0) {
        // Create items for this split only
        itemsToProcess = splitItems.map(splitItem => {
          const originalItem = orderItems.find(item => item.id === splitItem.itemId);
          if (!originalItem) throw new Error('Item not found');

          const unitPrice = (originalItem.subtotal || 0) / originalItem.quantity;
          return {
            ...originalItem,
            quantity: splitItem.quantity,
            subtotal: unitPrice * splitItem.quantity,
            // Don't include the ID so it creates a new item
            id: undefined,
          };
        });
      }

      // Check if we're continuing an existing order or creating a new one
      if (currentOrder && currentOrder.id && !splitItems) {
        // Check if order has been modified (items changed)
        const itemsChanged = JSON.stringify(currentOrder.items) !== JSON.stringify(orderItems);

        if (itemsChanged) {
          // Order has been modified, update it first before processing payment
          const orderData: CreateOrderData = {
            type: selectedOrderType?.code as 'dine_in' | 'takeout' | 'delivery' || 'takeout',
            order_type_id: selectedOrderType?.id as unknown as number,
            table_id: selectedTable?.id,
            customer_id: selectedCustomer?.id,
            employee_id: user?.id,
            items: orderItems,
            notes: '',
            source: 'pos',
            ...((deliveryInfo.customerName || deliveryInfo.address || deliveryInfo.phone) && {
              delivery_customer_name: deliveryInfo.customerName,
              delivery_address: deliveryInfo.address,
              delivery_phone: deliveryInfo.phone,
            }),
          };

          orderToProcess = await wailsOrderService.updateOrder(currentOrder.id, orderData);
          // Update currentOrder so it has the latest items
          setCurrentOrder(orderToProcess);
        } else {
          // Use existing order as-is
          orderToProcess = currentOrder;
        }
      } else {
        // Create new order (always for splits, or if no current order)
        const orderData: CreateOrderData = {
          type: selectedOrderType?.code as 'dine_in' | 'takeout' | 'delivery' || 'takeout',
          order_type_id: selectedOrderType?.id as unknown as number,
          table_id: selectedTable?.id,
          customer_id: selectedCustomer?.id,
          employee_id: user?.id,
          items: itemsToProcess,
          notes: splitItems ? 'Cuenta dividida' : '',
          source: 'pos',
          // Include delivery info if exists (check for actual data, not just order type)
          ...((deliveryInfo.customerName || deliveryInfo.address || deliveryInfo.phone) && {
            delivery_customer_name: deliveryInfo.customerName,
            delivery_address: deliveryInfo.address,
            delivery_phone: deliveryInfo.phone,
          }),
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
          // Don't fail the entire payment if table update fails
        }
      }

      toast.success('Venta procesada exitosamente');

      // Only clear order and close dialog if NOT processing a split
      // When processing splits, the parent handler will manage these
      if (!splitItems) {
        clearOrder(true);
        setPaymentDialogOpen(false);
      }

      // Note: Receipt printing is now controlled by the printReceipt checkbox
      // The checkbox has priority over system configuration

    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la venta');
    } finally {
      setIsProcessingPayment(false);
    }
  }, [cashRegisterId, selectedTable, selectedCustomer, orderItems, orderTotals, user, clearOrder, currentOrder, selectedOrderType, deliveryInfo]);

  // Handle payment click - check if should auto-process or show dialog
  const handlePaymentClick = useCallback(() => {
    // Check if order type has skip_payment_dialog enabled
    if (selectedOrderType?.skip_payment_dialog && selectedOrderType?.default_payment_method_id) {

      // Create payment data with default payment method
      const paymentData = {
        payment_data: [{
          payment_method_id: selectedOrderType.default_payment_method_id,
          amount: orderTotals.total,
        }],
        needsInvoice: false,
        sendByEmail: false,
        printReceipt: selectedOrderType.auto_print_receipt !== false, // Use configured value, default to true
      };

      // Process payment directly
      processPayment(paymentData);
    } else {
      // Show payment dialog
      setPaymentDialogOpen(true);
    }
  }, [selectedOrderType, orderTotals.total, processPayment]);

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

        {/* Categories and Custom Pages Combined */}
        <Tabs
          value={
            selectedCustomPage !== null ? `page-${selectedCustomPage}` :
            selectedCategory !== null ? `cat-${selectedCategory}` :
            'all'
          }
          onChange={(_, value) => {
            if (value === 'all') {
              setSelectedCategory(null);
              setSelectedCustomPage(null);
            } else if (value.startsWith('page-')) {
              // It's a custom page
              const pageId = Number(value.replace('page-', ''));
              setSelectedCustomPage(pageId);
              setSelectedCategory(null);
            } else if (value.startsWith('cat-')) {
              // It's a category
              const categoryId = Number(value.replace('cat-', ''));
              setSelectedCategory(categoryId);
              setSelectedCustomPage(null);
            }
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab
            value="all"
            label="Todos"
            icon={<FastfoodIcon />}
          />
          {/* Custom Pages First */}
          {customPages.map((page) => (
            <Tab
              key={`page-${page.id}`}
              value={`page-${page.id}`}
              label={page.name}
              icon={<FastfoodIcon />}
              sx={{
                backgroundColor: selectedCustomPage === page.id ? page.color : 'transparent',
                color: selectedCustomPage === page.id ? '#fff' : 'inherit',
                '&:hover': {
                  backgroundColor: page.color,
                  opacity: 0.8,
                  color: '#fff',
                },
              }}
            />
          ))}
          {/* Then Categories */}
          {categories.map((category) => (
            <Tab
              key={`cat-${category.id}`}
              value={`cat-${category.id}`}
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
          <Button
            startIcon={
              selectedOrderType?.code === 'dine-in' ? <RestaurantIcon /> :
              selectedOrderType?.code === 'delivery' ? <DeliveryIcon /> :
              <FastfoodIcon />
            }
            onClick={() => setOrderTypeDialogOpen(true)}
            variant="contained"
            size="small"
            color={selectedOrderType?.code === 'dine-in' ? 'info' : selectedOrderType?.code === 'delivery' ? 'warning' : 'success'}
            style={{ backgroundColor: selectedOrderType?.display_color }}
          >
            {selectedOrderType?.name || 'Tipo'}
          </Button>
          {/* Delivery Info Button - Show when delivery type is selected */}
          {(selectedOrderType?.code === 'delivery' || selectedOrderType?.code === 'domicilio') && (
            <IconButton
              onClick={() => setDeliveryDialogOpen(true)}
              size="small"
              color="warning"
              title="Información de Domicilio"
              sx={{
                border: (deliveryInfo.customerName || deliveryInfo.address || deliveryInfo.phone) ? '2px solid' : '1px dashed',
                borderColor: 'warning.main'
              }}
            >
              <DeliveryIcon />
            </IconButton>
          )}
          {orderItems.length > 0 && (
            <>
              <IconButton
                onClick={() => setSplitBillDialogOpen(true)}
                size="small"
                color="info"
                title="Dividir Cuenta"
                disabled={isSavingOrder || isProcessingPayment}
              >
                <SplitIcon />
              </IconButton>
              <IconButton
                onClick={() => {
                  if (window.confirm('¿Vaciar el carrito? Esto eliminará todos los productos.')) {
                    setOrderItems([]);
                    setCurrentOrder(null);
                    setSelectedTable(null);
                    setSelectedCustomer(null);
                    toast.info('Carrito vaciado');
                  }
                }}
                size="small"
                color="error"
                title="Vaciar carrito"
              >
                <ClearIcon />
              </IconButton>
            </>
          )}
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
                const product = products.find(p => p.id === item.product_id);
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
                onClick={() => clearOrder(false)}
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

            {/* Payment Action (Primary) */}
            <Button
              fullWidth
              variant="contained"
              color="success"
              size="large"
              startIcon={isProcessingPayment ? <CircularProgress size={20} color="inherit" /> : <PaymentIcon />}
              onClick={handlePaymentClick}
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
        defaultPrintReceipt={autoPrintReceipt}
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
            // IMPORTANT: unit_price should always be base product price (no modifiers)
            // Modifiers are added to subtotal calculation only
            // This matches backend calculation in order_service.go:659-669
            const basePrice = selectedProductForModifier.price;
            const modifiersPriceChange = modifiers.reduce((sum, mod) => sum + mod.price_change, 0);

            if (selectedItemForModifierEdit) {
              // Editing existing item - update it
              const quantity = selectedItemForModifierEdit.quantity;
              const subtotal = (basePrice * quantity) + (modifiersPriceChange * quantity);

              const updatedItem: OrderItem = {
                ...selectedItemForModifierEdit,
                unit_price: basePrice, // Base product price only (no modifiers)
                subtotal: subtotal, // Base + modifiers
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
              const subtotal = basePrice + modifiersPriceChange;

              const newItem: OrderItem = {
                id: Date.now(),
                product_id: selectedProductForModifier.id!,
                product: selectedProductForModifier,
                quantity: 1,
                unit_price: basePrice, // Base product price only (no modifiers)
                subtotal: subtotal, // Base + modifiers
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

      {/* Order Type Selection Dialog */}
      <Dialog
        open={orderTypeDialogOpen}
        onClose={() => setOrderTypeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Seleccionar Tipo de Pedido</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            {orderTypes.map((orderType) => {
              const isSelected = selectedOrderType?.id === orderType.id;
              const IconComponent =
                orderType.code === 'dine-in' ? RestaurantIcon :
                orderType.code === 'delivery' ? DeliveryIcon :
                FastfoodIcon;

              return (
                <Button
                  key={orderType.id}
                  variant={isSelected ? 'contained' : 'outlined'}
                  size="large"
                  startIcon={<IconComponent />}
                  onClick={() => {
                    setSelectedOrderType(orderType);
                    setOrderTypeDialogOpen(false);
                    // Open delivery dialog if this is a delivery order (check multiple codes)
                    if (orderType.code === 'delivery' || orderType.code === 'domicilio') {
                      setDeliveryDialogOpen(true);
                    }
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    py: 2,
                    ...(isSelected && orderType.display_color && {
                      backgroundColor: orderType.display_color,
                      '&:hover': {
                        backgroundColor: orderType.display_color,
                        opacity: 0.9,
                      }
                    })
                  }}
                >
                  {orderType.name}
                </Button>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderTypeDialogOpen(false)}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delivery Info Dialog */}
      <DeliveryInfoDialog
        open={deliveryDialogOpen}
        onClose={() => setDeliveryDialogOpen(false)}
        onConfirm={(info) => {
          setDeliveryInfo(info);
          setDeliveryDialogOpen(false);
        }}
        initialData={deliveryInfo}
      />

      {/* Split Bill Dialog */}
      <SplitBillDialog
        open={splitBillDialogOpen}
        onClose={() => setSplitBillDialogOpen(false)}
        orderItems={orderItems}
        onProcessSplit={(splits) => {
          setBillSplits(splits);
          setSplitBillDialogOpen(false);
          setActiveSplitIndex(0);
          // Open payment dialog for the first split
          if (splits.length > 0) {
            toast.info(`Procesando pago de ${splits[0].name} ($${splits[0].total.toLocaleString('es-CO')})`);
            setPaymentDialogOpen(true);
          }
        }}
      />

      {/* Payment Dialog for Split Bill */}
      {billSplits.length > 0 && activeSplitIndex < billSplits.length && (
        <Dialog
          open={paymentDialogOpen && billSplits.length > 0}
          onClose={() => {
            // When closing split payment dialog, ask for confirmation
            if (window.confirm('¿Cancelar división de cuentas? Se perderá el progreso de los pagos.')) {
              setPaymentDialogOpen(false);
              setBillSplits([]);
              setActiveSplitIndex(0);
            }
          }}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PaymentIcon />
              <Typography variant="h6">
                Pago de {billSplits[activeSplitIndex]?.name}
              </Typography>
              <Chip
                label={`${activeSplitIndex + 1} de ${billSplits.length}`}
                color="primary"
              />
            </Box>
          </DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Procesando pagos divididos. Productos incluidos en esta cuenta:
              </Typography>
              <Box component="ul" sx={{ mt: 1, mb: 0 }}>
                {billSplits[activeSplitIndex]?.items.map(splitItem => {
                  const orderItem = orderItems.find(item => item.id === splitItem.itemId);
                  if (!orderItem) return null;
                  const unitPrice = (orderItem.subtotal || 0) / orderItem.quantity;
                  const itemTotal = unitPrice * splitItem.quantity;
                  return (
                    <li key={splitItem.itemId}>
                      {splitItem.quantity}x {orderItem.product?.name || 'Producto'} - ${itemTotal.toLocaleString('es-CO')}
                    </li>
                  );
                })}
              </Box>
            </Alert>

            <PaymentDialog
              open={true}
              onClose={() => {
                // Same confirmation as outer dialog
                if (window.confirm('¿Cancelar división de cuentas? Se perderá el progreso de los pagos.')) {
                  setPaymentDialogOpen(false);
                  setBillSplits([]);
                  setActiveSplitIndex(0);
                }
              }}
              total={billSplits[activeSplitIndex]?.total || 0}
              paymentMethods={paymentMethods}
              onConfirm={async (paymentData) => {
                try {
                  // Get items for current split
                  const currentSplit = billSplits[activeSplitIndex];

                  // Process payment for this split with specific items
                  await processPayment(paymentData, currentSplit.items);

                  // Move to next split
                  const nextIndex = activeSplitIndex + 1;
                  if (nextIndex < billSplits.length) {
                    setActiveSplitIndex(nextIndex);
                    toast.info(`Procesando pago de ${billSplits[nextIndex].name} ($${billSplits[nextIndex].total.toLocaleString('es-CO')})`);
                  } else {
                    // All splits paid, clear everything
                    setBillSplits([]);
                    setActiveSplitIndex(0);
                    setPaymentDialogOpen(false);
                    clearOrder(true); // Clear the order after all splits are paid
                    toast.success('¡Todos los pagos divididos procesados correctamente!');
                  }
                } catch (error) {
                  console.error('Error processing split payment:', error);
                  toast.error('Error al procesar el pago');
                }
              }}
              customer={selectedCustomer}
              needsElectronicInvoice={needsElectronicInvoice}
              defaultPrintReceipt={autoPrintReceipt}
            />
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};

export default POS;