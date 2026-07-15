import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Button, Alert, Divider, CircularProgress, Grid } from '@mui/material';
import { Save, AlertTriangle } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { supabase } from '../supabaseClient';
import { ESPECIE_LABEL, FASE_LABEL } from '../services/supabaseService';

export const ControlView = () => {
  const { controlState, refetch } = useTelemetry();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (controlState) {
      setForm({
        especie: controlState.especie ?? 0,
        fase: controlState.fase ?? 1,
        set_compresor: controlState.set_compresor ?? 1,
        permiso_nube_humidificador: controlState.permiso_nube_humidificador ?? 1,
        permiso_nube_co2: controlState.permiso_nube_co2 ?? 1,
        permiso_nube_luz: controlState.permiso_nube_luz ?? 1,
      });
    }
  }, [controlState]);

  if (!form) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
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
      alert('Parámetros de control real inyectados a Supabase.');
    } catch (err) {
      console.error(err);
      alert('Falla en la inyección de control: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 650, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 3 }}>CONSIGNAS DE CONTROL REAL (NIVEL 1)</Typography>

      <Alert severity="warning" sx={{ mb: 3, border: '1px solid #f59e0b' }} icon={<AlertTriangle />}>
        <strong>ADVERTENCIA DE SEGURIDAD:</strong> Estas acciones modifican de inmediato las salidas físicas del ESP32 en el cultivo. Asegúrate de configurar las políticas RLS de Supabase en la tabla <code>controles</code>.
      </Alert>

      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontSize: '0.9rem', fontWeight: 'bold', color: 'primary.main' }}>
              SELECCIÓN DE PERFIL DE BIOMASA (El firmware aplicará setpoints embebidos)
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Especie</InputLabel>
                  <Select value={form.especie} label="Especie" onChange={(e) => handleChange('especie', Number(e.target.value))}>
                    <MenuItem value={0}>{ESPECIE_LABEL[0]}</MenuItem>
                    <MenuItem value={1}>{ESPECIE_LABEL[1]}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Fase del Cultivo</InputLabel>
                  <Select value={form.fase} label="Fase del Cultivo" onChange={(e) => handleChange('fase', Number(e.target.value))}>
                    <MenuItem value={0}>{FASE_LABEL[0]}</MenuItem>
                    <MenuItem value={1}>{FASE_LABEL[1]}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              * Al cambiar la especie o fase, el firmware forzará sus límites internos en la EEPROM.
            </Typography>
          </Box>

          <Divider sx={{ borderColor: '#2d3748' }} />

          <Box>
            <Typography variant="h6" sx={{ mb: 1.5, fontSize: '0.9rem', fontWeight: 'bold', color: 'primary.main' }}>
              VETOS / PERMISOS DE ACTUACIÓN DESDE LA NUBE
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControlLabel 
                control={<Switch checked={!!form.set_compresor} onChange={(e) => handleChange('set_compresor', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Compresor" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_humidificador} onChange={(e) => handleChange('permiso_nube_humidificador', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Humidificador" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_co2} onChange={(e) => handleChange('permiso_nube_co2', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Habilitar Extractor CO₂" 
              />
              <FormControlLabel 
                control={<Switch checked={!!form.permiso_nube_luz} onChange={(e) => handleChange('permiso_nube_luz', e.target.checked ? 1 : 0)} color="primary" />} 
                label="Permitir Fotoperiodo" 
              />
            </Box>
          </Box>

          <Divider sx={{ borderColor: '#2d3748' }} />

          <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.02)', p: 1.5, borderRadius: 1, border: '1px solid #2d3748' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
              ESTADO DEL LAZO DE TEMPERATURA (DERIVADO POR FIRMWARE)
            </Typography>
            <Typography variant="body2">
              Setpoint de Temperatura: <strong>{controlState?.setpoint_temp ? `${controlState.setpoint_temp}°C` : 'N/A'}</strong>.
            </Typography>
          </Box>

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
        </CardContent>
      </Card>
    </Box>
  );
};