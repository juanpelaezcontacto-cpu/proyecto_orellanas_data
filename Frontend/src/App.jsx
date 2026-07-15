import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ComposedChart, BarChart, Bar
} from 'recharts';
import { 
  Thermometer, Droplets, Wind, Zap, Activity, Gauge, 
  RefreshCw, ToggleLeft, AlertTriangle, ShieldCheck, 
  Binary, Cpu, TrendingUp, Clock
} from 'lucide-react';

function App() {
  const [datosClima, setDatosClima] = useState([]);
  const [energia, setEnergia] = useState({ voltaje: 0, corriente_neta: 0, potencia_w: 0, energia_kwh: 0, frequency_hz: 0, factor_potencia: 0, resistencia: 0 });
  const [historialEstado, setHistorialEstado] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pestanaActiva, setPestanaActiva] = useState('biologico');
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(false);
  
  // Estados de control de la UI (Interfaz deseada)
  const [especieSeleccionada, setEspecieSeleccionada] = useState('orellana');
  const [faseSeleccionada, setFaseSeleccionada] = useState('fructificacion');

  const MATRIZ_CULTIVO = {
    orellana: { id_int: 0, nombre: "Orellana (Pleurotus ostreatus)", fases: {
        incubacion: { id_int: 0, setpoint: 26.0, hum_min: 65, hum_max: 75, co2_max: 5000 },
        fructificacion: { id_int: 1, setpoint: 17.5, hum_min: 80, hum_max: 95, co2_max: 800 }
    }},
    melena_leon: { id_int: 1, nombre: "Melena de León (Hericium erinaceus)", fases: {
        incubacion: { id_int: 0, setpoint: 22.5, hum_min: 65, hum_max: 75, co2_max: 10000 },
        fructificacion: { id_int: 1, setpoint: 19.5, hum_min: 85, hum_max: 95, co2_max: 800 }
    }}
  };

  const formatearHoraLocal = (isoString) => {
    try {
      return new Date(isoString).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return '00:00:00';
    }
  };

  const consultarTodo = async () => {
    try {
      setCargando(true);
      const [resClima, resEnergia, resEstado] = await Promise.all([
        supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(300)
      ]);

      if (resClima.error || resEnergia.error || resEstado.error) throw new Error("Fallo en la descarga de tablas");

      const climaFormateado = [...resClima.data].reverse().map(item => ({ ...item, hora: formatearHoraLocal(item.created_at) }));
      const estadoFormateado = [...resEstado.data].reverse().map(item => ({ ...item, hora: formatearHoraLocal(item.created_at) }));

      setDatosClima(climaFormateado);
      setHistorialEstado(estadoFormateado);
      if (resEnergia.data.length > 0) setEnergia(resEnergia.data[0]);

      // Verificar vigencia de datos (Heartbeat Timeout de 10 minutos)
      if (resEstado.data.length > 0) {
        const ultimaRáfaga = new Date(resEstado.data[0].created_at);
        setHeartbeatTimeout((new Date() - ultimaRáfaga) > 600000);
      }
      setUltimaActualizacion(new Date());
    } catch (error) {
      console.error('Error analítico de sincronización:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    consultarTodo();
    const intervalo = setInterval(consultarTodo, 60000);
    return () => clearInterval(intervalo);
  }, []);

  const ultimoEstado = historialEstado.length > 0 ? historialEstado[historialEstado.length - 1] : {};
  const ultimaLecturaClima = datosClima.length > 0 ? datosClima[datosClima.length - 1] : { temp_int_inf: 0, hum_int_inf: 0, temp_int_sup: 0, hum_int_sup: 0, co2_inf: 0, temp_comp: 0 };

  // 1. EVALUACIÓN DE LAZO CERRADO Y CONFIGURACIÓN VIGENTE DEL HARDWARE
  const hardwareSetpointTemp = ultimoEstado.setpoint_temp ?? 20.0;
  const hardwareHumMin = ultimoEstado.hum_setpoint_min ?? 88.0;
  const hardwareHumMax = ultimoEstado.hum_setpoint_max ?? 95.0;
  const hardwareCo2Max = ultimoEstado.co2_setpoint_max ?? 900;
  const hardwareEspecie = ultimoEstado.especie_actual ?? 0;
  const hardwareFase = ultimoEstado.fase_actual ?? 0;

  // Comparación lógica para determinar si la nube y el hardware están en sync
  const targetConfigUI = MATRIZ_CULTIVO[especieSeleccionada].fases[faseSeleccionada];
  const estaSincronizado = 
    hardwareEspecie === MATRIZ_CULTIVO[especieSeleccionada].id_int &&
    hardwareFase === targetConfigUI.id_int &&
    hardwareSetpointTemp === targetConfigUI.setpoint;

  // 2. PROCESAMIENTO ANALÍTICO AVANZADO (CIENCIA DE DATOS EN CLIENTE - LINEAL O(N))
  const { datosProcesados, dosisEstresCo2, ciclosHoraActuadores } = useMemo(() => {
    let acumuladorCo2 = 0;
    let cambiosHumidificador = 0;
    let cambiosCompresor = 0;
    let ultimoEstadoHum = null;
    let ultimoEstadoComp = null;

    // Indexación rápida mediante mapa lineal para evitar loops anidados O(N^2)
    const climaMap = new Map(datosClima.map(c => [c.created_at, c]));

    const registrosCombinados = historialEstado.map(est => {
      const cli = climaMap.get(est.created_at) || {};
      const deltaT = (cli.temp_int_sup !== undefined && cli.temp_int_inf !== undefined) ? (cli.temp_int_sup - cli.temp_int_inf) : 0;
      const deltaH = (cli.hum_int_sup !== undefined && cli.hum_int_inf !== undefined) ? (cli.hum_int_sup - cli.hum_int_inf) : 0;

      // Calcular acumulación de CO2 por encima del límite del hardware (Área Bajo la Curva aprox)
      if (cli.co2_inf > hardwareCo2Max) {
        acumuladorCo2 += (cli.co2_inf - hardwareCo2Max);
      }

      // Conteo de transiciones físicas de actuadores para análisis de fatiga
      if (ultimoEstadoHum !== null && est.humidificador !== ultimoEstadoHum) cambiosHumidificador++;
      if (ultimoEstadoComp !== null && est.compresor !== ultimoEstadoComp) cambiosCompresor++;
      ultimoEstadoHum = est.humidificador;
      ultimoEstadoComp = est.compresor;

      return {
        hora: est.hora,
        temp_inf: cli.temp_int_inf,
        temp_sup: cli.temp_int_sup,
        hum_inf: cli.hum_int_inf,
        hum_sup: cli.hum_int_sup,
        co2: cli.co2_inf,
        temp_motor: cli.temp_comp,
        compresor_on: est.compresor ? 1 : 0,
        humidificador_on: est.humidificador ? 1 : 0,
        delta_temperatura: deltaT,
        delta_humedad: deltaH
      };
    });

    return {
      datosProcesados: registrosCombinados,
      dosisEstresCo2: Math.round(acumuladorCo2 / 12), // normalizado a la ventana temporal de muestreo
      ciclosHoraActuadores: { humidificador: cambiosHumidificador, compresor: cambiosCompresor }
    };
  }, [datosClima, historialEstado, hardwareCo2Max]);

  const aplicarParametrosBaseDatos = async () => {
    const config = MATRIZ_CULTIVO[especieSeleccionada].fases[faseSeleccionada];
    const { error } = await supabase
      .from('controles')
      .update({ 
        setpoint_temp: config.setpoint,
        hum_setpoint_min: config.hum_min,
        hum_setpoint_max: config.hum_max,
        co2_setpoint_max: config.co2_max,
        especie: MATRIZ_CULTIVO[especieSeleccionada].id_int,
        fase: config.id_int
      })
      .eq('id', 1);
      
    if (error) alert('Error en mutación de controles: ' + error.message);
    else alert(`Parámetros de lazo cerrado inyectados correctamente.`);
    consultarTodo();
  };

  const CardMetricaAnalitica = ({ icono, titulo, valor, estadoAlerta, subtitulo }) => (
    <div style={{ 
      backgroundColor: estadoAlerta ? '#fff5f5' : 'white', border: estadoAlerta ? '1px solid #feb2b2' : '1px solid #e2e8f0',
      padding: '18px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ color: estadoAlerta ? '#e53e3e' : '#3182ce' }}>{icono}</div>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#4a5568' }}>{titulo}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a202c' }}>{cargando ? '...' : valor}</div>
      <span style={{ fontSize: '11px', color: '#718096' }}>{subtitulo}</span>
    </div>
  );

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f7fafc', minHeight: '100vh', color: '#2d3748' }}>
      
      {/* MONITOREO DE SISTEMA CAÍDO (HEARTBEAT TIMEOUT DETECTOR) */}
      {heartbeatTimeout && (
        <div style={{ backgroundColor: '#e53e3e', color: 'white', padding: '12px 24px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', fontSize: '14px' }}>
          <AlertTriangle size={18} /> ALERTA DE SISTEMA: El hardware remoto lleva más de 10 minutos sin reportar ráfagas de telemetría. Estado degradado.
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#1a202c', letterSpacing: '-0.5px' }}>Plataforma Analítica - Orellanas IoT</h1>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '13px' }}>
            Motor de Inteligencia Biológica e Integridad del Hardware | {ultimaActualizacion ? `Sincronización: ${ultimaActualizacion.toLocaleTimeString()}` : 'Inicializando...'}
          </p>
        </div>
        <button onClick={consultarTodo} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Refrescar Telemetría
        </button>
      </header>

      {/* FILTROS Y EVALUADOR DE ESTADO DE SINCRONIZACIÓN DE LAZO CERRADO */}
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Especie UI:</label>
            <select value={especieSeleccionada} onChange={(e) => setEspecieSeleccionada(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '14px', backgroundColor: '#f7fafc', fontWeight: '600' }}>
              <option value="orellana">Orellana (Pleurotus ostreatus)</option>
              <option value="melena_leon">Melena de León</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#718096', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Fase UI:</label>
            <select value={faseSeleccionada} onChange={(e) => setFaseSeleccionada(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '14px', backgroundColor: '#f7fafc', fontWeight: '600' }}>
              <option value="incubacion">Incubación</option>
              <option value="fructificacion">Fructificación</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '8px', backgroundColor: estaSincronizado ? '#f0fff4' : '#fffaf0', border: estaSincronizado ? '1px solid #c6f6d5' : '1px solid #feebc8' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: estaSincronizado ? '#38a169' : '#dd6b20' }} />
          <div>
            <span style={{ fontSize: '12px', fontWeight: '700', display: 'block', color: estaSincronizado ? '#22543d' : '#744210' }}>
              {estaSincronizado ? "HARDWARE CONFIGURADO Y SINCRONIZADO" : "DISCREPANCIA: MODIFICACIONES PENDIENTES"}
            </span>
            <span style={{ fontSize: '11px', color: '#4a5568' }}>
              Objetivo: {targetConfigUI.setpoint}°C | Activo en ESP32: {hardwareSetpointTemp}°C
            </span>
          </div>
        </div>

        <button onClick={aplicarParametrosBaseDatos} style={{ marginLeft: 'auto', backgroundColor: '#2b6cb0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
          Inyectar Setpoints Completos al Hardware
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <button style={estiloTab('biologico')} onClick={() => setPestanaActiva('biologico')}>Supervisión y Análisis Biológico</button>
        <button style={estiloTab('maquinaria')} onClick={() => setPestanaActiva('maquinaria')}>Integridad Mecánica y Forense</button>
        <button style={estiloTab('energia')} onClick={() => setPestanaActiva('energia')}>Carga y Análisis Energético</button>
      </div>

      {/* PESTAÑA BIOLÓGICA (GRADIENTES Y DOSIS DE ESTRÉS) */}
      {pestanaActiva === 'biologico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <CardMetricaAnalitica icono={<Thermometer size={18} />} titulo="Temperatura Interna (Inf)" valor={`${ultimaLecturaClima.temp_int_inf}°C`} estadoAlerta={Math.abs(ultimaLecturaClima.temp_int_inf - hardwareSetpointTemp) > 2} subtitulo={`Setpoint Remoto: ${hardwareSetpointTemp}°C`} />
            <CardMetricaAnalitica icono={<Droplets size={18} />} titulo="Humedad Relativa (Inf)" valor={`${ultimaLecturaClima.hum_int_inf}%`} estadoAlerta={ultimaLecturaClima.hum_int_inf < hardwareHumMin} subtitulo={`Umbral Mínimo: ${hardwareHumMin}%`} />
            <CardMetricaAnalitica icono={<Wind size={18} />} titulo="Carga CO₂ Actual" valor={`${ultimaLecturaClima.co2_inf} ppm`} estadoAlerta={ultimaLecturaClima.co2_inf > hardwareCo2Max} subtitulo={`Límite Tolerancia: ${hardwareCo2Max} ppm`} />
            <CardMetricaAnalitica icono={<TrendingUp size={18} />} titulo="Dosis Estrés CO₂ Acumulada" valor={`${dosisEstresCo2} ppm-min`} estadoAlerta={dosisEstresCo2 > 5000} subtitulo="Área integrada por encima del límite" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 16px 0' }}>Análisis Estructural de Temperatura y Gradientes ($\Delta T$)</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart data={datosProcesados}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                    <YAxis yAxisId="temp" domain={[15, 30]} tick={{fontSize: 10}} label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft', style: {fontSize: 11} }} />
                    <YAxis yAxisId="delta" orientation="right" domain={[-3, 3]} tick={{fontSize: 10}} label={{ value: 'Gradiente Vertical ΔT', angle: 90, position: 'insideRight', style: {fontSize: 11} }} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                    
                    <ReferenceLine yAxisId="temp" y={hardwareSetpointTemp} stroke="#3182ce" strokeDasharray="4 4" />
                    <Line yAxisId="temp" type="monotone" dataKey="temp_inf" name="Temp Inferior" stroke="#e53e3e" strokeWidth={2} dot={false} />
                    <Line yAxisId="temp" type="monotone" dataKey="temp_sup" name="Temp Superior" stroke="#ed8936" strokeWidth={1.5} dot={false} />
                    <Bar yAxisId="delta" dataKey="delta_temperatura" name="Gradiente (Sup - Inf)" fill="#cbd5e0" opacity={0.6} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 16px 0' }}>Dinamismo de Humedad Relativa y Desviaciones del Lazo</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={datosProcesados}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                    <YAxis domain={[50, 100]} tick={{fontSize: 10}} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={hardwareHumMin} stroke="#90cdf4" strokeDasharray="3 3" />
                    <ReferenceLine y={hardwareHumMax} stroke="#3182ce" strokeDasharray="3 3" />
                    
                    <Line type="monotone" dataKey="hum_inf" name="Humedad Inf (Control)" stroke="#3182ce" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="hum_sup" name="Humedad Sup" stroke="#805ad5" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA DE INTEGRIDAD FORENSE DE MAQUINARIA (ANÁLISIS DE FATIGA DE RELES) */}
      {pestanaActiva === 'maquinaria' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} color="#4a5568"/> Ciclos de Conmutación (Ventana de Muestreo actual)</h3>
              <p style={{ color: '#718096', fontSize: '12px', margin: '0 0 16px 0' }}>Análisis forense de conmutaciones en relés mecánicos para prevención de arcos transitorios.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: ciclosHoraActuadores.humidificador > 25 ? '#fff5f5' : '#f7fafc', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '11px', color: '#4a5568', display: 'block', fontWeight: '600' }}>Conmutaciones Humidificador</span>
                  <span style={{ fontSize: '24px', fontWeight: '800' }}>{ciclosHoraActuadores.humidificador}</span>
                  {ciclosHoraActuadores.humidificador > 25 && <span style={{ fontSize: '10px', color: '#e53e3e', display: 'block' }}>⚠️ Fatiga por histéresis estrecho</span>}
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: ciclosHoraActuadores.compresor > 10 ? '#fff5f5' : '#f7fafc', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '11px', color: '#4a5568', display: 'block', fontWeight: '600' }}>Conmutaciones Compresor</span>
                  <span style={{ fontSize: '24px', fontWeight: '800' }}>{ciclosHoraActuadores.compresor}</span>
                  {ciclosHoraActuadores.compresor > 10 && <span style={{ fontSize: '10px', color: '#e53e3e', display: 'block' }}>🚨 Riesgo térmico inmediato</span>}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={16} color="#38a169"/> Estado de Autodiagnóstico del ESP32</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {['err_max', 'err_sht_ext', 'err_sht_int', 'err_scd', 'err_pzem'].map(sensor => {
                  const errorActivo = (ultimoEstado[sensor] ?? 0) > 0;
                  return (
                    <div key={sensor} style={{ padding: '10px', borderRadius: '6px', backgroundColor: errorActivo ? '#fff5f5' : '#f0fff4', border: errorActivo ? '1px solid #feb2b2' : '1px solid #c6f6d5', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '600' }}>
                      <span style={{ textTransform: 'uppercase', color: errorActivo ? '#9b2c2c' : '#22543d' }}>{sensor.replace('err_', '')}</span>
                      <span>{errorActivo ? `Falla (${ultimoEstado[sensor]})` : "OK"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 4px 0' }}>Correlación Térmica de Fatiga: Bloque Motor Compresor</h3>
            <p style={{ color: '#718096', fontSize: '12px', margin: '0 0 16px 0' }}>Análisis del lazo de enfriamiento y disipación física del motor.</p>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={datosProcesados}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                  <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                  <YAxis yAxisId="temp" domain={[20, 70]} tick={{fontSize: 10}} />
                  <YAxis yAxisId="state" orientation="right" domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v === 1 ? 'ON' : 'OFF'} tick={{fontSize: 10}} stroke="#3182ce" />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <ReferenceLine yAxisId="temp" y={55} stroke="#e53e3e" strokeDasharray="3 3" label={{ value: 'Crítico Motores (55°C)', fill: '#e53e3e', fontSize: 10 }} />
                  <Area yAxisId="state" type="step" dataKey="compresor_on" name="Duty Cycle Compresor" fill="#ebf8ff" stroke="#3182ce" strokeWidth={1} fillOpacity={0.4} />
                  <Line yAxisId="temp" type="monotone" dataKey="temp_motor" name="Temperatura Bloque" stroke="#2d3748" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA ENERGÉTICA */}
      {pestanaActiva === 'energia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <CardMetricaAnalitica icono={<Zap size={18} />} titulo="Potencia Activa Total" valor={`${energia.potencia_w} W`} subtitulo={`Factor Potencia: ${energia.factor_potencia || 1.0}`} />
            <CardMetricaAnalitica icono={<Gauge size={18} />} titulo="Voltaje Eficaz (RMS)" valor={`${energia.voltaje} V`} subtitulo={`Frecuencia de Línea: ${energia.frecuencia_hz || 60} Hz`} />
            <CardMetricaAnalitica icono={<Activity size={18} />} titulo="Intensidad Corriente" valor={`${energia.corriente_neta} A`} subtitulo="Consumo neto en derivación" />
            <CardMetricaAnalitica icono={<Binary size={18} />} titulo="Energía Acumulada" valor={`${energia.energia_kwh} kWh`} subtitulo={`Impedancia Estimada: ${energia.resistencia || 0} Ω`} />
          </div>
        </div>
      )}
    </div>
  );
}

const estiloTab = (id) => ({
  padding: '12px 24px', fontSize: '13px', fontWeight: '700',
  backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
  borderBottom: '2px solid transparent', transition: 'all 0.2s',
  outline: 'none', color: '#4a5568'
});

export default App;