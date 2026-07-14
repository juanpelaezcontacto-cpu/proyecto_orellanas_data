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
#include <Preferences.h>

Preferences prefs;
uint32_t batchID; // Declarar el contador:
const char* DEVICE_ID = "CAMARA_01";
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
SHT4x_7semi sht1;                   // T/H Interior superior
SHT4x_7semi sht2;                   // T/H Exterior (entrada de aire)
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
const int MAX_LECTURAS = 60; 
int indiceEscritura = 0;          // Próxima posición donde se escribirá
int cantidadLecturas = 0;         // Número de lecturas válidas almacenadas
bool bufferLleno = false;         // Indica si ya comenzó la sobrescritura
int muestrasDesdeUltimoEnvio = 0; // Control del período de envío
const unsigned long INTERVALO_REINTENTO_MS = 30000;
unsigned long ultimoIntentoEnvio = 0;

// Variables Globales de Diagnóstico
int err_max = 0, err_sht1 = 0, err_sht2 = 0, err_scd = 0, err_pzem = 0;
uint8_t ciclosSinDatoSCD = 0;

// Variables de Clima y Sensores
float temp_comp = 0.0;
float t1 = 0.0;          // SHT Exterior 
float h1 = 0.0;          
float t2 = 0.0;          // SHT Interior Superior 
float h2 = 0.0;          
float t_inf = 0.0;       // SCD40 o Inferior 
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
    int err_max; int err_sht1; int err_sht2; int err_scd; int err_pzem;
    float temp_comp; float temp_ext; float hum_ext; float temp_int_sup; float hum_int_sup;
    float temp_int_inf; float hum_int_inf; int co2_inf; float resistencia; int puerta;
    float voltaje; float corriente_neta; float potencia_w; float energia_kwh; float frecuencia_hz; float factor_potencia;
    int pwm_vent_lateral; int pwm_vent_superior; int pwm_vent_co2; int pwm_luz; int pwm_auxiliar;
    bool humidificador; bool compresor; bool compresor_disponible; long tiempo_ciclo_compresor; float setpoint_temp;
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

void setup() {
  prefs.begin("orellanas", false);
  batchID = prefs.getUInt("batch_id", 1);
  if (batchID == 0) {
    batchID = 1;
}
  pinMode(humidificador, OUTPUT);
  digitalWrite(humidificador, estado_humidificador);
  Serial.begin(115200);
  
  Wire.begin(SDA_P, SCL_P, 100000);  
  Wire.setTimeOut(25);      
  Wire1.begin(SDA_S, SCL_S, 100000);      

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Conectado.");
  
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

  if (!sht1.begin(Wire, 0x44, SCL_P, SDA_P)) { Serial.println("Error SHT40 1"); while (1); }
  if (!sht2.begin(Wire1, 0x44, SCL_S, SDA_S)) { Serial.println("Error SHT40 2"); while (1); }
  sht1.setPrecision(REPEATABILITY_HIGH);
  sht2.setPrecision(REPEATABILITY_HIGH);

  scd.begin(Wire, 0x62);
  scd.stopPeriodicMeasurement();
  delay(500);
  scd.startPeriodicMeasurement();
  
  pinMode(Puerta, INPUT_PULLUP); 
  PZEMSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);

  // Pre-cargar el filtro térmico para evitar arranques con promedio en 0
  Serial.println("Cebando filtro de temperatura...");
  float t_init2 = 20.0, t_init_inf = 20.0;
  // Intentar una lectura rápida para no iniciar a ciegas
  sht2.readTemperatureHumidity(t_init2, h2);
  scd.readMeasurement(co2, t_init_inf, h_inf);
  for (int i = 0; i < MAX_MUESTRAS_TEMP; i++) {
    lecturas_historicas_temp[i] = (t_init2 + t_init_inf) / 2.0;
  }
  temp_interior_promedio = (t_init2 + t_init_inf) / 2.0;
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

void calcularTemperaturaAmbiente(float t2, float t_inf) {
  float t_instantanea = (t2 + t_inf) / 2.0; 
  lecturas_historicas_temp[indice_lectura_temp] = t_instantanea;
  indice_lectura_temp = (indice_lectura_temp + 1) % MAX_MUESTRAS_TEMP; 
  
  float suma = 0.0;
  for (int i = 0; i < MAX_MUESTRAS_TEMP; i++) {
    suma += lecturas_historicas_temp[i];
  }
  temp_interior_promedio = suma / MAX_MUESTRAS_TEMP; 
}

void controlarTemperaturaCultivo() {
  float limite_superior = setpoint_temp + HISTERESIS;             
  float limite_inferior_anticipado = setpoint_temp + ANTICIPACION_CORTE; 

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

void gestionarVentiladoresInteligentes() {
  static int ultimo_pwm_lateral = -1;
  static int ultimo_pwm_superior = -1;

  if (estado_compresor == 1 || (estado_compresor == 0 && (millis() - tiempo_ultimo_apagado < POST_ENFRIAMIENTO))) {
    pwm_vent_lateral = 255; pwm_vent_superior = 255;
    cronometro_recirculacion = millis(); 
  } else {
    unsigned long tiempo_desde_ultimo_ciclo = millis() - cronometro_recirculacion;
    if (tiempo_desde_ultimo_ciclo < DURACION_RECIRCULACION) {
      pwm_vent_lateral = 255; pwm_vent_superior = 255;
    } else if (tiempo_desde_ultimo_ciclo < INTERVALO_RECIRCULACION) {
      pwm_vent_lateral = 0; pwm_vent_superior = 0;
    } else {
      cronometro_recirculacion = millis();
    }
  }

  // Escribir solo si hubo un cambio real
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
  unsigned long tiempoActual = millis();   
  if (tiempoActual - ultimoEnvio >= intervaloEnvio){
    ultimoEnvio = tiempoActual;
    
    // Lectura SCD40
    bool dataReady = false;
    scd.getDataReadyStatus(dataReady); 
    if (dataReady) {
      scd.readMeasurement(co2, t_inf, h_inf);
      if ( err_scd != 0){
         Serial.println("✅ SCD40 volvió a entregar datos.");
      }
      err_scd = 0;
      ciclosSinDatoSCD = 0;
    }else {
        ciclosSinDatoSCD++;
        if (ciclosSinDatoSCD >= 3){
          err_scd = 1;
          Serial.println("⚠️ SCD40 sin datos nuevos desde hace 15 s.");
        } 
    }
    uint16_t rtd = thermo.readRTD();
    resistencia = ((float)rtd / 32768.0) * RREF;
    uint8_t codigoFalla = thermo.readFault();
    
    if (codigoFalla != 0) {
      thermo.clearFault();
      delay(5); 
      codigoFalla = thermo.readFault();
    }

    if (codigoFalla != 0) { err_max = 1; } 
    else { err_max = 0; temp_comp = thermo.temperature(RNOMINAL, RREF); }

    // SHT40s
    err_sht1 = !sht1.readTemperatureHumidity(t1, h1);
    err_sht2 = !sht2.readTemperatureHumidity(t2, h2);
    
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
}

bool enviarRafagaANube() {
    WiFiClientSecure client;
    client.setCACert(ROOT_CA);
    client.setTimeout(15000); /*Esto evita que un handshake TLS lento o una red inestable dejen bloqueado el ESP32 durante demasiado tiempo. Un valor de 15 segundos suele ser un buen compromiso para conexiones móviles o WiFi con latencia elevada.*/
    HTTPClient http;
    
    // CORRECCIÓN SINTAXIS: Se niega para controlar el fallo de inicialización
  
    if (!http.begin(client, serverName)) {
      Serial.println("❌ No se pudo inicializar la conexión HTTP con el cliente seguro.");
      return false;
    }
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_SECRET_ESP32);
    http.setTimeout(15000); 

    DynamicJsonDocument doc(32768); 
    doc["device_id"] = DEVICE_ID;
    doc["batch_id"] = batchID;
    JsonArray historial = doc.createNestedArray("historial_lecturas");
    int inicio = bufferLleno ? indiceEscritura: 0;
    for (int i = 0; i < cantidadLecturas; i++) {
        int idx = (inicio + i) % MAX_LECTURAS;
        JsonObject obj = historial.createNestedObject();
        obj["err_max"]  = bufferCultivo[idx].err_max;
        obj["err_sht1"] = bufferCultivo[idx].err_sht1;
        obj["err_sht2"] = bufferCultivo[idx].err_sht2;
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
              pwm_vent_lateral  = docRespuesta["set_vent_lateral"];  
              pwm_vent_superior = docRespuesta["set_vent_superior"];
              pwm_vent_co2      = docRespuesta["set_vent_co2"];
              pwm_luz           = docRespuesta["set_luz"];
              estado_humidificador   = docRespuesta["set_humidificador"];
              permiso_nube_compresor = docRespuesta["set_compresor"];     
              setpoint_temp         = docRespuesta["setpoint_temp"];                

              ledcWrite(vent_lateral, pwm_vent_lateral);
              ledcWrite(vent_superior, pwm_vent_superior);
              ledcWrite(vent_co2, pwm_vent_co2);
              ledcWrite(luz, pwm_luz);
              digitalWrite(humidificador, estado_humidificador ? HIGH : LOW);
              exito = true;
              batchID++;
              prefs.putUInt("batch_id", batchID);
              Serial.printf(
                "🆔 Próximo batch_id=%lu\n",
                batchID
              );
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
    leersensores(); 
    actualizarCicloCompresor();
    controlarTemperaturaCultivo();
    gestionarVentiladoresInteligentes();

    unsigned long tiempoActual = millis();
    
    // TAREA 1: Muestreo en memoria RAM
    if (tiempoActual - ultimoMuestreo >= INTERVALO_MUESTREO) { 
      ultimoMuestreo = tiempoActual;
      bufferCultivo[indiceEscritura].err_max   = err_max;
      bufferCultivo[indiceEscritura].err_sht1  = err_sht1;
      bufferCultivo[indiceEscritura].err_sht2  = err_sht2;
      bufferCultivo[indiceEscritura].err_scd   = err_scd;
      bufferCultivo[indiceEscritura].err_pzem  = err_pzem;
      bufferCultivo[indiceEscritura].temp_comp    = temp_comp; 
      bufferCultivo[indiceEscritura].temp_ext     = t1; 
      bufferCultivo[indiceEscritura].hum_ext      = h1;
      bufferCultivo[indiceEscritura].temp_int_sup = t2; 
      bufferCultivo[indiceEscritura].hum_int_sup  = h2;
      bufferCultivo[indiceEscritura].co2_inf      = co2; 
      bufferCultivo[indiceEscritura].temp_int_inf = t_inf;
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
    
                        
    if (err_sht2 == 0 && err_scd == 0) { 
        calcularTemperaturaAmbiente(t2, t_inf);
    }


    // TAREA 2: Transmisión o Reintento Asíncrono controlado
    // TAREA 2: Transmisión asíncrona
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