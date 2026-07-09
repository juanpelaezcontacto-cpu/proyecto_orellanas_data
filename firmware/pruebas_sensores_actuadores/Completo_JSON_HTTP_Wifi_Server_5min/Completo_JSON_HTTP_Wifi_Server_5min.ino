#include <Wire.h>
#include <7semi_SHT4x.h>
#include <SensirionI2cScd4x.h>
#include <SPI.h>
#include <Adafruit_MAX31865.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <WiFi.h>
#include <HTTPClient.h>

// Credenciales de la red Wi-Fi
const char* ssid = "MALEJA_2.4";
const char* password = "macp092021";
//const char* host     = "192.168.1.11"; // IP local de tu computadora de Python
// La URL de tu servidor FastAPI (Local en fase de pruebas)
// Reemplaza por la IP de tu PC. Cuando lo subas a la nube, será "https://tu-app.render.com/telemetria"
//const char* serverName = "http://192.168.1.11:8000/telemetria";
//const uint16_t port  = 5005;          // Puerto arbitrario libre
//WiFiClient client;

// Pines conexion UART PZEM004T Sensor de V/I/P/Energía/f/pf/
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
//Canal principal: SHT40 T/H externa - SCD40 
//Canal secundario: SHT40 T/H interna 
#define SDA_P 25
#define SCL_P 26
#define SDA_S 5
#define SCL_S 15

SHT4x_7semi sht1;                   // T/H Interior superior
SHT4x_7semi sht2;                   // T/H Exterior (entrada de aire)
SensirionI2cScd4x scd;              // CO2/T/H interior inferior
Adafruit_MAX31865 thermo(PIN_CS);   // PT100 compresor
const int Puerta = 27;              // Final carrera puerta en GPIO 27
int estadoPuerta = 0;               //0 = Cerrada, 1 = Abierta
HardwareSerial PZEMSerial(2);       //Voy a crear un objeto de comunicación llamado PZEMSerial que va a utilizar el periférico físico número 2 (UART2) del chip
PZEM004Tv30 pzem(PZEMSerial, RXD2, TXD2);  //canal, receptor y transmisor

// --- Configuración de Tiempos ---
const unsigned long INTERVALO_MUESTREO = 5000;       // 5 segundos en ms
const unsigned long INTERVALO_TRANSMISION = 300000;  // 5 minutos en ms (5 * 60 * 1000)
unsigned long ultimoMuestreo = 0;
unsigned long ultimaTransmision = 0;

// --- Configuración del Buffer Local ---
const int MAX_LECTURAS = 60; // 12 muestras por minuto * 5 minutos = 60
int contadorLecturas = 0;

//Variables Globales
int err_max = 0, err_sht1 = 0, err_sht2 = 0, err_scd = 0, err_pzem = 0;

// Variables de Clima y Sensores
float temp_comp = 0.0;
float t1 = 0.0;          // SHT Exterior (Temperatura)
float h1 = 0.0;          // SHT Exterior (Humedad)
float t2 = 0.0;          // SHT Interior Superior (Temperatura)
float h2 = 0.0;          // SHT Interior Superior (Humedad)
float t_inf = 0.0;       // SCD40 o Inferior (Temperatura)
float h_inf = 0.0;       // SCD40 o Inferior (Humedad)
uint16_t co2 = 0;        // Nivel de CO2 (reemplaza o unifica con co2_inf)
float resistencia = 0.0; // Resistencia PT100/Sensor
int puerta = 0;          // Estado de la puerta (0 o 1)

// Variables de Monitoreo Eléctrico (PZEM)
float pzem_voltaje = 0.0;
float pzem_corriente = 0.0;
float pzem_potencia = 0.0;
float pzem_energia = 0.0;
float pzem_frecuencia = 0.0;
float pzem_pf = 0.0;

struct RegistroCompletoHistorial {
    // Diagnóstico
    int err_max;
    int err_sht1;
    int err_sht2;
    int err_scd;
    int err_pzem;

    // Sensores Clima
    float temp_comp;
    float temp_ext;
    float hum_ext;
    float temp_int_sup;
    float hum_int_sup;
    float temp_int_inf;
    float hum_int_inf;
    int co2_inf;
    float resistencia;
    int puerta;

    // Eléctrico
    float voltaje;
    float corriente_neta;
    float potencia_w;
    float energia_kwh;
    float frecuencia_hz;
    float factor_potencia;

    // Actuadores (Salidas)
    int vent_lateral;
    int vent_superior;
    int vent_co2;
    int luz;
    int pwm_auxiliar;
    bool humidificador;
    bool compresor;
    bool compresor_disponible;
    long tiempo_ciclo_compresor;
}; 
// EL BUFFER EN MEMORIA RAM ---
RegistroCompletoHistorial bufferCultivo[MAX_LECTURAS];

const char* serverName = "https://orellanas-backend-production.up.railway.app/telemetria";

const int maxIntentos = 50; // 20 intentos para leer el SCD * 100ms = 2 segundos de tolerancia máxima

unsigned long ultimoEnvio = 0; // variable para esperar "intervaloEnvio" segundos para lectura 
const unsigned long intervaloEnvio = 5000; // 5 segundos
// ================= Salidas digitales =================
const int humidificador   = 4;
bool estado_humidificador = 0;
const int compresor       = 33;
// ================= Seguridad del Compresor =================
bool estado_compresor     = 0;
const unsigned long tiempo_min_apagado = 180000; //Segundos. 3 minutos de protección
unsigned long tiempo_ultimo_apagado = -tiempo_min_apagado;
int compresor_disponible = 1; // 1 = Listo, 0 = Bloqueado
long tiempo_restante_ciclo = 0; // Segundos que faltan para poder encender compresor
unsigned long tiempo_ciclo_compresor = 0; // O "long" si usas números con signo
// ================= Configuración PWM =================
// Pines fisicos GPIO 
const int vent_lateral = 19;
const int vent_superior = 18;
const int vent_co2 = 21;
const int luz = 22;
const int aux = 23;           //Modulo PWM auxiliar. Esta disponible para ser usado 
// 8 bits de resolución (valores de 0 a 255)
const int PWM_BITS            = 8;    
// Canales PWM
const int CH_vent_lateral     = 0;    // Canal 0 PWM interno de la ESP32 (0-15)
const int CH_vent_superior    = 1;    // Canal 1 PWM interno de la ESP32 (0-15)
const int CH_vent_co2         = 2;    // Canal 2 PWM interno de la ESP32 (0-15)
const int CH_luz              = 3;    // Canal 3 PWM interno de la ESP32 (0-15)
const int CH_aux          = 4;    // Canal 4 PWM interno de la ESP32 (0-15)
// Frecuencia control PWM
const int frec_vent_lateral   = 2500;   // frecuencia 2.5 kHz es un estándar para ventilador PC
const int frec_vent_superior  = 2500;   // frecuencia 2.5 kHz es un estándar para ventilador PC
const int frec_vent_co2       = 2500;   // frecuencia 2.5 kHz es un estándar para ventilador PC
const int frec_luz            = 25000;  // frecuencia entre 5-40 khz
const int frec_aux            = 2500;   // frecuencia por defecto. Cambiar cuando usar este pin auxiliar
// Variables PWM. Almacena el Duty Cycle actual (0-255)
int pwm_vent_lateral  = 0;
int pwm_vent_superior = 0;
int pwm_vent_co2      = 0;
int pwm_luz           = 0;
int pwm_aux         = 0;
int pwm_auxiliar = 0;
// ================= ================== ================
JsonDocument doc; // O StaticJsonDocument / DynamicJsonDocument



void setup() {
  //Inicialización humidificador
  pinMode(humidificador, OUTPUT);
  digitalWrite(humidificador, estado_humidificador);
  // 2. Inicializar comunicación serial
  Serial.begin(115200);
  // ---------- Bus I2C principal ----------
  Wire.begin(SDA_P, SCL_P,100000);  // Forzar bus externo a 100 kHz
  Wire.setTimeOut(25);      // Tiempo de espera máximo en milisegundos
   // ---------- Bus I2C secundario ----------
  Wire1.begin(SDA_S, SCL_S,100000);      // Forzar bus externo a 100 kHz
  // Conexión Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Conectado.");
  
  delay(1000);
  //Inicialización de ventilador lateral
  ledcAttachChannel(vent_lateral, frec_vent_lateral, PWM_BITS, CH_vent_lateral);
  ledcWrite(vent_lateral, pwm_vent_lateral);
  //Inicialización de ventilador superior
  ledcAttachChannel(vent_superior, frec_vent_superior, PWM_BITS, CH_vent_superior);
  ledcWrite(vent_superior, pwm_vent_superior);
  //Inicialización de ventilador co2
  ledcAttachChannel(vent_co2, frec_vent_co2, PWM_BITS, CH_vent_co2);
  ledcWrite(vent_co2, pwm_vent_co2);
  //Inicializacion Luz
  ledcAttachChannel(luz, frec_luz, PWM_BITS, CH_luz);
  ledcWrite(luz, pwm_luz);
  //Inicializacion auxiliar
  ledcAttachChannel(aux, frec_aux, PWM_BITS, CH_aux);
  ledcWrite(aux, pwm_aux);
  //Inicialización Compresor
  pinMode(compresor, OUTPUT);
  digitalWrite(compresor, estado_compresor);
  // ---------- SPI ----------
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);
  thermo.begin(MAX31865_2WIRE); // Configuración a 2 hilos
  thermo.clearFault();
  delay(100); // Permite que los voltajes de referencia en el chip se estabilicen
  
 
  Serial.println();
  Serial.println("Iniciando sensores...");

  // ---------------- SHT40 1 ----------------
  if (!sht1.begin(Wire, 0x44, SCL_P, SDA_P)) {
    Serial.println("Error iniciando SHT40 1");
    while (1);
  }

  // ---------------- SHT40 2 ----------------
  if (!sht2.begin(Wire1, 0x44, SCL_S, SDA_S)) {
    Serial.println("Error iniciando SHT40 2");
    while (1);
  }
  sht1.setPrecision(REPEATABILITY_HIGH);
  sht2.setPrecision(REPEATABILITY_HIGH);
  Serial.println("SHT40 1 Y 2 OK");

  // ---------------- SCD40 ----------------

  scd.begin(Wire, 0x62);
  scd.stopPeriodicMeasurement();
  delay(500);
  scd.startPeriodicMeasurement();
  Serial.println("SCD40 OK");
  //---------------- Puerta ----------------
  pinMode(Puerta, INPUT_PULLUP); //Esto activa una resistencia interna de la ESP32 que mantiene el pin en HIGH
  Serial.println();
  //---------------- PZEM ----------------
  //Abre el puerto serie número 2, configura los pines 16 y 17 para esta tarea,
  //y empieza a escuchar y transmitir a una velocidad de 9600 baudios usando
  // el formato estándar de 8 bits de datos, sin paridad y con 1 bit de parada".
  PZEMSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);
}

void actualizarCicloCompresor() {
  // Si el compresor está encendido, siempre está disponible=1 y timer=0
  if (estado_compresor == 1) {
    compresor_disponible = 1;
    tiempo_restante_ciclo = 0;
  } 
  // Si está apagado, calculamos constantemente cuánto tiempo le queda
  else {
    unsigned long tiempo_transcurrido = millis() - tiempo_ultimo_apagado;
    
    if (tiempo_transcurrido >= tiempo_min_apagado) {
      compresor_disponible = 1; // ¡Ya pasaron los 3 min! Se libera automáticamente
      tiempo_restante_ciclo = 0;
    } else {
      compresor_disponible = 0; // Sigue bloqueado
      tiempo_restante_ciclo = (tiempo_min_apagado - tiempo_transcurrido) / 1000;
    }
  }
}


void leersensores(){
unsigned long tiempoActual = millis();   // TEMPORIZADOR NO BLOQUEANTE PARA LA TELEMETRÍA
  if (tiempoActual - ultimoEnvio >= intervaloEnvio){
    ultimoEnvio = tiempoActual;
    // Banderas de error individuales (0 = Sin error, 1 = Error)
    err_max  = 0;
    err_sht1 = 0;
    err_sht2 = 0;
    err_scd  = 1;
    err_pzem = 0;
    // SCD40: esperando hasta que esten listos los datos del SCD40 para leerlos
    bool dataReady = false;
    scd.getDataReadyStatus(dataReady); //Preguntamos al chip si ya terminó de procesar la lectura actual
    if (dataReady) {
      if (scd.readMeasurement(co2, t_inf, h_inf) != 0){ err_scd = 1;} //Falló el protocolo I2C al leer
      else {err_scd = 0;} //Lectura exitosa, Si dataReady es verdadero (diferente de 0), leemos inmediatamente.
    }

    // ======== Monitoreo PT100 ========
    thermo.clearFault();
    delayMicroseconds(50); // Tiempo mínimo para que el chip procese el borrado
    uint16_t rtd = thermo.readRTD();
    float ratio = (float)rtd / 32768.0;
    resistencia = ratio * RREF;
    uint8_t codigoFalla = thermo.readFault();
    
    if (codigoFalla != 0) {
      // Si el chip reportó falla, intentamos recuperarlo inmediatamente
      thermo.clearFault();
      delay(5); // Pausa real para que el ADC interno del MAX intente una nueva muestra sin ruido
      
      // Volvemos a leer el registro después del respiro físico
      codigoFalla = thermo.readFault();
    }

    // 3. Evaluación final del estado real del hardware
    if (codigoFalla != 0) {
        err_max = 1; // La falla persistió incluso tras la limpieza y la pausa
        // NOTA: No actualizamos temp_comp, protegiendo el sistema con el último valor seguro
    } else {
        err_max = 0;
        // Solo calculamos la temperatura si el registro de fallas está completamente limpio
        temp_comp = thermo.temperature(RNOMINAL, RREF);
    }
    // ======== SHT40 EXTERIOR ========
    if (!sht1.readTemperatureHumidity(t1,h1))       { err_sht1 = 1; }
    else{err_sht1 = 0;} 
    // ======== SHT40 INTERIOR ========
    if (!sht2.readTemperatureHumidity(t2,h2))       { err_sht2 = 1; } 
    else{err_sht2 = 0;}
    // ======== Puerta ======== Si digitalRead da LOW (0), la puerta está cerrada (toca GND).
    estadoPuerta = !digitalRead(Puerta); //Al poner el signo "!", estadoPuerta guardará un 1 si está abierta y 0 si está cerrada.
    // ======== LECTURA FIABLE PZEM-004T Conexión 100A ======== 
    // El transformador de corriente tiene 3 vueltas de cable.

    if (isnan(pzem_voltaje) || isnan(pzem_corriente) || isnan(pzem_potencia) || isnan(pzem_energia) || isnan(pzem_frecuencia) || isnan(pzem_pf)) {
      err_pzem = 1;
      pzem_voltaje = 0.0;
      pzem_corriente = 0.0;
      pzem_potencia = 0.0;
      pzem_energia = 0.0; // En caso de error, enviamos 0
      pzem_frecuencia = 0.0;
      pzem_pf = 0.0;
    }else{
      err_pzem = 0;
      pzem_voltaje      = pzem.voltage();
      pzem_corriente    = pzem.current()/3.0; 
      pzem_potencia     = pzem.power()/3.0;
      pzem_energia      = pzem.energy()/3.0;
      pzem_frecuencia   = pzem.frequency();
      pzem_pf           = pzem.pf();
    }
    //crearYenviarJSON();
  }
}

void enviarRafagaANube() {
    
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    // Asignamos tamaño al documento JSON dinámico. 
    // 60 lecturas con múltiples campos requieren un buffer JSON grande (~16 a 20 KB).
    DynamicJsonDocument doc(32768); 

    JsonArray historial = doc.createNestedArray("historial_lecturas");
    
    for (int i = 0; i < contadorLecturas; i++) {
        JsonObject obj = historial.createNestedObject();
        
        obj["err_max"]  = bufferCultivo[i].err_max;
        obj["err_sht1"] = bufferCultivo[i].err_sht1;
        obj["err_sht2"] = bufferCultivo[i].err_sht2;
        obj["err_scd"]  = bufferCultivo[i].err_scd;
        obj["err_pzem"] = bufferCultivo[i].err_pzem;

        obj["temp_comp"]   = bufferCultivo[i].temp_comp;
        obj["temp_ext"]    = bufferCultivo[i].temp_ext;
        obj["hum_ext"]     = bufferCultivo[i].hum_ext;
        obj["temp_int_sup"] = bufferCultivo[i].temp_int_sup;
        obj["hum_int_sup"]  = bufferCultivo[i].hum_int_sup;
        obj["temp_int_inf"] = bufferCultivo[i].temp_int_inf;
        obj["hum_int_inf"]  = bufferCultivo[i].hum_int_inf;
        obj["co2_inf"]      = bufferCultivo[i].co2_inf;
        obj["resistencia"]  = bufferCultivo[i].resistencia;
        obj["puerta"]       = bufferCultivo[i].puerta;

        obj["voltaje"]         = bufferCultivo[i].voltaje;
        obj["corriente_neta"]  = bufferCultivo[i].corriente_neta;
        obj["potencia_w"]      = bufferCultivo[i].potencia_w;
        obj["energia_kwh"]     = bufferCultivo[i].energia_kwh;
        obj["frecuencia_hz"]   = bufferCultivo[i].frecuencia_hz;
        obj["factor_potencia"] = bufferCultivo[i].factor_potencia;

        obj["vent_lateral"]   = bufferCultivo[i].vent_lateral;
        obj["vent_superior"]  = bufferCultivo[i].vent_superior;
        obj["vent_co2"]       = bufferCultivo[i].vent_co2;
        obj["luz"]            = bufferCultivo[i].luz;
        obj["pwm_auxiliar"]   = bufferCultivo[i].pwm_auxiliar;
        obj["humidificador"]  = bufferCultivo[i].humidificador;
        obj["compresor"]      = bufferCultivo[i].compresor;
        obj["compresor_disponible"] = bufferCultivo[i].compresor_disponible;
        obj["tiempo_ciclo_compresor"] = bufferCultivo[i].tiempo_ciclo_compresor;
    }

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("🚀 Enviando ráfaga analítica integral a Railway...");
    int httpResponseCode = http.POST(requestBody);
    //int httpResponseCode = http.POST(jsonOutput);

    if (httpResponseCode > 0) {
        Serial.printf("✅ Ráfaga enviada. Código servidor: %d\n", httpResponseCode);
        String payload = http.getString();
        // 2. Deserializar el JSON de retorno
        DynamicJsonDocument docRespuesta(1024);
        deserializeJson(docRespuesta, payload);
        
        // 3. Extraer el valor que se ajustó en Supabase y actualizar las variables locales
        pwm_vent_lateral  = docRespuesta["set_vent_lateral"];  // <-- Pasa de 0 a 255
        pwm_vent_superior = docRespuesta["set_vent_superior"];
        pwm_vent_co2      = docRespuesta["set_vent_co2"];
        pwm_luz           = docRespuesta["set_luz"];
        estado_humidificador     = docRespuesta["set_humidificador"];
        estado_compresor         = docRespuesta["set_compresor"];
        // 4. ¡CRÍTICO! Forzar el cambio físico en los pines GPIO usando ledcWrite
        ledcWrite(vent_lateral, pwm_vent_lateral);
        ledcWrite(vent_superior, pwm_vent_superior);
        ledcWrite(vent_co2, pwm_vent_co2);
        ledcWrite(luz, pwm_luz);
        digitalWrite(humidificador, estado_humidificador ? HIGH : LOW);
        digitalWrite(compresor, estado_compresor ? HIGH : LOW);
        
        // 4. Monitor de diagnóstico completo en la consola serie
        Serial.println("\n--- 📥 COMANDOS RECIBIDOS DESDE LA NUBE ---");
        Serial.printf("🌀 Vent. Lateral  : %d / 255\n", pwm_vent_lateral);
        Serial.printf("🌀 Vent. Superior : %d / 255\n", pwm_vent_superior);
        Serial.printf("🫁 Vent. CO2      : %d / 255\n", pwm_vent_co2);
        Serial.printf("💡 Intensidad Luz : %d / 255\n", pwm_luz);
        Serial.printf("💨 Humidificador  : %s\n", humidificador ? "ENCENDIDO" : "APAGADO");
        Serial.printf("❄️ Compresor      : %s\n", compresor ? "ENCENDIDO" : "APAGADO");
        Serial.println("-------------------------------------------\n");
        // 5. Vaciar el buffer para los próximos 5 minutos
        contadorLecturas = 0;
    } else {
        Serial.printf("❌ Falló el envío. Código HTTP: %d. Conservando datos en RAM.\n", httpResponseCode);
    }
    http.end();
}

void ejecutarControlLocal() {
    // Aquí adentro pones tu lógica matemática o de umbrales para activar relés y PWMs.
    // Esto se ejecutará de manera fluida cada 5 segundos.
}


void loop() {
    // 1. Adquisición de Datos y Control Local Obligatorio
    leersensores(); 
    actualizarCicloCompresor();

    unsigned long tiempoActual = millis();
    
    // =====================================================================
    // TAREA 1: RECOLECCIÓN DE MUESTRAS EN RAM (Cada 5 segundos / INTERVALO_MUESTREO)
    // =====================================================================
    if (tiempoActual - ultimoMuestreo >= INTERVALO_MUESTREO) { 
        ultimoMuestreo = tiempoActual;
        
        if (contadorLecturas < MAX_LECTURAS) {
            // Almacenar Diagnóstico
            bufferCultivo[contadorLecturas].err_max   = err_max;
            bufferCultivo[contadorLecturas].err_sht1  = err_sht1;
            bufferCultivo[contadorLecturas].err_sht2  = err_sht2;
            bufferCultivo[contadorLecturas].err_scd   = err_scd;
            bufferCultivo[contadorLecturas].err_pzem  = err_pzem;

            // Almacenar Clima
            bufferCultivo[contadorLecturas].temp_comp    = temp_comp; 
            bufferCultivo[contadorLecturas].temp_ext     = t1; 
            bufferCultivo[contadorLecturas].hum_ext      = h1;
            bufferCultivo[contadorLecturas].temp_int_sup = t2; 
            bufferCultivo[contadorLecturas].hum_int_sup  = h2;
            bufferCultivo[contadorLecturas].co2_inf      = co2; 
            bufferCultivo[contadorLecturas].temp_int_inf = t_inf;
            bufferCultivo[contadorLecturas].hum_int_inf  = h_inf;
            bufferCultivo[contadorLecturas].resistencia  = resistencia;
            bufferCultivo[contadorLecturas].puerta       = puerta;

            // Almacenar Eléctrico
            bufferCultivo[contadorLecturas].voltaje         = pzem_voltaje;
            bufferCultivo[contadorLecturas].corriente_neta  = pzem_corriente;
            bufferCultivo[contadorLecturas].potencia_w      = pzem_potencia;
            bufferCultivo[contadorLecturas].energia_kwh     = pzem_energia;
            bufferCultivo[contadorLecturas].frecuencia_hz   = pzem_frecuencia;
            bufferCultivo[contadorLecturas].factor_potencia = pzem_pf;

            // Almacenar Actuadores
            bufferCultivo[contadorLecturas].vent_lateral   = pwm_vent_lateral;
            bufferCultivo[contadorLecturas].vent_superior  = pwm_vent_superior;
            bufferCultivo[contadorLecturas].vent_co2       = pwm_vent_co2;
            bufferCultivo[contadorLecturas].luz            = pwm_luz;
            bufferCultivo[contadorLecturas].pwm_auxiliar   = pwm_aux;
            bufferCultivo[contadorLecturas].humidificador  = estado_humidificador;
            bufferCultivo[contadorLecturas].compresor      = estado_compresor;
            bufferCultivo[contadorLecturas].compresor_disponible   = compresor_disponible;
            bufferCultivo[contadorLecturas].tiempo_ciclo_compresor = tiempo_restante_ciclo;

            contadorLecturas++;
            Serial.printf("📦 Muestra completa guardada en buffer [%d/%d]\n", contadorLecturas, MAX_LECTURAS);
        }
    }

    // =====================================================================
    // TAREA 2: ENVIAR RÁFAGA AUTOMÁTICA CUANDO EL BUFFER SE LLENE (60 Muestras)
    // =====================================================================
    if (contadorLecturas >= MAX_LECTURAS) {
        Serial.println("🚩 Buffer lleno (5 minutos acumulados). Iniciando transferencia...");
        
        if (WiFi.status() == WL_CONNECTED) {
            enviarRafagaANube();
        } else {
            Serial.println("⚠️ No se puede transmitir: Conexión Wi-Fi perdida. Reintentando en el próximo ciclo.");
            // No reseteamos contadorLecturas para no perder la información en RAM
        }
    }

    // Estabilidad del núcleo de la ESP32
    delay(10); 
}




