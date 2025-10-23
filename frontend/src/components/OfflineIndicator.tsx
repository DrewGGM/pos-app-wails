import React from 'react';
import { Box, Typography, LinearProgress, Chip } from '@mui/material';
import { CloudOff, Sync, CheckCircle } from '@mui/icons-material';

interface OfflineIndicatorProps {
  syncStatus: {
    status: 'idle' | 'syncing' | 'completed' | 'failed';
    pendingOrders: number;
    pendingSales: number;
    pendingInvoices: number;
  };
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ syncStatus }) => {
  const totalPending = syncStatus.pendingOrders + syncStatus.pendingSales + syncStatus.pendingInvoices;

  const getStatusIcon = () => {
    switch (syncStatus.status) {
      case 'syncing':
        return <Sync sx={{ animation: 'spin 2s linear infinite' }} />;
      case 'completed':
        return <CheckCircle color="success" />;
      default:
        return <CloudOff />;
    }
  };

  const getStatusText = () => {
    switch (syncStatus.status) {
      case 'syncing':
        return 'Sincronizando...';
      case 'completed':
        return 'Sincronizado';
      case 'failed':
        return 'Error de sincronización';
      default:
        return 'Modo Offline';
    }
  };

  const getStatusColor = (): 'warning' | 'info' | 'success' | 'error' => {
    switch (syncStatus.status) {
      case 'syncing':
        return 'info';
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'warning';
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 64,
        left: 0,
        right: 0,
        zIndex: 1200,
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {getStatusIcon()}
      
      <Typography variant="body2" sx={{ flex: 1 }}>
        {getStatusText()}
        {totalPending > 0 && (
          <> - {totalPending} transacciones pendientes</>
        )}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        {syncStatus.pendingOrders > 0 && (
          <Chip
            label={`${syncStatus.pendingOrders} órdenes`}
            size="small"
            color="warning"
          />
        )}
        {syncStatus.pendingSales > 0 && (
          <Chip
            label={`${syncStatus.pendingSales} ventas`}
            size="small"
            color="warning"
          />
        )}
        {syncStatus.pendingInvoices > 0 && (
          <Chip
            label={`${syncStatus.pendingInvoices} facturas`}
            size="small"
            color="warning"
          />
        )}
      </Box>

      {syncStatus.status === 'syncing' && (
        <LinearProgress
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
          }}
        />
      )}
    </Box>
  );
};

export default OfflineIndicator;
