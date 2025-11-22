import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  IconButton,
  Tab,
  Tabs,
  Alert,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  SplitscreenOutlined as SplitIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { OrderItem } from '../../types/models';

interface SplitBillDialogProps {
  open: boolean;
  onClose: () => void;
  orderItems: OrderItem[];
  onProcessSplit: (splits: BillSplit[]) => void;
}

export interface BillSplit {
  id: number;
  name: string;
  items: { itemId: number; quantity: number }[];
  total: number;
}

interface ItemAllocation {
  itemId: number;
  splitId: number;
  quantity: number;
}

const SplitBillDialog: React.FC<SplitBillDialogProps> = ({
  open,
  onClose,
  orderItems,
  onProcessSplit,
}) => {
  const [splits, setSplits] = useState<BillSplit[]>([
    { id: 1, name: 'Cuenta 1', items: [], total: 0 },
  ]);
  const [activeSplitTab, setActiveSplitTab] = useState(0);
  const [itemAllocations, setItemAllocations] = useState<ItemAllocation[]>([]);

  // Initialize when dialog opens
  useEffect(() => {
    if (open) {
      setItemAllocations([]);
      setSplits([{ id: 1, name: 'Cuenta 1', items: [], total: 0 }]);
      setActiveSplitTab(0);
    }
  }, [open]);

  // Recalculate totals when allocations change
  useEffect(() => {
    const updatedSplits = splits.map(split => {
      const splitItems = itemAllocations
        .filter(alloc => alloc.splitId === split.id)
        .map(alloc => ({
          itemId: alloc.itemId,
          quantity: alloc.quantity,
        }));

      const total = splitItems.reduce((sum, splitItem) => {
        const orderItem = orderItems.find(item => item.id === splitItem.itemId);
        if (!orderItem) return sum;
        const unitPrice = (orderItem.subtotal || 0) / orderItem.quantity;
        return sum + unitPrice * splitItem.quantity;
      }, 0);

      return { ...split, items: splitItems, total };
    });
    setSplits(updatedSplits);
  }, [itemAllocations, orderItems]);

  const addSplit = () => {
    const newId = Math.max(...splits.map(s => s.id)) + 1;
    setSplits([
      ...splits,
      { id: newId, name: `Cuenta ${newId}`, items: [], total: 0 },
    ]);
    setActiveSplitTab(splits.length);
  };

  const removeSplit = (splitId: number) => {
    if (splits.length === 1) return;

    // Remove all allocations for this split
    setItemAllocations(allocations =>
      allocations.filter(alloc => alloc.splitId !== splitId)
    );

    const newSplits = splits.filter(s => s.id !== splitId);
    setSplits(newSplits);

    if (activeSplitTab >= newSplits.length) {
      setActiveSplitTab(newSplits.length - 1);
    }
  };

  const getItemAllocatedQuantity = (itemId: number): number => {
    return itemAllocations
      .filter(alloc => alloc.itemId === itemId)
      .reduce((sum, alloc) => sum + alloc.quantity, 0);
  };

  const getItemRemainingQuantity = (itemId: number): number => {
    const orderItem = orderItems.find(item => item.id === itemId);
    if (!orderItem) return 0;
    return orderItem.quantity - getItemAllocatedQuantity(itemId);
  };

  const getItemQuantityInSplit = (itemId: number, splitId: number): number => {
    const alloc = itemAllocations.find(
      a => a.itemId === itemId && a.splitId === splitId
    );
    return alloc ? alloc.quantity : 0;
  };

  const updateItemQuantityInSplit = (
    itemId: number,
    splitId: number,
    quantity: number
  ) => {
    const orderItem = orderItems.find(item => item.id === itemId);
    if (!orderItem) return;

    // Calculate available quantity (total - allocated in other splits)
    const allocatedInOtherSplits = itemAllocations
      .filter(alloc => alloc.itemId === itemId && alloc.splitId !== splitId)
      .reduce((sum, alloc) => sum + alloc.quantity, 0);

    const maxAvailable = orderItem.quantity - allocatedInOtherSplits;

    // Clamp quantity to valid range
    const validQuantity = Math.max(0, Math.min(quantity, maxAvailable));

    setItemAllocations(allocations => {
      const existing = allocations.find(
        alloc => alloc.itemId === itemId && alloc.splitId === splitId
      );

      if (validQuantity === 0) {
        // Remove allocation if quantity is 0
        return allocations.filter(
          alloc => !(alloc.itemId === itemId && alloc.splitId === splitId)
        );
      }

      if (existing) {
        // Update existing allocation
        return allocations.map(alloc =>
          alloc.itemId === itemId && alloc.splitId === splitId
            ? { ...alloc, quantity: validQuantity }
            : alloc
        );
      } else {
        // Add new allocation
        return [...allocations, { itemId, splitId, quantity: validQuantity }];
      }
    });
  };

  const getAvailableItems = () => {
    return orderItems.filter(item => getItemRemainingQuantity(item.id!) > 0);
  };

  const getTotalAmount = () => {
    return orderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  };

  const getAllocatedTotal = () => {
    return splits.reduce((sum, split) => sum + split.total, 0);
  };

  const getUnallocatedItems = () => {
    return orderItems.filter(item => {
      const remaining = getItemRemainingQuantity(item.id!);
      return remaining > 0;
    });
  };

  const handleProcessSplit = () => {
    const unallocated = getUnallocatedItems();
    if (unallocated.length > 0) {
      alert('Debe asignar todos los productos a una cuenta antes de proceder.');
      return;
    }

    onProcessSplit(splits);
  };

  const currentSplit = splits[activeSplitTab];
  const unallocatedItems = getUnallocatedItems();
  const availableItems = getAvailableItems();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SplitIcon />
          <Typography variant="h6">Dividir Cuenta</Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addSplit}
            size="small"
          >
            Nueva Cuenta
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Left side - Tabs for splits */}
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs
                  value={activeSplitTab}
                  onChange={(_, newValue) => setActiveSplitTab(newValue)}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  {splits.map((split, index) => (
                    <Tab
                      key={split.id}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {split.name}
                          <Chip
                            size="small"
                            label={`$${split.total.toLocaleString('es-CO')}`}
                            color={split.total > 0 ? 'primary' : 'default'}
                          />
                        </Box>
                      }
                    />
                  ))}
                </Tabs>
              </Box>

              {currentSplit && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {currentSplit.name}
                    </Typography>
                    {splits.length > 1 && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeSplit(currentSplit.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Asignar cantidades de productos a esta cuenta:
                  </Typography>

                  <Alert severity="info" sx={{ mb: 2, fontSize: '0.875rem' }}>
                    Solo aparecen productos con cantidad disponible para asignar
                  </Alert>

                  <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {availableItems.map(item => {
                      const remaining = getItemRemainingQuantity(item.id!);
                      const currentQty = getItemQuantityInSplit(item.id!, currentSplit.id);
                      const unitPrice = (item.subtotal || 0) / item.quantity;

                      return (
                        <ListItem
                          key={item.id}
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            mb: 1,
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                          }}
                        >
                          <Box sx={{ width: '100%', mb: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              {item.product?.name || 'Producto'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Disponible: {remaining} de {item.quantity} unidades
                              {' • '}Precio unitario: ${unitPrice.toLocaleString('es-CO')}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                updateItemQuantityInSplit(
                                  item.id!,
                                  currentSplit.id,
                                  currentQty - 1
                                )
                              }
                              disabled={currentQty === 0}
                            >
                              <RemoveIcon />
                            </IconButton>

                            <TextField
                              size="small"
                              type="number"
                              value={currentQty}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                updateItemQuantityInSplit(item.id!, currentSplit.id, value);
                              }}
                              InputProps={{
                                inputProps: { min: 0, max: remaining + currentQty },
                              }}
                              sx={{ width: 80 }}
                            />

                            <IconButton
                              size="small"
                              onClick={() =>
                                updateItemQuantityInSplit(
                                  item.id!,
                                  currentSplit.id,
                                  currentQty + 1
                                )
                              }
                              disabled={remaining === 0}
                            >
                              <AddIcon />
                            </IconButton>

                            <Box sx={{ flex: 1 }} />

                            <Typography variant="body2" color="primary" fontWeight="bold">
                              ${(unitPrice * currentQty).toLocaleString('es-CO')}
                            </Typography>

                            {currentQty > 0 && (
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => updateItemQuantityInSplit(item.id!, currentSplit.id, 0)}
                                sx={{ ml: 1 }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        </ListItem>
                      );
                    })}
                  </List>

                  {availableItems.length === 0 && (
                    <Alert severity="success">
                      Todos los productos han sido asignados
                    </Alert>
                  )}

                  <Divider sx={{ my: 2 }} />

                  <Box
                    sx={{
                      p: 2,
                      bgcolor: 'primary.light',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="h6" align="center">
                      Total: ${currentSplit.total.toLocaleString('es-CO')}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Right side - Summary */}
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Resumen de División
              </Typography>

              <List>
                {splits.map(split => {
                  const itemsText = split.items.length > 0
                    ? split.items.map(splitItem => {
                        const orderItem = orderItems.find(item => item.id === splitItem.itemId);
                        return orderItem
                          ? `${splitItem.quantity}x ${orderItem.product?.name || 'Producto'}`
                          : '';
                      }).filter(Boolean).join(', ')
                    : 'Sin productos';

                  return (
                    <ListItem key={split.id} sx={{ alignItems: 'flex-start' }}>
                      <ListItemText
                        primary={split.name}
                        secondary={itemsText}
                        secondaryTypographyProps={{
                          component: 'div',
                          sx: {
                            whiteSpace: 'normal',
                            wordBreak: 'break-word'
                          }
                        }}
                      />
                      <Typography
                        variant="subtitle1"
                        color={split.total > 0 ? 'primary' : 'text.disabled'}
                        sx={{ ml: 2, flexShrink: 0 }}
                      >
                        ${split.total.toLocaleString('es-CO')}
                      </Typography>
                    </ListItem>
                  );
                })}
              </List>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Total de la Orden:</Typography>
                  <Typography fontWeight="bold">
                    ${getTotalAmount().toLocaleString('es-CO')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Total Asignado:</Typography>
                  <Typography
                    fontWeight="bold"
                    color={
                      Math.abs(getAllocatedTotal() - getTotalAmount()) < 0.01
                        ? 'success.main'
                        : 'warning.main'
                    }
                  >
                    ${getAllocatedTotal().toLocaleString('es-CO')}
                  </Typography>
                </Box>
                {unallocatedItems.length > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="error">Sin Asignar:</Typography>
                    <Typography fontWeight="bold" color="error">
                      {unallocatedItems.reduce(
                        (sum, item) => sum + getItemRemainingQuantity(item.id!),
                        0
                      )}{' '}
                      unidades
                    </Typography>
                  </Box>
                )}
              </Box>

              {unallocatedItems.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    Aún hay {unallocatedItems.length} producto(s) con cantidades sin
                    asignar. Debe asignar todas las unidades antes de proceder.
                  </Typography>
                </Alert>
              )}

              {unallocatedItems.length === 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    ¡Todas las cantidades están asignadas! Puede proceder a procesar
                    los pagos.
                  </Typography>
                </Alert>
              )}
            </Paper>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="error">
          Cancelar
        </Button>
        <Button
          onClick={handleProcessSplit}
          variant="contained"
          color="success"
          disabled={unallocatedItems.length > 0}
          startIcon={<PaymentIcon />}
        >
          Procesar Pagos por Separado
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SplitBillDialog;
