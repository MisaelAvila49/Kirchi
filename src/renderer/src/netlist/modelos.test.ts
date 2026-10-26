// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist, type ElementoMotor } from './netlist'

const lib = libreriaDePrueba().piezas

function compilar(partes: Parte[]) {
  const d = conEtiquetas(lib, partes)
  return compilarNetlist(d, lib, calcularConexiones(d, lib))
}
/** El único elemento de tipo `tipo` del circuito, que debe compilar sin errores. */
const unico = (partes: Parte[], tipo: ElementoMotor['type']) => {
  const r = compilar(partes)
  expect(r.errores).toEqual([])
  const e = r.netlist!.elements.filter((x) => x.type === tipo)
  expect(e).toHaveLength(1)
  return { e: e[0], r }
}
const fuente: Parte = { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, pines: { '+': 'vcc', '-': '0' } }
const carga = (de: string, ref = 'R9'): Parte => ({ tipo: 'resistencia', ref, props: { valor: '1k' }, pines: { '1': de, '2': '0' } })
const modelos = (id: string) => (lib.get(id)!.modelo as { modelos: Record<string, Record<string, number>> }).modelos

describe('modelos de las piezas en la netlist', () => {
  it('un valor fuera de lo que admite el motor se dice con el nombre de la pieza y no deja simular', () => {
    const r = compilar([fuente, { tipo: 'resistencia', ref: 'R7', props: { valor: '1p' }, pines: { '1': 'vcc', '2': '0' } }])
    expect(r.netlist).toBeNull()
    expect(r.errores).toEqual(['R7: su resistencia vale 1 pΩ, fuera de lo que admite la vista previa (de 1 µΩ a 1 TΩ).'])
    const f = compilar([{ tipo: 'fuente-ac', ref: 'V2', props: { amplitud: '5', frecuencia: '10G' }, pines: { '+': 'vcc', '-': '0' } }, carga('vcc')])
    expect(f.errores).toEqual(['V2: su frecuencia vale 10 GHz, fuera de lo que admite la vista previa (de -1 GHz a 1 GHz).'])
  })

  it('el transistor lleva los parámetros del modelo elegido; uno desconocido usa el de omisión', () => {
    const q = (modelo?: string): Parte => ({ tipo: 'npn', ref: 'Q1', props: modelo ? { modelo } : {}, pines: { B: 'b', C: 'vcc', E: '0' } })
    const base = carga('b', 'R1')
    const { e } = unico([fuente, base, q('BC547')], 'Q')
    expect(e).toMatchObject({ type: 'Q', pnp: false, model: modelos('npn').BC547 })
    expect(unico([fuente, base, q('2N9999')], 'Q').e).toMatchObject({ model: modelos('npn')['2N2222'] })
    expect(unico([fuente, base, { ...q(), tipo: 'pnp' }], 'Q').e).toMatchObject({ pnp: true, model: modelos('pnp')['2N2907'] })
  })

  it('Personalizado: los parámetros propios de la pieza van en lugar de los de su lista de modelos', () => {
    const q = (spice?: Record<string, number>): Parte => ({ tipo: 'npn', ref: 'Q1', props: { modelo: 'BC547' }, ...(spice ? { spice } : {}), pines: { B: 'b', C: 'vcc', E: '0' } })
    const base = carga('b', 'R1')
    expect(unico([fuente, base, q({ bf: 50, is: 1e-14 })], 'Q').e).toMatchObject({ type: 'Q', model: { bf: 50, is: 1e-14 } })
    // Sin parámetros propios (o con un juego vacío) la pieza usa su modelo, como siempre.
    expect(unico([fuente, base, q({})], 'Q').e).toMatchObject({ model: modelos('npn').BC547 })
    expect(unico([fuente, base, q()], 'Q').e).toMatchObject({ model: modelos('npn').BC547 })
    const m = unico([fuente, { tipo: 'resistencia', ref: 'R3', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'd' } }, { tipo: 'mosfet-n', ref: 'Q1', props: { modelo: '2N7000' }, spice: { vto: 1.5, kp: 0.5 }, pines: { G: 'vcc', S: '0', D: 'd' } }], 'M')
    expect(m.e).toMatchObject({ model: { vto: 1.5, kp: 0.5 } })
    const oa = compilar([fuente, carga('sal'), carga('ent', 'R2'), { tipo: 'amp-op', ref: 'U1', props: { modelo: 'LM358' }, spice: { gbw: 2e6, sr: 1e6 }, pines: { '+': 'ent', '-': 'sal', OUT: 'sal', 'V+': 'vcc', 'V-': '0' } }])
    expect(oa.errores).toEqual([])
    expect(oa.netlist!.elements.find((e) => e.type === 'OA')).toMatchObject({ model: { gbw: 2e6, sr: 1e6 } })
  })

  it('Personalizado: un nombre que el motor no lee o un valor fuera de rango impide simular y dice la pieza', () => {
    const q = (spice: Record<string, number>): Parte => ({ tipo: 'npn', ref: 'Q7', props: {}, spice, pines: { B: 'b', C: 'vcc', E: '0' } })
    const r = compilar([fuente, carga('b', 'R1'), q({ beta: 100 })])
    expect(r.netlist).toBeNull()
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]).toMatch(/^El modelo propio de Q7 no es válido: «beta», parámetro desconocido/)
    expect(compilar([fuente, carga('b', 'R1'), q({ bf: -1 })]).errores[0]).toMatch(/^El modelo propio de Q7 no es válido: «bf»/)
  })

  it('el MOSFET de canal P y el amplificador con sus pines en orden', () => {
    const m = unico([fuente, carga('d'), { tipo: 'mosfet-p', ref: 'Q1', props: { modelo: 'IRF9540' }, pines: { G: '0', S: 'vcc', D: 'd' } }], 'M')
    expect(m.e).toMatchObject({ type: 'M', pmos: true, model: modelos('mosfet-p').IRF9540 })
    const a = compilar([
      fuente,
      carga('sal'),
      carga('ent', 'R2'),
      { tipo: 'amp-op', ref: 'U1', props: { modelo: 'LM358' }, pines: { '+': 'ent', '-': 'sal', OUT: 'sal', 'V+': 'vcc', 'V-': '0' } }
    ])
    expect(a.errores).toEqual([])
    const oa = a.netlist!.elements.find((x) => x.type === 'OA')!
    expect(oa).toMatchObject({ model: modelos('amp-op').LM358 })
    // Seguidor: la entrada inversora en la salida, la alimentación negativa en tierra.
    if (oa.type === 'OA') {
      expect(oa.n).toBe(oa.out)
      expect(oa.vn).toBe(0)
      expect(new Set([oa.p, oa.out, oa.vp]).size).toBe(3)
    }
  })

  it('el zener sale de la serie 1N47xx: impedancia y corriente de prueba de la hoja de datos', () => {
    const z = (voltaje: string): Parte => ({ tipo: 'zener', ref: 'D1', props: { voltaje }, pines: { A: '0', K: 'k' } })
    const { e } = unico([fuente, { tipo: 'resistencia', ref: 'R1', props: { valor: '470' }, pines: { '1': 'vcc', '2': 'k' } }, z('5.1')], 'D')
    expect(e.type === 'D' && e.rs).toBeCloseTo(6.47214, 4)
    expect(e.type === 'D' && e.bv).toBeCloseTo(4.782865, 5)
    expect(e).toMatchObject({ ibv: 0.049, is: 2.5e-15, n: 1 })
    // Un voltaje fuera de la serie toma la impedancia del más cercano (5.1 V) con su propio voltaje.
    const otro = unico([fuente, { tipo: 'resistencia', ref: 'R1', props: { valor: '470' }, pines: { '1': 'vcc', '2': 'k' } }, z('5')], 'D').e
    expect(otro.type === 'D' && otro.bv).toBeCloseTo(5 - 0.049 * 6.47214, 4)
  })

  it('el foco, el fusible, el motor, el relé, el zumbador y el inductor escalan con sus valores nominales', () => {
    expect(unico([fuente, { tipo: 'foco', ref: 'LP1', props: { voltaje: '12', potencia: '5' }, pines: { '1': 'vcc', '2': '0' } }], 'LAMP').e).toEqual({ type: 'LAMP', a: 1, b: 0, rfrio: 2.88, k: 9, pnom: 5, tau: 0.05 })
    const f = unico([fuente, carga('x'), { tipo: 'fusible', ref: 'F1', props: { corriente: '500m' }, pines: { '1': 'vcc', '2': 'x' } }], 'FUSE').e
    expect(f).toMatchObject({ ohms: 0.2, inom: 0.5, ifusion: 1, tau: 0.125 })
    // El motor de 12 V es el de 6 V con el doble de vueltas: cuatro veces R y L, el doble de ke, la misma mecánica.
    const m = unico([fuente, { tipo: 'motor-dc', ref: 'M1', props: { voltaje: '12' }, pines: { '+': 'vcc', '-': '0' } }], 'MOTOR').e
    expect(m.type === 'MOTOR' && m.r).toBeCloseTo(12, 9)
    expect(m.type === 'MOTOR' && m.l).toBeCloseTo(6e-3, 12)
    expect(m.type === 'MOTOR' && m.ke).toBeCloseTo(0.0121, 12)
    expect(m).toMatchObject({ j: 2.4e-7, bm: 6.4e-7 })
    const k = unico([fuente, carga('na'), carga('nc', 'R8'), { tipo: 'rele', ref: 'K1', props: { voltaje: '5' }, pines: { A1: 'vcc', A2: '0', COM: 'vcc', NA: 'na', NC: 'nc' } }], 'RELAY').e
    expect(k.type === 'RELAY' && k.r).toBeCloseTo(69.444, 3)
    expect(k.type === 'RELAY' && k.l).toBeCloseTo(0.20833, 5)
    expect(k.type === 'RELAY' && k.ion).toBeCloseTo(0.054, 6)
    expect(k.type === 'RELAY' && k.ioff).toBeCloseTo(0.0072, 6)
    const z = compilar([fuente, { tipo: 'zumbador', ref: 'BZ1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }])
    expect(z.netlist!.elements.find((e) => e.type === 'BUZZER')).toMatchObject({ ohms: expect.closeTo(25 / 0.15, 9), umbral: expect.closeTo(3, 9) })
    expect(z.umbrales.get('p_1')).toBeCloseTo(3, 9)
    expect(z.tipoDeElemento).toEqual(['V', 'zumbador'])
    expect(unico([fuente, carga('l'), { tipo: 'inductor', ref: 'L1', props: { valor: '10m' }, pines: { '1': 'vcc', '2': 'l' } }], 'L').e).toMatchObject({ henries: 0.01 })
  })

  it('un amplificador con las entradas al aire no tiene camino a tierra aunque su salida sí', () => {
    const r = compilar([fuente, carga('sal'), { tipo: 'amp-op', ref: 'U1', pines: { '+': 'a', '-': 'a', OUT: 'sal', 'V+': 'vcc', 'V-': '0' } }])
    expect(r.errores).toEqual(['U1 no tiene camino a tierra.'])
  })

  it('un transistor con base y colector unidos (como diodo) compila', () => {
    const r = compilar([fuente, { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'bc' } }, { tipo: 'npn', ref: 'Q1', pines: { B: 'bc', C: 'bc', E: '0' } }])
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.find((e) => e.type === 'Q')).toMatchObject({ c: 2, b: 2, e: 0 })
  })
})
