// Genera las referencias de ngspice para las pruebas del motor: corre cada `engine/referencias/*.cir` por lotes y guarda su CSV al lado, en Git, así las pruebas no necesitan ngspice. ngspice (BSD y GPL) no se distribuye con Kirchi, es solo herramienta de desarrollo en `herramientas/ngspice/`.
// Los casos digitales usan `digital.lib` y los `*.in` de `d_state`, y guardan los cambios de sus redes como `<caso>.eventos.csv`. Uso: node scripts/referencias-ngspice.mjs [caso ...].

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WINDOWS } from './ngspice-fuente.mjs'
import { generarSintesis } from '../src/compartido/spice/sintesis.ts'
import { generarSubcircuito } from '../src/compartido/spice/subcircuitos.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = join(raiz, 'engine', 'referencias')
const herramientas = join(raiz, 'herramientas', 'ngspice')
const ejecutable = join(herramientas, 'Spice64', 'bin', 'ngspice_con.exe')

const DESCARGA = WINDOWS.url
const SHA256 = WINDOWS.sha256

/** Las referencias se generaron con la versión 47: otra daría otras cifras sin avisar. */
function comprobarVersion(ng) {
  const r = spawnSync(ng, ['-v'], { encoding: 'utf8' })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (!/ngspice-47\b/.test(salida)) {
    const dice = salida.split(/\r?\n/).find((l) => /ngspice/.test(l)) ?? 'no responde'
    throw new Error(`Se necesita ngspice-47 y ${ng} dice otra cosa: ${dice}`)
  }
  return ng
}

async function asegurarNgspice() {
  if (existsSync(ejecutable)) return comprobarVersion(ejecutable)
  if (process.platform !== 'win32') {
    // Fuera de Windows se usa el ngspice del sistema (paquete ngspice de la distribución o de Homebrew).
    const r = spawnSync('ngspice', ['-v'], { encoding: 'utf8' })
    if (r.status === 0) return comprobarVersion('ngspice')
    throw new Error('No se encontró ngspice: instálalo con el gestor de paquetes del sistema.')
  }
  console.log('Descargando ngspice 47 portable...')
  const res = await fetch(DESCARGA, { redirect: 'follow' })
  if (!res.ok) throw new Error(`La descarga de ngspice falló: ${res.status} ${res.statusText}`)
  const datos = Buffer.from(await res.arrayBuffer())
  const suma = createHash('sha256').update(datos).digest('hex')
  if (suma !== SHA256) throw new Error(`La suma SHA-256 de ngspice no coincide: ${suma}`)
  // Se descomprime en una carpeta temporal propia y vacía (el archivo es un dato no confiable hasta revisarlo).
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-ngspice-'))
  try {
    const archivo = join(tmp, 'ngspice-47_64.7z')
    writeFileSync(archivo, datos)
    mkdirSync(herramientas, { recursive: true })
    // El tar de Windows (bsdtar) lee 7z; salta unas entradas vacías y por eso termina con código distinto de cero.
    spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archivo], { cwd: herramientas, stdio: 'ignore' })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (!existsSync(ejecutable)) throw new Error('No se pudo descomprimir ngspice en herramientas/ngspice.')
  return comprobarVersion(ejecutable)
}

/** Renglones que se guardan de un transitorio, como máximo. */
const MAX_RENGLONES = 2000

/** Lee la salida de `wrdata` con `wr_vecnames`. De un transitorio se guardan los puntos de ngspice sin interpolar (`linearize` deforma primeros pasos y flancos), a lo más uno por cada 1/2000 del tiempo total. */
export function leerSalida(texto) {
  const renglones = texto.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
  const nombres = renglones[0].split(/\s+/).map((n) => n.toLowerCase())
  const filas = renglones.slice(1).map((r) => r.split(/\s+/).map(Number))
  if (nombres[0] !== 'time') {
    // En un punto de operación la primera columna es la escala (el primer vector repetido): se descarta.
    return { columnas: nombres.slice(1), filas: filas.map((f) => f.slice(1)) }
  }
  const fin = filas[filas.length - 1][0]
  const elegidas = []
  let marca = 0
  for (const [k, f] of filas.entries()) {
    if (k === 0 || k === filas.length - 1 || f[0] >= marca) {
      elegidas.push(f)
      marca = (Math.floor((f[0] / fin) * MAX_RENGLONES) + 1) * (fin / MAX_RENGLONES)
    }
  }
  return { columnas: ['t', ...nombres.slice(1)], filas: elegidas }
}

/** Lee la salida de `eprint`: nombres de redes y un renglón por instante con tiempo y valor de cada red. El estado es la primera letra (0, 1 o U) y la fuerza la segunda: «z» se escribe Z y U se escribe X. */
export function leerEventos(texto) {
  const renglones = texto.split(/\r?\n/).map((r) => r.trim())
  const i = renglones.indexOf('Time or Step')
  if (i < 0) throw new Error('La salida de eprint no trae «Time or Step».')
  const nombres = []
  let k = i + 1
  for (; k < renglones.length && renglones[k] !== ''; k++) nombres.push(renglones[k].toLowerCase())
  const valor = (v) => (v[1] === 'z' ? 'Z' : v[0] === 'U' ? 'X' : v[0])
  const filas = []
  for (; k < renglones.length && !renglones[k].startsWith('****'); k++) {
    if (!/^[0-9]/.test(renglones[k])) continue
    const [t, ...vs] = renglones[k].split(/\s+/)
    if (vs.length !== nombres.length) throw new Error(`Renglón de eprint con ${vs.length} valores y ${nombres.length} redes: ${renglones[k]}`)
    filas.push([Number(t), ...vs.map(valor)])
  }
  return { columnas: ['t', ...nombres], filas }
}

/** Un renglón `*@generar clase nombre {json}` se sustituye por el subcircuito o la síntesis del exportador (`lut` y `msi`), para que referencia y exportación usen el mismo texto. */
export function expandirGenerados(texto) {
  return texto.replace(/^\*@generar\s+(\w+)\s+(\w+)\s+(\{.*\})\s*$/gm, (_, clase, nombre, json) =>
    clase === 'lut' || clase === 'msi' ? generarSintesis(clase, nombre, JSON.parse(json)) : generarSubcircuito(clase, nombre, JSON.parse(json))
  )
}

/** Archivos que cada caso necesita junto a su `.cir`: las bibliotecas de modelos y los archivos de estados de `d_state`. */
function auxiliares() {
  return readdirSync(carpeta).filter((f) => f === 'modelos.lib' || f === 'digital.lib' || f.endsWith('.in'))
}

async function main() {
  const ng = await asegurarNgspice()
  const pedidos = process.argv.slice(2)
  const casos = readdirSync(carpeta).filter((f) => f.endsWith('.cir')).map((f) => basename(f, '.cir')).filter((c) => pedidos.length === 0 || pedidos.includes(c)).sort()
  for (const caso of casos) {
    const tmp = mkdtempSync(join(tmpdir(), 'kirchi-ref-'))
    try {
      writeFileSync(join(tmp, `${caso}.cir`), expandirGenerados(readFileSync(join(carpeta, `${caso}.cir`), 'utf8')))
      for (const f of auxiliares()) copyFileSync(join(carpeta, f), join(tmp, f))
      const r = spawnSync(ng, ['-b', `${caso}.cir`], { cwd: tmp, encoding: 'utf8' })
      const salida = join(tmp, 'salida.txt')
      if (r.status !== 0 || !existsSync(salida) || /^Error/m.test(r.stdout + r.stderr)) {
        throw new Error(`ngspice falló en ${caso}:\n${r.stdout}\n${r.stderr}`)
      }
      const { columnas, filas } = leerSalida(readFileSync(salida, 'utf8'))
      const csv = [columnas.join(','), ...filas.map((f) => f.join(','))].join('\n') + '\n'
      writeFileSync(join(carpeta, `${caso}.csv`), csv)
      let extra = ''
      const eventos = join(tmp, 'eventos.txt')
      if (existsSync(eventos)) {
        const ev = leerEventos(readFileSync(eventos, 'utf8'))
        writeFileSync(join(carpeta, `${caso}.eventos.csv`), [ev.columnas.join(','), ...ev.filas.map((f) => f.join(','))].join('\n') + '\n')
        extra = `; ${ev.filas.length} instantes con eventos en ${ev.columnas.slice(1).join(' ')}`
      }
      console.log(`${caso}: ${filas.length} ${filas.length === 1 ? 'renglón' : 'renglones'}, ${columnas.join(' ')}${extra}`)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
