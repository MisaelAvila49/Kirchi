// Pasa los iconos de color (scripts/datos/iconos-color.js) a src/renderer/src/ui/cinta/planos.ts. Uso: node scripts/gen-planos.mjs [--entrada ...] [--trazos ...] [--salida <planos.ts> | -].
// Falla si un icono o tono nombra un icono ausente en trazos.ts. Con «--salida -» escribe a la salida estándar (planos.test.ts lo compara con el archivo).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const opcion = (n, porOmision) => {
  const i = process.argv.indexOf(`--${n}`)
  return i < 0 ? porOmision : process.argv[i + 1]
}
const entrada = opcion('entrada', join(RAIZ, 'scripts/datos/iconos-color.js'))
const trazos = opcion('trazos', join(RAIZ, 'src/renderer/src/ui/cinta/trazos.ts'))
const salida = opcion('salida', join(RAIZ, 'src/renderer/src/ui/cinta/planos.ts'))
// Un checkout con autocrlf trae CRLF: las búsquedas de abajo suponen LF.
const src = readFileSync(entrada, 'utf8').replace(/\r\n/g, '\n')
const nombres = new Set([...readFileSync(trazos, 'utf8').matchAll(/^ {2}'?([\wñ]+)'?: \{ d:/gm)].map((m) => m[1]))
if (nombres.size < 70) throw new Error(`trazos.ts: se esperaban unos 72 iconos y se leyeron ${nombres.size}`)

// La tabla de tonos: el objeto literal entre «const TONO = » y su llave de cierre.
const t0 = src.indexOf('const TONO = {')
const t1 = src.indexOf('\n  }\n', t0)
const TONO = Function(`return (${src.slice(t0 + 'const TONO = '.length, t1 + 4)})`)()

// Los dibujos: desde «const c = » hasta antes de «const sprite», con f, s y fs que devuelven capas en JSON (una por renglón).
const a0 = src.indexOf('  const c = (cx')
const a1 = src.indexOf('  const sprite')
const capa = (o) => JSON.stringify(o) + '\n'
const f = (d, r) => capa({ d, relleno: r })
const s = (d, r, w = 1.6) => capa({ d, trazo: r, grosor: w })
const fs = (d, rf, rs, w = 1.2) => capa({ d, relleno: rf, trazo: rs, grosor: w })
// La función c suma en coma flotante («2.1000000000000005»): se redondea a centésimas cada número de un trayecto.
const redondear = (d) => d.replace(/-?\d*\.\d{5,}/g, (x) => String(Math.round(Number(x) * 100) / 100))
const fuente = src.slice(a0, a1).replace('  const c = (cx, cy, r) => `', '  const c = (cx, cy, r) => redondear(`').replace(/0z`\n/, '0z`)\n')
const A = Function('f', 's', 'fs', 'redondear', `${fuente}\nreturn { A, c }`)(f, s, fs, redondear)
const c = A.c
const DIBUJOS = Object.fromEntries(Object.entries(A.A).map(([k, v]) => [k, v.trim().split('\n').map((x) => JSON.parse(x))]))

// 14 px (botones chicos y Detener de la fila de arriba): se quitan los detalles interiores que a ese tamaño no se leen.
// Con DECISIONES.iconosChicos = 'linea' los chicos vuelven a los trazos de color (R3).
const SIMPLIFICAR = {
  guardarComo: ['M4 8.6h4.4v4.7H4z'],
  cortar: [c(4.4, 11.6, 0.9), c(11.6, 11.6, 0.9)],
  copiar: ['M7.8 8h3.6M7.8 10.4h3.6'],
  borrar: ['M6.7 7.4v4.6M9.3 7.4v4.6'],
  multimetro: ['M8 10.8l1.1-1.1'],
  // A 14 px la segunda fila de teclas se funde con la primera.
  calculadoras: ['M5.4 11.2h.01M8 11.2h.01M10.6 11.2h.01']
}

const clave = (n) => (/^[A-Za-z_$][\w$]*$/.test(n) ? n : `'${n}'`)
const num = (x) => String(Math.round(x * 100) / 100)
const ts = (k) => `{ d: '${k.d}'${k.relleno ? `, relleno: '${k.relleno}'` : ''}${k.trazo ? `, trazo: '${k.trazo}', grosor: ${num(k.grosor)}` : ''} }`
const lineas = []
for (const [n, capas] of Object.entries(DIBUJOS)) {
  if (!nombres.has(n)) throw new Error(`${n}: no existe en trazos.ts`)
  const quitar = SIMPLIFICAR[n] ?? []
  for (const d of quitar) if (!capas.some((k) => k.d === d)) throw new Error(`${n}: no tiene el detalle ${d}`)
  const chico = capas.filter((k) => !quitar.includes(k.d))
  lineas.push(`  ${clave(n)}: {\n    capas: [${capas.map(ts).join(', ')}]${quitar.length ? `,\n    chico: [${chico.map(ts).join(', ')}]` : ''}\n  }`)
}
const tonos = []
for (const [n, t] of Object.entries(TONO)) {
  if (!nombres.has(n)) throw new Error(`tono de ${n}: no existe en trazos.ts`)
  tonos.push(`  ${clave(n)}: ${Array.isArray(t) ? `['${t[0]}', '${t[1]}']` : `'${t}'`}`)
}
const salidaTs = `// Generado con scripts/gen-planos.mjs desde scripts/datos/iconos-color.js. No se edita a mano.
import type { Tono } from '../colores'
import type { NombreIcono } from './trazos'

/** Papel de cada capa de un icono plano: variables de la hoja que \`IconoCinta\` resuelve, nunca un color escrito. */
export type Papel = 'h' | 'h2' | 'tenue' | 'borde' | 'contra' | 'gris'

/** Una capa de 16 × 16: su trayecto con relleno, con trazo o con los dos. */
export interface Capa {
  d: string
  relleno?: Papel
  trazo?: Papel
  grosor?: number
}

/** Icono plano a varios colores (R1): sus capas y, si cambia, la versión de 14 px sin los detalles que no se leen. */
export interface Plano {
  capas: readonly Capa[]
  chico?: readonly Capa[]
}

export const PLANOS = {
${lineas.join(',\n')}
} satisfies Partial<Record<NombreIcono, Plano>>

/** Color de cada orden por lo que hace (no por su grupo); con dos, el segundo es \`h2\` (el tallo de Tierra, la pluma de Guardar como). */
export type TonoIcono = Tono | readonly [Tono, Tono]

export const TONO_ICONO = {
${tonos.join(',\n')}
} satisfies Partial<Record<NombreIcono, TonoIcono>>
`
if (salida === '-') process.stdout.write(salidaTs)
else {
  writeFileSync(salida, salidaTs)
  console.log(`${lineas.length} iconos planos (${Object.keys(SIMPLIFICAR).length} con versión de 14 px) y ${tonos.length} tonos en ${salida}`)
}
