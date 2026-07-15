import React, { useState, useMemo } from 'react';
import { Box, Grid, Typography, Card, CardContent, ToggleButtonGroup, ToggleButton, CircularProgress, Alert } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { Zap, Activity } from 'lucide-react';

export const EnergiaView = () => {
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!latestReading) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Esperando adquisición del PZEM-004T para iniciar el análisis eléctrico.</Alert>
      </Box>
    );
  }

  // Resolvemos inconsistencias entre 'potencia' y 'potencia_w'
  const activePower = latestReading.potencia_w ?? latestReading.potencia ?? 0;
  const activeVoltage = latestReading.voltaje ?? 0;
  const activeCurrent = latestReading.corriente_neta ?? latestReading.corriente ?? 0;
  const activeEnergy = latestReading.energia_kwh ?? 0;

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>MÉTRICAS ENERGÉTICAS (PZEM-004T)</Typography>
          <Typography variant="body2" color="text.secondary">Integridad eléctrica y análisis histórico de red en campo</Typography>
        </Box>
        <ToggleButtonGroup value={timeRange} exclusive onChange={(e, val) => val && setTimeRange(val)} size="small" color="primary">
          <ToggleButton value={2}>2H</ToggleButton>
          <ToggleButton value={6}>6H</ToggleButton>
          <ToggleButton value={12}>12H</ToggleButton>
          <ToggleButton value={24}>24H</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* TARJETAS DE MÉTRICAS */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ textAlign: 'center', p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>TENSIÓN EFICAZ</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>
              {activeVoltage != null ? `${Number(activeVoltage).toFixed(1)} V` : 'N/A'}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ textAlign: 'center', p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>CORRIENTE NETA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>
              {activeCurrent != null ? `${Number(activeCurrent).toFixed(2)} A` : 'N/A'}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ textAlign: 'center', p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>POTENCIA ACTIVA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold', color: 'primary.main' }}>
              {activePower != null ? `${Number(activePower).toFixed(1)} W` : 'N/A'}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ textAlign: 'center', p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>ENERGÍA ACUMULADA</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', mt: 0.5, fontWeight: 'bold' }}>
              {activeEnergy != null ? `${Number(activeEnergy).toFixed(3)} kWh` : 'N/A'}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* GRÁFICO POTENCIA */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 'bold' }}>
            <Zap size={18} /> CONSUMO DE POTENCIA EN EL TIEMPO
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="created_at" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis stroke="#e2e8f0" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3748' }} />
                <Legend verticalAlign="top" height={36} />
                <Line type="step" dataKey="potencia_w" name="Potencia Activa (W)" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* ESTABILIDAD DE LÍNEA */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 'bold' }}>
            <Activity size={18} /> ESTABILIDAD DE LÍNEA ELÉCTRICA (V vs A)
          </Typography>
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="created_at" tickFormatter={formatXAxis} stroke="#94a3b8" style={{ fontSize: 10 }} />
                <YAxis yAxisId="volt" domain={[100, 135]} stroke="#ef4444" style={{ fontSize: 10 }} />
                <YAxis yAxisId="curr" orientation="right" stroke="#8b5cf6" style={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString('es-CO')} contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3748' }} />
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