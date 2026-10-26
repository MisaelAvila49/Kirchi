# Historial de cambios

## 1.2.2

- Los análisis con ngspice vuelven a funcionar en Windows: el paquete lleva la biblioteca que faltaba y, si ngspice no arranca, el mensaje lo dice en lugar de hablar de otra versión.
- Osciloscopio: modo X-Y (B/A y A/B), voltios, posición, acoplamiento y tiempo por división que se cambian en pausa sobre lo capturado, y nivel del disparo escrito con su unidad.
- Gráficas: una traza contra otra (X-Y), Desde y Hasta escritos en cada eje, rangos que terminan en una marca redonda y márgenes que se ajustan al ancho de los números.
- Exportar gráficas: marcas del tiempo en pasos redondos dentro del tramo elegido, decimales de los ejes y de las etiquetas de valor por separado, subtítulo en blanco, y tamaño de letra y grosores generales para todos los ejes.
- Exportar el esquema: pausa sola la vista previa, las etiquetas de lectura salen con su valor en el archivo guardado y pueden mostrar solo la cifra.
- Generador: amplitud en pico a pico, pico o rms.

## 1.2.1

- La vista previa ajusta su paso al circuito y a la pantalla: los circuitos lentos, como una computadora analógica, corren hasta 12 veces más rápido y Avanzar llega en segundos.
- Ocho velocidades (×10, ×5, ×2, ×1, ×0.5, ×0.1, ×0.01 y ×0.001) más «Sin límite de tiempo real», cada una con su equivalencia, por ejemplo «×10 (1 s = 10 s simulados)».
- El osciloscopio en pausa se recorre arrastrando sin regresar solo al final.
- La simulación ya no se atora cuando un tramo termina a una fracción mínima de un paso.

## 1.2.0

- Medidor rápido: clic derecho sobre un cable, «Medir con el multímetro» y «Medidor rápido» pone una pantalla con el voltaje de la red o la corriente del cable, en DC o AC. Doble clic cambia lo que mide.
- Grabar la pantalla de Kirchi en MP4 (o WebM si el sistema no tiene MP4), con o sin micrófono, desde Inicio › Simular. Se guarda en Videos › Kirchi.
- Avanzar en el tiempo con una división, un paso de cálculo, un tiempo fijo o hasta un instante, y Retroceder al avance anterior.
- Exportar el esquema con vista grande, área a mano, margen, tema claro u oscuro, colores de voltaje y lecturas, y con texto, flechas, resaltados, llamadas numeradas y etiquetas de lectura solo para la imagen.
- Exportar gráficas con tramo libre, vista previa de lo que se coloca, ejes que se arrastran y decimales por eje.
- Clic derecho ordenado por secciones con iconos, paneles del mismo ancho, etiquetas de red que se reflejan y notas y figuras que se mueven libres con Alt.
- Correcciones en las sondas del osciloscopio, el editor del doble clic al simular y la grabación en Electron 44.

## 1.1.0

- Editor de exportar figuras con vista grande, herramientas, barra flotante, selección de eje, campos Desde y Hasta con unidad y rejilla elegida con iconos.
- Hoja lateral de aspecto para el osciloscopio y las gráficas.
- Osciloscopio: con el instrumento detenido se recorre y se exporta toda la captura, sin espigas en las crestas de una senoidal.
- Simular, Pausar y Detener en la fila de título.
- Análisis: Cancelar descarta el que se prepara y Detener corta el que corre. Los análisis guardados se ponen al día cuando cambia el circuito.
- Seis transistores de señal ajustados a sus hojas de datos.
- Las plantillas propias conservan las notas de la selección.
- ngspice de Windows compilado del código oficial. Licencias de terceros con su texto completo y su código fuente junto a los instaladores.
- macOS con firma ad hoc y paquete universal. Paquete para la Tienda de Microsoft.

## 1.0.0

Primera versión pública de Kirchi.

- Editor de esquema en rejilla con 58 piezas, cables con enrutado automático, notas, etiquetas y plantillas.
- Simulación en tiempo real con motor analógico y digital propios (Rust compilado a WebAssembly).
- Instrumentos: multímetro, osciloscopio con sondas, generador de funciones y fuente variable.
- Análisis con ngspice: punto de operación, barrido de CD, transitorio, CA / Bode, barrido de parámetro, pasos y Fourier, con gráficas exportables.
- Calculadoras que generan el circuito, series comerciales de valores y editor de valores con unidades.
- Tutorial «Aprende Kirchi» de cinco capítulos.
- Exportación a SVG, PNG y PDF, y archivos `.kir` con respaldos automáticos.
- Instaladores para Windows (NSIS y portátil), macOS y Linux.
