import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';

const AuthLayout: React.FC = () => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', width: '100%' }}>
      <Outlet />
    </Box>
  );
};

export default AuthLayout;
