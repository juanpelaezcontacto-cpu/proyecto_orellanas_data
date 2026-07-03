#include <Wire.h>
#include <7semi_SHT4x.h>
#include <SensirionI2cScd4x.h>
#include <SPI.h>
#include <Adafruit_MAX31865.h>
#include <ArduinoJson.h>

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

//Variables Globales
int err_max = 0, err_sht1 = 0, err_sht2 = 0, err_scd = 0;
float resistencia = 0.0, temp_comp = 0.0;
float t1 = 0.0, h1 = 0.0;
float t2 = 0.0, h2 = 0.0;
uint16_t co2 = 0;
float t_inf = 0.0, h_inf = 0.0;
const int maxIntentos = 50; // 20 intentos para leer el SCD * 100ms = 2 segundos de tolerancia máxima

// Función para crear y enviar datos en Json
void crearYenviarJSON() {
  JsonDocument doc;
  // Estado de cada sensor
  doc["err_max"]  = err_max;
  doc["err_sht1"] = err_sht1;
  doc["err_sht2"] = err_sht2;
  doc["err_scd"]  = err_scd;
  // Valor de cada Sensor
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
  
  serializeJson(doc, Serial);
  Serial.println();
}

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
}

void loop() {
  // Banderas de error individuales (0 = Sin error, 1 = Error)
  err_max  = 0;
  err_sht1 = 0;
  err_sht2 = 0;
  err_scd  = 0;

  // SCD40: esperando hasta que esten listos los datos del SCD40 para leerlos
  bool dataReady = false;
  int intentos = 0;
  do {
    scd.getDataReadyStatus(dataReady);
    delay(100);
    intentos++;
  } while (!dataReady && intentos < maxIntentos);
  if (scd.readMeasurement(co2, t_inf, h_inf) != 0)   { err_scd  = 1; }

  // ======== Monitoreo PT100 ========
  thermo.clearFault();
  uint16_t rtd = thermo.readRTD();
  float ratio = (float)rtd / 32768.0;
  resistencia = ratio * RREF;
  temp_comp = thermo.temperature(RNOMINAL, RREF);
  if (thermo.readFault() != 0)                    { err_max  = 1; }
  // ======== SHT40 EXTERIOR ========
  if (!sht1.readTemperatureHumidity(t1,h1))       { err_sht1 = 1; } 
  // ======== SHT40 INTERIOR ========
  if (!sht2.readTemperatureHumidity(t2,h2))       { err_sht2 = 1; } 
  // ======== Puerta ======== Si digitalRead da LOW (0), la puerta está cerrada (toca GND).
  estadoPuerta = !digitalRead(Puerta); //Al poner el signo "!", estadoPuerta guardará un 1 si está abierta y 0 si está cerrada.

  crearYenviarJSON();
  delay(5000);
}
