import os
import json
# import serial
import time
import threading
from dotenv import load_dotenv
from supabase import create_client, Client
import socket

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

def subir_a_supabase_background(lecturas, energia, estado):
    """Función auxiliar que se ejecuta en su propio hilo para no congelar el Wi-Fi"""
    try:
        supabase.table("lecturas_sensores").insert(lecturas).execute()
        supabase.table("monitoreo_energetico").insert(energia).execute()
        supabase.table("estado_sistema").insert(estado).execute()
    except Exception as e:
        print(f"⚠️ Error al subir datos a Supabase (Segundo plano): {e}")

# 5. HILO PRINCIPAL: Escucha Serial y Subida de Telemetría (Uplink)
def escuchar_esp32_wifi():
    global conn
    búfer_datos = ""
    while True:
        try:
            # Recibir fragmentos de datos desde el aire
            datos_recibidos = conn.recv(BUFFER_SIZE).decode('utf-8', errors='ignore')
            if not datos_recibidos:
                print("⚠️ ESP32 desconectada del socket.")
                break
                
            búfer_datos += datos_recibidos
            
            # Cortamos los datos por el salto de línea '\n' que envía client.println()
            if "\n" in búfer_datos:
                lineas = búfer_datos.split("\n")
                búfer_datos = lineas[-1]  # Guarda fragmentos huérfanos si los hay
                
                for linea in lineas[:-1]:
                    linea = linea.strip()
                    
                    if linea:
                        # MANTENEMOS TU LÓGICA DE VALIDACIÓN EXACTA:
                        if linea.startswith("{") and linea.endswith("}"):
                            try:
                                datos = json.loads(linea)
                                
                                # FILTRADO: El JSON es válido si trae datos de sensores
                                if "temp_comp" in datos:
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
                                # FILTRADO: El JSON es válido si trae datos energía
                                if("voltaje" in datos):
                                    monitoreo_energetico = {
                                        "voltaje": datos.get("voltaje"),
                                        "corriente_neta": datos.get("corriente_neta"),
                                        "potencia_w": datos.get("potencia_w"),
                                        "energia_kwh": datos.get("energia_kwh"),
                                        "frecuencia_hz": datos.get("frecuencia_hz"),
                                        "factor_potencia": datos.get("factor_potencia"),
                                        "resistencia": datos.get("resistencia")
                                    }
                                # FILTRADO: El JSON es válido si trae datos de estado
                                if("err_max" in datos):
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
                                        "puerta": datos.get("puerta"),
                                        "compresor_disponible": datos.get("compresor_disponible")
                                    }
                                
                                    # ==================================================================
                                    # 🔥 OPTIMIZACIÓN CRÍTICA: Lanzar la subida en un hilo independiente
                                    # ==================================================================
                                    h_subida = threading.Thread(
                                        target=subir_a_supabase_background, 
                                        args=(lecturas_sensores, monitoreo_energetico, datos_estado),
                                        daemon=True
                                    )
                                    h_subida.start()
                                    
                                    hora_actual = time.strftime('%H:%M:%S')
                                    
                                    # Formatear estados de actuadores para lectura rápida
                                    comp_status = "ON" if datos_estado["compresor"] else "OFF"
                                    hum_status = "ON" if datos_estado["humidificador"] else "OFF"
                                    puerta_status = "ABIERTA" if datos_estado["puerta"] == 1 else "CERRADA"
                                    ciclo_comp_status = "🟢 LISTO" if datos_estado["compresor_disponible"] else f"🔴 PROTEGIDO ({datos.get('tiempo_ciclo_compresor', 0)}s)"

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
                                    print(f"🚨 DIAGNOS:  MAX: {err_m} | SHT40_Ext: {err_s1} | SHT40_Int: {err_s2} | SCD40: {err_sc} | PZEM: {err_pz} | 🚪 Puerta: {puerta_status} | Ciclo_compresor: {ciclo_comp_status}")
                                    print("="*130)
                                    pass
                        
                            except json.JSONDecodeError:
                                # Ignorar ruido de arranque o tramas seriales corruptas
                                pass
                            except Exception as e:
                                print(f"⚠️ Error al subir datos a Supabase: {e}")
                                break
                                
                    time.sleep(0.01) # Pequeña pausa para no saturar el procesador de la PC
        except Exception as e:
                    print(f"⚠️ Error inesperado en el bucle: {e}")
                    time.sleep(1)
if __name__ == "__main__":
    print("⚡ Conexión inicializada con Supabase.")
    
    # Arranca el servidor (Se queda pausado aquí hasta que la ESP32 se conecte)
    iniciar_servidor_wifi()
    
    # Mantener vivo el programa principal mientras los hilos trabajan de fondo
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Gateway detenido por el usuario.")