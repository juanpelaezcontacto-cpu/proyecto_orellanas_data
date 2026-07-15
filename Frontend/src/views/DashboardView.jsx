import React from 'react';
import { Grid, Box, Typography, Card, CardContent, CircularProgress, Button } from "@mui/material";
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { 
  Wifi, WifiOff, RefreshCw, Thermometer, Droplets, Wind, Zap, Lock, Unlock, ShieldAlert
} from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { ESPECIE_LABEL, FASE_LABEL } from '../services/supabaseService';
import { AlarmPanel } from '../components/AlarmPanel';

export const DashboardView = () => {
  const { data, loading, lastUpdate, analysis, refetch } = useTelemetry();

  if (loading && data.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection: 'column', gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography variant="body2" color="text.secondary">Adquiriendo matriz de telemetría unificada...</Typography>
      </Box>
    );
  }

  const latest = data[data.length - 1] || {};

  // Conexión visual
  const connState = analysis.connection;
  const connColor = connState === 'online' ? 'success.main' : connState === 'degraded' ? 'warning.main' : 'error.main';
  const connText = connState === 'online' ? 'ONLINE' : connState === 'degraded' ? 'DEGRADADO (SISTEMA CON RETRASO)' : 'DISPOSITIVO OFFLINE';

  // Derivar deltas
  const tempDelta = latest.temp_sup !== null && latest.temp_inf !== null ? (latest.temp_sup - latest.temp_inf).toFixed(2) : 'N/A';
  const humDelta = latest.hum_sup !== null && latest.hum_inf !== null ? (latest.hum_sup - latest.hum_inf).toFixed(2) : 'N/A';

  // Sparklines Data (Últimas 15 lecturas para rendimiento visual)
  const sparkData = data.slice(-15);

  return (
    <Box>
      {/* Header Informativo */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>PANEL DE MONITOREO Y CONTROL</Typography>
          <Typography variant="body2" color="text.secondary">
            Cámara de Cultivo Remota — Un solo operador. Datos verificados de máquina viva.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Último reporte: {lastUpdate ? lastUpdate.toLocaleTimeString('es-CO') : 'Nunca'}
          </Typography>
          <Button 
            variant="contained" 
            size="small" 
            onClick={refetch} 
            disabled={loading}
            startIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            sx={{ fontWeight: 'bold' }}
          >
            Sincronizar
          </Button>
        </Box>
      </Box>

      {/* Banner de Estado de Conexión Real vs Inferido */}
      <Card sx={{ mb: 3, borderLeft: `5px solid ${latest.created_at ? (connState === 'online' ? '#22c55e' : connState === 'degraded' ? '#f59e0b' : '#ef4444') : '#ef4444'}` }}>
        <CardContent sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', py: '12px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {connState === 'online' ? <Wifi color="#22c55e" /> : <WifiOff color="#ef4444" />}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 'bold', letterSpacing: 1 }}>
                ESTADO DEL HARDWARE (INFERIDO POR TELEMETRÍA RECIENTE)
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 'bold', color: connColor }}>
                {connText} {latest.created_at && `(Última ráfaga: ${new Date(latest.created_at).toLocaleTimeString('es-CO')})`}
              </Typography>
            </Box>
          </Box>
          
          {/* Perfil vigente real detectado en el microcontrolador */}
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, mt: { xs: 1, sm: 0 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 'bold' }}>
              PERFIL EN EJECUCIÓN (EMBEDIDO EN DISPOSITIVO)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              {latest.especie_actual !== null ? ESPECIE_LABEL[latest.especie_actual] : 'Desconocido'} 
              {' — '} 
              {latest.fase_actual !== null ? FASE_LABEL[latest.fase_actual] : 'Desconocido'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Consola de Alarmas Críticas */}
      <AlarmPanel alarms={analysis.alarms} />

      {/* Grid SCADA de KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* KPI 1: Temperatura Inferior (Zona de Lazo) */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ position: 'relative', overflow: 'hidden' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>T. INFERIOR (CONTROL)</Typography>
                <Thermometer size={16} color="#3b82f6" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                {latest.temp_inf !== null ? `${latest.temp_inf.toFixed(1)}°C` : 'N/A'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Setpoint Real: {latest.setpoint_temp !== null ? `${latest.setpoint_temp}°C` : 'N/A'} | ΔT Vertical: {tempDelta}°C
              </Typography>
              {/* Sparkline de Tendencia */}
              <Box sx={{ height: 40, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <Area type="monotone" dataKey="temp_inf" stroke="#3b82f6" fill="rgba(59, 130, 246, 0.1)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 2: Humedad Inferior */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ position: 'relative', overflow: 'hidden' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>H. RELATIVA (CONTROL)</Typography>
                <Droplets size={16} color="#22c55e" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                {latest.hum_inf !== null ? `${latest.hum_inf.toFixed(1)}%` : 'N/A'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Rango: {latest.hum_setpoint_min ?? 'N/A'}-{latest.hum_setpoint_max ?? 'N/A'}% | ΔH Vertical: {humDelta}%
              </Typography>
              <Box sx={{ height: 40, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <Area type="monotone" dataKey="hum_inf" stroke="#22c55e" fill="rgba(34, 197, 94, 0.1)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 3: CO2 Inferior */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ position: 'relative', overflow: 'hidden' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>CONCENTRACIÓN CO₂</Typography>
                <Wind size={16} color="#f59e0b" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                {latest.co2 !== null ? `${latest.co2} ppm` : 'N/A'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Límite: {latest.co2_setpoint_max ?? 'N/A'} ppm | Estrés: {analysis.co2Stress} ppm-h
              </Typography>
              <Box sx={{ height: 40, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <Area type="monotone" dataKey="co2" stroke="#f59e0b" fill="rgba(245, 158, 11, 0.1)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 4: Potencia Activa PZEM */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ position: 'relative', overflow: 'hidden' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>POTENCIA ACTIVA</Typography>
                <Zap size={16} color="#a855f7" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                {latest.potencia_w !== null ? `${latest.potencia_w} W` : 'N/A'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Consumo: {latest.energia_kwh !== null ? `${latest.energia_kwh.toFixed(3)} kWh` : 'N/A'}
              </Typography>
              <Box sx={{ height: 40, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <Area type="monotone" dataKey="potencia_w" stroke="#a855f7" fill="rgba(168, 85, 247, 0.1)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Sección rápida de estado de los Actuadores en Campo */}
      <Card sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>ESTADO DE ACTUADORES FÍSICOS (SITUACIÓN ACTUAL)</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box sx={{ p: 2, bgcolor: latest.compresor === 1 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.02)', borderRadius: 1, border: '1px solid', borderColor: latest.compresor === 1 ? 'success.main' : '#2d3748', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>COMPRESOR</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 'bold', color: latest.compresor === 1 ? 'success.main' : 'text.secondary' }}>
                {latest.compresor === 1 ? 'ON (ACTIVO)' : 'OFF'}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box sx={{ p: 2, bgcolor: latest.humidificador === 1 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.02)', borderRadius: 1, border: '1px solid', borderColor: latest.humidificador === 1 ? 'success.main' : '#2d3748', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>HUMIDIFICADOR</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 'bold', color: latest.humidificador === 1 ? 'success.main' : 'text.secondary' }}>
                {latest.humidificador === 1 ? 'ON (ACTIVO)' : 'OFF'}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box sx={{ p: 2, bgcolor: latest.luz_fotoperiodo_on === 1 ? 'rgba(3b, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)', borderRadius: 1, border: '1px solid', borderColor: latest.luz_fotoperiodo_on === 1 ? 'primary.main' : '#2d3748', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>FOTOPERIODO (LUZ)</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 'bold', color: latest.luz_fotoperiodo_on === 1 ? 'primary.main' : 'text.secondary' }}>
                {latest.luz_fotoperiodo_on === 1 ? 'ON (FOTO)' : 'OFF (SINOA)'}
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box sx={{ p: 2, bgcolor: latest.puerta === 1 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', borderRadius: 1, border: '1px solid', borderColor: latest.puerta === 1 ? 'error.main' : 'success.main', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>PUERTA ACCESO</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 'bold', color: latest.puerta === 1 ? 'error.main' : 'success.main' }}>
                {latest.puerta === 1 ? 'ABIERTA' : 'CERRADA'}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>
    </Box>
  );
};