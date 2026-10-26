// Deja en dist/fuentes-terceros/ el código fuente que piden las licencias de terceros: ngspice (GPL 2 o posterior, LGPL, MPL 2.0) y faer (código portado de Eigen, MPL 2.0). Se entrega junto a los instaladores.
// No compila: toma los archivos oficiales con SHA-256 fijado (scripts/ngspice-fuente.mjs, engine/Cargo.lock), de la caché o los baja una vez. Una suma distinta detiene todo.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUENTES, VERSION } from './ngspice-fuente.mjs'
import { asegurarArchivo, CACHE, sumaSha256 } from './preparar-ngspice.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SALIDA = join(raiz, 'dist', 'fuentes-terceros')

/** Crates de Rust cuyo código fuente se entrega (los que tienen partes con licencia de código abierto recíproca, como la MPL). */
export const CRATES_CON_FUENTE = ['faer']

/** La versión y la suma de un crate según Cargo.lock (la misma que comprueba Cargo al compilar). */
export function crateDelLock(lock, nombre) {
  const bloques = lock.split(/\r?\n\[\[package\]\]\r?\n/)
  const b = bloques.find((x) => new RegExp(`^name = "${nombre}"\\s*$`, 'm').test(x))
  if (!b) throw new Error(`${nombre} no está en engine/Cargo.lock.`)
  const version = b.match(/^version = "([^"]+)"/m)?.[1]
  const sha256 = b.match(/^checksum = "([0-9a-f]{64})"/m)?.[1]
  if (!version || !sha256) throw new Error(`Cargo.lock no da versión y suma de ${nombre}.`)
  return { nombre: `${nombre}-${version}.crate`, url: `https://static.crates.io/crates/${nombre}/${nombre}-${version}.crate`, sha256 }
}

/** El texto que acompaña a los archivos: qué es cada uno y por qué está ahí. */
export function leeme(archivos) {
  return `Código fuente de terceros que acompaña a Kirchi
================================================

Kirchi (licencia MIT) distribuye junto a su programa piezas de terceros cuyas licencias piden que el código fuente esté disponible
para quien recibe el programa. Este es ese código, sin cambios, tal como lo publican sus autores:

  ${FUENTES.nombre}
    ngspice ${VERSION}, el simulador que Kirchi ejecuta como programa aparte. Contiene partes con licencia BSD modificada, GPL 2 o
    posterior (modelo de código "table"), LGPL (KLU y numparam) y MPL 2.0 (OSDI). Ver su archivo COPYING.
    Origen: ${FUENTES.url}
${archivos
  .filter((a) => a.nombre.endsWith('.crate'))
  .map((a) => `  ${a.nombre}\n    Biblioteca de Rust del motor de Kirchi (MIT, con algoritmos portados de Eigen bajo MPL 2.0). Es un archivo tar.gz.\n    Origen: ${a.url}`)
  .join('\n')}

Las sumas SHA-256 de cada archivo están en SHA256SUMS.txt.
`
}

async function main() {
  const lock = readFileSync(join(raiz, 'engine', 'Cargo.lock'), 'utf8')
  const archivos = [FUENTES, ...CRATES_CON_FUENTE.map((n) => crateDelLock(lock, n))]
  rmSync(SALIDA, { recursive: true, force: true })
  mkdirSync(SALIDA, { recursive: true })
  for (const a of archivos) {
    // Un crate ya descargado por Cargo está en ~/.cargo/registry/cache; se usa si su suma coincide.
    const deCargo = join(homedir(), '.cargo', 'registry', 'cache')
    const previo = a.nombre.endsWith('.crate') && existsSync(deCargo) ? readdirSync(deCargo).map((d) => join(deCargo, d, a.nombre)).find((r) => existsSync(r) && sumaSha256(readFileSync(r)) === a.sha256) : null
    const ruta = previo ?? (await asegurarArchivo({ cache: CACHE, ...a, registro: console.log })).ruta
    copyFileSync(ruta, join(SALIDA, a.nombre))
  }
  writeFileSync(join(SALIDA, 'SHA256SUMS.txt'), archivos.map((a) => `${a.sha256}  ${a.nombre}`).join('\n') + '\n')
  writeFileSync(join(SALIDA, 'LEEME.txt'), leeme(archivos))
  for (const a of archivos) if (sumaSha256(readFileSync(join(SALIDA, a.nombre))) !== a.sha256) throw new Error(`${a.nombre} no quedó con su suma.`)
  console.log(`Código fuente de terceros en ${SALIDA}: ${archivos.map((a) => a.nombre).join(', ')}.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
