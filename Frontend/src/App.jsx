import React, { useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { TelemetryProvider } from './context/TelemetryContext';
import { industrialTheme } from './theme/industrialTheme';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';

// Vistas
import { DashboardView } from './views/DashboardView';
import { ClimaView } from './views/ClimaView';
import { EnergiaView } from './views/EnergiaView';
import { ControlView } from './views/ControlView';
import { DiagnosticoView } from './views/DiagnosticoView';

function App() {
  return (
    <AuthProvider>
      {/* Tu estructura de navegación actual, barra lateral, etc. */}
    </AuthProvider>
  );
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'clima':
        return <ClimaView />;
      case 'energia':
        return <EnergiaView />;
      case 'control':
        return <ControlView />;
      case 'diagnostico':
        return <DiagnosticoView />;
      default:
        return <DashboardView />;
    }
  };
  
  return (
    <ThemeProvider theme={industrialTheme}>
      <CssBaseline />
      <TelemetryProvider>
        <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
          {renderView()}
        </Layout>
      </TelemetryProvider>
    </ThemeProvider>
  );
}

export default App;