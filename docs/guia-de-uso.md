# Guía de uso

Esta guía recorre lo básico de Kirchi. Dentro de la aplicación, el tutorial «Aprende Kirchi» (menú Ayuda) recorre Kirchi paso a paso, en cinco capítulos que se pueden hacer por separado: Conoce Kirchi, Tu primer circuito, Armar y medir, Analizar y exportar e Importar. En los pasos «Mira» un marco señala una zona y se avanza con «Siguiente»; en los pasos «Haz» la aplicación comprueba lo que hiciste.

## La ventana

Arriba está la fila de título y, debajo, la cinta con cuatro pestañas. La fila de título lleva el nombre del archivo, Guardar, Exportar, Deshacer y Rehacer, el buscador de comandos (`Ctrl+K`) y tres bloques con rótulo: **Simular** (Simular y Detener), **Grabar** (Grabar, Pausar y Detener la grabación) y **Mostrar** (Voltajes y Corriente). Así se simula, se graba y se muestran los voltajes con la cinta plegada y desde cualquier pestaña.

- **Inicio** reúne el trabajo de cada sesión en grupos: Archivo, Editar, Colocar, Instrumentos (multímetro, osciloscopio, generador y fuente variable) y Tiempo (velocidad, más lento, más rápido, Avanzar y Retroceder). Con la vista de protoboard aparece además el grupo Protoboard. La cinta sigue a la vista que tiene el foco: en Esquema, Colocar trae Pieza, Figura, Alimentación, Tierra, Nota y Etiqueta de red; en Protoboard trae Pieza, Placa, Alimentación, Tierra, Nota y Cable. La flecha del extremo derecho de la fila de pestañas pliega la cinta.
- **Analizar** trae los seis análisis como botones, con Ejecutar y Cancelar a su derecha, y los grupos Resultados (Gráficas, Exportar CSV y Cursores), Instrumentos de lectura (Osciloscopio, Mediciones y Avisos) y Panel y calculadoras.
- **Vista** tiene cinco grupos: Zoom, Paneles, Animación, Lienzo y Ventana.
- **Ayuda** tiene cuatro grupos: Aprender (el tutorial «Aprende Kirchi», esta guía y la guía para fabricar una placa), Kirchi (Novedades, Buscar actualización, que abre la página de descarga, y Acerca de), Ayúdanos (enviar una sugerencia o reportar un error: un diálogo permite copiar el correo o abrir el mensaje en Gmail, Outlook web o la app de correo; y «Apoyar a Kirchi», una aportación voluntaria que no desbloquea nada) y Comunidad (YouTube, TikTok y la página de Kirchi). Esta guía y las novedades se abren dentro de Kirchi, sin internet y en el idioma de la aplicación. Los enlaces a sitios externos se abren en el navegador del sistema solo cuando se pulsan; Kirchi no se conecta a internet por su cuenta.

A la izquierda hay un riel para colocar cosas (Librería, Plantillas y Calculadoras). A la derecha hay otro para ver cómo funciona el circuito (Inspector, Mediciones, Proyecto y Avisos). Abajo, la franja de instrumentos tiene el Osciloscopio y las Gráficas de los análisis. Sobre el lienzo, las pestañas Esquema, Protoboard y Las dos cambian la vista y la cinta (véase la sección Protoboard). Todos los paneles se abren y se pliegan desde Vista › Paneles. `Ctrl+K` busca cualquier comando por nombre.

## Tu primer circuito

1. Abre la **Librería** desde el riel izquierdo, o haz doble clic en el lienzo para buscar una pieza por nombre. El buscador acepta valores: escribir `r 4k7` coloca una resistencia de 4.7 kΩ.
2. Un clic coloca la pieza y la deja seleccionada. Con `Shift` sigues colocando copias. `Esc` o clic derecho cancelan.
3. Para conectar, arrastra desde un pin hasta otro pin o hasta un cable. El cable se enruta solo y no cruza otras piezas.
4. Todo circuito necesita una tierra (`GND`). Sin ella, Avisos marca en rojo que falta una referencia y la simulación no arranca.
5. Pulsa **F5** (o Simular, en la fila de título). Los cables cambian de color según el voltaje, las corrientes se animan y los LED se encienden. `Shift+F5` detiene la simulación.

Mientras se simula, el circuito no se edita. La excepción son las perillas en vivo (véase más abajo) y los interruptores, que se accionan con el ratón. Detén la simulación para volver a editar.

## Controlar el tiempo

En Inicio › Tiempo, **Avanzar** y **Retroceder** recorren la simulación por pasos del tamaño que se elija en el menú de Avanzar, y la velocidad va desde ×0.001 hasta sin límite. En Vista › Animación se pausan las animaciones o el sonido. El bloque **Grabar** de la fila de título guarda un video de la ventana de Kirchi, con botones para pausar y detener la grabación.

## Medir

- **Voltajes de red.** Al simular, los cables, las tiras y los rieles conservan su color de edición. La tecla `V` (o el botón Voltajes) avanza por tres pasos: colores por voltaje, colores con el valor de cada red y todo apagado. Con el ratón sobre una red aparece su valor en cualquiera de los pasos.
- **Instrumentos.** El multímetro, el osciloscopio, el generador de funciones y la fuente variable están en la Librería (categoría Instrumentos) y en Medir, y `Ctrl+K` los coloca por nombre. Se ajustan en el inspector.
- **Medir desde un cable.** Con clic derecho sobre un cable o una etiqueta, «Medir» ofrece tres submenús: «Sonda» (voltaje o corriente), «Multímetro» (medidor rápido, multímetro completo o una terminal de uno del circuito) y «Osciloscopio» (cada entrada).
- **Osciloscopio.** La franja inferior se abre sola al simular. La rueda del ratón sobre un eje cambia su escala.
- **Mediciones.** El panel Mediciones, a la derecha, muestra la lectura del multímetro.

## Análisis

La pestaña **Analizar** ofrece seis análisis que usan ngspice, cada uno con su botón.

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

## Avisos

La pestaña **Avisos**, en el riel derecho, lista lo que pasa con el circuito ahora mismo y lleva un número del color del aviso más grave. Un aviso rojo impide simular, como la falta de una tierra: al pulsar F5 se abre la pestaña. Uno amarillo avisa sin impedir nada, como una pieza que pasa su máximo. Uno gris señala una diferencia entre la protoboard y el esquema, o una pieza que solo está en la protoboard. Con la protoboard como fuente de simulación, los avisos rojos son los de lo armado. Pasar el ratón por una tarjeta resalta su lugar en el lienzo y un clic lo encuadra. Solo se muestra el estado actual: al corregir la causa, el aviso desaparece.

## Protoboard

El esquema es el plano del circuito y la protoboard es ese circuito armado. Las pestañas **Esquema**, **Protoboard** y **Las dos** (sobre el lienzo) eligen qué ver. Cada vista trabaja por separado con las mismas piezas: se puede dibujar en una y editar en la otra, y la sincronización se pide con los comandos del botón **Protoboard ▾** (grupo Protoboard de Inicio). En Las dos, seleccionar una pieza en un lado la selecciona en el otro. La primera vez que abres la pestaña Protoboard aparece una placa de 830 puntos; **Placa ▾** (en Colocar) y el clic derecho en un lugar vacío agregan otras de 830, 400 o 170 puntos (esta última sin rieles de alimentación). Cada placa se mueve por separado y sus rieles no se unen solos: hace falta un cable.

**Colocar piezas.** Las piezas del esquema esperan dibujadas en la mesa «Por colocar», con su referencia y valor. Arrástralas a la placa: los agujeros donde caerán sus pines se marcan en verde si cabe, en rojo si no cabe (por ejemplo, un agujero ocupado) y en amarillo si cabe pero deja pines en cortocircuito, como un integrado que no cruza el canal central. Supr sobre una pieza que también está en el esquema la regresa a la mesa; si solo existe en la protoboard, la borra. Las resistencias llevan sus bandas: cuatro en cuerpo beige para la serie E24, cinco en cuerpo azul para la E96, y un cuerpo gris con el valor escrito cuando el valor no tiene código de colores.

**Pines y cables.** Arrastra la punta de un pin a otro agujero y se dobla; si no alcanza, lo dice. Un cable se coloca de agujero a agujero y puede ser recto o curvo. La tecla `A` cambia la forma del siguiente y el clic derecho cambia la de uno ya puesto. Un cable recto se dobla arrastrando un punto de su recorrido. Su color depende de su función (rojo al positivo, negro a tierra, azul al negativo) y se cambia con clic derecho › Color. Con el ratón sobre un agujero en uso, un globo dice qué hay conectado a esa tira.

**Editar en la protoboard.** La herramienta Pieza, la Librería y el buscador colocan piezas directamente en la placa, y la cinta y el clic derecho ofrecen Alimentación, Tierra, Nota y Cable. Una pieza colocada así existe solo en la protoboard hasta que se pide Generar esquema. Se puede seleccionar con un rectángulo o con `Shift`, cortar, copiar, pegar, duplicar y girar en grupo; arrastrar una de las piezas elegidas (o usar las flechas) mueve toda la selección junta, también a otra placa, y `Esc` o el clic derecho cancelan la herramienta activa. Borrar una pieza en el esquema la deja en la protoboard si ya estaba armada, y `Ctrl+Z` lo deshace.

**Fuentes y puntas.** Las fuentes, la tierra y las puntas de los instrumentos no se insertan en la placa: cada una se ve como una etiqueta pequeña junto a su agujero o su riel. Con Protoboard ▾ › Ver equipos se dibujan como equipos de laboratorio fuera de la placa (fuente, generador, osciloscopio), en el lado más cercano a lo que conectan, y cada cable de un equipo va al agujero libre más cercano de su red.

**Lo que falta y las diferencias.** Líneas punteadas grises unen lo que el esquema conecta y la protoboard todavía no. Las diferencias con el esquema se marcan en amarillo y se listan en Avisos. Las casillas «Lo que falta» y «Diferencias» de Protoboard ▾ las ocultan, y su estado se guarda en el archivo.

**Generar protoboard y Generar esquema.** Protoboard ▾ › Generar protoboard coloca las piezas, los conectores y los cables que faltan, y agrega placas si no caben. Generar esquema hace lo contrario: lleva al esquema las piezas que solo existen en la protoboard y las une con cables o etiquetas de red según lo que la placa conecta. El clic derecho de una selección ofrece Generar esquema con lo seleccionado. Los dos muestran antes un resumen de lo que harán, y al aplicar un solo `Ctrl+Z` lo deshace todo.

**Medir en la placa.** Con clic derecho sobre una pieza de la placa, Medir › Multímetro u Osciloscopio clava las puntas en agujeros libres de la red de sus pines. Una pieza que sigue en la mesa no se puede medir. También se puede arrastrar una punta a un agujero.

**Simular y analizar.** F5 simula el circuito de la pestaña abierta: el esquema en Esquema y lo realmente armado en Protoboard. En Las dos aparece un selector «Simular» para elegir uno, que no cambia mientras corre. Los análisis (punto de operación, CC, CA, transitorio y los demás) usan la misma fuente; con la protoboard, las trazas llevan el nombre de la red del esquema si coincide, y si no el de la tira o el riel (por ejemplo «tira C5»). Al simular la protoboard, las tiras y los rieles se tiñen según su voltaje, la tecla `V` pone en cada tira usada una etiqueta con su valor, y los LED y los displays de siete segmentos se encienden. Un pin que no está en ninguna tira se simula como abierto. Si falta un cable en el camino del LED, la protoboard simula y el LED no enciende, mientras que el esquema sigue funcionando.

**Archivos, plantillas y exportar.** Un archivo con protoboard guarda las placas, la posición de cada pieza, los cables, las etiquetas y los equipos; uno sin protoboard se guarda como siempre. Al guardar una plantilla puedes marcar «Guardar también cómo está armado en la protoboard»; al colocarla, llega armada. Con la pestaña Protoboard abierta, Exportar genera PNG, SVG y PDF.

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
- **Convertidores.** ADC0804 (A/D de 8 bits por aproximaciones sucesivas) y DAC0808 (D/A de 8 bits con salida en corriente). Avisos lo marca si una entrada del DAC lleva más de un microsegundo sin nivel definido.
- **Interruptores y teclados.** Interruptores DIP de 4 y de 8 posiciones, y teclados matriciales de 4x4 y de 4x3. Con la vista previa corriendo, un clic en la palanca de un DIP o en una tecla del teclado mueve sus contactos, y las teclas de la computadora accionan el teclado seleccionado (cada clic es un paso de deshacer).
- **Motores.** Motores a pasos 28BYJ-48 (unipolar) y 17HS4401 (bipolar), con el ángulo y los pasos en Mediciones.
- **Instrumentos.** Punta lógica, que enciende sus luces de alto y bajo según el nivel que toca.

En el buscador, `bc` propone BC337 y BC547.

## Perillas en vivo

El potenciómetro, el reóstato, los termistores, la fotorresistencia y los sensores de temperatura tienen una perilla que se mueve mientras se simula: desde el inspector, desde el panel Mediciones, con la rueda del ratón sobre la pieza o con las teclas. Algunas llevan escala logarítmica y un campo para escribir el valor. El ajuste se lee en un recuadro propio junto a la pieza, que se mueve y se deshace como la Referencia y el Valor. La opción Mostrar del inspector elige qué dice: «Como en Configuración» (la opción por omisión), «Ajuste», «Valores» (la resistencia de cada lado o de la parte), «Ambos» o «Nada». El ajuste general se elige en Configuración › General › «Texto de las piezas ajustables». Si el motor rechaza un valor, la perilla vuelve al anterior y Avisos lo dice.

## Chips de varias unidades

Un circuito integrado con varias unidades, como un 74HC00, se coloca por unidades: la primera pieza toma el primer paquete libre (U1A), la siguiente se acomoda en la unidad que sigue (U1B) y así hasta llenarlo. En el inspector, el selector Unidad cambia a cuál corresponde la pieza y deshabilita las ocupadas. Cambiar el nombre del paquete lo cambia en todas sus unidades.

El panel Proyecto lista los encapsulados. Los pines de alimentación que comparten las unidades de un paquete se unen solos, y si quedan en redes distintas la simulación avisa.

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

Configuración (`Ctrl+,`) tiene las secciones General, Apariencia, Simulación, Asistente y Atajos en una columna a la izquierda, con una tarjeta por grupo. Los cambios se guardan solos. La opción Idioma de General cambia Kirchi entre español e inglés (Automático sigue el del sistema), y `Ctrl+K` también la encuentra como «Cambiar idioma».

La hoja completa de atajos se abre con el icono Atajos, a la derecha de la fila de título. Los atajos se cambian en Configuración › Atajos, y un conflicto entre dos atajos se pregunta antes de aplicarse. `F1` lleva el foco al globo del tutorial en marcha.

## Asistente

Un asistente de IA (Claude Desktop, Claude Code o cualquier cliente MCP) puede trabajar sobre el circuito que tienes abierto. Está apagado hasta que lo actives y Kirchi no se conecta a internet.

1. Abre Configuración › Asistente y activa «Permitir que un asistente controle Kirchi».
2. Pulsa «Copiar configuración del asistente» y pega el texto en la configuración del cliente; el estado de la pestaña dice «Listo. Escríbele al asistente desde tu cliente.» Con el instalador de Windows lleva la ruta completa de Kirchi y con la Microsoft Store el alias `kirchi`.
3. Escríbele directo en tu cliente, en palabras. Puede colocar piezas, cablear, leer el estado de la protoboard y armarla, cambiar valores, simular, leer mediciones, usar plantillas y calculadoras, importar un circuito de Falstad, LTspice, SPICE, KiCad o Proteus que dejes en su carpeta, correr y guardar análisis con trazas por pin, y exportar la imagen o la gráfica.

Mientras trabaja, la fila de título muestra qué asistente está conectado y un botón para desconectarlo. Cada paso suyo se deshace con Ctrl+Z y queda en el historial de deshacer. Un circuito nuevo del asistente se abre en su propia ventana, y lo que tengas abierto se edita ahí a la vista. Sus archivos están en la carpeta del asistente (Documentos\Kirchi\Asistente), que puedes cambiar o restablecer en la misma pestaña, y se guardan solos después de cada cambio. Si un archivo abierto cambia fuera de Kirchi, un aviso ofrece «Recargar» o «Conservar el mío». Si desconectas, el asistente no vuelve hasta que apagues y enciendas el permiso.

## Archivos

Los circuitos se guardan como `.kir`, que se abren con doble clic desde el explorador. Kirchi mantiene respaldos y un diario para recuperar el trabajo tras un cierre inesperado. **Exportar imagen** (fila de título) genera SVG, PNG y PDF, con fondo blanco por omisión y la opción de exportar solo la selección.

## Fabricar una placa

Kirchi no dibuja la placa: prepara el proyecto para que la hagas en KiCad (8, 9 o 10, gratuito en kicad.org) y la pidas a una fábrica como JLCPCB. Con el circuito armado en el esquema, elige **Archivo › Exportar para fabricar**.

El diálogo lista cada pieza con su huella de KiCad, la forma física que tendrá en la placa. Puedes cambiar la huella de una pieza, marcarla como conector (una fuente o una batería no se sueldan: llegan por una bornera) u omitirla. Una pieza sin huella bloquea la exportación y dice qué le falta. Al abrir una fila se ve el mapa de pines, que numera cada pin de la huella con su nombre en Kirchi. Los transistores en encapsulado TO-92, TO-220 o SOT-23 llevan un aviso: el orden de sus pines cambia con el modelo, y conviene compararlo con la hoja de datos.

Después eliges qué escribir: el proyecto de KiCad (esquema, placa vacía y biblioteca de símbolos), la lista de materiales para JLCPCB (`.csv`) o solo la netlist. Kirchi crea dentro de la carpeta que elijas una subcarpeta con el nombre del proyecto y escribe ahí los archivos; si ya existe una con ese nombre, la nueva se llama «nombre (2)» y nunca se sobrescribe nada. El nombre sale del archivo del circuito. Si el circuito aún no está guardado, el paso 2 del diálogo pide el nombre (propone «circuito») y acepta letras, números, espacios, guion y guion bajo, hasta 60 caracteres, sin nombres que Windows reserve como `CON` o `NUL`. El aviso final ofrece abrir la subcarpeta.

La guía **Ayuda › Aprender › Fabricar una placa** (también el botón «Ver la guía» del aviso final) abre una ventana aparte que se queda a un lado mientras trabajas en KiCad. Tiene dieciséis pasos (cinco en Kirchi y en la instalación de KiCad, once en KiCad y la fábrica), cada uno con su dibujo, una lista corta de acciones y un bloque «Deberías ver» para saber si salió bien. Recuerda el último paso que viste. Los menús aparecen con el nombre que les da KiCad en inglés y, entre paréntesis, el que les da KiCad en español.

1. **Abre el proyecto en KiCad.** Elige File › Open Project (Archivo › Abrir proyecto) y el archivo `.kicad_pro`. El aviso «created by an older version of KiCad» es normal.
2. **Revisa el esquema (opcional).** Doble clic en el `.kicad_sch`, Inspect › Electrical Rules Checker (Inspeccionar › Control de las reglas eléctricas (ERC)) y Run ERC (Ejecutar ERC). Debe dar 0 errores.
3. **Trae las piezas a la placa.** Doble clic en el `.kicad_pcb`, `F8` (Tools › Update PCB from Schematic, Herramientas › Actualizar placa desde esquema) y Update PCB (Actualizar placa). Debe dar 0 errores y ninguna «footprint not found». Un clic en la hoja suelta las piezas.
4. **Acerca y acomoda las piezas.** La rueda del ratón acerca; se arrastra, `M` mueve y `R` gira, sin encimar. Las líneas finas son lo que falta por unir.
5. **Dibuja el borde.** En la lista de capas de arriba, `Edge.Cuts`; el icono del rectángulo de la barra derecha (Place › Draw Rectangle, Añadir › Dibujar rectángulo, o `Ctrl+Shift+R`); un clic arriba a la izquierda, otro abajo a la derecha con margen y `Esc`. Se comprueba con `Alt+3`, el visor 3D.
6. **Traza las pistas.** `Esc`, capa `B.Cu`, `X`, clic en un pad y clic en el otro siguiendo la línea fina; doble clic o clic en el pad para terminar y `Ctrl+Z` si sale mal. La barra de estado debe decir Unrouted 0.
7. **Revisa las reglas.** Inspect › Design Rules Checker (Inspeccionar › Comprobar reglas de diseño) y Run DRC (Ejecutar DRC). Debe dar 0 errores y 0 Unconnected Items; los avisos de Silkscreen no impiden fabricar.
8. **Imprime a escala 1:1.** File › Print (Archivo › Imprimir) con las capas `B.Cu`, `F.Silkscreen` y `Edge.Cuts` y escala 1:1. Se mide con una regla y se ponen encima las piezas reales: el pin corto del LED va en el pad cuadrado. También se revisan las polaridades de diodos, capacitores electrolíticos y transistores.
9. **Genera los Gerber.** File › Fabrication Outputs › Gerbers (.gbr) (Archivo › Salidas de fabricación › Gerbers (.gbr)). En Output directory se escribe `gerber/` y KiCad crea la carpeta. Capas: `F.Cu`, `B.Cu`, `F.Paste`, `B.Paste`, `F.Silkscreen`, `B.Silkscreen`, `F.Mask`, `B.Mask` y `Edge.Cuts`. Se marcan Use Protel filename extensions y Subtract soldermask from silkscreen, se desmarca Generate Gerber job file y se pulsa Plot.
10. **Genera las perforaciones.** Generate Drill Files (Generar archivos de taladrado), con formato Excellon, Oval holes en Use alternate drill mode, PTH and NPTH in single file desmarcado, origen Absolute, unidades Millimeters, Decimal format y Map file en Gerber. Se termina con Generate Drill File.
11. **Comprime la carpeta y súbela.** Clic derecho en la carpeta `gerber` › Comprimir en ZIP (en Windows 10, Enviar a › Carpeta comprimida). Ese zip es el que acepta la fábrica: JLCPCB muestra la vista previa de la placa al subirlo, sin pagar. Se piden 5 placas de dos capas y sin ensamblado.

## Importar circuitos de otros programas

Kirchi abre circuitos hechos en otros programas. Los formatos aceptados son el texto que exportan Falstad y CircuitJS (`.txt`), los esquemas de LTspice (`.asc`), los netlists SPICE (`.cir`, `.net`, `.sp`), los esquemas de KiCad 7 a 9 (`.kicad_sch`) y los proyectos de Proteus 8 (`.pdsprj`). El programa de origen se reconoce por el contenido del archivo, no por su extensión.

Para importar, usa Abrir (`Ctrl+O`) o arrastra el archivo a la ventana. El circuito se abre como un documento nuevo sin guardar y el archivo original no se modifica. Los esquemas de KiCad con varias hojas se leen completos: Kirchi busca las hojas en la carpeta del archivo principal.

Al abrir aparece el informe de importación, que después queda en Proyecto. Sus tarjetas separan lo aproximado (una pieza parecida con otro modelo), lo que no tiene equivalencia, las redes unidas con etiqueta y los análisis convertidos. Al pasar el ratón por una tarjeta, o darle el foco con el teclado, se resaltan sus piezas en el lienzo, y un clic las encuadra. El informe se guarda con el archivo hasta que lo ocultas.

Lo que no tiene una pieza equivalente queda como una caja gris con los pines del original. Para cambiarla, haz clic derecho sobre ella y elige «Reemplazar por…»: la pieza nueva conserva los cables de la caja.

Se conservan los instrumentos y los análisis del original: sondas de voltaje y de corriente, generadores de pulso y senoidales, fuentes de CD, multímetros y osciloscopios virtuales, y los análisis de punto de operación, barrido de CD, transitorio, CA y Fourier. En Proteus, las gráficas analógicas pasan a un análisis transitorio con sus trazas, y los potenciómetros conservan la posición de su cursor. Los cables se trazan de nuevo con el enrutador de Kirchi, así que no siguen el recorrido del original. Todo lo que no se pudo convertir queda anotado en el informe.

El asistente también puede importar: la herramienta `importar` convierte un circuito de su carpeta y devuelve el informe (véase la sección Asistente).
