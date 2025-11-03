import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TableChart as TableIcon,
  Group as GroupIcon,
  Check as CheckIcon,
  Restaurant as RestaurantIcon,
  Deck as DeckIcon,
  LocalBar as BarIcon,
} from '@mui/icons-material';
import { Table } from '../../types/models';
import { wailsOrderService } from '../../services/wailsOrderService';
import { toast } from 'react-toastify';

interface TableSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectTable: (table: Table | null) => void;
  selectedTable: Table | null;
  onlyAvailable?: boolean; // When true, only show available tables (for changing tables)
}

const TableSelector: React.FC<TableSelectorProps> = ({
  open,
  onClose,
  onSelectTable,
  selectedTable,
  onlyAvailable = false,
}) => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadTables();
    }
  }, [open]);

  const loadTables = async () => {
    setLoading(true);
    try {
      const data = await wailsOrderService.getTables();
      setTables(data);
      
      // Extract unique zones
      const uniqueZones = [...new Set(data.map(t => t.zone || 'general'))];
      setZones(uniqueZones);
      
      // Set initial zone
      if (uniqueZones.length > 0 && !selectedZone) {
        setSelectedZone(uniqueZones[0]);
      }
    } catch (error) {
      toast.error('Error al cargar mesas');
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables
    .filter(t => !selectedZone || (t.zone || 'general') === selectedZone)
    .filter(t => !onlyAvailable || t.status === 'available');

  const getTableColor = (table: Table) => {
    switch (table.status) {
      case 'available':
        return '#66BB6A';
      case 'occupied':
        return '#FF9800';
      case 'reserved':
        return '#5C6BC0';
      case 'cleaning':
        return '#78909C';
      default:
        return '#9E9E9E';
    }
  };

  const getTableStatusText = (status: string) => {
    switch (status) {
      case 'available':
        return 'Disponible';
      case 'occupied':
        return 'Ocupada';
      case 'reserved':
        return 'Reservada';
      case 'cleaning':
        return 'Limpieza';
      default:
        return 'Desconocido';
    }
  };

  const getZoneIcon = (zone: string) => {
    switch (zone) {
      case 'interior':
        return <RestaurantIcon />;
      case 'exterior':
        return <DeckIcon />;
      case 'bar':
        return <BarIcon />;
      default:
        return <TableIcon />;
    }
  };

  const handleSelectTable = (table: Table) => {
    // When onlyAvailable is true, only allow available tables
    if (onlyAvailable && table.status !== 'available') {
      toast.warning(`Mesa ${table.number} no está disponible para cambiar`);
      return;
    }

    // Normal mode: allow available and occupied tables
    if (table.status === 'available' || table.status === 'occupied') {
      onSelectTable(table);
      onClose();
    } else {
      toast.warning(`Mesa ${table.number} no está disponible`);
    }
  };

  const handleRemoveTable = () => {
    onSelectTable(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Seleccionar Mesa</Typography>
          {selectedTable && (
            <Chip
              icon={<TableIcon />}
              label={`Mesa ${selectedTable.number} seleccionada`}
              color="primary"
              onDelete={handleRemoveTable}
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Zone filter */}
            {zones.length > 1 && (
              <Box sx={{ mb: 3 }}>
                <ToggleButtonGroup
                  value={selectedZone}
                  exclusive
                  onChange={(_, value) => setSelectedZone(value)}
                  aria-label="zone filter"
                >
                  {zones.map(zone => (
                    <ToggleButton key={zone} value={zone}>
                      {getZoneIcon(zone)}
                      <Box sx={{ ml: 1 }}>{zone.charAt(0).toUpperCase() + zone.slice(1)}</Box>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            )}

            {/* Status legend */}
            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label="Disponible"
                sx={{ backgroundColor: '#66BB6A', color: 'white' }}
              />
              <Chip
                size="small"
                label="Ocupada"
                sx={{ backgroundColor: '#FF9800', color: 'white' }}
              />
              <Chip
                size="small"
                label="Reservada"
                sx={{ backgroundColor: '#5C6BC0', color: 'white' }}
              />
              <Chip
                size="small"
                label="Limpieza"
                sx={{ backgroundColor: '#78909C', color: 'white' }}
              />
            </Box>

            {/* Tables grid */}
            <Grid container spacing={2}>
              {filteredTables.map(table => (
                <Grid item xs={6} sm={4} md={3} key={table.id}>
                  <Card
                    sx={{
                      position: 'relative',
                      backgroundColor: selectedTable?.id === table.id ? 'action.selected' : 'background.paper',
                      border: selectedTable?.id === table.id ? '2px solid' : 'none',
                      borderColor: 'primary.main',
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleSelectTable(table)}
                      disabled={
                        table.status === 'reserved' ||
                        table.status === 'cleaning' ||
                        (onlyAvailable && table.status !== 'available')
                      }
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          {/* Table icon with shape */}
                          <Box
                            sx={{
                              width: 60,
                              height: 60,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: getTableColor(table),
                              borderRadius: table.shape === 'round' ? '50%' : table.shape === 'square' ? 1 : 2,
                              mb: 1,
                            }}
                          >
                            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                              {table.number}
                            </Typography>
                          </Box>

                          {/* Table name */}
                          <Typography variant="subtitle1" align="center">
                            {table.name || `Mesa ${table.number}`}
                          </Typography>

                          {/* Capacity */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <GroupIcon fontSize="small" />
                            <Typography variant="body2">
                              {table.capacity} personas
                            </Typography>
                          </Box>

                          {/* Status */}
                          <Chip
                            size="small"
                            label={getTableStatusText(table.status)}
                            sx={{
                              mt: 1,
                              backgroundColor: getTableColor(table),
                              color: 'white',
                            }}
                          />

                          {/* Current order info */}
                          {table.status === 'occupied' && table.current_order && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                              Orden #{table.current_order.order_number}
                            </Typography>
                          )}
                        </Box>

                        {/* Selected indicator */}
                        {selectedTable?.id === table.id && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              backgroundColor: 'primary.main',
                              borderRadius: '50%',
                              p: 0.5,
                            }}
                          >
                            <CheckIcon sx={{ color: 'white', fontSize: 16 }} />
                          </Box>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {filteredTables.length === 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                No hay mesas disponibles en esta zona
              </Alert>
            )}

            {/* Takeout option */}
            <Box sx={{ mt: 3 }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleRemoveTable}
                startIcon={<RestaurantIcon />}
              >
                Para Llevar (Sin Mesa)
              </Button>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancelar
        </Button>
        {selectedTable && (
          <Button
            onClick={() => {
              onSelectTable(selectedTable);
              onClose();
            }}
            variant="contained"
            color="primary"
          >
            Usar Mesa {selectedTable.number}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TableSelector;
