import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Asegura que esta ruta apunte a tu cliente de Supabase

const TelemetryContext = createContext();

export function TelemetryProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [timeRange, setTimeRange] = useState(12); // Ventana por defecto: 12 horas

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      const timeLimit = new Date();
      timeLimit.setHours(timeLimit.getHours() - timeRange);
      const isoTimeLimit = timeLimit.toISOString();

      // Query paralela para optimizar tiempos de carga de red
      const [resSensores, resEnergia, resEstado] = await Promise.all([
        supabase
          .from('lecturas_sensores')
          .select('*')
          .gte('created_at', isoTimeLimit)
          .order('created_at', { ascending: true }),
        supabase
          .from('monitoreo_energetico')
          .select('*')
          .gte('created_at', isoTimeLimit)
          .order('created_at', { ascending: true }),
        supabase
          .from('estado_sistema')
          .select('*')
          .gte('created_at', isoTimeLimit)
          .order('created_at', { ascending: true }),
      ]);

      if (resSensores.error) throw resSensores.error;
      if (resEnergia.error) throw resEnergia.error;
      if (resEstado.error) throw resEstado.error;

      // Diccionario temporal para unificar por timestamp aproximado o exacto
      const fusedMap = {};

      // 1. Mapear sensores
      resSensores.data.forEach((item) => {
        const ts = item.created_at;
        fusedMap[ts] = { ...fusedMap[ts], ...item };
      });

      // 2. Fusionar datos de energía
      resEnergia.data.forEach((item) => {
        const ts = item.created_at;
        fusedMap[ts] = { ...fusedMap[ts], ...item };
      });

      // 3. Fusionar estados del sistema
      resEstado.data.forEach((item) => {
        const ts = item.created_at;
        fusedMap[ts] = { ...fusedMap[ts], ...item };
      });

      // Convertir el mapa de vuelta a una lista ordenada cronológicamente
      const sortedFused = Object.values(fusedMap).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );

      setHistoricalData(sortedFused);
      if (sortedFused.length > 0) {
        setLatestReading(sortedFused[sortedFused.length - 1]);
      } else {
        setLatestReading(null);
      }
    } catch (error) {
      console.error('Error crítico en la fusión de telemetría:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    
    // Suscripción en tiempo real a las tres tablas independientes
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lecturas_sensores' }, () => fetchTelemetry())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monitoreo_energetico' }, () => fetchTelemetry())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'estado_sistema' }, () => fetchTelemetry())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [timeRange]);

  return (
    <TelemetryContext.Provider value={{ historicalData, latestReading, loading, timeRange, setTimeRange, reloadData: fetchTelemetry }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export const useTelemetry = () => useContext(TelemetryContext);