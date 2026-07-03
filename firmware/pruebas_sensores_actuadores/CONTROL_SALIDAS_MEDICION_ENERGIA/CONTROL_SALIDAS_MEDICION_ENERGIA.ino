#include <PZEM004Tv30.h>

//==============================
// UART PZEM
//==============================
HardwareSerial PZEMSerial(2);
PZEM004Tv30 pzem(PZEMSerial, 16, 17);

//==============================
// PWM
//==============================
const int FAN_LATERAL = 19;
const int FAN_SUPERIOR = 18;
const int FAN_CO2 = 21;
const int LUZ = 22;
const int AUX = 23;

//==============================
// Salidas digitales
//==============================
const int HUM = 4;
const int COMP = 33;

//==============================
// Configuración PWM
//==============================
const int PWM_BITS = 8;

const int CH_FANL = 0;
const int CH_FANT = 1;
const int CH_CO2  = 2;
const int CH_LUZ  = 3;
const int CH_AUX  = 4;

//==============================
// Variables PWM
//==============================
int pwmFanL = 0;
int pwmFanT = 0;
int pwmCO2  = 0;
int pwmLuz  = 0;
int pwmAux  = 0;

//==============================
// Tiempo
//==============================
unsigned long tiempoPZEM = 0;

//==============================

void setup() {

  Serial.begin(115200);

  // UART2
  PZEMSerial.begin(9600, SERIAL_8N1, 16, 17);

  // Salidas digitales
  pinMode(HUM, OUTPUT);
  pinMode(COMP, OUTPUT);

  digitalWrite(HUM, LOW);
  digitalWrite(COMP, LOW);

  // PWM
  ledcAttach(FAN_LATERAL, 25000, PWM_BITS);
  ledcAttach(FAN_SUPERIOR, 25000, PWM_BITS);
  ledcAttach(FAN_CO2, 25000, PWM_BITS);

  ledcAttach(LUZ, 5000, PWM_BITS);
  ledcAttach(AUX, 5000, PWM_BITS);

  ledcWrite(FAN_LATERAL, 0);
  ledcWrite(FAN_SUPERIOR, 0);
  ledcWrite(FAN_CO2, 0);
  ledcWrite(LUZ, 0);
  ledcWrite(AUX, 0);

  Serial.println();
  Serial.println("================================");
  Serial.println("CONTROL CAMARA ORELLANAS");
  Serial.println("================================");
  Serial.println("HELP para ayuda");
  Serial.println();
}

//==============================

void loop() {

  leerSerial();

  if (millis() - tiempoPZEM >= 5000) {
    tiempoPZEM = millis();
    leerPZEM();
  }

}

//==============================

void leerPZEM() {

  float voltaje = pzem.voltage();
  float corriente = pzem.current();
  float potencia = pzem.power();
  float energia = pzem.energy();
  float frecuencia = pzem.frequency();
  float fp = pzem.pf();

  Serial.println();
  Serial.println("------ PZEM ------");

  if (!isnan(voltaje)) {

    Serial.print("Voltaje    : ");
    Serial.print(voltaje);
    Serial.println(" V");

    Serial.print("Corriente  : ");
    Serial.print(corriente);
    Serial.println(" A");

    Serial.print("Potencia   : ");
    Serial.print(potencia);
    Serial.println(" W");

    Serial.print("Energia    : ");
    Serial.print(energia);
    Serial.println(" kWh");

    Serial.print("Frecuencia : ");
    Serial.print(frecuencia);
    Serial.println(" Hz");

    Serial.print("FP         : ");
    Serial.println(fp);

  } else {

    Serial.println("PZEM NO DETECTADO");

  }

  Serial.println("------------------");
}

//==============================

void leerSerial() {

  if (!Serial.available())
    return;

  String cmd = Serial.readStringUntil('\n');

  cmd.trim();
  cmd.toUpperCase();

  //--------------------

  if (cmd == "HELP") {

    Serial.println();
    Serial.println("COMANDOS");
    Serial.println("--------------------------------");
    Serial.println("FANL 0-255");
    Serial.println("FANT 0-255");
    Serial.println("FANCO2 0-255");
    Serial.println("LIGHT 0-255");
    Serial.println("AUX 0-255");
    Serial.println("HUM ON");
    Serial.println("HUM OFF");
    Serial.println("COMP ON");
    Serial.println("COMP OFF");
    Serial.println("STATUS");
    Serial.println("--------------------------------");

    return;
  }

  //--------------------

  if (cmd == "STATUS") {

    Serial.println();
    Serial.println("====== STATUS ======");

    Serial.print("FANL   ");
    Serial.println(pwmFanL);

    Serial.print("FANT   ");
    Serial.println(pwmFanT);

    Serial.print("FANCO2 ");
    Serial.println(pwmCO2);

    Serial.print("LIGHT  ");
    Serial.println(pwmLuz);

    Serial.print("AUX    ");
    Serial.println(pwmAux);

    Serial.print("HUM    ");
    Serial.println(digitalRead(HUM));

    Serial.print("COMP   ");
    Serial.println(digitalRead(COMP));

    Serial.println("====================");

    return;
  }

  //--------------------
  if (cmd == "HUM ON") {

    digitalWrite(HUM, HIGH);
    Serial.println("Humidificador ON");
    return;

  }

  if (cmd == "HUM OFF") {

    digitalWrite(HUM, LOW);
    Serial.println("Humidificador OFF");
    return;

  }

  //--------------------

  if (cmd == "COMP ON") {

    digitalWrite(COMP, HIGH);
    Serial.println("Compresor ON");
    return;

  }

  if (cmd == "COMP OFF") {

    digitalWrite(COMP, LOW);
    Serial.println("Compresor OFF");
    return;

  }

  //--------------------
  if (cmd.startsWith("FANL ")) {

    pwmFanL = constrain(cmd.substring(5).toInt(),0,255);
    ledcWrite(FAN_LATERAL,pwmFanL);

    return;
  }

  if (cmd.startsWith("FANT ")) {

    pwmFanT = constrain(cmd.substring(5).toInt(),0,255);
    ledcWrite(FAN_SUPERIOR,pwmFanT);

    return;
  }

  if (cmd.startsWith("FANCO2 ")) {

    pwmCO2 = constrain(cmd.substring(7).toInt(),0,255);
    ledcWrite(FAN_CO2,pwmCO2);

    return;
  }

  if (cmd.startsWith("LIGHT ")) {

    pwmLuz = constrain(cmd.substring(6).toInt(),0,255);
    ledcWrite(LUZ,pwmLuz);

    return;
  }

  if (cmd.startsWith("AUX ")) {

    pwmAux = constrain(cmd.substring(4).toInt(),0,255);
    ledcWrite(AUX,pwmAux);

    return;
  }

  Serial.println("Comando desconocido");
}