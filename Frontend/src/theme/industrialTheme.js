import { createTheme } from '@mui/material/styles';

export const industrialTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f1419', // Fondo SCADA principal
      paper: '#1a2332',   // Fondo de tarjetas y paneles
    },
    primary: {
      main: '#3b82f6',    // Azul SCADA para acciones de nivel 1
    },
    success: {
      main: '#22c55e',    // Estado nominal/activo
    },
    warning: {
      main: '#f59e0b',    // Fuera de rango leve o degradado
    },
    error: {
      main: '#ef4444',    // Alarma activa, desconexión
    },
    text: {
      primary: '#e2e8f0',  // Lectura principal de datos
      secondary: '#94a3b8',// Etiquetas y metadatos
    },
  },
  typography: {
    fontFamily: '"JetBrains Mono", "Roboto Mono", "Fira Code", monospace',
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.05em' },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h6: { fontSize: '1rem', fontWeight: 600 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.75rem' },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 8,
          border: '1px solid #2d3748',
        },
      },
    },
  },
});