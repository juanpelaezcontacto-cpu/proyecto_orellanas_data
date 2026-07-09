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
  // CAMBIO: Ahora almacenamos el historial de estados para la gráfica
  const [historialEstado, setHistorialEstado] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pestanaActiva, setPestanaActiva] = useState('cultivo');

  const consultarTodo = async () => {
    try {
      setCargando(true);
      // CAMBIO: Se aumentó el límite de estado_sistema de 1 a 40 para poder graficar su rendimiento
      const [resClima, resEnergia, resEstado] = await Promise.all([
        supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(40)
      ]);

      if (resClima.error) throw resClima.error;
      if (resEnergia.error) throw resEnergia.error;
      if (resEstado.error) throw resEstado.error;

      const climaFormateado = [...resClima.data].reverse().map(item => {
        const partes = item.created_at.split(/[T ]/);
        return { ...item, hora: partes[1] ? partes[1].substring(0, 8) : '00:00:00' };
      });
      setDatosClima(climaFormateado);

      // Formatear el historial de estados acoplando la hora y convirtiendo booleanos a binarios para Recharts
      const estadoFormateado = [...resEstado.data].reverse().map(item => {
        const partes = item.created_at.split(/[T ]/);
        return { 
          ...item, 
          hora: partes[1] ? partes[1].substring(0, 8) : '00:00:00',
          compresor_binario: item.compresor ? 1 : 0 // Convierte true/false a 1/0 para la gráfica
        };
      });
      setHistorialEstado(estadoFormateado);

      if (resEnergia.data.length > 0) setEnergia(resEnergia.data[0]);
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    consultarTodo();
  }, []);

  // Tomamos el último registro del array para mantener los indicadores estáticos funcionando
  const ultimoEstado = historialEstado.length > 0 ? historialEstado[historialEstado.length - 1] : {};
  
  const ultimaLecturaClima = datosClima && datosClima.length > 0 
    ? datosClima[datosClima.length - 1] 
    : { temp_int_inf: 0, hum_int_inf: 0, temp_int_sup: 0, hum_int_sup: 0, temp_ext: 0, hum_ext: 0, co2_inf: 0, temp_comp: 0 };

  // Acoplamos la temperatura del compresor (que viene en la tabla de clima) al historial de estados basándonos en el índice
  // Esto es una solución temporal limpia si los sensores registran con la misma frecuencia
  const datosMaquinaria = historialEstado.map((est, index) => {
    const climaAsociado = datosClima[index] || {};
    return {
      hora: est.hora,
      compresor_activo: est.compresor_binario,
      temp_compresor: climaAsociado.temp_comp || 0
    };
  });

  const CardIndicador = ({ icono, titulo, valor, valorNumerico, minOptimo, maxOptimo, colorIcono, bgIcono }) => {
    const fueraDeRango = valorNumerico !== undefined && (valorNumerico < minOptimo || valorNumerico > maxOptimo);
    
    return (
      <div style={{ 
        backgroundColor: fueraDeRango ? '#fff5f5' : 'white', 
        border: fueraDeRango ? '1px solid #feb2b2' : '1px solid #e2e8f0',
        padding: '16px', 
        borderRadius: '12px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '14px'
      }}>
        <div style={{ 
          backgroundColor: fueraDeRango ? '#e53e3e' : bgIcono, 
          padding: '10px', 
          borderRadius: '50%', 
          color: fueraDeRango ? 'white' : colorIcono, 
          display: 'flex' 
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
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: pestanaActiva === id ? '#ffffff' : 'transparent',
    color: pestanaActiva === id ? '#2b6cb0' : '#4a5568',
    border: 'none',
    borderBottom: pestanaActiva === id ? '2px solid #3182ce' : '2px solid transparent',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    marginRight: '8px'
  });

  return (
    <div style={{ 
      padding: '24px', 
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif', 
      backgroundColor: '#f7fafc', 
      minHeight: '100vh', 
      color: '#2d3748',
      WebkitFontSmoothing: 'antialiased'
    }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: '#1a202c', letterSpacing: '-0.02em' }}>Centro de Control - Orellanas IoT</h1>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '13px' }}>Infraestructura de monitoreo microclimático avanzado</p>
        </div>
        <button onClick={consultarTodo} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          <RefreshCw size={14} /> Sincronizar
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
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Interior Inf." valor={`${ultimaLecturaClima.temp_int_inf}°C`} valorNumerico={ultimaLecturaClima.temp_int_inf} minOptimo={20} maxOptimo={28} colorIcono="#e53e3e" bgIcono="#fff5f5" />
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Interior Sup." valor={`${ultimaLecturaClima.temp_int_sup}°C`} valorNumerico={ultimaLecturaClima.temp_int_sup} minOptimo={20} maxOptimo={28} colorIcono="#ed8936" bgIcono="#fffaf0" />
              <CardIndicador icono={<Droplets size={18} />} titulo="Hum. Interior Inf." valor={`${ultimaLecturaClima.hum_int_inf}%`} valorNumerico={ultimaLecturaClima.hum_int_inf} minOptimo={80} maxOptimo={96} colorIcono="#3182ce" bgIcono="#ebf8ff" />
              <CardIndicador icono={<Droplets size={18} />} titulo="Hum. Interior Sup." valor={`${ultimaLecturaClima.hum_int_sup}%`} valorNumerico={ultimaLecturaClima.hum_int_sup} minOptimo={80} maxOptimo={96} colorIcono="#805ad5" bgIcono="#faf5ff" />
              <CardIndicador icono={<Thermometer size={18} />} titulo="Temp. Exterior" valor={`${ultimaLecturaClima.temp_ext}°C`} colorIcono="#4a5568" bgIcono="#edf2f7" />

              <CardIndicador icono={<Wind size={18} />} titulo="Concentración CO₂" valor={`${ultimaLecturaClima.co2_inf} ppm`} valorNumerico={ultimaLecturaClima.co2_inf} minOptimo={0} maxOptimo={800} colorIcono="#319795" bgIcono="#e6fffa" />

            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            {/* Gráfica de Temperatura limpia sin compresor */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', color: '#1a202c' }}>Historial Térmico Coordenado (°C)</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={datosClima}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="hora" tick={{fontSize: 10}} stroke="#718096" />
                    <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#718096" />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={20} stroke="#feb2b2" strokeDasharray="3 3" label={{ value: 'Mín', fill: '#e53e3e', fontSize: 9 }} />
                    <ReferenceLine y={28} stroke="#feb2b2" strokeDasharray="3 3" label={{ value: 'Máx', fill: '#e53e3e', fontSize: 9 }} />
                    <Line type="natural" dataKey="temp_int_inf" name="Inf." stroke="#e53e3e" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="temp_int_sup" name="Sup." stroke="#ed8936" strokeWidth={2} dot={false} />
                    <Line type="natural" dataKey="temp_ext" name="Ext." stroke="#718096" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica de Humedad con Humedad Exterior agregada */}
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
    
    {/* CONTENEDOR PRINCIPAL DE MAQUINARIA (Dividido en 2 Columnas) */}
    <div style={{ 
      backgroundColor: 'white', 
      padding: '20px', 
      borderRadius: '12px', 
      border: '1px solid #e2e8f0',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '24px',
      alignItems: 'start'
    }}>
      
      {/* COLUMNA IZQUIERDA: LA GRÁFICA (Toma más espacio en pantallas grandes) */}
      <div style={{ gridColumn: 'span 3', minWidth: '0' }}>
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
              <Line yAxisId="izq" type="monotone" dataKey="temp_compresor" name="Temp. Compresor" stroke="#2d3748" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* COLUMNA DERECHA: INDICADORES NUMÉRICOS SECUNDARIOS DE MONITOREO EN TIEMPO REAL */}
      <div style={{ 
        gridColumn: 'span 1', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        borderLeft: '1px solid #edf2f7',
        paddingLeft: '20px',
        height: '100%',
        justifyContent: 'center'
      }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Métricas en Tiempo Real</span>
        
        {/* KPI: Temperatura actual del bloque */}
        <div style={{
          padding: '14px',
          borderRadius: '8px',
          backgroundColor: ultimaLecturaClima.temp_comp > 55 ? '#fff5f5' : '#f7fafc',
          border: ultimaLecturaClima.temp_comp > 55 ? '1px solid #feb2b2' : '1px solid #e2e8f0',
          transition: 'all 0.2s'
        }}>
          <span style={{ fontSize: '12px', color: ultimaLecturaClima.temp_comp > 55 ? '#c53030' : '#718096', display: 'block', fontWeight: '500' }}>Temp. Bloque Motor</span>
          <span style={{ fontSize: '24px', fontWeight: '800', color: ultimaLecturaClima.temp_comp > 55 ? '#9b2c2c' : '#1a202c', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {cargando ? '...' : `${ultimaLecturaClima.temp_comp}°C`}
            {ultimaLecturaClima.temp_comp > 55 && <span style={{ fontSize: '14px' }}>⚠️</span>}
          </span>
        </div>

        {/* KPI: Carga térmica estimada vs Energía */}
        <div style={{
          padding: '14px',
          borderRadius: '8px',
          backgroundColor: '#f7fafc',
          border: '1px solid #e2e8f0'
        }}>
          <span style={{ fontSize: '12px', color: '#718096', display: 'block', fontWeight: '500' }}>Consumo Dinámico Actual</span>
          <span style={{ fontSize: '20px', fontWeight: '700', color: '#2d3748' }}>
            {cargando ? '...' : `${ultimoEstado.compresor ? energia.potencia_w : 0} W`}
          </span>
          <span style={{ fontSize: '10px', color: '#a0aec0', display: 'block', marginTop: '2px' }}>
            {ultimoEstado.compresor ? '⚡ Trabajo Inductivo Activo' : '💤 En espera (Standby)'}
          </span>
        </div>
      </div>

    </div>

    {/* Aquí abajo continuaría el div original de grid que tiene "Estado de Actuadores" e "Integridad del Hardware" */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* ... Código de Actuadores e Integridad ... */}
            {/* ESTADO DE ACTUADORES */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ToggleLeft size={18} color="#4299e1"/> Estado de Actuadores</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: ultimoEstado.humidificador ? '#f0fff4' : '#edf2f7', color: ultimoEstado.humidificador ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '12px' }}>💧 Humidificador: {ultimoEstado.humidificador ? 'ON' : 'OFF'}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: ultimoEstado.compresor ? '#f0fff4' : '#edf2f7', color: ultimoEstado.compresor ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '12px' }}>❄️ Compresor: {ultimoEstado.compresor ? 'ON' : 'OFF'}</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💨 Vent. Lateral: {ultimoEstado.vent_lateral}%</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💨 Vent. Superior: {ultimoEstado.vent_superior}%</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>🔄 Extractor CO₂: {ultimoEstado.vent_co2}%</div>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f7fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}>💡 Iluminación: {ultimoEstado.luz}%</div>
              </div>
            </div>

            {/* INTEGRIDAD DEL HARDWARE */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} color="#38a169"/> Integridad del Hardware</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['err_max', 'err_sht1', 'err_sht2', 'err_scd', 'err_pzem'].map((sensor) => {
                  const tieneError = ultimoEstado[sensor] > 0;
                  return (
                    <div key={sensor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', backgroundColor: tieneError ? '#fff5f5' : '#f0fff4', border: tieneError ? '1px solid #feb2b2' : '1px solid #c6f6d5', fontSize: '12px' }}>
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