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

//TwoWire Wire1 = TwoWire(1);
SHT4x_7semi sht1;                   // T/H Interior superior
SHT4x_7semi sht2;                   // T/H Exterior (entrada de aire)
SensirionI2cScd4x scd;              // CO2/T/H interior inferior
Adafruit_MAX31865 thermo(PIN_CS);   // PT100 compresor

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

  Serial.println();
}

void loop() {
  float t1, h1; //SHT40 exterior
  float t2, h2; //SHT40 interior
  uint16_t co2; //SCD40 Co2
  float temp;   //SCD40 Temperatura
  float hum;    //SCD40 Humedad
  // Banderas de error individuales (0 = Sin error, 1 = Error)
  int err_max  = 0;
  int err_sht1 = 0;
  int err_sht2 = 0;
  int err_scd  = 0;

  // SCD40: esperando hasta que esten listos los datos del SCD40 para leerlos
  bool dataReady = false;
  do {
    scd.getDataReadyStatus(dataReady);
    delay(100);
  } while (!dataReady);

  // ======== Monitoreo ========
  thermo.clearFault();
  if (thermo.readFault() != 0)                    { err_max  = 1; }
  if (!sht1.readTemperatureHumidity(t1,h1))       { err_sht1 = 1; }
  if (!sht2.readTemperatureHumidity(t2,h2))       { err_sht2 = 1; }
  if (scd.readMeasurement(co2, temp, hum) != 0)   { err_scd  = 1; }

  
  uint16_t rtd = thermo.readRTD();
  float ratio = (float)rtd / 32768.0;
  float resistencia = ratio * RREF;
  float temperatura = thermo.temperature(RNOMINAL, RREF);

  // ======== Empaquetado JSON ========
  JsonDocument doc;
  // Estado de cada sensor
  doc["err_max"]  = err_max;
  doc["err_sht1"] = err_sht1;
  doc["err_sht2"] = err_sht2;
  doc["err_scd"]  = err_scd;
  // Valor de cada Sensor
  doc["resistencia"]  = resistencia;
  doc["temp_comp"]    = temperatura;
  doc["temp_ext"]     = t1;
  doc["hum_ext"]      = h1;
  doc["temp_int_sup"] = t2;
  doc["hum_int_sup"]  = h2;
  doc["co2_inf"]      = co2;
  doc["temp_int_inf"] = temp;
  doc["hum_int_inf"]  = hum;

  Serial.println("----------------------------");

  serializeJson(doc, Serial);
  Serial.println();
  delay(5000);
}
