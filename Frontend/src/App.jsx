import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Thermometer, Droplets, Activity } from 'lucide-react';

function App() {
  const [datosClima, setDatosClima] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Función para traer los datos históricos de Supabase
  const consultarDatos = async () => {
    try {
      setCargando(true);
      
      // Pedimos las últimas 100 lecturas en orden descendente
      const { data, error } = await supabase
        .from('lecturas_sensores')
        .select('created_at, temp_int_inf, hum_int_inf')
        .order('created_at', { ascending: false }) 
        .limit(10000);

      if (error) throw error;

      // Invertimos el arreglo para que la gráfica pinte de izquierda a derecha
      const datosCronologicos = [...data].reverse();

      // FORMATEO DIRECTO: Extraemos la hora sin pasar por conversiones de zona horaria
      const datosFormateados = datosCronologicos.map(item => {
        // Si created_at viene como "2026-07-09 13:45:00", dividimos por el espacio o la 'T'
        const partes = item.created_at.split(/[T ]/);
        const horaCruda = partes[1] ? partes[1].substring(0, 8) : '00:00:00'; // Toma HH:MM:SS

        return {
          ...item,
          hora: horaCruda
        };
      });

      setDatosClima(datosFormateados);
    } catch (error) {
      console.error('Error cargando datos de Supabase:', error.message);
    } finally {
      setCargando(false);
    }
  };

  // useEffect ejecuta la consulta automáticamente cuando la página se abre
  useEffect(() => {
    consultarDatos();
  }, []);

  // Obtenemos la última lectura para mostrarla en tarjetas analógicas superiores
  const ultimaLectura = datosClima && datosClima.length > 0 
  ? datosClima[datosClima.length - 1] 
  : { temp_int_inf: 0, hum_int_inf: 0 };
  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      
      {/* Encabezado */}
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
          🍄 Telemetría de Orellanas
        </h1>
        <p style={{ color: '#4b5563', margin: '4px 0 0 0' }}>Monitoreo climático automatizado</p>
      </header>

      {/* Tarjetas de Estado Actual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        {/* Tarjeta Temperatura */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: '#fee2e2', padding: '12px', borderRadius: '50%', color: '#ef4444' }}>
            <Thermometer size={28} />
          </div>
          <div>
            <span style={{ fontSize: '14px', color: '#6b7280', display: 'block' }}>Temp. Inferior</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{cargando ? '...' : `${ultimaLectura.temp_int_inf}°C`}</span>
          </div>
        </div>

        {/* Tarjeta Humedad */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: '#e0f2fe', padding: '12px', borderRadius: '50%', color: '#0ea5e9' }}>
            <Droplets size={28} />
          </div>
          <div>
            <span style={{ fontSize: '14px', color: '#6b7280', display: 'block' }}>Humedad Inferior</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{cargando ? '...' : `${ultimaLectura.hum_int_inf}%`}</span>
          </div>
        </div>

      </div>

      {/* Contenedor de la Gráfica */}
      <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#374151', margin: 0 }}>Histórico Climático (Ráfagas)</h2>
          <button onClick={consultarDatos} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            Actualizar
          </button>
        </div>

        {cargando ? (
          <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            Cargando telemetría...
          </div>
        ) : (
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hora" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="temp_int_inf" name="Temperatura (°C)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="hum_int_inf" name="Humedad (%)" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
}

export default App;