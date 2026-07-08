import os
import json
import serial
import time
import threading
from dotenv import load_dotenv
from supabase import create_client, Client
import socket
from datetime import datetime
from zoneinfo import ZoneInfo

# Configuración de Red local basada en tu ipconfig
TCP_IP = '0.0.0.0'  # Escucha cualquier petición en la red local
TCP_PORT = 5005     # El puerto que ya probamos con éxito
BUFFER_SIZE = 4096  # Búfer más grande para prevenir cortes en el JSON

conn = None         # Variable global para guardar la conexión activa con la ESP32

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
#PUERTO_SERIAL = "COM4"  
#BAUD_RATE = 115200
#serial_lock = threading.Lock() # Evita que los dos hilos escriban/lean al mismo tiempo

#try:
#    arduino = serial.Serial(port=PUERTO_SERIAL, baudrate=BAUD_RATE, timeout=1)
#    time.sleep(2)  # Esperar a que la ESP32 se estabilice tras abrir el puerto
#    print(f"🔌 Conectado exitosamente al puerto {PUERTO_SERIAL}")
#except Exception as e:
#    print(f"❌ Error al abrir el puerto serial {PUERTO_SERIAL}: {e}")
#    exit(1)

# 3. Configuración del servidor Wifi
def iniciar_servidor_wifi():
    global conn
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((TCP_IP, TCP_PORT))
    s.listen(1)
    print(f"🔌 Servidor Wi-Fi esperando conexión en el puerto {TCP_PORT}...")
    
    # El programa se pausará aquí hasta que la ESP32 se encienda y se conecte
    conn, addr = s.accept()
    print(f"📡 Conectado exitosamente vía Wi-Fi con la ESP32 desde: {addr}")
    
    # Una vez conectados, lanzamos el hilo en segundo plano para escuchar la telemetría
    hilo_escucha = threading.Thread(target=escuchar_esp32_wifi, daemon=True)
    hilo_escucha.start()



# 4. HILO DE BAJADA: Escuchar Cambios en Supabase (Polling Eficiente Asíncrono)
def escuchar_controles_nube():
    print("📡 Hilo de escucha de controles activado.")
    # Registro del último estado conocido para solo enviar comandos si realmente cambian
    ultimo_estado = {
        "compresor": None,
        "humidificador": None,
        "vent_co2": None,
        "vent_lateral": None,
        "vent_superior": None,
        "luz": None
    }
    
    while True:
        try:
            # Consultar la fila única de control (ID=1)
            res = supabase.table("controles").select("*").eq("id", 1).execute()
            if res.data:
                control = res.data[0]
                
                # Extraer valores de la nube
                c_nube = 1 if control.get("set_compresor") else 0
                h_nube = 1 if control.get("set_humidificador") else 0
                v_co2_nube = control.get("set_vent_co2", 0)
                v_lat_nube = control.get("set_vent_lateral", 0)
                v_sup_nube = control.get("set_vent_superior", 0)
                luz_nube = control.get("set_luz", 0)
                
                # --- PROCESAR COMPRESOR ---
                if c_nube != ultimo_estado["compresor"]:
                    comando = f"compresor:{c_nube}\n"
                    if conn:    # Verificamos que la ESP32 esté conectada por Wi-Fi
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 -> {comando.strip()}")
                            ultimo_estado["compresor"] = c_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else:
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                    time.sleep(0.2)
                
                # --- PROCESAR HUMIDIFICADOR ---
                if h_nube != ultimo_estado["humidificador"]:
                    comando = f"humidificador:{h_nube}\n"
                    if conn:    # Verificamos que la ESP32 esté conectada por Wi-Fi
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 -> {comando.strip()}")
                            ultimo_estado["humidificador"] = h_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else:
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                    time.sleep(0.2)

                # --- PROCESAR VENTILADOR CO2 ---
                if v_co2_nube != ultimo_estado["vent_co2"]:
                    comando = f"vent_co2:{v_co2_nube}\n"
                    if conn:    # Verificamos que la ESP32 esté conectada por Wi-Fi
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 -> {comando.strip()}")
                            ultimo_estado["vent_co2"] = v_co2_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else:
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                    time.sleep(0.2)
                
                # --- PROCESAR VENTILADOR LATERAL ---
                if v_lat_nube != ultimo_estado["vent_lateral"]:
                    comando = f"vent_lateral:{v_lat_nube}\n"
                    if conn:    # Verificamos que la ESP32 esté conectada por Wi-Fi
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 -> {comando.strip()}")
                            ultimo_estado["vent_lateral"] = v_lat_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else:
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                    time.sleep(0.2)

                # --- PROCESAR VENTILADOR SUPERIOR ---
                if v_sup_nube != ultimo_estado["vent_superior"]:
                    comando = f"vent_superior:{v_sup_nube}\n"
                    if conn:    # Verificamos que la ESP32 esté conectada por Wi-Fi
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 vía Wi-Fi -> {comando.strip()}")
                            ultimo_estado["vent_superior"] = v_sup_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else: 
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                    time.sleep(0.2)

                # --- PROCESAR LUZ ---
                if luz_nube != ultimo_estado["luz"]:
                    comando = f"luz:{luz_nube}\n"
                    if conn:
                        try:
                            conn.send(comando.encode('utf-8'))  # 📡 Se envía por el aire
                            print(f"📤 Comando enviado a ESP32 vía Wi-Fi -> {comando.strip()}")
                            ultimo_estado["luz"] = luz_nube
                        except Exception as e:
                            print(f"❌ Error al enviar comando al ventilador por Wi-Fi: {e}")
                    else:
                        print("⚠️ No se pudo enviar comando: ESP32 desconectada por Wi-Fi.")
                time.sleep(0.1)

        except Exception as e:
            print(f"⚠️ Error en hilo de lectura de nube: {e}")
            
        time.sleep(1.5) # Muestreo de control cada 1.5 segundos para no saturar API

# Iniciar el hilo de control de bajada en segundo plano
hilo_control = threading.Thread(target=escuchar_controles_nube, daemon=True)
hilo_control.start()

@app.post("/telemetria", status_code=201)
def procesar_datos_esp32(data: Telemetria):
    try:
        # 1. Obtener la estampa de tiempo exacta de Colombia
        hora_colombia = datetime.now(ZoneInfo("America/Bogota")).isoformat()

        # 2. SEPARACIÓN MODULAR DE DATOS (Alineado con tus 3 tablas en Supabase)
        lecturas_sensores = {
            "timestamp": hora_colombia,
            "temp_comp": data.temp_comp,
            "temp_ext": data.t1,          # t1 es temp_ext según tu molde anterior
            "hum_ext": data.h1,           # h1 es hum_ext
            "temp_int_sup": data.t2,      # t2 es temp_int_sup
            "hum_int_sup": data.h2,       # h2 es hum_int_sup
            "temp_int_inf": data.t_inf,
            "hum_int_inf": data.h_inf,
            "co2_inf": data.co2
        }

        monitoreo_energetico = {
            "timestamp": hora_colombia,
            "voltaje": data.pzem_voltaje,
            "corriente_neta": data.pzem_corriente,
            "potencia_w": data.pzem_potencia,
            "energia_kwh": data.pzem_energia,
            "frecuencia_hz": data.pzem_frecuencia,
            "factor_potencia": data.pzem_pf,
            "resistencia": data.resistencia
        }

        datos_estado = {
            "timestamp": hora_colombia,
            "err_max": data.err_max,
            "err_sht1": data.err_sht1,
            "err_sht2": data.err_sht2,
            "err_scd": data.err_scd,
            "err_pzem": data.err_pzem,
            "vent_lateral": data.pwm_vent_lateral,
            "vent_superior": data.pwm_vent_superior,
            "vent_co2": data.pwm_vent_co2,
            "luz": data.pwm_luz,
            "pwm_auxiliar": data.pwm_aux,
            "humidificador": 1 if data.estado_humidificador else 0, # Convierte bool a int (0 o 1)
            "compresor": 1 if data.estado_compresor else 0,         # Convierte bool a int (0 o 1)
            "puerta": data.estadoPuerta,
            "compresor_disponible": 1 if data.tiempo_restante_ciclo == 0 else 0 # Lógica según el tiempo restante
        }

        res = supabase.table("controles").select("*").eq("id", 1).execute()
        
        # Valores por defecto por seguridad si la tabla está vacía
        comandos_esp32 = {
            "compresor": 0,
            "humidificador": 0,
            "vent_co2": 0,
            "vent_lateral": 0,
            "vent_superior": 0,
            "luz": 0
        }

        if res.data:
            control = res.data[0]
            comandos_esp32 = {
                "compresor": 1 if control.get("set_compresor") else 0,
                "humidificador": 1 if control.get("set_humidificador") else 0,
                "vent_co2": control.get("set_vent_co2", 0),
                "vent_lateral": control.get("set_vent_lateral", 0),
                "vent_superior": control.get("set_vent_superior", 0),
                "luz": control.get("set_luz", 0)
            }
            print(f"📡 Comandos leídos de Supabase y listos para enviar: {comandos_esp32}")

        # 3. SUBIDA A SUPABASE CONSECUTIVA (Ya no necesitas hilos independientes, FastAPI no se bloquea)
        supabase.table("lecturas_sensores").insert(lecturas_sensores).execute()
        supabase.table("monitoreo_energetico").insert(monitoreo_energetico).execute()
        supabase.table("estado_sistema").insert(datos_estado).execute()

        # ==================================================================
        # 4. TU REPORTE ESTRUCTURADO EN CONSOLA (Formateo visual original)
        # ==================================================================
        comp_status = "ON" if data.estado_compresor else "OFF"
        hum_status = "ON" if data.estado_humidificador else "OFF"
        puerta_status = "ABIERTA" if data.estadoPuerta == 1 else "CERRADA"
        ciclo_comp_status = "🟢 LISTO" if data.tiempo_restante_ciclo == 0 else f"🔴 PROTEGIDO ({data.tiempo_restante_ciclo}s)"

        err_m = "❌ FAIL" if data.err_max else "OK"
        err_s1 = "❌ FAIL" if data.err_sht1 else "OK"
        err_s2 = "❌ FAIL" if data.err_sht2 else "OK"
        err_sc = "❌ FAIL" if data.err_scd else "OK"
        err_pz = "❌ FAIL" if data.err_pzem else "OK"

        print("\n" + "="*130)
        print(f"📊 LOG SISTEMA ORELLANAS | [{hora_colombia}] | 💾 Nube: SYNCHRONIZED")
        print("-"*130)
        print(f"🌱 AMBIENTE: T_Sup: {lecturas_sensores['temp_int_sup']}°C | T_Inf: {lecturas_sensores['temp_int_inf']}°C | T_Ext: {lecturas_sensores['temp_ext']}°C | T_Comp: {lecturas_sensores['temp_comp']}°C")
        print(f"🌱 AMBIENTE: H_Sup: {lecturas_sensores['hum_int_sup']}%  | H_Inf: {lecturas_sensores['hum_int_inf']}%  | H_Ext: {lecturas_sensores['hum_ext']}%  | CO2: {lecturas_sensores['co2_inf']} ppm")
        print("-"*130)
        print(f"⚡ ENERGÍA:  {monitoreo_energetico['voltaje']} V | {monitoreo_energetico['corriente_neta']} A | {monitoreo_energetico['potencia_w']} W | Energía: {monitoreo_energetico['energia_kwh']} kWh | Frecuencia: {monitoreo_energetico['frecuencia_hz']} Hz | fp: {monitoreo_energetico['factor_potencia']}")
        print("-"*130)
        print(f"⚙️  ACTUADORES:  Compresor: [{comp_status}] | Humidificador: [{hum_status}] | Vent_CO2: {datos_estado['vent_co2']} PWM | Vent_Superior: {datos_estado['vent_superior']} PWM | Vent_lateral: {datos_estado['vent_lateral']} PWM | Luz: {datos_estado['luz']} PWM")
        print("-"*130)
        print(f"🚨 DIAGNOS:  MAX: {err_m} | SHT40_Ext: {err_s1} | SHT40_Int: {err_s2} | SCD40: {err_sc} | PZEM: {err_pz} | 🚪 Puerta: {puerta_status} | Ciclo_compresor: {ciclo_comp_status}")
        print("="*130)

        # 5. Respuesta de control inmediata para la ESP32 (Aprovechando la misma transacción web)
        return {"status": "success", "message": "Datos sincronizados"}

    except Exception as e:
        print(f"⚠️ Error al procesar telemetría o subir a Supabase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


