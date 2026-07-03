#include <Wire.h>
#include <7semi_SHT4x.h>
#include <SensirionI2cScd4x.h>
#include <SPI.h>
#include <Adafruit_MAX31865.h>

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

  thermo.clearFault();
  uint16_t rtd = thermo.readRTD();
  float ratio = (float)rtd / 32768.0;
  float resistencia = ratio * RREF;
  float temperatura = thermo.temperature(RNOMINAL, RREF);
  Serial.printf("Resistencia: %.3f Ohm\n", resistencia);
  Serial.printf("Temperatura: %.2f °C  ", temperatura);

  uint8_t fault = thermo.readFault();

  if (fault == 0) {
    Serial.println("Sin errores");
  } else {
    Serial.print("FAULT = 0x");
    Serial.println(fault, HEX);

  if (fault & MAX31865_FAULT_HIGHTHRESH)
    Serial.println("High Threshold");

  if (fault & MAX31865_FAULT_LOWTHRESH)
    Serial.println("Low Threshold");

  if (fault & MAX31865_FAULT_REFINLOW)
    Serial.println("REFIN LOW");

  if (fault & MAX31865_FAULT_REFINHIGH)
    Serial.println("REFIN HIGH");

  if (fault & MAX31865_FAULT_RTDINLOW)
    Serial.println("RTDIN LOW");

  if (fault & MAX31865_FAULT_OVUV)
    Serial.println("Over / Under Voltage");
    }

  // ======== SHT40 ========
  float t1, h1;
  float t2, h2;
  // Medicion Sensor SHT40 T/H exterior
  if (sht1.readTemperatureHumidity(t1,h1)) {
    Serial.printf("Temperatura exterior: %.2f  °C\n",t1);
    Serial.printf("Humedad exterior: %.2f %%RH\n", h1);
  } else {
    Serial.println("Error leyendo SHT40 1");
  }

  // Medicion Sensor SHT40 interior
  if (sht2.readTemperatureHumidity(t2,h2)) {
    Serial.printf("Temperatura interior superior: %.2f  °C\n",t2);
    Serial.printf("Humedad interior superior: %.2f %%RH\n", h2);
  } else {
    Serial.println("Error leyendo SHT40 2");
  }

  // ======== SCD40 ========
  bool dataReady = false;
  do {
  scd.getDataReadyStatus(dataReady);
  delay(100);
  } while (!dataReady);
  uint16_t co2;
  float temp;
  float hum;
  if (scd.readMeasurement(co2, temp, hum) == 0) {
    Serial.printf("CO2 inferior: %u ppm\n",co2);
    Serial.printf("Temperatura interior inferior: %.2f °C\n",temp);
    Serial.printf("Humedad interior inferior: %.2f %%RH\n",hum);
  }   else {
        Serial.println("Error leyendo SCD40");
      }
  Serial.println("----------------------------");

  delay(5000);
}