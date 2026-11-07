<div align="center">

[Español: README.md](README.md)

<img src="build/icon.png" alt="" width="96" height="96">

# Kirchi

**The circuit simulator you wish you had had in college.**

Build the circuit, press F5 and watch it work. Free, offline, no account, in English and Spanish.

[![Get it from the Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Get%20it-0E7C66?style=for-the-badge&logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9pks3qd294cn)
[![Download for Windows, macOS and Linux](https://img.shields.io/badge/Releases-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-22252A?style=for-the-badge&logo=github&logoColor=white)](../../releases/latest)
[![Download page](https://img.shields.io/badge/Page-Download-22252A?style=for-the-badge&logo=githubpages&logoColor=white)](https://misaelavila49.github.io/Kirchi/en/)

[![Free to use](https://img.shields.io/badge/use-free-0E7C66.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.1.1-0E7C66.svg)](CHANGELOG.en.md)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

<img src="docs/imagenes/portada.jpg" alt="Kirchi with an analog computer made of seven TL081 operational amplifiers: the schematic on the left, the same computer built on the breadboard on the right and, below, the oscilloscope with the input signal and the response" width="100%">

<p><a href="#whats-new-in-31">What is new</a> · <a href="#breadboard">Breadboard</a> · <a href="#screenshots">Screenshots</a> · <a href="#download-and-install">Download</a> · <a href="#how-it-works">How it works</a> · <a href="docs/guia-de-uso.en.md">User guide</a></p>

<a href="https://www.youtube.com/watch?v=UEJBj35t4yg"><img src="docs/imagenes/trailer-en.jpg" alt="Watch the Kirchi trailer on YouTube: video thumbnail with its title" width="70%"></a><br><sub><a href="https://www.youtube.com/watch?v=UEJBj35t4yg">Watch the trailer (YouTube)</a></sub>

</div>

## Why Kirchi

Kirchi is a desktop circuit simulator for studying electronics: you draw the schematic on a grid, simulate in real time and measure as in the lab, with an oscilloscope, a multimeter and formal analyses with ngspice.

| | |
|---|---|
| **Free** | No expiring trials, no ads and no paid features. |
| **No internet, no account** | Everything happens on your computer. No data is sent. |
| **See it work** | Wires are colored by voltage, current moves through every branch, LEDs light up and parts burn out when they exceed their maximum. |
| **Measure like in the lab** | Four-channel oscilloscope with probes and X-Y mode, multimeter, function generator, variable power supply and quick meters on any wire. |
| **Real analysis** | ngspice is included: operating point, DC sweep, transient, Bode, Fourier and parameter sweep. |
| **Ready for your report** | Export schematics and plots to PNG, SVG or PDF with titles, arrows, numbered callouts and readings. |
| **Easy to learn** | Interface in English and Spanish, an in-app tutorial, templates and calculators that build the circuit. |

## What is new in 3.1

| | |
|---|---|
| **Make a board** | File › Export for manufacturing checks the footprint of every part and writes a KiCad project, the bill of materials for JLCPCB and the netlist. A sixteen-step guide takes you to the Gerber files. |
| **English and Spanish** | The interface, the parts, the templates, the calculators and the tutorial are in both languages. You choose it in Settings or with `Ctrl+K`. |
| **Offline help** | The Help tab groups Learn, Kirchi, Support us and Community. The user guide and the release notes open inside the application, with no internet. |
| **Stable breadboard layout** | Build breadboard gives the same layout every time, with each stage kept together and a straight jumper for every power pin. |

The full detail is in the [changelog](CHANGELOG.en.md).

## Breadboard

<div align="center"><img src="docs/imagenes/protoboard-armado.jpg" alt="An 830-point breadboard with seven TL081 amplifiers, color-banded resistors, two potentiometers, two capacitors, colored wires and power and instrument labels" width="100%"><br><sub>An analog computer with seven TL081, laid out by Build breadboard and exported from Kirchi.</sub></div>

The schematic is the blueprint and the breadboard is what gets built. Build breadboard lays the circuit out on the board, with each stage kept together, a straight jumper for every power pin and the same layout every time. Build schematic goes the other way.

- Boards of 830, 400 and 170 points, with parts that look like the real thing and resistors with their color bands.
- Whatever is missing, extra or shorted is marked on the board and listed in Warnings.
- The open tab is what gets simulated and analyzed, with the strips tinted by their voltage.
- With Measure, in the right-click menu, you plug in the probes of a multimeter or an oscilloscope.
- It exports to PNG, SVG or PDF.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/imagenes/osciloscopio.png" alt="A 555 with the four-channel oscilloscope"><br><sub>Four signals from a 555 at once, with probes on the circuit.</sub></td>
    <td width="50%"><img src="docs/imagenes/simulacion.png" alt="Common-emitter amplifier with wires colored by voltage"><br><sub>The voltage on every wire, current in motion and quick meters.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/analisis.png" alt="Bode plot of a 60 Hz notch filter"><br><sub>Bode plot of a 60 Hz notch filter, with cursors.</sub></td>
    <td><img src="docs/imagenes/exportar-grafica.png" alt="Plot export with an annotation"><br><sub>The annotated plot, ready to export.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/imagenes/exportar-esquema.png" alt="Schematic export with title, arrows and numbers"><br><sub>The schematic with title, arrows, numbers and readings.</sub></td>
    <td><img src="docs/imagenes/calculadora.png" alt="Filter calculator with the generated circuit"><br><sub>Calculate a filter and build its circuit with one click.</sub></td>
  </tr>
</table>

<div align="center"><img src="docs/imagenes/tema-oscuro.png" alt="Kirchi in dark theme" width="70%"><br><sub>Also in dark theme.</sub></div>

## From circuit to board

The path of a circuit in Kirchi, from drawing or importing it to delivering or manufacturing it:

```mermaid
flowchart LR
  subgraph ENTRADA["1. Start from"]
    direction TB
    A1["Draw the schematic"]
    A2["Import<br/>Proteus, LTspice, Falstad,<br/>SPICE or KiCad"]
  end
  subgraph ARMAR["2. Build"]
    direction TB
    B1["Schematic"]
    B2["Breadboard"]
    B1 <-->|"Build breadboard<br/>Build schematic"| B2
  end
  subgraph PROBAR["3. Test"]
    direction TB
    C1["Simulate in real time<br/>oscilloscope and multimeter"]
    C2["Analyze with ngspice<br/>Bode, Fourier, sweeps"]
  end
  subgraph SALIDA["4. Deliver or manufacture"]
    direction TB
    D1["Export<br/>PNG, SVG, PDF and MP4"]
    D2["Make a board<br/>KiCad project,<br/>JLCPCB list and Gerber"]
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

## What is included

**Schematic editor.** A 2.5 mm grid with ANSI/IEEE symbols and 113 parts with an electrical model in nine categories (passives, sources, semiconductors, integrated circuits, digital, switches, indicators, electromechanical and instruments), with sensors, stepper motors, JFETs, IGBTs, optocouplers, controlled sources and MSI logic (decoders, multiplexers, adder, comparator, counters and shift registers, and the ADC0804 converter). Multi-unit chips are named U1A, U1B and show the number of each pin, and wires route themselves without crossing parts. Values with units and standard series (`4k7`, `100n`), a command search with `Ctrl+K`, notes, labels and undo.

**Breadboard.** Besides the schematic, a breadboard view with 830, 400 and 170-point boards and parts that look like the real thing, with color-banded resistors included. The schematic and the breadboard work separately with the same parts: you can place, copy and delete in either one, and Build breadboard and Build schematic sync them in both directions. Whatever is missing or differs is marked and listed in Warnings. The open tab is what gets simulated and analyzed, with the strips tinted by their voltage, and with Measure in the right-click menu of a board part you plug in the probes of a multimeter or an oscilloscope. It exports to PNG, SVG or PDF.

**Real-time simulation.** Our own analog and digital engine, with the same equations as ngspice. Eight speeds, from ×10 to ×0.001, stepping forward and back in time, live knobs (potentiometer, thermistors, photoresistor, sensors) and switches you can operate while it runs, and warnings when a part exceeds its limits.

**Instruments.** Four-channel oscilloscope with trigger, cursors, automatic measurements and X-Y mode. While paused you can change its scales over what was already captured. Multimeter, function generator with peak-to-peak, peak or rms amplitude, variable power supply and quick meters with a seven-segment display.

**Analysis with ngspice 47.** Operating point, DC sweep, transient, AC and Bode, Fourier and parameter sweep. Plots with cursors, traces against each other (X-Y) and ranges you can type.

**For your assignments.** Export to PNG, SVG and PDF with a white background or dark theme, only the selection or an area, and annotations that do not clutter your circuit. Record the window as an MP4 video, with or without a microphone.

**Import.** Open circuits from Falstad, LTspice, SPICE netlists, KiCad and Proteus as a new document, with a report of what was converted and a gray box for anything with no equivalent.

**Make a board.** File › Export for manufacturing checks the footprint of every part and writes a KiCad project (schematic, empty board and symbol library), the bill of materials for JLCPCB and the netlist. A sixteen-step guide inside Kirchi takes you from the circuit, through that export and KiCad, to the Gerber files. You draw the board in KiCad.

**To learn.** The “Learn Kirchi” tutorial with five chapters, fifteen templates ready to simulate and six calculators (divider, LED, filters, 555 astable and monostable, amplifier) that show the equation with your values and build the circuit.

**English and Spanish.** The interface, the parts, the tutorial and the templates are available in both languages. You choose the language in Settings or with `Ctrl+K`.

**Assistant (optional).** An AI assistant such as Claude can build, simulate and measure circuits in Kirchi over the MCP protocol. It comes turned off and everything happens on your machine.

The full guide is at [docs/guia-de-uso.en.md](docs/guia-de-uso.en.md) ([Español](docs/guia-de-uso.md)).

## Connect an assistant (optional)

Kirchi works offline and the assistant comes turned off. To use it:

1. Open Settings › Assistant and turn on the permission.
2. Click “Copy the assistant settings” and paste the text into the settings of your MCP client (Claude Desktop, Claude Code or another). The tab status reads “Ready. Write to the assistant from your client.”
3. Ask it for something, for example “build a divider that gives 3.3 V from 5 V and measure the output”.

The assistant can build, simulate, read measurements and export the image of the open circuit, use templates and calculators, save analyses and plot by pin, and work with the files in Documents\Kirchi\Asistente. Every step can be undone with Ctrl+Z. With the installer the settings use the full path to Kirchi, and with the Microsoft Store they use the `kirchi` alias.

## Download and install

The easiest way on Windows is the [Microsoft Store](https://apps.microsoft.com/detail/9pks3qd294cn). For any system, the installers are on [Releases](../../releases/latest) and on the [download page](https://misaelavila49.github.io/Kirchi/en/).

The Microsoft Store installs and updates Kirchi by itself. With the files from Releases, the installers are not signed with a paid certificate, so each system asks for a confirmation the first time:

| System | File | The first time |
|---|---|---|
| Windows | `Kirchi-x.y.z-Windows-instalador.exe` | SmartScreen warns about an unknown publisher: “More info” and “Run anyway”. |
| Windows portable | `Kirchi-x.y.z-Windows-portable.zip` | Unzip it and open `Kirchi.exe`, with nothing to install. |
| macOS | `Kirchi-x.y.z-macOS.dmg` | Drag Kirchi to Applications. If macOS cannot verify it, open System Settings › Privacy & Security and click “Open Anyway”. If it says the app is damaged, run `xattr -cr /Applications/Kirchi.app` in Terminal. |
| Linux | `Kirchi-x.y.z-Linux.AppImage` or `Kirchi-x.y.z-Linux.deb` | The AppImage needs execute permission (`chmod +x`). |

Circuits are saved in `.kir` files, which open with a double click.

## How it works

Kirchi is an Electron application with the interface in SolidJS and its own WebGL2 canvas. The real-time simulation runs in an engine written in Rust, compiled to WebAssembly, inside a Web Worker that shares memory with the interface. Formal analyses are solved by ngspice as a separate process.

```mermaid
flowchart TB
  subgraph ELECTRON["Desktop application (Electron)"]
    direction TB
    subgraph UI["Interface (SolidJS)"]
      direction LR
      U1["Editor and panels"]
      U2["WebGL2 canvas<br/>schematic and breadboard"]
      U3["Instruments,<br/>plots and analysis"]
    end
    subgraph WK["Web Worker"]
      direction LR
      W1["Rust engine<br/>compiled to WASM<br/>analog and digital"]
    end
    MAIN["Main process<br/>files, windows and dialogs"]
  end
  NG["ngspice 47<br/>separate process"]
  AI["AI assistant (optional)<br/>MCP protocol, off by default"]
  UI <-->|"shared memory"| WK
  UI <--> MAIN
  MAIN -->|"netlist"| NG
  NG -->|"results"| MAIN
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

## Support Kirchi

Kirchi is free. If it is useful to you, you can support its development with a voluntary contribution, on [GitHub Sponsors](https://github.com/sponsors/MisaelAvila49), [PayPal](https://paypal.me/MisaelAvila49) or [Mercado Pago](https://link.mercadopago.com.mx/kirchi). It does not unlock anything: every feature is the same for everyone.

## License

Kirchi is free of charge and is used under its [terms of use](LICENSE): you may use it and share the official installers without charging for them, but not sell it or distribute modified copies. Kirchi's source code is not public since version 3.1.1; versions up to 3.0.0 were published under the MIT license and 3.1.0 under Apache 2.0, and they remain under those licenses. ngspice, the typefaces and the other dependencies keep their own licenses, which are collected in [docs/licencias-terceros.md](docs/licencias-terceros.md) and shown in “About”; the source code their licenses require is provided with each release. Kirchi sends no data: [privacy notice](https://gist.github.com/MisaelAvila49/26b174fbe0fbfba7ef4c4176b3a25404).

Made by Misael Saúl Avila López · [misaelavila49@gmail.com](mailto:misaelavila49@gmail.com)
