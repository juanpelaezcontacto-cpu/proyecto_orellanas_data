// Programa para ESP32: escribir 1 o 0 en el pin D22 (GPIO22) mediante el monitor serie

const int prueba = 33; // GPIO22
void setup() {
  Serial.begin(115200);
  pinMode(prueba, OUTPUT);
  digitalWrite(prueba, LOW); // estado inicial
  Serial.println("Envía '1' para HIGH o '0' para LOW");
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    // Ignorar saltos de línea/carriage return
    if (c == '1') {
      digitalWrite(prueba, HIGH);
      Serial.println("Prueba: HIGH");
    } else if (c == '0') {
      digitalWrite(prueba, LOW);
      Serial.println("Prueba: LOW");
    }
  }
}
