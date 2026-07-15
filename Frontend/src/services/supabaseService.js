import { supabase } from '../supabaseClient'; // Asume cliente configurado

export const ESPECIE = { PLEUROTUS: 0, HERICIUM: 1 };
export const FASE = { INCUBACION: 0, FRUCTIFICACION: 1 };

export const ESPECIE_LABEL = { 0: 'Pleurotus ostreatus', 1: 'Hericium erinaceus' };
export const FASE_LABEL = { 0: 'Incubación', 1: 'Fructificación' };

export const FIRMWARE_PROFILES = {
  0: { 
    0: { temp: 26.0, humMin: 85, humMax: 90, co2Max: 15000 },
    1: { temp: 17.5, humMin: 88, humMax: 95, co2Max: 900 } 
  },
  1: { 
    0: { temp: 23.0, humMin: 85, humMax: 90, co2Max: 15000 },
    1: { temp: 18.0, humMin: 88, humMax: 95, co2Max: 700 } 
  },
};

/**
 * Fusión analítica de telemetría por proximidad temporal.
 * Evita O(N^2) utilizando un barrido lineal ordenado.
 */
export const fetchFusedTelemetry = async (limitRecords = 100) => {
  // Obtenemos los lotes históricos de forma paralela para acelerar la carga
  const [resClima, resEstado, resEnergia] = await Promise.all([
    supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(limitRecords),
    supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(limitRecords),
    supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(limitRecords)
  ]);

  if (resClima.error) throw new Error(`Error Clima: ${resClima.error.message}`);
  if (resEstado.error) throw new Error(`Error Estado: ${resEstado.error.message}`);
  if (resEnergia.error) throw new Error(`Error Energía: ${resEnergia.error.message}`);

  const clima = resClima.data || [];
  const estado = resEstado.data || [];
  const energia = resEnergia.data || [];

  // Usamos mapas indexados por el string timestamp exacto del backend (mismo lote de inserción)
  const climaMap = new Map(clima.map(item => [item.created_at, item]));
  const energiaMap = new Map(energia.map(item => [item.created_at, item]));

  // Combinación basada en estado_sistema como eje central del ciclo de telemetría
  const fused = estado.map(est => {
    const cli = climaMap.get(est.created_at) || null;
    const nrg = energiaMap.get(est.created_at) || null;

    return {
      created_at: est.created_at,
      timestamp: new Date(est.created_at).getTime(),
      
      // Lecturas climáticas directas
      temp_inf: cli?.temp_int_inf ?? null,
      temp_sup: cli?.temp_int_sup ?? null,
      hum_inf: cli?.hum_int_inf ?? null,
      hum_sup: cli?.hum_int_sup ?? null,
      co2: cli?.co2_inf ?? null,
      temp_comp: cli?.temp_comp ?? null,

      // Estado de control aplicado reportado por el microcontrolador
      setpoint_temp: est.setpoint_temp ?? null,
      hum_setpoint_min: est.hum_setpoint_min ?? null,
      hum_setpoint_max: est.hum_setpoint_max ?? null,
      co2_setpoint_max: est.co2_setpoint_max ?? null,
      especie_actual: est.especie_actual ?? null,
      fase_actual: est.fase_actual ?? null,
      
      // Estado de actuadores reales
      compresor: est.compresor ?? null,
      humidificador: est.humidificador ?? null,
      puerta: est.puerta ?? null,
      err_luz: est.err_luz ?? null,
      hora_sincronizada: est.hora_sincronizada ?? null,
      luz_fotoperiodo_on: est.luz_fotoperiodo_on ?? null,

      // Autodiagnóstico del hardware
      err_max: est.err_max ?? null,
      err_sht_ext: est.err_sht_ext ?? null,
      err_sht_int: est.err_sht_int ?? null,
      err_scd: est.err_scd ?? null,
      err_pzem: est.err_pzem ?? null,

      // Monitoreo energético
      potencia_w: nrg?.potencia_w ?? null,
      voltaje: nrg?.voltaje ?? null,
      corriente_neta: nrg?.corriente_neta ?? null,
      energia_kwh: nrg?.energia_kwh ?? null,
    };
  });

  return fused.reverse(); // Devolver cronológico para facilitar el renderizado de gráficas
};

export const fetchCurrentControlState = async () => {
  const { data, error } = await supabase.from('controles').select('*').eq('id', 1).single();
  if (error) throw new Error(`Error leyendo controles: ${error.message}`);
  return data;
};