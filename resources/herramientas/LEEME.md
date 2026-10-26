# Herramientas externas

Esta carpeta viaja dentro del instalador (en `resources/herramientas/` junto al ejecutable) y el proceso principal la lee con `carpetaHerramientas()` de `src/main/recursos.ts`.

Aquí va ngspice 47, que Kirchi ejecuta como programa aparte (nunca enlazado). No se versiona: `node scripts/preparar-ngspice.mjs` lo deja en `ngspice/` (lo corre `npm run dist`). En Windows baja el paquete oficial una sola vez a `herramientas/cache/`, comprueba su SHA-256 (fijado en `scripts/ngspice-fuente.mjs`) y copia solo lo que usa `ngspice_con`, con sus textos de licencia. En macOS y Linux (`--fuentes`) compila el código oficial 47, también con su suma. Nada se descarga al instalar ni al abrir la aplicación.
