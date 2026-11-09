# User guide

This guide covers the basics of Kirchi. Inside the app, the “Learn Kirchi” tutorial (Help menu) walks through Kirchi step by step, in five chapters you can do separately: Get to know Kirchi, Your first circuit, Build and measure, Analyze and export, and Import. In the “Look” steps a frame points at an area and you move on with “Next”; in the “Do” steps the app checks what you did.

## The window

At the top is the title row and, below it, the ribbon with four tabs. The title row holds the file name, Save, Export, Undo and Redo, the command search (`Ctrl+K`) and three labeled blocks: **Simulate** (Simulate and Stop), **Record** (Record, Pause and Stop recording) and **Show** (Voltages and Current). This way you can simulate, record and show voltages with the ribbon folded and from any tab.

- **Home** gathers the work of each session in groups: File, Edit, Place, Instruments (multimeter, oscilloscope, generator and variable power supply) and Time (speed, slower, faster, Step and Step back). With the breadboard view a Breadboard group also appears. The ribbon follows the view that has focus: in Schematic, Place offers Part, Shape, Power, Ground, Note and Net label; in Breadboard it offers Part, Board, Power, Ground, Note and Wire. The arrow at the far right of the tab row folds the ribbon.
- **Analyze** has the six analyses as buttons, with Run and Cancel to their right, and the groups Results (Plots, Export CSV and Cursors), Reading instruments (Oscilloscope, Measurements and Warnings) and Panel and calculators.
- **View** has five groups: Zoom, Panels, Animation, Canvas and Window.
- **Help** has four groups: Learn (the “Learn Kirchi” tutorial, this guide and the guide for making a board), Kirchi (What's new, Check for updates, which opens the download page, and About), Help us (send a suggestion or report a bug: a dialog lets you copy the email address or open the message in Gmail, Outlook web or your mail app; and “Support Kirchi”, a voluntary contribution that unlocks nothing) and Community (YouTube, TikTok and the Kirchi page). This guide and the changelog open inside Kirchi, without internet and in the language of the app. Links to external sites open in the system browser only when you click them; Kirchi does not connect to the internet on its own.

On the left there is a rail for placing things (Library, Templates and Calculators). On the right there is another one to see how the circuit works (Inspector, Measurements, Project and Warnings). At the bottom, the instrument bottom panel has the Oscilloscope and the analysis Plots. Above the canvas, the Schematic, Breadboard and Both tabs change the view and the ribbon (see the Breadboard section). All panels open and fold from View › Panels. `Ctrl+K` searches any command by name.

## Your first circuit

1. Open the **Library** from the left rail, or double-click the canvas to search for a part by name. The search accepts values: typing `r 4k7` places a 4.7 kΩ resistor.
2. One click places the part and leaves it selected. With `Shift` you keep placing copies. `Esc` or right-click cancels.
3. To connect, drag from a pin to another pin or to a wire. The wire routes itself and does not cross other parts.
4. Every circuit needs a ground (`GND`). Without one, Warnings flags in red that a reference is missing and the simulation does not start.
5. Press **F5** (or Simulate, in the title row). Wires change color with voltage, currents animate and LEDs light up. `Shift+F5` stops the simulation.

While simulating, the circuit cannot be edited. The exceptions are the live knobs (see below) and switches, which you operate with the mouse. Stop the simulation to edit again.

## Controlling time

In Home › Time, **Step** and **Step back** move through the simulation in steps of the size chosen in the Step menu, and the speed goes from ×0.001 to no limit. In View › Animation you pause the animations or the sound. The **Record** block of the title row saves a video of the Kirchi window, with buttons to pause and stop the recording.

## Measuring

- **Net voltages.** While simulating, wires, strips and rails keep their editing color. The `V` key (or the Voltages button) cycles through three steps: colors by voltage, colors with the value of each net, and everything off. With the mouse over a net its value appears in any of the steps.
- **Instruments.** The multimeter, the oscilloscope, the function generator and the variable power supply are in the Library (Instruments category) and in Measure, and `Ctrl+K` places them by name. You adjust them in the inspector.
- **Measuring from a wire.** With a right-click on a wire or a label, “Measure” offers three submenus: “Probe” (voltage or current), “Multimeter” (quick meter, full multimeter or a terminal of one already in the circuit) and “Oscilloscope” (each input).
- **Oscilloscope.** The bottom panel opens by itself when simulating. The mouse wheel over an axis changes its scale.
- **Measurements.** The Measurements panel, on the right, shows the multimeter reading.

## Analysis

The **Analyze** tab offers six analyses that use ngspice, each with its own button.

| Analysis | What it is for |
|---|---|
| Operating point | Voltages and currents in DC. |
| DC sweep | Curves as a source varies. |
| AC / Bode | Gain and phase against frequency. |
| Transient | Signals over time. |
| Fourier | Harmonics of a signal. |
| Parameter sweep | The result as a part value varies. |

If none can be chosen (the live preview is not stopped or the file is read-only), the Analysis tab says so above the list.

You choose the analysis, adjust its fields in its card and click **Run**. The results stay in the **Plots** tab of the bottom panel, with cursors, zoom and export. Named nets (labels) and probes say which curves to draw.

## Warnings

The **Warnings** tab, on the right rail, lists what is happening with the circuit right now and carries a number in the color of the most serious warning. A red warning prevents simulating, such as a missing ground: pressing F5 opens the tab. A yellow one warns without preventing anything, such as a part that exceeds its maximum. A gray one points out a difference between the breadboard and the schematic, or a part that exists only on the breadboard. With the breadboard as the simulation source, the red warnings are those of what is assembled. Hovering over a card highlights its place on the canvas and a click fits it in view. Only the current state is shown: when you fix the cause, the warning disappears.

## Breadboard

The schematic is the plan of the circuit and the breadboard is that circuit assembled. The **Schematic**, **Breadboard** and **Both** tabs (above the canvas) choose what to see. Each view works separately with the same parts: you can draw in one and edit in the other, and syncing is requested with the commands of the **Breadboard ▾** button (Breadboard group of Home). In Both, selecting a part on one side selects it on the other. The first time you open the Breadboard tab an 830-point board appears; **Board ▾** (in Place) and the right-click on an empty spot add others of 830, 400 or 170 points (the last one without power rails). Each board moves separately and their rails do not join by themselves: a wire is needed.

**Placing parts.** The schematic's parts wait drawn in the “To place” area, with their reference and value. Drag them onto the board: the holes where their pins will land are marked green if it fits, red if it does not (for example, an occupied hole) and yellow if it fits but leaves pins shorted, like an IC that does not straddle the center channel. Del on a part that is also in the schematic sends it back to the area; if it exists only on the breadboard, it deletes it. Resistors carry their bands: four on a beige body for the E24 series, five on a blue body for E96, and a gray body with the value written when the value has no color code.

**Pins and wires.** Drag the tip of a pin to another hole and it bends; if it does not reach, it says so. A wire is placed from hole to hole and can be straight or curved. The `A` key changes the shape of the next one and the right-click changes that of one already placed. A straight wire is bent by dragging a point along its path. Its color depends on its function (red to positive, black to ground, blue to negative) and is changed with right-click › Color. With the mouse over a used hole, a tooltip says what is connected to that strip.

**Editing on the breadboard.** The Part tool, the Library and the search place parts directly on the board, and the ribbon and the right-click offer Power, Ground, Note and Wire. A part placed this way exists only on the breadboard until Build schematic is requested. You can select with a rectangle or with `Shift`, cut, copy, paste, duplicate and rotate as a group; dragging one of the chosen parts (or using the arrows) moves the whole selection together, also to another board, and `Esc` or the right-click cancels the active tool. Deleting a part in the schematic leaves it on the breadboard if it was already assembled, and `Ctrl+Z` undoes it.

**Sources and probes.** Sources, ground and instrument probes are not inserted into the board: each one appears as a small label next to its hole or its rail. With Breadboard ▾ › Show equipment they are drawn as lab equipment outside the board (power supply, generator, oscilloscope), on the side closest to what they connect, and each wire of a piece of equipment goes to the nearest free hole of its net.

**What is missing and the differences.** Gray dotted lines join what the schematic connects and the breadboard does not yet. Differences from the schematic are marked in yellow and listed in Warnings. The “What is missing” and “Differences” checkboxes of Breadboard ▾ hide them, and their state is saved in the file.

**Build breadboard and Build schematic.** Breadboard ▾ › Build breadboard places the parts, connectors and wires that are missing, and adds boards if they do not fit. Build schematic does the opposite: it brings to the schematic the parts that exist only on the breadboard and joins them with wires or net labels according to what the board connects. The right-click of a selection offers Build schematic from the selection. Both show a summary of what they will do first, and once applied a single `Ctrl+Z` undoes everything.

**Measuring on the board.** With a right-click on a board part, Measure › Multimeter or Oscilloscope plugs the probes into free holes of the net of its pins. A part that is still in the To place area cannot be measured. You can also drag a probe to a hole.

**Simulating and analyzing.** F5 simulates the circuit of the open tab: the schematic in Schematic and what is actually assembled in Breadboard. In Both a “Simulate” selector appears to choose one, which does not change while it runs. If the schematic and the breadboard are the same circuit, both views show the result whichever one is simulated, and knobs, switches and buttons can be operated from either. If they differ, the other view is dimmed with a notice that says how many differences there are and leads to Warnings. The analyses (operating point, DC, AC, transient and the others) use the same source; with the breadboard, traces carry the name of the schematic net if it matches, and otherwise that of the strip or rail (for example “strip C5”). When simulating the breadboard, strips and rails are tinted by their voltage, the `V` key puts a label with its value on every used strip, and LEDs and seven-segment displays light up. A pin that is not in any strip is simulated as open. If a wire is missing in the LED's path, the breadboard simulates and the LED does not light, while the schematic keeps working.

**Files, templates and export.** A file with a breadboard saves the boards, the position of every part, the wires, the labels and the equipment; one without a breadboard is saved as usual. When saving a template you can check “Also save how it is laid out on the breadboard”; when placed, it arrives assembled. With the Breadboard tab open, Export produces PNG, SVG and PDF.

## Part data

When you select a part, the inspector shows a “Part data” section with the package, a table with the number, name and note of each pin, the footprint, the part number and the link to the datasheet. They change when you pick another model or presentation (a 2N3904 and a TIP31 have different packages). A datum not yet checked against a source carries the “unverified” mark.

“Copy” puts the footprint on the clipboard. “Open” takes you to the datasheet or the LCSC part page in the system browser, only when you click it and never on its own. With the live preview running the section stays available.

The assistant queries the same data with the `datos_pieza` tool: package, pins, LCSC part number with its mark, datasheet and equivalents.

A circuit stores the list of what it needs. If you open it in a version of Kirchi that lacks a part or a model, a notice names it, it is kept when saving and it can be simulated once you update.

### Parts

There are 111 parts in nine categories. The Library groups them in collapsible groups, with their count, in the categories Passives, Sources, Semiconductors, Switches, Digital and Integrated circuits, and remembers which ones you left closed. Electromechanical, Indicators and Instruments are flat lists.

- **Gates.** AND, OR, NAND, NOR, XOR and XNOR with 2 to 8 inputs (the Inputs setting is in the inspector and in the double-click editor), 74HC14 Schmitt inverter and 74HC125 tri-state buffer, whose outputs can share a net.
- **MSI logic** (74HC and 74LS): decoders 138, 139, 7447 and CD4028, multiplexers 151, 153 and 157, priority encoder 148, adder 283, magnitude comparator 85, buffer 244, transceiver 245, counters 161, 163, 190 and 193, CD4017 Johnson counter and shift registers 74164 (serial in, parallel out), 74165 (parallel load) and 74595 (with storage and tri-state outputs).
- **Semiconductors.** N and P channel JFETs, IGBT, 2N2646 UJT, and the models BC337, BC327, 2N5551, 2N5401 and 2N3055.
- **Sources.** Voltage-controlled and current-controlled (E, G, H and F) and the piecewise voltage source (PWL), which draws its waveform in miniature.
- **Sensors.** NTC and PTC thermistors, photoresistors, LM35 and TMP36.
- **Integrated circuits.** 4N25 and PC817 optocouplers, TL431 and LM4040 references, INA128 instrumentation amplifier, LM386 audio amplifier, 7809, 7815, 7912 and 7915 regulators, MCP6002 and OP27 amplifiers, LM339 comparator and L298 H-bridge.
- **Converters.** ADC0804 (8-bit successive-approximation A/D) and DAC0808 (8-bit D/A with current output). Warnings flags it if a DAC input goes more than a microsecond without a defined level.
- **Switches and keypads.** 4 and 8-position DIP switches, and 4x4 and 4x3 matrix keypads. With the live preview running, a click on a DIP lever or on a keypad key moves its contacts, and the computer keys operate the selected keypad (each click is one undo step).
- **Motors.** 28BYJ-48 (unipolar) and 17HS4401 (bipolar) stepper motors, with the angle and the steps in Measurements.
- **Instruments.** Logic probe, which lights its high and low lights according to the level it touches.

In the search, `bc` suggests BC337 and BC547.

## Live knobs

The potentiometer, the rheostat, the thermistors, the photoresistor and the temperature sensors have a knob that moves while simulating: from the inspector, from the Measurements panel, with the mouse wheel over the part or with the keys. Some have a logarithmic scale and a field to type the value. The setting is read in a box of its own next to the part, which moves and undoes like the Reference and the Value. The Show option of the inspector chooses what it says: “As in Settings” (the default), “Setting”, “Values” (the resistance of each side or of the part), “Both” or “None”. The general setting is chosen in Settings › General › “Text of adjustable parts”. If the engine rejects a value, the knob goes back to the previous one and Warnings says so.

## Multi-unit chips

An integrated circuit with several units, like a 74HC00, is placed by units: the first part takes the first free package (U1A), the next one goes into the following unit (U1B) and so on until it is full. In the inspector, the Unit selector changes which one the part corresponds to and disables the occupied ones. Changing the name of the package changes it in all its units.

The Project panel lists the packages. The power pins that the units of a package share join by themselves, and if they end up in different nets the simulation warns.

## Pin numbers

View › Pin numbers draws the number of each pin of the chips, according to its unit and its family. It is shown by default. The exported file carries them only if they are visible.

## Logic measurements

Measurements has a “Logic and converters” section. For MSI chips it shows the value as a large number, the bits with their level, the state and the clock. The stepper motor shows its angle and the steps taken, and the JFET its voltage, current, power and region.

## Templates and calculators

- **Templates.** Select part of the circuit and choose “Save as template” in Home › File. To place it, open the Templates panel and click on the canvas. Kirchi includes fifteen, such as the divider, the LED with resistor, the 555 astable, filters, the discrete H-bridge and a 0 to 99 counter with displays.
- **Calculators.** Six calculators (voltage divider, LED with resistor, filters, 555 astable, 555 monostable and amplifier) give standard values and show the equation with the substitution. **Build circuit** leaves the circuit ready to place with one click.

## Text and sizes

The text size of a note or label is typed and shown in points (pt); the default is 5.7 pt and the range goes from 2.8 to 56.7 pt. The “Text size” slider of the export dialogs changes all the text of the figure at once.

The dialogs for exporting a plot or a capture remember what you adjusted while the data stays the same. “Reset” returns them to their default values.

## Shortcuts

| Action | Shortcut |
|---|---|
| Simulate or pause | `F5` |
| Stop | `Shift+F5` |
| Show voltages | `V` |
| Search for a command | `Ctrl+K` |
| Undo and redo | `Ctrl+Z`, `Ctrl+Shift+Z` |
| Cut, copy, paste | `Ctrl+X`, `Ctrl+C`, `Ctrl+V` |
| Rotate the selection | `R` (`Shift+R` the other way) |
| Flip | `X` and `Y` |
| Move the selection | Arrows (2.5 mm), with `Shift` 12.5 mm |
| Fit the circuit in view | `F` |
| Clean canvas (no panels) | `Ctrl+Shift+L` or `Ctrl+\` |
| Fold the ribbon | `Ctrl+F1` |
| Shortcut sheet | `?` |
| Settings | `Ctrl+,` |

Settings (`Ctrl+,`) has the sections General, Appearance, Simulation, Assistant and Shortcuts in a column on the left, with a card per group. Changes are saved by themselves. The Language option of General switches Kirchi between Spanish and English (Automatic follows the system language), and `Ctrl+K` also finds it as “Change language”.

The full shortcut sheet opens with the Shortcuts icon, at the right of the title row. Shortcuts are changed in Settings › Shortcuts, and a conflict between two shortcuts is asked about before it is applied. `F1` moves the focus to the balloon of the running tutorial.

## Assistant

An AI assistant (Claude Desktop, Claude Code or any MCP client) can work on the circuit you have open. It is turned off until you activate it, and Kirchi does not connect to the internet.

1. Open Settings › Assistant and turn on “Allow an assistant to control Kirchi”.
2. Click “Copy the assistant settings” and paste the text into the client's settings; the tab status reads “Ready. Write to the assistant from your client.” With the Windows installer it carries the full path to Kirchi, and with the Microsoft Store the `kirchi` alias.
3. Write to it directly in your client, in plain words. It can place parts, wire, read the breadboard state and build it, change values, simulate, read measurements, use templates and calculators, import a Falstad, LTspice, SPICE, KiCad or Proteus circuit that you leave in its folder, run and save analyses with traces by pin, and export the image or the plot.

While it works, the title row shows which assistant is connected and a button to disconnect it. Each of its steps is undone with Ctrl+Z and stays in the undo history. A new circuit from the assistant opens in its own window, and what you have open is edited there in plain sight. Its files are in the assistant folder (Documents\Kirchi\Asistente), which you can change or reset in the same tab, and they are saved by themselves after each change. If an open file changes outside Kirchi, a notice offers “Reload” or “Keep mine”. If you disconnect, the assistant does not come back until you turn the permission off and on.

## Files

Circuits are saved as `.kir`, which open with a double click from the file explorer. Kirchi keeps backups and a journal to recover your work after an unexpected close. **Export image** (title row) produces SVG, PNG and PDF, with a white background by default and the option to export only the selection.

## Make a board

Kirchi does not draw the board: it prepares the project so you can make it in KiCad (8, 9 or 10, free at kicad.org) and order it from a manufacturer such as JLCPCB. With the circuit built in the schematic, choose **File › Export for manufacturing**.

The dialog lists every part with its KiCad footprint, the physical shape it will have on the board. You can change the footprint of a part, mark it as a connector (a power supply or a battery is not soldered: it arrives through a terminal block) or leave it out. A part without a footprint blocks the export and says what it lacks. Opening a row shows the pin map, which numbers each pin of the footprint with its name in Kirchi. Transistors in TO-92, TO-220 or SOT-23 packages carry a warning: the order of their pins changes with the model, and it is worth comparing it with the datasheet.

Then you choose what to write: the KiCad project (schematic, empty board and symbol library), the bill of materials for JLCPCB (`.csv`) or only the netlist. Kirchi creates a subfolder named after the project inside the folder you choose and writes the files there; if one with that name already exists, the new one is called “name (2)” and nothing is ever overwritten. The name comes from the circuit file. If the circuit is not saved yet, step 2 of the dialog asks for the name (it suggests “circuit”) and accepts letters, numbers, spaces, hyphen and underscore, up to 60 characters, with no names Windows reserves such as `CON` or `NUL`. The final notice offers to open the subfolder.

The guide **Help › Learn › Make a board** (also the “See the guide” button of the final notice) opens a separate window that stays at the side while you work in KiCad. It has sixteen steps (five for installing KiCad and working in Kirchi, eleven in KiCad and at the factory), each with its picture, a short list of actions and a “You should see” block to know whether it worked. It remembers the last step you saw. Menus appear with the name KiCad gives them in English.

1. **Open the project in KiCad.** Choose File › Open Project and the `.kicad_pro` file. The “created by an older version of KiCad” warning is normal.
2. **Check the schematic (optional).** Double-click the `.kicad_sch`, Inspect › Electrical Rules Checker and Run ERC. It should give 0 errors.
3. **Bring the parts to the board.** Double-click the `.kicad_pcb`, `F8` (Tools › Update PCB from Schematic) and Update PCB. It should give 0 errors and no “footprint not found”. A click on the sheet drops the parts.
4. **Zoom in and arrange the parts.** The mouse wheel zooms; drag, `M` moves and `R` rotates, with no overlaps. The thin lines are what is still to be joined.
5. **Draw the outline.** In the layer list at the top, `Edge.Cuts`; the rectangle icon in the right toolbar (Place › Draw Rectangle, or `Ctrl+Shift+R`); one click at the top left, another at the bottom right with a margin, and `Esc`. Check it with `Alt+3`, the 3D viewer.
6. **Route the traces.** `Esc`, layer `B.Cu`, `X`, click a pad and click the other following the thin line; double-click or click the pad to finish and `Ctrl+Z` if it goes wrong. The status bar should say Unrouted 0.
7. **Check the rules.** Inspect › Design Rules Checker and Run DRC. It should give 0 errors and 0 Unconnected Items; Silkscreen warnings do not prevent manufacturing.
8. **Print at 1:1 scale.** File › Print with the layers `B.Cu`, `F.Silkscreen` and `Edge.Cuts` and scale 1:1. Measure with a ruler and put the real parts on top: the short pin of the LED goes on the square pad. Also check the polarity of diodes, electrolytic capacitors and transistors.
9. **Generate the Gerber files.** File › Fabrication Outputs › Gerbers (.gbr). In Output directory type `gerber/` and KiCad creates the folder. Layers: `F.Cu`, `B.Cu`, `F.Paste`, `B.Paste`, `F.Silkscreen`, `B.Silkscreen`, `F.Mask`, `B.Mask` and `Edge.Cuts`. Check Use Protel filename extensions and Subtract soldermask from silkscreen, uncheck Generate Gerber job file and click Plot.
10. **Generate the drill files.** Generate Drill Files, with Excellon format, Oval holes in Use alternate drill mode, PTH and NPTH in single file unchecked, origin Absolute, units Millimeters, Decimal format and Map file in Gerber. Finish with Generate Drill File.
11. **Zip the folder and upload it.** Right-click the `gerber` folder › Compress to ZIP (on Windows 10, Send to › Compressed folder). That zip is what the manufacturer accepts: JLCPCB shows the board preview when you upload it, without paying. Order 5 two-layer boards with no assembly.

## Importing circuits from other programs

Kirchi opens circuits made in other programs. The accepted formats are the text exported by Falstad and CircuitJS (`.txt`), LTspice schematics (`.asc`), SPICE netlists (`.cir`, `.net`, `.sp`), KiCad 7 to 9 schematics (`.kicad_sch`) and Proteus 8 and 9 projects (`.pdsprj`, also their autosaved copies). The source program is recognized by the contents of the file, not by its extension.

To import, use Open (`Ctrl+O`) or drag the file into the window. The circuit opens as a new unsaved document and the original file is not modified. KiCad schematics with several sheets are read in full: Kirchi looks for the sheets in the folder of the main file.

When it opens, the import report appears, and afterwards it stays in Project. Its cards separate what is approximate (a similar part with another model), what has no equivalent, the nets joined by a label and the converted analyses. Hovering over a card, or giving it keyboard focus, highlights its parts on the canvas, and a click fits them in view. The report is saved with the file until you hide it.

What has no equivalent part stays as a gray box with the pins of the original. To change it, right-click it and choose “Replace with…”: the new part keeps the wires of the box.

The instruments and analyses of the original are kept: voltage and current probes, pulse and sine generators, DC sources, virtual multimeters and oscilloscopes, and the operating point, DC sweep, transient, AC and Fourier analyses. In Proteus, analog graphs become a transient analysis with their traces, and potentiometers keep the position of their wiper. Wires are routed again with Kirchi's router, so they do not follow the path of the original. Everything that could not be converted is noted in the report.

The assistant can also import: the `importar` tool converts a circuit from its folder and returns the report (see the Assistant section).
