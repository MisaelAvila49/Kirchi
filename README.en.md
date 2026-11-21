<div align="center">

<img src="build/icon.png" alt="" width="96" height="96">

# Kirchi

**Free, offline circuit simulator**

Watch the voltage on every wire and the signal on a four-channel oscilloscope while it runs.<br>
Open your circuits from Proteus, LTspice, KiCad or Falstad. In English or Spanish, with no internet and no account.

[![Get it from the Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Get%20it-0E7C66?style=for-the-badge&logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9pks3qd294cn)
[![Download at kirchi.app](https://img.shields.io/badge/Download-kirchi.app-0E7C66?style=for-the-badge)](https://kirchi.app/en/)
[![Releases on GitHub](https://img.shields.io/badge/GitHub-Releases-22252A?style=for-the-badge&logo=github&logoColor=white)](../../releases/latest)

[![Version 3.2.0](https://img.shields.io/badge/version-3.2.0-0E7C66)](CHANGELOG.en.md)
[![Windows, macOS and Linux](https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-22252A)](#download-and-install)
[![Free to use](https://img.shields.io/badge/use-free-0E7C66)](LICENSE)

[Español: README.md](README.md)

<img src="docs/imagenes/lienzo-limpio-en.webp" alt="Kirchi simulating a 555 that blinks an LED in Both: on the left the schematic with the voltage of every net and probes A, B, C and D, on the right the same breadboard with one value label per net and, at the bottom right, the floating oscilloscope with four signals" width="100%">

<a href="https://www.youtube.com/watch?v=X_N-icyevDk"><img src="docs/imagenes/contador-0-99-en.webp" alt="Watch the video about what is new in Kirchi 3.2 on YouTube: a 0 to 99 counter with two seven-segment displays, running on two 830-point breadboards" width="72%"></a><br>
<sub><a href="https://www.youtube.com/watch?v=X_N-icyevDk">Watch what is new in 3.2 on YouTube</a></sub>

<p>
<a href="#simulate-and-see-the-voltage-on-every-wire">Simulate</a> ·
<a href="#build-the-breadboard-step-by-step">Breadboard</a> ·
<a href="#measure-like-in-the-lab">Instruments</a> ·
<a href="#analyze-with-ngspice">Analysis</a> ·
<a href="#open-circuits-from-proteus-kicad-ltspice-and-falstad">Import</a> ·
<a href="#export-for-manufacturing-and-for-your-report">Export</a> ·
<a href="#download-and-install">Download</a> ·
<a href="#what-is-new-in-32">What is new</a> ·
<a href="docs/guia-de-uso.en.md">User guide</a>
</p>

Free · No account · Offline, no data sent · English and Spanish · Windows, macOS and Linux

</div>

## Simulate and see the voltage on every wire

Press F5 and the circuit runs: wires are colored by voltage and current moves through every branch. The arrow next to Simulate chooses whether the schematic or the breadboard is simulated. There are eight speeds, from ×10 to ×0.001, and knobs, switches and keypads work while it runs.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/imagenes/voltajes-esquema-en.webp" alt="A common-emitter amplifier with a 2N2222 running: labels with the voltage of every net, the XFG1 generator at the input and two DC multimeters reading 1.995 V and 9.060 V"><br><sub>The voltage of every net on the schematic, with two multimeters.</sub></td>
    <td width="50%" valign="top"><img src="docs/imagenes/valor-por-red-en.webp" alt="A 555 with an LED running on an 830-point breadboard: rails tinted by their voltage, one value label per net, the C1 net marked with 2.50 V under the pointer and the oscilloscope below with four signals"><br><sub>On the breadboard, each net shows a single value and the net under the pointer marks its holes.</sub></td>
  </tr>
</table>

## Build the breadboard step by step

Generate breadboard lays the schematic out on an 830, 400 or 170-point breadboard, with parts that look like the real thing and resistors with their color bands, and Generate schematic goes the other way. Build step by step shows how to build it on your desk: first the chips, then the jumpers to the rails, the resistors and capacitors, the potentiometers and finally the signal wires, one at a time and in the order the signal follows, with the coordinates of their two holes.

With a right click, Change breadboards offers other combinations and marks the suggested one, and Spread over these breadboards builds the circuit on the ones you already placed. Whatever is missing, extra or shorted is marked on the breadboard and listed in Warnings.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/imagenes/armar-cables-en.webp" alt="Build step by step on a 555 breadboard: the panel reads Step 11 of 12, Wire 1 of 7, lists the wires of the NE555 stage with their holes, and the breadboard marks the yellow wire from b15 to b20"><br><sub>Build step by step, on the signal wires of the 555 stage.</sub></td>
    <td width="50%" valign="top"><img src="docs/imagenes/cambiar-protoboards-en.webp" alt="A counter on two 830-point breadboards with the right-click menu open on Change breadboards: “Two 830-point breadboards” reads “current, suggested”, the ones that do not fit say how many columns are short and the 170-point one says “only without ICs”"><br><sub>Change breadboards says which one fits best and why the others do not fit.</sub></td>
  </tr>
</table>

## Measure like in the lab

Four-channel oscilloscope with trigger, cursors, automatic measurements and X-Y mode, multimeter, function generator and variable power supply. With right click › Measure you place probes on any wire, and on the clean canvas the oscilloscope sits in a floating panel.

<div align="center"><img src="docs/imagenes/osciloscopio-555-en.webp" alt="A 555 astable on the schematic with probes A, B, C and D, and below the four-channel oscilloscope in roll mode with its four signals, a Vpp of 3.558 V and a frequency of 673.8 Hz" width="100%"><br><sub>The four signals of a 555 at once, with their probes on the schematic.</sub></div>

## Analyze with ngspice

<table>
  <tr>
    <td width="40%" valign="top">ngspice 47 is included and solves operating point, DC sweep, transient, AC and Bode, Fourier and parameter sweep.<br><br>Plots have cursors, traces against each other (X-Y) and ranges you can type.</td>
    <td width="60%" valign="top"><img src="docs/imagenes/bode-notch-en.webp" alt="Bode plot of a 60 Hz notch filter, from 10 Hz to 1 MHz: the output magnitude drops near 60 Hz and the phase is drawn as a dashed line"><br><sub>Bode plot of a 60 Hz notch filter.</sub></td>
  </tr>
</table>

## Open circuits from Proteus, KiCad, LTspice and Falstad

Import opens projects from Proteus 8 and 9, LTspice, KiCad 7 to 9, Falstad and SPICE netlists as a new document. A report says what was approximated, and anything with no equivalent comes in as a gray box.

<div align="center"><img src="docs/imagenes/importar-proteus-en.webp" alt="A circuit with four TL081 imported from Proteus 8.13: the schematic at the top, the report on the right with two parts with an approximate model and one converted transient analysis, and the oscilloscope running below" width="100%"><br><sub>A Proteus project opened in Kirchi, with its import report.</sub></div>

## Export for manufacturing and for your report

File › Export for manufacturing checks the KiCad footprint of every part and writes a KiCad project, the bill of materials for JLCPCB and the netlist. A sixteen-step guide takes you from there to the Gerber files, and the board is drawn in KiCad.

For your report, the schematic, the breadboard and the plots export to PNG, SVG or PDF, and the window records to MP4 video, with an oscilloscope open in its own window included in the video.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/imagenes/exportar-fabricar-en.webp" alt="The Export for manufacturing dialog, step 1 of 2: D1 with the LED D5.0mm footprint and its pin order, R1 with an axial footprint and the V1 source replaced by a connector"><br><sub>The footprint and destination of every part before exporting to KiCad.</sub></td>
    <td width="50%" valign="top"><img src="docs/imagenes/esquema-pdf-en.webp" alt="The schematic of a 555 astable with an LED, exported to PDF on a white background"><br><sub>The schematic exported to PDF.</sub></td>
  </tr>
</table>

## Start from a template

<table>
  <tr>
    <td width="60%" valign="top"><img src="docs/imagenes/plantillas-en.webp" alt="The Templates panel with the 15 included ones, among them the 555 astable, the 555 monostable, the common-emitter, inverting and non-inverting amplifiers and the 0 to 99 counter, and the 555 astable placed on the schematic"></td>
    <td width="40%" valign="top">Fifteen circuits ready to simulate, from the voltage divider to the 555.<br><br>Six calculators show the equation with your values, pick commercial values and place the circuit. Whatever you build can be kept as your own template with Save selection.</td>
  </tr>
</table>

## An AI assistant, if you want one

<table>
  <tr>
    <td width="45%" valign="top">An assistant like Claude can build, simulate and measure in Kirchi through the MCP protocol. It comes turned off and everything happens on your computer.
      <ol>
        <li>Open Settings › Assistant and turn on the permission.</li>
        <li>Click “Copy the assistant settings” and paste the text into your MCP client (Claude Desktop, Claude Code or another).</li>
        <li>Ask it for something, for example “build a divider that gives 3.3 V from 5 V and measure the output”.</li>
      </ol>
      Every step can be undone with Ctrl+Z.</td>
    <td width="55%" valign="top"><img src="docs/imagenes/asistente-en.webp" alt="Settings › Assistant: the “Allow an assistant to control Kirchi” switch turned off, the status Not connected, the Kirchi › Assistant folder and the Copy the assistant settings button"></td>
  </tr>
</table>

## English and Spanish, offline

The interface, the parts, the templates, the calculators, the tutorial and the user guide are in English and Spanish. You choose the language in Settings (Automatic follows the system) or with Ctrl+K › Change language, and it changes right away. Kirchi needs no internet and no account, sends no data, and its Windows installer weighs less than 100 MB.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/imagenes/armar-paso-1-es.webp" alt="Build step by step in Spanish, on step 1 of 12: “Coloca el temporizador NE555 sobre el canal central, con la muesca a la izquierda.”"><br><sub>Español</sub></td>
    <td width="50%" valign="top"><img src="docs/imagenes/armar-paso-1-en.webp" alt="The same screen in English, on step 1 of 12: “Place the timer NE555 across the center channel, with the notch on the left.”"><br><sub>English</sub></td>
  </tr>
</table>

## Download and install

The easiest way on Windows is the [Microsoft Store](https://apps.microsoft.com/detail/9pks3qd294cn), which installs and updates Kirchi by itself. For any system, the files are on the [download page](https://kirchi.app/en/) and on [Releases](../../releases/latest). Those installers are not signed with a paid certificate, so each system asks for a confirmation the first time:

| System | File | The first time |
|---|---|---|
| Windows 10 and 11 | `Kirchi-x.y.z-Windows-instalador.exe` | SmartScreen warns about an unknown publisher: “More info” and “Run anyway”. |
| Windows portable | `Kirchi-x.y.z-Windows-portable.zip` | Unzip it and open `Kirchi.exe`, with nothing to install. |
| macOS | `Kirchi-x.y.z-macOS.dmg` (universal) | Drag Kirchi to Applications and the first time use right click › Open. If macOS cannot verify it, open System Settings › Privacy & Security and click “Open Anyway”. If it says the app is damaged, run `xattr -cr /Applications/Kirchi.app` in Terminal. |
| Linux | `Kirchi-x.y.z-Linux.AppImage` or `Kirchi-x.y.z-Linux.deb` | The AppImage needs execute permission (`chmod +x`). The `.deb` package is for Debian and Ubuntu. |

Circuits are saved in `.kir` files, which open with a double click. The [user guide](docs/guia-de-uso.en.md) explains every feature.

## What is new in 3.2

- **Build step by step** shows how to build the breadboard on your desk, with the signal wires one at a time and in signal order.
- **Change breadboards** offers one or two breadboards of 830, 400 or 170 points and marks the suggested combination, and **Spread over these breadboards** builds the circuit on the ones you already placed.
- **One value per net** on the breadboard, and voltage colors take their scale from the signals: a small voltage now shows its color.
- **Simulate** chooses with its arrow whether the schematic or the breadboard is simulated.
- **Clean canvas** with a collapsible bar and the oscilloscope in a floating panel, which also goes into the recording.
- **Proteus import** brings 19 new parts: in the test projects the gray boxes drop from 417 to 223.
- The whole interface says “breadboard”, and “board” is kept for the printed circuit board.

The full detail is in the [changelog](CHANGELOG.en.md).

## Suggestions

What is your simulator missing? Tell me what gets in your way in Proteus, KiCad, LTspice or the program you use, and what you would like Kirchi to have, at [kirchi.app/en/sugerencias](https://kirchi.app/en/sugerencias).

## Support Kirchi

Kirchi is free and you can use all of it without paying anything. If it is useful to you, you can contribute so it keeps being maintained, on [GitHub Sponsors](https://github.com/sponsors/MisaelAvila49), [PayPal](https://paypal.me/MisaelAvila49) or [Mercado Pago](https://link.mercadopago.com.mx/kirchi). It is optional and unlocks nothing: every feature is the same for everyone.

## License and third-party notices

Kirchi is free to use under its [terms of use](LICENSE): you may use it and share the official installers without charging for them, but not sell it or distribute modified copies. Its source code is not public since version 3.1.1. Versions up to 3.0.0 were published under the MIT license and 3.1.0 under Apache 2.0, and they remain under those licenses.

Analyses are solved by ngspice 47, which Kirchi runs as a separate program, in its own process and without linking it, built from the official source without changes. Each Release publishes `Kirchi-X.Y.Z-fuentes-de-terceros.zip` with the source code of ngspice 47 and of the `faer` crate, along with their SHA-256 sums. KiCad does not ship with Kirchi: Export for manufacturing writes files that open in KiCad, which is installed separately. Electron, Chromium, the typefaces and the other libraries keep their own licenses, which ship with the app, are shown in “About” and are collected in [docs/licencias-terceros.md](docs/licencias-terceros.md). Kirchi sends no data: [privacy notice](https://gist.github.com/MisaelAvila49/26b174fbe0fbfba7ef4c4176b3a25404).

## Contact

Made by Misael Saúl Avila López · [misaelavila49@gmail.com](mailto:misaelavila49@gmail.com)
