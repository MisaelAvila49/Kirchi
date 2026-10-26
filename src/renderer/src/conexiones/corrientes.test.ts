// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from './conexiones'
import { armarReparto, MAX_LAZOS, type Puerto } from './corrientes'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { divisor } from '../prueba/circuitos'
import { azarConSemilla, circuitoAlAzar } from '../prueba/circuitoAlAzar'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })

/** Los puertos de dos terminales de cada pieza `ids` (sus pines «a» y «b» y la tierra interna, como las casillas del motor). */
function puertosDe(d: Documento, ids: string[], pines: [string, string] = ['1', '2']): Puerto[] {
  const con = calcularConexiones(d, lib)
  const tierra = con.redes.find((r) => r.tierra)?.id ?? -1
  return ids.flatMap((id) => [
    ...pines.map((pin, k) => ({ red: con.redDePin.get(clavePin(id, pin))!, pin: clavePin(id, pin), signo: k === 0 ? 1 : -1 })),
    { red: tierra, pin: null }
  ])
}

describe('reparto de la corriente entre los tramos', () => {
  it('con alterna pura (media cero en cada casilla) la media absoluta de cada tramo toma el signo de la corriente instantánea de cada pieza', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    // Los elementos del motor: V1 (0), R1 (1) y R2 (2).
    const puertos = [...puertosDe(d, ['p_v1'], ['+', '-']), ...puertosDe(d, ['p_r1', 'p_r2'])].map((p, j) => ({ ...p, elemento: Math.floor(j / 3) }))
    const r = armarReparto(d, lib, con, puertos)
    // 1 mA de media absoluta en cada pieza y media exactamente cero (una senoidal pura promediada en periodos enteros).
    const i = 1e-3
    const medias = new Array(9).fill(0)
    const absolutas = [i, i, 0, i, i, 0, i, i, 0]
    // En el último paso la corriente iba en el sentido de la del primer caso (la fuente la entrega por «+»).
    const instantaneas = [-0.4e-3, 0.4e-3, 0.4e-3]
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, absolutas, m, a, instantaneas)
    for (const [k, t] of r.tramos.entries()) {
      expect(m[k], `${t.cable}#${t.segmento}`).toBeCloseTo(0, 15)
      expect(a[k], `${t.cable}#${t.segmento}`).toBeCloseTo(i, 15)
    }
  })

  it('en serie con una sola pieza de dos terminales, cada tramo lleva exactamente su corriente', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    // V1 (+ arriba, − abajo), R1 y R2, como el motor: entra por «a» y sale por «b».
    const puertos = [...puertosDe(d, ['p_v1'], ['+', '-']), ...puertosDe(d, ['p_r1', 'p_r2'])]
    const r = armarReparto(d, lib, con, puertos)
    const i = 2.5e-3
    // La fuente entrega 2.5 mA (por dentro va de − a +: entra por «+» −2.5 mA); cada resistencia los lleva de 1 a 2.
    const medias = [-i, i, 0, i, -i, 0, i, -i, 0]
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, medias.map(Math.abs), m, a)
    for (const [k, t] of r.tramos.entries()) {
      expect(Math.abs(m[k]), `${t.cable}#${t.segmento}`).toBeCloseTo(i, 15)
      expect(a[k]).toBeCloseTo(i, 15)
    }
    // El cable de arriba lleva la corriente de la fuente hacia R1: de (0, −4) hacia (6, −8).
    const primero = r.tramos.findIndex((t) => t.cable === 'c_a' && t.segmento === 0)
    expect(m[primero]).toBeCloseTo(i, 15)
    expect(r.residuo(medias)).toBeLessThan(1e-15)
  })

  it('el pin de un instrumento unido por sonda entra al grafo en el punto de su sonda, aunque sea la raíz de la red', () => {
    const d = divisor()
    // El osciloscopio sale primero por id: su entrada A sería la raíz de la red de arriba si quedara aislada.
    d.piezas.a_osc = pieza('a_osc', 'osciloscopio', 80, 0)
    // Un punto en medio del último segmento de c_a, de (0, −8) a (6, −8).
    const medio = { x: 3, y: -8 }
    d.sondas = { s: { id: 's', tipo: 'osciloscopio', x: medio.x, y: medio.y, instrumento: 'a_osc', entrada: 'A' } }
    const con = calcularConexiones(d, lib)
    expect(con.redDePin.get(clavePin('a_osc', 'A'))).toBe(con.redDeCable.get('c_a'))
    // La fuente (por «+») y R1 (por el pin 1) en serie: su corriente recorre el cable c_a.
    const puertos: Puerto[] = [
      { red: con.redDePin.get(clavePin('p_v1', '+'))!, pin: clavePin('p_v1', '+'), signo: 1, elemento: 0 },
      { red: con.redDePin.get(clavePin('p_r1', '1'))!, pin: clavePin('p_r1', '1'), signo: 1, elemento: 1 }
    ]
    const r = armarReparto(d, lib, con, puertos)
    const i = 1e-3
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir([-i, i], [i, i], m, a)
    const delCable = r.tramos.map((t, k) => ({ t, k })).filter(({ t }) => t.cable === 'c_a')
    expect(delCable.length).toBeGreaterThan(1)
    for (const { k } of delCable) expect(a[k]).toBeCloseTo(i, 15)
  })

  it('en una T reparte lo que entra por un pin entre los dos tramos que salen', () => {
    // Tres resistencias verticales cuyos pines de arriba se unen con un cable horizontal: el del medio es una unión en T.
    const d = documentoVacio()
    d.piezas.ra = pieza('ra', 'resistencia', 0, 4, 90)
    d.piezas.rb = pieza('rb', 'resistencia', 10, 4, 90)
    d.piezas.rc = pieza('rc', 'resistencia', 20, 4, 90)
    d.cables.c = { id: 'c', puntos: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }
    const con = calcularConexiones(d, lib)
    const r = armarReparto(d, lib, con, puertosDe(d, ['ra', 'rb', 'rc']))
    // Entran 3 mA por rb (sale de la red) y salen 1 y 2 mA por ra y rc (entran a la red por su pin de arriba).
    const medias = [-1e-3, 1e-3, 0, 3e-3, -3e-3, 0, -2e-3, 2e-3, 0]
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, medias.map(Math.abs), m, a)
    const izq = r.tramos.findIndex((t) => t.x0 === 0 && t.x1 === 10)
    const der = r.tramos.findIndex((t) => t.x0 === 10 && t.x1 === 20)
    expect(r.tramos).toHaveLength(2)
    // De ra hacia rb, 1 mA; de rb hacia rc, −2 mA (los 2 mA van de rc hacia rb).
    expect(m[izq]).toBeCloseTo(1e-3, 15)
    expect(m[der]).toBeCloseTo(-2e-3, 15)
    expect(r.residuo(medias)).toBeLessThan(1e-15)
  })

  it('en un lazo de cable reparte según el largo de cada camino, sin dejar quieto el tramo que lo cierra', () => {
    // Dos resistencias y dos caminos entre sus pines de arriba: uno de 10 unidades y otro de 30 (sube, cruza y baja).
    const d = documentoVacio()
    d.piezas.ra = pieza('ra', 'resistencia', 0, 4, 90)
    d.piezas.rb = pieza('rb', 'resistencia', 10, 4, 90)
    d.cables.corto = { id: 'corto', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
    d.cables.largo = { id: 'largo', puntos: [{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 0 }] }
    const con = calcularConexiones(d, lib)
    const r = armarReparto(d, lib, con, puertosDe(d, ['ra', 'rb']))
    // 4 mA entran a la red por el pin de arriba de ra y salen por el de rb.
    const medias = [-4e-3, 4e-3, 0, 4e-3, -4e-3, 0]
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, medias.map(Math.abs), m, a)
    const corto = r.tramos.findIndex((t) => t.cable === 'corto')
    const cruce = r.tramos.findIndex((t) => t.cable === 'largo' && t.segmento === 1)
    // Resistencias 10 y 30: 3 mA por el corto y 1 mA por el largo.
    expect(m[corto]).toBeCloseTo(3e-3, 12)
    expect(m[cruce]).toBeCloseTo(1e-3, 12)
    expect(r.residuo(medias)).toBeLessThan(1e-15)
    expect(r.sinFlechas.size).toBe(0)
  })

  it('las etiquetas con el mismo nombre llevan la corriente entre las partes que no tienen cable', () => {
    // ra arriba en (0,0) con una etiqueta «A» a 10 unidades por cable; rb arriba en (40,0) con otra «A» a 10 unidades.
    const d = documentoVacio()
    d.piezas.ra = pieza('ra', 'resistencia', 0, 4, 90)
    d.piezas.rb = pieza('rb', 'resistencia', 40, 4, 90)
    d.cables.c1 = { id: 'c1', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
    d.cables.c2 = { id: 'c2', puntos: [{ x: 40, y: 0 }, { x: 30, y: 0 }] }
    d.etiquetas.e1 = { id: 'e1', nombre: 'A', x: 10, y: 0, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: 'A', x: 30, y: 0, rot: 0 }
    const con = calcularConexiones(d, lib)
    const r = armarReparto(d, lib, con, puertosDe(d, ['ra', 'rb']))
    const medias = [-5e-3, 5e-3, 0, 5e-3, -5e-3, 0]
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, medias.map(Math.abs), m, a)
    expect(m[r.tramos.findIndex((t) => t.cable === 'c1')]).toBeCloseTo(5e-3, 9)
    // c2 va de rb hacia la etiqueta: la corriente va de la etiqueta hacia rb, contra su sentido.
    expect(m[r.tramos.findIndex((t) => t.cable === 'c2')]).toBeCloseTo(-5e-3, 9)
    expect(r.residuo(medias)).toBeLessThan(1e-15)
  })

  it(`con más de ${MAX_LAZOS} lazos una red no lleva flechas y lo dice`, () => {
    // Una escalera: dos rieles unidos por 40 peldaños forman 39 lazos.
    const d = documentoVacio()
    d.piezas.ra = pieza('ra', 'resistencia', 0, 4, 90)
    d.cables.riel1 = { id: 'riel1', puntos: [{ x: 0, y: 0 }, { x: 80, y: 0 }] }
    d.cables.riel2 = { id: 'riel2', puntos: [{ x: 0, y: -4 }, { x: 80, y: -4 }] }
    for (let k = 0; k < 40; k++) d.cables[`p${k}`] = { id: `p${k}`, puntos: [{ x: 2 * k, y: 0 }, { x: 2 * k, y: -4 }] }
    const con = calcularConexiones(d, lib)
    const r = armarReparto(d, lib, con, puertosDe(d, ['ra']))
    expect([...r.sinFlechas.values()]).toEqual(['lazos'])
    const m = new Float64Array(r.tramos.length).fill(7), a = new Float64Array(r.tramos.length)
    r.repartir([-1e-3, 1e-3, 0], [1e-3, 1e-3, 0], m, a)
    expect(m.every((x) => x === 0)).toBe(true)
  })

  it('en 330 circuitos al azar cada punto cumple la ley de corrientes (1e-12 A más 1e-9 relativo)', () => {
    for (let s = 0; s < 330; s++) {
      const d = circuitoAlAzar(s, lib)
      const con = calcularConexiones(d, lib)
      const azar = azarConSemilla(9000 + s)
      // Por red, corrientes al azar en sus pines que suman cero (la tierra, cualquiera: la absorbe su virtual).
      const puertos: Puerto[] = []
      const medias: number[] = []
      for (const red of con.redes) {
        if (red.pines.length === 0) continue
        let suma = 0
        for (const pin of red.pines) {
          const x = (azar() - 0.5) * 10 ** (Math.floor(azar() * 9) - 6)
          puertos.push({ red: red.id, pin })
          medias.push(x)
          suma += x
        }
        if (!red.tierra) {
          puertos.push({ red: red.id, pin: null })
          medias.push(-suma)
        }
      }
      const r = armarReparto(d, lib, con, puertos)
      const mayor = medias.reduce((a, x) => Math.max(a, Math.abs(x)), 0)
      expect(r.residuo(medias), `semilla ${s}`).toBeLessThanOrEqual(1e-12 + 1e-9 * mayor)
    }
  })
})
