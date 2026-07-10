import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Optional, List

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

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: No se encontraron las credenciales en el archivo .env")
    exit(1)

# 2. Inicializar cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("⚡ Conexión inicializada con Supabase.")


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


# MODELO PRINCIPAL: El contenedor que recibe la ráfaga cada 5 minutos
class PaqueteRafaga(BaseModel):
    # Contiene la lista de registros completos tomados en el lapso de tiempo
    historial_lecturas: List[RegistroCompletoHistorial]


@app.post("/telemetria")
async def recibir_datos(data: PaqueteRafaga): 
    # Valores por defecto de contingencia (Fallback seguro en caso de error)
    # Se inicializan asumiendo un estado neutro y seguro para el cultivo
    valores_fallback = {
        "status": "fallback",
        "set_compresor": 1,         # Arranca en True para control local por defecto si la nube falla
        "set_humidificador": 0,
        "set_vent_co2": 0,
        "set_vent_lateral": 0,
        "set_vent_superior": 0,
        "set_luz": 0,
        "setpoint_temp": 20.0       # Tu zona de confort biológico base
    }

    try:
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
                "setpoint_temp": lectura.setpoint_temp
            })

        # SOLUCIÓN DE DEUDA TÉCNICA: Sacar operaciones bloqueantes síncronas del event loop de FastAPI
        # Correr los inserts de red en un ejecutor de hilos paralelo usando asyncio.to_thread
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
        
        # BUG 1 CORREGIDO: Aislar la consulta de controles en su propio bloque try/except 
        # para que un fallo en Supabase no tumbe la petición ni retorne un HTTP 500 genérico.
        try:
            res_control = await asyncio.to_thread(supabase.table("controles").select("*").eq("id", 1).execute)
            
            # BUG 2 CORREGIDO: Si la consulta es exitosa pero la data viene vacía (fila borrada),
            # salta explícitamente al bloque else/fallback para inyectar las llaves obligatorias.
            if res_control.data and len(res_control.data) > 0:
                control = res_control.data[0]
                return {
                    "status": "success",
                    "set_compresor": 1 if control.get("set_compresor") else 0,
                    "set_humidificador": 1 if control.get("set_humidificador") else 0,
                    "set_vent_co2": control.get("set_vent_co2", 0),
                    "set_vent_lateral": control.get("set_vent_lateral", 0),
                    "set_vent_superior": control.get("set_vent_superior", 0),
                    "set_luz": control.get("set_luz", 0),
                    "setpoint_temp": control.get("setpoint_temp") if control.get("setpoint_temp") is not None else 20.0
                }
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