#include <Wire.h>
#include <7semi_SHT4x.h>
#include <SensirionI2cScd4x.h>
#include <SPI.h>
#include <Adafruit_MAX31865.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h> // Obligatorio para HTTPS seguro
#include <HTTPUpdate.h> // <-- NUEVA BIBLIOTECA PARA OTA Over the Air
#include <Preferences.h>
#include <time.h> // Requerido para NTP (configTime/getLocalTime) - fotoperiodo real

Preferences prefs;
uint32_t batchID; // Declarar el contador:
const char* DEVICE_ID = "CAMARA_01";
const String VERSION_ACTUAL = "1.1.0"; // <-- TU VERSIÓN ACTUAL (Incrementar en cada compilación)
// Credenciales de la red Wi-Fi
const char* ssid = "MALEJA_2.4";
const char* password = "macp092021";
const char* API_SECRET_ESP32 = "orellanas_ESP32_4dA9!2kP7mX#2026";

// Pines conexion UART PZEM004T
#define RXD2 16
#define TXD2 17

// Pines SPI PT100 Temperatura compresor
#define PIN_CS    32
#define PIN_MOSI  13
#define PIN_MISO  35
#define PIN_SCK   14

// Valores PT100
#define RNOMINAL 100.0
#define RREF     427.0

// Pines puerto I2C principal y secundario
#define SDA_P 25
#define SCL_P 26
#define SDA_S 5
#define SCL_S 15
// ===================================================
// ================= Salidas digitales =================
// ===================================================
SHT4x_7semi sht_ext;                   // T/H Exterior superior
SHT4x_7semi sht_int;                   // T/H Interior (entrada de aire)
SensirionI2cScd4x scd;              // CO2/T/H interior inferior
Adafruit_MAX31865 thermo(PIN_CS);   // PT100 compresor
const int Puerta = 27;              // Final carrera puerta en GPIO 27
int estado_Puerta = 0;               // 0 = Cerrada, 1 = Abierta
HardwareSerial PZEMSerial(2);       
PZEM004Tv30 pzem(PZEMSerial, RXD2, TXD2);  

// --- Configuración de Tiempos ---
const unsigned long INTERVALO_MUESTREO = 5000;       
const unsigned long INTERVALO_TRANSMISION = 300000;  
unsigned long ultimoMuestreo = 0;
unsigned long ultimaTransmisionRafaga = 0;
const unsigned long tiempo_reintento_envio_rafaga = 30000;

// --- Configuración del Buffer Local ---
const int MAX_LECTURAS = 20; 
int indiceEscritura = 0;          // Próxima posición donde se escribirá
int cantidadLecturas = 0;         // Número de lecturas válidas almacenadas
bool bufferLleno = false;         // Indica si ya comenzó la sobrescritura
int muestrasDesdeUltimoEnvio = 0; // Control del período de envío
const unsigned long INTERVALO_REINTENTO_MS = 30000;
unsigned long ultimoIntentoEnvio = 0;

// Variables Globales de Diagnóstico
int err_max = 0, err_sht_ext = 0, err_sht_int = 0, err_scd = 0, err_pzem = 0;
uint8_t ciclosSinDatoSCD = 0;

// Variables de Clima y Sensores
float temp_comp = 0.0;
float temp_ext = 0.0;          // SHT Exterior 
float hum_ext = 0.0;          
float temp_int_sup = 0.0;          // SHT Interior Superior 
float hum_int_sup = 0.0;          
float temp_int_inf = 0.0;       // SCD40 o Inferior 
float h_inf = 0.0;       
uint16_t co2 = 0;        
float resistencia = 0.0; 
int puerta = 0;          

// Variables de Monitoreo Eléctrico (PZEM)
float pzem_voltaje = 0.0;
float pzem_corriente = 0.0;
float pzem_potencia = 0.0;
float pzem_energia = 0.0;
float pzem_frecuencia = 0.0;
float pzem_pf = 0.0;

struct RegistroCompletoHistorial {
    uint32_t timestamp; // 1. CONTRATO DE DATOS: Nuevo campo Unix Epoch (4 bytes)
    int err_max; int err_sht_ext; int err_sht_int; int err_scd; int err_pzem;
    float temp_comp; float temp_ext; float hum_ext; float temp_int_sup; float hum_int_sup;
    float temp_int_inf; float hum_int_inf; int co2_inf; float resistencia; int puerta;
    float voltaje; float corriente_neta; float potencia_w; float energia_kwh; float frecuencia_hz; float factor_potencia;
    int pwm_vent_lateral; int pwm_vent_superior; int pwm_vent_co2; int pwm_luz; int pwm_auxiliar;
    bool humidificador; bool compresor; bool compresor_disponible; long tiempo_ciclo_compresor; float setpoint_temp;
    int especie_actual; int fase_actual; float hum_setpoint_min; float hum_setpoint_max; int co2_setpoint_max;
    bool luz_fotoperiodo_on; bool hora_sincronizada; bool err_luz;
    bool permiso_nube_humidificador; bool permiso_nube_co2; bool permiso_nube_luz;
}; 

RegistroCompletoHistorial bufferCultivo[MAX_LECTURAS];

const char* serverName = "https://orellanas-backend-production.up.railway.app/telemetria";
unsigned long ultimoEnvio = 0; 
const unsigned long intervaloEnvio = 5000; 

// ================= Salidas digitales =================
const int humidificador   = 4;
bool estado_humidificador = 0;
const int compresor       = 33;

// ================= Seguridad del Compresor =================
bool estado_compresor     = 0;
const unsigned long tiempo_min_apagado = 420000; 
unsigned long tiempo_ultimo_apagado = -tiempo_min_apagado;
int compresor_disponible = 1; 
long tiempo_restante_ciclo = 0; 
unsigned long tiempo_ciclo_compresor = 0; 
const float TEMP_MAX_COMPRESOR = 55.0;

// ================= Configuración PWM =================
const int vent_lateral = 19; const int vent_superior = 18; const int vent_co2 = 21; const int luz = 22; const int aux = 23;           
const int PWM_BITS            = 8;    
const int CH_vent_lateral     = 0; const int CH_vent_superior    = 1; const int CH_vent_co2         = 2; const int CH_luz              = 3; const int CH_aux = 4;    
const int frec_vent_lateral   = 2500; const int frec_vent_superior  = 2500; const int frec_vent_co2       = 2500; const int frec_luz = 25000; const int frec_aux = 2500;   

int pwm_vent_lateral  = 0; int pwm_vent_superior = 0; int pwm_vent_co2      = 0; int pwm_luz           = 0; int pwm_aux         = 0; int pwm_auxiliar = 0;

// Calibración
float setpoint_temp = 20.0;                   
const float HISTERESIS = 2.0;                       
const float ANTICIPACION_CORTE = 1.0;               

// Filtro de Temperatura
const int MAX_MUESTRAS_TEMP = 10;                   
float lecturas_historicas_temp[MAX_MUESTRAS_TEMP];  
int indice_lectura_temp = 0;                        
float temp_interior_promedio = 0.0;                 

// Recirculación
const unsigned long POST_ENFRIAMIENTO = 180000;       
const unsigned long INTERVALO_RECIRCULACION = 900000; 
const unsigned long DURACION_RECIRCULACION = 120000;  

unsigned long cronometro_recirculacion = 0;
unsigned long tiempo_cambio_ventiladores = 0;
bool permiso_nube_compresor = true;

// ================= Perfiles de cultivo por especie y fase =================
// VALORES DE PARTIDA TOMADOS DE LITERATURA GENERAL DE CULTIVO.
// NO SON DATOS DE CALIBRACIÓN VALIDADOS PARA ESTA CEPA/CÁMARA ESPECÍFICA.
// Ajustar empíricamente con los primeros lotes reales.
enum Especie { PLEUROTUS = 0, HERICIUM = 1 };
enum Fase    { INCUBACION = 0, FRUCTIFICACION = 1 };


Especie especie_actual = PLEUROTUS;
Fase    fase_actual     = FRUCTIFICACION;

struct PerfilCultivo {
  float temp_setpoint;   // setpoint usado por la histéresis existente (solo enfriamiento)
  float hum_setpoint_min;
  float hum_setpoint_max;
  uint16_t co2_setpoint_max;      // referencia solo para fase de fructificación
};

// [especie][fase] -> {temp_setpoint, hum_setpoint_min, hum_setpoint_max, co2_setpoint_max}
PerfilCultivo perfiles[2][2] = {
  // PLEUROTUS OSTREATUS
  {
    {26.0, 85.0, 90.0, 15000},  // Incubación: setpoint alto = compresor casi inactivo
    {17.5, 88.0, 95.0,   900}   // Fructificación
  },
  // HERICIUM ERINACEUS
  {
    {23.0, 85.0, 90.0, 15000},  // Incubación
    {18.0, 88.0, 95.0,   700}   // Fructificación (más sensible al CO2 alto)
  }
};

// ================= Permisos remotos (veto de la nube, no reemplazo del control local) =================
bool permiso_nube_humidificador = true;
bool permiso_nube_co2           = true;
bool permiso_nube_luz           = true;

// ================= Control local de humedad =================
const unsigned long TIEMPO_MIN_CICLO_HUMID = 60000; // 1 min — VALOR DE PARTIDA, calibrar contra el humidificador real
unsigned long tiempo_ultimo_apagado_humid = -TIEMPO_MIN_CICLO_HUMID;

// ================= Control local de CO2 =================
const int PWM_CO2_MIN_RECIRC = 40;   // recirculación mínima constante, incluso sin exceso de CO2
const int PWM_co2_max = 255;
const uint16_t CO2_BANDA_PROPORCIONAL = 400; // ppm sobre el máximo para llegar a PWM_co2_max — VALOR DE PARTIDA

// ================= Fotoperiodo (lazo ABIERTO, no cerrado — ver justificación) =================
// No existe sensor de luz/lux instalado. Esto NO es un lazo de control por
// realimentación de iluminación: es un temporizador programado contra hora
// real (NTP), con una verificación de falla del actuador vía PZEM (no una
// medición de la variable controlada).
const int HORA_LUZ_ON  = 6;   // 06:00 — VALOR DE PARTIDA, confirmar fotoperiodo deseado
const int HORA_LUZ_OFF = 18;  // 18:00
const int PWM_LUZ_FRUCTIFICACION = 150; // intensidad baja-media SIN calibrar con luxómetro real
//const float UMBRAL_CORRIENTE_LUZ_A = 0.00; // Amperios mínimos esperados con la luz encendida — CALIBRAR con el consumo real del driver/foco

bool luz_fotoperiodo_on = false; // si el fotoperiodo indica que debería estar encendida ahora
bool err_luz = false;            // falla de actuador detectada por PZEM (no falla de sensor de luz, no existe)

// ================= NTP — requisito duro, no opcional =================
// El fotoperiodo debe simular ciclo día/noche real; sin hora sincronizada
// la luz permanece APAGADA por seguridad (ver gestionarFotoperiodo()).
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const long  GMT_OFFSET_SEC = -5 * 3600; // Colombia UTC-5, sin horario de verano
const int   DAYLIGHT_OFFSET_SEC = 0;
const unsigned long NTP_TIMEOUT_MS = 15000;         // no bloquear setup() indefinidamente
const unsigned long INTERVALO_RESYNC_NTP = 6UL * 3600UL * 1000UL; // resync cada 6h (drift del RTC interno)
bool hora_sincronizada = false;
unsigned long ultimoResyncNTP = 0;

//Estados iniciales de temperatura
float t0_int_inf = 20.0, t0_int_sup = 20.0, t0_ext = 20.0;
//Variables de estado
bool estado_sht_ext = true;
bool estado_sht_int = true;
bool estado_scd = true;

static const char ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIEcDCCAligAwIBAgIQbI8dxyfHEX97r4U6yYD5zTANBgkqhkiG9w0BAQsFADBP
MQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFy
Y2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMTAeFw0yNjA1MTMwMDAwMDBa
Fw0zMjA5MDIyMzU5NTlaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5l
dCBTZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgy
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0H
ttwW+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7
AlF9ItgKbppbd9/w+kHsOdx1ymgHDB/qo4H1MIHyMA4GA1UdDwEB/wQEAwIBBjAd
BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwHwYDVR0jBBgwFoAUebRZ5nu2
5eQBc4AIiMgaWPbpm24wMgYIKwYBBQUHAQEEJjAkMCIGCCsGAQUFBzAChhZodHRw
Oi8veDEuaS5sZW5jci5vcmcvMBMGA1UdIAQMMAowCAYGZ4EMAQIBMCcGA1UdHwQg
MB4wHKAaoBiGFmh0dHA6Ly94MS5jLmxlbmNyLm9yZy8wDQYJKoZIhvcNAQELBQAD
ggIBAD2/e9frmMxNpCV03qUHegg+MV2wz9644YoXdqtH8RyWYcBO7xfjjGEXdU1e
/o0OkEFiynUCOSIk/vLLo7ttz6CPAeNlWfC0XNkoGeWgK6jjXvozBaGuGH5n0Ufo
shMeWTuURqNN5G00sSXDTBrpp2+mgvdZQjb8K11TYMA25QA+YHNfbIEL0BniAhKS
2gsnJjSzrdZLI+EZ7SEyqdR2rkjd1KutLDU+n3TFyxjniZVGur4YlhMP3mY/dV95
IruAkkjOZier6hGBdEgZXXvaCz9u9iVEadsIE75pAGL8oHV5vxdARDiotRpul1IN
/UZwzAbrfUFcw1HkAcYD/mlZfnQ2ieCF2MS7j3Vhv7JPDKp45fmykmzYNSrumRW0
upFFKDBOoF7hsOb7oLyHS+Uft6jOUfOrogj8YUx38hKb2K20r42OgsSdDdxdeYWc
MS3Sb6mwJeSZEYxJ2gaXnDSPaKhhrNkYwljyVQyr4Nq+MEJytXNTnHqaAcrNwZlV
pcJL1KBnMrMjP7eanvUwL3FYj3cF17jtboLt7gLoi4+2rWZFvn+w54jmd/FIuhhZ
cEaU/wvU6BUNMtcVquVGHp7itQeDth5j+XL3j4WJ2SABwzUl6OeYdgpIt/ITZa+p
TT0mQ/r5XyA4MEAiabn7XJjvCERlF2dcn2wqJw+CreTkkQ2R
-----END CERTIFICATE-----
)EOF";

void ejecutarActualizacionOTA(String url_binario) {
  Serial.println("\n🚨 [OTA] Iniciando actualización de firmware...");
  Serial.println("🚨 [OTA] Forzando apagado de actuadores por seguridad...");

  // 1. Apagar compresor y humidificador inmediatamente
  digitalWrite(compresor, LOW);
  estado_compresor = 0;
  digitalWrite(humidificador, LOW);
  estado_humidificador = 0;

  // 2. Apagar todos los ventiladores y luces (PWM a 0)
  ledcWrite(vent_lateral, 0);
  ledcWrite(vent_superior, 0);
  ledcWrite(vent_co2, 0);
  ledcWrite(luz, 0);
  ledcWrite(aux, 0);

  delay(1000); // Esperar a que los relés y cargas se desmagneticen

  // 3. Preparar el cliente seguro para descargar el archivo
  WiFiClientSecure cliente_ota;
  cliente_ota.setCACert(ROOT_CA); // Reutiliza tu certificado de confianza para descargas seguras
  
  // Configuramos el reinicio automático tras la descarga exitosa
  httpUpdate.rebootOnUpdate(true);

  Serial.printf("📥 [OTA] Descargando binario desde: %s\n", url_binario.c_str());
  
  // 4. Iniciar la actualización
  t_httpUpdate_return resultado = httpUpdate.update(cliente_ota, url_binario);

  // Si la función continúa después de update(), significa que el proceso falló
  switch (resultado) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("❌ [OTA] Falló la actualización. Error (%d): %s\n", 
                    httpUpdate.getLastError(), 
                    httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("ℹ️ [OTA] No se encontraron actualizaciones en el servidor.");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("✅ [OTA] Actualización completada correctamente.");
      break;
  }
}

void setup() {
  prefs.begin("orellanas", false);
  batchID = prefs.getUInt("batch_id", 1);
  if (batchID == 0) {
    batchID = 1;
}
  // Cargar especie/fase persistidas (sobreviven a reinicios) antes de aplicar el perfil
  especie_actual = (Especie) prefs.getUChar("especie", PLEUROTUS);
  fase_actual    = (Fase)    prefs.getUChar("fase", FRUCTIFICACION);

  pinMode(humidificador, OUTPUT);
  digitalWrite(humidificador, estado_humidificador);
  Serial.begin(115200);
  
  Wire.begin(SDA_P, SCL_P, 100000);  
  Wire.setTimeOut(25);      
  delay(500); // Dar tiempo a que el sensor encienda
  Wire1.begin(SDA_S, SCL_S, 100000);      
  delay(100); // Pequeña pausa antes de hablar con el sensor

  WiFi.begin(ssid, password);
  unsigned long wifi_start_time = millis();
  Serial.print("Conectando a Wi-Fi...");
  while (WiFi.status() != WL_CONNECTED && (millis() - wifi_start_time < 8000)) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅Wi-Fi Conectado.");
      // --- Sincronización NTP (requisito duro para el fotoperiodo, ver justificación arriba) ---
    Serial.println("Sincronizando hora por NTP...");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    struct tm timeinfo;
    unsigned long ntp_inicio = millis();
    while (!getLocalTime(&timeinfo, 100) && (millis() - ntp_inicio < NTP_TIMEOUT_MS)) {
      delay(500);
      Serial.print("*");
    }
    if (getLocalTime(&timeinfo, 100)) {
      hora_sincronizada = true;
      Serial.printf("\n✅ Hora sincronizada: %02d:%02d:%02d\n",
        timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    } else {
      hora_sincronizada = false;
      Serial.println("\n⚠️ No se pudo sincronizar NTP en el arranque. La luz permanecerá APAGADA hasta lograr sincronizar (ver gestionarFotoperiodo()).");
    }
  }
  ultimoResyncNTP = millis();
  delay(1000);
  ledcAttachChannel(vent_lateral, frec_vent_lateral, PWM_BITS, CH_vent_lateral);
  ledcWrite(vent_lateral, pwm_vent_lateral);
  ledcAttachChannel(vent_superior, frec_vent_superior, PWM_BITS, CH_vent_superior);
  ledcWrite(vent_superior, pwm_vent_superior);
  ledcAttachChannel(vent_co2, frec_vent_co2, PWM_BITS, CH_vent_co2);
  ledcWrite(vent_co2, pwm_vent_co2);
  ledcAttachChannel(luz, frec_luz, PWM_BITS, CH_luz);
  ledcWrite(luz, pwm_luz);
  ledcAttachChannel(aux, frec_aux, PWM_BITS, CH_aux);
  ledcWrite(aux, pwm_aux);
  
  pinMode(compresor, OUTPUT);
  digitalWrite(compresor, estado_compresor);
  
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);
  thermo.begin(MAX31865_2WIRE); 
  thermo.clearFault();
  delay(100); 
//============================================
// Sensores Canal de Comunicación I2C principal
//============================================
//SHT exterior
  if (!sht_ext.begin(Wire, 0x44, SCL_P, SDA_P)) { 
    estado_sht_ext = false;
    Serial.println("Error al inicializar el SHT exterior"); 
  }else{
    estado_sht_ext = true;
    sht_ext.setPrecision(REPEATABILITY_HIGH);
    Serial.println("SHT exterior en Canal de Comunicación I2C principal inicializado"); 
  }
// SCD interior
  scd.begin(Wire, 0x62); // Inicialización (retorna void, no genera error de compilación)
  // Validamos si responde físicamente en el bus I2C intentando detener su medición
  uint16_t error_scd_init = scd.stopPeriodicMeasurement();
  if (error_scd_init != 0){
    estado_scd = false;
    Serial.println("Error en comunicación con sensor SCD en Canal de Comunicación I2C principal");
  }else{
    estado_scd = true;
    //scd.stopPeriodicMeasurement();
    delay(500);
    scd.startPeriodicMeasurement();
    Serial.println("SCD en Canal de Comunicación I2C principal inicializado"); 
  }
//============================================
// Sensores Canal de Comunicación I2C secundario
//============================================
// SHT interior
  int intentos_sht = 0;
  const int max_intentos_sht = 10;

  while (!sht_int.begin(Wire1, 0x44, SCL_S, SDA_S && intentos_sht < max_intentos_sht)) {
    intentos_sht++; 
    Serial.printf("Intento %d: Error inicializando SHT interior...\n", intentos_sht);
    estado_sht_int = false;
    delay(500);
  }

  if (intentos_sht < max_intentos_sht){
    estado_sht_int = true;
    sht_int.setPrecision(REPEATABILITY_HIGH);
    Serial.println("SHT interior en Canal de Comunicación I2C secundario inicializado"); 
  }else{
    estado_sht_int = false;
    Serial.println("Error crítico: SHT interior no responde. Continuando sin él.");
  }

  
//***********************************************************
  if (estado_sht_int){
    sht_int.readTemperatureHumidity(t0_int_sup, hum_int_sup);
  }
//***********************************************************
  if (estado_scd){
    // Pre-cargar el filtro térmico para evitar arranques con promedio en 0
    Serial.println("Cebando filtro de temperatura...");
    scd.readMeasurement(co2, t0_int_inf, h_inf);
  }
//***********************************************************
  if (estado_sht_ext){
    sht_ext.readTemperatureHumidity(t0_ext, hum_ext);
  }
//**********Cálculo temperatura promedio************************
for (int i = 0; i < MAX_MUESTRAS_TEMP; i++) {
    lecturas_historicas_temp[i] = (t0_int_sup + t0_int_inf) / 2.0;
  }
  temp_interior_promedio = (t0_int_sup + t0_int_inf) / 2.0;
//*****************************************
  pinMode(Puerta, INPUT_PULLUP);                      //Configuración pin Puerta 
  PZEMSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);     //Configuaación PZEM
  aplicarPerfilLocal();
}

// Aplica el setpoint de temperatura correspondiente a especie/fase actuales.
// Humedad y CO2 no tienen una única "variable global de setpoint" como la
// temperatura: sus funciones de control leen perfiles[especie_actual][fase_actual]
// directamente en cada ciclo, así que no necesitan copiarse aquí.
void aplicarPerfilLocal() {
  PerfilCultivo p = perfiles[especie_actual][fase_actual];
  setpoint_temp = p.temp_setpoint;
  Serial.printf(
    "🎛️ Perfil aplicado: especie=%d fase=%d | setpoint_temp=%.1f°C | hum=[%.1f-%.1f]%% | co2_setpoint_max=%u ppm\n",
    especie_actual, fase_actual, p.temp_setpoint, p.hum_setpoint_min, p.hum_setpoint_max, p.co2_setpoint_max
  );
}

void actualizarCicloCompresor() {
  if (estado_compresor == 1) {
    compresor_disponible = 0; 
    tiempo_restante_ciclo = 0;
  } else {
    unsigned long tiempo_transcurrido = millis() - tiempo_ultimo_apagado;
    if (tiempo_transcurrido >= tiempo_min_apagado) {
      compresor_disponible = 1; 
      tiempo_restante_ciclo = 0;
    } else {
      compresor_disponible = 0; 
      tiempo_restante_ciclo = (tiempo_min_apagado - tiempo_transcurrido) / 1000;
    }
  }
}

void calcularTemperaturaAmbiente(float temp_int_sup, float temp_int_inf) {
  float t_instantanea = 0.0;
  bool calculo_valido = false;

  if (err_sht_int == 0 && err_scd == 0){
    t_instantanea = (temp_int_sup + temp_int_inf) / 2.0; 
    calculo_valido = true;
  }else if(err_sht_int == 0){
    t_instantanea = temp_int_sup;
    calculo_valido = true;
  }else if(err_scd == 0){
    t_instantanea = temp_int_inf;
    calculo_valido = true;
  }

  if (calculo_valido){
    lecturas_historicas_temp[indice_lectura_temp] = t_instantanea;
    indice_lectura_temp = (indice_lectura_temp + 1) % MAX_MUESTRAS_TEMP; 
  }
  
  
  float suma = 0.0;
  for (int i = 0; i < MAX_MUESTRAS_TEMP; i++) {
    suma += lecturas_historicas_temp[i];
  }
  temp_interior_promedio = suma / MAX_MUESTRAS_TEMP; 
}

void controlarTemperaturaCultivo() {
  float limite_superior = setpoint_temp + HISTERESIS;             
  float limite_inferior_anticipado = setpoint_temp + ANTICIPACION_CORTE; 

  if (err_sht_int != 0 && err_scd != 0) {
    if (estado_compresor == 1) {
      digitalWrite(compresor, LOW);
      estado_compresor = 0;
      Serial.println("🚨 EMERGENCIA: Sensor SHT o SCD offline. Compresor apagado por seguridad.");
    }
    return; // Sale de la función, no permite encenderlo
  }

  if (temp_interior_promedio >= limite_superior && estado_compresor == 0) {
    if (permiso_nube_compresor && compresor_disponible && temp_comp <= TEMP_MAX_COMPRESOR) { 
      estado_compresor = 1;
      digitalWrite(compresor, HIGH); 
      Serial.println("❄️ Compresor encendido.");
    }
  }
  
  if ((temp_interior_promedio <= limite_inferior_anticipado || !permiso_nube_compresor) && estado_compresor == 1) {
    estado_compresor = 0;
    digitalWrite(compresor, LOW); 
    tiempo_ultimo_apagado = millis();
    tiempo_cambio_ventiladores = millis(); 
    Serial.println("💤 Compresor cortado.");
  }

  if (estado_compresor ==1 && err_max == 0 && temp_comp > TEMP_MAX_COMPRESOR){
    digitalWrite(compresor, LOW);
    estado_compresor = 0;
    tiempo_ultimo_apagado = millis();
    tiempo_cambio_ventiladores = millis();
    Serial.printf(
      "🛑 PROTECCIÓN TÉRMICA: %.1f °C > %.1f °C. Compresor apagado.\n",
      temp_comp,
      TEMP_MAX_COMPRESOR
    );
  }
}

// ================= Control local de humedad =================
// Análogo a controlarTemperaturaCultivo(): histéresis local con veto remoto,
// nunca reemplazo total por la nube.
void controlarHumedadCultivo() {
  // Si el SCD40 no está entregando datos frescos (err_scd), no accionamos
  // sobre una lectura potencialmente vieja: mantenemos el último estado en
  // vez de alternar el humidificador a ciegas.
  if (err_scd != 0) {
    if(estado_humidificador == true){
      estado_humidificador = false;
      digitalWrite(humidificador, LOW);
      Serial.println("🚨 Sensor SCD offline. Humidificador apagado de emergencia.");
    }
    return;       // Sale de la función de manera segura
  }
  // ====== INTERRUPCIÓN POR INYECCIÓN DE AIRE EXTERIOR ======
  // Si hay exceso de CO2, el ventilador de CO2 meterá aire a presión y desalojará
  // el aire interno por el agujero inferior. Apagamos el humidificador para no tirar agua.
  PerfilCultivo perfil = perfiles[especie_actual][fase_actual];
  float hum_actual = h_inf; // sensor más cercano al humidificador (parte inferior)

  if (fase_actual == FRUCTIFICACION && co2 > perfil.co2_setpoint_max && permiso_nube_co2) {
    if (hum_actual >= 75.0){
      if (estado_humidificador == true) {
        estado_humidificador = false;
        digitalWrite(humidificador, LOW);
        tiempo_ultimo_apagado_humid = millis();
        Serial.println("🚨 Humidificador vetado: Evitando pérdida de humedad por el agujero de salida inferior.");
      }
      return; // Bloqueo activo. Bloquea el encendido del humidificador.
    }else{
      // Si cae de 75%, no entra al 'if', no hace 'return' e ignora el veto.
      Serial.println("⚠️ PÁNICO: Humedad críticamente baja (<75%). Anulando veto de CO2 para hidratar el cultivo.");
    }
  }
  
  unsigned long ahora = millis();
  bool respeta_ciclo_minimo = (ahora - tiempo_ultimo_apagado_humid >= TIEMPO_MIN_CICLO_HUMID);

  if (hum_actual < perfil.hum_setpoint_min && estado_humidificador == false) {
    if (permiso_nube_humidificador && respeta_ciclo_minimo) {
      estado_humidificador = true;
      digitalWrite(humidificador, HIGH);
      Serial.println("💧 Humidificador encendido.");
    }
  }

  if ((hum_actual >= perfil.hum_setpoint_max || !permiso_nube_humidificador) && estado_humidificador == true) {
    estado_humidificador = false;
    digitalWrite(humidificador, LOW);
    tiempo_ultimo_apagado_humid = ahora;
    Serial.println("💤 Humidificador apagado.");
  }
}

// ================= Control local de CO2 =================
// PWM proporcional sobre el ventilador superior de intercambio de aire
// exterior. Comportamiento distinto por fase: en incubación el CO2 alto es
// deseado (no reactivo, solo recirculación mínima); en fructificación es
// activo y proporcional al exceso sobre co2_setpoint_max.
void controlarCO2Cultivo() {
  if (!permiso_nube_co2) {
    pwm_vent_co2 = 0;
    ledcWrite(vent_co2, pwm_vent_co2);
    return;
  }

  /// ACCIÓN DEFENSIVA: Si el sensor falla, no dejes el ventilador al valor anterior.
  // Setea el mínimo seguro para evitar deshidratación masiva.
  if (err_scd != 0) {
    pwm_vent_co2 = PWM_CO2_MIN_RECIRC;
    ledcWrite(vent_co2, pwm_vent_co2);
    return;
  }
  

  PerfilCultivo perfil = perfiles[especie_actual][fase_actual];

  if (fase_actual == INCUBACION) {
    pwm_vent_co2 = PWM_CO2_MIN_RECIRC;
  } else {
    if (co2 <= perfil.co2_setpoint_max) {
      pwm_vent_co2 = PWM_CO2_MIN_RECIRC;
    } else {
      uint16_t exceso = co2 - perfil.co2_setpoint_max;
      int pwm_calculado = PWM_CO2_MIN_RECIRC +
        (int)(((float)exceso / CO2_BANDA_PROPORCIONAL) * (PWM_co2_max - PWM_CO2_MIN_RECIRC));
      pwm_vent_co2 = constrain(pwm_calculado, PWM_CO2_MIN_RECIRC, PWM_co2_max);
    }
  }
  ledcWrite(vent_co2, pwm_vent_co2);
}

// ================= Fotoperiodo (lazo ABIERTO programado, no cerrado) =================
// No hay sensor de luz instalado: esto es un temporizador contra hora real
// (NTP), con verificación de falla del actuador vía PZEM. No es control por
// realimentación de iluminación.
void gestionarFotoperiodo() {
  // Sin hora sincronizada: apagar por seguridad. Preferible perder horas de
  // luz a arriesgar un fotoperiodo corrido sin que nadie se entere.
  if (!hora_sincronizada) {
    luz_fotoperiodo_on = false;
    err_luz = false;
    pwm_luz = 0;
    ledcWrite(luz, pwm_luz);
    return;
  }

  // Incubación: oscuridad total, la luz puede inducir primordios prematuros.
  if (fase_actual == INCUBACION) {
    luz_fotoperiodo_on = false;
    //err_luz = false;
    pwm_luz = 0;
    ledcWrite(luz, pwm_luz);
    return;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) {
    // Fallo puntual de lectura pese a estar sincronizados: no apagamos de
    // golpe por una lectura fallida aislada, mantenemos el último estado.
    return;
  }

  bool deberia_estar_encendida = (timeinfo.tm_hour >= HORA_LUZ_ON && timeinfo.tm_hour < HORA_LUZ_OFF);
  luz_fotoperiodo_on = deberia_estar_encendida;

  pwm_luz = (deberia_estar_encendida && permiso_nube_luz) ? PWM_LUZ_FRUCTIFICACION : 0;
  ledcWrite(luz, pwm_luz);

  // Verificación de falla del actuador (NO control de iluminación):
  // si debería estar encendida y el PZEM no ve el consumo esperado, marca
  // err_luz. Si el PZEM mismo está fallando (err_pzem), no confiamos en la
  // lectura de corriente y no tocamos err_luz.
  /*if (deberia_estar_encendida && permiso_nube_luz) {
    if (err_pzem == 0) {
      err_luz = (pzem_corriente < UMBRAL_CORRIENTE_LUZ_A);
    }
  } else {
    err_luz = false;
  }*/
}

// Resincronización periódica de NTP (el RTC interno del ESP32 puede desviarse
// con el tiempo). No bloquea: dispara un nuevo intento de SNTP en segundo
// plano, sin interrumpir el fotoperiodo en curso.
void gestionarResyncNTP() {
  if (WiFi.status() == WL_CONNECTED && millis() - ultimoResyncNTP >= INTERVALO_RESYNC_NTP) {
    ultimoResyncNTP = millis();
    Serial.println("🔄 Resincronizando NTP...");
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
  }
}

void gestionarVentiladoresInteligentes() {
  static int ultimo_pwm_lateral = -1;
  static int ultimo_pwm_superior = -1;

  // Evaluamos si físicamente hay una condición de exceso de CO2 en fructificación
  PerfilCultivo perfil = perfiles[especie_actual][fase_actual];
  bool exceso_co2 = (fase_actual == FRUCTIFICACION && co2 > perfil.co2_setpoint_max);

  // CASO 1: Compresor activo o en post-enfriamiento (Prioridad máxima de mezcla térmica)
  if (estado_compresor == 1 || (estado_compresor == 0 && (millis() - tiempo_ultimo_apagado < POST_ENFRIAMIENTO))) {
    pwm_vent_lateral = 255; 
    pwm_vent_superior = 255;
    cronometro_recirculacion = millis(); 
  // CASO 2: Emergencia de CO2 (Inyección externa activa).
  // Forzamos recirculación interna para romper el "túnel" de aire y obligar al aire fresco 
  // a barrer el CO2 de los bloques de hongo antes de que escape por el agujero inferior.
  }else if (exceso_co2 && permiso_nube_co2 && err_scd == 0) {
      pwm_vent_lateral = 255; 
      pwm_vent_superior = 255;
      cronometro_recirculacion = millis();
  }
  // CASO 3: Ciclo estándar por tiempo (Sin alarmas térmicas ni de gases)
   else {
    unsigned long tiempo_desde_ultimo_ciclo = millis() - cronometro_recirculacion;
    if (tiempo_desde_ultimo_ciclo < DURACION_RECIRCULACION) {
      pwm_vent_lateral = 255; 
      pwm_vent_superior = 255;
    } else if (tiempo_desde_ultimo_ciclo < INTERVALO_RECIRCULACION) {
      pwm_vent_lateral = 0; 
      pwm_vent_superior = 0;
    } else {
      cronometro_recirculacion = millis();
    }
  }
  // Se mantiene intacto tu bloque original de escritura física por ledcWrite
  if (pwm_vent_lateral != ultimo_pwm_lateral) {
    ledcWrite(vent_lateral, pwm_vent_lateral);
    ultimo_pwm_lateral = pwm_vent_lateral;
  }
  if (pwm_vent_superior != ultimo_pwm_superior) {
    ledcWrite(vent_superior, pwm_vent_superior);
    ultimo_pwm_superior = pwm_vent_superior;
  }
}

void leersensores(){ 
  if (estado_sht_int) {
    // Lectura SHT
    err_sht_int = !sht_int.readTemperatureHumidity(temp_int_sup, hum_int_sup);
  }else{err_sht_int = 1;}

  if (estado_scd){
    // Lectura SCD40
    bool dataReady = false;
    scd.getDataReadyStatus(dataReady); 
    if (dataReady) {
      scd.readMeasurement(co2, temp_int_inf, h_inf);
      if ( err_scd != 0){
        Serial.println("✅ SCD40 volvió a entregar datos.");
      }
      err_scd = 0;
      ciclosSinDatoSCD = 0;
    }else {
      ciclosSinDatoSCD++;
      if (ciclosSinDatoSCD >= 5){ //Aumenta el umbral de tolerancia a 5 o 6 ciclos (25 a 30 segundos). No compromete la seguridad del cultivo y absorbe cualquier desfase temporal o fluctuación en el tiempo de ejecución del código principal.
        err_scd = 1;
        Serial.println("⚠️ SCD40 sin datos nuevos desde hace 15 s.");
      } 
    }
  }else{
    err_scd = 1;
  }
  if (estado_sht_ext){
    err_sht_ext = !sht_ext.readTemperatureHumidity(temp_ext, hum_ext);
  }else{
    err_sht_ext = 1;
  }
  uint16_t rtd = thermo.readRTD();
  resistencia = ((float)rtd / 32768.0) * RREF;
  uint8_t codigoFalla = thermo.readFault();

  if (codigoFalla != 0) {
    thermo.clearFault();
    delay(5); 
    codigoFalla = thermo.readFault();
    err_max = 1; 
  }else { 
    err_max = 0; 
    temp_comp = thermo.temperature(RNOMINAL, RREF); 
  }


  // Puerta
  estado_Puerta = !digitalRead(Puerta); 

  // PZEM (Corrección del Bug del isnan)
  float v_tmp  = pzem.voltage();
  float c_tmp  = pzem.current() / 3.0; 
  float p_tmp  = pzem.power() / 3.0;
  float e_tmp  = pzem.energy() / 3.0;
  float f_tmp  = pzem.frequency();
  float pf_tmp = pzem.pf();

  if (isnan(v_tmp) || isnan(c_tmp) || isnan(p_tmp) || isnan(e_tmp) || isnan(f_tmp) || isnan(pf_tmp)) {
    err_pzem = 1;
    pzem_voltaje = 0.0; pzem_corriente = 0.0; pzem_potencia = 0.0; pzem_energia = 0.0; pzem_frecuencia = 0.0; pzem_pf = 0.0;
  } else {
    err_pzem = 0;
    pzem_voltaje = v_tmp; pzem_corriente = c_tmp; pzem_potencia = p_tmp; pzem_energia = e_tmp; pzem_frecuencia = f_tmp; pzem_pf = pf_tmp;
  }
}

bool enviarRafagaANube() {
    WiFiClientSecure client;
    client.setCACert(ROOT_CA);
    client.setTimeout(4000); /*Esto evita que un handshake TLS lento o una red inestable dejen bloqueado el ESP32 durante demasiado tiempo. Un valor de x segundos suele ser un buen compromiso para conexiones móviles o WiFi con latencia elevada.*/
    HTTPClient http;
    
    // CORRECCIÓN SINTAXIS: Se niega para controlar el fallo de inicialización
  
    if (!http.begin(client, serverName)) {
      Serial.println("❌ No se pudo inicializar la conexión HTTP con el cliente seguro.");
      return false;
    }
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_SECRET_ESP32);
    http.setTimeout(4000); // Corta la espera de la respuesta del servidor a 4 segundos max
    //reserva 24576 para 20 registros
    DynamicJsonDocument doc(24576); 
    doc["device_id"] = DEVICE_ID;
    doc["batch_id"] = batchID;
    JsonArray historial = doc.createNestedArray("historial_lecturas");

    int inicio = bufferLleno ? indiceEscritura: 0;
    for (int i = 0; i < cantidadLecturas; i++) {
        int idx = (inicio + i) % MAX_LECTURAS;
        JsonObject obj = historial.createNestedObject();
        obj["timestamp"]   = bufferCultivo[idx].timestamp;
        obj["err_max"]  = bufferCultivo[idx].err_max;
        obj["err_sht_ext"] = bufferCultivo[idx].err_sht_ext;
        obj["err_sht_int"] = bufferCultivo[idx].err_sht_int;
        obj["err_scd"]  = bufferCultivo[idx].err_scd;
        obj["err_pzem"] = bufferCultivo[idx].err_pzem;
        obj["temp_comp"]   = bufferCultivo[idx].temp_comp;
        obj["temp_ext"]    = bufferCultivo[idx].temp_ext;
        obj["hum_ext"]     = bufferCultivo[idx].hum_ext;
        obj["temp_int_sup"] = bufferCultivo[idx].temp_int_sup;
        obj["hum_int_sup"]  = bufferCultivo[idx].hum_int_sup;
        obj["temp_int_inf"] = bufferCultivo[idx].temp_int_inf;
        obj["hum_int_inf"]  = bufferCultivo[idx].hum_int_inf;
        obj["co2_inf"]      = bufferCultivo[idx].co2_inf;
        obj["resistencia"]  = bufferCultivo[idx].resistencia;
        obj["puerta"]       = bufferCultivo[idx].puerta;
        obj["voltaje"]         = bufferCultivo[idx].voltaje;
        obj["corriente_neta"]  = bufferCultivo[idx].corriente_neta;
        obj["potencia_w"]      = bufferCultivo[idx].potencia_w;
        obj["energia_kwh"]     = bufferCultivo[idx].energia_kwh;
        obj["frecuencia_hz"]   = bufferCultivo[idx].frecuencia_hz;
        obj["factor_potencia"] = bufferCultivo[idx].factor_potencia;
        obj["vent_lateral"]   = bufferCultivo[idx].pwm_vent_lateral;
        obj["vent_superior"]  = bufferCultivo[idx].pwm_vent_superior;
        obj["vent_co2"]       = bufferCultivo[idx].pwm_vent_co2;
        obj["luz"]            = bufferCultivo[idx].pwm_luz;
        obj["pwm_auxiliar"]   = bufferCultivo[idx].pwm_auxiliar;
        obj["humidificador"]  = bufferCultivo[idx].humidificador;
        obj["compresor"]      = bufferCultivo[idx].compresor;
        obj["compresor_disponible"] = bufferCultivo[idx].compresor_disponible;
        obj["tiempo_ciclo_compresor"] = bufferCultivo[idx].tiempo_ciclo_compresor;
        obj["setpoint_temp"] = bufferCultivo[idx].setpoint_temp;
        obj["especie_actual"] = bufferCultivo[idx].especie_actual;
        obj["fase_actual"]    = bufferCultivo[idx].fase_actual;
        obj["hum_setpoint_min"] = bufferCultivo[idx].hum_setpoint_min;
        obj["hum_setpoint_max"] = bufferCultivo[idx].hum_setpoint_max;
        obj["co2_setpoint_max"] = bufferCultivo[idx].co2_setpoint_max;
        obj["luz_fotoperiodo_on"] = bufferCultivo[idx].luz_fotoperiodo_on;
        obj["hora_sincronizada"]  = bufferCultivo[idx].hora_sincronizada;
        obj["err_luz"] = bufferCultivo[idx].err_luz;
        obj["permiso_nube_humidificador"] = bufferCultivo[idx].permiso_nube_humidificador;
        obj["permiso_nube_co2"] = bufferCultivo[idx].permiso_nube_co2;
        obj["permiso_nube_luz"] = bufferCultivo[idx].permiso_nube_luz;
    }

    // Verificación de overflow: DynamicJsonDocument NO crece solo. Si esto
    // dispara, hay que aumentar la capacidad reservada arriba — de lo
    // contrario el JSON se envía truncado sin ningún otro aviso.
    if (doc.overflowed()) {
      Serial.println("🔴 ALERTA: DynamicJsonDocument desbordado — el JSON se está truncando. Aumentar la capacidad reservada.");
    }

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("🚀 Enviando ráfaga analítica a Railway...");
    Serial.printf("📤 batch_id=%lu | muestras=%d\n",batchID,cantidadLecturas);
    Serial.printf("JSON: %u bytes\n", requestBody.length());
    int httpResponseCode = http.POST(requestBody);
    bool exito = false;

    if (httpResponseCode > 0) {
        if (httpResponseCode >= 200 && httpResponseCode < 300) {
          Serial.printf("✅ Ráfaga enviada. Código: %d\n", httpResponseCode);
          String payload = http.getString();
          DynamicJsonDocument docRespuesta(1024);
          
          // CORRECCIÓN SINTAXIS: Captura explícita del error de parseo
          DeserializationError error = deserializeJson(docRespuesta, payload);
          
          if (!error) {
              
              if (docRespuesta.containsKey("set_compresor")) {
                permiso_nube_compresor = docRespuesta["set_compresor"];
              }
              if (docRespuesta.containsKey("setpoint_temp")) {
                setpoint_temp = docRespuesta["setpoint_temp"];
              }
              
              // Humedad, CO2 y luz ya NO se fijan directamente desde la nube:
              // son lazos locales (controlarHumedadCultivo(), controlarCO2Cultivo(),
              // gestionarFotoperiodo()). La nube solo puede VETAR el actuador,
              // igual que permiso_nube_compresor con el compresor.
              if (docRespuesta.containsKey("permiso_nube_humidificador")) {
                permiso_nube_humidificador = docRespuesta["permiso_nube_humidificador"];
              }
              if (docRespuesta.containsKey("permiso_nube_co2")) {
                permiso_nube_co2 = docRespuesta["permiso_nube_co2"];
              }
              if (docRespuesta.containsKey("permiso_nube_luz")) {
                permiso_nube_luz = docRespuesta["permiso_nube_luz"];
              }

              // Especie/fase: la nube PROPONE, el firmware VALIDA antes de aplicar.
              // Un valor fuera de rango o corrupto se ignora por completo — nunca
              // se aplica un perfil inválido.
              if (docRespuesta.containsKey("especie") && docRespuesta.containsKey("fase")) {
                int especie_nueva = docRespuesta["especie"];
                int fase_nueva    = docRespuesta["fase"];
                bool especie_valida = (especie_nueva == PLEUROTUS || especie_nueva == HERICIUM);
                bool fase_valida    = (fase_nueva == INCUBACION || fase_nueva == FRUCTIFICACION);

                if (especie_valida && fase_valida) {
                  if (especie_nueva != especie_actual || fase_nueva != fase_actual) {
                    especie_actual = (Especie) especie_nueva;
                    fase_actual    = (Fase) fase_nueva;
                    prefs.putUChar("especie", especie_actual);
                    prefs.putUChar("fase", fase_actual);
                    aplicarPerfilLocal();
                    Serial.println("🔄 Especie/fase actualizada desde la nube.");
                  }
                } else {
                  Serial.printf(
                    "⚠️ especie=%d o fase=%d fuera de rango recibido de la nube. Se ignora, se mantiene el perfil actual.\n",
                    especie_nueva, fase_nueva
                  );
                }
              }

              if (docRespuesta.containsKey("version_nube") && docRespuesta.containsKey("url_update")) {
                String version_nube = docRespuesta["version_nube"].as<String>();
                String url_update = docRespuesta["url_update"].as<String>();

                if (version_nube != VERSION_ACTUAL && url_update.length() > 0) {
                  Serial.printf("\n🆕 [OTA] ¡Nueva versión de firmware detectada en la nube!\n");
                  Serial.printf("   -> Versión Local: %s\n", VERSION_ACTUAL.c_str());
                  Serial.printf("   -> Versión Nube:  %s\n", version_nube.c_str());
                  
                  // Detenemos la comunicación http antes de iniciar el flasheo para liberar recursos de red
                  http.end();
                  
                  // Ejecutar proceso de actualización segura Esto reiniciará el ESP32 si tiene éxito
                  ejecutarActualizacionOTA(url_update);
                  return true; // Salida rápida
                }
              }

              exito = true; 
              batchID++; 
              prefs.putUInt("batch_id", batchID);
              // 🛠️ AJUSTE CRÍTICO: Reiniciar el índice para el próximo lote limpio
              indiceEscritura = 0;
              Serial.printf("🆔 Próximo batch_id=%lu\n",batchID);
              Serial.println("\n--- 📥 PARÁMETROS ACTUALIZADOS DESDE LA NUBE ---");
          } else {
              Serial.printf("❌ Error al parsear JSON: %s\n", error.c_str());
              http.end();
              return false;
          }
        }else {
          String respuesta = http.getString();
          Serial.println("========== ERROR DEL SERVIDOR ==========");
          Serial.printf("❌ HTTP %d\n",httpResponseCode);
          Serial.printf("device_id: %s\n", DEVICE_ID);
          Serial.printf("batch_id: %lu\n", batchID);
          Serial.printf("muestras: %d\n",cantidadLecturas);
          Serial.println("Respuesta:");
          Serial.println(respuesta);
          Serial.println("➡️ La ráfaga permanecerá en RAM para reintento.");
          Serial.println("========================================");
        } 
    } else{
        Serial.println();
        Serial.println("========== ERROR HTTPS ==========");
        Serial.printf("❌ Error: %s\n",http.errorToString(httpResponseCode).c_str());
        Serial.printf("device_id: %s\n", DEVICE_ID);
        Serial.printf("batch_id: %lu\n", batchID);
        Serial.printf("muestras: %d\n",cantidadLecturas);
        Serial.println("➡️ Se conservará la ráfaga para reintento.");
        Serial.println("===============================");
    }     
    http.end();
    return exito;
}

int fallosConsecutivosEnvio = 0;

void loop() {
  unsigned long tiempoActual = millis();
  
  

    
  
  // TAREA 1: Muestreo en memoria RAM
  if (tiempoActual - ultimoMuestreo >= INTERVALO_MUESTREO) { 
    ultimoMuestreo = tiempoActual;
    // 1.1 Leer sensores exactamente cada 5 segundos
    leersensores(); 
    // 2. FILTRO TÉRMICO: Corregido dentro del bloque de muestreo
    if (err_sht_int == 0 && err_scd == 0) { 
      calcularTemperaturaAmbiente(temp_int_sup, temp_int_inf);
    }
    // 1.2 Capturar el Timestamp Unix real (o 0 si no hay sincronización)
    bufferCultivo[indiceEscritura].timestamp = hora_sincronizada ? (uint32_t)time(NULL) : 0;
    // Guardar el resto de variables en el slot de memoria
    bufferCultivo[indiceEscritura].err_max   = err_max;
    bufferCultivo[indiceEscritura].err_sht_ext  = err_sht_ext;
    bufferCultivo[indiceEscritura].err_sht_int  = err_sht_int;
    bufferCultivo[indiceEscritura].err_scd   = err_scd;
    bufferCultivo[indiceEscritura].err_pzem  = err_pzem;
    bufferCultivo[indiceEscritura].temp_comp    = temp_comp; 
    bufferCultivo[indiceEscritura].temp_ext     = temp_ext; 
    bufferCultivo[indiceEscritura].hum_ext      = hum_ext;
    bufferCultivo[indiceEscritura].temp_int_sup = temp_int_sup; 
    bufferCultivo[indiceEscritura].hum_int_sup  = hum_int_sup;
    bufferCultivo[indiceEscritura].co2_inf      = co2; 
    bufferCultivo[indiceEscritura].temp_int_inf = temp_int_inf;
    bufferCultivo[indiceEscritura].hum_int_inf  = h_inf;
    bufferCultivo[indiceEscritura].resistencia  = resistencia;
    bufferCultivo[indiceEscritura].puerta       = estado_Puerta;
    bufferCultivo[indiceEscritura].voltaje         = pzem_voltaje;
    bufferCultivo[indiceEscritura].corriente_neta  = pzem_corriente;
    bufferCultivo[indiceEscritura].potencia_w      = pzem_potencia;
    bufferCultivo[indiceEscritura].energia_kwh     = pzem_energia;
    bufferCultivo[indiceEscritura].frecuencia_hz   = pzem_frecuencia;
    bufferCultivo[indiceEscritura].factor_potencia = pzem_pf;
    bufferCultivo[indiceEscritura].pwm_vent_lateral   = pwm_vent_lateral;
    bufferCultivo[indiceEscritura].pwm_vent_superior  = pwm_vent_superior;
    bufferCultivo[indiceEscritura].pwm_vent_co2       = pwm_vent_co2;
    bufferCultivo[indiceEscritura].pwm_luz            = pwm_luz;
    bufferCultivo[indiceEscritura].pwm_auxiliar       = pwm_aux;
    bufferCultivo[indiceEscritura].humidificador      = estado_humidificador;
    bufferCultivo[indiceEscritura].compresor          = estado_compresor;
    bufferCultivo[indiceEscritura].compresor_disponible   = compresor_disponible;
    bufferCultivo[indiceEscritura].tiempo_ciclo_compresor = tiempo_restante_ciclo;
    bufferCultivo[indiceEscritura].setpoint_temp      = setpoint_temp;
    bufferCultivo[indiceEscritura].especie_actual     = especie_actual;
    bufferCultivo[indiceEscritura].fase_actual        = fase_actual;
    bufferCultivo[indiceEscritura].hum_setpoint_min   = perfiles[especie_actual][fase_actual].hum_setpoint_min;
    bufferCultivo[indiceEscritura].hum_setpoint_max   = perfiles[especie_actual][fase_actual].hum_setpoint_max;
    bufferCultivo[indiceEscritura].co2_setpoint_max   = perfiles[especie_actual][fase_actual].co2_setpoint_max;
    bufferCultivo[indiceEscritura].luz_fotoperiodo_on = luz_fotoperiodo_on;
    bufferCultivo[indiceEscritura].hora_sincronizada  = hora_sincronizada;
    bufferCultivo[indiceEscritura].err_luz            = err_luz;
    bufferCultivo[indiceEscritura].permiso_nube_humidificador = permiso_nube_humidificador;
    bufferCultivo[indiceEscritura].permiso_nube_co2           = permiso_nube_co2;
    bufferCultivo[indiceEscritura].permiso_nube_luz           = permiso_nube_luz;
    indiceEscritura = (indiceEscritura + 1 ) % MAX_LECTURAS;
    muestrasDesdeUltimoEnvio++;          // Contador independiente para disparar el envío
    if (cantidadLecturas < MAX_LECTURAS){
      cantidadLecturas++;  
    }            
    else{
      bufferLleno = true;
      Serial.printf("📦 Buffer (Muestra guardada) [%d/%d]\n",
        cantidadLecturas,
        MAX_LECTURAS);
    }
    if(!bufferLleno){
      Serial.printf(
        "📦 Buffer: %d/%d\n",
        cantidadLecturas,
        MAX_LECTURAS 
        );
    }else{
      Serial.printf(
        "🔄 Buffer circular | idx=%d | %d muestras\n",
        indiceEscritura,
        cantidadLecturas
    );
    }

  }

  actualizarCicloCompresor();
  controlarTemperaturaCultivo();
  gestionarVentiladoresInteligentes();
  controlarHumedadCultivo();
  controlarCO2Cultivo();
  gestionarFotoperiodo();
  gestionarResyncNTP();
  // TAREA 2: Transmisión o Reintento Asíncrono controlado
  if (muestrasDesdeUltimoEnvio >= MAX_LECTURAS ) {
      if (millis() - ultimaTransmisionRafaga >= tiempo_reintento_envio_rafaga) {
          // ultimaTransmisionRafaga = millis();
          Serial.printf("📤 Intentando transmitir %d muestras...\n",
            cantidadLecturas
          );
          
          if (WiFi.status() == WL_CONNECTED) {
              if (enviarRafagaANube()) {
                ultimaTransmisionRafaga = millis();
                cantidadLecturas = 0; // Vaciado exitoso del buffer
                bufferLleno = false;
                muestrasDesdeUltimoEnvio = 0;
                fallosConsecutivosEnvio = 0;
                Serial.println("✅ Buffer liberado.");
              } else {
                  fallosConsecutivosEnvio++;
                  ultimaTransmisionRafaga = millis();
                  Serial.printf("⚠️ Error enviando la ráfaga. Intento fallido #%d\n", fallosConsecutivosEnvio);
              }
          } else {
            ultimaTransmisionRafaga = millis();
            fallosConsecutivosEnvio++;
            Serial.println("⚠️ Sin Wi-Fi disponible.");
          }
      }
  }
  delay(10); 
}