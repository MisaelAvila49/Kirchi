// Pasa los iconos de trazo (scripts/datos/iconos-trazo.js) a src/renderer/src/ui/cinta/trazos.ts. Uso: node scripts/gen-trazos.mjs [--entrada ...] [--salida <trazos.ts> | -].
// Falla si un icono trae algo que no sea un path y círculos. Tras cambiar trazos.ts se regenera también planos.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const opcion = (n, porOmision) => {
  const i = process.argv.indexOf(`--${n}`)
  return i < 0 ? porOmision : process.argv[i + 1]
}
const entrada = opcion('entrada', join(RAIZ, 'scripts/datos/iconos-trazo.js'))
const salida = opcion('salida', join(RAIZ, 'src/renderer/src/ui/cinta/trazos.ts'))
const src = readFileSync(entrada, 'utf8')
const i = src.indexOf('const ICONOS = {')
const fin = /\r?\n\}\r?\n/.exec(src.slice(i))
const ICONOS = Function(`return (${src.slice(i + 'const ICONOS = '.length, i + fin.index + fin[0].length)})`)()
const clave = (n) => (/^[A-Za-z_$][\w$]*$/.test(n) ? n : `'${n}'`)
const lineas = []
for (const [nombre, svg] of Object.entries(ICONOS)) {
  const d = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
  const circulos = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)].map((m) => `[${m[1]}, ${m[2]}, ${m[3]}]`)
  const resto = svg.replace(/<path d="[^"]+"( fill="currentColor" stroke="none")?\/>/g, '').replace(/<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+"\/>/g, '')
  if (d.length !== 1 || resto.trim()) throw new Error(`${nombre}: se esperaba un path y círculos («${svg}»)`)
  const relleno = /fill="currentColor"/.test(svg)
  lineas.push(`  ${clave(nombre)}: { d: '${d[0]}'${circulos.length ? `, circulos: [${circulos.join(', ')}]` : ''}${relleno ? ', relleno: true' : ''} }`)
}
const ts = `// Generado con scripts/gen-trazos.mjs desde scripts/datos/iconos-trazo.js. No se edita a mano.

/** Un icono de trazo de 16 × 16: su trayecto, sus círculos (cx, cy, r) y si va relleno (Simular, Pausar y Detener). */
export interface Trazo {
  d: string
  circulos?: readonly (readonly [number, number, number])[]
  relleno?: boolean
}

export const TRAZOS = {
${lineas.join(',\n')}
} satisfies Record<string, Trazo>

export type NombreIcono = keyof typeof TRAZOS
`
if (salida === '-') process.stdout.write(ts)
else {
  writeFileSync(salida, ts)
  console.log(`${lineas.length} iconos en ${salida}`)
}
