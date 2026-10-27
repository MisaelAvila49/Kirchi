// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { sinInstrumentos } from '../netlist/instrumentos'
import { compilarNetlist, type ElementoMotor, type NetlistMotor } from '../netlist/netlist'
import { BRILLO_MINIMO, brilloDeLed, CORRIENTE_BRILLO_PLENO } from '../lienzo/capaSim'
import { conEtiquetas, divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { CORRIENTE_SEGMENTO_ENCENDIDO, escalaDeVoltaje, extraDeElemento, leerResultados, medicionDeElemento, PASO_MAX, PASO_MIN, pasoDeSimulacion, textoDelDisplay } from './lectura'
import type { SimReading } from './protocol'

const lib = libreriaDePrueba().piezas

/** Lectura del motor para el divisor resuelto: nodos 0, V1+ (5 V) y el punto medio (2.5 V). */
function divisorResuelto() {
  const d = divisor()
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  const n = r.netlist!
  const v = new Float64Array(n.nodes)
  const medio = r.nodoDeRed.get(con.redDePin.get(clavePin('p_r1', '2'))!)!
  const alto = r.nodoDeRed.get(con.redDePin.get(clavePin('p_v1', '+'))!)!
  v[medio] = 2.5
  v[alto] = 5
  const currents = new Float64Array(n.elements.map((e) => (e.type === 'V' ? -2.5e-3 : 2.5e-3)))
  const s: SimReading = { time: 0.25, ratio: 0.98, capacity: 12, seq: 7, consistente: true, voltages: v, currents, aux: new Float64Array(currents.length), estado: new Float64Array(currents.length), niveles: new Float64Array(0), medidas: new Float64Array(0) }
  return { d, con, r, s }
}

describe('leerResultados con lecturas propias de cada modelo', () => {
  /** Netlist de un elemento con sus nodos 1, 2 y 3 a 5, 0.7 y 0 V. */
  function uno(elemento: NetlistMotor['elements'][number], tipo: string, i: number, aux: number, estado: number, umbral?: number) {
    const r = {
      netlist: { nodes: 4, elements: [elemento] },
      nodoDeRed: new Map(),
      piezaDeElemento: ['p'],
      potenciometros: new Map(),
      tipoDeElemento: [tipo],
      umbrales: new Map(umbral === undefined ? [] : [['p', umbral]]),
      sinModelo: [],
      errores: [],
      avisos: []
    } as unknown as Parameters<typeof leerResultados>[0]
    const s: SimReading = { time: 0, ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: new Float64Array([0, 5, 0.7, 0]), currents: new Float64Array([i]), aux: new Float64Array([aux]), estado: new Float64Array([estado]), niveles: new Float64Array(0), medidas: new Float64Array(0) }
    return leerResultados(r, s).piezas.get('p')!
  }

  it('un transistor da Vce e Ic, y aparte su región, Vbe e Ib; la potencia suma la de la base', () => {
    const m = uno({ type: 'Q', c: 1, b: 2, e: 3, pnp: false, model: {} }, 'bjt', 2e-3, 1e-5, 1)
    expect(m).toEqual({ v: 5, i: 2e-3, p: 5 * 2e-3 + 0.7 * 1e-5, extra: { tipo: 'bjt', region: 'activa', vbe: 0.7, ib: 1e-5 } })
    expect(uno({ type: 'Q', c: 1, b: 2, e: 3, pnp: false, model: {} }, 'bjt', 0, 0, 2).extra).toMatchObject({ region: 'saturación' })
  })

  it('un MOSFET, un amplificador, un motor, un fusible, un relé, un zener y un zumbador', () => {
    expect(uno({ type: 'M', d: 1, g: 2, s: 3, pmos: false, model: {} }, 'mosfet', 0.05, 0, 1).extra).toEqual({ tipo: 'mosfet', region: 'saturación', vgs: 0.7 })
    const oa = uno({ type: 'OA', p: 2, n: 3, out: 1, vp: 1, vn: 3, model: { rq: 1e4 } }, 'ampop', 0, 0, -1)
    expect(oa.extra).toEqual({ tipo: 'ampop', saturado: -1 })
    expect(oa.v).toBe(5)
    // 942.5 rad/s son 9,000 rpm.
    expect(uno({ type: 'MOTOR', a: 1, b: 3, r: 3, l: 1e-3, ke: 6e-3, j: 1e-7, bm: 1e-7 }, 'motor', 0.1, 942.48, 0).extra!).toMatchObject({ tipo: 'motor', rpm: expect.closeTo(9000, 0) })
    expect(uno({ type: 'FUSE', a: 1, b: 3, ohms: 0.1, inom: 1, ifusion: 2, tau: 0.1 }, 'fusible', 0, 1.2, 1).extra).toEqual({ tipo: 'fusible', fundido: true, calentamiento: 1.2 })
    expect(uno({ type: 'LAMP', a: 1, b: 3, rfrio: 2.88, k: 9, pnom: 5, tau: 0.05 }, 'foco', 0, 2.1, 1).extra).toEqual({ tipo: 'foco', fundido: true, calentamiento: 2.1 })
    expect(uno({ type: 'LAMP', a: 1, b: 3, rfrio: 2.88, k: 9, pnom: 5, tau: 0.05 }, 'foco', 0.4, 1, 0).extra).toEqual({ tipo: 'foco', fundido: false, calentamiento: 1 })
    expect(uno({ type: 'RELAY', a1: 1, a2: 3, com: 1, na: 2, nc: 3, r: 70, l: 0.2, ion: 0.05, ioff: 0.007 }, 'rele', 0.07, 0, 1).extra).toEqual({ tipo: 'rele', operado: true })
    expect(uno({ type: 'D', a: 3, b: 1, is: 1e-15, n: 1 }, 'zener', -0.01, 0, 0).extra).toEqual({ tipo: 'zener', estado: 'ruptura' })
    expect(uno({ type: 'R', a: 1, b: 3, ohms: 166 }, 'zumbador', 0.03, 0, 0, 3).extra).toEqual({ tipo: 'zumbador', suena: true })
    expect(uno({ type: 'R', a: 1, b: 3, ohms: 166 }, 'zumbador', 0.03, 0, 0, 6).extra).toEqual({ tipo: 'zumbador', suena: false })
    // Una resistencia no tiene nada aparte.
    expect(uno({ type: 'R', a: 1, b: 3, ohms: 1000 }, 'R', 5e-3, 0, 0).extra).toBeUndefined()
  })
})

describe('leerResultados', () => {
  it('da el voltaje de cada red, con la tierra en 0 V', () => {
    const { con, r, s } = divisorResuelto()
    const l = leerResultados(r, s)
    expect(l.t).toBe(0.25)
    expect(l.ratio).toBe(0.98)
    expect(l.redes.get(con.redDePin.get(clavePin('p_r1', '2'))!)).toBe(2.5)
    expect(l.redes.get(con.redDePin.get(clavePin('p_v1', '+'))!)).toBe(5)
    expect(l.redes.get(con.redDePin.get(clavePin('p_v1', '-'))!)).toBe(0)
  })

  it('da voltaje, corriente y potencia de cada pieza; la fuente que entrega da potencia negativa', () => {
    const { r, s } = divisorResuelto()
    const l = leerResultados(r, s)
    expect(l.piezas.get('p_r1')).toEqual({ v: 2.5, i: 2.5e-3, p: 2.5 * 2.5e-3 })
    expect(l.piezas.get('p_r2')!.p).toBeCloseTo(6.25e-3, 12)
    expect(l.piezas.get('p_v1')).toEqual({ v: 5, i: -2.5e-3, p: -12.5e-3 })
    expect(l.piezas.has('p_g')).toBe(false)
  })

  it('las redes digitales dan su nivel, su voltaje nominal y si conmutan; las piezas digitales, el nivel de cada pin', () => {
    const d = conEtiquetas(lib, [
      { tipo: 'estado-logico', ref: 'E1', props: { estado: '1' }, pines: { S: 'a' } },
      { tipo: 'estado-logico', ref: 'E2', props: { estado: '1' }, pines: { S: 'b' } },
      { tipo: 'nand', ref: 'U1', pines: { A: 'a', B: 'b', Y: 'y' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '330' }, pines: { '1': 'y', '2': 'led' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'led', K: '0' } }
    ])
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const n = r.netlist!
    const red = (nombre: string) => con.redes.find((x) => x.nombre === nombre)!.id
    const [da, db, dy] = [r.redDigital.get(red('a'))!, r.redDigital.get(red('b'))!, r.manejoDeRed.get(red('y'))!]
    const niveles = new Float64Array(n.digital_nets!)
    const medidas = new Float64Array(3 * n.digital_nets!)
    niveles[da] = 1
    niveles[db] = 1
    niveles[dy] = 0
    medidas.set([1000, 0.5, 40], 3 * da)
    const v = new Float64Array(n.nodes)
    v[r.nodoDeRed.get(red('y'))!] = 0.02
    const ceros = new Float64Array(n.elements.length)
    const s: SimReading = { time: 0.01, ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: v, currents: ceros, aux: ceros, estado: ceros, niveles, medidas }
    const primera = leerResultados(r, s)
    // 1 kHz al ritmo del reloj: más rápido de lo que la pantalla (10 lecturas por segundo) alcanza a mostrar.
    expect(primera.digitales!.get(red('a'))).toEqual({ nivel: '1', nominal: 5, f: 1000, ciclo: 0.5, vcc: 5, cambios: 40, conmuta: true })
    expect(primera.digitales!.get(red('y'))).toMatchObject({ nivel: '0', nominal: null, vcc: 5 })
    // Una red digital pura no tiene voltaje: solo nivel.
    expect(primera.redes.has(red('a'))).toBe(false)
    // No depende de cuántas veces se lea: leída enseguida después de otra lectura dice lo mismo.
    const despues = medidas.slice()
    despues[3 * da + 2] = 41
    expect(leerResultados(r, { ...s, medidas: despues }).digitales!.get(red('a'))!.conmuta).toBe(true)
    // Lo que cuenta es la frecuencia que se ve en pantalla: a 2 Hz cada nivel dura 250 ms y se ve; 1 kHz al 0.1 % del
    // tiempo real se ve a 1 Hz.
    const lenta = medidas.slice()
    lenta.set([2, 0.5, 40], 3 * da)
    expect(leerResultados(r, { ...s, medidas: lenta }).digitales!.get(red('a'))!.conmuta).toBe(false)
    expect(leerResultados(r, { ...s, ratio: 0.001 }).digitales!.get(red('a'))!.conmuta).toBe(false)
    expect(primera.piezas.get('p_2')!.extra).toEqual({
      tipo: 'digital',
      modelo: 'compuerta',
      pines: [
        { id: 'A', nombre: 'A', nivel: '1', salida: false },
        { id: 'B', nombre: 'B', nivel: '1', salida: false },
        { id: 'Y', nombre: 'Y', nivel: '0', salida: true, v: 0.02 }
      ]
    })
    expect(primera.piezas.get('p_0')!.extra).toMatchObject({ tipo: 'digital', modelo: 'estado-logico', pines: [{ id: 'S', nivel: '1' }] })
  })

  it('lo que muestra un display: el dígito, apagado o los segmentos encendidos', () => {
    const on = 5e-3
    const de = (seg: string, punto = false) => [...'abcdefg'].map((x) => (seg.includes(x) ? on : 0)).concat(punto ? [on] : [0])
    expect(textoDelDisplay(de('abc'))).toBe('muestra 7')
    expect(textoDelDisplay(de('abcdefg', true))).toBe('muestra 8 con punto')
    expect(textoDelDisplay(de('cdefg'))).toBe('muestra 6')
    expect(textoDelDisplay(de(''))).toBe('apagado')
    expect(textoDelDisplay(de('ag'))).toBe('a y g encendidos')
    expect(textoDelDisplay([on, null, null, null, null, null, null, null])).toBe('a encendido')
    // Por debajo de lo que el lienzo ya dibuja encendido, apagado.
    expect(textoDelDisplay(de('bc').map((i) => i / 20))).toBe('apagado')
    // El brillo es la raíz de la corriente entre la nominal; el umbral sigue en el 2 % de la corriente.
    expect(brilloDeLed(CORRIENTE_SEGMENTO_ENCENDIDO, CORRIENTE_BRILLO_PLENO)).toBeCloseTo(BRILLO_MINIMO, 12)
  })

  it('la escala de los cables llega a la mayor alimentación de las piezas digitales', () => {
    expect(escalaDeVoltaje({ nodes: 1, elements: [] }, [5, 12])).toBe(12)
    expect(escalaDeVoltaje({ nodes: 2, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 9 } }] }, [5])).toBe(9)
    expect(escalaDeVoltaje({ nodes: 1, elements: [] })).toBe(1)
  })

  it('sin netlist no hay piezas ni redes', () => {
    const { s } = divisorResuelto()
    const l = leerResultados({ netlist: null, nodoDeRed: new Map(), piezaDeElemento: [], potenciometros: new Map(), canalDe: new Map(), relojesAdc: new Map(), convertidores: new Map(), tipoDeElemento: [], umbrales: new Map(), redDigital: new Map(), digitales: new Map(), temporizadores: new Map(), displays: new Map(), manejoDeRed: new Map(), instrumentos: sinInstrumentos(), puertos: [], potencias: [], compuestos: new Map(), sinModelo: ['X1'], errores: [], avisos: [] }, s)
    expect(l.redes.size).toBe(0)
    expect(l.piezas.size).toBe(0)
  })
})

describe('leerResultados con potenciómetro', () => {
  /** Divisor con RV1 de 10 kΩ al 25 %: pin 1 a V1+ (5 V), pin 2 a tierra, cursor a R9 de 1 GΩ a tierra. */
  function conPot() {
    const d = divisor()
    delete d.piezas.p_r1
    delete d.piezas.p_r2
    d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: -8, rot: 0, espejo: false, props: { valor: '10k', posicion: '25 %' } }
    d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    d.cables.c_c = { id: 'c_c', puntos: [{ x: 10, y: -12 }, { x: 10, y: -16 }, { x: 30, y: -16 }] }
    d.piezas.p_rc = { id: 'p_rc', tipo: 'resistencia', ref: 'R9', x: 34, y: -16, rot: 0, espejo: false, props: { valor: '1G' } }
    d.cables.c_d = { id: 'c_d', puntos: [{ x: 38, y: -16 }, { x: 40, y: -16 }, { x: 40, y: 8 }, { x: 18, y: 8 }] }
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const n = r.netlist!
    const v = new Float64Array(n.nodes)
    v[r.nodoDeRed.get(con.redDePin.get(clavePin('p_rv', '1'))!)!] = 5
    v[r.nodoDeRed.get(con.redDePin.get(clavePin('p_rv', '3'))!)!] = 3.75
    const currents = new Float64Array(n.elements.length)
    r.piezaDeElemento.forEach((id, k) => (currents[k] = id === 'p_rv' ? 0.5e-3 : 0))
    const s: SimReading = { time: 0.1, ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: v, currents, aux: new Float64Array(currents.length), estado: new Float64Array(currents.length), niveles: new Float64Array(0), medidas: new Float64Array(0) }
    return { r, s }
  }

  it('los dos tramos son del potenciómetro', () => {
    const { r } = conPot()
    expect(r.piezaDeElemento.filter((id) => id === 'p_rv')).toHaveLength(2)
  })

  it('da el voltaje entre extremos, el del cursor, la corriente del tramo y la potencia de la pieza entera', () => {
    const { r, s } = conPot()
    const m = leerResultados(r, s).piezas.get('p_rv')!
    expect(m.v).toBeCloseTo(5, 12)
    expect(m.cursor).toBeCloseTo(3.75, 12)
    expect(m.i).toBeCloseTo(0.5e-3, 12)
    // Tramo 1: 1.25 V × 0.5 mA. Tramo 2: 3.75 V × 0.5 mA. Suman 5 V × 0.5 mA.
    expect(m.p).toBeCloseTo(2.5e-3, 12)
  })

  it('una pieza que no es potenciómetro no lleva cursor', () => {
    const { r, s } = divisorResuelto()
    expect(leerResultados(r, s).piezas.get('p_r1')!.cursor).toBeUndefined()
  })
})

describe('leerResultados con JFET, fuentes controladas y elementos del puente de valores', () => {
  /** Un elemento solo con sus nodos 1, 2 y 3 a 5, 0.7 y 0 V. */
  function uno(elemento: NetlistMotor['elements'][number], i: number, estado = 0, aux = 0) {
    const r = { netlist: { nodes: 4, elements: [elemento] }, nodoDeRed: new Map(), piezaDeElemento: ['p'], potenciometros: new Map(), tipoDeElemento: ['x'], umbrales: new Map(), sinModelo: [], errores: [], avisos: [] } as unknown as Parameters<typeof leerResultados>[0]
    const s: SimReading = { time: 0, ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: new Float64Array([0, 5, 0.7, 0]), currents: new Float64Array([i]), aux: new Float64Array([aux]), estado: new Float64Array([estado]), niveles: new Float64Array(0), medidas: new Float64Array(0) }
    return leerResultados(r, s).piezas.get('p')!
  }

  it('un JFET da Vds, Id y potencia, y aparte su región y Vgs con la misma tabla que el MOSFET', () => {
    const j = (estado: number) => uno({ type: 'J', d: 1, g: 2, s: 3, pjf: false, model: {} }, 4e-3, estado)
    expect(j(1)).toEqual({ v: 5, i: 4e-3, p: 5 * 4e-3, extra: { tipo: 'jfet', region: 'saturación', vgs: 0.7 } })
    expect(j(0).extra).toMatchObject({ region: 'corte' })
    expect(j(2).extra).toMatchObject({ region: 'lineal' })
  })

  it('las fuentes controladas dan el voltaje y la corriente de su salida, y absorben menos si entregan', () => {
    expect(uno({ type: 'E', p: 1, n: 3, cp: 2, cn: 3, ganancia: 2 }, -1e-3)).toEqual({ v: 5, i: -1e-3, p: -5e-3 })
    expect(uno({ type: 'G', p: 1, n: 3, cp: 2, cn: 3, gm: 1e-3 }, 2e-3)).toEqual({ v: 5, i: 2e-3, p: 10e-3 })
    expect(uno({ type: 'H', p: 1, n: 2, cp: 3, cn: 3, r: 100 }, 1e-3).v).toBeCloseTo(4.3, 12)
    expect(uno({ type: 'F', p: 1, n: 3, cp: 2, cn: 3, ganancia: 10 }, 3e-3)).toEqual({ v: 5, i: 3e-3, p: 15e-3 })
  })

  it('el termistor, la fotorresistencia, la fuente externa y la PWL dan voltaje, corriente y potencia entre sus extremos', () => {
    const lectura = { v: 5, i: 1e-3, p: 5e-3 }
    expect(uno({ type: 'TERM', a: 1, b: 3, tipo: 'ntc', r25: 1e4, beta: 3950, delta: 1, tau: 10, canal: 0, tmax: 150 }, 1e-3)).toEqual({ ...lectura, extra: { tipo: 'termistor', temperatura: 0 } })
    expect(uno({ type: 'LDR', a: 1, b: 3, r10: 1e4, gamma: 0.6, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.05, canal: 0 }, 1e-3)).toEqual({ ...lectura, extra: { tipo: 'ldr', r: 0 } })
    expect(uno({ type: 'EXT', a: 1, b: 3, modo: 'v', canal: 0, k: 1, c: 0 }, 1e-3)).toEqual(lectura)
    expect(uno({ type: 'V', a: 1, b: 3, wave: { kind: 'pwl', puntos: [[0, 0], [1, 5]] } }, 1e-3)).toEqual(lectura)
  })

  it('el motor a pasos da el voltaje y la corriente de su primer devanado', () => {
    const m = uno({ type: 'PASOS', nodos: [1, 3, 2, 3], r: 10, l: 0.01, km: 0.1, dientes: 50, td: 1e-3, j: 1e-5, bm: 1e-4 }, 0.2)
    expect(m.v).toBe(5)
    expect(m.i).toBe(0.2)
    expect(m.p).toBeCloseTo(1, 12)
  })

  it('el motor a pasos da su velocidad, el ángulo del eje de salida y los pasos completos del rotor', () => {
    const e: ElementoMotor = { type: 'PASOS', nodos: [1, 3, 2, 3, 3, 3], unipolar: true, r: 50, l: 0.03, km: 0.005, dientes: 8, td: 0, j: 2e-7, bm: 3e-5, reduccion: 64 }
    // Un paso completo del rotor son π / 16 rad; el eje de salida recorre eso entre 64.
    const x = extraDeElemento(e, undefined, { v: 0, i: 0 }, () => 0, 2 * Math.PI / 64, (Math.PI / 16) * 3 / 64)
    expect(x).toMatchObject({ tipo: 'motor', angulo: (Math.PI / 16) * 3 / 64 })
    expect(x).toMatchObject({ rpm: expect.closeTo(60 / 64, 9), pasos: expect.closeTo(3, 9) })
  })
})

describe('medicionDeElemento', () => {
  it('un amplificador cuya pieza no trae «rq» usa el consumo en reposo de omisión del motor y no da NaN', () => {
    const oa: ElementoMotor = { type: 'OA', p: 1, n: 2, out: 3, vp: 4, vn: 5, model: {} }
    const m = medicionDeElemento(oa, (n) => [0, 1, 1, 2, 15, -15][n], 1e-3, 0)
    expect(Number.isFinite(m.p)).toBe(true)
    expect(m.p).toBeCloseTo(30 ** 2 / 17.6e3 + (15 - 2) * 1e-3, 6)
  })
})

describe('pasoDeSimulacion', () => {
  const con = (...waves: NetlistMotor['elements']) => ({ nodes: 2, elements: waves })
  it('sin fuentes que cambien usa el paso más largo', () => {
    expect(pasoDeSimulacion(con({ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 0, ohms: 1 }))).toBe(PASO_MAX)
  })

  it('da 50 pasos por periodo de la fuente más rápida, sin pasar de los límites', () => {
    const sine = (freq: number) => ({ type: 'V' as const, a: 1, b: 0, wave: { kind: 'sine' as const, offset: 0, amp: 1, freq } })
    const square = (freq: number) => ({ type: 'V' as const, a: 1, b: 0, wave: { kind: 'square' as const, low: 0, high: 5, freq, duty: 0.5 } })
    // El paso más largo es el de 50 por periodo de 1 kHz: una señal de 1 kHz ya no queda acotada por él.
    expect(PASO_MAX).toBe(2e-5)
    expect(pasoDeSimulacion(con(sine(1000)))).toBe(PASO_MAX)
    expect(pasoDeSimulacion(con(sine(60)))).toBe(PASO_MAX)
    expect(pasoDeSimulacion(con(sine(60), square(2000)))).toBeCloseTo(1e-5, 15)
    expect(pasoDeSimulacion(con(sine(60), square(10000)))).toBeCloseTo(2e-6, 15)
    expect(pasoDeSimulacion(con(sine(1e9)))).toBe(PASO_MIN)
  })
})

describe('escalaDeVoltaje', () => {
  const v = (wave: Extract<NetlistMotor['elements'][number], { type: 'V' }>['wave']) => ({ type: 'V' as const, a: 1, b: 0, wave })
  it('es la magnitud de la fuente más grande, sin importar su signo ni su forma', () => {
    expect(escalaDeVoltaje({ nodes: 3, elements: [v({ kind: 'dc', v: 5 }), v({ kind: 'dc', v: -9 })] })).toBe(9)
    expect(escalaDeVoltaje({ nodes: 2, elements: [v({ kind: 'sine', offset: 0, amp: 12, freq: 60 })] })).toBe(12)
    expect(escalaDeVoltaje({ nodes: 2, elements: [v({ kind: 'square', low: 0, high: 3.3, freq: 1e3, duty: 0.5 })] })).toBe(3.3)
  })

  it('sin fuentes con voltaje, 1 V', () => {
    expect(escalaDeVoltaje({ nodes: 2, elements: [{ type: 'R', a: 1, b: 0, ohms: 1 }] })).toBe(1)
    expect(escalaDeVoltaje({ nodes: 2, elements: [v({ kind: 'dc', v: 0 })] })).toBe(1)
  })
})
