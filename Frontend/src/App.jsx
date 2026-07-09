import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Thermometer, Droplets, RefreshCw } from 'lucide-react';

function App() {
  const [datosClima, setDatosClima] = useState([]);
  const [cargando, setCargando] = useState(true);

  const consultarDatos = async () => {
    try {
      setCargando(true);
      // 1. Traemos todas las columnas necesarias de temperatura y humedad
      const { data, error } = await supabase
        .from('lecturas_sensores')
        .select('created_at, temp_int_inf, temp_int_sup, temp_ext, hum_int_inf, hum_int_sup, hum_ext')
        .order('created_at', { ascending: false })
        .limit(1000); // Reducimos a 50 para que las ráfagas no saturen la vista

      if (error) throw error;

      const datosFormateados = [...data].reverse().map(item => {
        const partes = item.created_at.split(/[T ]/);
        const horaCruda = partes[1] ? partes[1].substring(0, 8) : '00:00:00';
        return { ...item, hora: horaCruda };
      });

      setDatosClima(datosFormateados);
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    consultarDatos();
  }, []);

  const ultima = datosClima && datosClima.length > 0 
    ? datosClima[datosClima.length - 1] 
    : { temp_int_inf: 0, hum_int_inf: 0 };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      
      {/* Header con estilo profesional */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 'bold', color: '#1a202c', margin: 0 }}>Dashboard de Producción - Orellanas</h1>
          <p style={{ color: '#718096', marginTop: '5px' }}>Análisis de gradientes climáticos en tiempo real</p>
        </div>
        <button 
          onClick={consultarDatos} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3182ce', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', transition: '0.3s' }}
        >
          <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} /> Actualizar Datos
        </button>
      </header>

      {/* Grid de Gráficas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* GRÁFICA DE TEMPERATURAS */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Thermometer color="#e53e3e" />
            <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Comparativa de Temperaturas (°C)</h2>
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 12}} stroke="#a0aec0" />
                <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#a0aec0" />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36}/>
                <Line type="monotone" dataKey="temp_int_inf" name="Interior Inf." stroke="#e53e3e" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="temp_int_sup" name="Interior Sup." stroke="#ed8936" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="temp_ext" name="Exterior" stroke="#2d3748" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICA DE HUMEDAD */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Droplets color="#3182ce" />
            <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Comparativa de Humedad (%)</h2>
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={datosClima}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="hora" tick={{fontSize: 12}} stroke="#a0aec0" />
                <YAxis domain={[0, 100]} tick={{fontSize: 12}} stroke="#a0aec0" />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={36}/>
                <Line type="monotone" dataKey="hum_int_inf" name="Humedad Inf." stroke="#3182ce" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="hum_int_sup" name="Humedad Sup." stroke="#805ad5" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="hum_ext" name="Exterior" stroke="#718096" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;