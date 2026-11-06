<div align="center">

[English: README.en.md](README.en.md)

<img src="build/icon.png" alt="" width="96" height="96">

# Kirchi

**El simulador de circuitos que te hubiera gustado tener en la carrera.**

Armas el circuito, pulsas F5 y lo ves funcionar. Gratis, sin internet, sin cuenta y en español e inglés.

[![Obtener en Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Obtener-0E7C66?style=for-the-badge&logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9pks3qd294cn)
[![Descargar para Windows, macOS y Linux](https://img.shields.io/badge/Releases-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-22252A?style=for-the-badge&logo=github&logoColor=white)](../../releases/latest)
[![Página de descarga](https://img.shields.io/badge/P%C3%A1gina-Descargar-22252A?style=for-the-badge&logo=githubpages&logoColor=white)](https://misaelavila49.github.io/Kirchi/)

[![Uso gratuito](https://img.shields.io/badge/uso-gratuito-0E7C66.svg)](LICENSE)
[![Versión](https://img.shields.io/badge/versi%C3%B3n-3.1.1-0E7C66.svg)](CHANGELOG.md)
![Plataformas](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

<img src="docs/imagenes/portada.jpg" alt="Kirchi con una computadora analógica de siete amplificadores operacionales TL081: el esquema a la izquierda, la misma computadora armada en la protoboard a la derecha y, abajo, el osciloscopio con la señal de entrada y la respuesta" width="100%">

<p><a href="#novedades-de-la-31">Novedades</a> · <a href="#protoboard">Protoboard</a> · <a href="#capturas">Capturas</a> · <a href="#descargar-e-instalar">Descargar</a> · <a href="#cómo-funciona">Cómo funciona</a> · <a href="docs/guia-de-uso.md">Guía de uso</a></p>

</div>

## Por qué Kirchi

Kirchi es un simulador de circuitos de escritorio para estudiar electrónica: dibujas el esquema en una rejilla, simulas en tiempo real y mides como en el laboratorio, con un osciloscopio, un multímetro y análisis formales con ngspice.

| | |
|---|---|
| **Gratis** | Sin pruebas que caducan, sin anuncios y sin funciones de pago. |
| **Sin internet ni cuenta** | Todo pasa en tu computadora. No se envía ningún dato. |
| **Lo ves funcionar** | Los cables se pintan según su voltaje, la corriente se mueve por cada rama, los LED encienden y las piezas se queman cuando pasan su máximo. |
| **Mide como en el laboratorio** | Osciloscopio de cuatro canales con sondas y modo X-Y, multímetro, generador de funciones, fuente variable y medidores rápidos sobre cualquier cable. |
| **Análisis de verdad** | ngspice viene incluido: punto de operación, barrido de CD, transitorio, Bode, Fourier y barrido de parámetro. |
| **Listo para el reporte** | Exporta esquemas y gráficas a PNG, SVG o PDF con títulos, flechas, llamadas numeradas y lecturas. |
| **Fácil de aprender** | Interfaz en español e inglés (se elige en Configuración), tutorial dentro de la aplicación, plantillas y calculadoras que generan el circuito. |

## Novedades de la 3.1

| | |
|---|---|
| **Fabricar una placa** | Archivo › Exportar para fabricar revisa la huella de cada pieza y escribe un proyecto de KiCad, la lista de materiales para JLCPCB y la netlist. Una guía de dieciséis pasos lleva hasta los archivos Gerber. |
| **Español e inglés** | La interfaz, las piezas, las plantillas, las calculadoras y el tutorial están en los dos idiomas. Se elige en Configuración o con `Ctrl+K`. |
| **Ayuda sin conexión** | La pestaña Ayuda reúne Aprender, Kirchi, Ayúdanos y Comunidad. La guía de uso y las novedades se abren dentro de la aplicación, sin internet. |
| **Armado estable de la protoboard** | Generar protoboard da el mismo armado cada vez, con cada etapa junta y un puente recto para cada pin de alimentación. |

El detalle completo está en el [historial de cambios](CHANGELOG.md).

## Protoboard

<div align="center"><img src="docs/imagenes/protoboard-armado.jpg" alt="Protoboard de 830 puntos con siete amplificadores TL081, resistencias con bandas de color, dos potenciómetros, dos capacitores, cables de colores y etiquetas de alimentación y de instrumentos" width="100%"><br><sub>Una computadora analógica con siete TL081, armada por Generar protoboard y exportada desde Kirchi.</sub></div>

El esquema es el plano y la protoboard es lo armado. Generar protoboard arma el circuito en la placa, con cada etapa junta, un puente recto para cada pin de alimentación y el mismo armado cada vez. Generar esquema hace el camino contrario.

- Placas de 830, 400 y 170 puntos, con piezas de aspecto real y resistencias con sus bandas de color.
- Lo que falta, sobra o hace corto se marca en la placa y se lista en Avisos.
- Se simula y se analiza la pestaña abierta, con las tiras teñidas por su voltaje.
- Con Medir, en el clic derecho, se clavan las puntas de un multímetro o un osciloscopio.
- Se exporta a PNG, SVG o PDF.

## Capturas

<table>
  <tr>
    <td width="50%"><img src="docs/imagenes/osciloscopio.png" alt="Un 555 con el osciloscopio de cuatro canales"><br><sub>Cuatro señales de un 555 a la vez, con sondas sobre el circuito.</sub></td>
    <td width="50%"><img src="docs/imagenes/simulacion.png" alt="Amplificador en emisor común con los cables coloreados por voltaje"><br><sub>El voltaje de cada cable, la corriente en movimiento y medidores rápidos.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/analisis.png" alt="Diagrama de Bode de un filtro notch de 60 Hz"><br><sub>Bode de un filtro notch de 60 Hz, con cursores.</sub></td>
    <td><img src="docs/imagenes/exportar-grafica.png" alt="Exportación de la gráfica con una anotación"><br><sub>La gráfica anotada y lista para exportar.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/exportar-esquema.png" alt="Exportación del esquema con título, flechas y números"><br><sub>El esquema con título, flechas, números y lecturas.</sub></td>
    <td><img src="docs/imagenes/calculadora.png" alt="Calculadora de filtros con el circuito generado"><br><sub>Calcula un filtro y genera su circuito con un clic.</sub></td>
  </tr>
</table>

<div align="center"><img src="docs/imagenes/tema-oscuro.png" alt="Kirchi en tema oscuro" width="70%"><br><sub>También en tema oscuro.</sub></div>

## Del circuito a la placa

El recorrido de un circuito en Kirchi, desde que se dibuja o se importa hasta que se entrega o se fabrica:

```mermaid
flowchart LR
  subgraph ENTRADA["1. Partir de"]
    direction TB
    A1["Dibujar el esquema"]
    A2["Importar<br/>Proteus, LTspice, Falstad,<br/>SPICE o KiCad"]
  end
  subgraph ARMAR["2. Armar"]
    direction TB
    B1["Esquema"]
    B2["Protoboard"]
    B1 <-->|"Generar protoboard<br/>Generar esquema"| B2
  end
  subgraph PROBAR["3. Probar"]
    direction TB
    C1["Simular en tiempo real<br/>osciloscopio y multímetro"]
    C2["Analizar con ngspice<br/>Bode, Fourier, barridos"]
  end
  subgraph SALIDA["4. Entregar o fabricar"]
    direction TB
    D1["Exportar<br/>PNG, SVG, PDF y MP4"]
    D2["Fabricar<br/>proyecto de KiCad,<br/>lista para JLCPCB y Gerber"]
  end
  A1 --> B1
  A2 --> B1
  B1 --> C1
  B2 --> C1
  B1 --> C2
  C1 --> D1
  C2 --> D1
  B1 --> D2
  classDef marca fill:#0E7C66,stroke:#0E7C66,color:#FFFFFF
  classDef grafito fill:#22252A,stroke:#22252A,color:#FFFFFF
  classDef papel fill:#F4F1EA,stroke:#22252A,color:#22252A
  classDef senal fill:#E8833A,stroke:#22252A,color:#22252A
  class A1,A2 papel
  class B1,B2 marca
  class C1,C2 grafito
  class D1,D2 senal
  style ENTRADA fill:#FFFFFF,stroke:#22252A,color:#22252A
  style ARMAR fill:#FFFFFF,stroke:#22252A,color:#22252A
  style PROBAR fill:#FFFFFF,stroke:#22252A,color:#22252A
  style SALIDA fill:#FFFFFF,stroke:#22252A,color:#22252A
```

## Qué incluye

**Editor de esquema.** Rejilla de 2.5 mm con símbolos ANSI/IEEE, 113 piezas con modelo eléctrico en nueve categorías (pasivos, fuentes, semiconductores, integrados, digitales, interruptores, indicadores, electromecánicos e instrumentos), con sensores, motores a pasos, JFET, IGBT, optoacopladores, fuentes controladas y lógica MSI (decodificadores, multiplexores, sumador, comparador, contadores y registros de desplazamiento, y el convertidor ADC0804). Los chips de varias unidades se nombran U1A, U1B y llevan el número de cada pin y cables que se enrutan solos sin atravesar piezas. Valores con unidad y series comerciales (`4k7`, `100n`), buscador de comandos con `Ctrl+K`, notas, etiquetas y deshacer.

**Protoboard.** Además del esquema, una vista de protoboard con placas de 830, 400 y 170 puntos y piezas con su aspecto real, resistencias con bandas de color incluidas. Esquema y protoboard trabajan por separado con las mismas piezas: se puede colocar, copiar y borrar en cualquiera de las dos, y Generar protoboard y Generar esquema las sincronizan en las dos direcciones. Lo que falta o difiere se marca y se lista en Avisos. Se simula y se analiza la pestaña abierta, con las tiras teñidas por su voltaje, y con Medir en el clic derecho de una pieza de la placa se clavan las puntas de un multímetro o un osciloscopio. Se exporta a PNG, SVG o PDF.

**Simulación en tiempo real.** Motor analógico y digital propio, con las mismas ecuaciones que ngspice. Ocho velocidades, de ×10 a ×0.001, avanzar y retroceder en el tiempo, perillas en vivo (potenciómetro, termistores, fotorresistencia, sensores) e interruptores que se accionan mientras corre, y avisos cuando una pieza pasa sus límites.

**Instrumentos.** Osciloscopio de cuatro canales con disparo, cursores, medidas automáticas y modo X-Y. En pausa se cambian sus escalas sobre lo ya capturado. Multímetro, generador de funciones con amplitud pico a pico, pico o rms, fuente variable y medidores rápidos con pantalla de siete segmentos.

**Análisis con ngspice 47.** Punto de operación, barrido de CD, transitorio, CA y Bode, Fourier y barrido de parámetro. Gráficas con cursores, trazas una contra otra (X-Y) y rangos que puedes escribir.

**Para la entrega.** Exporta a PNG, SVG y PDF con fondo blanco o tema oscuro, solo la selección o un área, y anotaciones que no ensucian tu circuito. Graba la ventana en video MP4, con o sin micrófono.

**Importar.** Abre circuitos de Falstad, LTspice, netlists SPICE, KiCad y Proteus como documento nuevo, con un informe de lo convertido y una caja gris para lo que no tiene equivalencia.

**Fabricar una placa.** Archivo › Exportar para fabricar revisa la huella de cada pieza y escribe un proyecto de KiCad (esquema, placa vacía y biblioteca de símbolos), la lista de materiales para JLCPCB y la netlist. Una guía de dieciséis pasos dentro de Kirchi lleva del circuito, pasando por esa exportación y por KiCad, a los archivos Gerber. La placa se dibuja en KiCad.

**Para aprender.** Tutorial «Aprende Kirchi» de cinco capítulos, quince plantillas listas para simular y seis calculadoras (divisor, LED, filtros, 555 astable y monoestable, amplificador) que muestran la ecuación con tus valores y generan el circuito.

**Asistente (opcional).** Un asistente de IA como Claude puede armar, simular y medir circuitos en Kirchi por el protocolo MCP. Viene apagado y todo ocurre en tu equipo.

**Español e inglés.** La interfaz, las piezas, el tutorial y las plantillas están en los dos idiomas. El idioma se elige en Configuración o con `Ctrl+K`.

La guía completa está en [docs/guia-de-uso.md](docs/guia-de-uso.md) ([English](docs/guia-de-uso.en.md)).

## Conectar un asistente (opcional)

Kirchi funciona sin conexión y el asistente viene apagado. Para usarlo:

1. Abre Configuración › Asistente y activa el permiso.
2. Pulsa «Copiar configuración del asistente» y pega el texto en la configuración de tu cliente MCP (Claude Desktop, Claude Code u otro). El estado de la pestaña dice «Listo. Escríbele al asistente desde tu cliente.»
3. Pídele algo, por ejemplo «arma un divisor que dé 3.3 V desde 5 V y mide la salida».

El asistente puede construir, simular, leer mediciones y exportar la imagen del circuito abierto, usar plantillas y calculadoras, guardar análisis y trazar por pin, y trabajar con los archivos de Documentos\Kirchi\Asistente. Cada paso se deshace con Ctrl+Z. Con el instalador la configuración usa la ruta completa de Kirchi y con la Microsoft Store usa el alias `kirchi`.

## Descargar e instalar

La forma más sencilla en Windows es la [Microsoft Store](https://apps.microsoft.com/detail/9pks3qd294cn). Para cualquier sistema, los instaladores están en [Releases](../../releases/latest) y en la [página de descarga](https://misaelavila49.github.io/Kirchi/).

La Microsoft Store instala y actualiza Kirchi sola. Con los archivos de Releases, los instaladores no están firmados con un certificado de pago, así que cada sistema pide una confirmación la primera vez:

| Sistema | Archivo | La primera vez |
|---|---|---|
| Windows | `Kirchi-x.y.z-Windows-instalador.exe` | SmartScreen avisa de un editor desconocido: «Más información» y «Ejecutar de todos modos». |
| Windows portátil | `Kirchi-x.y.z-Windows-portable.zip` | Se descomprime y se abre `Kirchi.exe`, sin instalar nada. |
| macOS | `Kirchi-x.y.z-macOS.dmg` | Arrastra Kirchi a Aplicaciones. Si macOS no puede verificarla, abre Ajustes del Sistema › Privacidad y seguridad y pulsa «Abrir de todos modos». Si dice que está dañada, ejecuta `xattr -cr /Applications/Kirchi.app` en la Terminal. |
| Linux | `Kirchi-x.y.z-Linux.AppImage` o `Kirchi-x.y.z-Linux.deb` | La AppImage necesita permiso de ejecución (`chmod +x`). |

Los circuitos se guardan en archivos `.kir`, que se abren con doble clic.

## Cómo funciona

Kirchi es una aplicación de Electron con la interfaz en SolidJS y un lienzo WebGL2 propio. La simulación en tiempo real corre en un motor escrito en Rust, compilado a WebAssembly, dentro de un Web Worker que comparte memoria con la interfaz. Los análisis formales los resuelve ngspice como un proceso aparte.

```mermaid
flowchart TB
  subgraph ELECTRON["Aplicación de escritorio (Electron)"]
    direction TB
    subgraph UI["Interfaz (SolidJS)"]
      direction LR
      U1["Editor y paneles"]
      U2["Lienzo WebGL2<br/>esquema y protoboard"]
      U3["Instrumentos,<br/>gráficas y análisis"]
    end
    subgraph WK["Web Worker"]
      direction LR
      W1["Motor en Rust<br/>compilado a WASM<br/>analógico y digital"]
    end
    MAIN["Proceso principal<br/>archivos, ventanas y diálogos"]
  end
  NG["ngspice 47<br/>proceso aparte"]
  AI["Asistente de IA (opcional)<br/>protocolo MCP, apagado por omisión"]
  UI <-->|"memoria compartida"| WK
  UI <--> MAIN
  MAIN -->|"netlist"| NG
  NG -->|"resultados"| MAIN
  AI -.->|"MCP"| MAIN
  classDef marca fill:#0E7C66,stroke:#0E7C66,color:#FFFFFF
  classDef grafito fill:#22252A,stroke:#22252A,color:#FFFFFF
  classDef papel fill:#F4F1EA,stroke:#22252A,color:#22252A
  classDef senal fill:#E8833A,stroke:#22252A,color:#22252A
  class U1,U2,U3 papel
  class W1 marca
  class MAIN grafito
  class NG,AI senal
  style ELECTRON fill:#FFFFFF,stroke:#22252A,color:#22252A
  style UI fill:#FFFFFF,stroke:#0E7C66,color:#22252A
  style WK fill:#FFFFFF,stroke:#0E7C66,color:#22252A
```

## Apoyar a Kirchi

Kirchi es gratuito. Si te sirve, puedes apoyar su desarrollo con una aportación voluntaria, en [GitHub Sponsors](https://github.com/sponsors/MisaelAvila49), [PayPal](https://paypal.me/MisaelAvila49) o [Mercado Pago](https://link.mercadopago.com.mx/kirchi). No desbloquea nada: todas las funciones son iguales para todas las personas.

## Licencia

Kirchi es gratuito y se usa con sus [términos de uso](LICENSE): puedes usarlo y compartir los instaladores oficiales sin cobrar, pero no venderlo ni distribuir copias modificadas. El código de Kirchi no es público desde la versión 3.1.1; las versiones hasta la 3.0.0 se publicaron con la licencia MIT y la 3.1.0 con Apache 2.0, y siguen bajo esas licencias. ngspice, las fuentes tipográficas y las demás dependencias conservan sus propias licencias, que se reúnen en [docs/licencias-terceros.md](docs/licencias-terceros.md) y se muestran en «Acerca de»; el código fuente que sus licencias piden se entrega con cada versión. Kirchi no envía datos: [aviso de privacidad](https://gist.github.com/MisaelAvila49/26b174fbe0fbfba7ef4c4176b3a25404).

Hecho por Misael Saúl Avila López · [misaelavila49@gmail.com](mailto:misaelavila49@gmail.com)
