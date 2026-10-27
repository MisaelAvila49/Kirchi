import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Pieza['rot'], props: Record<string, string> = {}): Pieza => ({
  id, tipo, ref, x, y, rot, espejo: false, props
})

function armar(piezas: Pieza[]): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 6, y: -8 }] }
  d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: 0 }, { x: 14, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
  return d
}

/** 5 V sobre dos resistencias de 1 kΩ; el punto medio es el pin 2 de R1. */
export function divisor(): Documento {
  return armar([
    pieza('p_v1', 'fuente-dc', 'V1', 0, 0, 0, { voltaje: '5' }),
    pieza('p_r1', 'resistencia', 'R1', 10, -8, 0, { valor: '1k' }),
    pieza('p_r2', 'resistencia', 'R2', 14, -4, 90, { valor: '1k' }),
    pieza('p_g', 'tierra', 'GND1', 0, 8, 0)
  ])
}

/** Batería de 9 V, R1 de 330 Ω y LED rojo; el ánodo del LED toca el pin 2 de R1. */
export function ledConBateria(): Documento {
  return armar([
    pieza('p_b1', 'bateria', 'B1', 0, 0, 0, { voltaje: '9' }),
    pieza('p_r1', 'resistencia', 'R1', 10, -8, 0, { valor: '330' }),
    pieza('p_d1', 'led', 'D1', 14, -4, 90, { color: 'rojo' }),
    pieza('p_g', 'tierra', 'GND1', 0, 8, 0)
  ])
}

/** Una pieza de un circuito armado con etiquetas: su tipo, referencia, propiedades y la red de cada pin por nombre. */
export interface Parte {
  tipo: string
  ref: string
  props?: Record<string, string>
  /** Modelo propio de SPICE (Personalizado). */
  spice?: Record<string, number>
  pines: Record<string, string>
}

/** Circuito armado sin cables: cada pieza va lejos de las demás y cada pin lleva una etiqueta con el nombre de su red
 * (sobre un pin la conecta). La red «0» es la tierra: una pieza de tierra lleva esa etiqueta. */
export function conEtiquetas(lib: Map<string, PiezaDef>, partes: Parte[]): Documento {
  const d = documentoVacio()
  const poner = (p: Pieza, redes: Record<string, string>) => {
    d.piezas[p.id] = p
    for (const pin of pinesEnMundo(p, lib.get(p.tipo)!)) {
      const nombre = redes[pin.id]
      if (nombre === undefined) throw new Error(`${p.ref}: falta la red del pin ${pin.id}`)
      const id = `e_${p.id}_${pin.id}`
      d.etiquetas[id] = { id, nombre, x: pin.x, y: pin.y, rot: 0 }
    }
  }
  poner(pieza('p_tierra', 'tierra', 'GND1', -40, 0, 0), { '1': '0' })
  partes.forEach((q, k) => poner({ ...pieza(`p_${k}`, q.tipo, q.ref, 40 * (k + 1), 0, 0, q.props ?? {}), ...(q.spice ? { spice: q.spice } : {}) }, q.pines))
  return d
}


const resistencia = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const capacitor = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })

/** Circuito de referencia: 555 astable, contador hasta 9, decodificador y display de cátodo común con sus resistencias. */
export function relojConDisplay(r2: string, c1: string): Parte[] {
  return [
    { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
    resistencia('R1', '1k', 'vcc', 'dis'),
    resistencia('R2', r2, 'dis', 'thr'),
    capacitor('C1', c1, 'thr', '0'),
    capacitor('C2', '10n', 'cv', '0'),
    { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'ck', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } },
    { tipo: 'contador', ref: 'U2', pines: { CLK: 'ck', RST: '0', Q0: 'q0', Q1: 'q1', Q2: 'q2', Q3: 'q3', CO: 'co' } },
    { tipo: 'decodificador-7seg', ref: 'U3', pines: { A: 'q0', B: 'q1', C: 'q2', D: 'q3', a: 'pa', b: 'pb', c: 'pc', d: 'pd', e: 'pe', f: 'pf', g: 'pg' } },
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => resistencia(`R${k + 3}`, '330', `p${s}`, `an_${s}`)),
    { tipo: 'display-7seg', ref: 'DS1', pines: { a: 'an_a', b: 'an_b', c: 'an_c', d: 'an_d', e: 'an_e', f: 'an_f', g: 'an_g', dp: 'suelto', COM: '0' } }
  ]
}

/** Escalera RC de `n` etapas (una resistencia en serie y un capacitor a tierra por etapa) con una fuente de 5 V: `2n + 1`
 * piezas más la tierra. Sirve de circuito grande que compila y converge. */
export function escaleraRC(n: number): Parte[] {
  const partes: Parte[] = [{ tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'n0', '-': '0' } }]
  for (let k = 1; k <= n; k++) {
    partes.push({ tipo: 'resistencia', ref: `R${k}`, props: { valor: '1k' }, pines: { '1': `n${k - 1}`, '2': `n${k}` } })
    partes.push({ tipo: 'capacitor', ref: `C${k}`, props: { valor: '100n' }, pines: { '1': `n${k}`, '2': '0' } })
  }
  return partes
}
