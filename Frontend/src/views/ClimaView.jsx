import React, { useState, useMemo } from 'react';
import { Box, Typography, Card, CardContent, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ComposedChart, Bar } from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { Thermometer, Droplets, Wind } from 'lucide-react';


export const ClimaView = () => {
  const { data } = useTelemetry();
  const [timeRange, setTimeRange] = useState(6);

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    const cutoffTime = Date.now() - timeRange * 60 * 60 * 1000;
    const result = data.filter(d => d.timestamp >= cutoffTime);
    return result.length > 0 ? result : data;
  }, [data, timeRange]);

  const latest = data[data.length - 1] || {};

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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>DINÁMICA MICROCLIMÁTICA</Typography>
          <Typography variant="body2" color="text.secondary">Series temporales y estratificación física de la cámara</Typography>
        </Box>
        <ToggleButtonGroup value={timeRange} exclusive onChange={handleTimeChange} size="small" color="primary">
          <ToggleButton value={2}>2H</ToggleButton>
          <ToggleButton value={6}>6H</ToggleButton>
          <ToggleButton value={12}>12H</ToggleButton>
          <ToggleButton value={24}>24H</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Thermometer size={18} /> ANÁLISIS DE TEMPERATURA Y GRADIENTE VERTICAL (ΔT)
          </Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="temp" domain={['auto', 'auto']} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <YAxis yAxisId="gradient" orientation="right" domain={[-5, 5]} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ bgcolor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latest.setpoint_temp && (
                  <ReferenceLine yAxisId="temp" y={latest.setpoint_temp} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: `Consigna: ${latest.setpoint_temp}°C`, fill: '#3b82f6', fontSize: 10, position: 'insideTopLeft' }} />
                )}
                <Line yAxisId="temp" type="monotone" dataKey="temp_inf" name="Temp Inferior (Control)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line yAxisId="temp" type="monotone" dataKey="temp_sup" name="Temp Superior (Estrato)" stroke="#ed8936" strokeWidth={1.5} dot={false} />
                <Bar yAxisId="gradient" dataKey={(d) => (d.temp_sup && d.temp_inf) ? d.temp_sup - d.temp_inf : null} name="Gradiente ΔT (Sup - Inf)" fill="#3b82f6" opacity={0.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Droplets size={18} /> HUMEDAD RELATIVA Y LÍMITES BIOLÓGICOS DEL PERFIL
          </Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="hum" domain={[50, 100]} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <YAxis yAxisId="gradient" orientation="right" domain={[-15, 15]} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ bgcolor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latest.hum_setpoint_min && (
                  <ReferenceLine yAxisId="hum" y={latest.hum_setpoint_min} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `Mín: ${latest.hum_setpoint_min}%`, fill: '#f59e0b', fontSize: 10 }} />
                )}
                {latest.hum_setpoint_max && (
                  <ReferenceLine yAxisId="hum" y={latest.hum_setpoint_max} stroke="#22c55e" strokeDasharray="3 3" label={{ value: `Máx: ${latest.hum_setpoint_max}%`, fill: '#22c55e', fontSize: 10 }} />
                )}
                <Line yAxisId="hum" type="monotone" dataKey="hum_inf" name="Humedad Inferior (Control)" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line yAxisId="hum" type="monotone" dataKey="hum_sup" name="Humedad Superior" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                <Bar yAxisId="gradient" dataKey={(d) => (d.hum_sup && d.hum_inf) ? d.hum_sup - d.hum_inf : null} name="Gradiente ΔH" fill="#8b5cf6" opacity={0.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Wind size={18} /> DINÁMICA DE CO₂ EN LA ZONA DE CONTROL
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis domain={['auto', 'auto']} stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ bgcolor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                {latest.co2_setpoint_max && (
                  <ReferenceLine y={latest.co2_setpoint_max} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Límite Fructificación: ${latest.co2_setpoint_max} ppm`, fill: '#ef4444', fontSize: 10 }} />
                )}
                <Line type="monotone" dataKey="co2" name="CO₂ Inferior" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};