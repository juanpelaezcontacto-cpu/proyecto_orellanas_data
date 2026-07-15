import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Button, Alert, Divider, CircularProgress, Grid } from '@mui/material';
import { Save, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { useAuth } from '../context/AuthContext'; 
import { supabase } from "../supabaseClient"; 
import { ESPECIE_LABEL, FASE_LABEL } from '../services/supabaseService';
import { LoginView } from './LoginView'; // Integración de seguridad directa

export const ControlView = () => {
  const { controlState, refetch } = useTelemetry();
  const { role, user } = useAuth(); 
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const hasWritePermission = user && (role === 'operator' || role === 'admin');

  // Inicialización controlada (Previene que la telemetría en tiempo real borre lo que digita el operario)
  useEffect(() => {
    if (controlState && !isInitialized) {
      setForm({
        especie: controlState.especie ?? 0,
        fase: controlState.fase ?? 1,
        set_compresor: controlState.set_compresor ?? 1,
        permiso_nube_humidificador: controlState.permiso_nube_humidificador ?? 1,
        permiso_nube_co2: controlState.permiso_nube_co2 ?? 1,
        permiso_nube_luz: controlState.permiso_nube_luz ?? 1,
      });
      setIsInitialized(true);
    }
  }, [controlState, isInitialized]);

  const handleSyncWithHardware = () => {
    setIsInitialized(false); // Fuerza recarga del estado actual de la BD
  };

  if (!user) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert severity="info" sx={{ mb: 3, mx: 'auto', maxWidth: 450, border: '1px solid #0284c7' }} icon={<ShieldAlert />}>
          <strong>ACCESO RESTRINGIDO:</strong> Se requiere autenticación de operador para inyectar consignas de control físico en el hardware.
        </Alert>
        <LoginView />
      </Box>
    );
  }

  if (!form) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleChange = (field, value) => {
    if (!hasWritePermission) return; 
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!hasWritePermission) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('controles')
        .update({
          especie: form.especie,
          fase: form.fase,
          set_compresor: form.set_compresor ? 1 : 0,
          permiso_nube_humidificador: form.permiso_nube_humidificador ? 1 : 0,
          permiso_nube_co2: form.permiso_nube_co2 ? 1 : 0,
          permiso_nube_luz: form.permiso_nube_luz ? 1 : 0
        })
        .eq('id', 1);

      if (error) throw error;
      await refetch();
      alert('Parámetros de control real inyectados a Supabase con éxito.');
    } catch (err) {
      console.error(err);
      alert('Falla en la inyección de control: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 650, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
          CONSIGNAS DE CONTROL REAL (NIVEL 1)
        </Typography>
        <Button 
          variant="outlined" 
          size="small" 
          startIcon={<RefreshCw size={14} />} 
          onClick={handleSyncWithHardware}
          disabled={saving}
        >
          Sincronizar
        </Button>
      </Box>

      {!hasWritePermission ? (
        <Alert severity="warning" sx={{ mb: 3, border: '1px solid #ef4444' }} icon={<ShieldAlert />}>
          <strong>ROL INSUFICIENTE ({role}):</strong> Tu cuenta de usuario no posee privilegios de escritura sobre los actuadores del ESP32.
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 3, border: '1px solid #22c55e' }} icon={<AlertTriangle />}>
          <strong>MODO OPERADOR ACTIVO:</strong> Autenticado como <code>{user.email}</code>. Las modificaciones se transmitirán inmediatamente al hardware.
        </Alert>
      )}

      <Card sx={{ opacity: hasWritePermission ? 1 : 0.8 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontSize: '0.9rem', fontWeight: 'bold', color: 'primary.main', fontFamily: 'monospace' }}>
              SELECCIÓN DE PERFIL DE BIOMASA
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" disabled={!hasWritePermission}>
                  <InputLabel>Especie</InputLabel>
                  <Select value={form.especie} label="Especie" onChange={(e) => handleChange('especie', Number(e.target.value))}>
                    <MenuItem value={0}>{ESPECIE_LABEL[0]}</MenuItem>
                    <MenuItem value={1}>{ESPECIE_LABEL[1]}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" disabled={!hasWritePermission}>
                  <InputLabel>Fase del Cultivo</InputLabel>
                  <Select value={form.fase} label="Fase del Cultivo" onChange={(e) => handleChange('fase', Number(e.target.value))}>
                    <MenuItem value={0}>{FASE_LABEL[0]}</MenuItem>
                    <MenuItem value={1}>{FASE_LABEL[1]}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderColor: '#2d3b50' }} />

          <Box>
            <Typography variant="h6" sx={{ mb: 1.5, fontSize: '0.9rem', fontWeight: 'bold', color: 'primary.main', fontFamily: 'monospace' }}>
              VETOS / PERMISOS DE ACTUACIÓN DESDE LA NUBE
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <FormControlLabel 
                control={<Switch checked={!!form.set_compresor} disabled={!hasWritePermission} onChange={(e) => handleChange('set_compresor', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Compresor" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_humidificador} disabled={!hasWritePermission} onChange={(e) => handleChange('permiso_nube_humidificador', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Humidificador" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_co2} disabled={!hasWritePermission} onChange={(e) => handleChange('permiso_nube_co2', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Extractor CO₂" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_luz} disabled={!hasWritePermission} onChange={(e) => handleChange('permiso_nube_luz', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Permitir Fotoperiodo" 
              />
            </Box>
          </Box>

          {hasWritePermission && (
            <>
              <Divider sx={{ borderColor: '#2d3b50' }} />
              <Button 
                variant="contained" 
                color="primary" 
                size="large" 
                disabled={saving}
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <Save />}
                onClick={handleSave}
                sx={{ fontWeight: 'bold', mt: 1 }}
              >
                Transmitir Cambios Reales al Hardware
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};