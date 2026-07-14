import os
import json
import hmac
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Optional, List
import asyncio

# Inicializar la aplicación web
app = FastAPI(
    title="API de Telemetría - Sistema Orellanas",
    description="Gateway HTTP para el monitoreo automatizado de hongos Orellanas",
    version="1.0.0"
)

# 1. Cargar variables de entorno ocultas
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
API_SECRET_ESP32 = os.getenv("API_SECRET_ESP32")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: No se encontraron las credenciales en el archivo .env")
    exit(1)

# Mismo criterio que las credenciales de Supabase: si no está configurado,
# el servicio no arranca. Un backend que acepta escribir en tu cultivo sin
# autenticación no es aceptable como comportamiento por defecto.
if not API_SECRET_ESP32:
    print("❌ Error: No se encontró API_SECRET_ESP32 en las variables de entorno. "
          "Debe coincidir exactamente con el valor de API_SECRET_ESP32 en el firmware.")
    exit(1)

# 2. Inicializar cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("⚡ Conexión inicializada con Supabase.")


async def verificar_api_key(x_api_key: str = Header(None)):
    """
    Dependencia de autenticación para /telemetria. Usa comparación de tiempo
    constante (hmac.compare_digest) para no filtrar el secreto por diferencias
    de tiempo de respuesta entre intentos de fuerza bruta.
    """
    if not x_api_key or not hmac.compare_digest(x_api_key, API_SECRET_ESP32):
        raise HTTPException(status_code=401, detail="API key inválida o ausente")


# =====================================================================
# 2. MODELOS DE VALIDACIÓN DE DATOS (PYDANTIC) - REGISTRO TOTAL
# =====================================================================

# SUB-MODELO: Representa la foto completa del sistema tomada cada 5 segundos
class RegistroCompletoHistorial(BaseModel):
    # Diagnóstico (Errores)
    err_max: int
    err_sht1: int  
    err_sht2: int  
    err_scd: int
    err_pzem: int

    # Sensores Ambiente
    temp_comp: float
    temp_ext: float          
    hum_ext: float           
    temp_int_sup: float      
    hum_int_sup: float       
    temp_int_inf: float
    hum_int_inf: float  
    co2_inf: int           
    resistencia: float
    puerta: int

    # Consumo Eléctrico
    voltaje: Optional[float] = None
    corriente_neta: Optional[float] = None
    potencia_w: Optional[float] = None
    energia_kwh: Optional[float] = None
    frecuencia_hz: Optional[float] = None
    factor_potencia: Optional[float] = None

    # Variables de estado de actuadores (Salidas)
    vent_lateral: int   
    vent_superior: int  
    vent_co2: int       
    luz: int            
    pwm_auxiliar: int   
    humidificador: bool  
    compresor: bool      
    compresor_disponible: bool
    tiempo_ciclo_compresor: int  
    setpoint_temp: float        # nombrada igual a supabase, en c++ es SETPOINT_TEMP

    # Perfil de cultivo y lazos de humedad/CO2/luz
    especie_actual: int
    fase_actual: int
    hum_setpoint_min: float
    hum_setpoint_max: float
    co2_setpoint_max: int
    luz_fotoperiodo_on: bool
    hora_sincronizada: bool
    err_luz: bool
    permiso_nube_humidificador: bool
    permiso_nube_co2: bool
    permiso_nube_luz: bool


# MODELO PRINCIPAL: El contenedor que recibe la ráfaga cada 5 minutos
class PaqueteRafaga(BaseModel):
    device_id: str
    batch_id: int
    # Contiene la lista de registros completos tomados en el lapso de tiempo
    historial_lecturas: List[RegistroCompletoHistorial]


@app.post("/telemetria", dependencies=[Depends(verificar_api_key)])
async def recibir_datos(data: PaqueteRafaga): 
    # Valores por defecto de contingencia (Fallback seguro en caso de error)
    # Se inicializan asumiendo un estado neutro y seguro para el cultivo
    valores_fallback = {
        "status": "fallback",
        "set_compresor": 1,         # Arranca en True para control local por defecto si la nube falla
        "set_vent_lateral": 0,
        "set_vent_superior": 0,
        "setpoint_temp": 20.0,      # Tu zona de confort biológico base
        # Humedad/CO2/luz ahora son lazos locales en el firmware: el fallback
        # los deja PERMITIDOS por defecto para que el control local siga
        # autorregulándose aunque la nube esté caída, igual que el compresor.
        # No se incluyen "especie"/"fase": si no están ambas presentes, el
        # firmware simplemente mantiene el perfil que ya tenía cargado
        # localmente — es el comportamiento más seguro ante una nube caída.
        "permiso_nube_humidificador": 1,
        "permiso_nube_co2": 1,
        "permiso_nube_luz": 1
    }

    try:
        # VERIFICACIÓN DE DUPLICADOS: el firmware reintenta con el mismo
        # batch_id si la respuesta se pierde tras un insert exitoso. Antes de
        # insertar, se verifica si este (device_id, batch_id) ya fue
        # procesado — si sí, se omite la reinserción pero se sigue
        # respondiendo con los controles vigentes para que el dispositivo
        # pueda vaciar su buffer igual.
        batch_ya_procesado = False
        try:
            res_batch = await asyncio.to_thread(
                supabase.table("lotes_procesados")
                .select("batch_id")
                .eq("device_id", data.device_id)
                .eq("batch_id", data.batch_id)
                .execute
            )
            if res_batch.data and len(res_batch.data) > 0:
                batch_ya_procesado = True
                print(f"⚠️ Batch duplicado: device_id={data.device_id} batch_id={data.batch_id}. "
                      f"Se omite reinserción de telemetría, se responde igual con los controles vigentes.")
        except Exception as e_check:
            # Si la verificación falla (tabla no existe todavía, timeout, etc.)
            # se asume que NO es duplicado para no bloquear la ingesta normal
            # — prioriza disponibilidad sobre deduplicación perfecta.
            print(f"❌ Error verificando duplicado de batch (se continúa asumiendo que no lo es): {e_check}")

        lista_sensores = []
        lista_energia = []
        lista_estado = []

        total_lecturas = len(data.historial_lecturas)
        ahora_utc = datetime.now(ZoneInfo("UTC"))
        
        for i, lectura in enumerate(data.historial_lecturas):
            # NOTA DE TIMING: Sigue siendo un cálculo inverso aproximado, pero garantizamos que 
            # las estructuras locales se guarden bajo la misma consistencia temporal en Supabase.
            segundos_atras = (total_lecturas - 1 - i) * 5
            marca_tiempo = (ahora_utc - timedelta(seconds=segundos_atras)).isoformat()
            
            lista_sensores.append({
                "created_at": marca_tiempo,
                "temp_comp": lectura.temp_comp,
                "temp_ext": lectura.temp_ext,          
                "hum_ext": lectura.hum_ext,           
                "temp_int_sup": lectura.temp_int_sup,      
                "hum_int_sup": lectura.hum_int_sup,       
                "temp_int_inf": lectura.temp_int_inf,
                "hum_int_inf": lectura.hum_int_inf,  
                "co2_inf": lectura.co2_inf
            })
            
            lista_energia.append({
                "created_at": marca_tiempo,
                "voltaje": lectura.voltaje if lectura.voltaje is not None else 0.0,                  
                "corriente_neta": lectura.corriente_neta,    
                "potencia_w": lectura.potencia_w,            
                "energia_kwh": lectura.energia_kwh,          
                "frecuencia_hz": lectura.frecuencia_hz,      
                "factor_potencia": lectura.factor_potencia,  
                "resistencia": lectura.resistencia
            })

            lista_estado.append({
                "created_at": marca_tiempo,
                "err_max": lectura.err_max,
                "err_sht1": lectura.err_sht1,
                "err_sht2": lectura.err_sht2,
                "err_scd": lectura.err_scd,
                "err_pzem": lectura.err_pzem,
                "vent_lateral": lectura.vent_lateral,        
                "vent_superior": lectura.vent_superior,      
                "vent_co2": lectura.vent_co2,                
                "luz": lectura.luz,                          
                "pwm_auxiliar": lectura.pwm_auxiliar,        
                "humidificador": 1 if lectura.humidificador else 0, 
                "compresor": 1 if lectura.compresor else 0,         
                "puerta": lectura.puerta,                    
                "compresor_disponible": 1 if lectura.compresor_disponible else 0,
                "setpoint_temp": lectura.setpoint_temp,
                "especie_actual": lectura.especie_actual,
                "fase_actual": lectura.fase_actual,
                "hum_setpoint_min": lectura.hum_setpoint_min,
                "hum_setpoint_max": lectura.hum_setpoint_max,
                "co2_setpoint_max": lectura.co2_setpoint_max,
                "luz_fotoperiodo_on": lectura.luz_fotoperiodo_on,
                "hora_sincronizada": lectura.hora_sincronizada,
                "err_luz": lectura.err_luz,
                "permiso_nube_humidificador": lectura.permiso_nube_humidificador,
                "permiso_nube_co2": lectura.permiso_nube_co2,
                "permiso_nube_luz": lectura.permiso_nube_luz
            })

        # SOLUCIÓN DE DEUDA TÉCNICA: Sacar operaciones bloqueantes síncronas del event loop de FastAPI
        # Correr los inserts de red en un ejecutor de hilos paralelo usando asyncio.to_thread
        if not batch_ya_procesado:
            if lista_sensores:
                try:
                    await asyncio.to_thread(supabase.table("lecturas_sensores").insert(lista_sensores).execute)
                except Exception as e_sens:
                    print(f"❌ Error específico en tabla lecturas_sensores: {e_sens}")

            if lista_energia:
                try:
                    await asyncio.to_thread(supabase.table("monitoreo_energetico").insert(lista_energia).execute)
                except Exception as e_energ:
                    print(f"❌ Error específico en tabla monitoreo_energetico: {e_energ}")

            if lista_estado:
                try:
                    await asyncio.to_thread(supabase.table("estado_sistema").insert(lista_estado).execute)
                except Exception as e_est:
                    print(f"❌ Error específico en tabla estado_sistema: {e_est}")

            # Registrar el batch como procesado SOLO después de intentar los
            # inserts. Si esto falla, el próximo reintento del firmware con el
            # mismo batch_id volverá a insertar duplicados — es un riesgo
            # residual conocido, no un caso silencioso: queda logueado.
            try:
                await asyncio.to_thread(
                    supabase.table("lotes_procesados").insert({
                        "device_id": data.device_id,
                        "batch_id": data.batch_id,
                        "procesado_en": ahora_utc.isoformat()
                    }).execute
                )
            except Exception as e_reg:
                print(f"❌ Error registrando batch como procesado (riesgo de duplicado en el próximo reintento): {e_reg}")
        
        # BUG 1 CORREGIDO: Aislar la consulta de controles en su propio bloque try/except 
        # para que un fallo en Supabase no tumbe la petición ni retorne un HTTP 500 genérico.
        try:
            res_control = await asyncio.to_thread(supabase.table("controles").select("*").eq("id", 1).execute)
            
            # BUG 2 CORREGIDO: Si la consulta es exitosa pero la data viene vacía (fila borrada),
            # salta explícitamente al bloque else/fallback para inyectar las llaves obligatorias.
            if res_control.data and len(res_control.data) > 0:
                control = res_control.data[0]
                respuesta = {
                    "status": "success",
                    "set_compresor": 1 if control.get("set_compresor") else 0,
                    "set_vent_lateral": control.get("set_vent_lateral", 0),
                    "set_vent_superior": control.get("set_vent_superior", 0),
                    "setpoint_temp": control.get("setpoint_temp") if control.get("setpoint_temp") is not None else 20.0,
                    "permiso_nube_humidificador": 1 if control.get("permiso_nube_humidificador", True) else 0,
                    "permiso_nube_co2": 1 if control.get("permiso_nube_co2", True) else 0,
                    "permiso_nube_luz": 1 if control.get("permiso_nube_luz", True) else 0,
                }
                # especie/fase solo se incluyen si AMBAS están presentes y no son
                # nulas en la fila de controles — el firmware exige las dos
                # juntas antes de aplicar cualquier cambio de perfil.
                especie_val = control.get("especie")
                fase_val = control.get("fase")
                if especie_val is not None and fase_val is not None:
                    respuesta["especie"] = especie_val
                    respuesta["fase"] = fase_val
                return respuesta
            else:
                print("⚠️ Fila id=1 no encontrada en la tabla controles. Aplicando valores seguros por defecto.")
                return valores_fallback

        except Exception as e_control:
            print(f"❌ Error al consultar la tabla de controles (Supabase caído/timeout): {e_control}")
            # Retornamos el diccionario completo con códigos seguros para que el hardware resista autónomamente
            return valores_fallback

    except Exception as e:
        # Este bloque ahora solo atrapará fallos catastróficos de parsing locales internos de Python
        print(f"⚠️ Falla crítica estructural en el endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"❌ Error de validación en JSON recibido: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

if __name__ == "__main__":
    import uvicorn
    import os
    puerto = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=puerto, reload=False)