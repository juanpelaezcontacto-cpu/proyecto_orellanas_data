import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
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

      // Consultas en paralelo para optimizar velocidad
      const [resClima, resEnergia, resEstado] = await Promise.all([
        supabase.from('lecturas_sensores').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('monitoreo_energetico').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('estado_sistema').select('*').order('created_at', { ascending: false }).limit(1)
      ]);

      if (resClima.error) throw resClima.error;
      if (resEnergia.error) throw resEnergia.error;
      if (resEstado.error) throw resEstado.error;

      // 1. Procesar histórico de clima para las gráficas
      const climaFormateado = [...resClima.data].reverse().map(item => {
        const partes = item.created_at.split(/[T ]/);
        return { ...item, hora: partes[1] ? partes[1].substring(0, 8) : '00:00:00' };
      });
      setDatosClima(climaFormateado);

      // 2. Almacenar últimos estados de energía y diagnóstico
      if (resEnergia.data.length > 0) setEnergia(resEnergia.data[0]);
      if (resEstado.data.length > 0) setEstado(resEstado.data[0]);

    } catch (error) {
      console.error('Error de sincronización con Supabase:', error.message);
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

  // Helper para renderizar tarjetas de indicadores rápidamente
  const CardIndicador = ({ icono, titulo, valor, colorIcono, bgIcono }) => (
    <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div style={{ backgroundColor: bgIcono, padding: '10px', borderRadius: '50%', color: colorIcono, display: 'flex' }}>{icono}</div>
      <div>
        <span style={{ fontSize: '13px', color: '#718096', display: 'block', fontWeight: '500' }}>{titulo}</span>
        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a202c' }}>{cargando ? '...' : valor}</span>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f7fafc', minHeight: '100vh', color: '#2d3748' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Centro de Control - Automatización Orellanas</h1>
          <p style={{ color: '#718096', margin: '4px 0 0 0', fontSize: '14px' }}>Monitoreo integral de variables biológicas y eléctricas</p>
        </div>
        <button onClick={consultarTodo} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
          <RefreshCw size={16} /> Actualizar Sistema
        </button>
      </header>

      {/* SECCIÓN 1: VARIABLES MICROCLIMÁTICAS */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', tracking: 'wide', color: '#4a5568', marginBottom: '12px' }}>📊 Sensores de Ambiente</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Interior Inf." valor={`${ultimaLecturaClima.temp_int_inf}°C`} colorIcono="#e53e3e" bgIcono="#fff5f5" />
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Interior Sup." valor={`${ultimaLecturaClima.temp_int_sup}°C`} colorIcono="#dd6b20" bgIcono="#fffaf0" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Hum. Interior Inf." valor={`${ultimaLecturaClima.hum_int_inf}%`} colorIcono="#3182ce" bgIcono="#ebf8ff" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Hum. Interior Sup." valor={`${ultimaLecturaClima.hum_int_sup}%`} colorIcono="#805ad5" bgIcono="#faf5ff" />
          <CardIndicador icono={<Wind size={20} />} titulo="Concentración CO2" valor={`${ultimaLecturaClima.co2_inf} ppm`} colorIcono="#319795" bgIcono="#e6fffa" />
          <CardIndicador icono={<Eye size={20} />} titulo="Temp. Compresor" valor={`${ultimaLecturaClima.temp_comp}°C`} colorIcono="#4a5568" bgIcono="#edf2f7" />
          <CardIndicador icono={<Thermometer size={20} />} titulo="Temp. Exterior" valor={`${ultimaLecturaClima.temp_ext}°C`} colorIcono="#718096" bgIcono="#f7fafc" />
          <CardIndicador icono={<Droplets size={20} />} titulo="Humedad Exterior" valor={`${ultimaLecturaClima.hum_ext}%`} colorIcono="#718096" bgIcono="#f7fafc" />
        </div>
      </section>

      {/* SECCIÓN 2: TELEMETRÍA ENERGÉTICA (PZEM-004T) */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', marginBottom: '12px' }}>⚡ Monitoreo Energético</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <CardIndicador icono={<Zap size={20} />} titulo="Potencia Activa" valor={`${energia.potencia_w} W`} colorIcono="#d69e2e" bgIcono="#fefcbf" />
          <CardIndicador icono={<Gauge size={20} />} titulo="Voltaje de Línea" valor={`${energia.voltaje} V`} colorIcono="#3182ce" bgIcono="#ebf8ff" />
          <CardIndicador icono={<Activity size={20} />} titulo="Corriente Neta" valor={`${energia.corriente_neta} A`} colorIcono="#e53e3e" bgIcono="#fff5f5" />
          <CardIndicador icono={<Gauge size={20} />} titulo="Consumo Acumulado" valor={`${energia.energia_kwh} kWh`} colorIcono="#38a169" bgIcono="#f0fff4" />
          <CardIndicador icono={<Activity size={20} />} titulo="Frecuencia Red" valor={`${energia.frecuencia_hz} Hz`} colorIcono="#4a5568" bgIcono="#edf2f7" />
          <CardIndicador icono={<Gauge size={20} />} titulo="Factor de Potencia" valor={energia.factor_potencia} colorIcono="#805ad5" bgIcono="#faf5ff" />
        </div>
      </section>

      {/* SECCIÓN 3: ACTUADORES & DIAGNÓSTICO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* Sub-bloque Actuadores */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '8px' }}><ToggleLeft color="#4299e1"/> Estado de Actuadores</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.humidificador ? '#f0fff4' : '#edf2f7', color: estado.humidificador ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '13px' }}>💧 Humidificador: {estado.humidificador ? 'ON' : 'OFF'}</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.compresor ? '#f0fff4' : '#edf2f7', color: estado.compresor ? '#2f855a' : '#4a5568', fontWeight: '600', fontSize: '13px' }}>❄️ Compresor: {estado.compresor ? 'ON' : 'OFF'}</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.vent_lateral ? '#e6fffa' : '#edf2f7', color: estado.vent_lateral ? '#234e52' : '#4a5568', fontSize: '13px' }}>💨 Vent. Lateral: {estado.vent_lateral}%</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.vent_superior ? '#e6fffa' : '#edf2f7', color: estado.vent_superior ? '#234e52' : '#4a5568', fontSize: '13px' }}>💨 Vent. Superior: {estado.vent_superior}%</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.vent_co2 ? '#e6fffa' : '#edf2f7', color: estado.vent_co2 ? '#234e52' : '#4a5568', fontSize: '13px' }}>🔄 Extractor CO2: {estado.vent_co2}%</div>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: estado.luz ? '#fffaf0' : '#edf2f7', color: estado.luz ? '#c05621' : '#4a5568', fontSize: '13px' }}>💡 Iluminación: {estado.luz}%</div>
          </div>
        </div>

        {/* Sub-bloque Diagnóstico de Errores */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck color="#38a169"/> Alertas de Hardware</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['err_max', 'err_sht1', 'err_sht2', 'err_scd', 'err_pzem'].map((sensor) => {
              const tieneError = estado[sensor] > 0;
              return (
                <div key={sensor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', padding: '8px 12px', borderRadius: '8px', backgroundColor: tieneError ? '#fff5f5' : '#f0fff4', fontSize: '13px' }}>
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

      {/* GRÁFICAS HISTÓRICAS (Mantienen la estructura anterior) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        {/* GRÁFICA 1:  Temperatura */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>Temperatura</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                <YAxis domain={['auto', 'auto']} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <Legend verticalAlign="top" height={32}/>
                <Line type="monotone" dataKey="temp_int_inf" name="Inferior" stroke="#e53e3e" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="temp_int_sup" name="Superior" stroke="#ed8936" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="temp_ext" name="Exterior" stroke="#718096" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/*Grafica Humedad*/}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#2d3748' }}>Historial de Humedad (%)</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                {/* Forzamos el rango de 0 a 100 porque es humedad relativa */}
                <YAxis domain={[0, 100]} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <Legend verticalAlign="top" height={32}/>
                <Line type="monotone" dataKey="hum_int_inf" name="Interior Inf." stroke="#3182ce" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="hum_int_sup" name="Interior Sup." stroke="#805ad5" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="hum_ext" name="Exterior" stroke="#a0aec0" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/*Grafica CO2*/}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>Temperatura</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 11}} stroke="#a0aec0" />
                <YAxis domain={['auto', 'auto']} tick={{fontSize: 11}} stroke="#a0aec0" />
                <Tooltip />
                <Legend verticalAlign="top" height={32}/>
                <Line type="monotone" dataKey="co2_inf" name="Co2" stroke="#e53e3e" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;