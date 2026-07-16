import React, { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, ToggleButtonGroup, ToggleButton, CircularProgress, Alert } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ComposedChart, Bar } from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { Thermometer, Droplets, Wind } from 'lucide-react';

export const ClimaView = () => {
  const { historicalData, latestReading, loading } = useTelemetry();
  const [timeRange, setTimeRange] = useState(6);

  const filteredData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];
    const cutoffTime = Date.now() - timeRange * 60 * 60 * 1000;
    
    return historicalData.filter(d => {
      const entryTime = d.timestamp || new Date(d.created_at).getTime();
      return entryTime >= cutoffTime;
    });
  }, [historicalData, timeRange]);

  const formatXAxis = (tickItem) => {
    try {
      return new Date(tickItem).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const handleTimeChange = (event, newRange) => {
    if (newRange !== null) setTimeRange(newRange);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!latestReading || historicalData.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">No hay datos históricos disponibles para analizar el microclima.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>DINÁMICA MICROCLIMÁTICA</Typography>
          <Typography variant="body2" color="text.secondary">Series temporales y estratificación física de la cámara</Typography>
        </Box>
        <ToggleButtonGroup value={timeRange} exclusive onChange={handleTimeChange} size="small" color="primary">
          <ToggleButton value={2}>2H</ToggleButton>
          <ToggleButton value={6}>6H</ToggleButton>
          <ToggleButton value={12}>12H</ToggleButton>
          <ToggleButton value={24}>24H</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* GRADIENTE DE TEMPERATURAr */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 'bold' }}>
            <Thermometer size={18} /> ANÁLISIS DE TEMPERATURA Y GRADIENTE VERTICAL (ΔT)
          </Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="created_at" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="temp" domain={['auto', 'auto']} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <YAxis yAxisId="gradient" orientation="right" domain={[-5, 5]} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latestReading.setpoint_temp != null && (
                  <ReferenceLine yAxisId="temp" y={latestReading.setpoint_temp} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: `Límite: ${latestReading.setpoint_temp}°C`, fill: '#3b82f6', fontSize: 10, position: 'insideTopLeft' }} />
                )}
                <Line yAxisId="temp" type="monotone" dataKey="temp_int_inf" name="Temp Inferior (Control)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line yAxisId="temp" type="monotone" dataKey="temp_int_sup" name="Temp Superior (Estrato)" stroke="#ed8936" strokeWidth={1.5} dot={false} />
                <Bar yAxisId="gradient" dataKey={(d) => (d.temp_int_sup != null && d.temp_int_inf != null) ? d.temp_int_sup - d.temp_int_inf : null} name="Gradiente ΔT (Sup - Inf)" fill="#3b82f6" opacity={0.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* GRADIENTE DE HUMEDAD */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 'bold' }}>
            <Droplets size={18} /> HUMEDAD RELATIVA Y LÍMITES BIOLÓBICO DEL PERFIL
          </Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="created_at" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="hum" domain={[50, 100]} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <YAxis yAxisId="gradient" orientation="right" domain={[-15, 15]} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latestReading.hum_setpoint_min != null && (
                  <ReferenceLine yAxisId="hum" y={latestReading.hum_setpoint_min} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `Mín: ${latestReading.hum_setpoint_min}%`, fill: '#f59e0b', fontSize: 10 }} />
                )}
                {latestReading.hum_setpoint_max != null && (
                  <ReferenceLine yAxisId="hum" y={latestReading.hum_setpoint_max} stroke="#22c55e" strokeDasharray="3 3" label={{ value: `Máx: ${latestReading.hum_setpoint_max}%`, fill: '#22c55e', fontSize: 10 }} />
                )}
                <Line yAxisId="hum" type="monotone" dataKey="hum_int_inf" name="Humedad Inferior (Control)" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line yAxisId="hum" type="monotone" dataKey="hum_int_sup" name="Humedad Superior" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                <Bar yAxisId="gradient" dataKey={(d) => (d.hum_int_sup != null && d.hum_int_inf != null) ? d.hum_int_sup - d.hum_int_inf : null} name="Gradiente ΔH" fill="#8b5cf6" opacity={0.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* CO2 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 'bold' }}>
            <Wind size={18} /> DINÁMICA DE CO₂ EN LA ZONA DE CONTROL
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="created_at" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis domain={['auto', 'auto']} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latestReading.co2_setpoint_max != null && (
                  <ReferenceLine y={latestReading.co2_setpoint_max} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Límite Fructificación: ${latestReading.co2_setpoint_max} ppm`, fill: '#ef4444', fontSize: 10 }} />
                )}
                <Line type="monotone" dataKey="co2_inf" name="CO₂ Inferior" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};