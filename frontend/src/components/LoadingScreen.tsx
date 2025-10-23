import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Restaurant as RestaurantIcon } from '@mui/icons-material';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Cargando...' }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 4,
          borderRadius: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          boxShadow: 3,
        }}
      >
        <RestaurantIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          {message}
        </Typography>
      </Box>
    </Box>
  );
};

export default LoadingScreen;
