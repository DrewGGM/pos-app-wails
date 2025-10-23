import React from 'react';
import { Box, Button, Grid } from '@mui/material';

interface QuickPadProps {
  onNumberClick: (number: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}

const QuickPad: React.FC<QuickPadProps> = ({ onNumberClick, onClear, onBackspace }) => {
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  const handleClick = (value: string) => {
    if (value === 'C') {
      onClear();
    } else if (value === '⌫') {
      onBackspace();
    } else {
      onNumberClick(value);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={1}>
        {numbers.map((number) => (
          <Grid item xs={4} key={number}>
            <Button
              variant="outlined"
              fullWidth
              sx={{ minHeight: 60, fontSize: '1.2rem' }}
              onClick={() => handleClick(number)}
            >
              {number}
            </Button>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default QuickPad;
