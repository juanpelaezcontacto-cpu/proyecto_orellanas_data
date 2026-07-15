import React, { useMemo } from 'react';
import { Box, Grid, Card, CardContent, Typography, Alert, AlertTitle, CircularProgress, Tooltip, Chip, Divider } from '@mui/material';
import { Thermometer, Droplet, Wind, Activity, Bell, ShieldCheck, ThermometerSnowflake, Lightbulb, Lock, HelpCircle, Zap, Clock, AlertTriangle } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Codificación dictada por el hardware
const ESPECIE_LABEL = { 0: 'Pleurotus ostreatus (Orellana)', 1: 'Hericium erinaceus (Melena de León)' };
const FASE_LABEL = { 0: 'Incubación', 1: 'Fructificación' };

export function DashboardView() {
  const { latestReading, historicalData, loading } = useTelemetry();

  // 1. MOTOR DE INFERENCIA DE CONEXIÓN
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

  // 2. CÁLCULO DE LÓGICA ANALÍTICA DE ALTO NIVEL
  const analytics = useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      return { co2Stress: 0, humSwitches: 0, compSwitches: 0, tempGrad: 0, humGrad: 0 };
    }

    const recent = historicalData.slice(-20); // Ventana estándar de 20 muestras

    // A. Dosis de Estrés por CO2 (S_CO2)
    const co2Stress = recent.reduce((acc, curr) => {
      const limit = curr.co2_setpoint_max ?? 900;
      const excess = curr.co2_inf - limit;
      return acc + (excess > 0 ? excess : 0);
    }, 0);

    // B. Conteo de Conmutaciones de Actuadores (Fatiga de Relés)
    let humSwitches = 0;
    let compSwitches = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].humidificador !== recent[i - 1].humidificador) humSwitches++;
      if (recent[i].compresor !== recent[i - 1].compresor) compSwitches++;
    }

    // C. Análisis de Gradiente Vertical Actual (Último Registro)
    const latest = latestReading || recent[recent.length - 1];
    const tempGrad = (latest.temp_sup ?? 0) - (latest.temp_inf ?? 0);
    const humGrad = (latest.hum_sup ?? 0) - (latest.hum_inf ?? 0);

    return { co2Stress, humSwitches, compSwitches, tempGrad, humGrad };
  }, [historicalData, latestReading]);

  // 3. MOTOR DE ALARMAS EN TIEMPO REAL (Nivel 3)
  const activeAlarms = useMemo(() => {
    if (!latestReading) return [];
    const alarms = [];

    // Fallas de Hardware (Sensores)
    if (latestReading.err_max > 0) alarms.push({ title: 'FALLA TERMOCUPLA MAX', desc: 'Línea de adquisición física interrumpida.', type: 'error' });
    if (latestReading.err_sht_ext > 0) alarms.push({ title: 'FALLA SHT EXT', desc: 'Pérdida de tramas de datos del sensor exterior.', type: 'error' });
    if (latestReading.err_sht_int > 0) alarms.push({ title: 'FALLA SHT INT', desc: 'Microclima de cámara sin lectura interna.', type: 'error' });
    if (latestReading.err_scd > 0) alarms.push({ title: 'FALLA SCD30 (CO2)', desc: 'Error de bus I2C con sensor principal.', type: 'error' });
    if (latestReading.err_pzem > 0) alarms.push({ title: 'FALLA MONITOREO ELÉCTRICO', desc: 'No se reciben lecturas del módulo PZEM.', type: 'error' });

    // Sobrecargas térmicas y eléctricas
    if (latestReading.temp_comp > 55) {
      alarms.push({ title: 'SOBRECALENTAMIENTO COMPRESOR', desc: `Crítico: ${latestReading.temp_comp}°C (Límite de seguridad: 55°C).`, type: 'error' });
    }
    if (latestReading.err_luz === true) {
      alarms.push({ title: 'FALLA DE ACTUADOR (LUZ)', desc: 'Discrepancia detectada: consumo medido no corresponde al estado lógico.', type: 'error' });
    }

    // Desviaciones biológicas críticas
    if (latestReading.co2_inf > latestReading.co2_setpoint_max) {
      alarms.push({ title: 'SATURACIÓN DE CO2', desc: `CO2 actual (${latestReading.co2_inf} ppm) supera setpoint de perfil (${latestReading.co2_setpoint_max} ppm).`, type: 'warning' });
    }
    if (latestReading.hum_inf < latestReading.hum_setpoint_min || latestReading.hum_inf > latestReading.hum_setpoint_max) {
      alarms.push({ title: 'HUMEDAD FUERA DE RANGO', desc: `Humedad de cámara en ${latestReading.hum_inf}% (Rango óptimo: ${latestReading.hum_setpoint_min}% - ${latestReading.hum_setpoint_max}%).`, type: 'warning' });
    }

    // Seguridad de puerta y tiempo
    if (latestReading.puerta === 1) {
      alarms.push({ title: 'CÁMARA ABIERTA', desc: 'Sensor de puerta física activo.', type: 'warning' });
    }
    if (latestReading.hora_sincronizada === false) {
      alarms.push({ title: 'DESFASE HORARIO (NTP)', desc: 'Sin sincronización horaria. Fotoperiodo suspendido por seguridad.', type: 'error' });
    }

    // Fatiga física evaluada por análisis local
    if (analytics.humSwitches > 25) {
      alarms.push({ title: 'FATIGA RELÉ HUMIDIFICADOR', desc: `Ciclos excesivos (${analytics.humSwitches}) detectados. Riesgo físico inminente.`, type: 'error' });
    }
    if (analytics.compSwitches > 10) {
      alarms.push({ title: 'CICLADO RÁPIDO DE COMPRESOR', desc: `Conmutaciones elevadas (${analytics.compSwitches}) detectadas en el compresor.`, type: 'error' });
    }

    return alarms;
  }, [latestReading, analytics]);

  // 4. SPARKLINE GENERATOR (Últimas 20 muestras)
  const sparklineData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return { temp: [], hum: [], co2: [] };
    const recent = historicalData.slice(-20);
    return {
      temp: recent.map(d => ({ value: d.temp_inf })),
      hum: recent.map(d => ({ value: d.hum_inf })),
      co2: recent.map(d => ({ value: d.co2_inf }))
    };
  }, [historicalData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2, bgcolor: '#0f1419', minHeight: '80vh' }}>
        <CircularProgress size={40} sx={{ color: '#3b82f6' }} />
        <Typography variant="body2" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
          ADQUIRIENDO DATOS DESDE SUPABASE...
        </Typography>
      </Box>
    );
  }

  if (!latestReading) {
    return (
      <Box sx={{ p: 4, bgcolor: '#0f1419', minHeight: '80vh' }}>
        <Alert severity="error" variant="filled" sx={{ bgcolor: '#ef4444', color: '#e2e8f0' }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>SIN COMUNICACIÓN CON BASE DE DATOS</AlertTitle>
          La base de datos de telemetría no retornó registros en la ventana horaria activa. Verifique la conexión del ESP32 a la red.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#0f1419', minHeight: '100vh', color: '#e2e8f0' }}>
      
      {/* 1. SECCIÓN DE CABECERA SCADA */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, borderBottom: '1px solid #1a2332', pb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 900, letterSpacing: '1px', color: '#e2e8f0' }}>
            ESP32 CO-PROCESOR SCADA // CÁMARA-01
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Clock size={12} color="#94a3b8" />
              <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                HEARTBEAT: {new Date(latestReading.created_at).toLocaleString()}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: '#1a2332' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connectionInfo.color }} />
              <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 'bold', fontFamily: 'monospace' }}>
                {connectionInfo.label} ({connectionInfo.minutes != null ? `${connectionInfo.minutes} min` : 'N/A'})
              </Typography>
            </Box>
            <Tooltip title="El estado se infiere por la estampa de tiempo del último registro inyectado en Supabase. No mide señal física de WiFi.">
              <HelpCircle size={12} color="#94a3b8" style={{ cursor: 'pointer' }} />
            </Tooltip>
          </Box>
        </Box>

        {/* Lote de cultivo activo */}
        <Box sx={{ bgcolor: '#1a2332', p: 1.5, borderRadius: '4px', border: '1px solid #2d3b50', textAlign: 'right' }}>
          <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', fontWeight: 'bold', fontFamily: 'monospace' }}>
            PERFIL ACTIVO EN DISPOSITIVO
          </Typography>
          <Typography variant="subtitle2" sx={{ color: '#3b82f6', fontWeight: 800, fontFamily: 'monospace' }}>
            {ESPECIE_LABEL[latestReading.especie_actual] || 'DESCONOCIDO'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 'bold', fontFamily: 'monospace' }}>
            Fase: {FASE_LABEL[latestReading.fase_actual] || 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* 2. PANEL DE ALARMAS Y ERRORES */}
      <Box sx={{ mb: 4 }}>
        {activeAlarms.length > 0 ? (
          <Card sx={{ bgcolor: '#1a2332', borderColor: '#ef4444', borderWidth: '1px', borderStyle: 'solid', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Bell color="#ef4444" size={18} />
                <Typography variant="subtitle2" sx={{ color: '#ef4444', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  MATRIZ DE EVENTOS ACTIVOS EN HARDWARE ({activeAlarms.length})
                </Typography>
              </Box>
              <Grid container spacing={1.5}>
                {activeAlarms.map((alarm, idx) => (
                  <Grid item xs={12} md={6} key={idx}>
                    <Box sx={{ 
                      p: 1.5, 
                      bgcolor: '#0f1419', 
                      borderRadius: '2px', 
                      borderLeft: `3px solid ${alarm.type === 'error' ? '#ef4444' : '#f59e0b'}`,
                      borderTop: '1px solid #1a2332',
                      borderRight: '1px solid #1a2332',
                      borderBottom: '1px solid #1a2332',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: alarm.type === 'error' ? '#ef4444' : '#f59e0b', fontFamily: 'monospace' }}>
                        {alarm.title}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#e2e8f0', fontSize: '0.8rem', mt: 0.5 }}>
                        {alarm.desc}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{ 
            p: 2, 
            bgcolor: '#1a2332', 
            borderRadius: '4px', 
            border: '1px solid #22c55e', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1.5 
          }}>
            <ShieldCheck size={20} color="#22c55e" />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#22c55e', display: 'block', fontFamily: 'monospace' }}>
                SISTEMA INTEGRAL NOMINAL
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Todos los sensores de adquisición reportan lecturas estables. Actuadores sincronizados con el firmware sin desvíos térmicos ni biológicos.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* 3. GRID PRINCIPAL DE VARIABLES CLIMÁTICAS (LECTURA REAL) */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        
        {/* Temperatura */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    <Thermometer size={14} /> TEMP. CÁMARA
                  </Typography>
                  <Typography variant="h4" sx={{ my: 1, fontFamily: 'monospace', fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.temp_inf != null ? `${Number(latestReading.temp_inf).toFixed(1)}°C` : '---'}
                  </Typography>
                </Box>
                <Box sx={{ width: 80, height: 40 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData.temp}>
                      <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
              <Divider sx={{ my: 1, borderColor: '#2d3b50' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Exterior (SHT): {latestReading.temp_sup != null ? `${Number(latestReading.temp_sup).toFixed(1)}°C` : 'N/A'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Set: {latestReading.setpoint_temp != null ? `${latestReading.setpoint_temp}°C` : 'N/A'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Humedad */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    <Droplet size={14} /> HUMEDAD RELATIVA
                  </Typography>
                  <Typography variant="h4" sx={{ my: 1, fontFamily: 'monospace', fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.hum_inf != null ? `${Number(latestReading.hum_inf).toFixed(1)}%` : '---'}
                  </Typography>
                </Box>
                <Box sx={{ width: 80, height: 40 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData.hum}>
                      <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
              <Divider sx={{ my: 1, borderColor: '#2d3b50' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Ext: {latestReading.hum_sup != null ? `${Number(latestReading.hum_sup).toFixed(0)}%` : 'N/A'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Set: {latestReading.hum_setpoint_min}% - {latestReading.hum_setpoint_max}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* CO2 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    <Wind size={14} /> CONCENTRACIÓN CO₂
                  </Typography>
                  <Typography variant="h4" sx={{ my: 1, fontFamily: 'monospace', fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.co2_inf != null ? `${Number(latestReading.co2_inf).toFixed(0)}` : '---'} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>ppm</span>
                  </Typography>
                </Box>
                <Box sx={{ width: 80, height: 40 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData.co2}>
                      <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
              <Divider sx={{ my: 1, borderColor: '#2d3b50' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Sensor: SCD30 I2C
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Límite Máx: {latestReading.co2_setpoint_max} ppm
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Telemetría Energética */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    <Activity size={14} /> POTENCIA ACTIVA
                  </Typography>
                  <Typography variant="h4" sx={{ my: 1, fontFamily: 'monospace', fontWeight: 'bold', color: '#e2e8f0' }}>
                    {latestReading.potencia != null ? `${Number(latestReading.potencia).toFixed(1)}` : '---'} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>W</span>
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', height: 40, alignItems: 'center' }}>
                  <Zap size={24} color="#3b82f6" />
                </Box>
              </Box>
              <Divider sx={{ my: 1, borderColor: '#2d3b50' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Tensión: {latestReading.voltaje != null ? `${Number(latestReading.voltaje).toFixed(1)}V` : 'N/A'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  Módulo: PZEM-004T
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* 4. INTELIGENCIA DE DATOS Y LÓGICA ANALÍTICA (Métricas Avanzadas) */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontFamily: 'monospace', fontWeight: 'bold', color: '#3b82f6', letterSpacing: '0.5px' }}>
                CÓMPUTO DE VARIABLES ANALÍTICAS COMPLEJAS (VENTANA ACTIVA: últimas 20 muestras)
              </Typography>
              
              <Grid container spacing={3}>
                
                {/* A. Dosis de Estrés por CO2 */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontFamily: 'monospace' }}>
                      DOSIS ACUMULADA DE ESTRÉS POR CO₂
                    </Typography>
                    <Typography variant="h5" sx={{ my: 1, fontFamily: 'monospace', fontWeight: 800, color: analytics.co2Stress > 500 ? '#f59e0b' : '#22c55e' }}>
                      {analytics.co2Stress.toFixed(0)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ppm·muestras</span>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8', mt: 1, display: 'block' }}>
                      Sumatoria discreta de concentración excedente sobre el setpoint del firmware en la ventana de tiempo.
                    </Typography>
                  </Box>
                </Grid>

                {/* B. Análisis de Gradiente Vertical */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontFamily: 'monospace' }}>
                      ANÁLISIS DE ESTRATIFICACIÓN (GRADIENTES)
                    </Typography>
                    <Box sx={{ my: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Gradiente Térmico (ΔT):</span>
                        <strong style={{ color: Math.abs(analytics.tempGrad) > 3.0 ? '#f59e0b' : '#e2e8f0' }}>
                          {analytics.tempGrad.toFixed(2)}°C
                        </strong>
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <span>Gradiente Humedad (ΔH):</span>
                        <strong style={{ color: Math.abs(analytics.humGrad) > 10.0 ? '#f59e0b' : '#e2e8f0' }}>
                          {analytics.humGrad.toFixed(1)}%
                        </strong>
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', mt: 1, display: 'block' }}>
                      Diferencia entre el domo superior (exterior) y la cama de cultivo inferior. Mide eficacia de recirculación.
                    </Typography>
                  </Box>
                </Grid>

                {/* C. Fatiga de Relés de Actuadores */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', height: '100%' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', display: 'block', fontFamily: 'monospace' }}>
                      DESGASTE DE RELÉS (TRANSICIONES ON-OFF)
                    </Typography>
                    <Box sx={{ my: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Humidificador:</span>
                        <strong style={{ color: analytics.humSwitches > 25 ? '#ef4444' : '#22c55e' }}>
                          {analytics.humSwitches} / 25 conmutaciones
                        </strong>
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <span>Compresor:</span>
                        <strong style={{ color: analytics.compSwitches > 10 ? '#ef4444' : '#22c55e' }}>
                          {analytics.compSwitches} / 10 conmutaciones
                        </strong>
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', mt: 1, display: 'block' }}>
                      Las conmutaciones excesivas indican fallos térmicos u oscilaciones dañinas en la histéresis del firmware.
                    </Typography>
                  </Box>
                </Grid>

              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 5. ESTADO DE LOS ACTUADORES FÍSICOS (Nivel 3) */}
      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <Card sx={{ bgcolor: '#1a2332', border: '1px solid #2d3b50', borderRadius: '4px' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontFamily: 'monospace', fontWeight: 'bold', color: '#3b82f6' }}>
                RETROALIMENTACIÓN DE ESTADO FÍSICO (SALIDA DE PINES ESP32)
              </Typography>
              <Grid container spacing={2}>
                
                {/* Compresor */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <ThermometerSnowflake size={24} color={latestReading.compresor === 1 ? '#ef4444' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block', fontFamily: 'monospace', fontSize: '0.8rem' }}>COMPRESOR</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.compresor === 1 ? '#ef4444' : '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }}>
                      {latestReading.compresor === 1 ? 'ON (ACTIVO)' : 'OFF (DESACTIVADO)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Humidificador */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Droplet size={24} color={latestReading.humidificador === 1 ? '#22c55e' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block', fontFamily: 'monospace', fontSize: '0.8rem' }}>HUMIDIFICADOR</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.humidificador === 1 ? '#22c55e' : '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }}>
                      {latestReading.humidificador === 1 ? 'ON (ACTIVO)' : 'OFF (DESACTIVADO)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Fotoperiodo */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Lightbulb size={24} color={latestReading.luz === 1 ? '#f59e0b' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block', fontFamily: 'monospace', fontSize: '0.8rem' }}>ILUMINACIÓN</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.luz === 1 ? '#f59e0b' : '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }}>
                      {latestReading.luz === 1 ? 'ON (ACTIVA)' : 'OFF (DESACTIVADA)'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Vent CO2 */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: '#0f1419', borderRadius: '4px', border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Wind size={24} color={latestReading.extractor_co2 === 1 ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block', fontFamily: 'monospace', fontSize: '0.8rem' }}>EXTRACTOR CO₂</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.extractor_co2 === 1 ? '#3b82f6' : '#94a3b8', fontWeight: 800, fontFamily: 'monospace' }}>
                      {latestReading.extractor_co2 === 1 ? 'ON (ACTIVO)' : 'OFF (DESACTIVADO)'}
                    </Typography>
                  </Box>
                </Grid>

              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 6. PIE DE PÁGINA SCADA Y VERIFICACIÓN DE FIRMWARE */}
      <Box sx={{ mt: 4 }}>
        <Card sx={{ bgcolor: '#1a2332', borderColor: '#2d3b50', borderWidth: '1px', borderStyle: 'solid', borderRadius: '4px' }}>
          <CardContent sx={{ py: 1.5, px: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Lock size={14} style={{ color: '#94a3b8' }} />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
              <strong>MODO DE TRABAJO SEGURO:</strong> Los valores indicados como &quot;Set&quot; o &quot;Límites&quot; corresponden a los perfiles predefinidos en la flash local del ESP32. La modificación remota de estados lógicos a través de la nube requiere autenticación y asignación explícita de perfil de biomasa en la pestaña de Controles.
            </Typography>
          </CardContent>
        </Card>
      </Box>

    </Box>
  );
}