/**
 * Pines de los símbolos estándar de LTspice en R0, relativos al origen del `SYMBOL`, en el orden SPICE del elemento.
 * Medidos sobre esquemas reales (qué extremos de cable caen en cada símbolo); las filas con `medido: false`
 * son la convención publicada de ese símbolo y no se pudieron contrastar con ningún esquema.
 */
import type { PinAjeno } from '../ajeno'

export interface PinSimbolo {
  nombre: string
  x: number
  y: number
}

export interface SimboloLtspice {
  pines: PinSimbolo[]
  medido: boolean
  /** El campo Value de la pieza es el nombre de un modelo (`.model`), no un valor. */
  valorEsModelo?: boolean
}

const p = (nombre: string, x: number, y: number): PinSimbolo => ({ nombre, x, y })
const dosPolos = (a: [number, number], b: [number, number], n1 = '1', n2 = '2'): PinSimbolo[] => [p(n1, ...a), p(n2, ...b)]
const diodo = (medido = true): SimboloLtspice => ({ pines: dosPolos([16, 0], [16, 64], 'A', 'K'), medido, valorEsModelo: true })
const fuenteV = (): SimboloLtspice => ({ pines: dosPolos([0, 16], [0, 96], '+', '−'), medido: true })
const controlada = (medido: boolean): SimboloLtspice => ({ pines: [p('+', 0, 16), p('−', 0, 96), p('C+', -48, 32), p('C−', -48, 80)], medido })
const bjt = (colector: number, emisor: number, medido: boolean, sustrato = false): SimboloLtspice => ({
  pines: [p('C', 64, colector), p('B', 0, 48), p('E', 64, emisor), ...(sustrato ? [p('S', 96, 48)] : [])],
  medido,
  valorEsModelo: true
})
const mos = (arriba: string, abajo: string, cuerpo: boolean): SimboloLtspice => ({
  // Orden SPICE D G S B; la fuente del nmos va abajo y la del pmos arriba.
  pines: [p('D', 48, arriba === 'D' ? 0 : 96), p('G', 0, 80), p('S', 48, abajo === 'S' ? 96 : 0), ...(cuerpo ? [p('B', 48, 48)] : [])],
  medido: true,
  valorEsModelo: true
})
/** Amp-op de cinco pines: In+, In−, V+, V−, OUT. */
const opamp = (pines: PinSimbolo[], medido: boolean): SimboloLtspice => ({ pines, medido })

/** Claves en minúsculas, sin carpeta. */
const TABLA: Record<string, SimboloLtspice> = {
  res: { pines: dosPolos([16, 16], [16, 96]), medido: true },
  europeanresistor: { pines: dosPolos([16, 16], [16, 96]), medido: true },
  cap: { pines: dosPolos([16, 0], [16, 64]), medido: true },
  polcap: { pines: dosPolos([16, 0], [16, 64], '+', '−'), medido: true },
  europeanpolcap: { pines: dosPolos([16, 0], [16, 64], '+', '−'), medido: true },
  ind: { pines: dosPolos([16, 16], [16, 96]), medido: true },
  ind2: { pines: dosPolos([16, 16], [16, 96]), medido: true },
  diode: diodo(),
  zener: diodo(),
  led: diodo(),
  schottky: diodo(),
  varactor: diodo(false),
  npn: bjt(0, 96, true),
  // El pnp trae el colector abajo y el emisor arriba.
  pnp: bjt(96, 0, true),
  npn2: bjt(0, 96, false, true),
  pnp2: bjt(96, 0, false, true),
  nmos: mos('D', 'S', false),
  pmos: mos('S', 'D', false),
  nmos4: mos('D', 'S', true),
  pmos4: mos('S', 'D', true),
  njf: { pines: [p('D', 48, 0), p('G', 0, 64), p('S', 48, 96)], medido: true, valorEsModelo: true },
  pjf: { pines: [p('D', 48, 96), p('G', 0, 64), p('S', 48, 0)], medido: false, valorEsModelo: true },
  voltage: fuenteV(),
  bv: fuenteV(),
  current: { pines: dosPolos([0, 0], [0, 80], '+', '−'), medido: true },
  bi: { pines: dosPolos([0, 0], [0, 80], '+', '−'), medido: false },
  e: controlada(false),
  e2: controlada(true),
  g: controlada(true),
  g2: controlada(false),
  // f y h comparten símbolo de dos pines: la fuente que los controla se nombra en el valor.
  f: { pines: dosPolos([0, 0], [0, 80], '+', '−'), medido: true },
  h: { pines: dosPolos([0, 16], [0, 96], '+', '−'), medido: false },
  sw: { ...controlada(false), valorEsModelo: true },
  csw: { pines: dosPolos([0, 16], [0, 96], '+', '−'), medido: false, valorEsModelo: true },
  opamp: opamp([p('In+', -32, 48), p('In−', -32, 80), p('V+', 0, 32), p('V−', 0, 96), p('OUT', 32, 64)], true),
  opamp2: opamp([p('In+', -32, -16), p('In−', -32, 16), p('V+', 0, -32), p('V−', 0, 32), p('OUT', 32, 0)], false),
  universalopamp: opamp([p('In+', -32, -16), p('In−', -32, 16), p('V+', 0, -32), p('V−', 0, 32), p('OUT', 32, 0)], true),
  // Misc/NE555 en el orden del patillaje del 555: GND, TRIG, OUT, RESET, CV, THR, DIS, VCC.
  ne555: {
    pines: [p('GND', -112, -96), p('TRIG', -112, -32), p('OUT', -112, 32), p('RESET', -112, 96), p('CV', 112, 96), p('THR', 112, 32), p('DIS', 112, -32), p('VCC', 112, -96)],
    medido: true
  },
  // En R0 lleva In− arriba y V+ arriba: un Wien y un rectificador reales colocados como M180 dejan la red RC y la entrada en In+.
  universalopamp2: opamp([p('In+', -32, 16), p('In−', -32, -16), p('V+', 0, -32), p('V−', 0, 32), p('OUT', 32, 0)], true)
}

const GENERICOS_OPAMP = new Set(['opamp', 'opamp2', 'universalopamp', 'universalopamp2'])

/** Nombre del símbolo con una sola `/` entre carpetas (el archivo escribe `\`). */
export const normalizarNombre = (n: string): string => n.split(String.fromCharCode(92)).join('/').replace(new RegExp('/{2,}', 'g'), '/')

/** Pines del símbolo, o undefined si no está en la tabla. Los amp-op de la carpeta Opamps (LT1001, LM741...) usan el de cinco pines. */
export function simboloLtspice(nombre: string): SimboloLtspice | undefined {
  const partes = normalizarNombre(nombre).toLowerCase().split('/')
  const base = partes[partes.length - 1] as string
  const carpetas = partes.slice(0, -1)
  if (carpetas.length === 0 || !carpetas.some((c) => c === 'opamps' || c === 'opamp')) return Object.hasOwn(TABLA, base) ? TABLA[base] : undefined
  return GENERICOS_OPAMP.has(base) ? TABLA[base] : TABLA.opamp
}

/** Nombre de la parte sin carpeta si no es uno de los amp-op genéricos (sirve de modelo). */
export function parteDeAmpOp(nombre: string): string | undefined {
  const partes = normalizarNombre(nombre).split('/')
  const base = partes[partes.length - 1] as string
  return partes.length > 1 && !GENERICOS_OPAMP.has(base.toLowerCase()) ? base : undefined
}

export type GiroLtspice = 0 | 90 | 180 | 270

/** Gira (R90 lleva +X hacia abajo en pantalla) y luego espeja en X: así lo hacen los esquemas reales con M90 y M270. */
export function transformar(x: number, y: number, giro: GiroLtspice, espejo: boolean): [number, number] {
  // `0 - v` y no `-v`: evita el -0, que las comparaciones estrictas distinguen del 0.
  const [rx, ry] = giro === 90 ? [0 - y, x] : giro === 180 ? [0 - x, 0 - y] : giro === 270 ? [y, 0 - x] : [x, y]
  return [espejo ? 0 - rx : rx, ry]
}

/** Pines con su posición absoluta para un símbolo colocado en (ox, oy). */
export function pinesColocados(s: SimboloLtspice, ox: number, oy: number, giro: GiroLtspice, espejo: boolean): PinAjeno[] {
  return s.pines.map((pin, i) => {
    const [dx, dy] = transformar(pin.x, pin.y, giro, espejo)
    return { numero: String(i + 1), nombre: pin.nombre, x: ox + dx, y: oy + dy }
  })
}
