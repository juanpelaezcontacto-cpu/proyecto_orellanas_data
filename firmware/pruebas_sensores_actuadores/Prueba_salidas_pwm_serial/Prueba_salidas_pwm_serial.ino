// Probar cualquier GPIO como salida PWM desde el Monitor Serie
// Formato: GPIO PWM
// Ejemplo: 19 255

const int canalPWM = 0;
const int frecuencia = 5000;
const int resolucion = 8;

int pinActual = -1;

void setup() {
  Serial.begin(115200);

  Serial.println("--------------------------------");
  Serial.println("Probador de PWM para ESP32");
  Serial.println("Formato: GPIO PWM");
  Serial.println("Ejemplo:");
  Serial.println("19 255");
  Serial.println("18 128");
  Serial.println("--------------------------------");
}

void loop() {

  if (Serial.available()) {

    int pin = Serial.parseInt();
    int valor = Serial.parseInt();

    // Vaciar buffer
    while (Serial.available()) {
      Serial.read();
    }

    if (pin < 0 || pin > 39) {
      Serial.println("GPIO invalido");
      return;
    }

    if (valor < 0 || valor > 255) {
      Serial.println("PWM debe estar entre 0 y 255");
      return;
    }

    // Si cambió el pin, volver a asociarlo al canal
    if (pin != pinActual) {
      ledcAttachChannel(pin, frecuencia, resolucion, canalPWM);
      pinActual = pin;
    }

    ledcWriteChannel(canalPWM, valor);

    Serial.print("GPIO ");
    Serial.print(pin);
    Serial.print(" -> PWM ");
    Serial.println(valor);
  }
}