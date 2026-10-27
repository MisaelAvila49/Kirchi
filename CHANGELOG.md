# Historial de cambios

## 2.0.1

El instalador de macOS vuelve a publicarse junto con los de Windows y Linux.

### Arreglos

- El instalador de macOS (dmg universal con firma ad hoc) se publica en el Release junto con los de Windows y Linux.

## 2.0.0

Un asistente de IA opcional, 102 piezas con sus datos físicos, perillas en vivo, circuitos integrados de varias unidades y de lógica MSI, y los análisis de la Microsoft Store funcionando de nuevo.

### Nuevo

- Asistente opcional (protocolo MCP): cualquier cliente MCP, como Claude Desktop o Claude Code, puede colocar piezas, cablear, cambiar valores, simular, mover perillas, leer mediciones y exportar la imagen del circuito. Viene apagado, todo ocurre en tu equipo y Kirchi sigue sin conexión.
- Con la ventana abierta, el asistente edita en vivo el circuito que tienes a la vista y no lo escribe en el disco por su cuenta. Cada paso se deshace con Ctrl+Z y queda anotado en el Registro. Si el archivo cambia fuera de Kirchi, «Conservar el mío» deja fuera al asistente.
- Plantillas y calculadoras desde el asistente, análisis con trazas por patilla y redes con nombre, análisis guardados en el documento y exportación de gráficas con título y subtítulo.
- Carpeta propia del asistente (Documentos\Kirchi\Asistente por omisión), indicador en la fila de título con un botón para desconectarlo y «Copiar configuración del asistente» para pegarla en cualquier cliente MCP.
- Perillas en vivo: el potenciómetro, el reóstato, los termistores, la fotorresistencia y los sensores de temperatura se mueven mientras se simula, desde el inspector, Mediciones, la rueda o las teclas, con escala logarítmica y campo escrito. El valor de la pieza muestra el ajuste y la resistencia en vivo según la opción Mostrar.
- Circuitos integrados de varias unidades: el lienzo los nombra como U1A, U1B, con el selector Unidad en el inspector, y «Agrupar en encapsulados» (en Inicio y en el clic derecho) junta las piezas sueltas. Las patillas compartidas se unen y Proyecto lista los encapsulados.
- Vista › Números de patilla dibuja el número de cada pin de los chips, y el archivo exportado los lleva si están visibles.
- «Datos de la pieza» en el inspector: encapsulado, patillas con número, nombre y nota, huella, parte y hoja de datos. «Copiar» deja la huella en el portapapeles y «Abrir» lleva la hoja o el número LCSC al navegador, solo al pulsarlo. Los datos aún no cotejados con una fuente llevan la marca «sin verificar».
- La Librería agrupa las piezas digitales en grupos plegables con su conteo, y recuerda cuáles quedaron plegados.
- Mediciones tiene la sección «Lógica y convertidores», con la cifra grande, los bits con su nivel, el estado y el reloj de los chips MSI.
- Los circuitos guardan la lista de lo que necesitan. Al abrir uno en una versión que no tiene una pieza o un modelo, un aviso lo nombra y se conserva al guardar.
- Piezas nuevas, 102 en total:
  - Compuertas AND, OR, NAND, NOR, XOR y XNOR de 2 a 8 entradas, inversor Schmitt 74HC14, búfer de tres estados 74HC125 (varias salidas pueden compartir una red y el Registro avisa si dos la manejan a niveles distintos) y estado lógico.
  - Lógica MSI en 74HC y 74LS: decodificadores 138, 139, 7447 y CD4028, multiplexores 151, 153 y 157, codificador de prioridad 148, sumador 283, comparador de magnitud 85, búfer octal 244, transceptor 245, contadores 161, 163, 190 y 193, y contador Johnson CD4017.
  - Semiconductores: JFET de canal N y P, IGBT (IRG4BC30UD y FGA25N120ANTD) y UJT 2N2646.
  - Fuentes: controladas de voltaje y de corriente (E, G, H y F) y fuente de voltaje por tramos (PWL), con su gráfica miniatura.
  - Sensores: termistores NTC y PTC con autocalentamiento, fotorresistencias GL5516, GL5528 y GL5539, y los sensores LM35 y TMP36.
  - Optoacopladores 4N25 y PC817, con los rangos de CTR de la hoja.
  - Motores a pasos 28BYJ-48 (unipolar) y 17HS4401 (bipolar), con ángulo y pasos en Mediciones, y el puente H L298.
  - Referencias TL431 y LM4040 (seis voltajes), amplificador de instrumentación INA128, amplificador de audio LM386 con ganancia de 20 a 200 y punta lógica CMOS y TTL con luces de alto y bajo.
  - Modelos nuevos ajustados a la hoja: reguladores 7809, 7815, 7912 y 7915, transistores BC337, BC327, 2N5551, 2N5401 y 2N3055, amplificadores MCP6002 y OP27, comparador LM339 y diodo 1N4001.
- Plantillas nuevas: Puente H discreto con TIP31, TIP32 y cuatro 1N4007, y Contador de 0 a 99 con dos 74HC161 y dos 74LS47 en displays de ánodo común. Son quince plantillas incluidas.
- Cursores y lectura con cruz en el osciloscopio X-Y y en las gráficas X-Y, con la pendiente entre dos puntos. Al exportar el osciloscopio, Desde y Hasta se escriben en cada eje.
- Menú «Medir ▸» en el clic derecho de un cable o etiqueta, con Sonda, Multímetro y Osciloscopio.
- El barrido de CA admite «Incluir frecuencias» exactas, como 60 Hz, además de su rejilla.

### Diseño

- Configuración tiene cinco pestañas (General, Apariencia, Simulación, Atajos y Asistente) y una pista (i) con globo en los ajustes que la necesitan.
- Cada transistor, SCR, triac y amplificador lleva el símbolo que numera sus patillas como su hoja de datos. El relé SRD y el botón de 6 mm toman la numeración de su huella.
- Las piezas traen sus datos físicos, cotejados con los símbolos y huellas de KiCad y con las hojas de los fabricantes.
- Los circuitos integrados dibujan su caja funcional con negación, reloj, tres estados y colector abierto.
- La pestaña Análisis sin elegir ofrece los seis análisis con su icono, y cada corrida empieza con el Registro vacío.
- El chip de una entrada de compuerta queda junto a su patilla y se arrastra por toda su red.
- En X-Y, la marca de 0 V del canal horizontal se arrastra de lado, en el borde de la retícula.
- Los instaladores se llaman por su sistema: Windows-instalador, Windows-portable, macOS y Linux.

### Arreglos

- Los análisis con ngspice vuelven a funcionar en la versión de la Microsoft Store: antes fallaban todos por la ruta de instalación con espacios.
- La simulación en tiempo real es más rápida en circuitos grandes y en los de motores a pasos, porque la factorización dispersa reutiliza su orden de pivotes.
- Un foco fundido se repone con un clic, como un fusible.
- Copiar y pegar lleva también las sondas del osciloscopio.
- Una red llamada «V(Salida)» ya no aparece como «V(V(Salida))» en las gráficas.

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
