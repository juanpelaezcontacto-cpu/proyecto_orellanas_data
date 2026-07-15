import React, { useState } from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, Divider, 
  IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText, useMediaQuery, BottomNavigation, BottomNavigationAction, Paper
} from '@mui/material';
import { 
  Menu as MenuIcon, LayoutDashboard, Thermometer, Zap, Settings, Activity, AlertCircle 
} from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';

const drawerWidth = 240;

export const Layout = ({ children, activeTab, setActiveTab }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('lg'));
  const isTablet = useMediaQuery((theme) => theme.breakpoints.between('md', 'lg'));
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const { analysis } = useTelemetry();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'clima', label: 'Clima', icon: <Thermometer size={20} /> },
    { id: 'energia', label: 'Energía', icon: <Zap size={20} /> },
    { id: 'control', label: 'Control', icon: <Settings size={20} /> },
    { id: 'diagnostico', label: 'Diagnóstico', icon: <Activity size={20} /> },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ borderBottom: '1px solid #2d3748', justifyContent: 'center' }}>
        <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 'bold', letterSpacing: '1px' }}>
          CAMARA_01 SCADA
        </Typography>
      </Toolbar>
      <List sx={{ flexGrow: 1, pt: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.id} disablePadding>
            <ListItemButton 
              selected={activeTab === item.id}
              onClick={() => { setActiveTab(item.id); setMobileOpen(false); }}
              sx={{
                mx: 1, borderRadius: 1,
                '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', borderLeft: '3px solid #3b82f6' }
              }}
            >
              <ListItemIcon sx={{ color: activeTab === item.id ? 'primary.main' : 'text.secondary', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: activeTab === item.id ? 700 : 500 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 2, borderTop: '1px solid #2d3748', textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Modo Monitoreo Único
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header en vista móvil/tablet */}
      {!isDesktop && (
        <AppBar position="fixed" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #2d3748', boxShadow: 'none' }}>
          <Toolbar>
            <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
              CAMARA_01 — Cultivo
            </Typography>
            {analysis.alarms.length > 0 && <AlertCircle color="#ef4444" size={20} />}
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar de Escritorio */}
      {isDesktop && (
        <Drawer variant="permanent" open sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, bgcolor: 'background.paper', borderRight: '1px solid #2d3748' } }}>
          {drawerContent}
        </Drawer>
      )}

      {/* Sidebar para Tablet colapsable/Mobile Drawer */}
      {!isDesktop && (
        <Drawer variant="temporary" open={mobileOpen} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth, bgcolor: 'background.paper' } }}>
          {drawerContent}
        </Drawer>
      )}

      {/* Contenedor Principal de Vistas */}
      <Box component="main" sx={{ flexGrow: 1, p: 3, pb: isMobile ? 10 : 3, mt: !isDesktop ? 8 : 0, width: '100%' }}>
        {children}
      </Box>

      {/* Navegación inferior en móvil */}
      {isMobile && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100, borderTop: '1px solid #2d3748' }} elevation={3}>
          <BottomNavigation value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ bgcolor: 'background.paper' }}>
            {menuItems.map(item => (
              <BottomNavigationAction key={item.id} value={item.id} icon={item.icon} label={item.label} sx={{ color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' } }} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
};