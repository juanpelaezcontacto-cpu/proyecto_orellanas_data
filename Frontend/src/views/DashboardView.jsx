import React, { useMemo } from 'react';
import { Box, Grid, Card, CardContent, Typography, Alert, AlertTitle, CircularProgress, Tooltip } from '@mui/material';
import { Thermometer, Droplet, Wind, Activity, Bell, ShieldCheck, ThermometerSnowflake, Lightbulb, Lock, HelpCircle } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Codificación única de Especies/Fases dictadas por el firmware
const ESPECIE_LABEL = { 0: 'Pleurotus ostreatus (Orellana)', 1: 'Hericium erinaceus (Melena de León)' };
const FASE_LABEL = { 0: 'Incubación', 1: 'Fructificación' };

export function DashboardView() {
  const { latestReading, historicalData, loading } = useTelemetry();

  // 1. MOTOR DE ALARMAS EN TIEMPO REAL
  const activeAlarms = useMemo(() => {
    if (!latestReading) return [];
    const alarms = [];

    // Falla de Sensores (Hardware)
    if (latestReading.err_max > 0) alarms.push({ title: 'Falla Sensor MAX', desc: 'Sensor de termocupla reportando lecturas fuera de rango.', type: 'error' });
    if (latestReading.err_sht_ext > 0) alarms.push({ title: 'Falla Sensor SHT Exterior', desc: 'Falla de comunicación física con el SHT externo.', type: 'error' });
    if (latestReading.err_sht_int > 0) alarms.push({ title: 'Falla Sensor SHT Interior', desc: 'Falla crítica de lectura de microclima interno.', type: 'error' });
    if (latestReading.err_scd > 0) alarms.push({ title: 'Falla Sensor CO2 SCD30', desc: 'Falla del canal de datos I2C con sensor principal de CO2.', type: 'error' });
    if (latestReading.err_pzem > 0) alarms.push({ title: 'Falla Monitor PZEM', desc: 'Falla de adquisición del módulo de telemetría de red eléctrica.', type: 'error' });

    // Límites Físicos Excedidos
    if (latestReading.temp_comp > 55) {
      alarms.push({ title: 'Sobrecalentamiento Compresor', desc: `Temperatura de compresor crítica: ${latestReading.temp_comp}°C (Límite: 55°C).`, type: 'error' });
    }
    
    // CO2 por encima del límite reportado por el propio firmware (Nivel 3)
    if (latestReading.co2_inf > latestReading.co2_setpoint_max) {
      alarms.push({ 
        title: 'CO2 Saturado', 
        desc: `Exceso de CO2 detectado: ${latestReading.co2_inf} ppm (Límite aplicado: ${latestReading.co2_setpoint_max} ppm). Extracción forzada requerida.`, 
        type: 'warning' 
      });
    }

    // Humedad fuera de límites reportados por el firmware (Nivel 3)
    if (latestReading.hum_inf < latestReading.hum_setpoint_min || latestReading.hum_inf > latestReading.hum_setpoint_max) {
      alarms.push({
        title: 'Humedad fuera de Rango',
        desc: `Humedad de cámara en ${latestReading.hum_inf}% (Rango óptimo aplicado: ${latestReading.hum_setpoint_min}% - ${latestReading.hum_setpoint_max}%).`,
        type: 'warning'
      });
    }

    // Actuadores y Sincronías
    if (latestReading.err_luz === true) {
      alarms.push({ title: 'Fallo Actuador de Luz', desc: 'Discrepancia eléctrica: Consumo medido no corresponde al estado lógico de iluminación.', type: 'error' });
    }
    if (latestReading.puerta === 1) {
      alarms.push({ title: 'Cámara Abierta', desc: 'Sensor magnético detecta que la puerta física está abierta.', type: 'warning' });
    }
    if (latestReading.hora_sincronizada === false) {
      alarms.push({ title: 'Desfase de Tiempo (NTP)', desc: 'Firmeza horaria no establecida. Fotoperiodo suspendido por seguridad.', type: 'error' });
    }

    return alarms;
  }, [latestReading]);

  // 2. SPARKLINE GENERATOR (Corte de últimas 2 horas de datos)
  const sparklineData = useMemo(() => {
    if (historicalData.length === 0) return { temp: [], hum: [], co2: [] };
    // Tomamos las últimas 20 lecturas para el sparkline (equivalente a aprox 2 horas)
    const recent = historicalData.slice(-20);
    return {
      temp: recent.map(d => ({ value: d.temp_inf })),
      hum: recent.map(d => ({ value: d.hum_inf })),
      co2: recent.map(d => ({ value: d.co2_inf }))
    };
  }, [historicalData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2 }}>
        <CircularProgress size={40} />
        <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          Sincronizando bus de datos...
        </Typography>
      </Box>
    );
  }

  if (!latestReading) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">
          <AlertTitle>No hay telemetría activa</AlertTitle>
          La base de datos de Supabase no retornó lecturas de ningún lote en la ventana horaria seleccionada. Revisa la conectividad física del ESP32.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      
      {/* HEADER DE LA VISTA */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1, fontFamily: 'monospace', fontWeight: 'bold' }}>
            CONSOLA CENTRAL DE TELEMETRÍA
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace' }}>
            Último registro del hardware: {new Date(latestReading.created_at).toLocaleString()}
          </Typography>
        </Box>
        
        {/* Identificación del Lote (Firma del firmware) */}
        <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1, border: '1px solid #2d3b50', textAlign: 'right' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            PERFIL ACTIVO EN HARDWARE
          </Typography>
          <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
            {ESPECIE_LABEL[latestReading.especie_actual] || 'No definido'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
            Fase: {FASE_LABEL[latestReading.fase_actual] || 'No definida'}
          </Typography>
        </Box>
      </Box>

      {/* PANEL DE ALARMAS */}
      <Box sx={{ mb: 4 }}>
        {activeAlarms.length > 0 ? (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card sx={{ borderColor: 'error.main', borderWidth: '1px', borderStyle: 'solid' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Bell color="#ef4444" size={20} />
                    <Typography variant="subtitle2" sx={{ color: 'error.main', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      CONSOLA DE EVENTOS ACTIVOS ({activeAlarms.length})
                    </Typography>
                  </Box>
                  <Grid container spacing={1}>
                    {activeAlarms.map((alarm, idx) => (
                      <Grid item xs={12} md={6} key={idx}>
                        <Alert severity={alarm.type} variant="outlined" sx={{ bgcolor: 'background.default' }}>
                          <AlertTitle sx={{ fontWeight: 'bold' }}>{alarm.title}</AlertTitle>
                          {alarm.desc}
                        </Alert>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        ) : (
          <Alert icon={<ShieldCheck size={20} />} severity="success" variant="outlined" sx={{ bgcolor: 'background.paper', borderColor: 'success.main' }}>
            <AlertTitle sx={{ fontWeight: 'bold' }}>SISTEMA NOMINAL</AlertTitle>
            No se registran fallas de sensores, aperturas físicas ni desvíos críticos de variables en el cultivo.
          </Alert>
        )}
      </Box>

      {/* METRICAS CRÍTICAS (KPIS) */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        
        {/* KPI: Temperatura Cámara */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Thermometer size={14} /> TEMP. CÁMARA
                  </Typography>
                  <Typography variant="h5" sx={{ my: 1, fontFamily: 'monospace' }}>
                    {latestReading.temp_inf != null ? `${Number(latestReading.temp_inf).toFixed(1)}°C` : 'N/A'}
                  </Typography>
                </Box>
                {/* Mini Sparkline 2h */}
                <Box sx={{ width: 80, height: 40 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData.temp}>
                      <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                Temp Ext: {latestReading.temp_sup != null ? `${Number(latestReading.temp_sup).toFixed(1)}°C` : 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI: Humedad */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Droplet size={14} /> HUMEDAD RELATIVA
                  </Typography>
                  <Typography variant="h5" sx={{ my: 1, fontFamily: 'monospace' }}>
                    {latestReading.hum_inf != null ? `${Number(latestReading.hum_inf).toFixed(1)}%` : 'N/A'}
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
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                Setpoints: {latestReading.hum_setpoint_min}% - {latestReading.hum_setpoint_max}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI: CO2 */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Wind size={14} /> CONCENTRACIÓN CO2
                  </Typography>
                  <Typography variant="h5" sx={{ my: 1, fontFamily: 'monospace' }}>
                    {latestReading.co2_inf != null ? `${Number(latestReading.co2_inf).toFixed(0)} ppm` : 'N/A'}
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
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                Límite Máx: {latestReading.co2_setpoint_max} ppm
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI: Carga Eléctrica */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Activity size={14} /> POTENCIA ACTIVA
                  </Typography>
                  <Typography variant="h5" sx={{ my: 1, fontFamily: 'monospace' }}>
                    {latestReading.potencia != null ? `${Number(latestReading.potencia).toFixed(1)} W` : 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', height: 40, alignItems: 'center' }}>
                  <Zap size={24} color="#3b82f6" />
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                Voltaje de Red: {latestReading.voltaje != null ? `${Number(latestReading.voltaje).toFixed(1)} V` : 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* ESTADO REAL DE ACTUADORES (Nivel 3) */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 3, fontFamily: 'monospace', fontWeight: 'bold' }}>
                ESTADOS ACTUALES DE ACTUADORES (Lectura Física de Pines)
              </Typography>
              <Grid container spacing={2}>
                
                {/* Compresor */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <ThermometerSnowflake size={24} color={latestReading.compresor === 1 ? '#ef4444' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block' }}>COMPRESOR</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.compresor === 1 ? 'error.main' : 'text.secondary', fontWeight: 'bold' }}>
                      {latestReading.compresor === 1 ? 'ON (Refrigerando)' : 'OFF'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Humidificador */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Droplet size={24} color={latestReading.humidificador === 1 ? '#22c55e' : '#94a3b8'} style={{ marginBottom: 8 }} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block' }}>HUMIDIFICADOR</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.humidificador === 1 ? 'success.main' : 'text.secondary', fontWeight: 'bold' }}>
                      {latestReading.humidificador === 1 ? 'ON (Nebulizando)' : 'OFF'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Iluminación */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Lightbulb size={24} color={latestReading.luz === 1 ? '#f59e0b' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block' }}>FOTOPERIODO (LUZ)</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.luz === 1 ? 'warning.main' : 'text.secondary', fontWeight: 'bold' }}>
                      {latestReading.luz === 1 ? 'ON (Activa)' : 'OFF'}
                    </Typography>
                  </Box>
                </Grid>

                {/* Extractor CO2 */}
                <Grid item xs={6} md={3}>
                  <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #2d3b50', textAlign: 'center' }}>
                    <Wind size={24} color={latestReading.extractor_co2 === 1 ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 'bold', display: 'block' }}>EXTRACTOR CO2</Typography>
                    <Typography variant="caption" sx={{ color: latestReading.extractor_co2 === 1 ? 'primary.main' : 'text.secondary', fontWeight: 'bold' }}>
                      {latestReading.extractor_co2 === 1 ? 'ON (Evacuando)' : 'OFF'}
                    </Typography>
                  </Box>
                </Grid>

              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* NOTA METODOLÓGICA DE SEGURIDAD */}
      <Box sx={{ mt: 4 }}>
        <Card sx={{ bgcolor: '#1e293b', borderColor: '#334155' }}>
          <CardContent sx={{ py: 1.5, px: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Lock size={16} style={{ color: '#94a3b8' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              <strong>Nota de Seguridad Fímica:</strong> Los estados mostrados representan la retroalimentación directa de los pines físicos del ESP32. Las conmutaciones dependen estrictamente del firmware. Los comandos de sobreescritura manual requieren credenciales validadas de Operador en la vista de Controles.
            </Typography>
          </CardContent>
        </Card>
      </Box>

    </Box>
  );
}