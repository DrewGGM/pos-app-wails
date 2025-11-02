import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Radio,
  RadioGroup,
  Divider,
  Alert,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { Product, Modifier, ModifierGroup } from '../../types/models';

interface ModifierDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  onConfirm: (modifiers: Modifier[]) => void;
  initialModifiers?: Modifier[];
}

const ModifierDialog: React.FC<ModifierDialogProps> = ({
  open,
  onClose,
  product,
  onConfirm,
  initialModifiers = [],
}) => {
  // Initialize selected modifiers from initialModifiers
  const getInitialSelectedModifiers = () => {
    const initial: Record<number, number[]> = {};
    initialModifiers.forEach(mod => {
      const groupId = mod.group_id;
      if (!initial[groupId]) {
        initial[groupId] = [];
      }
      initial[groupId].push(mod.id!);
    });
    return initial;
  };

  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>(getInitialSelectedModifiers());
  const [error, setError] = useState('');

  // Reset state when dialog opens or initialModifiers change
  React.useEffect(() => {
    if (open) {
      setSelectedModifiers(getInitialSelectedModifiers());
      setError('');
    }
  }, [open, initialModifiers]);

  // Group modifiers by their group
  const modifierGroups = product.modifiers?.reduce((groups, modifier) => {
    const groupId = modifier.group_id;
    if (!groups[groupId]) {
      groups[groupId] = {
        group: modifier.group!,
        modifiers: [],
      };
    }
    groups[groupId].modifiers.push(modifier);
    return groups;
  }, {} as Record<number, { group: ModifierGroup; modifiers: Modifier[] }>);

  const handleRadioChange = (groupId: number, modifierId: number) => {
    setSelectedModifiers({
      ...selectedModifiers,
      [groupId]: [modifierId],
    });
    setError('');
  };

  const handleCheckboxChange = (groupId: number, modifierId: number, checked: boolean) => {
    const current = selectedModifiers[groupId] || [];
    const group = modifierGroups?.[groupId]?.group;

    if (checked) {
      // Check max select limit
      if (group && current.length >= group.max_select) {
        setError(`Máximo ${group.max_select} opciones para ${group.name}`);
        return;
      }
      setSelectedModifiers({
        ...selectedModifiers,
        [groupId]: [...current, modifierId],
      });
    } else {
      setSelectedModifiers({
        ...selectedModifiers,
        [groupId]: current.filter(id => id !== modifierId),
      });
    }
    setError('');
  };

  const validateSelection = (): boolean => {
    if (!modifierGroups) return true;

    for (const [groupId, data] of Object.entries(modifierGroups)) {
      const group = data.group;
      const selected = selectedModifiers[parseInt(groupId)] || [];

      if (group.required && selected.length < group.min_select) {
        setError(`Seleccione al menos ${group.min_select} opción(es) para ${group.name}`);
        return false;
      }
    }

    return true;
  };

  const handleConfirm = () => {
    if (!validateSelection()) {
      return;
    }

    // Collect all selected modifiers
    const modifiers: Modifier[] = [];
    Object.values(selectedModifiers).forEach(modifierIds => {
      modifierIds.forEach(modifierId => {
        const modifier = product.modifiers?.find(m => m.id === modifierId);
        if (modifier) {
          modifiers.push(modifier);
        }
      });
    });

    onConfirm(modifiers);
  };

  const calculateTotalPrice = (): number => {
    let total = product.price;
    
    Object.values(selectedModifiers).forEach(modifierIds => {
      modifierIds.forEach(modifierId => {
        const modifier = product.modifiers?.find(m => m.id === modifierId);
        if (modifier) {
          total += modifier.price_change;
        }
      });
    });

    return total;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">{product.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          Personaliza tu orden
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {modifierGroups && Object.entries(modifierGroups).map(([groupId, data]) => {
          const group = data.group;
          const modifiers = data.modifiers;
          const selected = selectedModifiers[parseInt(groupId)] || [];

          return (
            <Box key={groupId} sx={{ mb: 3 }}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography>{group.name}</Typography>
                    {group.required && (
                      <Chip label="Requerido" color="error" size="small" />
                    )}
                    {group.min_select > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        (Mín: {group.min_select}, Máx: {group.max_select})
                      </Typography>
                    )}
                  </Box>
                </FormLabel>

                {group.multiple ? (
                  <FormGroup>
                    {modifiers.map(modifier => (
                      <FormControlLabel
                        key={modifier.id}
                        control={
                          <Checkbox
                            checked={selected.includes(modifier.id!)}
                            onChange={(e) => handleCheckboxChange(
                              parseInt(groupId),
                              modifier.id!,
                              e.target.checked
                            )}
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <Typography>{modifier.name}</Typography>
                            {modifier.price_change !== 0 && (
                              <Chip
                                label={`${modifier.price_change > 0 ? '+' : ''}$${Math.abs(modifier.price_change).toLocaleString('es-CO')}`}
                                color={modifier.price_change > 0 ? 'warning' : 'success'}
                                size="small"
                              />
                            )}
                          </Box>
                        }
                      />
                    ))}
                  </FormGroup>
                ) : (
                  <RadioGroup
                    value={selected[0] || ''}
                    onChange={(e) => handleRadioChange(
                      parseInt(groupId),
                      parseInt(e.target.value)
                    )}
                  >
                    {modifiers.map(modifier => (
                      <FormControlLabel
                        key={modifier.id}
                        value={modifier.id}
                        control={<Radio />}
                        label={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <Typography>{modifier.name}</Typography>
                            {modifier.price_change !== 0 && (
                              <Chip
                                label={`${modifier.price_change > 0 ? '+' : ''}$${Math.abs(modifier.price_change).toLocaleString('es-CO')}`}
                                color={modifier.price_change > 0 ? 'warning' : 'success'}
                                size="small"
                              />
                            )}
                          </Box>
                        }
                      />
                    ))}
                    {!group.required && (
                      <FormControlLabel
                        value=""
                        control={<Radio />}
                        label="Ninguno"
                      />
                    )}
                  </RadioGroup>
                )}
              </FormControl>
            </Box>
          );
        })}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="h6">Total:</Typography>
          <Typography variant="h5" color="primary">
            ${calculateTotalPrice().toLocaleString('es-CO')}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
        >
          Agregar al Pedido
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModifierDialog;
