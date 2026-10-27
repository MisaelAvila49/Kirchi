// Arma el cuerpo del Release de GitHub a partir de CHANGELOG.md: resumen, tabla de descargas y las zonas de la versión.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REPO = 'https://github.com/MisaelAvila49/Kirchi'
const ZONAS = ['Nuevo', 'Diseño', 'Arreglos']

export function seccion(changelog, version) {
  const t = changelog.split(/\r?\n/)
  const i = t.findIndex((l) => l.trim() === `## ${version}`)
  if (i < 0) throw new Error(`CHANGELOG.md no tiene la sección ${version}`)
  const f = t.findIndex((l, j) => j > i && l.startsWith('## '))
  return t.slice(i + 1, f < 0 ? undefined : f)
}

// El resumen es una línea `> ...` o la primera línea de texto antes de la primera zona.
export function resumen(lineas) {
  for (const l of lineas) {
    if (l.startsWith('### ')) break
    const m = l.trim().replace(/^>\s*/, '')
    if (m && !m.startsWith('- ')) return m
  }
  return ''
}

// Cada zona con contenido, sin las vacías.
export function zonas(lineas) {
  const salida = []
  for (const z of ZONAS) {
    const i = lineas.findIndex((l) => l.trim() === `### ${z}`)
    if (i < 0) continue
    const f = lineas.findIndex((l, j) => j > i && l.startsWith('### '))
    const cuerpo = lineas.slice(i + 1, f < 0 ? undefined : f).join('\n').trim()
    if (cuerpo) salida.push(`### ${z}\n\n${cuerpo}`)
  }
  return salida
}

export function descargas(version) {
  const base = `${REPO}/releases/download/v${version}`
  const filas = [
    ['Instalador de Windows', `Kirchi-${version}-Windows-instalador.exe`],
    ['Windows portable', `Kirchi-${version}-Windows-portable.zip`],
    ['macOS', `Kirchi-${version}-macOS.dmg`],
    ['Linux AppImage', `Kirchi-${version}-Linux.AppImage`],
    ['Linux deb', `Kirchi-${version}-Linux.deb`],
    ['Fuentes de terceros', `Kirchi-${version}-fuentes-de-terceros.zip`],
  ]
  return ['## Descargas', '', '| Para | Archivo |', '|---|---|', ...filas.map(([p, n]) => `| ${p} | [${n}](${base}/${n}) |`)].join('\n')
}

export function cuerpo(changelog, version) {
  const lineas = seccion(changelog, version)
  const partes = []
  const r = resumen(lineas)
  if (r) partes.push(r)
  partes.push(descargas(version), ...zonas(lineas))
  partes.push(`La primera vez que lo abras, tu sistema puede pedir una confirmación: [cómo instalar](${REPO}#instalación)`)
  return partes.join('\n\n') + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2]
  if (!version) { console.error('Uso: node scripts/notas-release.mjs <versión>'); process.exit(1) }
  try { process.stdout.write(cuerpo(readFileSync('CHANGELOG.md', 'utf8'), version)) } catch (e) { console.error(e.message); process.exit(1) }
}
