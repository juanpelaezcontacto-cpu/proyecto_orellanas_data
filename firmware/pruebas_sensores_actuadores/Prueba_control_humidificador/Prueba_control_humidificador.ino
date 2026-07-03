const int PIN_HUMIDIFICADOR = 4;  // Pin que controla el 2N2222A

int estadoActual = 0;
// 0 = apagado
// 1 = encendido permanente
// 2 = temporizado / automatico

void setup() {
  pinMode(PIN_HUMIDIFICADOR, OUTPUT);
  digitalWrite(PIN_HUMIDIFICADOR, LOW);

  Serial.begin(115200);
  Serial.println("Control humidificador listo");
  Serial.println("Comandos:");
  Serial.println("0 = apagar");
  Serial.println("1 = encendido permanente");
  Serial.println("2 = temporizado");
  Serial.println("p = solo pulsar una vez");
}

void loop() {
  if (Serial.available()) {
    char comando = Serial.read();

    if (comando == '0') {
      irAEstado(0);
    }

    if (comando == '1') {
      irAEstado(1);
    }

    if (comando == '2') {
      irAEstado(2);
    }

    if (comando == 'p') {
      pulsarContacto();
      avanzarEstado();
    }
  }
}

void pulsarContacto() {
  digitalWrite(PIN_HUMIDIFICADOR, HIGH);
  delay(250);   // tiempo simulando pulsacion
  digitalWrite(PIN_HUMIDIFICADOR, LOW);
  delay(600);   // pausa para que el modulo reconozca el cambio
}

void avanzarEstado() {
  estadoActual++;

  if (estadoActual > 2) {
    estadoActual = 0;
  }

  Serial.print("Estado actual: ");
  Serial.println(estadoActual);
}

void irAEstado(int estadoDeseado) {
  while (estadoActual != estadoDeseado) {
    pulsarContacto();
    avanzarEstado();
  }
}