import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tab,
  Tabs,
  Paper,
  Avatar,
  Divider,
  Alert,
} from '@mui/material';
import {
  Timer as TimerIcon,
  CheckCircle as CheckIcon,
  PlayCircle as PlayIcon,
  Restaurant as RestaurantIcon,
  TableChart as TableIcon,
  Notifications as BellIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Print as PrintIcon,
  Cancel as CancelIcon,
  LocalDining as DiningIcon,
} from '@mui/icons-material';
import { format, differenceInMinutes } from 'date-fns';
import { useWebSocket } from '../../hooks';
import { wailsOrderService } from '../../services/wailsOrderService';
import { toast } from 'react-toastify';
import { Order, OrderItem } from '../../types/models';

interface KitchenOrder extends Order {
  preparationTime?: number;
  priority?: 'normal' | 'high' | 'urgent';
}

const Kitchen: React.FC = () => {
  const { subscribe, sendMessage } = useWebSocket();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [expandedOrders, setExpandedOrders] = useState<number[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('pending');

  useEffect(() => {
    loadOrders();
    
    // Subscribe to WebSocket events
    const unsubscribeNewOrder = subscribe('order_new', handleNewOrder);
    const unsubscribeOrderUpdate = subscribe('order_update', handleOrderUpdate);
    const unsubscribeKitchenUpdate = subscribe('kitchen_update', handleKitchenUpdate);

    // Refresh orders every 30 seconds
    const interval = setInterval(loadOrders, 30000);

    return () => {
      unsubscribeNewOrder();
      unsubscribeOrderUpdate();
      unsubscribeKitchenUpdate();
      clearInterval(interval);
    };
  }, []);

  const loadOrders = async () => {
    try {
      // Use Wails OrderService instead of HTTP
      // For now, use empty list (will be populated via WebSocket)
      setOrders([]);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const handleNewOrder = (order: Order) => {
    const kitchenOrder: KitchenOrder = {
      ...order,
      preparationTime: calculatePreparationTime(order),
      priority: calculatePriority(order),
    };
    setOrders(prev => [kitchenOrder, ...prev]);
    toast.info(`Nueva orden: ${order.order_number}`, {
      position: 'top-right',
    });
  };

  const handleOrderUpdate = (update: any) => {
    setOrders(prev => prev.map(order =>
      order.id === update.order_id
        ? { ...order, ...update.changes }
        : order
    ));
  };

  const handleKitchenUpdate = (update: any) => {
    // Handle specific kitchen updates
    if (update.type === 'item_ready') {
      markItemAsReady(update.order_id, update.item_id);
    }
  };

  const calculatePreparationTime = (order: Order): number => {
    if (!order.created_at) return 0;
    return differenceInMinutes(new Date(), new Date(order.created_at));
  };

  const calculatePriority = (order: Order): 'normal' | 'high' | 'urgent' => {
    const prepTime = calculatePreparationTime(order);
    if (prepTime > 30) return 'urgent';
    if (prepTime > 15) return 'high';
    return 'normal';
  };

  const handleStartPreparation = async (orderId: number | undefined) => {
    if (!orderId) {
      toast.error('ID de orden inválido');
      return;
    }
    try {
      await wailsOrderService.updateOrderStatus(orderId, 'preparing');
      
      // Send WebSocket notification
      sendMessage({
        type: 'kitchen_update',
        timestamp: new Date().toISOString(),
        data: {
          order_id: orderId,
          status: 'preparing',
        },
      });

      toast.success('Preparación iniciada');
      loadOrders();
    } catch (error) {
      toast.error('Error al iniciar preparación');
    }
  };

  const handleMarkReady = async (orderId: number | undefined) => {
    if (!orderId) {
      toast.error('ID de orden inválido');
      return;
    }
    try {
      await wailsOrderService.updateOrderStatus(orderId, 'ready');
      
      // Send WebSocket notification
      sendMessage({
        type: 'order_ready',
        timestamp: new Date().toISOString(),
        data: {
          order_id: orderId,
          order_number: orders.find(o => o.id === orderId)?.order_number,
          table: orders.find(o => o.id === orderId)?.table,
        },
      });

      toast.success('Orden lista para entregar');
      loadOrders();
    } catch (error) {
      toast.error('Error al marcar como lista');
    }
  };

  const handleMarkItemReady = async (orderId: number | undefined, itemId: number | undefined) => {
    if (!orderId || !itemId) {
      toast.error('IDs inválidos');
      return;
    }
    try {
      // Mark item ready - for now just toast
      // await wailsOrderService.markItemReady(orderId, itemId);
      toast.success('Plato marcado como listo');
      loadOrders();
    } catch (error) {
      toast.error('Error al marcar plato');
    }
  };

  const markItemAsReady = (orderId: number, itemId: number) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map(item =>
            item.id === itemId ? { ...item, status: 'ready' } : item
          ),
        };
      }
      return order;
    }));
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder || !cancelReason) {
      toast.error('Debe especificar una razón');
      return;
    }

    try {
      await wailsOrderService.cancelOrder(selectedOrder.id!, cancelReason);
      toast.success('Orden cancelada');
      setCancelDialogOpen(false);
      setSelectedOrder(null);
      setCancelReason('');
      loadOrders();
    } catch (error) {
      toast.error('Error al cancelar orden');
    }
  };

  const toggleOrderExpansion = (orderId: number | undefined) => {
    if (!orderId) return;
    setExpandedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FFA726';
      case 'preparing':
        return '#66BB6A';
      case 'ready':
        return '#29B6F6';
      default:
        return '#9E9E9E';
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          Cocina
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Badge badgeContent={orders.filter(o => o.status === 'pending').length} color="error">
            <Chip
              icon={<BellIcon />}
              label="Pendientes"
              color={filter === 'pending' ? 'primary' : 'default'}
              onClick={() => setFilter('pending')}
            />
          </Badge>
          <Chip
            icon={<PlayIcon />}
            label="Preparando"
            color={filter === 'preparing' ? 'primary' : 'default'}
            onClick={() => setFilter('preparing')}
          />
          <Chip
            icon={<CheckIcon />}
            label="Listos"
            color={filter === 'ready' ? 'primary' : 'default'}
            onClick={() => setFilter('ready')}
          />
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="error">
              {orders.filter(o => o.status === 'pending').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Órdenes Pendientes
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="warning.main">
              {orders.filter(o => o.status === 'preparing').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              En Preparación
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="success.main">
              {orders.filter(o => o.status === 'ready').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Listos para Servir
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Orders Grid */}
      <Grid container spacing={2}>
        {filteredOrders.map(order => {
          const orderId = order.id;
          const isExpanded = orderId ? expandedOrders.includes(orderId) : false;
          
          return (
            <Grid item xs={12} md={6} lg={4} key={order.id}>
              <Card
                sx={{
                  borderLeft: '4px solid',
                  borderLeftColor: getStatusColor(order.status),
                  position: 'relative',
                }}
              >
                <CardContent>
                  {/* Order Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h6">
                        #{order.order_number}
                      </Typography>
                      {order.priority && order.priority !== 'normal' && (
                        <Chip
                          label={order.priority}
                          size="small"
                          color={getPriorityColor(order.priority)}
                        />
                      )}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => toggleOrderExpansion(order.id)}
                    >
                      {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    </IconButton>
                  </Box>

                  {/* Order Info */}
                  <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                    {order.table && (
                      <Chip
                        icon={<TableIcon />}
                        label={`Mesa ${order.table.number}`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {order.type === 'takeout' && (
                      <Chip
                        icon={<DiningIcon />}
                        label="Para Llevar"
                        size="small"
                        variant="outlined"
                      />
                    )}
                    <Chip
                      icon={<TimerIcon />}
                      label={`${order.preparationTime} min`}
                      size="small"
                      color={order.preparationTime! > 20 ? 'error' : 'default'}
                    />
                  </Box>

                  {/* Items Summary or Detail */}
                  {isExpanded ? (
                    <List dense>
                      {order.items.map(item => (
                        <ListItem key={item.id} disablePadding>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2">
                                  {item.quantity}x {item.product?.name}
                                </Typography>
                                {item.status === 'ready' && (
                                  <CheckIcon color="success" fontSize="small" />
                                )}
                              </Box>
                            }
                            secondary={
                              <>
                                {item.modifiers && item.modifiers.map(mod => (
                                  <Chip
                                    key={mod.id}
                                    label={mod.modifier?.name}
                                    size="small"
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                  />
                                ))}
                                {item.notes && (
                                  <Typography variant="caption" color="error">
                                    Nota: {item.notes}
                                  </Typography>
                                )}
                              </>
                            }
                          />
                          {order.status === 'preparing' && item.status !== 'ready' && (
                            <ListItemSecondaryAction>
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() => handleMarkItemReady(order.id, item.id)}
                              >
                                <CheckIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          )}
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {order.items.length} platos
                      {order.notes && ` • ${order.notes}`}
                    </Typography>
                  )}
                </CardContent>

                <CardActions>
                  {order.status === 'pending' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={<PlayIcon />}
                      onClick={() => handleStartPreparation(order.id)}
                      fullWidth
                    >
                      Iniciar Preparación
                    </Button>
                  )}
                  
                  {order.status === 'preparing' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckIcon />}
                      onClick={() => handleMarkReady(order.id)}
                      fullWidth
                      disabled={order.items.some(item => item.status !== 'ready')}
                    >
                      Marcar Como Listo
                    </Button>
                  )}
                  
                  {order.status === 'ready' && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      fullWidth
                      disabled
                    >
                      Esperando Entrega
                    </Button>
                  )}
                  
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (order.id) {
                        // Print kitchen ticket - to be implemented
                        toast.info('Imprimir ticket de cocina - pendiente');
                      }
                    }}
                  >
                    <PrintIcon />
                  </IconButton>
                  
                  {order.status !== 'ready' && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setSelectedOrder(order);
                        setCancelDialogOpen(true);
                      }}
                    >
                      <CancelIcon />
                    </IconButton>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {filteredOrders.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <RestaurantIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No hay órdenes {filter !== 'all' && filter}
          </Typography>
        </Box>
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cancelar Orden</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta acción no se puede deshacer
          </Alert>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Razón de cancelación"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Especifique la razón..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCancelOrder}
            color="error"
            variant="contained"
            disabled={!cancelReason}
          >
            Confirmar Cancelación
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Kitchen;