import os
import json
import serial
import time
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Cargar variables de entorno ocultas
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: No se encontraron las credenciales en el archivo .env")
    exit(1)

# 2. Inicializar cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("⚡ Conexión inicializada con Supabase.")

# 3. Configuración del Puerto Serial
# Configura el puerto COM correcto (ej. 'COM4' en Windows o '/dev/ttyUSB0' en Linux/Mac)
PUERTO_SERIAL = "COM4"  
BAUD_RATE = 115200

try:
    arduino = serial.Serial(port=PUERTO_SERIAL, baudrate=BAUD_RATE, timeout=1)
    time.sleep(2)  # Esperar a que la ESP32 se estabilice tras abrir el puerto
    print(f"🔌 Conectado exitosamente al puerto {PUERTO_SERIAL}")
except Exception as e:
    print(f"❌ Error al abrir el puerto serial {PUERTO_SERIAL}: {e}")
    exit(1)

# 4. Bucle principal de escucha y transmisión
while True:
    try:
        if arduino.in_waiting > 0:
            # Leer línea entrante y decodificarla eliminando espacios en blanco
            linea = arduino.readline().decode('utf-8', errors='ignore').strip()
            
            if not linea:
                continue
                
            # Validar si el texto tiene estructura de JSON
            if linea.startswith("{") and linea.endswith("}"):
                try:
                    datos = json.loads(linea)
                    
                    # FILTRADO: Identificar si es un JSON de telemetría (sensores)
                    # Comprobamos que contenga llaves críticas para no confundirlo con respuestas de comandos
                    if "temp_comp" in datos and "co2_inf" in datos:

                        # Separación Modular de Datos
                        lecturas_sensores = {
                            "temp_comp": datos.get("temp_comp"),
                            "temp_ext": datos.get("temp_ext"),
                            "hum_ext": datos.get("hum_ext"),
                            "temp_int_sup": datos.get("temp_int_sup"),
                            "hum_int_sup": datos.get("hum_int_sup"),
                            "temp_int_inf": datos.get("temp_int_inf"),
                            "hum_int_inf": datos.get("hum_int_inf"),
                            "co2_inf": datos.get("co2_inf")
                        }

                        monitoreo_energetico = {
                            "voltaje": datos.get("voltaje"),
                            "corriente_neta": datos.get("corriente_neta"),
                            "potencia_w": datos.get("potencia_w"),
                            "energia_kwh": datos.get("energia_kwh"),
                            "frecuencia_hz": datos.get("frecuencia_hz"),
                            "factor_potencia": datos.get("factor_potencia"),
                            "resistencia": datos.get("resistencia")
                        }

                        datos_estado = {
                            "err_max": datos.get("err_max"),
                            "err_sht1": datos.get("err_sht1"),
                            "err_sht2": datos.get("err_sht2"),
                            "err_scd": datos.get("err_scd"),
                            "err_pzem": datos.get("err_pzem"),
                            "vent_lateral": datos.get("vent_lateral"),
                            "vent_superior": datos.get("vent_superior"),
                            "vent_co2": datos.get("vent_co2"),
                            "luz": datos.get("luz"),
                            "pwm_auxiliar": datos.get("pwm_auxiliar"),
                            "humidificador": datos.get("humidificador"),
                            "compresor": datos.get("compresor"),
                            "puerta": datos.get("puerta")
                        }
                    
                        # Inserciones independientes en Supabase
                        supabase.table("lecturas_sensores").insert(lecturas_sensores).execute()
                        supabase.table("monitoreo_energetico").insert(monitoreo_energetico).execute()
                        supabase.table("estado_sistema").insert(datos_estado).execute()
                        
                        hora_actual = time.strftime('%H:%M:%S')
                        
                        # Formatear estados de actuadores para lectura rápida
                        comp_status = "ON" if datos_estado["compresor"] else "OFF"
                        hum_status = "ON" if datos_estado["humidificador"] else "OFF"
                        puerta_status = "ABIERTA" if datos_estado["puerta"] == 1 else "CERRADA"

                        # Formatear estados de error (0 = OK, 1 = FALLA)
                        err_m = "❌ FAIL" if datos_estado["err_max"] else "OK"
                        err_s1 = "❌ FAIL" if datos_estado["err_sht1"] else "OK"
                        err_s2 = "❌ FAIL" if datos_estado["err_sht2"] else "OK"
                        err_sc = "❌ FAIL" if datos_estado["err_scd"] else "OK"
                        err_pz = "❌ FAIL" if datos_estado["err_pzem"] else "OK"

                        # Imprimir reporte estructurado
                        print("\n" + "="*130)
                        print(f"📊 LOG SISTEMA ORELLANAS | [{hora_actual}] | 💾 Nube: SYNCHRONIZED")
                        print("-"*130)
                        print(f"🌱 AMBIENTE: T_Sup: {lecturas_sensores['temp_int_sup']}°C | T_Inf: {lecturas_sensores['temp_int_inf']}°C | T_Ext: {lecturas_sensores['temp_ext']}°C | T_Comp: {lecturas_sensores['temp_comp']}°C")
                        print(f"🌱 AMBIENTE: H_Sup: {lecturas_sensores['hum_int_sup']}%  | H_Inf: {lecturas_sensores['hum_int_inf']}%  | H_Ext: {lecturas_sensores['hum_ext']}%  | CO2: {lecturas_sensores['co2_inf']} ppm")
                        print("-"*130)
                        print(f"⚡ ENERGÍA:  {monitoreo_energetico['voltaje']} V | {monitoreo_energetico['corriente_neta']} A | {monitoreo_energetico['potencia_w']} W | Energía: {monitoreo_energetico['energia_kwh']} kWh | Frecuencia: {monitoreo_energetico['frecuencia_hz']} Hz | fp: {monitoreo_energetico['factor_potencia']}")
                        print("-"*130)
                        print(f"⚙️  ACTUADORES:  Compresor: [{comp_status}] | Humidificador: [{hum_status}] | Vent_CO2: {datos_estado['vent_co2']} PWM | Vent_Superior: {datos_estado['vent_superior']} PWM | Vent_lateral: {datos_estado['vent_lateral']} PWM |Luz: {datos_estado['luz']} PWM")
                        print("-"*130)
                        print(f"🚨 DIAGNOS:  MAX: {err_m} | SHT40_Ext: {err_s1} | SHT40_Int: {err_s2} | SCD40: {err_sc} | PZEM: {err_pz} | 🚪 Puerta: {puerta_status}")
                        print("="*130)
            
                except json.JSONDecodeError:
                    # Ignorar ruido de arranque o tramas seriales corruptas
                    pass
                except Exception as e:
                    print(f"⚠️ Error al subir datos a Supabase: {e}")
                    
        time.sleep(0.01) # Pequeña pausa para no saturar el procesador de la PC
        
    except KeyboardInterrupt:
        print("\n🛑 Gateway detenido por el usuario.")
        arduino.close()
        break
    except Exception as e:
        print(f"⚠️ Error inesperado en el bucle: {e}")
        time.sleep(1)