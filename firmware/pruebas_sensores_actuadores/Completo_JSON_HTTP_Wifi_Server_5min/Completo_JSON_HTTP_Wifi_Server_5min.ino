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
const char* serverName = "https://orellanas-backend-production.up.railway.app/telemetria";
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

struct RegistroSensor {
  float resistencia = 0.0, temp_comp = 0.0;
  float t1 = 0.0, h1 = 0.0; //SHT40 EXTERIOR
  float t2 = 0.0, h2 = 0.0; //SHT40 INTERIOR
  uint16_t co2 = 0;
  float t_inf = 0.0, h_inf = 0.0;
  float pzem_voltaje = 0.0;
  float pzem_corriente = 0.0;
  float pzem_potencia = 0.0;
  float pzem_energia = 0.0;
  float pzem_frecuencia = 0.0;
  float pzem_pf = 0.0;
}
// Creamos el arreglo en RAM para almacenar la ráfaga
RegistroSensor bufferCultivo[MAX_LECTURAS];

const char* serverName = "orellanas-backend-production.up.railway.app/telemetria";

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
int pwm_aux           = 0;
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
      pzem_corriente    = pzem.current()/3; 
      pzem_potencia     = pzem.power()/3;
      pzem_energia      = pzem.energy()/3;
      pzem_frecuencia   = pzem.frequency();
      pzem_pf           = pzem.pf();
    }
    //crearYenviarJSON();
  }
}

void sincronizarConServidorWeb() {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        
        // 1. Inicializar la conexión hacia el endpoint de FastAPI
        http.begin(serverName);
        http.addHeader("Content-Type", "application/json");

        // 2. Crear el JSON de telemetría (Usa los nombres exactos de tu class Telemetria)
        // Ajusta el tamaño (StaticJsonDocument) según el número de variables
        StaticJsonDocument<1024> docRequest;
        
        // Registro de errores
        docRequest["err_max"]  = err_max;
        docRequest["err_sht1"] = err_sht1;
        docRequest["err_sht2"] = err_sht2;
        docRequest["err_scd"]  = err_scd;
        docRequest["err_pzem"] = err_pzem;

        // Telemetría Sensores
        docRequest["resistencia"]  = resistencia;
        docRequest["temp_comp"]    = temp_comp;
        docRequest["temp_ext"]     = t1;
        docRequest["hum_ext"]      = h1;
        docRequest["temp_int_sup"] = t2;
        docRequest["hum_int_sup"]  = h2;
        docRequest["co2_inf"]      = co2;
        docRequest["temp_int_inf"] = t_inf;
        docRequest["hum_int_inf"]  = h_inf;
        docRequest["puerta"]       = estadoPuerta;

        // Telemetría Consumo
        docRequest["voltaje"]          = pzem_voltaje;
        docRequest["corriente_neta"]   = pzem_corriente;
        docRequest["potencia_w"]       = pzem_potencia;
        docRequest["energia_kwh"]      = pzem_energia;
        docRequest["frecuencia_hz"]    = pzem_frecuencia;
        docRequest["factor_potencia"]  = pzem_pf;

        // Variables de estado de actuadores
        docRequest["vent_lateral"]   = pwm_vent_lateral;
        docRequest["vent_superior"]  = pwm_vent_superior;
        docRequest["vent_co2"]       = pwm_vent_co2;
        docRequest["luz"]            = pwm_luz;
        docRequest["pwm_auxiliar"]   = pwm_aux;
        docRequest["humidificador"]  = estado_humidificador;
        docRequest["compresor"]      = estado_compresor;
        docRequest["compresor_disponible"] = estado_compresor; // O la lógica de disponibilidad que uses
        docRequest["tiempo_ciclo_compresor"] = tiempo_restante_ciclo;

        String requestBody;
        serializeJson(docRequest, requestBody);

        // 3. Enviar la petición POST con los datos
        int httpResponseCode = http.POST(requestBody);

        // 4. Procesar la respuesta del servidor
        if (httpResponseCode == 201 || httpResponseCode == 200) {
            String responseBody = http.getString();
            
            // Decodificar el JSON de respuesta que FastAPI envió con los comandos
            StaticJsonDocument<512> docResponse;
            DeserializationError error = deserializeJson(docResponse, responseBody);

            if (!error) {
                // Verificamos que el servidor confirme la sincronización
                if (docResponse["status"] == "success") {                 
                    // Extraer los valores en el mismo orden que los envía Python:
                    // [compresor, humidificador, vent_co2, vent_lateral, vent_superior, luz]
                    int set_compresor     = docResponse["set_compresor"];
                    int set_humidificador  = docResponse["set_humidificador"];
                    int set_vent_co2       = docResponse["set_vent_co2"];
                    int set_vent_lateral   = docResponse["set_vent_lateral"];
                    int set_vent_superior  = docResponse["set_vent_superior"];
                    int set_luz            = docResponse["set_luz"];

                    // =============================================================
                    // AQUÍ APLICAS LOS CAMBIOS A TUS PINES / RELÉS O SEÑALES PWM
                    // =============================================================
                    // --- CONTROL DIGITAL ON/OFF ---
                    
                    // Compresor (Pin 33)
                    if (set_compresor != estado_compresor) {
                        digitalWrite(compresor, set_compresor);
                        estado_compresor = set_compresor;
                        Serial.print("➡️ Compresor cambiado a: "); Serial.println(estado_compresor);
                    }
                    
                    // Humidificador (Pin 4)
                    if (set_humidificador != estado_humidificador) {
                        digitalWrite(humidificador, set_humidificador);
                        estado_humidificador = set_humidificador;
                        Serial.print("➡️ Humidificador cambiado a: "); Serial.println(estado_humidificador);
                    }

                    // --- CONTROL PWM VIA LEDC (Canales internos) ---
                    
                    // Ventilador CO2
                    if (set_vent_co2 != pwm_vent_co2) {
                        ledcWrite(vent_co2, set_vent_co2);
                        pwm_vent_co2 = set_vent_co2;
                        Serial.print("➡️ Ventilador CO2 cambiado a: "); Serial.println(pwm_vent_co2);
                    }

                    // Ventilador Lateral
                    if (set_vent_lateral != pwm_vent_lateral) {
                        ledcWrite(vent_lateral, set_vent_lateral);
                        pwm_vent_lateral = set_vent_lateral;
                        Serial.print("➡️ Ventilador lateral cambiado a: "); Serial.println(pwm_vent_lateral);
                    }

                    // Ventilador Superior
                    if (set_vent_superior != pwm_vent_superior) {
                        ledcWrite(vent_superior, set_vent_superior);
                        pwm_vent_superior = set_vent_superior;
                        Serial.print("➡️ Ventilador Superior cambiado a: "); Serial.println(pwm_vent_superior);
                    }

                    // Iluminación
                    if (set_luz != pwm_luz) {
                        ledcWrite(luz, set_luz);
                        pwm_luz = set_luz;
                        Serial.print("➡️ Luz cambiada a: "); Serial.println(pwm_luz);
                    }
                    Serial.println("🔄 Todos los actuadores sincronizados con la nube.");
                }
            } else {
                Serial.print("⚠️ Error al decodificar comandos del servidor: ");
                Serial.println(error.c_str());
            }
        } else {
            Serial.print("❌ Error en la petición HTTP POST. Código: ");
            Serial.println(httpResponseCode);
        }

        // 5. Liberar recursos de la conexión
        http.end();
    } else {
        Serial.println("⚠️ Wi-Fi desconectado. No se puede sincronizar.");
    }
}

void enviarRafagaANube() {
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    // Asignamos tamaño al documento JSON dinámico. 
    // 60 lecturas con múltiples campos requieren un buffer JSON grande (~16 a 20 KB).
    DynamicJsonDocument doc(24576); 

    // 1. Campos globales del estado actual
    doc["err_max"] = err_max;
    doc["err_sht1"] = err_sht1;
    doc["err_sht2"] = err_sht2;
    doc["err_scd"] = err_scd;
    doc["err_pzem"] = err_pzem;
    doc["vent_lateral"] = vent_lateral;
    doc["vent_superior"] = vent_superior;
    doc["vent_co2"] = vent_co2;
    doc["luz"] = luz;
    doc["pwm_auxiliar"] = pwm_auxiliar;
    doc["humidificador"] = humidificador;
    doc["compresor"] = compresor;
    doc["puerta"] = puerta;
    doc["compresor_disponible"] = compresor_disponible;
    doc["tiempo_ciclo_compresor"] = tiempo_ciclo_compresor;

    // 2. Construir la lista "historial_lecturas"
    JsonArray historial = doc.createNestedArray("historial_lecturas");
    
    for (int i = 0; i < contadorLecturas; i++) {
        JsonObject obj = historial.createNestedObject();
        obj["temp_comp"] = bufferCultivo[i].temp_comp;
        obj["temp_ext"] = bufferCultivo[i].temp_ext;
        obj["hum_ext"] = bufferCultivo[i].hum_ext;
        obj["temp_int_sup"] = bufferCultivo[i].temp_int_sup;
        obj["hum_int_sup"] = bufferCultivo[i].hum_int_sup;
        obj["temp_int_inf"] = bufferCultivo[i].temp_int_inf;
        obj["hum_int_inf"] = bufferCultivo[i].hum_int_inf;
        obj["co2_inf"] = bufferCultivo[i].co2_inf;
        obj["resistencia"] = bufferCultivo[i].resistencia;
        obj["voltaje"] = bufferCultivo[i].voltaje;
        obj["corriente_neta"] = bufferCultivo[i].corriente;
        obj["potencia_w"] = bufferCultivo[i].potencia;
        obj["energia_kwh"] = bufferCultivo[i].energia;
        obj["frecuencia_hz"] = bufferCultivo[i].frecuencia;
        obj["factor_potencia"] = bufferCultivo[i].pf;
    }

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("🚀 Enviando ráfaga de 5 minutos a FastAPI...");
    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("✅ Sincronizado. Respuesta del servidor:");
        Serial.println(response);

        // Parsear la respuesta para actualizar tus consignas de control (set_vent_co2, etc.)
        DynamicJsonDocument resDoc(1024);
        deserializeJson(resDoc, response);
        if (resDoc["status"] == "success") {
             // Aquí actualizas tus variables globales de consigna ('set_compresor', etc.)
             // Ejemplo: set_vent_co2 = resDoc["set_vent_co2"];
        }

        // 🔥 CRÍTICO: Limpiar el buffer reiniciando el contador a 0 para los siguientes 5 minutos
        contadorLecturas = 0; 
        
    } else {
        Serial.printf("❌ Error en POST: %text\n", http.errorToString(httpResponseCode).c_str());
        // Nota: Si falla el internet, no reseteamos 'contadorLecturas' para no perder los datos, 
        // pero ojo, si se llena el buffer (60), dejará de acumular hasta que vuelva la red.
    }
    http.end();
}

void ejecutarControlLocal() {
    // Aquí adentro pones tu lógica matemática o de umbrales para activar relés y PWMs.
    // Esto se ejecutará de manera fluida cada 5 segundos.
}


void loop() {
    // 1. Adquisición de Datos (Variables físicas de los sensores)
    leersensores(); 

    // 2. Gestión de seguridad (Tiempos del compresor)
    actualizarCicloCompresor();

    // 3. Sincronización Web Estratégica (Envía telemetría y recibe comandos JUNTOS)
    // CRÍTICO: No satures el servidor. Usa un temporizador de no-bloqueo (Millis)
    // para ejecutar la sincronización cada cierto tiempo (ej: cada 2 o 5 segundos)
    static unsigned long ultimoEnvio = 0;
    unsigned long tiempoActual = millis();
    
    if (tiempoActual - ultimoEnvio >= INTERVALO_MUESTREO) { // Sincroniza cada 3 segundos (Ajustable)
      ultimoEnvio= tiempoActual;
      sincronizarConServidorWeb();
      if (contadorLecturas < MAX_LECTURAS) {
        // Reemplaza estos valores de prueba con las variables reales de tus sensores:
          bufferCultivo[contadorLecturas].temp_comp = 25.4; // tu_variable_temperatura
          bufferCultivo[contadorLecturas].temp_ext = 22.1;
          bufferCultivo[contadorLecturas].hum_ext = 70.5;
          bufferCultivo[contadorLecturas].temp_int_sup = 24.8;
          bufferCultivo[contadorLecturas].hum_int_sup = 88.2;
          bufferCultivo[contadorLecturas].temp_int_inf = 24.2;
          bufferCultivo[contadorLecturas].hum_int_inf = 90.1;
          bufferCultivo[contadorLecturas].co2_inf = 850;      // tu_variable_co2
          bufferCultivo[contadorLecturas].resistencia = 12.5;
          
          // Datos PZEM
          bufferCultivo[contadorLecturas].voltaje = 118.5;
          bufferCultivo[contadorLecturas].corriente = 1.2;
          bufferCultivo[contadorLecturas].potencia = 140.0;
          bufferCultivo[contadorLecturas].energia = 45.2;
          bufferCultivo[contadorLecturas].frecuencia = 60.0;
          bufferCultivo[contadorLecturas].pf = 0.95;

          contadorLecturas++;
          Serial.printf("📦 Muestra guardada en buffer [%d/%d]\n", contadorLecturas, MAX_LECTURAS);
        }
      
      }

    // =====================================================================
    // TAREA 2: TRANSMISIÓN EN RÁFAGA A FASTAPI (Cada 5 minutos)
    // =====================================================================
    if (tiempoActual - ultimaTransmision >= INTERVALO_TRANSMISION) {
        ultimaTransmision = tiempoActual;
        
        if (WiFi.status() == WL_CONNECTED && contadorLecturas > 0) {
            enviarRafagaANube();
        } else {
            Serial.println("⚠️ No se pudo enviar: Wi-Fi desconectado o buffer vacío.");
        }
    }


    // Pequeña pausa opcional para estabilidad del núcleo de la ESP32
    delay(10); 
}




