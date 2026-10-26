// Lo que comparten el guion de métricas y la prueba que lo vigila: las hojas de cada fuente incluida y la
// huella (SHA-256) de los archivos .woff2 que esas hojas cargan. Si una fuente cambia de versión, la huella
// cambia y la prueba de `metricas.test.ts` pide volver a correr scripts/metricas-fuentes.mjs.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(RAIZ, 'package.json'))

/** Las hojas de cada fuente, las mismas que importa src/renderer/src/main.tsx. */
export const FUENTES = {
  sans: { familia: 'Mona Sans Variable', hojas: ['@fontsource-variable/mona-sans/wdth.css', '@fontsource-variable/mona-sans/wdth-italic.css'] },
  serif: { familia: 'Source Serif 4 Variable', hojas: ['@fontsource-variable/source-serif-4/index.css', '@fontsource-variable/source-serif-4/wght-italic.css'] },
  mono: { familia: 'Geist Mono Variable', hojas: ['@fontsource-variable/geist-mono/index.css', '@fontsource-variable/geist-mono/wght-italic.css'] }
}

/** Rutas absolutas de los .woff2 que carga una hoja de fontsource. */
export function archivosDeHoja(hoja) {
  const ruta = require.resolve(hoja)
  const css = readFileSync(ruta, 'utf8')
  return [...css.matchAll(/url\(\.\/([^)]+\.woff2)\)/g)].map(([, url]) => join(dirname(ruta), url))
}

/** SHA-256 de los archivos de las tres fuentes, en orden estable (nombre de archivo y contenido). */
export function huellaFuentes() {
  const h = createHash('sha256')
  const todos = Object.values(FUENTES).flatMap(({ hojas }) => hojas.flatMap(archivosDeHoja))
  for (const ruta of [...new Set(todos)].sort()) {
    h.update(ruta.split(/[\\/]/).pop())
    h.update(readFileSync(ruta))
  }
  return h.digest('hex')
}
