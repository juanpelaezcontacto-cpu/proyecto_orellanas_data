import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { fetchFusedTelemetry, fetchCurrentControlState } from '../services/supabaseService';

const TelemetryContext = createContext(null);

export const TelemetryProvider = ({ children }) => {
  const [data, setData] = useState([]);
  const [controlState, setControlState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const updateTelemetry = async () => {
    try {
      setLoading(true);
      const [fusedData, currentControl] = await Promise.all([
        fetchFusedTelemetry(100),
        fetchCurrentControlState(),
      ]);
      setData(fusedData);
      setControlState(currentControl);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Falla en la adquisición de telemetría:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    updateTelemetry();
    const interval = setInterval(updateTelemetry, 60000); // Polling cada 60s
    return () => clearInterval(interval);
  }, []);

  // Procesamiento analítico avanzado derivado de los datos de telemetría unificados
  const analysis = useMemo(() => {
    if (data.length === 0) return { alarms: [], connection: 'offline', co2Stress: 0, cycles: { humidificador: 0, compresor: 0 } };

    const latest = data[data.length - 1];
    
    // 1. Determinar estado de conexión inferido
    const timeDiffMs = new Date() - new Date(latest.created_at);
    let connection = 'offline';
    if (timeDiffMs < 600000) connection = 'online'; // < 10 mins
    else if (timeDiffMs < 900000) connection = 'degraded'; // 10 - 15 mins

    const alarms = [];
    
    // 2. Evaluador analítico de alarmas físicas en tiempo real
    if (latest.err_max > 0 || latest.err_sht_ext > 0 || latest.err_sht_int > 0 || latest.err_scd > 0 || latest.err_pzem > 0) {
      alarms.push({ id: 'sensor_fault', label: 'Falla física en transductor de adquisición (Sensor offline)', severity: 'error' });
    }
    if (latest.temp_comp > 55) {
      alarms.push({ id: 'temp_comp_critical', label: `Temperatura crítica en el bloque del compresor (${latest.temp_comp}°C)`, severity: 'error' });
    }
    if (latest.co2 > latest.co2_setpoint_max) {
      alarms.push({ id: 'high_co2', label: `Concentración crítica de CO2 (${latest.co2} ppm > Límite: ${latest.co2_setpoint_max} ppm)`, severity: 'warning' });
    }
    if (latest.hum_inf !== null && (latest.hum_inf < latest.hum_setpoint_min || latest.hum_inf > latest.hum_setpoint_max)) {
      alarms.push({ id: 'humidity_out_of_bounds', label: `Humedad fuera de rango óptimo de fase (${latest.hum_inf}% vs Setpoint: ${latest.hum_setpoint_min}-${latest.hum_setpoint_max}%)`, severity: 'warning' });
    }
    if (latest.err_luz === true) {
      alarms.push({ id: 'light_hardware_fault', label: 'Falla del actuador de iluminación (Falta consumo detectado por PZEM)', severity: 'error' });
    }
    if (latest.puerta === 1) {
      alarms.push({ id: 'door_open', label: 'Cámara abierta (Microswitch puerta activo)', severity: 'warning' });
    }
    if (connection === 'offline') {
      alarms.push({ id: 'telemetry_loss', label: 'Pérdida crítica de telemetría con hardware remoto', severity: 'error' });
    }
    if (latest.hora_sincronizada === false) {
      alarms.push({ id: 'ntp_desync', label: 'Desincronización de reloj NTP en ESP32 (Fotoperiodo inactivo por seguridad)', severity: 'error' });
    }

    // 3. Integración analítica de la dosis de estrés por CO2 (Suma de Riemann aproximada)
    let totalCo2Stress = 0;
    let switchHum = 0;
    let switchComp = 0;

    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const prev = data[i - 1];

      // Dosis de estrés por exceso de CO2
      if (current.co2 > current.co2_setpoint_max) {
        const deltaHours = (current.timestamp - prev.timestamp) / 3600000;
        totalCo2Stress += (current.co2 - current.co2_setpoint_max) * deltaHours;
      }

      // Conteo de transiciones físicas de relés mecánicos
      if (current.humidificador !== prev.humidificador && current.humidificador !== null) switchHum++;
      if (current.compresor !== prev.compresor && current.compresor !== null) switchComp++;
    }

    return {
      connection,
      alarms,
      co2Stress: Math.round(totalCo2Stress), // Unidad: ppm-hora acumulado en la ventana
      cycles: {
        humidificador: switchHum,
        compresor: switchComp,
      }
    };
  }, [data]);

  return (
    <TelemetryContext.Provider value={{ data, controlState, loading, error, lastUpdate, analysis, refetch: updateTelemetry }}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) throw new Error('useTelemetry debe usarse dentro de un TelemetryProvider');
  return context;
};