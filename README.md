Desarrollo de una Cámara de Ambiente Controlado para la Fructificación de Pleurotus spp. mediante la Automatización de un Sistema de Refrigeración Doméstico

Resumen: Este trabajo detalla la ingeniería y caracterización de una cámara automatizada para el cultivo de orellanas, utilizando una nevera Haceb NE-11 modificada. El sistema integra sensores SCD40, PT100 y SHT4X con un control híbrido (Arduino/Python) para estabilizar temperatura y humedad, factores críticos que impidieron la fructificación en ensayos experimentales previos.

1. Marco Teórico y Justificación

El cultivo de hongos del género Pleurotus exige una regulación estricta de las variables microclimáticas. La fructificación exitosa depende de la interacción sinérgica entre la temperatura, la humedad relativa, la concentración de $CO_2$ y la intensidad lumínica. La falta de control en estos parámetros reduce la eficiencia biológica e incrementa el riesgo de senescencia del micelio y proliferación de contaminantes. 

Unidad de Acondicionamiento Térmico

Se intervino un refrigerador Haceb Clase T (Modelo NE-11) con las siguientes especificaciones técnicas: 
Volumen Total: 279.9 L. Altura:1220 mm Ancho: 427 mm
Parámetros Eléctricos: 120 VAC, 60 Hz, 2.7 A. 
Consumo: 2.2 kWh/24h. 
Modificación Mecánica: Se eliminó el compartimento de congelación y se extendió la placa evaporadora (gas R12) verticalmente desde la parte superior hasta 20 cm del fondo para optimizar la transferencia de calor por convección.

Sistema de Control y Potencia
La gestión de actuadores se centraliza en un microcontrolador ESP32D NodeMcu DevKitv1: 
Control de Compresor: Relé mecánico

Iluminación: tira LED 5VDC 

Humedad: Humidificador 5VDC

Seguridad: 1. Interruptor de fin de carrera en la puerta. 2. Interruptor manual de encendido del sistema de compresión. 3. Termostato de desconexión en caso de falla del sistema

