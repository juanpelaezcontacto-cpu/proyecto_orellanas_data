    #*********************************************************************
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
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from typing import Optional
from typing import List

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


# ==========================================
# 2. MOLDE DE VALIDACIÓN DE DATOS (PYDANTIC)
# Definir la estructura exacta del JSON que envía la ESP32
# ==========================================
# Definimos el sub-modelo para cada lectura del historial
class Telemetria(BaseModel):
    # Registro de errores de todos los sensores (0 = OK, 1 = FAIL)
    err_max: int
    err_sht1: int  # Exterior
    err_sht2: int  # Interior
    err_scd: int
    err_pzem: int

    # Telemetría Sensores Ambiente
    resistencia: float
    temp_comp: float
    temp_ext: float          # temp_ext
    hum_ext: float          # hum_ext
    temp_int_sup: float          # temp_sup
    hum_int_sup: float          # hum_sup
    co2_inf: int           # Equivalente a uint16_t (partes por millón)
    temp_int_inf: float
    hum_int_inf: float
    puerta: int  # 0 = Abierta, 1 = Cerrada (o viceversa)

    # Telemetría Consumo Eléctrico
    voltaje: Optional[float] = None
    corriente_neta: Optional[float] = None
    potencia_w: Optional[float] = None
    energia_kwh: Optional[float] = None
    frecuencia_hz: Optional[float] = None
    factor_potencia: Optional[float] = None     # Factor de potencia

    # Variables de estado de actuadores
    vent_lateral: int   # Rango 0-255
    vent_superior: int  # Rango 0-255
    vent_co2: int       # Rango 0-255
    luz: int            # Rango 0-255
    pwm_auxiliar: int            # Rango 0-255
    humidificador: bool  # True / False
    compresor: bool      # True / False
    compresor_disponible: bool
    tiempo_ciclo_compresor: int  # Equivalente a long (segundos restantes)

# 1. Definimos el sub-modelo para cada lectura del historial


@app.post("/telemetria")
async def recibir_datos(data: Telemetria): 
    # Obtener el tiempo exacto de Colombia
    hora_actual = datetime.now(ZoneInfo("America/Bogota")).isoformat()
    """Función auxiliar que se ejecuta en su propio hilo para no congelar el Wi-Fi"""
    try:
        # 2. SEPARACIÓN MODULAR DE DATOS (Alineado con tus 3 tablas en Supabase)
        lecturas_sensores = {
            "created_at": hora_actual,
            "temp_comp": data.temp_comp,
            "temp_ext": data.temp_ext,          
            "hum_ext": data.hum_ext,           
            "temp_int_sup": data.temp_int_sup,      
            "hum_int_sup": data.hum_int_sup,       
            "temp_int_inf": data.temp_int_inf,
            "hum_int_inf": data.hum_int_inf,  # 🔥 CORREGIDO: data.hum_int_inf (tenías data.h_int_inf)
            "co2_inf": data.co2_inf
        }

        monitoreo_energetico = {
            "created_at": hora_actual,
            "voltaje": data.voltaje,                  # 🔥 CORREGIDO: data.voltaje (tenías data.pzem_voltaje)
            "corriente_neta": data.corriente_neta,    # 🔥 CORREGIDO: data.corriente_neta (tenías data.pzem_corriente)
            "potencia_w": data.potencia_w,            # 🔥 CORREGIDO: data.potencia_w (tenías data.pzem_potencia)
            "energia_kwh": data.energia_kwh,          # 🔥 CORREGIDO: data.energia_kwh (tenías data.pzem_energia)
            "frecuencia_hz": data.frecuencia_hz,      # 🔥 CORREGIDO: data.frecuencia_hz (tenías data.pzem_frecuencia)
            "factor_potencia": data.factor_potencia,  # 🔥 CORREGIDO: data.factor_potencia (tenías data.pzem_pf)
            "resistencia": data.resistencia
        }

        datos_estado = {
            "created_at": hora_actual,
            "err_max": data.err_max,
            "err_sht1": data.err_sht1,
            "err_sht2": data.err_sht2,
            "err_scd": data.err_scd,
            "err_pzem": data.err_pzem,
            "vent_lateral": data.vent_lateral,        # 🔥 CORREGIDO: data.vent_lateral (tenías data.pwm_vent_lateral)
            "vent_superior": data.vent_superior,      # 🔥 CORREGIDO: data.vent_superior (tenías data.pwm_vent_superior)
            "vent_co2": data.vent_co2,                # 🔥 CORREGIDO: data.vent_co2 (tenías data.pwm_vent_co2)
            "luz": data.luz,                          # 🔥 CORREGIDO: data.luz (tenías data.pwm_luz)
            "pwm_auxiliar": data.pwm_auxiliar,        # 🔥 CORREGIDO: data.pwm_auxiliar (tenías data.pwm_aux)
            "humidificador": 1 if data.humidificador else 0, # 🔥 CORREGIDO: data.humidificador (tenías data.estado_humidificador)
            "compresor": 1 if data.compresor else 0,         # 🔥 CORREGIDO: data.compresor (tenías data.estado_compresor)
            "puerta": data.puerta,                    # 🔥 CORREGIDO: data.puerta (tenías data.estadoPuerta)
            "compresor_disponible": 1 if data.compresor_disponible else 0 # 🔥 CORREGIDO: basado en tu bool
        }

        supabase.table("lecturas_sensores").insert(lecturas_sensores).execute()
        supabase.table("monitoreo_energetico").insert(monitoreo_energetico).execute()
        supabase.table("estado_sistema").insert(datos_estado).execute()

        # 5. Consultar y retornar los controles de la nube a la ESP32
        res_control = supabase.table("controles").select("*").eq("id", 1).execute()
        if res_control.data:
            control = res_control.data[0]
            return {
                "status": "success",
                "set_compresor": 1 if control.get("set_compresor") else 0,
                "set_humidificador": 1 if control.get("set_humidificador") else 0,
                "set_vent_co2": control.get("set_vent_co2", 0),
                "set_vent_lateral": control.get("set_vent_lateral", 0),
                "set_vent_superior": control.get("set_vent_superior", 0),
                "set_luz": control.get("set_luz", 0)
            }
    
        # Finalmente, le respondemos a la ESP32 que todo salió bien
        return {"status": "synchronized", "msg": "No hay cambios de control activos."}

    except Exception as e:
        print(f"⚠️ Error al procesar o subir datos a Supabase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # Esto imprimirá en tu consola de PowerShell qué campo faltó o llegó mal
    print(f"❌ Error de validación en JSON recibido: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

if __name__ == "__main__":
    import uvicorn
    import os
    # Railway asigna el puerto en la variable 'PORT'. Si no existe, usa 8080 por defecto.
    puerto = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=puerto, reload=False)