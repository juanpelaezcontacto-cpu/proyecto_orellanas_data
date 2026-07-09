import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine 
} from 'recharts';
import { 
  Thermometer, Droplets, Wind, Eye, 
  Zap, Activity, Gauge, RefreshCw, 
  ToggleLeft, AlertTriangle, ShieldCheck 
} from 'lucide-react';

function App() {
  const [datosClima, setDatosClima] = useState([]);
  const [energia, setEnergia] = useState({ voltaje: 0, corriente_neta: 0, potencia_w: 0, energia_kwh: 0, frecuencia_hz: 0, factor_potencia: 0, resistencia: 0 });
  const [estado, setEstado] = useState({});
  const [cargando, setCargando] = useState(true);

  const consultarTodo = async () => {
    try {
      setCargando(true);
      const [resClima, resEnergia, resEstado] = await Promise.all([
        supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(1)
      ]);

      if (resClima.error) throw resClima.error;
      if (resEnergia.error) throw resEnergia.error;
      if (resEstado.error) throw resEstado.error;

      const climaFormateado = [...resClima.data].reverse().map(item => {
        const partes = item.created_at.split(/[T ]/);
        return { ...item, hora: partes[1] ? partes[1].substring(0, 8) : '00:00:00' };
      });
      setDatosClima(climaFormateado);

      if (resEnergia.data.length > 0) setEnergia(resEnergia.data[0]);
      if (resEstado.data.length > 0) setEstado(resEstado.data[0]);
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    consultarTodo();
  }, []);

  const ultimaLecturaClima = datosClima && datosClima.length > 0 
    ? datosClima[datosClima.length - 1] 
    : { temp_int_inf: 0, hum_int_inf: 0, temp_int_sup: 0, hum_int_sup: 0, temp_ext: 0, hum_ext: 0, co2_inf: 0, temp_comp: 0 };

  // PUNTO 3: Helper de Tarjeta Dinámica con Alertas de Rango Crítico
  const CardIndicador = ({ icono, titulo, valor, valorNumerico, minOptimo, maxOptimo, colorIcono, bgIcono }) => {
    // Validamos si la variable actual está fuera de los rangos óptimos del hongo
    const fueraDeRango = valorNumerico !== undefined && (valorNumerico < minOptimo || valorNumerico > maxOptimo);
    
    return (
      <div style={{ 
        backgroundColor: fueraDeRango ? '#fff5f5' : 'white', // Fondo rojo suave si hay alerta
        border: fueraDeRango ? '1px solid #feb2b2' : '1px solid transparent',
        padding: '16px', 
        borderRadius: '12px', 
        boxShadow: '0 2px 4px rgba(0,0,0,0.03)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '14px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ 
          backgroundColor: fueraDeRango ? '#e53e3e' : bgIcono, 
          padding: '10px', 
          borderRadius: '50%', 
          color: fueraDeRango ? 'white' : colorIcono, 
          display: 'flex' 
        }}>{icono}</div>
        <div>
          <span style={{ fontSize: '13px', color: fueraDeRango ? '#e53e3e' : '#718096', display: 'block', fontWeight: '500' }}>
            {titulo} {fueraDeRango && '⚠️'}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', color: fueraDeRango ? '#9b2c2c' : '#1a202c' }}>
            {cargando ? '...' : valor}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: '#f7fafc', minHeight: '100vh', color: '#2d3748' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#1a202c' }}>Centro de Control - Orellanas IoT</h1>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '14px' }}>Infraestructura de monitoreo microclimático avanzado</p>
        </div>
        <button onClick={consultarTodo} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
          <RefreshCw size={16} /> Sincronizar Datos
        </button>
      </header>

      {/* SECCIÓN INDICADORES AMBIENTALES */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', marginBottom: '12px', letterSpacing: '0.05em' }}>📊 Sensores de Ambiente</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {/* Rangos Óptimos pasados por Props: Temp (20-28°C), Humedad (80-95%), CO2 (0-800ppm) */}
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Interior Inf." valor={`${ultimaLecturaClima.temp_int_inf}°C`} valorNumerico={ultimaLecturaClima.temp_int_inf} minOptimo={20} maxOptimo={28} colorIcono="#e53e3e" bgIcono="#fff5f5" />
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Interior Sup." valor={`${ultimaLecturaClima.temp_int_sup}°C`} valorNumerico={ultimaLecturaClima.temp_int_sup} minOptimo={20} maxOptimo={28} colorIcono="#dd6b20" bgIcono="#fffaf0" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Hum. Interior Inf." valor={`${ultimaLecturaClima.hum_int_inf}%`} valorNumerico={ultimaLecturaClima.hum_int_inf} minOptimo={80} maxOptimo={96} colorIcono="#3182ce" bgIcono="#ebf8ff" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Hum. Interior Sup." valor={`${ultimaLecturaClima.hum_int_sup}%`} valorNumerico={ultimaLecturaClima.hum_int_sup} minOptimo={80} maxOptimo={96} colorIcono="#805ad5" bgIcono="#faf5ff" />
          <CardIndicador icono={<Wind size={20} />} titulo="Concentración CO₂" valor={`${ultimaLecturaClima.co2_inf} ppm`} valorNumerico={ultimaLecturaClima.co2_inf} minOptimo={0} maxOptimo={800} colorIcono="#319795" bgIcono="#e6fffa" />
          <CardIndicador icono={<Eye size={20} />} titulo="Temp. Compresor" valor={`${ultimaLecturaClima.temp_comp}°C`} valorNumerico={ultimaLecturaClima.temp_comp} minOptimo={0} maxOptimo={65} colorIcono="#4a5568" bgIcono="#edf2f7" />
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Exterior" valor={`${ultimaLecturaClima.temp_ext}°C`} colorIcono="#718096" bgIcono="#f7fafc" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Humedad Exterior" valor={`${ultimaLecturaClima.hum_ext}%`} colorIcono="#718096" bgIcono="#f7fafc" />
        </div>
      </section>

      {/* PUNTO 1 Y 2: REJILLA DE GRÁFICAS EN COLUMNAS CON LÍNEAS DE REFERENCIA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* GRÁFICA: TEMPERATURAS (Líneas Curvas Suavas con type="natural") */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748' }}>Historial Térmico Coordenado (°C)</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                <YAxis domain={['auto', 'auto']} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <Legend verticalAlign="top" height={32}/>
                {/* Líneas de referencia óptimas para el hongo */}
                <ReferenceLine y={20} stroke="#fc8181" strokeDasharray="3 3" label={{ value: 'Mín', fill: '#e53e3e', fontSize: 10 }} />
                <ReferenceLine y={28} stroke="#fc8181" strokeDasharray="3 3" label={{ value: 'Máx', fill: '#e53e3e', fontSize: 10 }} />
                <Line type="natural" dataKey="temp_int_inf" name="Inf." stroke="#e53e3e" strokeWidth={2.5} dot={false} />
                <Line type="natural" dataKey="temp_int_sup" name="Sup." stroke="#ed8936" strokeWidth={2.5} dot={false} />
                <Line type="natural" dataKey="temp_ext" name="Ext." stroke="#718096" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICA: HUMEDADES */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748' }}>Historial de Humedad Relativa (%)</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                <YAxis domain={[0, 100]} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <Legend verticalAlign="top" height={32}/>
                {/* Línea de umbral crítico de deshidratación */}
                <ReferenceLine y={80} stroke="#63b3ed" strokeDasharray="4 4" label={{ value: 'Crítico 80%', fill: '#3182ce', fontSize: 10 }} />
                <Line type="natural" dataKey="hum_int_inf" name="Inf." stroke="#3182ce" strokeWidth={2.5} dot={false} />
                <Line type="natural" dataKey="hum_int_sup" name="Sup." stroke="#805ad5" strokeWidth={2.5} dot={false} />
                <Line type="natural" dataKey="hum_ext" name="Ext." stroke="#a0aec0" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICA: AREA CHART PARA CO2 (Efecto de llenado traslúcido) */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748' }}>Acumulación de CO₂ en Cámara (ppm)</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={datosClima}>
                <defs>
                  <linearGradient id="colorCo2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#319795" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#319795" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                <YAxis domain={['auto', 'auto']} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <ReferenceLine y={800} stroke="#e53e3e" strokeDasharray="3 3" label={{ value: 'Límite Renovación Aire', fill: '#e53e3e', fontSize: 11, position: 'top' }} />
                <Area type="natural" dataKey="co2_inf" name="CO₂ Interior" stroke="#319795" fillOpacity={1} fill="url(#colorCo2)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* SECCIÓN 3: ENERGÍA */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', marginBottom: '12px', letterSpacing: '0.05em' }}>⚡ Monitoreo Eléctrico (PZEM)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <CardIndicador icono={<Zap size={20} />} titulo="Potencia Activa" valor={`${energia.potencia_w} W`} colorIcono="#d69e2e" bgIcono="#fefcbf" />
          <CardIndicador icono={<Gauge size={20} />} titulo="Voltaje de Línea" valor={`${energia.voltaje} V`} colorIcono="#3182ce" bgIcono="#ebf8ff" />
          <CardIndicador icono={<Activity size={20} />} titulo="Corriente Neta" valor={`${energia.corriente_neta} A`} colorIcono="#e53e3e" bgIcono="#fff5f5" />
          <CardIndicador icono={<Gauge size={20} />} titulo="Consumo Total" valor={`${energia.energia_kwh} kWh`} colorIcono="#38a169" bgIcono="#f0fff4" />
        </div>
      </section>

      {/* ACTUADORES & COMPONENTES DE DIAGNÓSTICO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ToggleLeft color="#4299e1"/> Estado de Actuadores</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.humidificador ? '#f0fff4' : '#edf2f7', color: estado.humidificador ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '13px' }}>💧 Humidificador: {estado.humidificador ? 'ON' : 'OFF'}</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.compresor ? '#f0fff4' : '#edf2f7', color: estado.compresor ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '13px' }}>❄️ Compresor: {estado.compresor ? 'ON' : 'OFF'}</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.vent_lateral ? '#e6fffa' : '#edf2f7', color: estado.vent_lateral ? '#234e52' : '#4a5568', fontSize: '13px' }}>💨 Vent. Lateral: {estado.vent_lateral}%</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.vent_superior ? '#e6fffa' : '#edf2f7', color: estado.vent_superior ? '#234e52' : '#4a5568', fontSize: '13px' }}>💨 Vent. Superior: {estado.vent_superior}%</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck color="#38a169"/> Alertas de Hardware</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['err_max', 'err_sht1', 'err_sht2', 'err_scd', 'err_pzem'].map((sensor) => {
              const tieneError = estado[sensor] > 0;
              return (
                <div key={sensor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', backgroundColor: tieneError ? '#fff5f5' : '#f0fff4', fontSize: '13px' }}>
                  <span style={{ fontWeight: '500', textTransform: 'uppercase' }}>{sensor.replace('err_', 'Sensor ')}</span>
                  {tieneError ? (
                    <span style={{ color: '#e53e3e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}><AlertTriangle size={14}/> Falla ({estado[sensor]})</span>
                  ) : (
                    <span style={{ color: '#38a169', fontWeight: '600' }}>OK</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;