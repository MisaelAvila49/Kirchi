# Changelog

The same history in Spanish is in [CHANGELOG.md](CHANGELOG.md).

## 3.1.2

Opens Proteus 9 projects, lights both views when simulating in Both, and brings a user guide and release notes that are easier to read.

### New

- Import opens Proteus 8.15 to 9.1 projects, including autosaved copies ("[Autosaved]"). A component decomposed on the sheet (loose pins without a device) comes in as a gray box with its pin names, and its wires keep their connections.
- More Proteus parts arrive as Kirchi parts instead of gray boxes: resistors, capacitors and inductors with manufacturer names, 1N400x diodes, push button, clock, logic probe, D flip-flop, buffer, motors, sounder, seven-segment displays, oscilloscope and generator, and the 74157, 74LS283, 74148 and 4075 chips. Approximated ones are listed in the report.
- A digital-only Proteus circuit, which has no ground in Proteus, gets one when imported and the report says so.
- If a file cannot be read, the message says why and which Proteus version it comes from, instead of only "no parts".

### Design

- The user guide is read by sections: an index with search on one side, one section per screen with its progress, topics as cards, and Previous and Next.
- The release notes show one version at a time, with your version marked and a tab per kind of change.

### Changes

- In Both, when the schematic and the breadboard are the same circuit, both views show the simulation whatever the source. If they differ, the other view is dimmed with a notice that says how many differences there are.
- Knobs, switches and buttons can also be operated from the breadboard while simulating.

### Fixes

- With the English interface, the oscilloscope roll mode, the Bode axes, the Export for manufacturing notes, the pulse source, the calculators' Input and Output and the analysis labels no longer show Spanish text.
- Generic Proteus gates no longer cross their output with an input, and the imported 74148 no longer joins different nets.

## 3.1.1

Kirchi is still free, now under the terms of use of a closed-source program, and the English interface no longer shows Spanish text.

### Changes

- Kirchi is used under its terms of use (LICENSE file, also in "About"): it is free and the official installers may be shared without charging for them, but it may not be sold or distributed in modified form. Its source code is no longer public. Versions up to 3.0.0 were published under MIT and 3.1.0 under Apache 2.0, and they remain under those licenses. Third-party components keep their own licenses and their source code is provided with each release.
- The download page has a way to Support Kirchi in the top bar, on the cover and on phones, and a new support section with PayPal, Mercado Pago and GitHub Sponsors.
- The release notes on GitHub include their changes and an English version.

### Fixes

- Texts that still showed in Spanish with the interface in English (import report, breadboard menu, table, oscilloscope and status bar) are now translated.

## 3.1.0

Export your schematic to make a board, and Kirchi in English. From this version on Kirchi is distributed under Apache 2.0, with its NOTICE file in the package, in “About”, in the README and on the download page. Versions up to 3.0.0 remain under MIT.

### New

- File › Export for manufacturing checks every part before exporting: its KiCad footprint, the pin map (the number of each footprint pin with its name in Kirchi) and which net the power of each IC goes to. A part without a footprint blocks the export and says what it lacks, and you can change the footprint, mark a part as a connector or leave it out. Transistors in TO-92, TO-220 or SOT-23 packages carry a warning about the order of their pins.
- The export writes a KiCad project (schematic, an empty board with JLCPCB's rules and a symbol library), the bill of materials for JLCPCB as a `.csv`, or only the netlist. Everything goes into a subfolder named after the project, which never overwrites another one, and the dialog asks for the name if the circuit is not saved.
- Help › Learn › Make a board opens a sixteen-step guide, with a picture for each step, to get from your circuit in Kirchi, through KiCad, to the Gerber files and their zip for JLCPCB. Manufacture and the guide have their own button in the ribbon.
- The Help tab has four groups: Learn, Kirchi, Help us and Community. The user guide and the changelog open inside Kirchi, without internet and in the language of the app. Examples, Shortcuts and “Go to the tutorial” leave the ribbon: Shortcuts stays in the title row and F1 moves to the running tutorial.
- Kirchi is available in Spanish and English. You choose the language in Settings (Automatic follows the system language) and with Ctrl+K › “Change language”, and it changes right away.
- The parts, templates, calculators and the “Learn Kirchi” tutorial are also in English, along with the warnings and dialogs.
- The download page and the documents (README, user guide and changelog) have an English version.
- `.kir` format 12: it saves how each part is made (connector, left out or chosen footprint). An older file opens the same, and one that does not use this is still saved as before.
- The breadboard tutorial shades the place of each step and places the instrument probe before simulating.
- Exporting the breadboard has its own options and asks “Which view” first.
- Contact opens a dialog to copy the email address or open it in Gmail, Outlook on the web or the mail app, and a link that fails to open shows it. “Copy error details” includes the last five errors even if they were already closed.
- Support Kirchi: a section in the README and on the download page, with the links to do it.

### Changes

- The bill of materials is written in ASCII and neutralizes Excel formulas in its cells.
- The labels of KiCad symbols no longer overlap between neighboring pins, and loose terminals and spare rails carry “no connection”.
- A text checker finds what is still missing from the translation.
- Build breadboard gives the same layout every time you generate the same circuit, even after deleting the schematic and pasting it again, and removes what was left from the previous run.
- Build breadboard keeps each stage together around its IC, with the spare room between stages, no diagonal wires and a straight jumper of its own for every power pin.
- Build breadboard puts nothing in the strip of a pin the circuit does not use (offset adjust, NC or the other unit of the chip), and gives the pins that go to a rail, such as LT and BI of a decoder, their jumper.
- A part or a wire in the strip of an unused pin shows up in Warnings and gets a yellow ring.
- The yellow halo of an extra connection marks only the wire or pin that causes it, not the whole chain of jumpers.
- Moving the end of a bent wire redraws its bend, so no diagonal segment is left.
- MP4 recordings are saved with their duration, so players and editors show the right time and the clips can be trimmed.
- Unused probes of an instrument are left out of the file.
- Curved wires are drawn above straight ones.
- The multimeter has COM on ground.
- Measure says why it does nothing while the preview is running.

### Fixes

- “Build breadboard” no longer gets stuck on “Calculating changes…” when it fails: it shows the reason and warns.
- Uncaught errors are logged trimmed, so a very long trace does not fill the log.
- On Windows, Kirchi no longer goes blank in full screen while a program such as NVIDIA App records the screen.

## 3.0.0

The circuit is built on a breadboard next to its schematic: the schematic is the plan and the breadboard is what gets built. Each view works on its own with the same parts, they sync in both directions, the open tab is what gets simulated and analyzed, and differences are marked. Warnings move to a tab of their own.

### New

- Schematic, Breadboard and Both tabs over the canvas. In Both each view is framed on its own and has its own selection, with a draggable divider. F, Fit and the zoom of the bar act on the view of the last click. The tabs collapse to a button with the icon and name of the current view, and the setting is remembered.
- A part can exist only on the breadboard and a note can belong to the breadboard. The schematic does not draw, connect or simulate what lives only on the board, and Warnings lists it in gray. Deleting in the schematic a part that is already built leaves it on the breadboard, and Del on the breadboard sends back to the table the part that is also in the schematic, or deletes the one that lives only there.
- Editing on the breadboard: the Part tool, the Library and the search place parts on the board, and so do Ground, Power, Note and Wire. There is rectangle selection and `Shift`, cut, copy, paste, duplicate and rotate as a group, and `Esc` or right-click cancel the tool.
- Boards of 830, 400 and 170 points, one or several per circuit, with optional split rails. The rails of two boards do not join on their own.
- The schematic parts wait on the "To place" table and are dragged to the board. While dragging, the holes for the pins are marked and each strip lights up: green if it fits, red if it does not (occupied hole, outside the board, pin that does not reach) and yellow if it fits but causes a short, such as an IC that does not straddle the channel.
- The tip of a pin can be taken to another hole and the pin bends, up to the real length of its package. If it is shorter than the body, the part stands upright.
- Wires from hole to hole, straight and flush with the board or curved above it (key A), with a color by function that changes with right-click › Color. A straight wire bends by dragging a point of its path.
- Sources, ground and instrument probes appear as a label with their full name, at two heights: the + rail ones outside the board and the − ones next to their rail. They are dragged from one height to the other, can be swapped and, if they do not fit next to their posts, come out staggered outside the board without crossing. With Show equipment they become sources, generator, oscilloscope and multimeter drawn outside the board, on the nearest side, and each wire goes to the nearest free hole of its net. A symmetric pair such as +15 V and −15 V goes on a dual supply.
- Dotted lines show the connections that are missing, and the differences from the schematic (missing, extra, shorts) are marked. Both aids are turned off in View › Breadboard and are saved with the file.
- "Build breadboard" and "Build schematic" make one view match the other. A summary beforehand says what is added, what is removed and what is rewired, with a checkbox to keep what is left over, and a single undo reverts it. Build breadboard spreads the ICs across the width without overlapping parts, adds boards if needed, colors the wires so neighbors do not repeat a color, and flips the resistors, capacitors and inductors when that way no wire passes over an occupied hole. Build schematic arranges the parts following the signal and joins them with wires or net labels, also with the selection.
- F5 simulates the open tab, and in Both a selector chooses between the schematic and what is built. The analyses use the same source, with traces by schematic net name or by strip when there is none. When simulating the breadboard the current is animated along wires and pins, and LEDs and displays light up. The colors by voltage of strips and wires, and the value of each strip, are requested with the V key. An unconnected pin is simulated as open.
- A complete breadboard selection moves with the drag, with parts, wires, labels and notes together, also to another board. Right double-click deletes on the breadboard as in the schematic.
- Measure, in the right-click of a part, a strip or a wire of the board, sticks the probes of a multimeter or an oscilloscope into free holes of the net of its pins.
- Resistors carry their bands: four on a beige body for E24 values, five on a blue body for E96, and gray bands with the value written for a value with no commercial code, which is simulated with its exact value.
- Parts without a drawing of their own, such as the gray box from Import, are inserted as a row of pins with their names.
- The breadboard is exported to PNG, SVG and PDF with the same tools as the schematic.
- "Save selection" as a template can also save how the circuit is built, and when placed it arrives built.
- The assistant has the tools `estado_protoboard`, `armar_protoboard` and `armar_esquema`.
- The tutorial introduces in chapter 1 the tabs and the ribbon that changes with the view, and chapter 3 becomes "Build and measure": it builds the LED circuit by hand on the breadboard, simulates it and measures with Measure.
- Files with a breadboard use format 11. A file without a breadboard is saved as before, and an earlier version of Kirchi opens format 11 files read-only.

### Design

- The ribbon now has Simulate, Record and Show in the title row and the tabs Home, Analyze, View and Help. It follows the view of the last click, not the mouse hover. The V key cycles in three steps while simulating: colors by voltage, colors with values, and nothing. The boards have the real proportions of 830, 400 and 170 points, and a Labels | Equipment selector chooses how the instruments look. In the clean canvas of Both, the floating bar stays over the divider and the view labels move up so they are not underneath.
- Ribbon changes: the instruments leave the ribbon and are placed from the Library and Measure, Group into packages is removed from the interface, Record has its own group with pause and stop, and the arrow that collapses the ribbon moves to the tab row. On the breadboard, Place brings Part, Board and Power, Ground, Note and Wire, and the Breadboard group gathers Build breadboard, Build schematic, the shape of the wires and the visual aids. The right-click has icons on all its entries.
- Warnings tab in the right rail, with a number in the color of the most serious warning: red prevents simulating, yellow warns of something that burns or is not commercial, and gray lists the differences from the breadboard. It shows only the current state, and what is fixed disappears on its own. Hovering a card highlights its place and a click frames it. F5 with a red warning opens the tab instead of simulating.
- The Log tab is removed from the bottom strip. Warnings no longer appear either in the inspector with no selection or in Project.
- The board, the table and the parts keep their real colors in the dark theme.

### Performance

- Canvas texts are drawn with WebGL from an atlas, instead of a second full-screen layer, and the focus ring no longer takes a layer the size of the canvas. With the app freshly opened about 20 MB less memory is used.

## 2.2.1

Imported circuits look and simulate as in their original program, and initial conditions on capacitors and inductors and AC and pulse current sources arrive.

### New

- Capacitors and inductors with an optional initial voltage or current. When any part has one, the transient analysis starts from those conditions: the "Start from zero" checkbox is checked and a note names the parts. The SPICE export writes `ic=` and `uic`.
- AC and pulse current sources, 113 parts in total.
- Proteus analog graphs and virtual oscilloscopes also become an oscilloscope with its time base, its scale and net labels on its inputs.

### Import

- The wires, terminals, grounds and labels of the original are kept in place and at their scale, instead of running long wires across the schematic.
- A DC source that feeds a named terminal becomes that power terminal with its voltage (such as VCC). If its current is plotted in an analysis, it stays a source.
- Parts keep their orientation: Proteus amplifiers no longer come out mirrored and the LTspice UniversalOpamp2 has In− on top.
- Net labels grow toward their free side, avoid pins, pin numbers and names of other parts, and slide along their wire when there is no room.
- Sources keep amplitude, frequency, edges, width and delay. PWL, EXP and inverted pulses are imported in segments, and a pulse that does not fit in its period goes to the generator.
- Transistors keep the parameters of the `.model` in the file.
- The states saved by Falstad, the `ic=` and the SPICE `.ic` become the initial conditions of each part.
- A one-argument `.tran` is read as the final time.

### Design

- The selected label no longer opens a text balloon: dotted lines point to what it joins.

### Fixes

- Copying, cutting or duplicating a label no longer duplicates the probe of its point.
- A file with absurd coordinates or many sheets opens without hanging Kirchi.

## 2.2.0

Kirchi opens circuits from Falstad, LTspice, SPICE netlists, KiCad and Proteus, with a report of what was converted, approximated and what has no equivalent, and a tutorial chapter to learn it.

### New

- Open (Ctrl+O) and dragging into the window accept circuits from other programs: the text exported by Falstad and CircuitJS (.txt), LTspice schematics (.asc), SPICE netlists (.cir, .net, .sp), KiCad 7 to 9 schematics (.kicad_sch, with their sheets) and Proteus 8 projects (.pdsprj). The source program is recognized from the content of the file, the circuit opens as a new unsaved document and the original is not modified.
- Each part is looked up in the library equivalences. If there is no exact one but the type exists (transistor, diode, amplifier, gate), the closest part is used and marked as an approximate model. If there is nothing similar, a gray box with the pins of the original remains, and it is replaced with right-click › "Replace with…" keeping its wires.
- When opening, the import report appears, with cards for what is approximate, what has no equivalent, nets joined with a label and converted analyses. Afterwards it stays in Project: hovering or focusing a card highlights its parts on the canvas, and a click frames them. The report is saved with the file until it is hidden.
- The instruments and analyses of the original are kept: voltage and current probes, pulse and sine generators, DC sources, virtual multimeters and oscilloscopes, and the operating point, DC sweep, transient, AC and Fourier analyses. In Proteus, analog graphs become transient analyses with their traces, and potentiometers keep the position of their wiper.
- The tutorial has a fifth chapter, "Import", that opens a sample circuit, goes through the report and replaces a part with no equivalent.
- The assistant has the `importar` tool, which converts a circuit from its folder and returns the report.
- Files that save a gray box or an import report use format 9. An earlier version of Kirchi opens them read-only.

### Design

- Parts bring their KiCad, LTspice, Falstad and Proteus equivalences, checked against real files and libraries.

## 2.1.0

Nine new parts (111 in total) with A/D and D/A converters, DIP switches, keypads and shift registers, the knob setting in its own box, four new types in the amplifier calculator, a tutorial that covers all of Kirchi, a rearranged Settings, and more faithful models of the TL431, the lamp and the comparator.

### New

- New parts, 111 in total:
  - ADC0804 A/D converter and DAC0808 D/A converter, with successive-approximation conversion and the current of their 256 codes. The Log warns once when a DAC input goes more than a microsecond without a defined level.
  - 4 and 8 position DIP switches, and 4x4 and 4x3 matrix keypads. With the preview running, a click on the lever or the key moves its contacts, and the computer keys operate the selected keypad.
  - 74164 (serial in, parallel out), 74165 (parallel load) and 74595 (with storage and three-state outputs) shift registers.
- The setting of the potentiometer, thermistors and temperature sensors goes in a box of its own, which moves and undoes like the Reference and the Value. The Show option of each part offers "As in Settings", "Setting", "Values", "Both" and "None", and Settings › General has "Text of adjustable parts" with the default option.
- The export dialogs for plots and captures keep what was adjusted as long as the data is the same, and "Reset" returns them to their values.
- The amplifier calculator is called "Op-amp amplifiers" and adds integrator, differentiator, inverting summer with 2 to 4 inputs and instrumentation amplifier, each with its equation, its saturation check and its circuit.
- The editor of the exported figure allows choosing several elements of the same type (traces, texts, arrows, value labels, axes or titles) with Shift or Ctrl and click, and changing their color, size or weight at once.
- The assistant places chips by package and unit, changes the unit of a part, groups packages and reads the packages and pin numbers.
- The Analysis tab says right there why an analysis cannot be chosen (the preview is not stopped or the file is read-only).

### Design

- The text size of notes and labels is shown and typed in points (the default is 5.7 pt and the range goes from 2.8 to 56.7 pt).
- The interface says "pin" instead of "leg": menus, warnings, inspector, assistant and guides.
- Settings has the tabs in a column on the left and a card per group, with the same switch for everything that is yes or no, the help (i) next to the name and the folders on the same row. Some labels were clarified: "Value series when typing" (with "No series"), "Text of adjustable parts", "Avoid canvas flicker" (now in Appearance) and "Connect an assistant".
- The Library also groups Passives, Sources, Semiconductors, Switches and Integrated circuits in collapsible groups.
- The panel of the exported figure follows the order Reset figure, Data, Theme, Show, Font, Text appearance, Grid, Grid weight, Axis subdivisions, Axis weight and Decorations, in plots and captures, and the hint says "Click to modify something specific."
- The preview warnings say what can be done while it runs: values are adjusted, and only moving, wiring, deleting or the analyses wait for it to stop.
- In Plots, the cursor readings go in a column to the right of the plot (list of analyses, plot and cursors) and drop below it when the panel is narrow.
- The general text slider is called "Text size" and has a balloon.
- The weight of the oscilloscope axes also thickens the center cross.
- The "Learn Kirchi" tutorial is a complete tour in four chapters: Get to know Kirchi, Your first circuit, Measure and Analyze and export. Each starts from its own circuit, so it can be done alone, and the selector says in one sentence what it is about. The "Look" steps frame an area with a line of explanation and advance with "Next"; the "Do" steps check the action. Every step points to its area with the frame, also over the export dialog, and the texts carry the interface icons next to their names. The saved progress of the previous version is reset.

### Fixes

- When choosing several traces in the export, the color, weight and axis that the first one had also apply to the rest.
- In the export of a plot, the color swatches in Data follow the color chosen for each trace.
- When exporting a plot or an oscilloscope capture, the color chosen for a trace is no longer overridden by the colors the dialog saved in earlier versions.
- Duplicating or pasting a label or a note leaves it in a free spot, without overlapping parts, wires or other texts.
- The format bar of a label or a note is placed above, below or at the side, where it does not cover the parts.
- What the oscilloscope captured is drawn without steps when viewed backwards or with less time per division: a sine wave no longer comes out square.
- The value box of the NTC, the PTC and the photoresistor shows its model again instead of being empty.
- A change made live in a part of the circuit that does not change over time is applied from the simulation instant, and its voltages, averages and probes show it immediately.
- The preview runs faster in circuits that mix logic and analog and in the 28BYJ-48 motor with ULN2003, which now reach real time at ×1.
- If ngspice does not start, the error gives the path, the system code and, on macOS, what to do. On macOS the check waits longer and is retried.
- The application frees reserved memory two seconds after loading each window.
- When opening, the interface and the main process take about 10 MB less: their code is stored at one byte per character and the assistant library is loaded only when it connects.
- When choosing the span to export the whole axis is visible, so a span chosen earlier no longer limits the choice.
- The search in the Library and the finder puts the best match first ("led" gives the LED and not the controlled sources) and discards those that only contain the text inside another word.
- With the preview running, the fixed reference note no longer covers the Value field of the editor, and voltages dodge the probe flags, the meter displays and the instrument readouts.
- The oscilloscope time cursors stay fixed on the screen while it advances, as on a real oscilloscope, and you can measure without pausing.
- Pin numbers are visible from 100% zoom and the View button hides and shows them.
- The TL431 and the LM4040 settle in microseconds and give their voltage in short measurements, sampled or not.
- The lamp raises its resistance with the filament temperature: its current grows with the voltage and it blows at twice its power.
- The comparator output no longer exceeds its supply voltage when switching.
- The assistant measures frequency, average and rms of the oscilloscope over whole periods, without counting the startup.

## 2.0.1

The macOS installer is published again alongside the Windows and Linux ones.

### Fixes

- The macOS installer (universal dmg with ad hoc signature) is published in the Release alongside the Windows and Linux ones.

## 2.0.0

An optional AI assistant, 102 parts with their physical data, live knobs, multi-unit integrated circuits and MSI logic, and the Microsoft Store analyses working again.

### New

- Optional assistant (MCP protocol): any MCP client, such as Claude Desktop or Claude Code, can place parts, wire, change values, simulate, move knobs, read measurements and export the circuit image. It comes turned off, everything happens on your computer and Kirchi still works offline.
- With the window open, the assistant edits live the circuit you have in view and does not write it to disk on its own. Each step is undone with Ctrl+Z and noted in the Log. If the file changes outside Kirchi, "Keep mine" leaves the assistant out.
- Templates and calculators from the assistant, analyses with traces by pin and named nets, analyses saved in the document and export of plots with title and subtitle.
- A folder of its own for the assistant (Documents\Kirchi\Asistente by default), an indicator in the title row with a button to disconnect it, and "Copy the assistant settings" to paste into any MCP client.
- Live knobs: the potentiometer, the rheostat, the thermistors, the photoresistor and the temperature sensors move while simulating, from the inspector, Measurements, the wheel or the keys, with logarithmic scale and a typed field. The part value shows the setting and the live resistance according to the Show option.
- Multi-unit integrated circuits: the canvas names them U1A, U1B, with the Unit selector in the inspector, and "Group into packages" (in Home and in the right-click) joins loose parts. Shared pins are joined and Project lists the packages.
- View › Pin numbers draws the number of each chip pin, and the exported file carries them if they are visible.
- "Part data" in the inspector: package, pins with number, name and note, footprint, part and datasheet. "Copy" puts the footprint on the clipboard and "Open" takes the datasheet or the LCSC number to the browser, only when pressed. Data not yet checked against a source carries the "unverified" mark.
- The Library groups the digital parts in collapsible groups with their count, and remembers which were collapsed.
- Measurements has the "Logic and converters" section, with the big figure, the bits with their level, the state and the clock of the MSI chips.
- Circuits save the list of what they need. When opening one in a version that lacks a part or a model, a notice names it and it is kept when saving.
- New parts, 102 in total:
  - AND, OR, NAND, NOR, XOR and XNOR gates with 2 to 8 inputs, 74HC14 Schmitt inverter, 74HC125 three-state buffer (several outputs can share a net and the Log warns if two drive it at different levels) and logic state.
  - MSI logic in 74HC and 74LS: decoders 138, 139, 7447 and CD4028, multiplexers 151, 153 and 157, priority encoder 148, adder 283, magnitude comparator 85, octal buffer 244, transceiver 245, counters 161, 163, 190 and 193, and CD4017 Johnson counter.
  - Semiconductors: N and P channel JFET, IGBT (IRG4BC30UD and FGA25N120ANTD) and 2N2646 UJT.
  - Sources: voltage and current controlled (E, G, H and F) and piecewise voltage source (PWL), with its miniature plot.
  - Sensors: NTC and PTC thermistors with self-heating, GL5516, GL5528 and GL5539 photoresistors, and the LM35 and TMP36 sensors.
  - 4N25 and PC817 optocouplers, with the CTR ranges from the datasheet.
  - 28BYJ-48 (unipolar) and 17HS4401 (bipolar) stepper motors, with angle and steps in Measurements, and the L298 H-bridge.
  - TL431 and LM4040 references (six voltages), INA128 instrumentation amplifier, LM386 audio amplifier with gain from 20 to 200 and CMOS and TTL logic probe with high and low lights.
  - New models adjusted to the datasheet: 7809, 7815, 7912 and 7915 regulators, BC337, BC327, 2N5551, 2N5401 and 2N3055 transistors, MCP6002 and OP27 amplifiers, LM339 comparator and 1N4001 diode.
- New templates: Discrete H-bridge with TIP31, TIP32 and four 1N4007, and 0 to 99 counter with two 74HC161 and two 74LS47 on common-anode displays. There are fifteen included templates.
- Cursors and cross readout in the X-Y oscilloscope and in the X-Y plots, with the slope between two points. When exporting the oscilloscope, From and To are written on each axis.
- "Measure ▸" menu in the right-click of a wire or label, with Probe, Multimeter and Oscilloscope.
- The AC sweep accepts exact "Include frequencies", such as 60 Hz, in addition to its grid.

### Design

- Settings has five tabs (General, Appearance, Simulation, Shortcuts and Assistant) and a hint (i) with a balloon on the settings that need it.
- Each transistor, SCR, triac and amplifier carries the symbol that numbers its pins like its datasheet. The SRD relay and the 6 mm button take the numbering of their footprint.
- Parts bring their physical data, checked against the KiCad symbols and footprints and the manufacturers' datasheets.
- Integrated circuits draw their functional box with negation, clock, three-state and open collector.
- The Analysis tab with nothing chosen offers the six analyses with their icon, and each run starts with an empty Log.
- The chip of a gate input stays next to its pin and is dragged along its whole net.
- In X-Y, the 0 V mark of the horizontal channel is dragged sideways, at the edge of the graticule.
- The installers are named by their system: Windows-installer, Windows-portable, macOS and Linux.

### Fixes

- ngspice analyses work again in the Microsoft Store version: before they all failed because of the installation path with spaces.
- Real-time simulation is faster in large circuits and in stepper motor circuits, because the sparse factorization reuses its pivot order.
- A blown lamp is restored with a click, like a fuse.
- Copy and paste also carry the oscilloscope probes.
- A net named "V(Salida)" no longer appears as "V(V(Salida))" in the plots.

## 1.2.2

- ngspice analyses work again on Windows: the package carries the library that was missing and, if ngspice does not start, the message says so instead of talking about another version.
- Oscilloscope: X-Y mode (B/A and A/B), volts, position, coupling and time per division that can be changed while paused on what was captured, and trigger level typed with its unit.
- Plots: one trace against another (X-Y), From and To typed on each axis, ranges that end on a round mark and margins that adjust to the width of the numbers.
- Export plots: time marks in round steps within the chosen span, decimals of the axes and of the value labels separately, blank subtitle, and general font size and weights for all the axes.
- Export the schematic: pauses the preview on its own, reading labels come out with their value in the saved file and can show only the figure.
- Generator: amplitude in peak to peak, peak or rms.

## 1.2.1

- The preview adjusts its step to the circuit and the screen: slow circuits, such as an analog computer, run up to 12 times faster and Step arrives in seconds.
- Eight speeds (×10, ×5, ×2, ×1, ×0.5, ×0.1, ×0.01 and ×0.001) plus "No real-time limit", each with its equivalence, for example "×10 (1 s = 10 s simulated)".
- The paused oscilloscope is scrolled by dragging without returning to the end by itself.
- The simulation no longer gets stuck when a segment ends at a tiny fraction of a step.

## 1.2.0

- Quick meter: right-click on a wire, "Measure with the multimeter" and "Quick meter" places a display with the net voltage or the wire current, in DC or AC. Double click changes what it measures.
- Record the Kirchi screen to MP4 (or WebM if the system has no MP4), with or without microphone, from Home › Simulate. It is saved in Videos › Kirchi.
- Advance in time by one division, one calculation step, a fixed time or up to an instant, and Step back to the previous advance.
- Export the schematic with large view, manual area, margin, light or dark theme, voltage colors and readings, and with text, arrows, highlights, numbered callouts and reading labels only for the image.
- Export plots with free span, preview of what is placed, draggable axes and decimals per axis.
- Right-click organized by sections with icons, panels of the same width, net labels that mirror, and notes and figures that move freely with Alt.
- Fixes in the oscilloscope probes, the double-click editor while simulating and recording in Electron 44.

## 1.1.0

- Editor for exporting figures with large view, tools, floating bar, axis selection, From and To fields with unit and grid chosen with icons.
- Side sheet of appearance for the oscilloscope and the plots.
- Oscilloscope: with the instrument stopped, the whole capture is scrolled and exported, without spikes at the crests of a sine wave.
- Simulate, Pause and Stop in the title row.
- Analysis: Cancel discards the one being prepared and Stop cuts the one that is running. Saved analyses update when the circuit changes.
- Six small-signal transistors adjusted to their datasheets.
- Own templates keep the notes of the selection.
- Windows ngspice built from the official code. Third-party licenses with their full text and their source code alongside the installers.
- macOS with ad hoc signature and universal package. Package for the Microsoft Store.

## 1.0.0

First public version of Kirchi.

- Schematic editor on a grid with 58 parts, wires with automatic routing, notes, labels and templates.
- Real-time simulation with own analog and digital engine (Rust compiled to WebAssembly).
- Instruments: multimeter, oscilloscope with probes, function generator and variable power supply.
- Analyses with ngspice: operating point, DC sweep, transient, AC / Bode, parameter sweep, steps and Fourier, with exportable plots.
- Calculators that generate the circuit, commercial value series and a value editor with units.
- "Learn Kirchi" tutorial with five chapters.
- Export to SVG, PNG and PDF, and `.kir` files with automatic backups.
- Installers for Windows (NSIS and portable), macOS and Linux.
