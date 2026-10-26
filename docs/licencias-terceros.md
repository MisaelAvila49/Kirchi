# Licencias de terceros

Kirchi se distribuye con la licencia MIT (`LICENSE`, Copyright (c) 2026 Misael Saúl Avila López), que viaja junto al ejecutable como `LICENSE.txt`. Lo que Kirchi lleva de terceros se divide en dos partes que se tratan distinto: lo que forma parte de su programa (bibliotecas de la interfaz, crates del motor y fuentes tipográficas), que solo admite licencias permisivas, y lo que viaja junto a él como programa aparte (Electron con Chromium, y ngspice), que conserva sus propias licencias, incluidas algunas recíprocas. Todos los textos se muestran en «Acerca de», en tres apartados plegables: la licencia de Kirchi, ngspice y Electron, y las licencias de terceros.

## Dentro del programa

La lista completa, con versión, licencia y texto de cada paquete, está en `src/renderer/src/ui/licenciasTerceros.json`, que genera `node scripts/generar-licencias.mjs` (o `npm run licencias`) a partir de `package.json`, `node_modules` y `engine/Cargo.lock`. Entran las dependencias de `dependencies` con las suyas (11 paquetes de npm) y los crates que compila el motor para `wasm32` (63). La prueba `src/renderer/src/ui/licencias.test.ts` falla si aparece una licencia copyleft sin alternativa permisiva o si el archivo no está al día, y el flujo de instaladores corre `node scripts/generar-licencias.mjs --revisar`.

Cada paquete lleva su propio texto. Se toman los archivos de licencia que publica (`LICENSE*`, `LICENCE*`, `COPYING`) junto con sus avisos (`NOTICE`, `COPYING.*`). Doce crates publican la licencia en su manifiesto pero no el archivo (`equator` 0.2.2, `equator-macro` 0.2.1, `faer` 0.24.4, `faer-traits` 0.24.0, `nano-gemm` 0.2.2 y sus seis subcrates 0.2.1, y `pulp-wasm-simd-flag` 0.1.1); para ellos el texto sale del repositorio del mismo crate en el commit exacto de esa versión y se guarda en `licencias/cargo/<crate>-<versión>/LICENSE`, con un `ORIGEN.txt` que da la dirección. La revisión comprueba que ese commit sea el que declara el crate en `.cargo_vcs_info.json`, que cada texto MIT, BSD, ISC o Zlib traiga su línea de derechos de autor y que no queden carpetas sin uso, de modo que un texto prestado de otro paquete o de otra versión detiene la construcción.

`faer` merece una nota aparte: además de su licencia MIT, trae avisos de algoritmos portados de LAPACK y de SuiteSparse (AMD y COLAMD), con licencia BSD, y de Eigen, con la Mozilla Public License 2.0. La MPL pide que quien recibe el programa pueda obtener el código fuente de esa parte, por eso el archivo `faer-0.24.4.crate` se entrega junto a los instaladores (ver «Código fuente»).

### Fuentes tipográficas

Las tres fuentes se importan desde `src/renderer/src/main.tsx` y salen empaquetadas en `out/renderer/assets/`. Las tres usan la SIL Open Font License 1.1, cuyo texto completo, con el aviso de cada una, va en la lista anterior.

| Fuente | Paquete (versión fija) | Aviso de derechos de autor | Nombre reservado |
|---|---|---|---|
| Mona Sans | `@fontsource-variable/mona-sans` 5.3.0 | Copyright 2022 The Mona Sans Project Authors (https://github.com/github/mona-sans) | «Mona» |
| Geist Mono | `@fontsource-variable/geist-mono` 5.3.0 | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git) | ninguno |
| Source Serif 4 | `@fontsource-variable/source-serif-4` 5.3.1 | Copyright 2014 - 2023 Adobe (http://www.adobe.com/), con nombre reservado «Source»; Source es marca de Adobe | «Source» |

El paquete de Fontsource de Source Serif 4 anota «Google Inc.» como titular, pero el aviso que manda es el de Adobe, que es el que trae el propio archivo de la fuente. La OFL 1.1 permite empaquetar las fuentes con un programa siempre que viajen con su aviso y su licencia, y no permite vender la fuente sola ni usar un nombre reservado en una versión modificada. Kirchi usa los archivos `.woff2` de Fontsource sin modificarlos y no los renombra. Las exportaciones también los llevan: el SVG incrusta en `@font-face` los mismos archivos (con el aviso de las tres en su `<desc>`) y el PDF, impreso por Chromium, los contornos de los glifos usados, lo que la OFL permite al incrustar fuentes en documentos.

Las tres versiones están sin `^` en `package.json`, y `lienzo/metricas.json` guarda la huella SHA-256 de los `.woff2` medidos; `lienzo/metricas.test.ts` falla si las fuentes instaladas no coinciden. Para actualizar una fuente se cambia la versión, se corre `node scripts/metricas-fuentes.mjs` y se revisa el reparto de las notas.

## Junto al programa

### Electron y Chromium

La interfaz corre en Electron 44 (MIT, Copyright (c) Electron contributors y GitHub Inc.), que trae Chromium y sus bibliotecas (BSD-3-Clause y otras, entre ellas FFmpeg con LGPL 2.1). En Windows y Linux, electron-builder deja junto al ejecutable `LICENSE.electron.txt` y `LICENSES.chromium.html` con todos sus avisos. En macOS electron-builder los borra del paquete (`electronMac.js`), por eso `mac.extraResources` de `electron-builder.yml` los copia a `Kirchi.app/Contents/Resources` como `LICENSE.electron.txt` y `LICENSES.chromium.html` (se suman a los recursos de ngspice, no los reemplazan). `scripts/revisar-firma-mac.sh`, el flujo de Linux y `src/main/paquete.test.ts` comprueban que los dos archivos estén en el paquete.

### ngspice 47

Kirchi ejecuta ngspice como un programa aparte, en su propio proceso y sin enlazarlo, para los análisis. Viaja en `resources/herramientas/ngspice/` con `COPYING-ngspice.txt` (su archivo COPYING, idéntico a `licencias/ngspice/COPYING`), `GPL-2.0.txt` y `AVISOS.txt`. `scripts/preparar-ngspice.mjs` detiene la construcción si el COPYING del paquete deja de coincidir con el revisado.

| Parte de ngspice | Dónde queda | Licencia |
|---|---|---|
| Simulador (Spice3f5 y lo demás) | ejecutable | BSD modificada (BSD-3-Clause), Regents of the University of California y otros |
| KLU (`src/maths/KLU`) | ejecutable | GNU LGPL 2.1 o posterior (AMD, COLAMD y BTF: BSD-3-Clause) |
| numparam | ejecutable | GNU LGPL 2 o posterior |
| OSDI (`src/osdi`) | ejecutable | Mozilla Public License 2.0 |
| sparse (`src/maths/sparse`) | ejecutable | tipo MIT |
| XSPICE | `lib/ngspice/*.cm` | dominio público |
| Modelo de código «table» | `lib/ngspice/table.cm` | GNU GPL 2 o posterior |

En macOS, Linux y Windows ngspice se compila en la corrida a partir del mismo código oficial `ngspice-47.tar.gz`, sin cambios, con las opciones de `CONFIGURE_BASE` en `scripts/preparar-ngspice.mjs`, que también quedan escritas en `AVISOS.txt`. Esas opciones apagan readline (GPL), OpenMP, FFTW (GPL), libsndfile y libsamplerate, para que el binario no enlace nada de la máquina que compila.

En Windows se compila con MinGW-w64 en una consola MSYS2 UCRT64 (trabajo «ngspice para Windows» de `instaladores.yml`, con `msys2/setup-msys2` fijado por su commit), con las mismas opciones más `--enable-relpath` y `LDFLAGS="-static-libgcc -static-libstdc++"`, `LIBS` con winpthreads estático (`--whole-archive`) y `make ISMINGW=1` (sin esa variable los `.cm` no reciben LDFLAGS porque `uname` en MSYS2 UCRT64 no contiene MINGW32); `ngspice.exe` se renombra a `ngspice_con.exe` y el `spinit` carga `../lib/ngspice/*.cm` como el del paquete oficial. No se usa el paquete oficial `ngspice-47_64.7z` porque traía `libomp140.x86_64.dll` (compilación de Microsoft del tiempo de ejecución de OpenMP, que Microsoft declara no redistribuible) y `sndfile.dll` (libsndfile con mpg123 y LAME, LGPL, cuyo código fuente exacto no se podía reconstruir). El script comprueba, leyendo la tabla de importaciones PE del ejecutable y de cada `.cm`, que solo se importen DLL del propio Windows (kernel32, la UCRT y similares), corre `ngspice_con.exe -v` y un deck XSPICE mínimo (modelo `gain`), y detiene la construcción si algo falla. Decisión sobre el tiempo de ejecución de GCC: se enlaza estático (`-static-libgcc -static-libstdc++`, bajo la excepción de tiempo de ejecución de GCC 3.1; con solo `-static-libgcc` quedaban libwinpthread-1, libstdc++-6 y libgcc_s_seh-1) y no se envía ninguna DLL de MinGW; si el compilador enlazara también winpthreads, es MIT. Los textos van en `resources/herramientas/ngspice/licencias/` (`gcc-runtime-exception.txt`, `GPL-3.0.txt`, `winpthreads.txt`, copiados de `licencias/ngspice-windows/`). El paquete oficial se sigue usando solo en la máquina de desarrollo para generar las referencias del motor (`scripts/referencias-ngspice.mjs`); no se distribuye.

Respaldo del tiempo de ejecución: libtool descarta -static-libgcc y -static-libstdc++ sueltas, así que si el ejecutable aún importa DLL de MinGW el script lo reenlaza con -XCClinker; si persisten y son solo libstdc++-6.dll, libwinpthread-1.dll y libgcc_s_seh-1.dll, las copia de MSYS2 UCRT64 junto a ngspice_con.exe (GPL 3 con la excepción de tiempo de ejecución de GCC 3.1 para libstdc++ y libgcc; MIT y BSD para winpthreads, con los textos de licencias/ngspice-windows/), anota la versión exacta de sus paquetes (pacman -Q) en AVISOS.txt y registra en el log si usó la ruta ESTÁTICA o la de RESPALDO. Cualquier otra DLL ajena, o una licencia que falte, detiene la construcción.

Para `npm run dist` en Windows sin compilar, `scripts/preparar-ngspice.mjs` toma la carpeta ya compilada de `KIRCHI_NGSPICE_WINDOWS` (el artefacto `kirchi-ngspice-windows` de la corrida de Instaladores, descomprimido; contiene `Spice64/`) o la de `herramientas/ngspice-windows/` si existe, y se detiene con instrucciones si no hay ninguna.

## Código fuente

La GPL, la LGPL y la MPL piden que quien recibe los binarios pueda obtener el código fuente correspondiente. `node scripts/preparar-fuentes.mjs` deja en `dist/fuentes-terceros/` los archivos oficiales, comprobados con su SHA-256, junto con un `LEEME.txt` y un `SHA256SUMS.txt`:

| Archivo | SHA-256 | Origen |
|---|---|---|
| `ngspice-47.tar.gz` | `894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f` | https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/ |
| `faer-0.24.4.crate` | `5ab6df3dd147fe8d702a288b95bcd8fcc499ab572fc80da6828f60cd4d524d67` | https://static.crates.io/crates/faer/faer-0.24.4.crate |

El flujo de instaladores la sube como artefacto `kirchi-fuentes-terceros` (trabajo «Código fuente de terceros»). Esa carpeta se entrega en el mismo lugar que los instaladores, que es lo que la GPL 2 (sección 3) da por cumplido cuando el binario se ofrece desde un lugar designado. `AVISOS.txt` y «Acerca de» lo dicen, y `AVISOS.txt` agrega una oferta por escrito de enviar el código durante tres años por si el archivo no está disponible. Las sumas salen de `scripts/ngspice-fuente.mjs` y de `engine/Cargo.lock`, así que cambiar de versión cambia también lo que se entrega.

## Datos de las piezas

Los símbolos SVG de `componentes/` son dibujos propios y no traen metadatos de otros programas ni de bancos de símbolos. Los parámetros eléctricos son cifras: la mayoría se ajustaron por Kirchi a las hojas de datos de los fabricantes, que se citan en el campo `fuentes` de cada `pieza.json` con documento, revisión y dirección. El repositorio no contiene archivos de modelo SPICE de fabricantes ni sus textos.

Los seis transistores de señal (2N2222, 2N3904, BC547, 2N2907, 2N3906 y BC557) usan parámetros ajustados por Kirchi a las hojas de datos, citadas en `fuentes` de cada pieza.
