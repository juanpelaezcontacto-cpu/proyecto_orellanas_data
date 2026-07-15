import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

export const MetricCard = ({ title, value, subtitle, status = 'normal', icon, sparkData, dataKey, color = '#3b82f6' }) => {
  const getStatusColor = () => {
    if (status === 'error') return '#ef4444';   // Alarma crítica / Sensor offline
    if (status === 'warning') return '#f59e0b'; // Desviación de rango leve
    return '#22c55e';                            // Operación nominal
  };

  return (
    <Card sx={{ borderLeft: `4px solid ${getStatusColor()}`, bgcolor: 'background.paper' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {title}
          </Typography>
          <Box sx={{ color: getStatusColor(), display: 'flex', alignItems: 'center' }}>{icon}</Box>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace', mb: 0.5, color: 'text.primary' }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', minHeight: 18 }}>
          {subtitle}
        </Typography>
        {sparkData && sparkData.length > 0 && (
          <Box sx={{ height: 40, mt: 1.5 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <Area type="monotone" dataKey={dataKey} stroke={color} fill={`${color}15`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};