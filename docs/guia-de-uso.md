# Guía de uso

Esta guía recorre lo básico de Kirchi. Dentro de la aplicación, el tutorial «Aprende Kirchi» (menú Ayuda) explica lo mismo paso a paso.

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

Mientras se simula, el circuito no se edita. La excepción son el potenciómetro y los interruptores, que se accionan con el ratón. Detén la simulación para volver a editar.

## Controlar el tiempo

En Inicio › Simular, **Avanzar** y **Retroceder** recorren la simulación por pasos del tamaño que se elija en el menú de Avanzar. En Vista › Tiempo y animación se cambia la velocidad (desde ×0.001 hasta sin límite) y se pausan las animaciones o el sonido. **Grabar** guarda un video de la ventana de Kirchi.

## Medir

- **Voltajes de red.** La tecla `V` muestra el voltaje de cada red. Con el ratón sobre un cable aparece su valor.
- **Instrumentos.** El menú Instrumento, en Inicio, coloca un multímetro, un osciloscopio, un generador de funciones o una fuente variable. Se ajustan en el inspector.
- **Medir desde un cable.** Con clic derecho sobre un cable o una etiqueta, «Medir con el multímetro» ofrece el medidor rápido o una terminal de un multímetro, y «Medir con el osciloscopio» ofrece cada entrada.
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

Se elige el análisis, se ajustan sus campos en su ficha y se pulsa **Ejecutar**. Los resultados quedan en la pestaña **Gráficas** de la franja inferior, con cursores, zoom y exportación. Las redes con nombre (etiquetas) y las sondas indican qué curvas dibujar.

## Plantillas y calculadoras

- **Plantillas.** Selecciona una parte del circuito y elige «Guardar como plantilla» en Inicio › Archivo. Para colocarla, abre el panel Plantillas y haz clic en el lienzo. Kirchi incluye varias, como el divisor, el LED con resistencia, el 555 astable y filtros.
- **Calculadoras.** Seis calculadoras (divisor de voltaje, LED con resistencia, filtros, 555 astable, 555 monoestable y amplificador) dan valores comerciales y muestran la ecuación con la sustitución. **Generar circuito** deja el circuito listo para colocar con un clic.

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

La hoja completa de atajos está en Ayuda › Atajos. Los atajos se cambian en Configuración, y un conflicto entre dos atajos se pregunta antes de aplicarse.

## Archivos

Los circuitos se guardan como `.kir`, que se abren con doble clic desde el explorador. Kirchi mantiene respaldos y un diario para recuperar el trabajo tras un cierre inesperado. **Exportar imagen** (Inicio › Archivo) genera SVG, PNG y PDF, con fondo blanco por omisión y la opción de exportar solo la selección.
