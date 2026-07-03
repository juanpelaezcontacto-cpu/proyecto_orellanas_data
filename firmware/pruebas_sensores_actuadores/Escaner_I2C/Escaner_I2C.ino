#include <Wire.h>

#define SDA_PIN 25   //25  - 5
#define SCL_PIN 26  //26 - 6 

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("Escaner I2C lento");
  Serial.println("Usando SDA=21, SCL=22");

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(10000);
}

void loop() {
  int encontrados = 0;

  for (byte direccion = 1; direccion < 127; direccion++) {
    Wire.beginTransmission(direccion);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("Encontrado dispositivo I2C en 0x");
      if (direccion < 16) Serial.print("0");
      Serial.println(direccion, HEX);
      encontrados++;
    } else if (error == 4) {
      Serial.print("Error desconocido en direccion 0x");
      if (direccion < 16) Serial.print("0");
      Serial.println(direccion, HEX);
    }
  }

  if (encontrados == 0) {
    Serial.println("No se encontro nada.");
  }

  Serial.println("--------------------");
  delay(3000);
}