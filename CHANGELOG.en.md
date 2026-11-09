# Changelog

The Spanish history from versions 1.0 to 3.0.0 is in [CHANGELOG.md](CHANGELOG.md). This file starts with 3.1.0.

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
