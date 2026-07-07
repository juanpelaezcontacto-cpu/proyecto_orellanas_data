import socket

# Configuración idéntica a tu ipconfig
TCP_IP = '0.0.0.0'  # Escucha a cualquier dispositivo en la red
TCP_PORT = 5005

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((TCP_IP, TCP_PORT))
s.listen(1)

print(f"🚀 Servidor de prueba encendido. Esperando a la ESP32 en el puerto {TCP_PORT}...")

conn, addr = s.accept()
print(f"📡 ¡CONECTADO! La ESP32 se ha enlazado desde la dirección: {addr}")

buffer = ""
while True:
    try:
        data = conn.recv(1024).decode('utf-8')
        if not data:
            break
        buffer += data
        if "\n" in buffer:
            lineas = buffer.split("\n")
            buffer = lineas[-1]
            for linea in lineas[:-1]:
                print(f"📥 JSON Recibido de la ESP32: {linea.strip()}")
    except KeyboardInterrupt:
        print("\n🛑 Servidor detenido.")
        break

conn.close()