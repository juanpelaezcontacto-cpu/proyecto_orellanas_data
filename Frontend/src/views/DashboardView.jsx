import React, { useMemo } from 'react';
import { Box, Grid, Card, CardContent, Typography, Alert, AlertTitle, CircularProgress, Tooltip, Divider } from '@mui/material';
import { Thermometer, Droplet, Wind, Activity, Bell, ShieldCheck, ThermometerSnowflake, Lightbulb, Lock, HelpCircle, Zap, Clock } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

// Codificación dictada por el hardware
const ESPECIE_LABEL = { 0: 'Pleurotus ostreatus (Orellana)', 1: 'Hericium erinaceus (Melena de León)' };
const FASE_LABEL = { 0: 'Incubación', 1: 'Fructificación' };

export function DashboardView() {
  const { latestReading, historicalData, loading } = useTelemetry();

  // 1. Motor de inferencia de conexión (Nivel 3)
  const connectionInfo = useMemo(() => {
    if (!latestReading) return { label: 'SIN DATOS', color: '#ef4444', minutes: null };
    const lastTime = new Date(latestReading.created_at).getTime();
    const now = Date.now();
    const diffMs = now - lastTime;
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

    if (diffMinutes < 10) {
      return { label: 'ONLINE', color: '#22c55e', minutes: diffMinutes };
    } else if (diffMinutes <= 15) {
      return { label: 'DEGRADADO', color: '#f59e0b', minutes: diffMinutes };
    } else {
      return { label: 'OFFLINE', color: '#ef4444', minutes: diffMinutes };
    }
  }, [latestReading]);

  // 2. Cómputo de analíticas avanzadas
  const analytics = useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      return { co2Stress: 0, humSwitches: 0, compSwitches: 0, tempGrad: 0, humGrad: 0 };
    }

    const recent = historicalData.slice(-20);

    // A. Dosis de Estrés por CO2 (S_CO2)
    const co2Stress = recent.reduce((acc, curr) => {
      const limit = curr.co2_setpoint_max ?? 900;
      const excess = curr.co2_inf - limit;
      return acc + (excess > 0 ? excess : 0);
    }, 0);

    // B. Conmutaciones de Actuadores
    let humSwitches = 0;
    let compSwitches = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].humidificador !== recent[i - 1].humidificador) humSwitches++;
      if (recent[i].compresor !== recent[i - 1].compresor) compSwitches++;
    }

    // C. Gradiente Vertical
    const latest = latestReading || recent[recent.length - 1];
    const tempGrad = (latest.temp_int_sup ?? 0) - (latest.temp_int_inf ?? 0);
    const humGrad = (latest.hum_int_sup ?? 0) - (latest.hum_int_inf ?? 0);

    return { co2Stress, humSwitches, compSwitches, tempGrad, humGrad };
  }, [historicalData, latestReading]);

  // 3. Sistema de alarmas en tiempo reals
  const activeAlarms = useMemo(() => {
    if (!latestReading) return [];
    const alarms = [];

    if (latestReading.err_max > 0) alarms.push({ title: 'ERR_MAX', desc: 'Falla del sensor de temperatura máxima.', type: 'error' });
    if (latestReading.err_sht_ext > 0) alarms.push({ title: 'ERR_SHT_EXT', desc: 'Falla del sensor SHT exterior.', type: 'error' });
    if (latestReading.err_sht_int > 0) alarms.push({ title: 'ERR_SHT_INT', desc: 'Falla del sensor SHT interior.', type: 'error' });
    if (latestReading.err_scd > 0) alarms.push({ title: 'ERR_SCD30', desc: 'Falla de comunicación con el sensor de CO2.', type: 'error' });
    if (latestReading.err_pzem > 0) alarms.push({ title: 'ERR_PZEM', desc: 'Falla del módulo de monitoreo energético.', type: 'error' });

    if (latestReading.temp_comp > 55) {
      alarms.push({ title: 'TEMP_COMP_CRITICA', desc: `Compresor a ${latestReading.temp_comp}°C (Máx 55°C).`, type: 'error' });
    }
    if (latestReading.err_luz === true) {
      alarms.push({ title: 'ERR_LUZ_ACTUADOR', desc: 'Falla de consumo/operación detectada en la iluminación.', type: 'error' });
    }
    if (latestReading.co2_inf > latestReading.co2_setpoint_max) {
      alarms.push({ title: 'EXCESO_CO2', desc: `CO2 actual (${latestReading.co2_inf} ppm) supera el setpoint del perfil (${latestReading.co2_setpoint_max} ppm).`, type: 'warning' });
    }
    if (latestReading.hum_int_inf < latestReading.hum_setpoint_min || latestReading.hum_int_inf > latestReading.hum_setpoint_max) {
      alarms.push({ title: 'HUMEDAD_FUERA_DE_RANGO', desc: `Humedad actual (${latestReading.hum_int_inf}%) fuera de límites del perfil.`, type: 'warning' });
    }
    if (latestReading.puerta === 1) {
      alarms.push({ title: 'PUERTA_ABIERTA', desc: 'La puerta de la cámara se encuentra abierta.', type: 'warning' });
    }
    if (latestReading.hora_sincronizada === false) {
      alarms.push({ title: 'NTP_DESINCRONIZADO', desc: 'El reloj del hardware no está sincronizado con internet.', type: 'error' });
    }

    if (analytics.humSwitches > 25) {
      alarms.push({ title: 'FATIGA_HUMIDIFICADOR', desc: `Ciclos excesivos (${analytics.humSwitches}) en la ventana actual.`, type: 'error' });
    }
    if (analytics.compSwitches > 10) {
      alarms.push({ title: 'FATIGA_COMPRESOR', desc: `Ciclos de conmutación elevados (${analytics.compSwitches}) en el compresor.`, type: 'error' });
    }

    return alarms;
  }, [latestReading, analytics]);

  // 4. Datos estructurados para mini-gráficos SCADA
  const sparklineData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return { temp: [], hum: [], co2: [] };
    const recent = historicalData.slice(-25); // Ventana de 25 muestras para mejor resolución visual
    return {
      temp: recent.map(d => ({ value: d.temp_int_inf })),
      hum: recent.map(d => ({ value: d.hum_int_inf })),
      co2: recent.map(d => ({ value: d.co2_inf }))
    };
  }, [historicalData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2, bgcolor: '#0f1419', minHeight: '80vh' }}>
        <CircularProgress size={30} sx={{ color: '#3b82f6' }} />
        <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace', letterSpacing: '2px' }}>
          ADQUIRIENDO TELEMETRÍA SUPABASE...
        </Typography>
      </Box>
    );
  }

  if (!latestReading) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#0f1419', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'monospace' }}>
      
      {/* HEADER INDUSTRIAL */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, borderBottom: '1px solid #1a2332', pb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#e2e8f0', letterSpacing: '1px' }}>
            HONGOS-HMI // CONSOLA DE MONITOREO GENERAL
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Clock size={12} color="#94a3b8" />
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                Última telemetría: {new Date(latestReading.created_at).toLocaleTimeString()}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: '#1a2332' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: connectionInfo.color }} />
              <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '0.75rem' }}>
                {connectionInfo.label} ({connectionInfo.minutes}m)
              </Typography>
              <Tooltip title="Inferencia basada en la estampa de tiempo del último registro. No representa señal WiFi física del chip.">
                <HelpCircle size={11} color="#94a3b8" style={{ cursor: 'pointer' }} />
              </Tooltip>
            </Box>
          </Box>
        </Box>

        <Box sx={{ bgcolor: '#1a2332', px: 2, py: 1, borderRadius: '2px', border: '1px solid #2d3b50', textAlign: 'right' }}>
          <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', fontSize: '0.65rem', fontWeight: 'bold' }}>
            PERFIL ACTIVO EN DISPOSITIVO
          </Typography>
          <Typography variant="body2" sx={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '0.8rem' }}>
            {ESPECIE_LABEL[latestReading.especie_actual] || 'No definido'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#e2e8f0', fontSize: '0.7rem' }}>
            Fase: {FASE_LABEL[latestReading.fase_actual] || 'No definida'}
          </Typography>
        </Box>
      </Box>

      {/* ALARMAS CRÍTICAS - Diseño Limpio tipo Consola */}
      {activeAlarms.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 1 }}>
            <Bell color="#ef4444" size={14} />
            <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              MATRIZ DE EVENTOS ACTIVOS ({activeAlarms.length})
            </Typography>
          </Box>
          <Grid container spacing={1}>
            {activeAlarms.map((alarm, idx) => (
              <Grid item xs={12} sm={6} key={idx}>
                <Box sx={{ 
                  px: 2, py: 1, 
                  bgcolor: '#141b25', 
                  borderRadius: '2px', 
                  borderLeft: `3px solid ${alarm.type === 'error' ? '#ef4444' : '#f59e0b'}`,
                  border: '1px solid #1a2332',
                  borderLeftWidth: '3px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: alarm.type === 'error' ? '#ef4444' : '#f59e0b', fontSize: '0.75rem', display: 'block' }}>
                      [{alarm.title}]
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                      {alarm.desc}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* MÉTRICAS FÍSICAS PRINCIPALES CON SPARKLINE INTEGRADO */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        
        {/* Tarjeta Temperatura */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
            {/* Sparkline de Fondo sutil */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', opacity: 0.4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData.temp} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" strokeWidth={1} fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
            <CardContent sx={{ p: 2, position: 'relative', zIndex: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontSize: '0.7rem' }}>
                  <Thermometer size={12} /> TEMP. CÁMARA
                </Typography>
                <Typography variant="caption" sx={{ color: '#3b82f6', fontSize: '0.65rem', border: '1px solid rgba(59, 130, 246, 0.3)', px: 0.5 }}>
                  SET: {latestReading.setpoint_temp != null ? `${latestReading.setpoint_temp}°C` : 'N/A'}
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#e2e8f0', my: 0.5 }}>
                {latestReading.temp_int_inf != null ? `${Number(latestReading.temp_int_inf).toFixed(1)}` : '---'}
                <span style={{ fontSize: '1rem', color: '#94a3b8', marginLeft: '4px' }}>°C</span>
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block' }}>
                Temp. Cúpula (SHT): {latestReading.temp_int_sup != null ? `${Number(latestReading.temp_int_sup).toFixed(1)}°C` : 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Tarjeta Humedad */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
            {/* Sparkline de Fondo sutil */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', opacity: 0.4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData.hum} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <YAxis domain={[0, 100]} hide />
                  <Area type="monotone" dataKey="value" stroke="#22c55e" fill="#22c55e" strokeWidth={1} fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
            <CardContent sx={{ p: 2, position: 'relative', zIndex: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontSize: '0.7rem' }}>
                  <Droplet size={12} /> HUMEDAD RELATIVA
                </Typography>
                <Typography variant="caption" sx={{ color: '#22c55e', fontSize: '0.65rem', border: '1px solid rgba(34, 197, 94, 0.3)', px: 0.5 }}>
                  RANGO: {latestReading.hum_setpoint_min}%-{latestReading.hum_setpoint_max}%
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#e2e8f0', my: 0.5 }}>
                {latestReading.hum_int_inf != null ? `${Number(latestReading.hum_int_inf).toFixed(1)}` : '---'}
                <span style={{ fontSize: '1rem', color: '#94a3b8', marginLeft: '4px' }}>%</span>
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block' }}>
                Humedad Techo: {latestReading.hum_int_sup != null ? `${Number(latestReading.hum_int_sup).toFixed(0)}%` : 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Tarjeta CO2 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
            {/* Sparkline de Fondo sutil */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', opacity: 0.4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData.co2} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <YAxis domain={['dataMin - 100', 'dataMax + 100']} hide />
                  <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="#f59e0b" strokeWidth={1} fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
            <CardContent sx={{ p: 2, position: 'relative', zIndex: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontSize: '0.7rem' }}>
                  <Wind size={12} /> CONCENTRACIÓN CO₂
                </Typography>
                <Typography variant="caption" sx={{ color: '#f59e0b', fontSize: '0.65rem', border: '1px solid rgba(245, 158, 11, 0.3)', px: 0.5 }}>
                  MÁX: {latestReading.co2_setpoint_max} ppm
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#e2e8f0', my: 0.5 }}>
                {latestReading.co2_inf != null ? `${Number(latestReading.co2_inf).toFixed(0)}` : '---'}
                <span style={{ fontSize: '1rem', color: '#94a3b8', marginLeft: '4px' }}>ppm</span>
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block' }}>
                Sensor: SCD30 (Adquisición I2C)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* BLOQUE ANALÍTICO SCADA: Gradientes, Estrés y Fatiga */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px' }}>
            <Box sx={{ bgcolor: '#151c27', px: 2, py: 1, borderBottom: '1px solid #2d3b50' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#3b82f6', letterSpacing: '0.5px' }}>
                &gt;_ ANÁLISIS METROLÓGICO AVANZADO (BUFFER: 20 MUESTRAS)
              </Typography>
            </Box>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={2}>
                
                {/* Dosis de estrés por CO2 */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', border: '1px solid #1a2332', borderRadius: '2px', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontSize: '0.7rem', mb: 1 }}>
                      DOSIS DE ESTRÉS POR CO₂ (S_CO2)
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: analytics.co2Stress > 500 ? '#f59e0b' : '#22c55e', mb: 1 }}>
                      {analytics.co2Stress.toFixed(0)} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>ppm·muestras</span>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block', lineHeight: 1.3 }}>
                      Integral discreta del exceso de CO₂ respecto al límite real del hardware. Mide fatiga metabólica acumulada.
                    </Typography>
                  </Box>
                </Grid>

                {/* Gradiente Microclimático */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', border: '1px solid #1a2332', borderRadius: '2px', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontSize: '0.7rem', mb: 1 }}>
                      ESTRATIFICACIÓN DE AIRE (GRADIENTES)
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1a2332', pb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Gradiente de Temperatura (ΔT):</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: Math.abs(analytics.tempGrad) > 3.0 ? '#f59e0b' : '#e2e8f0' }}>
                          {analytics.tempGrad > 0 ? `+${analytics.tempGrad.toFixed(2)}` : analytics.tempGrad.toFixed(2)}°C
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', pb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Gradiente de Humedad (ΔH):</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: Math.abs(analytics.humGrad) > 10.0 ? '#f59e0b' : '#e2e8f0' }}>
                          {analytics.humGrad > 0 ? `+${analytics.humGrad.toFixed(1)}` : analytics.humGrad.toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block', lineHeight: 1.3 }}>
                      Diferencial entre sensor superior e inferior. Evalúa si la recirculación de ventiladores está homogeneizando la cámara.
                    </Typography>
                  </Box>
                </Grid>

                {/* Ciclos de Actuadores */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', border: '1px solid #1a2332', borderRadius: '2px', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontSize: '0.7rem', mb: 1 }}>
                      FATIGA DE RELÉS (CONMUTACIONES)
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1a2332', pb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Humidificador:</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: analytics.humSwitches > 25 ? '#ef4444' : '#22c55e' }}>
                          {analytics.humSwitches} / 25 ciclos
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', pb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Compresor:</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: analytics.compSwitches > 10 ? '#ef4444' : '#22c55e' }}>
                          {analytics.compSwitches} / 10 ciclos
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', display: 'block', lineHeight: 1.3 }}>
                      Monitorea sobreesfuerzo de relés en la ventana temporal activa para evitar fallas catastróficas del hardware.
                    </Typography>
                  </Box>
                </Grid>

              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ESTADO FÍSICO DE LOS PINES DE SALIDA (Nivel 3) */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px' }}>
            <Box sx={{ bgcolor: '#151c27', px: 2, py: 1, borderBottom: '1px solid #2d3b50' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#3b82f6', letterSpacing: '0.5px' }}>
                &gt;_ ESTADOS LÓGICOS DE ACTUACIÓN (GPIO)
              </Typography>
            </Box>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={1}>
                
                {/* Compresor */}
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    p: 1.5, 
                    bgcolor: latestReading.compresor === 1 ? 'rgba(239, 68, 68, 0.05)' : '#0f1419', 
                    border: `1px solid ${latestReading.compresor === 1 ? '#ef4444' : '#1a2332'}`, 
                    borderRadius: '2px', 
                    textAlign: 'center' 
                  }}>
                    <ThermometerSnowflake size={16} color={latestReading.compresor === 1 ? '#ef4444' : '#94a3b8'} style={{ marginBottom: 4 }} />
                    <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontSize: '0.65rem' }}>COMPRESOR</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: latestReading.compresor === 1 ? '#ef4444' : '#94a3b8' }}>
                      {latestReading.compresor === 1 ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Humidificador */}
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    p: 1.5, 
                    bgcolor: latestReading.humidificador === 1 ? 'rgba(34, 197, 94, 0.05)' : '#0f1419', 
                    border: `1px solid ${latestReading.humidificador === 1 ? '#22c55e' : '#1a2332'}`, 
                    borderRadius: '2px', 
                    textAlign: 'center' 
                  }}>
                    <Droplet size={16} color={latestReading.humidificador === 1 ? '#22c55e' : '#94a3b8'} style={{ marginBottom: 4 }} />
                    <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontSize: '0.65rem' }}>HUMIDIFICADOR</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: latestReading.humidificador === 1 ? '#22c55e' : '#94a3b8' }}>
                      {latestReading.humidificador === 1 ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Iluminación */}
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    p: 1.5, 
                    bgcolor: latestReading.luz === 1 ? 'rgba(245, 158, 11, 0.05)' : '#0f1419', 
                    border: `1px solid ${latestReading.luz === 1 ? '#f59e0b' : '#1a2332'}`, 
                    borderRadius: '2px', 
                    textAlign: 'center' 
                  }}>
                    <Lightbulb size={16} color={latestReading.luz === 1 ? '#f59e0b' : '#94a3b8'} style={{ marginBottom: 4 }} />
                    <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontSize: '0.65rem' }}>ILUMINACIÓN</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: latestReading.luz === 1 ? '#f59e0b' : '#94a3b8' }}>
                      {latestReading.luz === 1 ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* CO2 Extractor */}
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    p: 1.5, 
                    bgcolor: latestReading.vent_co2 === 1 ? 'rgba(59, 130, 246, 0.05)' : '#0f1419', 
                    border: `1px solid ${latestReading.vent_co2 === 1 ? '#3b82f6' : '#1a2332'}`, 
                    borderRadius: '2px', 
                    textAlign: 'center' 
                  }}>
                    <Wind size={16} color={latestReading.vent_co2 === 1 ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 4 }} />
                    <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontSize: '0.65rem' }}>EXTRACTOR CO₂</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: latestReading.vent_co2 === 1 ? '#3b82f6' : '#94a3b8' }}>
                      {latestReading.vent_co2 === 1 ? 'ACTIVO (ON)' : 'STANDBY (OFF)'}
                    </Typography>
                  </Box>
                </Grid>

              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Monitoreo Eléctrico Rápido */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '2px', height: '100%' }}>
            <Box sx={{ bgcolor: '#151c27', px: 2, py: 1, borderBottom: '1px solid #2d3b50' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#3b82f6', letterSpacing: '0.5px' }}>
                &gt;_ LECTURA DE RED (PZEM-004T)
              </Typography>
            </Box>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1a2332', pb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>Potencia Activa:</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Zap size={11} color="#f59e0b" /> {latestReading.potencia != null ? `${Number(latestReading.potencia).toFixed(1)} W` : 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1a2332', pb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>Voltaje RMS:</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.voltaje != null ? `${Number(latestReading.voltaje).toFixed(1)} V` : 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>Corriente de Línea:</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.corriente_neta != null ? `${Number(latestReading.corriente_neta).toFixed(2)} A` : 'N/A'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Nota de Pie SCADA */}
      <Box sx={{ mt: 3, p: 1.5, bgcolor: '#141b25', border: '1px solid #1a2332', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Lock size={12} color="#94a3b8" />
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem' }}>
          <strong>CUMPLIMIENTO DE CONTRATO LÓGICO:</strong> Los setpoints mostrados en esta vista reflejan el estado aplicado reportado directamente por el hardware en su última transmisión de telemetría (Nivel 3). Ningún valor es decorativo ni simulado.
        </Typography>
      </Box>

    </Box>
  );
}