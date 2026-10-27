// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { chipsDeVoltajeReferencia } from '../prueba/chipsReferencia'
import { azarConSemilla, circuitoAlAzar } from '../prueba/circuitoAlAzar'
import { libreriaDePrueba } from '../prueba/libreria'
import { documentoVacio, type Documento } from '../doc/tipos'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'
import type { OpcionesChips } from './chips'
import type { Lectura, LecturaDigital } from '../sim/lectura'
import { cajaTexto } from './apartar'
import { cajaEnMundo } from '../piezas/transformar'
import { acotarAlAlcance } from './ajusteChips'
import { pinesEnMundo } from '../piezas/transformar'
import { chipsDeVoltaje, FACTOR_ANILLO, SEPARACION_CHIP, TAM_CHIP } from './chips'

const lib = libreriaDePrueba().piezas
const d = divisor()
const con = calcularConexiones(d, lib)
const alta = con.redDePin.get(clavePin('p_v1', '+'))!
const medio = con.redDePin.get(clavePin('p_r1', '2'))!
const tierra = con.redDePin.get(clavePin('p_v1', '-'))!
const lectura = (redes: [number, number][]): Lectura => ({ t: 0, ratio: 1, redes: new Map(redes), piezas: new Map() })

describe('chipsDeVoltaje con redes digitales', () => {
  const digital = (d: Partial<LecturaDigital>): LecturaDigital => ({ nivel: '1', nominal: 5, f: 0, ciclo: 0, vcc: 5, cambios: 1, conmuta: false, ...d })
  const conDigitales = (m: [number, LecturaDigital][], redes: [number, number][] = []): Lectura => ({ ...lectura(redes), digitales: new Map(m) })

  it('una red digital pura dice su nivel y su voltaje nominal; X y Z, solo la letra', () => {
    const textos = (x: LecturaDigital) => chipsDeVoltaje(d, lib, con, conDigitales([[alta, x]]), [], { redes: null }).map((c) => c.texto)
    expect(textos(digital({}))).toEqual(['1 · 5.00 V nominal'])
    expect(textos(digital({ nivel: 'X', nominal: null }))).toEqual(['X'])
    expect(textos(digital({ nivel: 'Z', nominal: null }))).toEqual(['Z'])
  })

  it('una red que conmuta más rápido que la pantalla dice su frecuencia, aunque sea analógica', () => {
    const l = conDigitales([[alta, digital({ nominal: null, f: 1000, conmuta: true })]], [[alta, 4.9]])
    expect(chipsDeVoltaje(d, lib, con, l, [], { redes: null }).map((c) => c.texto)).toEqual(['conmuta, 1.00 kHz'])
    // Sin conmutar, la analógica sigue diciendo su voltaje.
    const quieta = conDigitales([[alta, digital({ nominal: null })]], [[alta, 4.9]])
    expect(chipsDeVoltaje(d, lib, con, quieta, [], { redes: null }).map((c) => c.texto)).toEqual(['4.90 V'])
  })

  it('el oráculo dice lo mismo', () => {
    const l = conDigitales([[alta, digital({})], [medio, digital({ nivel: 'X', nominal: null })]])
    expect(chipsDeVoltaje(d, lib, con, l, [], { redes: null })).toEqual(chipsDeVoltajeReferencia(d, lib, con, l, [], { redes: null }))
  })
})

describe('chipsDeVoltaje: qué redes y dónde', () => {
  const todas = lectura([[alta, 5], [medio, 2.5]])

  it('solo las redes pedidas; con null, todas; con un conjunto vacío, ninguna', () => {
    expect(chipsDeVoltaje(d, lib, con, todas, [], { redes: new Set([alta]) }).map((c) => c.texto)).toEqual(['5.00 V'])
    expect(chipsDeVoltaje(d, lib, con, todas, [], { redes: null })).toHaveLength(2)
    expect(chipsDeVoltaje(d, lib, con, todas, [], { redes: new Set() })).toEqual([])
  })

  it('cada chip lleva la llave de su red, la misma con o sin filtro', () => {
    const a = chipsDeVoltaje(d, lib, con, todas, [], { redes: null }).find((c) => c.texto === '5.00 V')!
    const b = chipsDeVoltaje(d, lib, con, todas, [], { redes: new Set([alta]) })[0]
    expect(a.clave).toBeTruthy()
    expect(b.clave).toBe(a.clave)
  })

  it('el desplazo del lector se suma a donde lo puso el reparto, acotado a 8 unidades de su red, y no mueve a los demás', () => {
    const sin = chipsDeVoltaje(d, lib, con, todas)
    const clave = sin.find((c) => c.texto === '5.00 V')!.clave!
    const con2 = chipsDeVoltaje(d, lib, con, todas, [], { redes: null, desplazos: new Map([[clave, { dx: 1, dy: -2 }]]) })
    const base = sin.find((c) => c.texto === '5.00 V')!, mov = con2.find((c) => c.texto === '5.00 V')!
    expect([mov.x - base.x, mov.y - base.y]).toEqual([1, -2])
    const lejos = chipsDeVoltaje(d, lib, con, todas, [], { redes: null, desplazos: new Map([[clave, { dx: 50, dy: 0 }]]) }).find((c) => c.texto === '5.00 V')!
    // Más allá del alcance se queda a 8 unidades de la red: lo que no supera su propia red se mueve entero.
    expect(acotarAlAlcance(d, lib, con.redes.find((r) => r.id === alta)!, lejos.x, lejos.y)).toEqual({ x: lejos.x, y: lejos.y })
    expect(lejos.x - base.x).toBeGreaterThan(8)
    expect(con2.find((c) => c.texto === '2.50 V')).toEqual(sin.find((c) => c.texto === '2.50 V'))
  })
})

describe('chipsDeVoltaje', () => {
  it('un chip por red simulada, con tres cifras, sin la tierra', () => {
    const chips = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5], [tierra, 0]]))
    expect(chips.map((c) => c.texto).sort()).toEqual(['2.50 V', '5.00 V'])
    expect(chips.every((c) => c.chip && c.fuente === 'cifras' && c.tamaño === TAM_CHIP && c.color === 'trazo')).toBe(true)
  })

  it('va encima del tramo horizontal más largo de la red, centrado', () => {
    const [chip] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]))
    // V1+ sube de (0, −4) a (0, −8) y sigue a (6, −8): el tramo horizontal va de x = 0 a x = 6.
    expect(chip).toMatchObject({ x: 3, y: -8 - SEPARACION_CHIP, alinear: 'centro' })
  })

  it('una red sin cables lleva el chip junto al pin de menor referencia, sin tocar cuerpos', () => {
    const [chip] = chipsDeVoltaje(d, lib, con, lectura([[medio, 2.5]]))
    // El punto medio une el pin 2 de R1 con el pin 1 de R2 en (14, −8), sin cable.
    expect(chip.x).toBe(14)
    // Los dos renglones pegados al pin tocan el cuerpo de R2: el chip se aleja hasta quedar libre.
    const k = Math.abs(chip.y + 8) / SEPARACION_CHIP
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)
    const b = cajaTexto(chip)
    for (const p of Object.values(d.piezas)) {
      const c = cajaEnMundo(p, lib.get(p.tipo)!)
      expect(b.minX < c.maxX && c.minX < b.maxX && b.minY < c.maxY && c.minY < b.maxY).toBe(false)
    }
  })

  it('un texto de la escena en el lugar de arriba manda el chip debajo del cable', () => {
    const encima = { texto: 'R9', x: 3, y: -8 - SEPARACION_CHIP, alinear: 'centro' as const, tamaño: 1.6, color: 'pieza' as const, fuente: 'interfaz' as const }
    const [chip] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [encima])
    expect(chip.y).toBe(-8 + SEPARACION_CHIP)
  })

  it('dos chips no se enciman', () => {
    const chips = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]))
    const [a, b] = chips.map((c) => cajaTexto(c))
    expect(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY).toBe(true)
  })
})

describe('chipsDeVoltaje: obstáculos enormes y luz del LED', () => {
  const texto = (x: number, y: number, ancho: number) => ({ texto: 'X', x, y, alinear: 'centro' as const, tamaño: 1.6, ancho, color: 'pieza' as const, fuente: 'interfaz' as const })
  const AMPLIO = 2 ** 21

  it('un texto que abarca todo el rango de coordenadas se indexa sin recorrer millones de celdas', () => {
    const base = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]))
    const t0 = performance.now()
    const lejos = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]), [texto(0, 5000, AMPLIO)])
    expect(performance.now() - t0).toBeLessThan(50)
    expect(lejos).toEqual(base)
  })

  it('un obstáculo enorme sobre el lugar de arriba da el mismo reparto que uno corto', () => {
    const y = -8 - SEPARACION_CHIP
    const [corto] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [texto(3, y, 4)])
    const t0 = performance.now()
    const [largo] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [texto(3, y, AMPLIO)])
    expect(performance.now() - t0).toBeLessThan(50)
    expect(largo).toEqual(corto)
    expect(largo.y).toBe(-8 + SEPARACION_CHIP)
  })

  it('coordenadas no finitas no cuelgan ni rompen el reparto', () => {
    const t0 = performance.now()
    const chips = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [texto(NaN, 0, 4), texto(Infinity, 0, 4)])
    expect(performance.now() - t0).toBeLessThan(50)
    expect(chips).toHaveLength(1)
  })

  it('el disco de luz de un LED es un obstáculo: ningún chip toca su anillo', () => {
    const led = ledConBateria()
    const c = calcularConexiones(led, lib)
    const redes: [number, number][] = c.redes.map((r) => [r.id, 5])
    const chips = chipsDeVoltaje(led, lib, c, lectura(redes))
    const caja = cajaEnMundo(led.piezas.p_d1, lib.get('led')!)
    const cx = (caja.minX + caja.maxX) / 2, cy = (caja.minY + caja.maxY) / 2
    const r = (Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY) / 2) * FACTOR_ANILLO
    expect(chips.length).toBeGreaterThan(0)
    for (const ch of chips) {
      const b = cajaTexto(ch, 0)
      const dx = Math.max(b.minX - cx, 0, cx - b.maxX), dy = Math.max(b.minY - cy, 0, cy - b.maxY)
      expect(Math.hypot(dx, dy)).toBeGreaterThan(r)
    }
  })
})

describe('chipsDeVoltaje: no se confunden con el valor de una pieza', () => {
  const ref = (x: number, y: number) => ({ texto: 'R1', x, y, alinear: 'centro' as const, tamaño: 1.6, color: 'pieza' as const, fuente: 'interfaz' as const })
  const ARRIBA = -8 - SEPARACION_CHIP

  it('un texto cercano en la misma línea manda el chip al otro lado del cable, aunque no se toquen', () => {
    const [chip] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [ref(10, ARRIBA)])
    expect(chip.y).toBe(-8 + SEPARACION_CHIP)
  })

  it('un texto lejano en la misma línea no cambia nada', () => {
    const [chip] = chipsDeVoltaje(d, lib, con, lectura([[alta, 5]]), [ref(40, ARRIBA)])
    expect(chip.y).toBe(ARRIBA)
  })

  it('ningún chip queda a menos de 6 unidades de una referencia de su línea si hay alternativa', () => {
    const textos = [ref(10, ARRIBA), ref(20, -8 + SEPARACION_CHIP)]
    for (const c of chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]), textos)) {
      const b = cajaTexto(c, 0)
      for (const t of textos) {
        const o = cajaTexto(t, 0)
        const misma = Math.abs(t.y - c.y) < t.tamaño
        const hueco = Math.max(o.minX - b.maxX, b.minX - o.maxX)
        if (misma) expect(hueco).toBeGreaterThanOrEqual(6)
      }
    }
  })
})

describe('chipsDeVoltaje: margen de los extremos de pin', () => {
  /** Un cable horizontal de 30 unidades con el pin de una resistencia vertical a media longitud, arriba o abajo. */
  const conResistencia = (arriba: boolean) => {
    const doc = documentoVacio()
    doc.piezas.a = { id: 'a', tipo: 'resistencia', ref: 'R1', x: 16, y: arriba ? -4 : 4, rot: 90, espejo: false, props: {} }
    doc.cables.w = { id: 'w', puntos: [{ x: 0, y: 0 }, { x: 30, y: 0 }] }
    const c = calcularConexiones(doc, lib)
    const l = lectura([[c.redDeCable.get('w')!, 5]])
    return chipsDeVoltaje(doc, lib, c, l)[0]
  }

  it('con el pin arriba el chip va debajo del cable; con el pin abajo, arriba', () => {
    expect(conResistencia(true).y).toBe(SEPARACION_CHIP)
    expect(conResistencia(false).y).toBe(-SEPARACION_CHIP)
  })
})

describe('chipsDeVoltaje da exactamente lo mismo que su versión de referencia (prueba/chipsReferencia.ts)', () => {
  const VOLTAJES = [0, -0, 5, -5, 2.5, 3.3, 1e-16, -1e-3, 1234.5, 1e20, -7.77777, NaN, Infinity, 0.000123, 12, 4.999]
  /** Voltajes al azar (algunas redes sin lectura), con todas las redes, con algunas, con desplazos y con los textos de la escena. */
  function comparar(d: Documento, semilla: number): void {
    const con = calcularConexiones(d, lib)
    const azar = azarConSemilla(semilla)
    const redes = new Map<number, number>()
    for (const r of con.redes) if (azar() < 0.85) redes.set(r.id, VOLTAJES[Math.floor(azar() * VOLTAJES.length)])
    const l = lectura([...redes])
    const textos = construirEscena(d, lib, con, PALETA_CLARA).textos
    const base = chipsDeVoltajeReferencia(d, lib, con, l, textos)
    const desplazos = new Map(base.filter((t, i) => t.clave && i % 3 === 0).map((t, i) => [t.clave!, { dx: (i % 7) - 3, dy: i % 2 ? 5 : -1 }]))
    const opciones: OpcionesChips[] = [{ redes: null }, { redes: new Set([...redes.keys()].filter((_, i) => i % 2 === 0)) }, { redes: null, desplazos }]
    for (const o of opciones)
      for (const tx of [[], textos, textos]) expect(chipsDeVoltaje(d, lib, con, l, tx, o), `semilla ${semilla}`).toStrictEqual(chipsDeVoltajeReferencia(d, lib, con, l, tx, o))
    expect(chipsDeVoltaje(d, lib, con, l)).toStrictEqual(chipsDeVoltajeReferencia(d, lib, con, l))
  }

  it('200 circuitos al azar con todas las piezas (semilla fija) y 20 apretados', () => {
    for (let s = 1; s <= 200; s++) comparar(circuitoAlAzar(s, lib), s)
    for (let s = 1; s <= 20; s++) {
      const d = circuitoAlAzar(1000 + s, lib)
      for (const p of Object.values(d.piezas)) {
        p.x = Math.round(p.x / 4)
        p.y = Math.round(p.y / 4)
      }
      comparar(d, 1000 + s)
    }
  })

  it('5,000 resistencias con cables en L (la capa de la prueba de tiempo)', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      d.piezas[`r${i}`] = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: 0, espejo: false, props: {} }
      d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
    }
    comparar(d, 5000)
  })
})

describe('chips de las entradas de una compuerta', () => {
  const or5 = () => {
    const doc = documentoVacio()
    doc.piezas.u = { id: 'u', tipo: 'or-5', ref: 'U1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    const pins = pinesEnMundo(doc.piezas.u, lib.get('or-5')!)
    for (const p of pins.filter((q) => q.id !== 'Y')) doc.cables['c' + p.id] = { id: 'c' + p.id, puntos: [{ x: p.x - 14, y: p.y }, { x: p.x, y: p.y }] }
    const c = calcularConexiones(doc, lib)
    const redes = new Map(c.redes.map((r, i) => [r.id, i + 1] as [number, number]))
    const l: Lectura = { t: 0, ratio: 1, redes, piezas: new Map() }
    return { doc, pins, c, l }
  }

  it('cada chip queda pegado a su entrada (a menos de 2.5 unidades, no a mitad del cable) y en orden, sin encimarse', () => {
    const { doc, pins, c, l } = or5()
    const chips = chipsDeVoltaje(doc, lib, c, l, [], { redes: null })
    expect(chips).toHaveLength(5)
    for (const t of chips) {
      const pin = pins.find((q) => t.clave === `p:u:${q.id}`)!
      expect(t.alinear).toBe('der')
      expect(Math.hypot(t.x - pin.x, t.y - pin.y)).toBeLessThan(2.5)
    }
    const ys = chips.map((t) => t.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
    expect(chips).toEqual(chipsDeVoltajeReferencia(doc, lib, c, l, [], { redes: null }))
  })

  it('se arrastra a lo largo de su cable hasta el otro extremo y no más allá de 8 unidades de la red', () => {
    const { doc, pins, c, l } = or5()
    const a = pins.find((q) => q.id === 'A')!
    const base = chipsDeVoltaje(doc, lib, c, l, [], { redes: null }).find((t) => t.clave === 'p:u:A')!
    const mover = (dx: number, dy: number) => chipsDeVoltaje(doc, lib, c, l, [], { redes: null, desplazos: new Map([['p:u:A', { dx, dy }]]) }).find((t) => t.clave === 'p:u:A')!
    // Hasta el inicio del cable (a 14 unidades del pin), que el límite de antes (8 desde el ancla) no alcanzaba.
    expect(mover(-12, 0).x).toBeCloseTo(base.x - 12, 9)
    // Fuera del alcance de la red, a 8 unidades de su punto más cercano.
    const fuera = mover(0, -40)
    expect(a.y - fuera.y).toBeCloseTo(8, 9)
    expect(fuera.x).toBeCloseTo(base.x, 9)
    expect(mover(-12, 0)).toEqual(chipsDeVoltajeReferencia(doc, lib, c, l, [], { redes: null, desplazos: new Map([['p:u:A', { dx: -12, dy: 0 }]]) }).find((t) => t.clave === 'p:u:A'))
  })
})
