#include <PZEM004Tv30.h>

#define RXD2 16
#define TXD2 17

HardwareSerial PZEMSerial(2);
PZEM004Tv30 pzem(PZEMSerial, RXD2, TXD2);

void setup() {
  Serial.begin(115200);

  PZEMSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);

  Serial.println();
  Serial.println("Lectura PZEM-004T");
  Serial.println("------------------------------");
}

void loop() {

  float voltage   = pzem.voltage();
  float current   = pzem.current();
  float power     = pzem.power();
  float energy    = pzem.energy();
  float frequency = pzem.frequency();
  float pf        = pzem.pf();

  if (isnan(voltage)) {

    Serial.println("No se pudo comunicar con el PZEM");

  } else {

    Serial.println("------------------------------");

    Serial.print("Voltaje     : ");
    Serial.print(voltage);
    Serial.println(" V");

    Serial.print("Corriente   : ");
    Serial.print(current, 3);
    Serial.println(" A");

    Serial.print("Potencia    : ");
    Serial.print(power);
    Serial.println(" W");

    Serial.print("Energia     : ");
    Serial.print(energy, 3);
    Serial.println(" kWh");

    Serial.print("Frecuencia  : ");
    Serial.print(frequency);
    Serial.println(" Hz");

    Serial.print("Factor Pot. : ");
    Serial.println(pf, 2);

    if (current > 0.001) {
      float resistencia = voltage / current;

      Serial.print("Resistencia : ");
      Serial.print(resistencia);
      Serial.println(" Ohm");
    }
  }

  delay(2000);
}