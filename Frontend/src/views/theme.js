import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f1419', // Fondo SCADA ultra oscuro
      paper: '#1a2332',   // Tarjetas de datos y paneles
    },
    primary: {
      main: '#3b82f6',    // Azul de control
    },
    success: {
      main: '#22c55e',    // Funcionamiento nominal
    },
    warning: {
      main: '#f59e0b',    // Degradados / Límites excedidos leves
    },
    error: {
      main: '#ef4444',    // Fallas críticas de hardware / Desconexión
    },
    text: {
      primary: '#e2e8f0', // Lectura principal
      secondary: '#94a3b8', // Metadatos, labels y unidades
    },
  },
  typography: {
    fontFamily: '"JetBrains Mono", "Roboto Mono", "SF Mono", monospace',
    h5: { fontWeight: 700, letterSpacing: '-0.025em' },
    h6: { fontWeight: 600, letterSpacing: '-0.015em' },
    subtitle2: { fontWeight: 500 },
    body2: { lineHeight: 1.6 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1a2332',
          border: '1px solid #2d3b50',
          borderRadius: 8,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1a2332',
          borderBottom: '1px solid #2d3b50',
        },
      },
    },
  },
});