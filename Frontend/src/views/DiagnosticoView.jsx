import React from 'react';
import { Box, Grid, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Stack, CircularProgress, Alert } from '@mui/material';
import { AlertTriangle, Clock, RotateCcw, ShieldCheck, HelpCircle } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';

export const DiagnosticoView = () => {
  const { historicalData, latestReading, controlState, analysis, loading } = useTelemetry();

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
        <Alert severity="error">No se ha establecido comunicación con el hardware para realizar autodiagnósticos.</Alert>
      </Box>
    );
  }

  // Prevenir crashes si el backend no ha computado los ciclos
  const cyclesHum = analysis?.cycles?.humidificador ?? 0;
  const cyclesComp = analysis?.cycles?.compresor ?? 0;

  const isHumFatigued = cyclesHum > 8; 
  const isCompFatigued = cyclesComp > 4;    

  const checkSensorState = (state) => {
    if (state === undefined || state === null) return { label: 'DESCONOCIDO (SIN TELEMETRÍA)', color: '#f59e0b', error: true };
    if (state > 0) return { label: `FALLA DE BUS (${state})`, color: '#ef4444', error: true };
    return { label: 'OPERANDO NOMINAL', color: '#22c55e', error: false };
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, fontFamily: 'monospace' }}>AUTODIAGNÓSTICO E INTEGRIDAD FÍSICA</Typography>

      <Grid container spacing={3}>
        
        {/* BUSES Y ADQUISICIÓN */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', fontSize: '1rem' }}>
                <ShieldCheck size={20} /> INTEGRIDAD DE TRANSISTORES Y ADQUISICIÓN
              </Typography>
              <Stack spacing={1.5}>
                {[
                  { name: 'Max6675 (Compresor)', state: latestReading.err_max },
                  { name: 'SHT-External (Ambiente Ext)', state: latestReading.err_sht_ext },
                  { name: 'SHT-Internal (Cámara Control)', state: latestReading.err_sht_int },
                  { name: 'SCD-30 (CO₂ / Hum / Temp)', state: latestReading.err_scd },
                  { name: 'PZEM-004T (Energía)', state: latestReading.err_pzem },
                ].map((s) => {
                  const sensor = checkSensorState(s.state);
                  return (
                    <Box 
                      key={s.name}
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 1, 
                        bgcolor: sensor.error ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)',
                        border: `1px solid ${sensor.color}`,
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{s.name}</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: sensor.color }}>
                        {sensor.label}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* SINCRONÍA EN CAMPO */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', fontSize: '1rem' }}>
                <Clock size={20} /> SINCRONÍA EN CAMPO (NTP)
              </Typography>
              <Stack spacing={2}>
                <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: latestReading.hora_sincronizada ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)', border: `1px solid ${latestReading.hora_sincronizada ? '#22c55e' : '#ef4444'}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Servidor de Tiempo NTP</Typography>
                  <Typography variant="h6" sx={{ color: latestReading.hora_sincronizada ? '#22c55e' : '#ef4444', fontWeight: 'bold', mt: 0.5, fontSize: '1.1rem' }}>
                    {latestReading.hora_sincronizada ? 'SINCRONIZADO' : 'HORA LOCAL CAÍDA / NTP OFFLINE'}
                  </Typography>
                  {!latestReading.hora_sincronizada && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      * El fotoperiodo se apaga como medida de seguridad si no hay hora precisa.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, borderRadius: 1, bgcolor: 'background.default', border: '1px solid #2d3b50' }}>
                  <Typography variant="body2">¿Fotoperiodo activo teóricamente?</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: latestReading.luz_fotoperiodo_on ? 'primary.main' : 'text.secondary' }}>
                    {latestReading.luz_fotoperiodo_on ? 'ENCENDIDO' : 'APAGADO'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, borderRadius: 1, bgcolor: latestReading.err_luz ? 'rgba(239, 68, 68, 0.05)' : 'background.default', border: `1px solid ${latestReading.err_luz ? '#ef4444' : '#2d3b50'}` }}>
                  <Typography variant="body2">Sensor de iluminación (PZEM feedback):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: latestReading.err_luz ? '#ef4444' : '#22c55e' }}>
                    {latestReading.err_luz ? 'FALLA INTERNA (No hay consumo de luz)' : 'CONEXIÓN OK'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* ANÁLISIS FORENSE */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', fontSize: '1rem' }}>
                <RotateCcw size={20} /> ANÁLISIS FORENSE DE FATIGA DE RELÉS
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: isHumFatigued ? '#f59e0b' : '#22c55e', bgcolor: isHumFatigued ? 'rgba(245, 158, 11, 0.05)' : 'transparent' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>CICLOS HUMIDIFICADOR (20 MUESTRAS)</Typography>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 'bold', my: 1 }}>{cyclesHum}</Typography>
                    {isHumFatigued ? (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontWeight: 'bold' }}>
                        ⚠️ Histéresis estrecha. Riesgo de arco eléctrico continuo.
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="success.main">Frecuencia de conmutación segura.</Typography>
                    )}
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: isCompFatigued ? '#ef4444' : '#22c55e', bgcolor: isCompFatigued ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>CICLOS COMPRESOR (20 MUESTRAS)</Typography>
                    <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 'bold', my: 1 }}>{cyclesComp}</Typography>
                    {isCompFatigued ? (
                      <Typography variant="caption" color="error.main" sx={{ display: 'block', fontWeight: 'bold' }}>
                        🚨 PELIGRO: Exceso de arranques. Riesgo de pegado de contactos del relé.
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

        {/* CAMPOS IGNORADOS */}
        <Grid item xs={12}>
          <Card sx={{ border: '1px dashed #2d3b50' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', color: 'text.secondary', fontSize: '1rem' }}>
                <HelpCircle size={20} /> CAMPOS DE NIVEL 2 (IGNORADOS POR EL FIRMWARE ACTUAL)
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