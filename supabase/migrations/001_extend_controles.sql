-- Extensión de la tabla controles para control remoto de humedad, CO2 y fotoperiodo.
-- Ejecutar en el SQL Editor de Supabase antes de desplegar backend/firmware/frontend actualizados.

ALTER TABLE controles
  ADD COLUMN IF NOT EXISTS hum_setpoint_min    double precision DEFAULT 88.0,
  ADD COLUMN IF NOT EXISTS hum_setpoint_max    double precision DEFAULT 95.0,
  ADD COLUMN IF NOT EXISTS co2_setpoint_max    integer          DEFAULT 900,
  ADD COLUMN IF NOT EXISTS hora_luz_on         integer          DEFAULT 6,
  ADD COLUMN IF NOT EXISTS hora_luz_off        integer          DEFAULT 18,
  ADD COLUMN IF NOT EXISTS set_humidificador   boolean          DEFAULT false,
  ADD COLUMN IF NOT EXISTS set_luz             integer          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS modo_humidificador  text             DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS modo_luz            text             DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS modo_co2            text             DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS modo_compresor      text             DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS compresor_directo   boolean          DEFAULT false;

-- Asegurar fila de control principal
INSERT INTO controles (id, set_compresor, setpoint_temp)
VALUES (1, true, 20.0)
ON CONFLICT (id) DO NOTHING;
