// Deja la licencia MIT de Electron y los avisos de Chromium en resources/licencias-electron/ para el dmg, porque electron-builder los borra en macOS.
// Se bajan del zip oficial de la misma versión, con su SHA-256 contra SHASUMS256.txt; si falta alguno, la construcción se detiene. Solo antes de `electron-builder --mac`.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asegurarArchivo } from './preparar-ngspice.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DESTINO_LICENCIAS = join(raiz, 'resources', 'licencias-electron')
export const ARCHIVOS = ['LICENSE', 'LICENSES.chromium.html']

/** Busca la suma de `nombre` en el texto de un SHASUMS256.txt («suma *nombre» o «suma  nombre»). */
export function sumaDe(shasums, nombre) {
  for (const l of shasums.split(/\r?\n/)) {
    const m = l.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i)
    if (m && m[2] === nombre) return m[1].toLowerCase()
  }
  throw new Error(`SHASUMS256.txt no trae la suma de ${nombre}.`)
}

function descomprimir(zip, destino, archivos) {
  // unzip (macOS, Linux) o bsdtar (Windows); el tar GNU no lee zip.
  const intentos = [
    ['unzip', ['-o', '-q', zip, ...archivos, '-d', destino]],
    ['tar', ['-xf', zip, '-C', destino, ...archivos]]
  ]
  for (const [orden, args] of intentos) {
    const r = spawnSync(orden, args, { stdio: 'inherit' })
    if (r.status === 0) return
  }
  throw new Error(`No se pudo extraer ${archivos.join(' y ')} de ${zip} (ni unzip ni tar los leyeron).`)
}

async function main() {
  const version = JSON.parse(readFileSync(join(raiz, 'node_modules', 'electron', 'package.json'), 'utf8')).version
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const base = `https://github.com/electron/electron/releases/download/v${version}`
  const nombre = `electron-v${version}-${process.platform}-${arch}.zip`
  const cache = join(raiz, 'herramientas', 'cache')
  const resp = await fetch(`${base}/SHASUMS256.txt`, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`No se pudo bajar SHASUMS256.txt de Electron ${version}: ${resp.status}`)
  const sha256 = sumaDe(await resp.text(), nombre)
  const { ruta } = await asegurarArchivo({ cache, nombre, url: `${base}/${nombre}`, sha256, registro: console.log })
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-electron-'))
  try {
    descomprimir(ruta, tmp, ARCHIVOS)
    mkdirSync(DESTINO_LICENCIAS, { recursive: true })
    for (const a of ARCHIVOS) {
      const origen = join(tmp, a)
      if (!existsSync(origen) || statSync(origen).size < 1000) throw new Error(`El zip de Electron ${version} no trae ${a}.`)
      copyFileSync(origen, join(DESTINO_LICENCIAS, a))
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (!readFileSync(join(DESTINO_LICENCIAS, 'LICENSE'), 'utf8').includes('Permission is hereby granted')) throw new Error('LICENSE no parece la licencia MIT de Electron.')
  console.log(`Licencias de Electron ${version} en ${DESTINO_LICENCIAS}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
