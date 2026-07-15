import React, { useState } from 'react';
import { ThemeProvider, Box, CssBaseline, AppBar, Toolbar, Typography, Button, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, BottomNavigation, BottomNavigationAction, Paper, useMediaQuery } from '@mui/material';
import { LayoutDashboard, CloudSun, Zap, Sliders, ShieldAlert, LogOut, LogIn } from 'lucide-react';
import { theme } from './theme';
import { AuthProvider, useAuth } from './context/AuthContext'; // Mantén tu importación original de AuthContext
import { TelemetryProvider, useTelemetry } from './context/TelemetryContext';

// Importación de las Vistas (Desarrollaremos la DashboardView primero, deja las otras declaradas de forma básica temporalmente)
import { DashboardView } from './views/DashboardView';
import { ControlView } from './views/ControlView'; // Asegura tener placeholders vacíos o tus vistas actuales
import { LoginView } from './views/LoginView';

const viewsList = [
  { id: 0, label: 'Dashboard', icon: <LayoutDashboard size={20} />, component: <DashboardView /> },
  { id: 1, label: 'Clima', icon: <CloudSun size={20} />, component: <Box sx={{ p: 3 }}>[Vista Clima - Siguiente Entrega]</Box> },
  { id: 2, label: 'Energía', icon: <Zap size={20} />, component: <Box sx={{ p: 3 }}>[Vista Energía - Siguiente Entrega]</Box> },
  { id: 3, label: 'Controles', icon: <Sliders size={20} />, component: <ControlView /> },
  { id: 4, label: 'Diagnóstico', icon: <ShieldAlert size={20} />, component: <Box sx={{ p: 3 }}>[Vista Diagnóstico - Siguiente Entrega]</Box> },
];

const DRAWER_WIDTH = 240;

function LayoutShell() {
  const [activeTab, setActiveTab] = useState(0);
  const { user, role, logout } = useAuth();
  const { latestReading } = useTelemetry();
  
  const isDesktop = useMediaQuery('(min-width:1200px)');
  const isMobile = useMediaQuery('(max-width:767px)');

  // Evaluación del estado de conexión inferida por antigüedad de la última telemetría
  const getConnectionStatus = () => {
    if (!latestReading || !latestReading.created_at) return { label: 'Desconocido', color: 'text.secondary' };
    const diffMin = (new Date() - new Date(latestReading.created_at)) / 1000 / 60;
    
    if (diffMin < 10) return { label: 'ONLINE', color: 'success.main' };
    if (diffMin >= 10 && diffMin <= 15) return { label: 'DEGRADADO', color: 'warning.main' };
    return { label: 'OFFLINE', color: 'error.main' };
  };

  const status = getConnectionStatus();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      
      {/* SIDEBAR PARA DESKTOP / TABLETS */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box', bgcolor: 'background.paper', borderRight: '1px solid #2d3b50' },
          }}
        >
          <Toolbar>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
              🍄 Orellanas IoT
            </Typography>
          </Toolbar>
          <Box sx={{ overflow: 'auto', px: 2 }}>
            <List>
              {viewsList.map((view) => (
                <ListItem key={view.id} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={activeTab === view.id}
                    onClick={() => setActiveTab(view.id)}
                    sx={{
                      borderRadius: 1,
                      '&.Mui-selected': { bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.main' } },
                    }}
                  >
                    <ListItemIcon sx={{ color: activeTab === view.id ? '#fff' : 'text.secondary', minWidth: 40 }}>
                      {view.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={view.label} 
                      primaryTypographyProps={{ fontSize: '14px', fontWeight: activeTab === view.id ? 700 : 500 }} 
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </Drawer>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <Box sx={{ flexGrow: 1, pb: isMobile ? 10 : 2, display: 'flex', flexDirection: 'column' }}>
        
        {/* APP BAR (Header) */}
        <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid #2d3b50', bgcolor: 'background.paper' }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            {isMobile && (
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>
                Orellanas IoT 🍄
              </Typography>
            )}
            
            {/* Status de Conexión Inferido */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: status.color }} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: status.color }}>
                {status.label}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  (Inferido por última telemetría)
                </Typography>
              )}
            </Box>

            {/* Gestión de Sesión */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {user && !isMobile && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  User: <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{user.email}</span> ({role})
                </Typography>
              )}
              {user ? (
                <Button 
                  color="error" 
                  variant="outlined" 
                  size="small" 
                  startIcon={<LogOut size={14} />} 
                  onClick={logout}
                >
                  {!isMobile && 'Salir'}
                </Button>
              ) : (
                <Button 
                  color="primary" 
                  variant="contained" 
                  size="small" 
                  startIcon={<LogIn size={14} />} 
                  onClick={() => setActiveTab(3)} // Redirigir a Controles donde vive el login
                >
                  {!isMobile && 'Acceso'}
                </Button>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        {/* CONTENEDOR DE LA VISTA SELECCIONADA */}
        <Box sx={{ flexGrow: 1 }}>
          {viewsList[activeTab].component}
        </Box>
      </Box>

      {/* BOTTOM NAV PARA DISPOSITIVOS MÓVILES */}
      {isMobile && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, borderTop: '1px solid #2d3b50' }} elevation={3}>
          <BottomNavigation
            showLabels
            value={activeTab}
            onChange={(event, newValue) => setActiveTab(newValue)}
            sx={{ bgcolor: 'background.paper' }}
          >
            {viewsList.map((view) => (
              <BottomNavigationAction
                key={view.id}
                label={view.label}
                icon={view.icon}
                sx={{
                  color: 'text.secondary',
                  '&.Mui-selected': { color: 'primary.main' },
                }}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <TelemetryProvider>
          <LayoutShell />
        </TelemetryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}