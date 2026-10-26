// Genera src/renderer/src/ui/licenciasTerceros.json con las licencias de lo que viaja con Kirchi. `--revisar` falla si no coincide con package.json, node_modules, Cargo.lock y licencias/, o si un paquete queda sin su texto.
// Cada paquete lleva SU texto de licencia y avisos; si un crate no los publica, se toma del repositorio en el commit exacto (ORIGEN.txt) y nunca del de otro paquete. Electron, Chromium y ngspice se agregan aparte. No descarga nada.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUENTES as NGSPICE_FUENTES, VERSION as NGSPICE_VERSION } from './ngspice-fuente.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, 'src', 'renderer', 'src', 'ui', 'licenciasTerceros.json')
export const LICENCIAS = join(RAIZ, 'licencias')

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'))
const leerTexto = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').trim()

/** Archivos de licencia o de avisos de una carpeta de paquete. */
export const ES_LICENCIA = /^(licen[sc]e|copying|notice)(?!.*\.(js|ts|json|rs)$)/i
/** El archivo con la licencia del propio paquete (no un aviso de código portado como `COPYING.EIGEN.MPL2`). */
export const ES_PRINCIPAL = /^(licen[sc]e([-_.].*)?|copying(\.(txt|md))?)$/i
/** Licencias que exigen conservar un aviso de derechos de autor: su texto tiene que traer al menos una línea «Copyright». */
const PIDE_AVISO = /\b(MIT|BSD|ISC|Zlib)\b/

/** Lee los textos de licencia de un paquete y, si falta el principal, los de `extra`. Devuelve el texto unido, si hay licencia principal, si se usó `extra` y su ORIGEN.txt. */
export function textosDePaquete(carpeta, extra) {
  const propios = readdirSync(carpeta).filter((n) => ES_LICENCIA.test(n)).sort()
  const tienePrincipal = propios.some((n) => ES_PRINCIPAL.test(n))
  const usaExtra = !tienePrincipal && existsSync(extra)
  const deExtra = usaExtra ? readdirSync(extra).filter((n) => ES_PRINCIPAL.test(n)).sort() : []
  const partes = [...deExtra.map((n) => leerTexto(join(extra, n))), ...propios.map((n) => leerTexto(join(carpeta, n)))].filter(Boolean)
  return {
    texto: partes.join('\n\n---\n\n'),
    principal: tienePrincipal || deExtra.length > 0,
    extra: usaExtra ? extra : null,
    procedencia: usaExtra && existsSync(join(extra, 'ORIGEN.txt')) ? leerTexto(join(extra, 'ORIGEN.txt')) : null
  }
}

function licenciaNpm(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ')
  return 'desconocida'
}

function paquetesNpm() {
  const raiz = leerJson(join(RAIZ, 'package.json'))
  const vistos = new Map()
  const pendientes = Object.keys(raiz.dependencies ?? {})
  while (pendientes.length) {
    const nombre = pendientes.pop()
    if (vistos.has(nombre)) continue
    const carpeta = join(RAIZ, 'node_modules', nombre)
    if (!existsSync(join(carpeta, 'package.json'))) throw new Error(`Falta ${nombre} en node_modules: corre npm ci.`)
    const pkg = leerJson(join(carpeta, 'package.json'))
    const t = textosDePaquete(carpeta, join(LICENCIAS, 'npm', `${nombre.replace('/', '__')}-${pkg.version}`))
    vistos.set(nombre, { nombre, version: pkg.version, licencia: licenciaNpm(pkg), origen: 'npm', ...t, commit: null })
    pendientes.push(...Object.keys(pkg.dependencies ?? {}))
  }
  return [...vistos.values()]
}

function ejecutableCargo() {
  const propio = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
  return existsSync(propio) ? propio : 'cargo'
}

/** El commit de git del que salió el crate publicado (`.cargo_vcs_info.json`), o null si no lo dice. */
function commitDelCrate(carpeta) {
  const ruta = join(carpeta, '.cargo_vcs_info.json')
  return existsSync(ruta) ? (leerJson(ruta).git?.sha1 ?? null) : null
}

function paquetesCargo() {
  const salida = execFileSync(
    ejecutableCargo(),
    ['metadata', '--offline', '--format-version', '1', '--manifest-path', join(RAIZ, 'engine', 'Cargo.toml'), '--filter-platform', 'wasm32-unknown-unknown'],
    { encoding: 'utf8', maxBuffer: 256 * 2 ** 20 }
  )
  const meta = JSON.parse(salida)
  const incluidos = new Set(meta.resolve.nodes.map((n) => n.id))
  const propios = new Set(meta.workspace_members)
  return meta.packages
    .filter((p) => incluidos.has(p.id) && !propios.has(p.id))
    .map((p) => {
      const carpeta = dirname(p.manifest_path)
      return {
        nombre: p.name,
        version: p.version,
        licencia: p.license ?? (p.license_file ? 'ver archivo de licencia' : 'desconocida'),
        origen: 'cargo',
        ...textosDePaquete(carpeta, join(LICENCIAS, 'cargo', `${p.name}-${p.version}`)),
        commit: commitDelCrate(carpeta)
      }
    })
}

/** Lo que viaja junto a Kirchi como programa aparte: Electron y Chromium, y ngspice (proceso propio). Sus textos salen de node_modules/electron y de licencias/ngspice*. */
function programasAparte() {
  const electron = leerJson(join(RAIZ, 'node_modules', 'electron', 'package.json'))
  const ng = (n) => leerTexto(join(LICENCIAS, 'ngspice', n))
  const win = (n) => leerTexto(join(LICENCIAS, 'ngspice-windows', n))
  return [
    { nombre: 'Electron', version: electron.version, licencia: 'MIT', grupo: 'Electron', texto: leerTexto(join(RAIZ, 'node_modules', 'electron', 'LICENSE')) },
    {
      nombre: 'Chromium y sus componentes',
      version: `el de Electron ${electron.version}`,
      licencia: 'BSD-3-Clause y otras (ver LICENSES.chromium.html)',
      grupo: 'Electron',
      texto: 'Chromium y las bibliotecas que trae (entre ellas FFmpeg, con licencia LGPL 2.1) tienen sus avisos y licencias completos en el archivo LICENSES.chromium.html, que viaja junto al ejecutable de Kirchi (en macOS, dentro de Kirchi.app/Contents/Resources).'
    },
    { nombre: 'ngspice', version: NGSPICE_VERSION, licencia: 'BSD-3-Clause (Modified BSD) con partes LGPL-2.0-or-later, LGPL-2.1, MPL-2.0 y dominio público', grupo: 'ngspice', texto: ng('COPYING') },
    { nombre: 'ngspice, modelo de código «table» (table.cm)', version: NGSPICE_VERSION, licencia: 'GPL-2.0-or-later', grupo: 'ngspice', texto: ng('GPL-2.0.txt') },
    {
      nombre: 'Tiempo de ejecución de GCC (libgcc, enlazado estático en ngspice para Windows)',
      version: 'el del GCC de MSYS2 UCRT64 con que se compila',
      licencia: 'GPL-3.0-or-later WITH GCC-exception-3.1',
      grupo: 'ngspice para Windows',
      texto: `${win('gcc-runtime-exception.txt')}

${win('GPL-3.0.txt')}`
    },
    { nombre: 'winpthreads (MinGW-w64, si el compilador lo enlaza estático)', version: 'el de MSYS2 UCRT64 con que se compila', licencia: 'MIT', grupo: 'ngspice para Windows', texto: win('winpthreads.txt') }
  ]
}

/** Problemas de licencia de la lista: paquetes sin su texto, textos tomados de otro lado, carpetas de licencias/ que ya nadie usa. */
export function problemas(paquetes, carpetasExtra) {
  const lista = []
  const usadas = new Set()
  for (const p of paquetes) {
    const id = `${p.nombre}@${p.version}`
    if (!p.principal) lista.push(`${id}: sin archivo de licencia propio; agrega licencias/${p.origen}/${p.nombre}-${p.version}/LICENSE desde su repositorio`)
    if (PIDE_AVISO.test(p.licencia) && !/(^|\n).*\bcopyright\b/i.test(p.texto) && !/^(Apache|Unlicense)/.test(p.licencia)) lista.push(`${id}: el texto no trae ninguna línea de derechos de autor`)
    if (p.extra) {
      usadas.add(p.extra)
      if (!p.procedencia) lista.push(`${id}: falta ORIGEN.txt en ${p.extra}`)
      else if (p.origen === 'cargo') {
        if (!p.commit) lista.push(`${id}: el crate no dice de qué commit salió; no se puede comprobar el texto de licencias/`)
        else if (!p.procedencia.includes(p.commit)) lista.push(`${id}: ORIGEN.txt no es del commit ${p.commit} de esta versión (texto prestado o de otra versión)`)
      }
    }
  }
  for (const c of carpetasExtra) if (!usadas.has(c)) lista.push(`${c}: carpeta de licencias/ que ningún paquete usa (versión vieja)`)
  return lista
}

/** Las carpetas licencias/npm/* y licencias/cargo/* que existen. */
export function carpetasExtra() {
  return ['npm', 'cargo'].flatMap((o) => {
    const base = join(LICENCIAS, o)
    return existsSync(base) ? readdirSync(base).map((n) => join(base, n)) : []
  })
}

export function generar() {
  const todos = [...paquetesNpm(), ...paquetesCargo()].sort((a, b) => a.origen.localeCompare(b.origen) || a.nombre.localeCompare(b.nombre) || a.version.localeCompare(b.version))
  const errores = problemas(todos, carpetasExtra())
  const textos = []
  const indice = (texto) => {
    let i = textos.indexOf(texto)
    if (i < 0) i = textos.push(texto) - 1
    return i
  }
  const paquetes = todos.map(({ nombre, version, licencia, origen, texto }) => ({ nombre, version, licencia, origen, texto: indice(texto) }))
  const aparte = programasAparte().map(({ texto, ...resto }) => ({ ...resto, texto: indice(texto) }))
  const kirchi = leerJson(join(RAIZ, 'package.json')).version
  // De dónde sale ngspice y la suma de su código fuente: «Acerca de» las muestra para cumplir con la entrega del código (GPL, LGPL, MPL).
  const ngspice = { version: NGSPICE_VERSION, fuente: { nombre: NGSPICE_FUENTES.nombre, url: NGSPICE_FUENTES.url, sha256: NGSPICE_FUENTES.sha256 } }
  return { datos: { kirchi, licenciaKirchi: leerTexto(join(RAIZ, 'LICENSE')), textos, paquetes, aparte, ngspice }, errores }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { datos, errores } = generar()
  if (errores.length) {
    console.error(`Licencias con problemas:\n  ${errores.join('\n  ')}`)
    process.exit(1)
  }
  const json = JSON.stringify(datos) + '\n'
  if (process.argv.includes('--revisar')) {
    const actual = existsSync(SALIDA) ? readFileSync(SALIDA, 'utf8') : ''
    if (actual.replace(/\r\n/g, '\n') !== json) {
      console.error('licenciasTerceros.json no coincide: corre `node scripts/generar-licencias.mjs`.')
      process.exit(1)
    }
    console.log('licenciasTerceros.json al día.')
  } else {
    writeFileSync(SALIDA, json)
    console.log(`${datos.paquetes.length} paquetes (${datos.paquetes.filter((p) => p.origen === 'npm').length} npm, ${datos.paquetes.filter((p) => p.origen === 'cargo').length} cargo), ${datos.aparte.length} programas aparte, ${datos.textos.length} textos distintos, ${(json.length / 1024).toFixed(0)} KB.`)
  }
}
