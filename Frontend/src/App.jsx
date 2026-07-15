import React, { useState } from 'react';
import { Box, AppBar, Toolbar, Typography, Button, Container, Tab, Tabs } from '@mui/material';
import { LayoutDashboard, Sliders, LogIn, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TelemetryProvider } from './context/TelemetryContext'; // 👈 IMPORTANTE: Recuperamos tu proveedor de datos
import { DashboardView } from './views/DashboardView';
import { ControlView } from './views/ControlView';
import { LoginView } from './views/LoginView';

// 1. Este componente HIJO puede consumir la sesión sin romper React
function AppContent() {
  const { user, role, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(0); // 0 = Dashboard, 1 = Controles, 2 = Login

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc' }}>
      
      {/* BARRA SUPERIOR (HEADER) */}
      <AppBar position="static" sx={{ bgcolor: '#1e293b', backgroundImage: 'none', borderBottom: '1px solid #334155' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 800, tracking: 'tight' }}>
            Orellanas Data IoT 🍄
          </Typography>

          {/* Información del usuario conectado */}
          {user && (
            <Typography variant="body2" sx={{ mr: 2, color: '#94a3b8' }}>
              Operador: <strong style={{ color: '#f8fafc' }}>{user.email}</strong> (<i>{role}</i>)
            </Typography>
          )}

          {/* Botón dinámico de acceso rápido */}
          {user ? (
            <Button 
              color="error" 
              variant="outlined" 
              startIcon={<LogOut size={16} />}
              onClick={() => {
                logout();
                setActiveTab(0); // Volver al dashboard público al salir
              }}
              size="small"
            >
              Salir
            </Button>
          ) : (
            activeTab !== 2 && (
              <Button 
                color="primary" 
                variant="contained" 
                startIcon={<LogIn size={16} />}
                onClick={() => setActiveTab(2)}
                size="small"
              >
                Acceder
              </Button>
            )
          )}
        </Toolbar>
      </AppBar>

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <Box sx={{ borderBottom: 1, borderColor: '#334155', bgcolor: '#1e293b' }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          textColor="inherit"
          indicatorColor="primary"
          centered
        >
          <Tab icon={<LayoutDashboard size={18} />} label="Dashboard" iconPosition="start" />
          <Tab icon={<Sliders size={18} />} label="Controles" iconPosition="start" />
          {!user && <Tab icon={<LogIn size={18} />} label="Acceso" iconPosition="start" />}
        </Tabs>
      </Box>

      {/* VISTAS CONDICIONALES */}
      <Container sx={{ mt: 4, pb: 4 }}>
        
        {/* Pestaña 0: Telemetría (Pública) */}
        {activeTab === 0 && <DashboardView />}
        
        {/* Pestaña 1: Configuración de Variables (Protegida) */}
        {activeTab === 1 && <ControlView />}
        
        {/* Pestaña 2: Formulario de Autenticación */}
        {activeTab === 2 && !user && (
          <Box>
            <LoginView />
            <Button 
              fullWidth 
              onClick={() => setActiveTab(0)} 
              sx={{ mt: 2, color: '#94a3b8', textTransform: 'none' }}
            >
              Volver como Invitado (Solo Lectura)
            </Button>
          </Box>
        )}
        
        {/* Redirección visual automática al iniciar sesión exitosamente */}
        {activeTab === 2 && user && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>¡Sesión Iniciada!</Typography>
            <Typography sx={{ color: '#94a3b8', mb: 4 }}>Ahora tienes privilegios para modificar los actuadores.</Typography>
            <Button variant="contained" size="large" onClick={() => setActiveTab(1)}>
              Ir al Panel de Control
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
}

// 2. El componente PADRE define el Proveedor y llama al hijo
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}