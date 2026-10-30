// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import type { NetlistMotor } from '../netlist/netlist'
import { PASO_MAX, PASO_MIN, PASO_VISTA, pasoDeSimulacion, pasoDeVistaPrevia, topesDeVistaPrevia } from './lectura'
import { ASTABLE_555, CONTADOR, correr, cruces, formaRelativa, iniciarMotor, netlistDe, netlistDeArchivo, periodoMedio, RC_CUADRADA, RECTIFICADOR_LED, trazaPorPasos } from '../prueba/pasoVista'

beforeAll(iniciarMotor)

const con = (...elements: NetlistMotor['elements']): NetlistMotor => ({ nodes: 2, elements }) as unknown as NetlistMotor
const seno = (freq: number): NetlistMotor['elements'][number] => ({ type: 'V', a: 1, b: 0, wave: { kind: 'sine', offset: 0, amp: 1, freq } })

describe('pasoDeVistaPrevia', () => {
  it('sin fuentes periódicas pide 250 µs', () => {
    expect(pasoDeVistaPrevia(con({ type: 'R', a: 1, b: 0, ohms: 1 }))).toBe(PASO_VISTA)
    expect(PASO_VISTA).toBe(2.5e-4)
  })
  it('una fuente lenta no lo acorta y una rápida pide 50 pasos por periodo', () => {
    expect(pasoDeVistaPrevia(con(seno(0.05)))).toBe(PASO_VISTA)
    expect(pasoDeVistaPrevia(con(seno(60)))).toBeCloseTo(1 / 12000, 12)
    expect(pasoDeVistaPrevia(con(seno(250)))).toBeCloseTo(PASO_MAX, 12)
    expect(pasoDeVistaPrevia(con(seno(1000)))).toBeCloseTo(PASO_MAX, 12)
    expect(pasoDeVistaPrevia(con(seno(2000)))).toBeCloseTo(1e-5, 12)
    expect(pasoDeVistaPrevia(con(seno(1e9)))).toBe(PASO_MIN)
  })
  it('un flanco corto de un pulso acota el paso a la mitad de lo que el motor tolera', () => {
    const pulso = { type: 'V', a: 1, b: 0, wave: { kind: 'pulse', low: 0, high: 5, freq: 0.1, rise: 1e-8, fall: 1e-8, width: 1, phase: 0, continua: true } } as const
    expect(pasoDeVistaPrevia(con(pulso))).toBeCloseTo(0.5e4 * 1e-8, 15)
  })
  it('la esquina más corta de una onda por tramos acota el paso como el flanco de un pulso', () => {
    const tramos = (puntos: [number, number][]) => ({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos, repetir: false } }) as const
    expect(pasoDeVistaPrevia(con(tramos([[0, 0], [1e-8, 5], [1, 5]])))).toBeCloseTo(0.5e4 * 1e-8, 15)
    // Los tramos largos no lo acortan y un solo punto es una constante.
    expect(pasoDeVistaPrevia(con(tramos([[0, 0], [1e-3, 5], [2e-3, 0]])))).toBe(PASO_VISTA)
    expect(pasoDeVistaPrevia(con(tramos([[0, 3]])))).toBe(PASO_VISTA)
  })
  it('las fuentes de corriente con onda acotan el paso como las de voltaje', () => {
    const iSeno = (freq: number) => ({ type: 'I', a: 1, b: 0, amps: 0, wave: { kind: 'sine', offset: 0, amp: 1e-3, freq, phase: 0, continua: true } }) as const
    const iPulso = { type: 'I', a: 1, b: 0, amps: 0, wave: { kind: 'pulse', low: 0, high: 1e-3, freq: 0.1, rise: 1e-9, fall: 1e-9, width: 1, phase: 0, continua: true } } as const
    expect(pasoDeVistaPrevia(con(iSeno(60)))).toBeCloseTo(pasoDeVistaPrevia(con(seno(60))), 12)
    expect(1 / (100 * pasoDeVistaPrevia(con(iSeno(100))))).toBeGreaterThanOrEqual(200)
    expect(pasoDeSimulacion(con(iSeno(2000)))).toBeCloseTo(pasoDeSimulacion(con(seno(2000))), 12)
    expect(topesDeVistaPrevia(con(iPulso)).fuentes).toHaveLength(1)
    expect(pasoDeVistaPrevia(con(iPulso))).toBeCloseTo(0.5e4 * 1e-9, 15)
  })
  it('una base de tiempo lo acota a 500 pasos por pantalla', () => {
    expect(pasoDeVistaPrevia(con(seno(0.05)), [1e-3])).toBeCloseTo((10 * 1e-3) / 500, 15)
    expect(pasoDeVistaPrevia(con(seno(0.05)), [10])).toBe(PASO_VISTA)
  })
})

/** Compara la vista previa nueva con la cota fina de 20 µs en el mismo circuito. */
function dos(partes: Parameters<typeof netlistDe>[0], hasta: number) {
  const net = netlistDe(partes)
  const hNuevo = pasoDeVistaPrevia(net)
  const nuevo = trazaPorPasos(net, hNuevo, hasta)
  const viejo = trazaPorPasos(net, PASO_MAX, hasta)
  return { net, hNuevo, nuevo, viejo }
}

/** Los periodos de cada nodo que oscila coinciden en `tol` (relativo) y el número de cruces difiere a lo más en 1. */
function mismosPeriodos(a: ReturnType<typeof trazaPorPasos>, b: ReturnType<typeof trazaPorPasos>, tol: number): number {
  let oscilan = 0
  for (let n = 0; n < a.v[0].length; n++) {
    const ca = cruces(a, n)
    const cb = cruces(b, n)
    if (ca.length < 3) continue
    oscilan++
    expect(Math.abs(ca.length - cb.length), `nodo ${n}: cruces`).toBeLessThanOrEqual(1)
    expect(Math.abs(periodoMedio(ca) / periodoMedio(cb) - 1), `nodo ${n}: periodo`).toBeLessThan(tol)
  }
  return oscilan
}

describe('la vista previa con el paso adaptativo contra la cota de 20 µs', () => {
  it('RC con cuadrada de 1 kHz: la forma coincide dentro de 1 %', () => {
    const { hNuevo, nuevo, viejo } = dos(RC_CUADRADA, 0.02)
    expect(hNuevo).toBeCloseTo(PASO_MAX, 12)
    expect(formaRelativa(nuevo, viejo, 0.005, 0.02, 1e-5)).toBeLessThan(0.01)
  })
  it('rectificador con LED a 60 Hz: la forma coincide dentro de 1 %', () => {
    const { hNuevo, nuevo, viejo } = dos(RECTIFICADOR_LED, 0.2)
    expect(hNuevo).toBeCloseTo(1 / 12000, 12)
    expect(formaRelativa(nuevo, viejo, 0.05, 0.2, 5e-5)).toBeLessThan(0.01)
  })
  it('555 astable: la frecuencia coincide dentro de 1 %', () => {
    const { hNuevo, nuevo, viejo } = dos(ASTABLE_555, 0.2)
    expect(hNuevo).toBe(PASO_VISTA)
    expect(mismosPeriodos(nuevo, viejo, 0.01)).toBeGreaterThan(0)
  })
  it('555 con contador y display: cada bit del contador conserva su frecuencia dentro de 1 %', () => {
    const { nuevo, viejo } = dos(CONTADOR, 0.3)
    // Los nodos analógicos que siguen al contador (los segmentos del display) más el reloj.
    expect(mismosPeriodos(nuevo, viejo, 0.01)).toBeGreaterThanOrEqual(3)
  })
})

describe('avanzar en tramos cortos', () => {
  // Con 20 µs, un bucle de advance_to en tramos de 5, 8.3, 10 y 16.6 ms agotaba el presupuesto de iteraciones en t = 8.985,
  // 10.64, 9.54 y 17.88 s de compuanalogica.kir y no avanzaba más (el motor no converge en un cruce de la alimentación del
  // amplificador con ese paso y esa alineación). Con el paso adaptativo no se vio en 50 s con seis tramos distintos.
  it.each([0.005, 0.0083, 0.01, 0.0166])('compuanalogica.kir no se atasca con tramos de %s s', (tramo) => {
    const net = netlistDeArchivo('CompuAnalogica.kir')
    const r = correr(net, pasoDeVistaPrevia(net), 20, 20, tramo)
    expect(r.error).toBeUndefined()
  }, 60_000)
})
