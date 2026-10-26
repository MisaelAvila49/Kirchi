// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { MAX_ELEMENTS, MAX_NODES } from '../sim/protocol'
import type { ElementoMotor } from './netlist'
import { dentro, DIRECTOS, errorDeRango, MODELOS, PARAMETROS, type Rango } from './rangos'

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** El motor acepta la netlist de un solo elemento (valida al construir; no la resuelve). */
function elMotorLaAcepta(e: ElementoMotor): boolean {
  try {
    new Simulator(JSON.stringify({ nodes: 6, digital_nets: 16, elements: [e] }), 1e-6).free()
    return true
  } catch {
    return false
  }
}

/** Un elemento válido de cada tipo, del que se parte cambiando un solo valor. */
const BASE: Record<string, ElementoMotor> = {
  R: { type: 'R', a: 1, b: 0, ohms: 1000 },
  BUZZER: { type: 'BUZZER', a: 1, b: 0, ohms: 166.7, umbral: 3 },
  C: { type: 'C', a: 1, b: 0, farads: 1e-6 },
  L: { type: 'L', a: 1, b: 0, henries: 1e-3 },
  I: { type: 'I', a: 0, b: 1, amps: 1e-3 },
  LAMP: { type: 'LAMP', a: 1, b: 0, rfrio: 2.88, k: 9, pnom: 5, tau: 0.05 },
  MOTOR: { type: 'MOTOR', a: 1, b: 0, r: 3, l: 1.5e-3, ke: 6e-3, j: 2.4e-7, bm: 6.4e-7 },
  FUSE: { type: 'FUSE', a: 1, b: 0, ohms: 0.1, inom: 1, ifusion: 2, tau: 0.125 },
  RELAY: { type: 'RELAY', a1: 1, a2: 0, com: 2, na: 3, nc: 4, r: 69.4, l: 0.2, ion: 0.054, ioff: 0.0072 },
  D: { type: 'D', a: 1, b: 0, is: 1e-14, n: 1, rs: 1, bv: 5.1, nbv: 1 },
  Q: { type: 'Q', c: 1, b: 2, e: 0, pnp: false, model: { is: 1e-14, bf: 100 } },
  M: { type: 'M', d: 1, g: 2, s: 0, pmos: false, model: { vto: 2, kp: 0.1, w: 1, l: 1 } },
  XFMR: { type: 'XFMR', a1: 1, b1: 0, a2: 2, b2: 0, l1: 1e-3, l2: 1e-3, k: 0.5 },
  OA: { type: 'OA', p: 1, n: 2, out: 3, vp: 4, vn: 5, model: {} },
  GATE: { type: 'GATE', fn: 'not', inputs: [0], output: 1, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
  DFF: { type: 'DFF', d: 0, clk: 1, pre: 2, clr: 3, q: 4, qn: 5, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
  JKFF: { type: 'JKFF', j: 0, k: 1, clk: 2, pre: 3, clr: 4, q: 5, qn: 6, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
  COUNTER: { type: 'COUNTER', clk: 0, rst: 1, q: [2, 3, 4, 5], co: 6, modulo: 10, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
  DECODER: { type: 'DECODER', inputs: [0, 1, 2, 3], outputs: [4, 5, 6, 7, 8, 9, 10], activo_alto: true, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
  LATCH555: { type: 'LATCH555', trig: 0, thr: 1, res: 2, q: 3, delay: 1e-7 },
  // Con los umbrales en los extremos, cada uno se prueba hasta el borde sin cruzar al otro.
  ADC: { type: 'ADC', p: 1, n: 0, out: 0, in_low: -1e3, in_high: 1e3 },
  DAC: { type: 'DAC', input: 0, out: 1, v_lo: 0, v_hi: 5, r_lo: 55, r_hi: 55, t_rise: 7e-9, t_fall: 7e-9 },
  OUT555: { type: 'OUT555', q: 0, out: 1, dis: 2, vcc: 3, gnd: 0, v_lo: 0.025, r_lo: 7.5, v_hi: -1.4, r_hi: 3, g_on: 1 / 15, g_off: 1e-9, t_rise: 1e-7, t_fall: 1e-7 }
}

function con(base: ElementoMotor, campo: string, donde: 'el' | 'model', v: number): ElementoMotor {
  const e = structuredClone(base) as ElementoMotor & { model?: Record<string, number> }
  if (donde === 'model') e.model = { ...e.model, [campo]: v }
  else (e as unknown as Record<string, number>)[campo] = v
  return e
}

/** Valores a los dos lados de las cotas de `g`. */
function lados(g: Rango): { fuera: number[]; dentro: number[] } {
  const finito = Number.isFinite(g.hi)
  const fuera = [g.lo > 0 ? g.lo / 10 : g.lo - 1]
  if (finito) fuera.push(g.hi * 10 + 1)
  const dentro: number[] = []
  // Los extremos que entran se prueban en el borde; los que no entran, un poco adentro.
  dentro.push(g.sinLo ? (finito ? g.lo + (g.hi - g.lo) * 1e-3 : Math.max(g.lo * 2, 1e-3)) : g.lo)
  if (finito) dentro.push(g.sinHi ? g.hi - (g.hi - g.lo) * 1e-3 : g.hi)
  if (g.sinLo && g.lo === 0) fuera.push(0)
  if (g.sinHi && finito) fuera.push(g.hi)
  return { fuera, dentro }
}

/** El nombre de campo de cada tabla del motor se prueba solo con un elemento cuyo resto es válido. */
const CASOS: [string, Rango, 'el' | 'model'][] = []
for (const [tipo, lista] of Object.entries(DIRECTOS)) for (const g of lista!) CASOS.push([tipo, g, 'el'])
for (const [tipo, lista] of Object.entries(MODELOS)) for (const g of lista!) CASOS.push([tipo, g, tipo === 'D' ? 'el' : 'model'])

describe('rangos de los valores contra el motor de verdad (las tablas de rangos.ts, sin copiarlas)', () => {
  it('hay una prueba por cada campo de las tablas', () => {
    expect(CASOS.length).toBeGreaterThan(80)
  })

  it.each(CASOS.map(([tipo, g, donde]) => [`${tipo}.${g.campo}`, tipo, g, donde] as const))('%s', (_nombre, tipo, g, donde) => {
    // La corriente de liberación del relé debe quedar bajo la de operación: cada una se prueba con la otra en su lugar.
    const base: ElementoMotor =
      tipo === 'RELAY' ? (g.campo === 'ion' ? ({ ...BASE.RELAY, ioff: 0 } as ElementoMotor) : ({ ...BASE.RELAY, ion: 1e3 } as ElementoMotor)) : BASE[tipo]
    const { fuera, dentro: bien } = lados(g)
    // Con `ion` en su máximo, `ioff` no puede llegar al suyo (debe quedar abajo): solo se prueba el de abajo.
    if (tipo === 'RELAY' && g.campo === 'ioff') bien.pop()
    for (const v of fuera) {
      const e = con(base, g.campo, donde, v)
      expect(dentro(v, g), `la tabla debe rechazar ${tipo}.${g.campo} = ${v}`).toBe(false)
      expect(errorDeRango(e, 'X1'), `${tipo}.${g.campo} = ${v} debe rechazarse`).not.toBeNull()
      expect(elMotorLaAcepta(e), `el motor debe rechazar ${tipo}.${g.campo} = ${v}`).toBe(false)
    }
    for (const v of bien) {
      const e = con(base, g.campo, donde, v)
      expect(errorDeRango(e, 'X1'), `${tipo}.${g.campo} = ${v} debe aceptarse`).toBeNull()
      expect(elMotorLaAcepta(e), `el motor debe aceptar ${tipo}.${g.campo} = ${v}`).toBe(true)
    }
  })

  it('las fuentes de voltaje: continua, senoidal y cuadrada', () => {
    const v = (wave: object) => ({ type: 'V', a: 1, b: 0, wave }) as unknown as ElementoMotor
    const casos: [ElementoMotor, boolean][] = [
      [v({ kind: 'dc', v: 1e6 }), true],
      [v({ kind: 'dc', v: 1e7 }), false],
      [v({ kind: 'sine', offset: 0, amp: 1, freq: 1e9 }), true],
      [v({ kind: 'sine', offset: 0, amp: 1, freq: 1e10 }), false],
      [v({ kind: 'sine', offset: 0, amp: 1e7, freq: 50 }), false],
      [v({ kind: 'square', low: 0, high: 5, freq: 1e9, duty: 0.5 }), true],
      [v({ kind: 'square', low: 0, high: 5, freq: 1e10, duty: 0.5 }), false],
      [v({ kind: 'square', low: 0, high: 5, freq: 1e-7, duty: 0.5 }), false],
      [v({ kind: 'square', low: 0, high: 5, freq: 50, duty: 1 }), false],
      [v({ kind: 'square', low: 0, high: 5, freq: 50, duty: 0.3 }), true]
    ]
    for (const [e, ok] of casos) {
      expect(errorDeRango(e, 'V1') === null, JSON.stringify(e)).toBe(ok)
      expect(elMotorLaAcepta(e), JSON.stringify(e)).toBe(ok)
    }
  })

  it('el voltaje de Early es 0 (infinito) o de 1 V en adelante', () => {
    for (const [v, ok] of [[0, true], [0.5, false], [1, true], [74, true]] as const) {
      for (const campo of ['vaf', 'var']) {
        const e = con(BASE.Q, campo, 'model', v)
        expect(errorDeRango(e, 'Q1') === null).toBe(ok)
        expect(elMotorLaAcepta(e)).toBe(ok)
      }
    }
  })

  it('la corriente de liberación de un relé debe quedar bajo la de operación', () => {
    for (const [ion, ioff, ok] of [[0.05, 0.007, true], [0.05, 0.05, false], [0.05, 0.06, false], [0.05, 0, true]] as const) {
      const e = { ...BASE.RELAY, ion, ioff } as ElementoMotor
      expect(errorDeRango(e, 'K1') === null, `ion ${ion} ioff ${ioff}`).toBe(ok)
      expect(elMotorLaAcepta(e), `ion ${ion} ioff ${ioff}`).toBe(ok)
    }
  })

  it('la oración nombra la pieza, el valor y lo que se admite', () => {
    expect(errorDeRango({ type: 'R', a: 1, b: 0, ohms: 1e-9 }, 'R3')).toBe('R3: su resistencia vale 1 nΩ, fuera de lo que admite la vista previa (de 1 µΩ a 1 TΩ).')
    expect(errorDeRango({ type: 'R', a: 1, b: 0, ohms: Number.NaN }, 'R3')).toContain('un valor que no es un número')
    expect(errorDeRango({ type: 'R', a: 1, b: 0, ohms: 1000 }, 'R3')).toBeNull()
    expect(errorDeRango(con(BASE.Q, 'bf', 'model', 0), 'Q1')).toBe('Q1: la ganancia directa (bf) vale 0, fuera de lo que admite la vista previa (mayor que 0).')
  })
})

describe('nombres de parámetro y límites de la vista previa contra el motor', () => {
  /** Un valor que cualquier parámetro del tipo acepta, sacado de su tabla. */
  function valorValido(tipo: 'Q' | 'M' | 'OA', campo: string): number {
    const g = MODELOS[tipo]!.find((x) => x.campo === campo)
    if (campo === 'vaf' || campo === 'var') return 74
    if (!g) throw new Error(`${tipo}.${campo} no está en la tabla de rangos`)
    return lados(g).dentro[0]
  }

  it.each([
    ['bjt', 'Q'],
    ['mosfet', 'M'],
    ['ampop', 'OA']
  ] as const)('cada nombre de PARAMETROS.%s lo lee el motor (el motor rechaza los que no conoce)', (modelo, tipo) => {
    for (const nombre of PARAMETROS[modelo].nombres) {
      const e = con(BASE[tipo], nombre, 'model', valorValido(tipo, nombre))
      expect(elMotorLaAcepta(e), `el motor debe leer «${nombre}» de un ${modelo}`).toBe(true)
    }
    // Y uno inventado no pasa: el motor no ignora lo que no entiende.
    expect(elMotorLaAcepta(con(BASE[tipo], 'parametro_inventado', 'model', 1))).toBe(false)
  })

  it('los límites de la interfaz son los del motor: uno más y el motor lo rechaza', () => {
    const redes = (n: number) => JSON.stringify({ nodes: n, elements: [{ type: 'R', a: 1, b: 0, ohms: 10 }] })
    new Simulator(redes(MAX_NODES), 1e-6).free()
    expect(() => new Simulator(redes(MAX_NODES + 1), 1e-6)).toThrow(/admite hasta/)
    const piezas = (n: number) => JSON.stringify({ nodes: 2, elements: Array.from({ length: n }, () => ({ type: 'R', a: 1, b: 0, ohms: 10 })) })
    new Simulator(piezas(MAX_ELEMENTS), 1e-6).free()
    expect(() => new Simulator(piezas(MAX_ELEMENTS + 1), 1e-6)).toThrow(/admite hasta/)
  })
})
