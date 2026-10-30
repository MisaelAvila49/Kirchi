# Historial de cambios

## 2.2.1

Los circuitos importados se ven y se simulan como en su programa original, y llegan las condiciones iniciales en capacitores e inductores y las fuentes de corriente AC y de pulso.

### Nuevo

- Capacitores e inductores con voltaje o corriente inicial opcional. Cuando alguna pieza lo tiene, el análisis transitorio parte de esas condiciones: la casilla «Partir de cero» queda marcada y una nota nombra las piezas. La exportación a SPICE escribe `ic=` y `uic`.
- Fuentes de corriente AC y de pulso, 113 piezas en total.
- Las gráficas analógicas de Proteus y sus osciloscopios virtuales pasan también a un osciloscopio con su base de tiempo, su escala y etiquetas de red en sus entradas.

### Importar

- Se conservan los cables, terminales, tierras y etiquetas del original en su lugar y a su escala, en vez de tender cables largos por todo el esquema.
- Una fuente de CD que alimenta un terminal con nombre se convierte en ese terminal de alimentación con su voltaje (como VCC). Si su corriente se grafica en un análisis, se queda como fuente.
- Las piezas conservan su orientación: los amplificadores de Proteus ya no salen reflejados y el UniversalOpamp2 de LTspice lleva In− arriba.
- Las etiquetas de red crecen hacia su lado libre, evitan pines, números de pin y nombres de otras piezas, y se corren por su cable cuando no hay lugar.
- Las fuentes conservan amplitud, frecuencia, flancos, ancho y retardo. PWL, EXP y los pulsos invertidos se importan por tramos, y un pulso que no cabe en su periodo pasa al generador.
- Los transistores conservan los parámetros del `.model` del archivo.
- Los estados guardados por Falstad, el `ic=` y el `.ic` de SPICE pasan a las condiciones iniciales de cada pieza.
- El `.tran` de un solo argumento se lee como el tiempo final.

### Diseño

- La etiqueta seleccionada ya no abre un globo de texto: las líneas punteadas señalan lo que une.

### Arreglos

- Copiar, cortar o duplicar una etiqueta ya no duplica la sonda de su punto.
- Un archivo con coordenadas absurdas o con muchas hojas se abre sin colgar Kirchi.

## 2.2.0

Kirchi abre circuitos de Falstad, LTspice, netlists SPICE, KiCad y Proteus, con un informe de lo convertido, lo aproximado y lo que no tiene equivalencia, y un capítulo del tutorial para aprenderlo.

### Nuevo

- Abrir (Ctrl+O) y arrastrar a la ventana aceptan circuitos de otros programas: el texto que exportan Falstad y CircuitJS (.txt), esquemas de LTspice (.asc), netlists SPICE (.cir, .net, .sp), esquemas de KiCad 7 a 9 (.kicad_sch, con sus hojas) y proyectos de Proteus 8 (.pdsprj). El programa de origen se reconoce por el contenido del archivo, el circuito se abre como documento nuevo sin guardar y el original no se modifica.
- Cada pieza se busca en las equivalencias de la librería. Si no hay una exacta pero el tipo existe (transistor, diodo, amplificador, compuerta), se usa la pieza más cercana y se marca como modelo aproximado. Si no hay nada parecido, queda una caja gris con los pines del original, que se reemplaza con clic derecho › «Reemplazar por…» conservando sus cables.
- Al abrir aparece el informe de importación, con tarjetas para lo aproximado, lo que no tiene equivalencia, las redes unidas con etiqueta y los análisis convertidos. Después queda en Proyecto: al pasar el ratón o el foco por una tarjeta se resaltan sus piezas en el lienzo, y un clic las encuadra. El informe se guarda con el archivo hasta que se oculta.
- Se conservan los instrumentos y los análisis del original: sondas de voltaje y de corriente, generadores de pulso y senoidales, fuentes de CD, multímetros y osciloscopios virtuales, y los análisis de punto de operación, barrido de CD, transitorio, CA y Fourier. En Proteus, las gráficas analógicas pasan a análisis transitorio con sus trazas, y los potenciómetros conservan la posición de su cursor.
- El tutorial tiene un quinto capítulo, «Importar», que abre un circuito de ejemplo, recorre el informe y reemplaza una pieza sin equivalencia.
- El asistente tiene la herramienta `importar`, que convierte un circuito de su carpeta y devuelve el informe.
- Los archivos que guardan una caja gris o un informe de importación usan el formato 9. Una versión anterior de Kirchi los abre en solo lectura.

### Diseño

- Las piezas traen sus equivalencias de KiCad, LTspice, Falstad y Proteus, verificadas contra archivos y librerías reales.

## 2.1.0

Nueve piezas nuevas (111 en total) con convertidores A/D y D/A, interruptores DIP, teclados y registros de desplazamiento, el ajuste de las perillas en su propio recuadro, cuatro tipos nuevos en la calculadora de amplificadores, un tutorial que recorre todo Kirchi, Configuración reordenada y modelos más fieles del TL431, el foco y el comparador.

### Nuevo

- Piezas nuevas, 111 en total:
  - Convertidor A/D ADC0804 y convertidor D/A DAC0808, con la conversión por aproximaciones sucesivas y la corriente de sus 256 códigos. El Registro avisa una vez cuando una entrada del DAC lleva más de un microsegundo sin nivel definido.
  - Interruptores DIP de 4 y de 8 posiciones, y teclados matriciales de 4x4 y de 4x3. Con la vista previa corriendo, un clic en la palanca o en la tecla mueve sus contactos, y las teclas de la computadora accionan el teclado seleccionado.
  - Registros de desplazamiento 74164 (entrada serie, salida paralela), 74165 (carga paralela) y 74595 (con almacenamiento y salidas de tres estados).
- El ajuste del potenciómetro, los termistores y los sensores de temperatura va en su propio recuadro, que se mueve y se deshace como la Referencia y el Valor. La opción Mostrar de cada pieza ofrece «Como en Configuración», «Ajuste», «Valores», «Ambos» y «Nada», y Configuración › General tiene «Texto de las piezas ajustables» con la opción por omisión.
- Los diálogos de exportar de gráficas y capturas conservan lo ajustado mientras los datos sean los mismos, y «Restablecer» los devuelve a sus valores.
- La calculadora de amplificadores se llama «Amplificadores con operacional» y suma integrador, derivador, sumador inversor de 2 a 4 entradas y amplificador de instrumentación, cada uno con su ecuación, su revisión de saturación y su circuito.
- El editor de la figura que se exporta permite elegir varios elementos del mismo tipo (trazas, textos, flechas, etiquetas de valor, ejes o títulos) con Mayús o Ctrl y clic, y cambiar su color, tamaño o grosor a la vez.
- El asistente coloca chips por paquete y unidad, cambia la unidad de una pieza, agrupa encapsulados y lee los paquetes y los números de pin.
- La pestaña Análisis dice a la vista por qué no se puede elegir un análisis (la vista previa no está detenida o el archivo es de solo lectura).

### Diseño

- El tamaño de letra de notas y etiquetas se muestra y se escribe en puntos (la omisión es 5.7 pt y el rango va de 2.8 a 56.7 pt).
- La interfaz dice «pin» en lugar de «patilla»: menús, avisos, inspector, asistente y guías.
- Configuración tiene las pestañas en una columna a la izquierda y una tarjeta por grupo, con el mismo interruptor para todo lo que es sí o no, la ayuda (i) junto al nombre y las carpetas con la misma fila. Algunos rótulos se aclararon: «Serie de valores al escribir» (con «Sin serie»), «Texto de las piezas ajustables», «Evitar parpadeo del lienzo» (ahora en Apariencia) y «Conectar un asistente».
- La Librería agrupa también Pasivos, Fuentes, Semiconductores, Interruptores y Circuitos integrados en grupos plegables.
- El panel de la figura que se exporta sigue el orden Restablecer figura, Datos, Tema, Mostrar, Letra, Apariencia de texto, Rejilla, Grosor de la rejilla, Subdivisiones de los ejes, Grosor de los ejes y Adornos, en gráficas y capturas, y la pista dice «Da clic para modificar algo específico.»
- Los avisos de la vista previa dicen lo que sí se puede hacer mientras corre: los valores se ajustan, y solo mover, cablear, borrar o los análisis esperan a detenerla.
- En Gráficas, las lecturas de los cursores van en una columna a la derecha de la gráfica (lista de análisis, gráfica y cursores) y bajan debajo de ella cuando el panel es angosto.
- El deslizador general de texto se llama «Tamaño del texto» y tiene globo.
- El grosor de los ejes del osciloscopio engrosa también la cruz central.
- El tutorial «Aprende Kirchi» es un recorrido completo en cuatro capítulos: Conoce Kirchi, Tu primer circuito, Medir y Analizar y exportar. Cada uno parte de su propio circuito, así que se puede hacer solo, y el selector dice en una frase de qué trata. Los pasos «Mira» enmarcan una zona con una línea de explicación y se avanzan con «Siguiente»; los pasos «Haz» comprueban la acción. Todo paso señala su zona con el marco, también sobre el diálogo de exportar, y los textos llevan los iconos de la interfaz junto a sus nombres. El avance guardado de la versión anterior se reinicia.

### Arreglos

- Al elegir varias trazas en el exportar, el color, el grosor y el eje que ya tenía la primera se aplican también a las demás.
- En el exportar de una gráfica, las muestras de color de Datos siguen al color que se eligió para cada traza.
- Al exportar una gráfica o una captura del osciloscopio, el color que se elige para una traza ya no lo pisan los colores que guardaba el diálogo de versiones anteriores.
- Duplicar o pegar una etiqueta o una nota la deja en un lugar libre, sin encimarla sobre piezas, cables u otros textos.
- La barra de formato de una etiqueta o una nota se coloca arriba, abajo o al costado, donde no tape las piezas.
- Lo capturado del osciloscopio se dibuja sin escalones al verlo hacia atrás o con menos tiempo por división: una senoidal ya no sale cuadrada.
- El recuadro del valor del NTC, el PTC y la fotorresistencia vuelve a mostrar su modelo en vez de quedar vacío.
- Un cambio hecho en caliente en una parte del circuito que no cambia con el tiempo se aplica desde el instante de la simulación, y sus voltajes, promedios y sondas lo muestran de inmediato.
- La vista previa corre más rápido en los circuitos que mezclan lógica y analógico y en el motor 28BYJ-48 con ULN2003, que ya alcanzan el tiempo real con ×1.
- Si ngspice no arranca, el error dice la ruta, el código del sistema y, en macOS, qué hacer. En macOS la comprobación espera más y se reintenta.
- La aplicación libera memoria apartada dos segundos después de cargar cada ventana.
- Al abrir, la interfaz y el proceso principal ocupan unos 10 MB menos: su código se guarda a un byte por carácter y la librería del asistente se carga solo cuando se conecta.
- Al elegir el tramo a exportar se ve todo el eje, así que un tramo elegido antes ya no limita la elección.
- La búsqueda de la Librería y del buscador pone primero la mejor coincidencia («led» da el LED y no las fuentes controladas) y descarta las que solo contienen el texto dentro de otra palabra.
- Con la vista previa corriendo, la nota de la referencia fija ya no tapa el campo Valor del editor, y los voltajes esquivan las banderas de las sondas, las pantallas de los medidores y las cifras de los instrumentos.
- Los cursores de tiempo del osciloscopio se quedan fijos en la pantalla mientras ella avanza, como en un osciloscopio real, y se mide sin pausar.
- Los números de pin se ven desde el 100 % de zoom y el botón de Vista los oculta y los muestra.
- El TL431 y el LM4040 se asientan en microsegundos y dan su voltaje en mediciones cortas, se muestree o no.
- El foco sube su resistencia con la temperatura del filamento: su corriente crece con el voltaje y se funde al doble de su potencia.
- La salida del comparador ya no pasa del voltaje de su alimentación al conmutar.
- El asistente mide frecuencia, promedio y rms del osciloscopio sobre periodos completos, sin contar el arranque.

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
