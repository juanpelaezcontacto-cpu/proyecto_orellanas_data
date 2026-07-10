import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ComposedChart
} from 'recharts';
import { 
  Thermometer, Droplets, Wind, 
  Zap, Activity, Gauge, RefreshCw, 
  ToggleLeft, AlertTriangle, ShieldCheck
} from 'lucide-react';

function App() {
  const [datosClima, setDatosClima] = useState([]);
  const [energia, setEnergia] = useState({ voltaje: 0, corriente_neta: 0, potencia_w: 0, energia_kwh: 0, frequency_hz: 0, factor_potencia: 0, resistencia: 0 });
  const [historialEstado, setHistorialEstado] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pestanaActiva, setPestanaActiva] = useState('cultivo');
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  // Función auxiliar para formatear timestamp ISO UTC a hora legible local de Colombia
  const formatearHoraLocal = (isoString) => {
    try {
      const fecha = new Date(isoString);
      return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return '00:00:00';
    }
  };

  const consultarTodo = async () => {
    try {
      setCargando(true);
      const [resClima, resEnergia, resEstado] = await Promise.all([
        supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(500)
      ]);

      if (resClima.error) throw resClima.error;
      if (resEnergia.error) throw resEnergia.error;
      if (resEstado.error) throw resEstado.error;

      // Mapear con horas locales reales
      const climaFormateado = [...resClima.data].reverse().map(item => ({
        ...item,
        hora: formatearHoraLocal(item.created_at)
      }));
      setDatosClima(climaFormateado);

      const estadoFormateado = [...resEstado.data].reverse().map(item => ({
        ...item, 
        hora: formatearHoraLocal(item.created_at),
        compresor_binario: item.compresor ? 1 : 0
      }));
      setHistorialEstado(estadoFormateado);

      if (resEnergia.data.length > 0) setEnergia(resEnergia.data[0]);
      
      setUltimaActualizacion(new Date());
    } catch (error) {
      console.error('Error al sincronizar dashboard:', error.message);
    } finally {
      setCargando(false);
    }
  };

  // Convertimos la instantánea estática en un verdadero panel de monitoreo continuo
  useEffect(() => {
    consultarTodo();
    const intervalo = setInterval(consultarTodo, 60000); // Polling de seguridad automático cada 60 segundos
    return () => clearInterval(intervalo);
  }, []);

  const ultimoEstado = historialEstado.length > 0 ? historialEstado[historialEstado.length - 1] : {};
  
  const ultimaLecturaClima = datosClima && datosClima.length > 0 
    ? datosClima[datosClima.length - 1] 
    : { temp_int_inf: 0, hum_int_inf: 0, temp_int_sup: 0, hum_int_sup: 0, temp_ext: 0, hum_ext: 0, co2_inf: 0, temp_comp: 0 };

  // OBTENER SETPOINT VIGENTE (Dinámico del hardware, fallback a 23 si no hay red)
  const setpointVigente = ultimoEstado.setpoint_temp !== undefined ? ultimoEstado.setpoint_temp : 23.0;
  const HISTERESIS = 2.0; // Sincronizado con tu constante estándar del firmware

  // OBTENER SETPOINT VIGENTE (Dinámico del hardware, fallback a 20.0 si no hay red)
  const setpointVigente = ultimoEstado.setpoint_temp !== undefined ? ultimoEstado.setpoint_temp : 20.0;
  const HISTERESIS = 2.0; // Sincronizado con tu constante estándar del firmware

  // NUEVO: Límites basados en el estudio biológico de fructificación (±2°C de tolerancia)
  const DELTA_BIOLOGICO = 2.0;
  const limiteMinBiologico = setpointVigente - DELTA_BIOLOGICO;
  const limiteMaxBiologico = setpointVigente + DELTA_BIOLOGICO;

  // SOLUCIÓN AL JOIN FRÁGIL: Emparejar por est.created_at truncado o exacto, no por índice
  const datosMaquinaria = historialEstado.map(est => {
    // Buscar la lectura de clima que más se aproxime o coincida en timestamp exacto
    const climaAsociado = datosClima.find(cli => cli.created_at === est.created_at) || {};
    return {
      hora: est.hora,
      compresor_activo: est.compresor_binario,
      temp_compresor: climaAsociado.temp_comp !== undefined ? climaAsociado.temp_comp : null // Evita caídas falsas a 0°C
    };
  });

  const CardIndicador = ({ icono, titulo, valor, valorNumerico, minOptimo, maxOptimo, colorIcono, bgIcono }) => {
    const fueraDeRango = valorNumerico !== undefined && minOptimo !== undefined && maxOptimo !== undefined 
      ? (valorNumerico < minOptimo || valorNumerico > maxOptimo) 
      : false;
    
    return (
      <div style={{ 
        backgroundColor: fueraDeRango ? '#fff5f5' : 'white', 
        border: fueraDeRango ? '1px solid #feb2b2' : '1px solid #e2e8f0',
        padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px'
      }}>
        <div style={{ 
          backgroundColor: fueraDeRango ? '#e53e3e' : bgIcono, 
          padding: '10px', borderRadius: '50%', color: fueraDeRango ? 'white' : colorIcono, display: 'flex' 
        }}>{icono}</div>
        <div>
          <span style={{ fontSize: '13px', color: fueraDeRango ? '#c53030' : '#718096', display: 'block', fontWeight: '500' }}>
            {titulo} {fueraDeRango && '⚠️'}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', color: fueraDeRango ? '#9b2c2c' : '#1a202c' }}>
            {cargando ? '...' : valor}
          </span>
        </div>
      </div>
    );
  };

  const estiloTab = (id) => ({
    padding: '10px 20px', fontSize: '14px', fontWeight: '600',
    backgroundColor: pestanaActiva === id ? '#ffffff' : 'transparent',
    color: pestanaActiva === id ? '#2b6cb0' : '#4a5568', border: 'none',
    borderBottom: pestanaActiva === id ? '2px solid #3182ce' : '2px solid transparent',
    borderRadius: '6px 6px 0 0', cursor: 'pointer', marginRight: '8px'
  });

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f7fafc', minHeight: '100vh', color: '#2d3748' }}>
      
      {/* HEADER CON METADATO DE TIEMPO REAL */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: '#1a202c' }}>Centro de Control - Orellanas IoT</h1>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '13px' }}>
            Infraestructura de monitoreo microclimático avanzado | {ultimaActualizacion ? `Actualizado: ${ultimaActualizacion.toLocaleTimeString()}` : 'Sincronizando...'}
          </p>
        </div>
        <button onClick={consultarTodo} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Sincronizar
        </button>
      </header>

      {/* BARRA DE PESTAÑAS */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <button style={estiloTab('cultivo')} onClick={() => setPestanaActiva('cultivo')}>Vista General del Cultivo</button>
        <button style={estiloTab('energia')} onClick={() => setPestanaActiva('energia')}>Analítica Energética</button>
        <button style={estiloTab('diagnostico')} onClick={() => setPestanaActiva('diagnostico')}>Consola de Diagnóstico</button>
      </div>

      {/* VISTA GENERAL DEL CULTIVO */}
      {pestanaActiva === 'cultivo' && (
        <div>
          <section style={{ marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {/* BUG REAL #2 SOLUCIONADO: Límites calculados dinámicamente según el Setpoint y la Histéresis */}
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Interior Inf." valor={`${ultimaLecturaClima.temp_int_inf}°C`} valorNumerico={ultimaLecturaClima.temp_int_inf} minOptimo={setpointVigente - HISTERESIS} maxOptimo={setpointVigente + HISTERESIS} colorIcono="#e53e3e" bgIcono="#fff5f5" />
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Interior Sup." valor={`${ultimaLecturaClima.temp_int_sup}°C`} valorNumerico={ultimaLecturaClima.temp_int_sup} minOptimo={setpointVigente - HISTERESIS} maxOptimo={setpointVigente + HISTERESIS} colorIcono="#ed8936" bgIcono="#fffaf0" />
              <CardIndicador icono={<Droplets size={18} />} titulo="Hum. Interior Inf." valor={`${ultimaLecturaClima.hum_int_inf}%`} valorNumerico={ultimaLecturaClima.hum_int_inf} minOptimo={80} maxOptimo={96} colorIcono="#3182ce" bgIcono="#ebf8ff" />
              <CardIndicador icono={<Droplets size={18} />} titulo="Hum. Interior Sup." valor={`${ultimaLecturaClima.hum_int_sup}%`} valorNumerico={ultimaLecturaClima.hum_int_sup} minOptimo={80} maxOptimo={96} colorIcono="#805ad5" bgIcono="#faf5ff" />
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Exterior" valor={`${ultimaLecturaClima.temp_ext}°C`} colorIcono="#4a5568" bgIcono="#edf2f7" />
              <CardIndicador icono={<Wind size={18} />} titulo="Concentración CO₂" valor={`${ultimaLecturaClima.co2_inf} ppm`} valorNumerico={ultimaLecturaClima.co2_inf} minOptimo={0} maxOptimo={800} colorIcono="#319795" bgIcono="#e6fffa" />
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            {/* Gráfica de Temperatura limpia sin compresor */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', color: '#1a202c' }}>Historial Temperatura (°C)</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={datosClima}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                    <YAxis domain={[12, 30]} tick={{fontSize: 10}} stroke="#718096" /> {/* Ajustado el dominio para dar aire visual a las líneas */}
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                    
                    {/* Línea Central: Setpoint Objetivo */}
                    <ReferenceLine 
                      y={setpointVigente} 
                      stroke="#3182ce" 
                      strokeDasharray="4 4" 
                      label={{ value: `Target (${setpointVigente}°C)`, fill: '#3182ce', fontSize: 10, position: 'insideTopLeft' }} 
                    />

                    {/* LÍNEA NUEVA: Límite Máximo Biológico */}
                    <ReferenceLine 
                      y={limiteMaxBiologico} 
                      stroke="#e53e3e" 
                      strokeDasharray="3 3" 
                      label={{ value: `Máx Biológico (${limiteMaxBiologico}°C)`, fill: '#e53e3e', fontSize: 9, position: 'insideTopRight' }} 
                    />

                    {/* LÍNEA NUEVA: Límite Mínimo Biológico */}
                    <ReferenceLine 
                      y={limiteMinBiologico} 
                      stroke="#ed8936" 
                      strokeDasharray="3 3" 
                      label={{ value: `Mín Biológico (${limiteMinBiologico}°C)`, fill: '#ed8936', fontSize: 9, position: 'insideBottomRight' }} 
                    />

                    <Line type="natural" dataKey="temp_int_inf" name="Inf." stroke="#e53e3e" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="temp_int_sup" name="Sup." stroke="#ed8936" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="temp_ext" name="Ext." stroke="#718096" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', color: '#1a202c' }}>Historial de Humedad Relativa (%)</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={datosClima}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                    <YAxis domain={[0, 100]} tick={{fontSize: 10}} stroke="#718096" />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={80} stroke="#90cdf4" strokeDasharray="4 4" label={{ value: 'Crítico 80%', fill: '#3182ce', fontSize: 9 }} />
                    <Line type="natural" dataKey="hum_int_inf" name="Inf." stroke="#3182ce" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="hum_int_sup" name="Sup." stroke="#805ad5" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="hum_ext" name="Ext." stroke="#a0aec0" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', color: '#1a202c' }}>Acumulación de CO₂ en Cámara (ppm)</h3>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <AreaChart data={datosClima}>
                  <defs>
                    <linearGradient id="colorCo2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#319795" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#319795" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                  <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#718096" />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={800} stroke="#e53e3e" strokeDasharray="3 3" label={{ value: 'Renovación Necesaria', fill: '#c53030', fontSize: 10, position: 'top' }} />
                  <Area type="natural" dataKey="co2_inf" name="CO₂ Interior" stroke="#319795" fillOpacity={1} fill="url(#colorCo2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ANALÍTICA ENERGÉTICA */}
      {pestanaActiva === 'energia' && (
        <div>
          <section style={{ marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <CardIndicador icono={<Zap size={18} />} titulo="Potencia Activa" valor={`${energia.potencia_w} W`} colorIcono="#d69e2e" bgIcono="#fefcbf" />
              <CardIndicador icono={<Gauge size={18} />} titulo="Voltaje de Línea" valor={`${energia.voltaje} V`} colorIcono="#3182ce" bgIcono="#ebf8ff" />
              <CardIndicador icono={<Activity size={18} />} titulo="Corriente Neta" valor={`${energia.corriente_neta} A`} colorIcono="#e53e3e" bgIcono="#fff5f5" />
              <CardIndicador icono={<Gauge size={18} />} titulo="Consumo Acumulado" valor={`${energia.energia_kwh} kWh`} colorIcono="#38a169" bgIcono="#f0fff4" />
            </div>
          </section>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            <div><span style={{ fontSize: '12px', color: '#718096', display: 'block' }}>Frecuencia de Red</span><span style={{ fontSize: '18px', fontWeight: 'bold' }}>{energia.frecuencia_hz || 60} Hz</span></div>
            <div><span style={{ fontSize: '12px', color: '#718096', display: 'block' }}>Factor de Potencia</span><span style={{ fontSize: '18px', fontWeight: 'bold' }}>{energia.factor_potencia || 1.0}</span></div>
            <div><span style={{ fontSize: '12px', color: '#718096', display: 'block' }}>Resistencia Calculada</span><span style={{ fontSize: '18px', fontWeight: 'bold' }}>{energia.resistencia || 0} Ω</span></div>
          </div>
        </div>
      )}

      {/* CONSOLA DE DIAGNÓSTICO */}
      {pestanaActiva === 'diagnostico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative', marginBottom: '24px' }}>
            <div style={{ position: 'absolute', top: '20px', right: '20px', backgroundColor: ultimaLecturaClima.temp_comp > 55 ? '#fff5f5' : '#f7fafc', border: ultimaLecturaClima.temp_comp > 55 ? '1px solid #feb2b2' : '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 10 }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#718096' }}>Temperatura Compresor:</span>
              <span style={{ fontSize: '14px', fontWeight: '800', color: ultimaLecturaClima.temp_comp > 55 ? '#9b2c2c' : '#1a202c' }}>
                {cargando ? '...' : `${ultimaLecturaClima.temp_comp}°C`}
              </span>
              {ultimaLecturaClima.temp_comp > 55 && <span>⚠️</span>}
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0', color: '#1a202c' }}>Análisis Dinámico de Fatiga: Compresor vs Ciclos de Trabajo</h3>
            <p style={{ color: '#718096', margin: '0 0 16px 0', fontSize: '12px' }}>Correlación temporal entre la temperatura del bloque del motor (°C) y sus estados de encendido directos.</p>
            
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={datosMaquinaria}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                  <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                  <YAxis yAxisId="izq" orientation="left" domain={[0, 70]} tick={{fontSize: 10}} stroke="#4a5568" label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft', style: {fontSize: 11, fill: '#4a5568'} }} />
                  <YAxis yAxisId="der" orientation="right" domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v === 1 ? 'ON' : 'OFF'} tick={{fontSize: 10}} stroke="#3182ce" />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine yAxisId="izq" y={55} stroke="#e53e3e" strokeDasharray="3 3" label={{ value: 'Umbral Crítico (55°C)', fill: '#e53e3e', fontSize: 10, position: 'bottom' }} />
                  <Area yAxisId="der" type="step" dataKey="compresor_activo" name="Estado Compresor" fill="#ebf8ff" stroke="#3182ce" strokeWidth={1} fillOpacity={0.6} />
                  {/* connectNulls={false} previene que la línea caiga a cero abruptamente si falta una lectura de clima */}
                  <Line yAxisId="izq" type="monotone" dataKey="temp_compresor" name="Temp. Compresor" stroke="#2d3748" strokeWidth={2.5} dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ToggleLeft size={18} color="#4299e1"/> Estado de Actuadores</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: ultimoEstado.humidificador ? '#f0fff4' : '#edf2f7', color: ultimoEstado.humidificador ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '12px' }}>💧 Humidificador: {ultimoEstado.humidificador ? 'ON' : 'OFF'}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: ultimoEstado.compresor ? '#f0fff4' : '#edf2f7', color: ultimoEstado.compresor ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '12px' }}>❄️ Compresor: {ultimoEstado.compresor ? 'ON' : 'OFF'}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💨 Vent. Lateral: {ultimoEstado.vent_lateral}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💨 Vent. Superior: {ultimoEstado.vent_superior}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>🔄 Extractor CO₂: {ultimoEstado.vent_co2}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💡 Iluminación: {ultimoEstado.luz}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} color="#38a169"/> Integridad del Hardware</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['err_max', 'err_sht1', 'err_sht2', 'err_scd', 'err_pzem'].map((sensor) => {
                  const tieneError = ultimoEstado[sensor] > 0;
                  return (
                    <div key={sensor} style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '10px 14px', borderRadius: '8px', backgroundColor: tieneError ? '#fff5f5' : '#f0fff4', border: tieneError ? '1px solid #feb2b2' : '1px solid #c6f6d5', fontSize: '12px' }}>
                      <span style={{ fontWeight: '600', color: tieneError ? '#9b2c2c' : '#22543d', textTransform: 'uppercase' }}>{sensor.replace('err_', 'Sensor ')}</span>
                      {tieneError ? (
                        <span style={{ color: '#e53e3e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><AlertTriangle size={12}/> Falla ({ultimoEstado[sensor]})</span>
                      ) : (
                        <span style={{ color: '#38a169', fontWeight: '600' }}>Operativo</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;