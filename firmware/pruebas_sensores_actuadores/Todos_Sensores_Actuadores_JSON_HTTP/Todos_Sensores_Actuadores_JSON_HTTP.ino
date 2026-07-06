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

//Variables Globales
int err_max = 0, err_sht1 = 0, err_sht2 = 0, err_scd = 0, err_pzem = 0;
float resistencia = 0.0, temp_comp = 0.0;
float t1 = 0.0, h1 = 0.0;
float t2 = 0.0, h2 = 0.0;
uint16_t co2 = 0;
float t_inf = 0.0, h_inf = 0.0;
const int maxIntentos = 50; // 20 intentos para leer el SCD * 100ms = 2 segundos de tolerancia máxima
float pzem_voltaje = 0.0;
float pzem_corriente = 0.0;
float pzem_potencia = 0.0;
float pzem_energia = 0.0;
float pzem_frecuencia = 0.0;
float pzem_pf = 0.0;
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

void setup() {

  Serial.begin(115200);
  delay(1000);
  // ---------- SPI ----------
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);
  thermo.begin(MAX31865_2WIRE); // Configuración a 2 hilos
  thermo.clearFault();
  // ---------- Bus I2C principal ----------
  Wire.begin(SDA_P, SCL_P);
  // ---------- Bus I2C secundario ----------
  Wire1.begin(SDA_S, SCL_S);
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
  //Inicialización humidificador
  pinMode(humidificador, OUTPUT);
  digitalWrite(humidificador, estado_humidificador);
  //Inicialización Compresor
  pinMode(compresor, OUTPUT);
  digitalWrite(compresor, estado_compresor);
}

void loop() {
  escucharComandosSerial(); // ESCUCHA ACTIVA DE COMANDOS (Se ejecuta continuamente, sin esperas)
  leersensores(); // Activa la funcion leer sensores
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
    uint16_t rtd = thermo.readRTD();
    float ratio = (float)rtd / 32768.0;
    resistencia = ratio * RREF;
    temp_comp = thermo.temperature(RNOMINAL, RREF);
    if (thermo.readFault() != 0){
      err_max = 1;
      thermo.clearFault();
      }else{err_max = 0;}
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
    crearYenviarJSON(); // Activa la funcion para crear y enviar datos por puerto serial
  }
}


// Función para crear y enviar datos en Json
void crearYenviarJSON() {
  JsonDocument doc;
  // Registro de errores de todos los sensores
  doc["err_max"]  = err_max;
  doc["err_sht1"] = err_sht1; //Exterior
  doc["err_sht2"] = err_sht2; //Interior
  doc["err_scd"]  = err_scd;
  doc["err_pzem"] = err_pzem;
  // Telemetría Sensores
  doc["resistencia"]  = resistencia;
  doc["temp_comp"]    = temp_comp;
  doc["temp_ext"]     = t1;
  doc["hum_ext"]      = h1;
  doc["temp_int_sup"] = t2;
  doc["hum_int_sup"]  = h2;
  doc["co2_inf"]      = co2;
  doc["temp_int_inf"] = t_inf;
  doc["hum_int_inf"]  = h_inf;
  doc["puerta"]       = estadoPuerta;
  // Telemetría Consumo
  doc["voltaje"]          = pzem_voltaje;     // V
  doc["corriente_neta"]   = pzem_corriente;   // A (ya calculada la división por 3)
  doc["potencia_w"]       = pzem_potencia;    // W (consumo instantáneo real)
  doc["energia_kwh"]      = pzem_energia;     // kWh (el acumulador de energia)
  doc["frecuencia_hz"]    = pzem_frecuencia;  // Hz
  doc["factor_potencia"]  = pzem_pf;          // FP
  // Variables de estado de actuadores
  doc["vent_lateral"]     = pwm_vent_lateral;   // Estado ventilador lateral
  doc["vent_superior"]    = pwm_vent_superior;  // Estado ventilador lateral
  doc["vent_co2"]         = pwm_vent_co2;       //Estado ventilador co2
  doc["luz"]              = pwm_luz;            // Estado iluminación
  doc["pwm_auxiliar"]     = pwm_aux;            // Estado PWM Auxiliar
  doc["humidificador"]    = estado_humidificador;
  doc["compresor"]        = estado_compresor;

  serializeJson(doc, Serial);
  Serial.println();
}

void escucharComandosSerial(){
  if(Serial.available()>0){ //// Verificamos si hay datos entrantes desde Python
    String comando = Serial.readStringUntil('\n');
    comando.trim(); // Limpia espacios en blanco o caracteres ocultos
    if(comando == "RESET_ENERGY"){  // --- ACCIÓN: RESET DE ENERGÍA ---
      pzem.resetEnergy();
      Serial.println("{\"pzem_cmd\":\"reset_ok\"}"); // Enviamos una confirmación en formato JSON para que el dashboard sepa que se ejecutó
    }
    if (comando.startsWith("vent_lateral:")){
      pwm_vent_lateral = constrain(comando.substring(13).toInt(),0,255);
      ledcWrite(vent_lateral,pwm_vent_lateral);
      Serial.printf("{\"vent_lateral_comando\":\"set_ok\",\"val\":%d}\n", pwm_vent_lateral);
    }
    if (comando.startsWith("vent_superior:")){
      pwm_vent_superior = constrain(comando.substring(14).toInt(),0,255);
      ledcWrite(vent_superior,pwm_vent_superior);
      Serial.printf("{\"vent_superior_comando\":\"set_ok\",\"val\":%d}\n", pwm_vent_superior);
    }
    if (comando.startsWith("vent_co2:")){
      pwm_vent_co2 = constrain(comando.substring(9).toInt(),0,255);
      ledcWrite(vent_co2,pwm_vent_co2);
      Serial.printf("{\"vent_co2_comando\":\"set_ok\",\"val\":%d}\n", pwm_vent_co2);
    }
    if (comando.startsWith("luz:")){
      pwm_luz = constrain(comando.substring(4).toInt(),0,255);
      ledcWrite(luz,pwm_luz);
      Serial.printf("{\"luz_comando\":\"set_ok\",\"val\":%d}\n", pwm_luz);
    }
    if (comando.startsWith("aux:")){
      pwm_aux = constrain(comando.substring(4).toInt(),0,255);
      ledcWrite(aux,pwm_aux);
      Serial.printf("{\"aux_comando\":\"set_ok\",\"val\":%d}\n", pwm_aux);
    }
    if(comando.startsWith("humidificador:")){
      int comando_recibido = comando.substring(14).toInt(); 
        if (comando_recibido == 0 || comando_recibido == 1){
          if (comando_recibido == 1){
            digitalWrite(humidificador,HIGH);
            estado_humidificador = digitalRead(humidificador);
          }else{
            digitalWrite(humidificador,LOW);
            estado_humidificador = digitalRead(humidificador);
          } 
          Serial.printf("{\"humificador_comando\":\"set_ok\",\"val\":%d}",estado_humidificador);
        }else{
          Serial.println("{\"humidificador_error\":\"dato_invalido\"}");
        }
    }
    if(comando.startsWith("compresor:")){
      int comando_recibido = comando.substring(10).toInt(); //Extraer y validar el dato entrante
      if (comando_recibido == 0 || comando_recibido == 1){ //Filtrado estricto: Si no es 0 ni 1, ignoramos por completo el comando
        if (comando_recibido == 1){
          if(millis()-tiempo_ultimo_apagado >= tiempo_min_apagado){
            digitalWrite(compresor,HIGH);
            estado_compresor = 1;//digitalRead(compresor);
          }else{ 
            Serial.printf(R"({"compresor_error":"bloqueo_anti_ciclo_corto","val":%d})" "\n", estado_compresor);
            } 
        }else{ 
          if (estado_compresor == 1){
            digitalWrite(compresor,LOW);
            estado_compresor = 0;//digitalRead(compresor); 
            tiempo_ultimo_apagado = millis(); // Aquí arranca el reloj de seguridad
          }else{
            digitalWrite(compresor,LOW); // Asegura estado por si acaso
          }
        }
        Serial.printf(R"({"compresor_comando":"set_ok","val":%d})" "\n",estado_compresor);
      }
       else{
      Serial.println(R"({"compresor_error":"dato_invalido"})");
      }
    }
  }
}