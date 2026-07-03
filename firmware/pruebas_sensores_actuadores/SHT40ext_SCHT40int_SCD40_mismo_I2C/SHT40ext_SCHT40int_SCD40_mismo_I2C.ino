#include <Wire.h>
#include <7semi_SHT4x.h>
#include <SensirionI2cScd4x.h>

#define SDA_P 25
#define SCL_P 26
#define SDA_S 5
#define SCL_S 15

//TwoWire Wire1 = TwoWire(1);
SHT4x_7semi sht1;   // Interior
SHT4x_7semi sht2;   // Exterior
SensirionI2cScd4x scd;


void setup() {

  Serial.begin(115200);
  delay(1000);
  
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

  // ======== SHT40 ========

  float t1, h1;
  float t2, h2;
  // Medicion Sensor SHT40 1
  if (sht1.readTemperatureHumidity(t1,h1)) {

    Serial.print("SHT40 Externo-> ");

    Serial.print(t1, 2);
    Serial.print(" °C   ");

    Serial.print(h1, 2);
    Serial.println(" %RH");

  } else {

    Serial.println("Error leyendo SHT40 1");

  }

  // Medicion Sensor SHT40 2
  if (sht2.readTemperatureHumidity(t2,h2)) {

    Serial.print("SHT40 Interno-> ");

    Serial.print(t2, 2);
    Serial.print(" °C   ");

    Serial.print(h2, 2);
    Serial.println(" %RH");

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

    Serial.print("SCD40 -> ");

    Serial.print("CO2: ");
    Serial.print(co2);
    Serial.print(" ppm   ");

    Serial.print(temp, 2);
    Serial.print(" °C   ");

    Serial.print(hum, 2);
    Serial.println(" %RH");

  }   else {

        Serial.println("Error leyendo SCD40");

      }


  Serial.println("----------------------------");

  delay(5000);
}