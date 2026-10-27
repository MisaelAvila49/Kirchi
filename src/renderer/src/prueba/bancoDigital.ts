import type { ElementoMotor, NetlistMotor } from '../../../compartido/netlistMotor'

// Armado de un chip digital (un elemento `LUT` o `MSI`) para correrlo en el motor y en ngspice con las mismas entradas:
// cada entrada es una fuente por tramos que pasa por un puente de entrada con un solo umbral, y cada salida se lee por un
// puente de salida a un nodo analógico (ngspice no guarda los niveles de las redes digitales).

export type Nivel = 0 | 1
/** Una entrada: su nivel inicial y los cambios `[instante en ns, nivel]` en orden. */
export interface Onda {
  inicial: Nivel
  cambios: [number, Nivel][]
}
/** Una entrada que va a la misma red que la entrada `igualA` (dos relojes unidos). */
export interface Union {
  igualA: number
}

export const onda = (inicial: Nivel, ...cambios: [number, Nivel][]): Onda => ({ inicial, cambios })

/** `n` pulsos de reloj que suben en `desde + k · periodo` y bajan `ancho` ns después. */
export function pulsos(desde: number, n: number, periodo: number, ancho: number): [number, Nivel][] {
  return Array.from({ length: n }, (_, k): [number, Nivel][] => [[desde + k * periodo, 1], [desde + k * periodo + ancho, 0]]).flat()
}
/** Lo mismo con el reloj en reposo en alto: el pulso es una bajada de `ancho` ns. */
export function pulsosBajos(desde: number, n: number, periodo: number, ancho: number): [number, Nivel][] {
  return pulsos(desde, n, periodo, ancho).map(([t, v]): [number, Nivel] => [t, v === 1 ? 0 : 1])
}
/** Une los cambios de varias listas en orden de tiempo. */
export const unir = (...listas: [number, Nivel][][]): [number, Nivel][] => listas.flat().sort((a, b) => a[0] - b[0])

function tramos(o: Onda): [number, number][] {
  const puntos: [number, number][] = [[0, o.inicial * 5]]
  let previo = o.inicial
  for (const [ns, nivel] of o.cambios) {
    const t = ns * 1e-9
    if (!(t > puntos[puntos.length - 1][0] + 1e-9)) throw new Error(`Los cambios de una entrada deben distar más de 1 ns (${ns} ns).`)
    puntos.push([t, previo * 5], [t + 1e-9, nivel * 5])
    previo = nivel
  }
  return puntos
}

export interface Banco {
  netlist: NetlistMotor
  entradas: number
  salidas: number
  /** Nodo analógico de la primera salida en ngspice; las demás siguen. */
  primerNodoSalida: number
}

/**
 * La netlist con el chip entre `entradas` y `salidas` redes digitales (las entradas primero). `chip` recibe los índices de las
 * redes de entrada y de salida y devuelve el elemento (o los elementos, si hace falta algo más en las redes).
 */
export function armarBanco(chip: (e: number[], s: number[]) => ElementoMotor | ElementoMotor[], entradas: (Onda | Union)[], salidas: number, tablas: (number | string)[][] = []): Banco {
  const n = entradas.length
  const red = entradas.map((_, i) => i)
  entradas.forEach((o, i) => {
    if ('igualA' in o) red[i] = red[o.igualA]
  })
  const elements: ElementoMotor[] = []
  let nodos = 1
  entradas.forEach((o, i) => {
    if ('igualA' in o) return
    elements.push({ type: 'V', a: nodos, b: 0, wave: { kind: 'pwl', puntos: tramos(o) } }, { type: 'ADC', p: nodos, n: 0, out: i, in_low: 2.5, in_high: 2.5 })
    nodos++
  })
  elements.push(...[chip(red, Array.from({ length: salidas }, (_, j) => n + j))].flat())
  for (let j = 0; j < salidas; j++) {
    elements.push({ type: 'DAC', input: n + j, out: nodos + j, v_lo: 0, v_hi: 5, r_lo: 100, r_hi: 100, t_rise: 1e-10, t_fall: 1e-10 })
  }
  return { netlist: { nodes: nodos + salidas, digital_nets: n + salidas, elements, ...(tablas.length > 0 ? { tablas } : {}) }, entradas: n, salidas, primerNodoSalida: nodos }
}

/** El nivel lógico de un voltaje de salida del puente: ninguno si está a medio camino de un flanco. */
export function claseDeVoltaje(v: number): Nivel | null {
  return v < 1.25 ? 0 : v > 3.75 ? 1 : null
}
