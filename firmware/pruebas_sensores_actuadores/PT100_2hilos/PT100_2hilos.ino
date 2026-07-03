#include <SPI.h>
#include <Adafruit_MAX31865.h>

// Pines ESP32
#define PIN_CS    32
#define PIN_MOSI  13
#define PIN_MISO  35
#define PIN_SCK   14

// Valores PT100
#define RNOMINAL 100.0
#define RREF     430.0

Adafruit_MAX31865 thermo(PIN_CS);

void setup() {

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("MAX31865 - PT100");

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);

  thermo.begin(MAX31865_2WIRE);

  thermo.clearFault();

  delay(100);
}

void loop() {

  thermo.clearFault();

  uint16_t rtd = thermo.readRTD();

  float ratio = (float)rtd / 32768.0;
  float resistencia = ratio * RREF;

  float temperatura = thermo.temperature(RNOMINAL, RREF);

  Serial.println("--------------------------------");

  Serial.print("RTD: ");
  Serial.println(rtd);

  Serial.print("Resistencia: ");
  Serial.print(resistencia, 3);
  Serial.println(" Ohm");

  Serial.print("Temperatura: ");
  Serial.print(temperatura, 2);
  Serial.println(" °C");

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

  delay(1000);
}