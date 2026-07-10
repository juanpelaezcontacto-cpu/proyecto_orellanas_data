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


# MODELO PRINCIPAL: El contenedor que recibe la ráfaga cada 5 minutos
class PaqueteRafaga(BaseModel):
    # Contiene la lista de registros completos tomados en el lapso de tiempo
    historial_lecturas: List[RegistroCompletoHistorial]


@app.post("/telemetria")
async def recibir_datos(data: PaqueteRafaga): 
    # Obtener el tiempo exacto de Colombia
    hora_actual = datetime.now(ZoneInfo("America/Bogota")).isoformat()
    """Función auxiliar que se ejecuta en su propio hilo para no congelar el Wi-Fi"""
    try:
        # 2. SEPARACIÓN MODULAR DE DATOS (Alineado con tus 3 tablas en Supabase)
        lista_sensores = []
        lista_energia = []
        lista_estado = []

        total_lecturas = len(data.historial_lecturas)
        # Obtener la hora actual en UTC con zona horaria explícita
        ahora_utc = datetime.now(ZoneInfo("UTC"))
        
        # Iteramos sobre cada muestra tomada en el tiempo (reconstrucción del índice temporal)
        for i, lectura in enumerate(data.historial_lecturas):
            # Calculamos los segundos hacia atrás con base en muestras tomadas cada 5 segundos
            segundos_atras = (total_lecturas - 1 - i) * 5
            marca_tiempo = (ahora_utc - timedelta(seconds=segundos_atras)).isoformat()
            
            # 1. Preparar datos para tabla 'lecturas_sensores'
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
            
            # 2. Preparar datos para tabla 'monitoreo_energetico'
            lista_energia.append({
                "created_at": marca_tiempo,
                "voltaje": lectura.voltaje,                  
                "corriente_neta": lectura.corriente_neta,    
                "potencia_w": lectura.potencia_w,            
                "energia_kwh": lectura.energia_kwh,          
                "frecuencia_hz": lectura.frecuencia_hz,      
                "factor_potencia": lectura.factor_potencia,  
                "resistencia": lectura.resistencia
            })

            # 3. Preparar datos históricos para la tabla 'estado_sistema' (Diagnóstico + Actuadores)
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
                "compresor_disponible": 1 if lectura.compresor_disponible else 0
            })

        # 1. Intentar insertar sensores (Tabla principal)
        try:
            if lista_sensores:
                supabase.table("lecturas_sensores").insert(lista_sensores).execute()
        except Exception as e_sens:
            print(f"❌ Error específico en tabla lecturas_sensores: {e_sens}")

        # 2. Intentar insertar energía (Tratamiento de Nulos del PZEM)
        try:
            if lista_energia:
                # Si los valores son 0 o None, aseguramos que se guarden de forma que Postgres no proteste
                for fila in lista_energia:
                    if fila.get("voltaje") is None:
                        fila["voltaje"] = 0.0
                supabase.table("monitoreo_energetico").insert(lista_energia).execute()
        except Exception as e_energ:
            print(f"❌ Error específico en tabla monitoreo_energetico: {e_energ}")

        # 3. Intentar insertar estado (Aislamiento de errores)
        try:
            if lista_estado:
                supabase.table("estado_sistema").insert(lista_estado).execute()
        except Exception as e_est:
            print(f"❌ Error específico en tabla estado_sistema: {e_est}")
        
        # 5. Consultar y retornar las directrices de control desde la nube
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