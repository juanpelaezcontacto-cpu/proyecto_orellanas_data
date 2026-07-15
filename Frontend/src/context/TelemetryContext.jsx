import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const TelemetryContext = createContext();

export function TelemetryProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [timeRange, setTimeRange] = useState(12); // Ventana de visualización por defecto

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      const timeLimit = new Date();
      timeLimit.setHours(timeLimit.getHours() - timeRange);
      const isoTimeLimit = timeLimit.toISOString();

      // 1. Intento de carga dentro de la ventana de tiempo seleccionada
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

      let fusedMap = {};

      resSensores.data?.forEach((item) => {
        fusedMap[item.created_at] = { ...fusedMap[item.created_at], ...item };
      });
      resEnergia.data?.forEach((item) => {
        fusedMap[item.created_at] = { ...fusedMap[item.created_at], ...item };
      });
      resEstado.data?.forEach((item) => {
        fusedMap[item.created_at] = { ...fusedMap[item.created_at], ...item };
      });

      let sortedFused = Object.values(fusedMap).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );

      // 2. MECANISMO DE FALLBACK: Si no hay telemetría reciente, buscamos el último estado conocido
      if (sortedFused.length === 0) {
        const [fallbackSens, fallbackEner, fallbackEst] = await Promise.all([
          supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(1),
          supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
          supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(1),
        ]);

        const latestSens = fallbackSens.data?.[0] || null;
        const latestEner = fallbackEner.data?.[0] || null;
        const latestEst = fallbackEst.data?.[0] || null;

        if (latestSens || latestEner || latestEst) {
          // Fusionamos las últimas piezas de información disponibles en la BD
          const mergedFallback = {
            ...latestSens,
            ...latestEner,
            ...latestEst,
            // Usamos la marca de tiempo más reciente de las tres disponibles para reportar el desajuste
            created_at: [
              latestSens?.created_at,
              latestEner?.created_at,
              latestEst?.created_at
            ]
              .filter(Boolean)
              .sort((a, b) => new Date(b) - new Date(a))[0]
          };

          setLatestReading(mergedFallback);
          setHistoricalData([mergedFallback]); // Poblamos el histórico con un nodo base para que las gráficas no exploten
        } else {
          setLatestReading(null);
          setHistoricalData([]);
        }
      } else {
        setHistoricalData(sortedFused);
        setLatestReading(sortedFused[sortedFused.length - 1]);
      }
    } catch (error) {
      console.error('Error crítico en el motor de fusión SCADA:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    
    // Suscripción de tiempo real a los tres hilos
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