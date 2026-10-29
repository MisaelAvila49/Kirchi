# Guía de uso

Esta guía recorre lo básico de Kirchi. Dentro de la aplicación, el tutorial «Aprende Kirchi» (menú Ayuda) recorre Kirchi paso a paso, en cinco capítulos que se pueden hacer por separado: Conoce Kirchi, Tu primer circuito, Medir, Analizar y exportar e Importar. En los pasos «Mira» un marco señala una zona y se avanza con «Siguiente»; en los pasos «Haz» la aplicación comprueba lo que hiciste.

## La ventana

Arriba está la cinta, con tres pestañas.

- **Inicio** reúne el trabajo de cada sesión en seis grupos: Archivo, Editar, Colocar, Simular, Instrumento y Análisis.
- **Vista** tiene cuatro grupos: Zoom, Paneles, Tiempo y animación, y Ventana.
- **Ayuda** abre el tutorial, la hoja de atajos, los ejemplos y «Acerca de».

A la izquierda hay un riel para colocar cosas (Librería, Plantillas y Calculadoras). A la derecha hay otro para ver cómo funciona el circuito (Inspector, Mediciones y Proyecto). Abajo, la franja de instrumentos tiene el Osciloscopio, las Gráficas de los análisis y el Registro. Todos los paneles se abren y se pliegan desde Vista › Paneles. `Ctrl+K` busca cualquier comando por nombre.

## Tu primer circuito

1. Abre la **Librería** desde el riel izquierdo, o haz doble clic en el lienzo para buscar una pieza por nombre. El buscador acepta valores: escribir `r 4k7` coloca una resistencia de 4.7 kΩ.
2. Un clic coloca la pieza y la deja seleccionada. Con `Shift` sigues colocando copias. `Esc` o clic derecho cancelan.
3. Para conectar, arrastra desde un pin hasta otro pin o hasta un cable. El cable se enruta solo y no cruza otras piezas.
4. Todo circuito necesita una tierra (`GND`). Sin ella, el Registro avisa que falta una referencia.
5. Pulsa **F5** (o Simular, en Inicio). Los cables cambian de color según el voltaje, las corrientes se animan y los LED se encienden. `Shift+F5` detiene la simulación.

Mientras se simula, el circuito no se edita. La excepción son las perillas en vivo (véase más abajo) y los interruptores, que se accionan con el ratón. Detén la simulación para volver a editar.

## Controlar el tiempo

En Inicio › Simular, **Avanzar** y **Retroceder** recorren la simulación por pasos del tamaño que se elija en el menú de Avanzar. En Vista › Tiempo y animación se cambia la velocidad (desde ×0.001 hasta sin límite) y se pausan las animaciones o el sonido. **Grabar** guarda un video de la ventana de Kirchi.

## Medir

- **Voltajes de red.** La tecla `V` muestra el voltaje de cada red. Con el ratón sobre un cable aparece su valor.
- **Instrumentos.** El menú Instrumento, en Inicio, coloca un multímetro, un osciloscopio, un generador de funciones o una fuente variable. Se ajustan en el inspector.
- **Medir desde un cable.** Con clic derecho sobre un cable o una etiqueta, «Medir» ofrece tres submenús: «Sonda» (voltaje o corriente), «Multímetro» (medidor rápido, multímetro completo o una terminal de uno del circuito) y «Osciloscopio» (cada entrada).
- **Osciloscopio.** La franja inferior se abre sola al simular. La rueda del ratón sobre un eje cambia su escala.
- **Mediciones.** El panel Mediciones, a la derecha, muestra la lectura del multímetro.

## Análisis

El menú **Analizar**, en Inicio, ofrece seis análisis que usan ngspice.

| Análisis | Para qué sirve |
|---|---|
| Punto de operación | Voltajes y corrientes en continua. |
| Barrido de CD | Curvas al variar una fuente. |
| CA / Bode | Ganancia y fase contra frecuencia. |
| Transitorio | Señales en el tiempo. |
| Fourier | Armónicos de una señal. |
| Barrido de parámetro | El resultado al variar un valor de una pieza. |

Si no se puede elegir ninguno (la vista previa no está detenida o el archivo es de solo lectura), la pestaña Análisis lo dice arriba de la lista.

Se elige el análisis, se ajustan sus campos en su ficha y se pulsa **Ejecutar**. Los resultados quedan en la pestaña **Gráficas** de la franja inferior, con cursores, zoom y exportación. Las redes con nombre (etiquetas) y las sondas indican qué curvas dibujar.

## Datos de la pieza

Al seleccionar una pieza, el inspector muestra una sección «Datos de la pieza» con el encapsulado, una tabla con el número, el nombre y la nota de cada pin, la huella, la parte y el enlace a la hoja de datos. Cambian al elegir otro modelo u otra presentación (un 2N3904 y un TIP31 traen encapsulados distintos). Un dato que todavía no se cotejó con una fuente lleva la marca «sin verificar».

«Copiar» deja la huella en el portapapeles. «Abrir» lleva la hoja de datos o la página del número LCSC al navegador del sistema, solo al pulsarlo y nunca por su cuenta. Con la vista previa corriendo la sección sigue disponible.

El asistente consulta lo mismo con la herramienta `datos_pieza`: encapsulado, pines, número LCSC con su marca, hoja y equivalencias.

Un circuito guarda la lista de lo que necesita. Si lo abres en una versión de Kirchi que no tiene una pieza o un modelo, un aviso lo nombra, se conserva al guardar y se puede simular al actualizar.

### Piezas

Hay 111 piezas en nueve categorías. La Librería agrupa en grupos plegables, con su conteo, las categorías Pasivos, Fuentes, Semiconductores, Interruptores, Digitales y Circuitos integrados, y recuerda cuáles dejaste cerrados. Electromecánicos, Indicadores e Instrumentos son listas planas.

- **Compuertas.** AND, OR, NAND, NOR, XOR y XNOR de 2 a 8 entradas (el ajuste Entradas está en el inspector y en el editor del doble clic), inversor Schmitt 74HC14 y búfer de tres estados 74HC125, cuyas salidas pueden compartir una red.
- **Lógica MSI** (74HC y 74LS): decodificadores 138, 139, 7447 y CD4028, multiplexores 151, 153 y 157, codificador de prioridad 148, sumador 283, comparador de magnitud 85, búfer 244, transceptor 245, contadores 161, 163, 190 y 193, contador Johnson CD4017 y registros de desplazamiento 74164 (entrada serie, salida paralela), 74165 (carga paralela) y 74595 (con almacenamiento y salidas de tres estados).
- **Semiconductores.** JFET de canal N y P, IGBT, UJT 2N2646, y los modelos BC337, BC327, 2N5551, 2N5401 y 2N3055.
- **Fuentes.** Controladas de voltaje y de corriente (E, G, H y F) y fuente de voltaje por tramos (PWL), que dibuja su forma de onda en miniatura.
- **Sensores.** Termistores NTC y PTC, fotorresistencias, LM35 y TMP36.
- **Integrados.** Optoacopladores 4N25 y PC817, referencias TL431 y LM4040, amplificador de instrumentación INA128, amplificador de audio LM386, reguladores 7809, 7815, 7912 y 7915, amplificadores MCP6002 y OP27, comparador LM339 y puente H L298.
- **Convertidores.** ADC0804 (A/D de 8 bits por aproximaciones sucesivas) y DAC0808 (D/A de 8 bits con salida en corriente). El Registro avisa una vez si una entrada del DAC lleva más de un microsegundo sin nivel definido.
- **Interruptores y teclados.** Interruptores DIP de 4 y de 8 posiciones, y teclados matriciales de 4x4 y de 4x3. Con la vista previa corriendo, un clic en la palanca de un DIP o en una tecla del teclado mueve sus contactos, y las teclas de la computadora accionan el teclado seleccionado (cada clic es un paso de deshacer).
- **Motores.** Motores a pasos 28BYJ-48 (unipolar) y 17HS4401 (bipolar), con el ángulo y los pasos en Mediciones.
- **Instrumentos.** Punta lógica, que enciende sus luces de alto y bajo según el nivel que toca.

En el buscador, `bc` propone BC337 y BC547.

## Perillas en vivo

El potenciómetro, el reóstato, los termistores, la fotorresistencia y los sensores de temperatura tienen una perilla que se mueve mientras se simula: desde el inspector, desde el panel Mediciones, con la rueda del ratón sobre la pieza o con las teclas. Algunas llevan escala logarítmica y un campo para escribir el valor. El ajuste se lee en un recuadro propio junto a la pieza, que se mueve y se deshace como la Referencia y el Valor. La opción Mostrar del inspector elige qué dice: «Como en Configuración» (la opción por omisión), «Ajuste», «Valores» (la resistencia de cada lado o de la parte), «Ambos» o «Nada». El ajuste general se elige en Configuración › General › «Texto de las piezas ajustables». Si el motor rechaza un valor, la perilla vuelve al anterior y el Registro lo avisa.

## Chips de varias unidades

Un circuito integrado con varias unidades, como un 74HC00, se coloca por unidades: la primera pieza toma el primer paquete libre (U1A), la siguiente se acomoda en la unidad que sigue (U1B) y así hasta llenarlo. En el inspector, el selector Unidad cambia a cuál corresponde la pieza y deshabilita las ocupadas. Cambiar el nombre del paquete lo cambia en todas sus unidades.

«Agrupar en encapsulados», en Inicio y en el clic derecho, junta las piezas sueltas seleccionadas en paquetes. El panel Proyecto lista los encapsulados. Los pines de alimentación que comparten las unidades de un paquete se unen solos, y si quedan en redes distintas la simulación avisa.

## Números de pin

Vista › Números de pin dibuja el número de cada pin de los chips, según su unidad y su familia. Viene visible. El archivo que se exporta los lleva solo si están visibles.

## Mediciones de lógica

Mediciones tiene una sección «Lógica y convertidores». Para los chips MSI muestra el valor como cifra grande, los bits con su nivel, el estado y el reloj. El motor a pasos muestra su ángulo y los pasos dados, y el JFET su voltaje, corriente, potencia y región.

## Plantillas y calculadoras

- **Plantillas.** Selecciona una parte del circuito y elige «Guardar como plantilla» en Inicio › Archivo. Para colocarla, abre el panel Plantillas y haz clic en el lienzo. Kirchi incluye quince, como el divisor, el LED con resistencia, el 555 astable, filtros, el puente H discreto y un contador de 0 a 99 con displays.
- **Calculadoras.** Seis calculadoras (divisor de voltaje, LED con resistencia, filtros, 555 astable, 555 monoestable y amplificador) dan valores comerciales y muestran la ecuación con la sustitución. **Generar circuito** deja el circuito listo para colocar con un clic.

## Texto y tamaños

El tamaño de letra de una nota o etiqueta se escribe y se muestra en puntos (pt); por omisión es 5.7 pt y el rango va de 2.8 a 56.7 pt. El deslizador «Tamaño del texto» de los diálogos de exportar cambia todo el texto de la figura a la vez.

Los diálogos de exportar una gráfica o una captura recuerdan lo que ajustaste mientras los datos sean los mismos. «Restablecer» los devuelve a sus valores por omisión.

## Atajos

| Acción | Atajo |
|---|---|
| Simular o pausar | `F5` |
| Detener | `Shift+F5` |
| Mostrar voltajes | `V` |
| Buscar un comando | `Ctrl+K` |
| Deshacer y rehacer | `Ctrl+Z`, `Ctrl+Shift+Z` |
| Cortar, copiar, pegar | `Ctrl+X`, `Ctrl+C`, `Ctrl+V` |
| Girar la selección | `R` (`Shift+R` en sentido contrario) |
| Reflejar | `X` e `Y` |
| Mover la selección | Flechas (2.5 mm), con `Shift` 12.5 mm |
| Encuadrar el circuito | `F` |
| Lienzo limpio (sin paneles) | `Ctrl+Shift+L` o `Ctrl+\` |
| Plegar la cinta | `Ctrl+F1` |
| Hoja de atajos | `?` |
| Configuración | `Ctrl+,` |

Configuración (`Ctrl+,`) tiene las secciones General, Apariencia, Simulación, Asistente y Atajos en una columna a la izquierda, con una tarjeta por grupo. Los cambios se guardan solos.

La hoja completa de atajos está en Ayuda › Atajos. Los atajos se cambian en Configuración › Atajos, y un conflicto entre dos atajos se pregunta antes de aplicarse.

## Asistente

Un asistente de IA (Claude Desktop, Claude Code o cualquier cliente MCP) puede trabajar sobre el circuito que tienes abierto. Está apagado hasta que lo actives y Kirchi no se conecta a internet.

1. Abre Configuración › Asistente y activa «Permitir que un asistente controle Kirchi».
2. Pulsa «Copiar configuración del asistente» y pega el texto en la configuración del cliente; el estado de la pestaña dice «Listo. Escríbele al asistente desde tu cliente.» Con el instalador de Windows lleva la ruta completa de Kirchi y con la Microsoft Store el alias `kirchi`.
3. Escríbele directo en tu cliente, en palabras. Puede colocar piezas, cablear, cambiar valores, simular, leer mediciones, usar plantillas y calculadoras, importar un circuito de Falstad, LTspice, SPICE, KiCad o Proteus que dejes en su carpeta, correr y guardar análisis con trazas por pin, y exportar la imagen o la gráfica.

Mientras trabaja, la fila de título muestra qué asistente está conectado y un botón para desconectarlo. Cada paso suyo se deshace con Ctrl+Z y queda en el Registro. Un circuito nuevo del asistente se abre en su propia ventana, y lo que tengas abierto se edita ahí a la vista. Sus archivos están en la carpeta del asistente (Documentos\Kirchi\Asistente), que puedes cambiar o restablecer en la misma pestaña, y se guardan solos después de cada cambio. Si un archivo abierto cambia fuera de Kirchi, un aviso ofrece «Recargar» o «Conservar el mío». Si desconectas, el asistente no vuelve hasta que apagues y enciendas el permiso.

## Archivos

Los circuitos se guardan como `.kir`, que se abren con doble clic desde el explorador. Kirchi mantiene respaldos y un diario para recuperar el trabajo tras un cierre inesperado. **Exportar imagen** (Inicio › Archivo) genera SVG, PNG y PDF, con fondo blanco por omisión y la opción de exportar solo la selección.

## Importar circuitos de otros programas

Kirchi abre circuitos hechos en otros programas. Los formatos aceptados son el texto que exportan Falstad y CircuitJS (`.txt`), los esquemas de LTspice (`.asc`), los netlists SPICE (`.cir`, `.net`, `.sp`), los esquemas de KiCad 7 a 9 (`.kicad_sch`) y los proyectos de Proteus 8 (`.pdsprj`). El programa de origen se reconoce por el contenido del archivo, no por su extensión.

Para importar, usa Abrir (`Ctrl+O`) o arrastra el archivo a la ventana. El circuito se abre como un documento nuevo sin guardar y el archivo original no se modifica. Los esquemas de KiCad con varias hojas se leen completos: Kirchi busca las hojas en la carpeta del archivo principal.

Al abrir aparece el informe de importación, que después queda en Proyecto. Sus tarjetas separan lo aproximado (una pieza parecida con otro modelo), lo que no tiene equivalencia, las redes unidas con etiqueta y los análisis convertidos. Al pasar el ratón por una tarjeta, o darle el foco con el teclado, se resaltan sus piezas en el lienzo, y un clic las encuadra. El informe se guarda con el archivo hasta que lo ocultas.

Lo que no tiene una pieza equivalente queda como una caja gris con los pines del original. Para cambiarla, haz clic derecho sobre ella y elige «Reemplazar por…»: la pieza nueva conserva los cables de la caja.

Se conservan los instrumentos y los análisis del original: sondas de voltaje y de corriente, generadores de pulso y senoidales, fuentes de CD, multímetros y osciloscopios virtuales, y los análisis de punto de operación, barrido de CD, transitorio, CA y Fourier. En Proteus, las gráficas analógicas pasan a un análisis transitorio con sus trazas, y los potenciómetros conservan la posición de su cursor. Los cables se trazan de nuevo con el enrutador de Kirchi, así que no siguen el recorrido del original. Todo lo que no se pudo convertir queda anotado en el informe.

El asistente también puede importar: la herramienta `importar` convierte un circuito de su carpeta y devuelve el informe (véase la sección Asistente).
