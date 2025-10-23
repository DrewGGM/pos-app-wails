import React from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Box,
  Chip,
  ButtonGroup,
  Button,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Note as NoteIcon,
} from '@mui/icons-material';
import { OrderItem } from '../../types/models';

interface OrderListProps {
  items: OrderItem[];
  onUpdateQuantity: (itemId: number, quantity: number) => void;
  onRemoveItem: (itemId: number) => void;
  onEditItem?: (item: OrderItem) => void;
  editable?: boolean;
}

const OrderList: React.FC<OrderListProps> = ({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onEditItem,
  editable = true,
}) => {
  const handleQuantityChange = (item: OrderItem, delta: number) => {
    // Generate temporary ID for items without ID
    const itemId = item.id ?? Date.now();
    const newQuantity = item.quantity + delta;
    if (newQuantity > 0) {
      onUpdateQuantity(itemId, newQuantity);
    }
  };

  return (
    <List sx={{ width: '100%' }}>
      {items.map((item, index) => (
        <React.Fragment key={item.id || index}>
          <ListItem
            sx={{
              flexDirection: 'column',
              alignItems: 'stretch',
              py: 1.5,
              px: 0,
            }}
          >
            {/* Main item row */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 1 }}>
              {/* Quantity controls */}
              {editable && (
                <ButtonGroup size="small" sx={{ mr: 1 }}>
                  <Button
                    onClick={() => handleQuantityChange(item, -1)}
                    disabled={item.quantity <= 1}
                  >
                    <RemoveIcon fontSize="small" />
                  </Button>
                  <Button disabled sx={{ minWidth: '40px' }}>
                    {item.quantity}
                  </Button>
                  <Button onClick={() => handleQuantityChange(item, 1)}>
                    <AddIcon fontSize="small" />
                  </Button>
                </ButtonGroup>
              )}

              {/* Product info */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {item.product?.name}
                </Typography>
                
                {/* Unit price */}
                <Typography variant="body2" color="text.secondary">
                  ${(item.unit_price || 0).toLocaleString('es-CO')} c/u
                </Typography>
              </Box>

              {/* Subtotal */}
              <Box sx={{ textAlign: 'right', mr: 1 }}>
                <Typography variant="subtitle1">
                  ${(item.subtotal || 0).toLocaleString('es-CO')}
                </Typography>
              </Box>

              {/* Action buttons */}
              {editable && (
                <Box>
                  {onEditItem && item.product?.has_modifiers && (
                    <IconButton
                      size="small"
                      onClick={() => onEditItem(item)}
                      sx={{ mr: 0.5 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      const itemId = item.id ?? Date.now();
                      onRemoveItem(itemId);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>

            {/* Modifiers */}
            {item.modifiers && item.modifiers.length > 0 && (
              <Box sx={{ pl: 2, mb: 0.5 }}>
                {item.modifiers.map((mod, idx) => (
                  <Chip
                    key={idx}
                    label={`${mod.modifier?.name} ${mod.price_change > 0 ? `+$${mod.price_change.toLocaleString('es-CO')}` : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{ mr: 0.5, mb: 0.5 }}
                  />
                ))}
              </Box>
            )}

            {/* Notes */}
            {item.notes && (
              <Box sx={{ pl: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <NoteIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  {item.notes}
                </Typography>
              </Box>
            )}

            {/* Kitchen status */}
            {item.status && item.status !== 'pending' && (
              <Box sx={{ pl: 2, mt: 0.5 }}>
                <Chip
                  label={getStatusLabel(item.status)}
                  size="small"
                  color={getStatusColor(item.status)}
                />
              </Box>
            )}
          </ListItem>
          
          {index < items.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </List>
  );
};

// Helper functions
const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'preparing':
      return 'Preparando';
    case 'ready':
      return 'Listo';
    case 'delivered':
      return 'Entregado';
    default:
      return status;
  }
};

const getStatusColor = (status: string): 'default' | 'warning' | 'success' | 'info' => {
  switch (status) {
    case 'preparing':
      return 'warning';
    case 'ready':
      return 'success';
    case 'delivered':
      return 'info';
    default:
      return 'default';
  }
};

export default OrderList;