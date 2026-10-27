// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import { frecuenciaDelReloj } from './convertidores'
import { compilarNetlist, type ElementoMotor } from './netlist'

const DB = Array.from({ length: 8 }, (_, k) => `DB${k}`)
const PINES_ADC = ['CS', 'RD', 'WR', 'CLKIN', 'INTR', 'VINP', 'VINN', 'AGND', 'VREF2', 'DGND', 'VCC', 'CLKR', ...DB]
const adc = piezaDePrueba('adc-t', PINES_ADC, [], {
  tipo: 'convertidor-ad', cs: 'CS', rd: 'RD', wr: 'WR', clkin: 'CLKIN', clkr: 'CLKR', intr: 'INTR', vinp: 'VINP', vinn: 'VINN', agnd: 'AGND', vref2: 'VREF2', dgnd: 'DGND', vcc: 'VCC', db: DB,
  vil: 0.8, vih: 2, vtp: 3.1, vtn: 1.8, voh: 4.5, vol: 0.4, rref: 2200, r_lo: 250, r_hi: 500, ciclos_inicio: 4, ciclos_bit: 8, t_acceso: 135e-9, t_intr: 300e-9
})
const A = Array.from({ length: 8 }, (_, k) => `A${k + 1}`)
const dac = piezaDePrueba('dac-t', [...A, 'IO', 'GND', 'VEE', 'VCC', 'VREFP', 'VREFN', 'COMP'], [], {
  tipo: 'convertidor-da', a: A, io: 'IO', gnd: 'GND', vee: 'VEE', vcc: 'VCC', vrefp: 'VREFP', vrefn: 'VREFN', comp: 'COMP', vil: 0.8, vih: 2, t_asentamiento: 150e-9
})
const lib = conPiezas(adc, dac)

const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const compilar = (partes: Parte[]) => {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  return { r: compilarNetlist(d, lib, con), nodo: (nombre: string) => con.redes.find((x) => x.nombre === nombre)!.id }
}
const de = <T extends ElementoMotor['type']>(els: ElementoMotor[], tipo: T) => els.filter((e) => e.type === tipo) as Extract<ElementoMotor, { type: T }>[]

/** Un ADC con CS a tierra, WR por una fuente, VIN+ de 2.5 V y, aparte, el reloj que dé `reloj`. */
function circuitoAdc(reloj: Parte[]): Parte[] {
  const pines = { CS: '0', RD: '0', WR: 'wr', CLKIN: 'clkin', INTR: 'intr', VINP: 'vin', VINN: '0', AGND: '0', VREF2: 'vref2', DGND: '0', VCC: 'vcc', CLKR: 'clkr', ...Object.fromEntries(DB.map((p) => [p, p.toLowerCase()])) }
  return [V('V1', '5', 'vcc'), V('V2', '2.5', 'vin'), V('V3', '5', 'wr'), { tipo: 'adc-t', ref: 'U1', props: {}, pines }, ...reloj]
}
const RC = (r = '10k', c = '150p') => [R('R1', r, 'clkr', 'clkin'), C('C1', c, 'clkin', '0')]

describe('el ADC0804', () => {
  it('con R de 10 kΩ y C de 150 pF el reloj sale de la fórmula de la hoja', () => {
    const { r } = compilar(circuitoAdc(RC()))
    expect(r.errores).toEqual([])
    const esperado = 1 / (10e3 * 150e-12 * Math.log(((5 - 1.8) / (5 - 3.1)) * (3.1 / 1.8)))
    expect(esperado).toBeGreaterThan(620e3)
    expect(esperado).toBeLessThan(632e3)
    const reloj = [...r.relojesAdc.values()][0]
    expect(reloj).toMatchObject({ tipo: 'rc', r: 10e3, c: 150e-12 })
    expect((reloj as { hz: number }).hz).toBeCloseTo(esperado, 6)
    expect(frecuenciaDelReloj(10e3, 150e-12, 3.1, 1.8)).toBeCloseTo(esperado, 6)
    const msi = de(r.netlist!.elements, 'MSI')[0]
    expect(msi.nucleo).toMatchObject({ tipo: 'aproximaciones', bits: 8, comparador: 3, ciclos_inicio: 4, ciclos_bit: 8, reloj: { tipo: 'interno' } })
    expect((msi.nucleo as { reloj: { periodo: number } }).reloj.periodo).toBeCloseTo(1 / esperado, 12)
  })

  it('dos capacitores en paralelo suman y dos resistencias en paralelo se combinan', () => {
    const { r } = compilar(circuitoAdc([R('R1', '20k', 'clkr', 'clkin'), R('R2', '20k', 'clkr', 'clkin'), C('C1', '100p', 'clkin', '0'), C('C2', '50p', 'clkin', '0')]))
    expect(r.errores).toEqual([])
    const reloj = [...r.relojesAdc.values()][0]
    expect(reloj).toMatchObject({ tipo: 'rc' })
    expect((reloj as { r: number }).r).toBeCloseTo(10e3, 6)
    expect((reloj as { c: number }).c).toBeCloseTo(150e-12, 18)
  })

  it('arma las entradas, la referencia, el convertidor interno, el comparador y las salidas con z', () => {
    const { r, nodo } = compilar(circuitoAdc(RC()))
    const els = r.netlist!.elements
    // CS y RD a tierra leen 0 sin puente; WR lleva uno.
    expect(de(els, 'LOGIC')).toHaveLength(2)
    const entradas = de(els, 'ADC')
    expect(entradas).toHaveLength(2)
    expect(entradas[0]).toMatchObject({ in_low: 0.8, in_high: 2, n: 0 })
    expect(entradas[0].histeresis).toBeUndefined()
    // Comparador entre VIN+ y la salida del DACM, con histéresis.
    const comparador = entradas[1]
    const dacm = de(els, 'DACM')[0]
    expect(comparador).toMatchObject({ p: r.nodoDeRed.get(nodo('vin')), n: dacm.out, histeresis: true })
    expect(dacm).toMatchObject({ modo: 'voltaje', ret: 0 })
    expect(dacm.bits).toHaveLength(8)
    // La referencia es 2 · V(VREF/2) y VREF/2 sale de dos resistencias iguales de VCC a tierra.
    const e = de(els, 'E')[0]
    expect(e).toMatchObject({ ganancia: 2, cp: r.nodoDeRed.get(nodo('vref2')) })
    expect(dacm.ref_p).toBe(e.p)
    const rref = de(els, 'R').filter((x) => x.ohms === 2200)
    expect(rref).toHaveLength(2)
    // Núcleo: los bits de prueba van al DACM, luego DB0 a DB7 e INTR con puente.
    const msi = de(els, 'MSI')[0]
    expect(msi.salidas.slice(0, 8)).toEqual(dacm.bits)
    expect(msi.salidas).toHaveLength(17)
    expect(msi.entradas).toHaveLength(4)
    expect(msi.de.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, k) => ({ tipo: 'directa', fuente: { aux: 7 - k } })))
    expect(msi.de.slice(8)).toEqual(Array.from({ length: 9 }, (_, k) => ({ tipo: 'tabla', columna: k })))
    expect(msi.fuentes).toEqual([{ entrada: 0 }, { entrada: 2 }, { bandera: 0 }, ...Array.from({ length: 8 }, (_, k) => ({ bit: k }))])
    expect(r.netlist!.tablas![msi.tabla!]).toHaveLength(2048)
    const salidas = de(els, 'DAC')
    expect(salidas).toHaveLength(9)
    expect(salidas.filter((s) => s.z).length).toBe(8)
    expect(salidas[0]).toMatchObject({ v_lo: 0.4, v_hi: 4.5, r_lo: 250, r_hi: 500, lo: 0 })
    expect(msi.retardos[8]).toEqual([135e-9, 135e-9])
    expect(msi.retardos[16]).toEqual([300e-9, 300e-9])
    expect(r.manejoDeRed.get(nodo('intr'))).toBe(msi.salidas[16])
  })

  it('la tabla de salida abre los datos solo con CS y RD en bajo y sube INTR al leer', () => {
    const { r } = compilar(circuitoAdc(RC()))
    const msi = de(r.netlist!.elements, 'MSI')[0]
    const t = r.netlist!.tablas![msi.tabla!]
    const salida = (j: number, fila: number | string) => Number((BigInt(fila) >> BigInt(2 * j)) & 3n)
    // Índice: cs, rd, bandera y q0 a q7, el primero en el bit más significativo.
    const indice = (cs: number, rd: number, bandera: number, q: number) => (cs << 10) | (rd << 9) | (bandera << 8) | q
    // CS y RD en bajo con el resultado 0xA5: DB0 a DB7 siguen al registro e INTR queda en 1.
    for (let k = 0; k < 8; k++) expect(salida(k, t[indice(0, 0, 1, 0xa5)])).toBe((0xa5 >> k) & 1)
    expect(salida(8, t[indice(0, 0, 1, 0xa5)])).toBe(1)
    // Sin lectura los datos quedan en Z e INTR sigue a la bandera (0 con un dato sin leer).
    for (let k = 0; k < 8; k++) expect(salida(k, t[indice(1, 0, 1, 0xa5)])).toBe(2)
    expect(salida(8, t[indice(1, 0, 1, 0)])).toBe(0)
    expect(salida(8, t[indice(0, 1, 0, 0)])).toBe(1)
  })

  it('un reloj externo en CLK IN usa un puente con los umbrales de la hoja y el núcleo cuenta sus flancos', () => {
    const { r } = compilar(circuitoAdc([{ tipo: 'fuente-pulso', ref: 'V4', props: {}, pines: { '+': 'clkin', '-': '0' } }]))
    expect(r.errores).toEqual([])
    expect([...r.relojesAdc.values()]).toEqual([{ tipo: 'externo' }])
    const puente = de(r.netlist!.elements, 'ADC').find((x) => x.histeresis && x.in_high === 3.1)!
    expect(puente).toMatchObject({ in_low: 1.8, in_high: 3.1, n: 0 })
    const msi = de(r.netlist!.elements, 'MSI')[0]
    expect(msi.entradas).toHaveLength(5)
    expect(msi.nucleo).toMatchObject({ reloj: { tipo: 'externo', senales: [{ entrada: 4 }], flanco: 'subida' } })
    expect(msi.entradas[4]).toBe(puente.out)
  })

  it('sin reloj no se simula y el aviso dice qué conectar', () => {
    const { r } = compilar(circuitoAdc([]))
    expect(r.errores).toContain('U1 no tiene reloj: une una resistencia entre CLK R y CLK IN y un capacitor de CLK IN a tierra, o lleva un reloj a CLK IN.')
    expect(compilar(circuitoAdc([R('R1', '10k', 'clkr', 'clkin')])).r.errores).toHaveLength(1)
  })

  it('un pin de control sin conectar se dice con su nombre', () => {
    const partes = circuitoAdc(RC())
    partes[3] = { ...partes[3], pines: { ...partes[3].pines, WR: 'suelto' } }
    expect(compilar(partes).r.errores).toContain('El pin WR de U1 no está conectado a nada.')
  })
})

describe('el DAC0808', () => {
  const pines = (bits: string[]) => ({ ...Object.fromEntries(A.map((p, k) => [p, bits[k]])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', VREFP: 'refp', VREFN: 'refn', COMP: 'comp' })
  const circuito = (bits: string[]): Parte[] => [
    V('V1', '5', 'vcc'), { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '-15' }, pines: { '+': 'vee', '-': '0' } },
    ...(bits.includes('alto') ? [V('V3', '5', 'alto')] : []),
    R('R14', '5k', 'refp', 'vref'), V('V4', '10', 'vref'), R('R15', '5k', 'refn', '0'), R('RL', '1k', 'io', '0'),
    { tipo: 'dac-t', ref: 'U1', props: {}, pines: pines(bits) }
  ]

  it('arma un DACM en corriente de IO a VEE con la referencia entre VREF+ y VREF−, y ocho entradas', () => {
    const { r, nodo } = compilar(circuito(['alto', 'alto', '0', '0', '0', '0', '0', '0']))
    expect(r.errores).toEqual([])
    const els = r.netlist!.elements
    const dacm = de(els, 'DACM')[0]
    expect(dacm).toMatchObject({ modo: 'corriente', out: r.nodoDeRed.get(nodo('io')), ret: r.nodoDeRed.get(nodo('vee')), ref_p: r.nodoDeRed.get(nodo('refp')), ref_n: r.nodoDeRed.get(nodo('refn')), t_asentamiento: 150e-9 })
    expect(dacm.bits).toHaveLength(8)
    // Seis entradas a tierra leen 0 sin puente; las dos que van a «alto» llevan el suyo, con los umbrales de la hoja.
    expect(de(els, 'LOGIC')).toHaveLength(6)
    const entradas = de(els, 'ADC')
    expect(entradas).toHaveLength(2)
    expect(entradas.every((e) => e.in_low === 0.8 && e.in_high === 2 && e.n === 0)).toBe(true)
    expect(entradas.map((e) => e.out)).toEqual(dacm.bits.slice(0, 2))
  })

  it('COMPENSACIÓN y las entradas sin conectar no impiden simular, pero VREF+ sí se pide', () => {
    const sueltas = circuito(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'])
    expect(compilar(sueltas).r.errores).toEqual([])
    const sinRef = circuito(['0', '0', '0', '0', '0', '0', '0', '0'])
    const u = sinRef.length - 1
    sinRef[u] = { ...sinRef[u], pines: { ...sinRef[u].pines, VREFP: 'suelto' } }
    expect(compilar(sinRef).r.errores).toContain('El pin VREFP de U1 no está conectado a nada.')
  })
})
