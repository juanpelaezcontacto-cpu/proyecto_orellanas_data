import React from 'react';
import { Box, Grid2 as Grid, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Alert, Stack } from '@mui/material';
import { AlertTriangle, Clock, Play, RotateCcw, ShieldCheck, HelpCircle } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';

export const DiagnosticoView = () => {
  const { data, controlState, analysis } = useTelemetry();

  const latest = data[data.length - 1] || {};

  // Umbrales de fatiga adaptados a la ventana actual de 20 muestras
  const isHumFatigued = analysis.cycles.humidificador > 8; // Histéresis estrecha
  const isCompFatigued = analysis.cycles.compresor > 4;    // Peligro de daño por calor / relé pegado

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 3 }}>AUTODIAGNÓSTICO E INTEGRIDAD FISICA</Typography>

      <Grid container spacing={3}>
        {/* Panel 1: Alarmas de Sensores Físicos */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                <ShieldCheck size={20} /> INTEGRIDAD DE TRANSISTORES Y ADQUISICIÓN
              </Typography>
              <Stack spacing={1.5}>
                {[
                  { name: 'Max6675 (Compresor)', state: latest.err_max },
                  { name: 'SHT-External (Ambiente Ext)', state: latest.err_sht_ext },
                  { name: 'SHT-Internal (Cámara Control)', state: latest.err_sht_int },
                  { name: 'SCD-30 (CO₂ / Hum / Temp)', state: latest.err_scd },
                  { name: 'PZEM-004T (Energía)', state: latest.err_pzem },
                ].map((s) => (
                  <Box 
                    key={s.name}
                    sx={{ 
                      p: 1.5, 
                      borderRadius: 1, 
                      bgcolor: s.state > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)',
                      border: `1px solid ${s.state > 0 ? '#ef4444' : '#22c55e'}`,
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{s.name}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: s.state > 0 ? '#ef4444' : '#22c55e' }}>
                      {s.state > 0 ? `FALLA DE BUS (${s.state})` : 'OPERANDO NOMINAL'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel 2: Tiempos y Sincronía NTP */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                <Clock size={20} /> SINCRONÍA EN CAMPO (NTP)
              </Typography>
              <Stack spacing={2}>
                <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: latest.hora_sincronizada ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)', border: `1px solid ${latest.hora_sincronizada ? '#22c55e' : '#ef4444'}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Servidor de Tiempo NTP</Typography>
                  <Typography variant="h6" sx={{ color: latest.hora_sincronizada ? '#22c55e' : '#ef4444', fontWeight: 'bold', mt: 0.5 }}>
                    {latest.hora_sincronizada ? 'SINCRONIZADO' : 'HORA LOCAL CAÍDA / NTP OFFLINE'}
                  </Typography>
                  {!latest.hora_sincronizada && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      * El fotoperiodo se apaga como medida de seguridad si no hay hora precisa.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, borderRadius: 1, bgcolor: 'background.default', border: '1px solid #2d3748' }}>
                  <Typography variant="body2">¿Fotoperiodo activo teóricamente?</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: latest.luz_fotoperiodo_on ? 'primary.main' : 'text.secondary' }}>
                    {latest.luz_fotoperiodo_on ? 'ENCENDIDO' : 'APAGADO'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, borderRadius: 1, bgcolor: latest.err_luz ? 'rgba(239, 68, 68, 0.05)' : 'background.default', border: `1px solid ${latest.err_luz ? '#ef4444' : '#2d3748'}` }}>
                  <Typography variant="body2">Sensor de iluminación (PZEM feedback):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: latest.err_luz ? '#ef4444' : '#22c55e' }}>
                    {latest.err_luz ? 'FALLA INTERNA (No hay consumo de luz)' : 'CONEXIÓN OK'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel 3: Análisis de Fatiga por Conmutación de Relés */}
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                <RotateCcw size={20} /> ANÁLISIS FORENSE DE FATIGA DE RELES (Últimas 20 muestras)
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: isHumFatigued ? '#f59e0b' : '#22c55e', bgcolor: isHumFatigued ? 'rgba(245, 158, 11, 0.05)' : 'transparent' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>CICLOS HUMIDIFICADOR</Typography>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 'bold', my: 1 }}>{analysis.cycles.humidificador}</Typography>
                    {isHumFatigued ? (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontWeight: 'bold' }}>
                        ⚠️ Histéresis demasiado estrecha. Riesgo de arco eléctrico continuo.
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="success.main">Frecuencia de conmutación segura.</Typography>
                    )}
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: isCompFatigued ? '#ef4444' : '#22c55e', bgcolor: isCompFatigued ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>CICLOS COMPRESOR</Typography>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 'bold', my: 1 }}>{analysis.cycles.compresor}</Typography>
                    {isCompFatigued ? (
                      <Typography variant="caption" color="error.main" sx={{ display: 'block', fontWeight: 'bold' }}>
                        🚨 PELIGRO: Exceso de arranque del motor. Riesgo de soldadura de contactos en relé.
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="success.main">Compresor operando en ciclos estables.</Typography>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel 4: Campos Nivel 2 (Ignorados por Firmware) */}
        <Grid size={{ xs: 12 }}>
          <Card sx={{ border: '1px dashed #4a5568' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                <HelpCircle size={20} /> CAMPOS DE NIVEL 2 (IGNORADOS POR EL FIRMWARE ACTUAL)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Los siguientes valores están serializados en la base de datos <code>controles</code>, pero el firmware remoto actual **no está programado** para consumirlos. Cambiar estos parámetros aquí **no** alterará el funcionamiento del cultivo físico.
              </Typography>
              <TableContainer sx={{ bgcolor: 'rgba(0, 0, 0, 0.2)', borderRadius: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.main' }}>Campo</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.main' }}>Valor en BD</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', color: 'primary.main' }}>Estado del Firmware</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      { field: 'set_vent_lateral', value: controlState?.set_vent_lateral },
                      { field: 'set_vent_superior', value: controlState?.set_vent_superior },
                      { field: 'set_humidificador', value: controlState?.set_humidificador },
                      { field: 'set_luz', value: controlState?.set_luz },
                      { field: 'hum_setpoint_min', value: controlState?.hum_setpoint_min },
                      { field: 'hum_setpoint_max', value: controlState?.hum_setpoint_max },
                      { field: 'co2_setpoint_max', value: controlState?.co2_setpoint_max },
                      { field: 'hora_luz_on', value: controlState?.hora_luz_on },
                      { field: 'hora_luz_off', value: controlState?.hora_luz_off },
                      { field: 'modo_compresor', value: controlState?.modo_compresor },
                      { field: 'modo_humidificador', value: controlState?.modo_humidificador },
                      { field: 'modo_co2', value: controlState?.modo_co2 },
                      { field: 'modo_luz', value: controlState?.modo_luz },
                      { field: 'compresor_directo', value: controlState?.compresor_directo },
                    ].map((row) => (
                      <TableRow key={row.field}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.field}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{row.value ?? 'null'}</TableCell>
                        <TableCell sx={{ color: 'error.main', fontSize: '0.75rem', fontWeight: 'bold' }}>IGNORADO POR EL ESP32</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};