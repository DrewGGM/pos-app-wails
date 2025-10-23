import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';

const AuthLayout: React.FC = () => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Outlet />
    </Box>
  );
};

export default AuthLayout;
