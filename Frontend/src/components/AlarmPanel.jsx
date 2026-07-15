import React from 'react';
import { Box, Card, Typography, Stack, Collapse } from '@mui/material';
import { AlertTriangle, ShieldCheck, AlertOctagon } from 'lucide-react';

export const AlarmPanel = ({ alarms }) => {
  const hasErrors = alarms.some(a => a.severity === 'error');

  return (
    <Card sx={{ p: 2, mb: 3, border: `1px solid ${alarms.length > 0 ? (hasErrors ? '#ef4444' : '#f59e0b') : '#2d3748'}` }}>
      <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
        {alarms.length > 0 ? <AlertTriangle color={hasErrors ? '#ef4444' : '#f59e0b'} /> : <ShieldCheck color="#22c55e" />}
        CONSOLA DE ALARMAS FÍSICAS ({alarms.length})
      </Typography>

      {alarms.length === 0 ? (
        <Box sx={{ p: 2, bgcolor: 'rgba(34, 197, 94, 0.05)', borderRadius: 1, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          <Typography variant="body2" color="success.main" sx={{ fontWeight: 'medium' }}>
            ✓ SISTEMA NOMINAL: Lazo cerrado operando en parámetros establecidos. No hay fallas activas en hardware o software.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {alarms.map((alarm) => (
            <Box 
              key={alarm.id} 
              sx={{ 
                p: 1.5, 
                borderRadius: 1, 
                bgcolor: alarm.severity === 'error' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(245, 158, 11, 0.05)', 
                border: `1px solid ${alarm.severity === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5
              }}
            >
              <AlertOctagon size={16} color={alarm.severity === 'error' ? '#ef4444' : '#f59e0b'} />
              <Typography variant="body2" sx={{ fontWeight: 'medium', color: alarm.severity === 'error' ? '#fca5a5' : '#fde047' }}>
                {alarm.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Card>
  );
};