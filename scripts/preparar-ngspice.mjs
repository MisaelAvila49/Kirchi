// Deja ngspice 47 en resources/herramientas/ngspice/ para electron-builder. Con `--fuentes` baja el código oficial, comprueba su SHA-256 y lo compila (MSYS2 UCRT64 en Windows, que deja herramientas/ngspice-windows/); sin ella en Windows toma KIRCHI_NGSPICE_WINDOWS. `--reutilizar` solo revisa la caché.
// Se corre al construir, nunca al ejecutar Kirchi. Una suma distinta o una descarga incompleta detienen la construcción. Windows no usa el paquete oficial: trae libomp140 (no redistribuible) y sndfile (LGPL, fuente no reconstruible), así que se compila sin OpenMP, libsndfile, libsamplerate ni FFTW y se comprueba que no importe más DLL que las de Windows.
// Licencias: COPYING debe ser idéntico a licencias/ngspice/COPYING. Junto al programa quedan COPYING-ngspice.txt, GPL-2.0.txt (table.cm es GPL 2 o posterior), AVISOS.txt y, en Windows, los textos del tiempo de ejecución de GCC y winpthreads enlazados estáticos.

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUENTES, VERSION } from './ngspice-fuente.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CACHE = join(raiz, 'herramientas', 'cache')
export const DESTINO = join(raiz, 'resources', 'herramientas', 'ngspice')
/** Textos de licencia versionados en el repositorio (públicos): los de ngspice y los del tiempo de ejecución de MinGW (Windows). */
export const LICENCIAS = join(raiz, 'licencias')
/** Carpeta con ngspice ya compilado para Windows (`Spice64/...`): la deja `--fuentes` en MSYS2 y la consume el empaquetado. */
export const PREPARADO_WINDOWS = join(raiz, 'herramientas', 'ngspice-windows')

export function sumaSha256(datos) {
  return createHash('sha256').update(datos).digest('hex')
}

/** Baja una URL entera a memoria. Devuelve los bytes y el largo que anunció el servidor (null si no lo dijo). */
async function descargarUnaVez(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`La descarga falló: ${res.status} ${res.statusText} (${url})`)
  const anunciado = Number(res.headers.get('content-length'))
  return { datos: Buffer.from(await res.arrayBuffer()), longitud: Number.isFinite(anunciado) && anunciado > 0 ? anunciado : null }
}

/** Hasta `intentos` descargas con espera creciente (2 s, 4 s...) entre una y otra: un «fetch failed» suelto no detiene la construcción. */
export async function descargarConFetch(url, { intentos = 3, espera = 2000, una = descargarUnaVez, registro = console.log } = {}) {
  for (let n = 1; ; n++) {
    try {
      return await una(url)
    } catch (e) {
      if (n >= intentos) throw e
      registro(`Intento ${n} de ${intentos} fallido (${e.message}); se reintenta.`)
      await new Promise((r) => setTimeout(r, espera * n))
    }
  }
}

/** Ruta de un archivo con la suma esperada: reutiliza la caché si coincide, si no la borra y baja de nuevo. Una descarga incompleta o con otra suma lanza error y no deja nada en la caché. */
export async function asegurarArchivo({ cache, nombre, url, sha256, descargar = descargarConFetch, registro = () => {} }) {
  mkdirSync(cache, { recursive: true })
  const ruta = join(cache, nombre)
  if (existsSync(ruta)) {
    if (sumaSha256(readFileSync(ruta)) === sha256) {
      registro(`${nombre}: ya está en la caché, suma correcta.`)
      return { ruta, reutilizado: true }
    }
    registro(`${nombre}: la copia de la caché no coincide con la suma fijada, se baja de nuevo.`)
    rmSync(ruta, { force: true })
  }
  registro(`Descargando ${nombre}...`)
  const { datos, longitud } = await descargar(url)
  if (longitud !== null && datos.length !== longitud) throw new Error(`La descarga de ${nombre} quedó incompleta: ${datos.length} de ${longitud} bytes.`)
  const suma = sumaSha256(datos)
  if (suma !== sha256) throw new Error(`La suma SHA-256 de ${nombre} no coincide (esperada ${sha256}, recibida ${suma}).`)
  // Se escribe con otro nombre y se renombra al final: una interrupción no deja un archivo a medias con el nombre bueno.
  const parcial = `${ruta}.parcial`
  writeFileSync(parcial, datos)
  renameSync(parcial, ruta)
  return { ruta, reutilizado: false }
}

/** Lo que se copia de la carpeta `Spice64` compilada para Windows, relativo a ella. El servicio busca `Spice64/bin/ngspice_con.exe`. */
export const ARCHIVOS_WINDOWS = ['bin/ngspice_con.exe', 'share/ngspice/scripts/spinit']
export const MODELOS_DE_CODIGO = ['analog', 'digital', 'spice2poly', 'table', 'tlines', 'xtradev', 'xtraevt']

/** Opciones de `configure` con que se compila ngspice en macOS y Linux (también van en AVISOS.txt, para poder recompilarlo igual). */
export const CONFIGURE_BASE = [
  '--prefix=/opt/kirchi-ngspice',
  '--with-x=no',
  '--without-readline',
  '--disable-debug',
  '--enable-xspice',
  '--disable-openmp',
  // Sin bibliotecas del sistema que no viajan en el instalador: FFTW (GPL), libsndfile y libsamplerate. configure las enlaza si
  // están instaladas en la máquina que compila; así el binario no depende de la máquina ni de nada que no vaya en el paquete.
  '--with-fftw3=no',
  'ac_cv_lib_sndfile_sf_command=no',
  'ac_cv_lib_samplerate_src_process=no'
]

/** Opciones de `configure` en Windows (MSYS2 UCRT64): las de Unix más rutas relativas al ejecutable y el tiempo de ejecución de GCC estático (excepción de GCC 3.1). Sin OpenMP, libsndfile, libsamplerate ni FFTW. */
export const CONFIGURE_WINDOWS = [...CONFIGURE_BASE, '--enable-relpath']
/** Enlace estático de GCC y winpthreads (sin libgcc_s_seh-1, libstdc++-6 ni libwinpthread-1). winpthreads entra completo (`--whole-archive`) para que libstdc++ resuelva ahí sus hilos. LDFLAGS lo llevan el ejecutable y los `.cm`; LIBS solo el ejecutable. */
export const LDFLAGS_WINDOWS = '-static-libgcc -static-libstdc++'
export const LIBS_WINDOWS = '-Wl,-Bstatic,--whole-archive -lwinpthread -Wl,--no-whole-archive -Wl,-Bdynamic'
/** Variables de `make` en Windows: makedefs solo agrega @LDFLAGS@ al enlace de los `.cm` si `uname` contiene MINGW32, y en UCRT64 dice MINGW64_NT. Sin esto los `.cm` salen con libgcc_s_seh-1.dll. */
export const MAKE_WINDOWS = ['ISMINGW=1']

/** Las DLL que un binario de Windows puede importar: las del propio sistema (Windows 10 1809 o posterior, incluida la UCRT). */
export const DLL_DE_WINDOWS =
  /^(kernel32|kernelbase|user32|gdi32|advapi32|shell32|shlwapi|psapi|ws2_32|ole32|oleaut32|comdlg32|comctl32|winmm|version|bcrypt|crypt32|ntdll|msvcrt|ucrtbase|imm32|rpcrt4|iphlpapi|userenv|setupapi|api-ms-win-[a-z0-9-]+-l\d+-\d+-\d+)\.dll$/i

/** Los nombres de las DLL que importa un ejecutable o DLL de Windows (PE/PE32+), incluidas las de carga diferida. Lanza si no es un PE. */
export function dllsImportadas(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new Error('No es un ejecutable de Windows (PE).')
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('No es un ejecutable de Windows (PE).')
  const secciones = buf.readUInt16LE(pe + 6)
  const tamOpcional = buf.readUInt16LE(pe + 20)
  const opt = pe + 24
  const dir = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96)
  const nDirs = buf.readUInt32LE(dir - 4)
  const primera = opt + tamOpcional
  const aOffset = (rva) => {
    for (let i = 0; i < secciones; i++) {
      const s = primera + 40 * i
      const va = buf.readUInt32LE(s + 12)
      if (rva >= va && rva < va + Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16))) return rva - va + buf.readUInt32LE(s + 20)
    }
    throw new Error('El ejecutable tiene una tabla de importaciones fuera de sus secciones.')
  }
  const nombre = (rva) => {
    const o = aOffset(rva)
    return buf.toString('latin1', o, buf.indexOf(0, o))
  }
  const nombres = []
  const rvaImport = nDirs > 1 ? buf.readUInt32LE(dir + 8) : 0
  if (rvaImport) for (let o = aOffset(rvaImport); buf.readUInt32LE(o + 12) !== 0; o += 20) nombres.push(nombre(buf.readUInt32LE(o + 12)))
  const rvaDiferida = nDirs > 13 ? buf.readUInt32LE(dir + 13 * 8) : 0
  if (rvaDiferida) for (let o = aOffset(rvaDiferida); buf.readUInt32LE(o + 4) !== 0; o += 32) nombres.push(nombre(buf.readUInt32LE(o + 4)))
  return [...new Set(nombres)]
}

/** Respaldo si el enlace estático no quitó el tiempo de ejecución de MinGW (libtool descarta banderas): se entregan estas tres DLL con sus licencias. Cualquier otra DLL ajena detiene la construcción. */
export const DLL_RUNTIME_MINGW = ['libstdc++-6.dll', 'libwinpthread-1.dll', 'libgcc_s_seh-1.dll']
/** Textos de licencia (en licencias/ngspice-windows) que exige cada DLL del respaldo. */
export const LICENCIAS_DE_DLL = {
  'libstdc++-6.dll': ['GPL-3.0.txt', 'gcc-runtime-exception.txt'],
  'libgcc_s_seh-1.dll': ['GPL-3.0.txt', 'gcc-runtime-exception.txt'],
  'libwinpthread-1.dll': ['winpthreads.txt']
}
/** Paquetes de MSYS2 de los que salen esas DLL (se anota su versión exacta en AVISOS.txt). */
export const PAQUETES_RUNTIME = ['mingw-w64-ucrt-x86_64-gcc-libs', 'mingw-w64-ucrt-x86_64-libwinpthread']

/** Decide qué hacer con las DLL ajenas: ninguna es modo «estatico»; solo las tres de MinGW con sus licencias es «respaldo»; cualquier otra, o una licencia ausente, lanza. */
export function decidirRuntime(ajenas, licenciasPresentes) {
  const unicas = [...new Set(ajenas.map((n) => n.toLowerCase()))].sort()
  if (unicas.length === 0) return { modo: 'estatico', dlls: [] }
  const desconocidas = unicas.filter((n) => !DLL_RUNTIME_MINGW.includes(n))
  if (desconocidas.length > 0) throw new Error(`ngspice para Windows importa DLL que no se pueden entregar: ${desconocidas.join(', ')}`)
  const faltan = [...new Set(unicas.flatMap((n) => LICENCIAS_DE_DLL[n]))].filter((l) => !licenciasPresentes.includes(l))
  if (faltan.length > 0) throw new Error(`Falta la licencia ${faltan.join(', ')} de las DLL del tiempo de ejecución (${unicas.join(', ')}).`)
  return { modo: 'respaldo', dlls: unicas }
}

/** Los archivos a revisar de una carpeta Spice64: el ejecutable y los `.cm`. */
function archivosBase(spice64) {
  const modelos = join(spice64, 'lib', 'ngspice')
  return [join(spice64, 'bin', 'ngspice_con.exe'), ...readdirSync(modelos).filter((f) => f.endsWith('.cm')).map((f) => join(modelos, f))]
}

/** Importaciones ajenas (no de Windows) de forma transitiva: ejecutable, `.cm` y las DLL ajenas ya entregadas (libstdc++-6 importa libgcc_s_seh-1). Devuelve `{ ajenas, archivos }` en minúsculas. */
export function cierreDeDependencias(spice64) {
  const bin = join(spice64, 'bin')
  const enBin = existsSync(bin) ? readdirSync(bin) : []
  const archivos = archivosBase(spice64)
  const ajenas = new Set()
  for (let i = 0; i < archivos.length; i++) {
    for (const n of dllsImportadas(readFileSync(archivos[i]))) {
      if (DLL_DE_WINDOWS.test(n)) continue
      const m = n.toLowerCase()
      if (ajenas.has(m)) continue
      ajenas.add(m)
      const real = enBin.find((e) => e.toLowerCase() === m)
      if (real) archivos.push(join(bin, real))
    }
  }
  return { ajenas: [...ajenas], archivos }
}

/** Falla si algún binario importa una DLL que no sea de Windows, no esté junto al ejecutable (libomp, sndfile...) ni sea del tiempo de ejecución de MinGW. Revisa el cierre completo. */
export function comprobarDependenciasWindows(spice64, licencias = LICENCIAS) {
  const { ajenas, archivos } = cierreDeDependencias(spice64)
  const dir = join(licencias, 'ngspice-windows')
  const decision = decidirRuntime(ajenas, existsSync(dir) ? readdirSync(dir) : [])
  const enBin = readdirSync(join(spice64, 'bin')).map((n) => n.toLowerCase())
  for (const d of decision.dlls) if (!enBin.includes(d)) throw new Error(`Falta ${d} junto a ngspice_con.exe (lo piden el ejecutable, un .cm u otra DLL entregada).`)
  decision.archivos = archivos
  return decision
}

/** El aviso que acompaña a ngspice: qué es cada parte, con qué licencia, de qué archivo sale y dónde está su código fuente. */
export function avisoNgspice(plataforma) {
  const binario =
    plataforma === 'win32'
      ? `Se compiló a partir del código fuente oficial, sin cambios, con MinGW-w64 (GCC, UCRT, consola MSYS2 UCRT64), con:
  LDFLAGS="${LDFLAGS_WINDOWS}" LIBS="${LIBS_WINDOWS}" ./configure ${CONFIGURE_WINDOWS.join(' ')}
  make ${MAKE_WINDOWS.join(' ')} && make ${MAKE_WINDOWS.join(' ')} install
y el ejecutable se renombró de ngspice.exe a ngspice_con.exe. No lleva OpenMP, libsndfile, libsamplerate ni FFTW, y solo importa
DLL del propio Windows (se comprueba al construir). El tiempo de ejecución de GCC va enlazado estático bajo la excepción de tiempo
de ejecución de GCC 3.1 (licencias/gcc-runtime-exception.txt y GPL-3.0.txt); winpthreads, también estático, es de licencia MIT
y BSD (licencias/winpthreads.txt).`
      : `Se compiló a partir del código fuente oficial, sin cambios, con:
  ./configure ${CONFIGURE_BASE.join(' ')}${plataforma === 'darwin' ? ' --disable-dependency-tracking\n  (con -arch arm64 -arch x86_64 en CFLAGS, CXXFLAGS y LDFLAGS)' : ''}
  make && make install`
  return `Kirchi y ngspice ${VERSION}
==================

Kirchi no incluye el código de ngspice dentro de su programa: ejecuta ngspice ${VERSION} como un programa aparte, en su propio
proceso, para los análisis (punto de operación, transitorio, CA, barridos y Fourier). Kirchi es MIT; ngspice conserva sus licencias.

Partes de ngspice y sus licencias (detalle y textos completos en COPYING-ngspice.txt):
  Simulador (Spice3f5 y lo demás)       Licencia BSD modificada (BSD-3-Clause), Regents of the University of California y otros.
  KLU (src/maths/KLU, en el ejecutable) GNU LGPL 2.1 o posterior (SuiteSparse, Timothy A. Davis); AMD, COLAMD y BTF son BSD-3-Clause.
  numparam (en el ejecutable)           GNU LGPL 2 o posterior.
  OSDI (src/osdi, en el ejecutable)     Mozilla Public License 2.0.
  sparse (src/maths/sparse)             Licencia tipo MIT.
  XSPICE (lib/ngspice/*.cm)             Dominio público.
  Modelo de código "table" (table.cm)   GNU GPL 2 o posterior. Es un módulo aparte que ngspice carga; texto en GPL-2.0.txt.

${binario}

Código fuente
-------------
El código fuente completo y correspondiente es el archivo oficial ${FUENTES.nombre}
  SHA-256 ${FUENTES.sha256}
Se entrega en la misma carpeta de descarga que los instaladores de Kirchi y también está en
  ${FUENTES.url.replace(/\/download$/, '')}
Si no lo encuentras ahí, el autor de Kirchi (Misael Saúl Avila López, misaelavila49@gmail.com) te envía una copia, sin otro
costo que el de enviarla, durante al menos tres años desde la última vez que distribuya esta versión.
Con ese código se puede modificar cualquier parte (también KLU y numparam, que son LGPL) y volver a compilar ngspice;
Kirchi usa el que esté en esta carpeta.
`
}

const AVISO_WINDOWS = `
Tiempo de ejecución en Windows: ninguna DLL de terceros acompaña a ngspice_con.exe ni a los .cm. Los textos de la carpeta licencias/
(excepción de tiempo de ejecución de GCC, GPL 3 y winpthreads) cubren el código de MinGW enlazado estático dentro de los binarios.
`

/** Aviso cuando el enlace estático no bastó y las DLL del tiempo de ejecución de MinGW viajan junto al ejecutable. */
export function avisoRespaldo(dlls, versiones) {
  return `
Tiempo de ejecución en Windows: el enlace estático no quitó estas DLL de MSYS2 UCRT64, que viajan junto a ngspice_con.exe sin cambios:
  ${dlls.join(', ')}
Paquetes de MSYS2 de los que salen (versión exacta):
  ${versiones.split(String.fromCharCode(10)).join(String.fromCharCode(10) + '  ')}
libstdc++ y libgcc: GNU GPL 3 con la excepción de tiempo de ejecución de GCC 3.1 (licencias/GPL-3.0.txt y licencias/gcc-runtime-exception.txt).
libwinpthread: MIT y BSD (licencias/winpthreads.txt). El código fuente de estos paquetes está en https://packages.msys2.org
y en el repositorio de MSYS2 (https://github.com/msys2/MINGW-packages), y se envía una copia a quien la pida a la dirección de arriba.
`
}

const normalizar = (t) => t.replace(/\r\n/g, '\n').trim()

/** El COPYING del paquete tiene que ser el revisado (licencias/ngspice/COPYING), o la construcción se detiene. */
export function comprobarCopying(copying, licencias = LICENCIAS) {
  const revisado = join(licencias, 'ngspice', 'COPYING')
  if (normalizar(readFileSync(copying, 'utf8')) !== normalizar(readFileSync(revisado, 'utf8')))
    throw new Error(`El COPYING de ngspice no es el revisado (${revisado}): revisa sus licencias, copia el nuevo y regenera las licencias.`)
}

/** Deja junto a ngspice su COPYING y el texto de la GPL 2 (la de table.cm). */
function copiarLicencias(copying, destino, licencias) {
  copyFileSync(copying, join(destino, 'COPYING-ngspice.txt'))
  copyFileSync(join(licencias, 'ngspice', 'GPL-2.0.txt'), join(destino, 'GPL-2.0.txt'))
}

/** Copia la selección mínima desde `Spice64` ya extraída. Falla con el primer archivo ausente para que un paquete distinto detenga la construcción. */
export function seleccionarWindows(spice64, destino, licencias = LICENCIAS) {
  const lista = [...ARCHIVOS_WINDOWS, ...MODELOS_DE_CODIGO.map((m) => `lib/ngspice/${m}.cm`)]
  for (const r of [...lista, 'docs/COPYING']) if (!existsSync(join(spice64, r))) throw new Error(`Al paquete de ngspice le falta ${r}.`)
  comprobarCopying(join(spice64, 'docs', 'COPYING'), licencias)
  rmSync(destino, { recursive: true, force: true })
  const base = join(destino, 'Spice64')
  const entregadas = DLL_RUNTIME_MINGW.filter((d) => existsSync(join(spice64, 'bin', d)))
  const { dlls } = decidirRuntime(entregadas, readdirSync(join(licencias, 'ngspice-windows')))
  const versionesRuta = join(spice64, 'docs', 'runtime-versiones.txt')
  const versiones = existsSync(versionesRuta) ? readFileSync(versionesRuta, 'utf8').trim() : 'versión no registrada'
  for (const d of dlls) lista.push(`bin/${d}`)
  for (const r of lista) {
    mkdirSync(dirname(join(base, r)), { recursive: true })
    copyFileSync(join(spice64, r), join(base, r))
  }
  copiarLicencias(join(spice64, 'docs', 'COPYING'), destino, licencias)
  mkdirSync(join(destino, 'licencias'), { recursive: true })
  for (const f of readdirSync(join(licencias, 'ngspice-windows'))) copyFileSync(join(licencias, 'ngspice-windows', f), join(destino, 'licencias', f))
  writeFileSync(join(destino, 'AVISOS.txt'), avisoNgspice('win32') + (dlls.length > 0 ? avisoRespaldo(dlls, versiones) : AVISO_WINDOWS))
  return lista
}

/** Copia el ejecutable y los `.cm` de la instalación de ngspice en macOS y Linux (`make install` los deja en bin y lib/ngspice). */
export function seleccionarUnix(instalado, destino, copiaLicencia, licencias = LICENCIAS, plataforma = process.platform) {
  const bin = join(instalado, 'bin', 'ngspice')
  const lib = join(instalado, 'lib', 'ngspice')
  for (const r of [bin, lib, copiaLicencia]) if (!existsSync(r)) throw new Error(`Falta ${r} en la instalación de ngspice.`)
  const modelos = readdirSync(lib).filter((f) => f.endsWith('.cm'))
  for (const m of MODELOS_DE_CODIGO) if (!modelos.includes(`${m}.cm`)) throw new Error(`Falta el modelo de código ${m}.cm.`)
  comprobarCopying(copiaLicencia, licencias)
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(join(destino, 'bin'), { recursive: true })
  mkdirSync(join(destino, 'lib', 'ngspice'), { recursive: true })
  copyFileSync(bin, join(destino, 'bin', 'ngspice'))
  for (const m of modelos) copyFileSync(join(lib, m), join(destino, 'lib', 'ngspice', m))
  copiarLicencias(copiaLicencia, destino, licencias)
  writeFileSync(join(destino, 'AVISOS.txt'), avisoNgspice(plataforma))
  return modelos
}

/** Entorno de prueba del ejecutable. En Windows, PATH solo con System32 y SystemRoot: ucrt64/bin en el PATH ocultaría una DLL que falte (así llegó 1.1.0 sin libgcc_s_seh-1.dll). */
export function entornoLimpio(extra = {}, base = process.env, plataforma = process.platform) {
  if (plataforma !== 'win32') return { ...base, ...extra }
  const raizWin = base.SystemRoot ?? base.SYSTEMROOT ?? 'C:\\Windows'
  return { SystemRoot: raizWin, PATH: join(raizWin, 'System32'), ...extra }
}

function comprobarVersion(ejecutable) {
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-ver-'))
  try {
    const r = spawnSync(ejecutable, ['-n', '-v'], { cwd: tmp, encoding: 'utf8', windowsHide: true, env: entornoLimpio() })
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
    if (!new RegExp(`ngspice-${VERSION}\\b`).test(salida)) {
      const arranque = r.status !== 0 ? ` No arrancó (código ${r.status}${r.status === -1073741515 ? ', falta una DLL' : ''}).` : ''
      throw new Error(`Se necesita ngspice-${VERSION} y ${ejecutable} dice otra cosa.${arranque} ${salida.slice(0, 300)}`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function ejecutar(orden, args, cwd, env = process.env) {
  const r = spawnSync(orden, args, { cwd, stdio: 'inherit', env })
  if (r.status !== 0) throw new Error(`Falló: ${orden} ${args.join(' ')}`)
}

/** En macOS el dmg es universal: ngspice y los `.cm` se compilan para ambas arquitecturas. Con varios `-arch` el compilador no admite seguimiento de dependencias (`--disable-dependency-tracking`). */
const ARCH_MAC = '-arch arm64 -arch x86_64'

export function opcionesDeCompilacion(plataforma, envBase = process.env) {
  const configure = [...CONFIGURE_BASE]
  if (plataforma !== 'darwin') return { configure, env: envBase }
  const env = { ...envBase, CFLAGS: `${envBase.CFLAGS ?? ''} ${ARCH_MAC}`.trim(), CXXFLAGS: `${envBase.CXXFLAGS ?? ''} ${ARCH_MAC}`.trim(), LDFLAGS: `${envBase.LDFLAGS ?? ''} ${ARCH_MAC}`.trim() }
  return { configure: [...configure, '--disable-dependency-tracking'], env }
}

/** Comprueba con `lipo` que un binario de macOS trae las dos arquitecturas. */
function comprobarUniversal(archivo) {
  const r = spawnSync('lipo', ['-archs', archivo], { encoding: 'utf8' })
  const archs = (r.stdout ?? '').trim().split(/\s+/)
  if (!archs.includes('arm64') || !archs.includes('x86_64')) throw new Error(`${archivo} no es universal (${archs.join(' ') || 'sin arquitecturas'}).`)
}

/** El `spinit` de `make install` carga `.cm` con rutas relativas y bloques `osdi`. Se deja solo con los `.cm` que viajan y, si se da `base`, con rutas absolutas. */
export function reescribirSpinit(texto, cm, base = null) {
  const citar = (r) => (/\s/.test(r) ? '"' + r + '"' : r)
  const fuera = []
  let osdi = false
  for (const l of texto.split(/\r?\n/)) {
    if (/^\s*if\s+\$\?osdi_enabled/.test(l)) osdi = true
    if (!osdi) {
      const m = /^(\s*)codemodel\s+(\S+?)\s*$/.exec(l)
      if (!m) fuera.push(l)
      else {
        const nombre = m[2].replace(/^.*[\\/]/, '')
        if (cm.includes(nombre)) fuera.push(m[1] + 'codemodel ' + (base ? citar(base.replace(/[\\]/g, '/') + '/' + nombre) : m[2]))
      }
    }
    if (osdi && /^\s*end\s*$/.test(l)) osdi = false
  }
  return fuera.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n')
}

/** Un deck mínimo con un modelo de código de XSPICE (`gain`): si el spinit no cargó los `.cm`, ngspice no lo entiende. */
const DECK_XSPICE = `Prueba XSPICE de Kirchi
V1 in 0 1
A1 in out gm
.model gm gain(gain=2)
R1 out 0 1k
.control
op
print v(out)
.endc
.end
`

/** Corre `ngspice_con.exe -v` y un deck XSPICE (el spinit relativo tiene que encontrar los `.cm`). */
function verificarEjecutable(ejecutable) {
  comprobarVersion(ejecutable)
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-xspice-'))
  try {
    writeFileSync(join(tmp, 'xspice.cir'), DECK_XSPICE)
    // Como en la aplicación (escribirSpinit): un spinit con rutas absolutas y SPICE_SCRIPTS (SPICE_LIB_DIR lo ignora --enable-relpath), sin depender de --enable-relpath.
    const modelos = join(dirname(dirname(ejecutable)), 'lib', 'ngspice')
    const original = join(dirname(dirname(ejecutable)), 'share', 'ngspice', 'scripts', 'spinit')
    const cm = readdirSync(modelos).filter((f) => f.endsWith('.cm'))
    mkdirSync(join(tmp, 'spice', 'scripts'), { recursive: true })
    const spinit = join(tmp, 'spice', 'scripts', 'spinit')
    writeFileSync(spinit, reescribirSpinit(existsSync(original) ? readFileSync(original, 'utf8') : 'if $?xspice_enabled\n\n end\n', cm, modelos))
    console.log(`spinit usado: ${spinit} (SPICE_SCRIPTS=${join(tmp, 'spice', 'scripts')}); original empaquetado: ${original} (${existsSync(original) ? 'existe' : 'FALTA'})`)
    console.log(readFileSync(spinit, 'utf8'))
    const r = spawnSync(ejecutable, ['-b', 'xspice.cir'], { cwd: tmp, encoding: 'utf8', windowsHide: true, timeout: 60_000, env: entornoLimpio({ SPICE_LIB_DIR: join(tmp, 'spice'), SPICE_SCRIPTS: join(tmp, 'spice', 'scripts') }) })
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
    if (!/v\(out\)\s*=\s*2\.0+e\+00/i.test(salida)) throw new Error(`El deck XSPICE de prueba no dio v(out) = 2 con ${ejecutable}:\n${salida}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Revisa una carpeta `Spice64` compilada: solo DLL del sistema, versión 47 y un modelo de código XSPICE funcionando. */
export function verificarWindows(spice64) {
  const { archivos, modo, dlls } = comprobarDependenciasWindows(spice64)
  console.log(`Importaciones revisadas en ${archivos.length} archivos. Tiempo de ejecución de MinGW: ${modo === 'estatico' ? 'ESTÁTICO (solo DLL del sistema)' : `RESPALDO, se entregan ${dlls.join(', ')} con sus licencias`}.`)
  verificarEjecutable(join(spice64, 'bin', 'ngspice_con.exe'))
}

export const AYUDA_WINDOWS = `ngspice para Windows ya no viene del paquete oficial (trae libomp140 y sndfile, que no se pueden redistribuir). Opciones:
  1. Bajar el artefacto «kirchi-ngspice-windows» de una corrida de Instaladores en GitHub Actions, descomprimirlo y apuntar
     KIRCHI_NGSPICE_WINDOWS a esa carpeta (la que contiene Spice64/). En PowerShell: $env:KIRCHI_NGSPICE_WINDOWS = 'C:\\ruta\\ngspice-windows'
  2. Instalar MSYS2 (https://www.msys2.org), abrir su consola UCRT64, instalar gcc, make y nodejs
     (pacman -S mingw-w64-ucrt-x86_64-gcc make mingw-w64-ucrt-x86_64-nodejs) y correr allí: node scripts/preparar-ngspice.mjs --fuentes
     Eso deja herramientas/ngspice-windows/, que el modo normal reconoce solo.`

/** Windows sin compilar: toma la carpeta ya compilada (`KIRCHI_NGSPICE_WINDOWS`, o herramientas/ngspice-windows si existe). */
async function paraWindows(preparado) {
  const dada = preparado ?? process.env.KIRCHI_NGSPICE_WINDOWS
  const carpeta = dada ? resolve(dada) : existsSync(join(PREPARADO_WINDOWS, 'Spice64')) ? PREPARADO_WINDOWS : null
  if (!carpeta) throw new Error(`No hay ngspice compilado para Windows.\n${AYUDA_WINDOWS}`)
  const spice64 = join(carpeta, 'Spice64')
  if (!existsSync(join(spice64, 'bin', 'ngspice_con.exe'))) throw new Error(`En ${carpeta} no hay Spice64/bin/ngspice_con.exe.\n${AYUDA_WINDOWS}`)
  verificarWindows(spice64)
  const lista = seleccionarWindows(spice64, DESTINO)
  console.log(`ngspice ${VERSION}: ${lista.length} archivos en ${DESTINO}`)
  comprobarVersion(join(DESTINO, 'Spice64', 'bin', 'ngspice_con.exe'))
}

/** Convierte una ruta de Windows a la que entiende MSYS2 (para DESTDIR). */
function rutaMsys(ruta) {
  const r = spawnSync('cygpath', ['-u', ruta], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('No se pudo convertir la ruta con cygpath.')
  return r.stdout.trim()
}

/** Dos capas: 1) si el ejecutable aún importa DLL de MinGW, se reenlaza solo con las banderas pasadas a libtool con -XCClinker (suelto las descarta); 2) si quedan solo las tres de MinGW, se copian de MSYS2 con su versión. Lo demás detiene la construcción. */
function respaldoRuntime(spice64, fuentes, origen, env) {
  let ajenas = cierreDeDependencias(spice64).ajenas
  if (ajenas.length === 0) return console.log('Tiempo de ejecución de MinGW: ruta ESTÁTICA, sin DLL ajenas.')
  console.log(`El enlace estático dejó importaciones (${ajenas.join(', ')}). Segundo intento: relink del ejecutable con -XCClinker.`)
  try {
    rmSync(join(fuentes, 'src', 'ngspice.exe'), { force: true })
    const ld = `${LDFLAGS_WINDOWS} -XCClinker -static-libgcc -XCClinker -static-libstdc++`
    ejecutar('make', ['-C', 'src', 'ngspice.exe', ...MAKE_WINDOWS, `LDFLAGS=${ld}`], fuentes, env)
    copyFileSync(join(fuentes, 'src', 'ngspice.exe'), join(spice64, 'bin', 'ngspice_con.exe'))
    ajenas = cierreDeDependencias(spice64).ajenas
  } catch (e) {
    console.log(`El relink no se pudo: ${e.message}`)
  }
  if (ajenas.length === 0) return console.log('Tiempo de ejecución de MinGW: ruta ESTÁTICA (tras relink), sin DLL ajenas.')
  const dir = join(LICENCIAS, 'ngspice-windows')
  const { dlls } = decidirRuntime(ajenas, existsSync(dir) ? readdirSync(dir) : [])
  const bin = join(process.env.MINGW_PREFIX ? rutaWin(process.env.MINGW_PREFIX) : rutaWin('/ucrt64'), 'bin')
  // Cada DLL copiada puede pedir otra (libstdc++ pide libgcc_s): se repite hasta que el cierre quede completo.
  const copiadas = new Set()
  for (let pendientes = dlls; pendientes.length > 0; ) {
    for (const d of pendientes) {
      const real = readdirSync(bin).find((n) => n.toLowerCase() === d)
      if (!real) throw new Error(`No está ${d} en ${bin}.`)
      copyFileSync(join(bin, real), join(spice64, 'bin', d))
      copiadas.add(d)
    }
    const nuevas = cierreDeDependencias(spice64).ajenas.filter((n) => !copiadas.has(n))
    pendientes = decidirRuntime(nuevas, existsSync(dir) ? readdirSync(dir) : []).dlls
  }
  const versiones = PAQUETES_RUNTIME.map((p) => {
    const r = spawnSync('pacman', ['-Q', p], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : `${p} (versión no disponible)`
  }).join('\n')
  writeFileSync(join(spice64, 'docs', 'runtime-versiones.txt'), versiones + '\n')
  console.log(`Tiempo de ejecución de MinGW: ruta de RESPALDO, se entregan ${[...copiadas].sort().join(', ')} (${versiones.split('\n').join('; ')}).`)
}

function rutaWin(ruta) {
  const r = spawnSync('cygpath', ['-m', ruta], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ruta
}

/** Windows con `--fuentes`: compila el código oficial con MinGW en una consola MSYS2 UCRT64 y deja PREPARADO_WINDOWS, ya verificado. */
async function compilarWindows() {
  if (process.env.MSYSTEM !== 'UCRT64' || spawnSync('gcc', ['--version'], { stdio: 'ignore' }).status !== 0)
    throw new Error(`--fuentes en Windows se corre dentro de una consola MSYS2 UCRT64 con gcc y make.\n${AYUDA_WINDOWS}`)
  const { ruta } = await asegurarArchivo({ cache: CACHE, ...FUENTES, registro: console.log })
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-ngspice-'))
  try {
    // El tar de MSYS2 toma «C:» por una máquina remota si no se le pide --force-local.
    ejecutar('tar', ['--force-local', '-xzf', ruta], tmp)
    const fuentes = join(tmp, `ngspice-${VERSION}`)
    const instalado = join(tmp, 'instalado')
    const env = { ...process.env, LDFLAGS: `${process.env.LDFLAGS ?? ''} ${LDFLAGS_WINDOWS}`.trim(), LIBS: `${process.env.LIBS ?? ''} ${LIBS_WINDOWS}`.trim() }
    ejecutar('sh', ['./configure', ...CONFIGURE_WINDOWS], fuentes, env)
    ejecutar('make', ['-j4', ...MAKE_WINDOWS], fuentes, env)
    ejecutar('make', ['install', ...MAKE_WINDOWS, `DESTDIR=${rutaMsys(instalado)}`], fuentes, env)
    const origen = join(instalado, 'opt', 'kirchi-ngspice')
    const spice64 = join(PREPARADO_WINDOWS, 'Spice64')
    rmSync(PREPARADO_WINDOWS, { recursive: true, force: true })
    for (const d of ['bin', 'docs', 'share/ngspice/scripts', 'lib/ngspice']) mkdirSync(join(spice64, d), { recursive: true })
    copyFileSync(join(origen, 'bin', 'ngspice.exe'), join(spice64, 'bin', 'ngspice_con.exe'))
    const modelosCm = readdirSync(join(origen, 'lib', 'ngspice')).filter((n) => n.endsWith('.cm'))
    for (const f of modelosCm) copyFileSync(join(origen, 'lib', 'ngspice', f), join(spice64, 'lib', 'ngspice', f))
    writeFileSync(join(spice64, 'share', 'ngspice', 'scripts', 'spinit'), reescribirSpinit(readFileSync(join(origen, 'share', 'ngspice', 'scripts', 'spinit'), 'utf8'), modelosCm))
    copyFileSync(join(fuentes, 'COPYING'), join(spice64, 'docs', 'COPYING'))
    respaldoRuntime(spice64, fuentes, origen, env)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  await paraWindows(PREPARADO_WINDOWS)
}

/** macOS y Linux con `--reutilizar`: si la caché del flujo ya dejó ngspice en DESTINO, solo se revisa (universal en macOS y versión) y no se compila. */
function reutilizarUnix() {
  const ejecutable = join(DESTINO, 'bin', 'ngspice')
  const lib = join(DESTINO, 'lib', 'ngspice')
  if (!existsSync(ejecutable) || !existsSync(lib)) return false
  const modelos = readdirSync(lib).filter((f) => f.endsWith('.cm'))
  for (const m of MODELOS_DE_CODIGO) if (!modelos.includes(`${m}.cm`)) return false
  if (process.platform === 'darwin') {
    comprobarUniversal(ejecutable)
    for (const m of modelos) comprobarUniversal(join(lib, m))
  }
  comprobarVersion(ejecutable)
  console.log(`ngspice ${VERSION}: reutilizado de la caché (${modelos.length} modelos de código en ${DESTINO}), revisado.`)
  return true
}

async function paraUnix() {
  if (process.argv.includes('--reutilizar') && reutilizarUnix()) return
  const { ruta } = await asegurarArchivo({ cache: CACHE, ...FUENTES, registro: console.log })
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-ngspice-'))
  try {
    ejecutar('tar', ['-xzf', ruta], tmp)
    const fuentes = join(tmp, `ngspice-${VERSION}`)
    const instalado = join(tmp, 'instalado')
    const { configure, env } = opcionesDeCompilacion(process.platform)
    ejecutar('./configure', configure, fuentes, env)
    ejecutar('make', ['-j4'], fuentes, env)
    ejecutar('make', ['install', `DESTDIR=${instalado}`], fuentes, env)
    const modelos = seleccionarUnix(join(instalado, 'opt', 'kirchi-ngspice'), DESTINO, join(fuentes, 'COPYING'))
    if (process.platform === 'darwin') {
      comprobarUniversal(join(DESTINO, 'bin', 'ngspice'))
      for (const m of modelos) comprobarUniversal(join(DESTINO, 'lib', 'ngspice', m))
    }
    console.log(`ngspice ${VERSION}: ejecutable y ${modelos.length} modelos de código en ${DESTINO}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  comprobarVersion(join(DESTINO, 'bin', 'ngspice'))
}

async function main() {
  const fuentes = process.argv.includes('--fuentes')
  if (!fuentes && process.platform !== 'win32') throw new Error('Fuera de Windows se usa --fuentes.')
  if (fuentes && process.platform === 'win32') await compilarWindows()
  else if (fuentes) await paraUnix()
  else await paraWindows()
  if (!statSync(DESTINO).isDirectory()) throw new Error('No quedó la carpeta de ngspice.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
