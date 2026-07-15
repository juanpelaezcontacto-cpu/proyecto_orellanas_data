import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const TelemetryContext = createContext();

export function TelemetryProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [historicalData, setHistoricalData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [controlState, setControlState] = useState(null);
  const [timeRange, setTimeRange] = useState(12); // Ventana de visualización por defecto

  const fetchControlState = async () => {
    try {
      const { data, error } = await supabase
        .from('controles')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      setControlState(data ?? null);
    } catch (error) {
      console.error('Error al leer la tabla controles:', error.message);
    }
  };

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

  // Vuelve a cargar telemetría Y controlState — usado por ControlView tras guardar,
  // y por cualquier vista que necesite forzar una lectura fresca de ambos.
  const refetch = async () => {
    await Promise.all([fetchTelemetry(), fetchControlState()]);
  };

  useEffect(() => {
    fetchTelemetry();
    fetchControlState();

    // Suscripción de tiempo real a los tres hilos de telemetría + la tabla de controles
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lecturas_sensores' }, () => fetchTelemetry())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monitoreo_energetico' }, () => fetchTelemetry())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'estado_sistema' }, () => fetchTelemetry())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'controles' }, () => fetchControlState())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [timeRange]);

  // Análisis derivado de las últimas 20 muestras — mismo criterio que ya usa
  // DashboardView internamente, pero expuesto aquí para que DiagnosticoView
  // (y cualquier otra vista) no tenga que recalcularlo por su cuenta.
  const analysis = useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      return { cycles: { humidificador: 0, compresor: 0 } };
    }
    const recent = historicalData.slice(-20);
    let humSwitches = 0;
    let compSwitches = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].humidificador !== recent[i - 1].humidificador) humSwitches++;
      if (recent[i].compresor !== recent[i - 1].compresor) compSwitches++;
    }
    return { cycles: { humidificador: humSwitches, compresor: compSwitches } };
  }, [historicalData]);

  return (
    <TelemetryContext.Provider value={{
      historicalData,
      latestReading,
      controlState,
      analysis,
      loading,
      timeRange,
      setTimeRange,
      reloadData: fetchTelemetry,
      refetch,
    }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export const useTelemetry = () => useContext(TelemetryContext);