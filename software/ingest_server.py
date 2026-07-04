from flask import Flask, request, jsonify
import serial

puerto = serial.Serial('/dev/ttyUSB0', 115200)
app = Flask(__name__)

@app.route('/telemetria', methods=['POST'])
def recibir_datos():
    datos = request.json  # Aquí recibes el JSON de la ESP32
    print("Datos recibidos:", datos)
    
    # Aquí es donde más adelante conectarás SQL para guardarlos
    # Por ahora, solo los guardaremos en un archivo de texto local
    with open("registro_datos.txt", "a") as archivo:
        archivo.write(f"{datos}\n")
        
    return jsonify({"status": "success"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000) # El 0.0.0.0 permite que la ESP32 lo encuentre en la red

def click_boton_reset_energia():
    # El \n es crucial para que la ESP32 sepa dónde termina el comando
    puerto.write(b"RESET_ENERGY\n")