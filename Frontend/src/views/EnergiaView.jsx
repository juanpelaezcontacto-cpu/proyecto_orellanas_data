import React, { useState, useMemo } from 'react';
import { Box, Grid2 as Grid, Typography, Card, CardContent, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { Zap, Activity, ShieldAlert } from 'lucide-react';

export const EnergiaView = () => {
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>MÉTRICAS ENERGÉTICAS (PZEM-004T)</Typography>
          <Typography variant="body2" color="text.secondary">Integridad eléctrica y análisis histórico de red en campo</Typography>
        </Box>
        <ToggleButtonGroup value={timeRange} exclusive onChange={(e, val) => val && setTimeRange(val)} size="small" color="primary">
          <ToggleButton value={2}>2H</ToggleButton>
          <ToggleButton value={6}>6H</ToggleButton>
          <ToggleButton value={12}>12H</ToggleButton>
          <ToggleButton value={24}>24H</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Grid de estado actual rápido */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ textAlign: 'center', p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>TENSIÓN EFICAZ</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>{latest.voltaje ? `${latest.voltaje} V` : 'N/A'}</Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ textAlign: 'center', p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>CORRIENTE NETA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>{latest.corriente_neta ? `${latest.corriente_neta} A` : 'N/A'}</Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ textAlign: 'center', p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>POTENCIA ACTIVA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold', color: 'primary.main' }}>{latest.potencia_w ? `${latest.potencia_w} W` : 'N/A'}</Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ textAlign: 'center', p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>ENERGÍA ACUMULADA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>{latest.energia_kwh ? `${latest.energia_kwh.toFixed(3)} kWh` : 'N/A'}</Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Gráfica 1: Perfil de Potencia */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Zap size={18} /> CONSUMO DE POTENCIA EN EL TIEMPO
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ bgcolor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                <Line type="step" dataKey="potencia_w" name="Potencia Activa (W)" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Gráfica 2: Tensión y Corriente */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Activity size={18} /> ESTABILIDAD DE LÍNEA ELÉCTRICA (V vs A)
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="volt" domain={[100, 135]} stroke="#ef4444" style={{ fontSize: 10 }} />
                <YAxis yAxisId="curr" orientation="right" stroke="#8b5cf6" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ bgcolor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                <Line yAxisId="volt" type="monotone" dataKey="voltaje" name="Tensión Lineal (RMS)" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                <Line yAxisId="curr" type="monotone" dataKey="corriente_neta" name="Corriente Consumida (A)" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};