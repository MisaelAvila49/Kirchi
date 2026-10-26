// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { excesoDe, limitesDelCircuito, potenciaNominal, textoVatios, VigiaDeAvisos, VigiaDeReinicio, PERMANENCIA_MS, type LimitePieza } from './avisos'
import type { Lectura, MedicionPieza } from './lectura'
import { VigiaDeQuemado } from './quemado'

const lectura = (piezas: Record<string, MedicionPieza>): Lectura => ({ t: 1, ratio: 1, redes: new Map(), piezas: new Map(Object.entries(piezas)) })

describe('avisos de sobrecorriente', () => {
  it('el LED avisa con la media del intervalo y la cifra contra su nominal', () => {
    const lim: LimitePieza = { tipo: 'led', corriente: 0.02 }
    expect(excesoDe(lectura({ d: { v: 2, i: 0.0316, p: 0.06 } }), 'd', lim, undefined)!.texto).toBe('31.6 mA, máximo 20 mA')
    expect(excesoDe(lectura({ d: { v: 2, i: 0.02, p: 0.04 } }), 'd', lim, undefined)).toBeNull()
  })

  it('el display multiplexado con pulsos de 60 mA a un cuarto del tiempo lleva 15 mA de media y no avisa; un segmento a 25 mA sí', () => {
    const lim: LimitePieza = { tipo: 'display', corriente: 0.02 }
    const display = (corrientes: (number | null)[]): MedicionPieza => ({ v: 0, i: 0, p: 0, extra: { tipo: 'display', corrientes, muestra: '' } })
    expect(excesoDe(lectura({ u: display([0.015, 0.015, 0.015, null, 0, 0, 0, 0]) }), 'u', lim, undefined)).toBeNull()
    expect(excesoDe(lectura({ u: display([0.015, 0.025, 0.015, null, 0, 0, 0, 0]) }), 'u', lim, undefined)).toMatchObject({ texto: 'b: 25.0 mA, máximo 20 mA', segmento: 1 })
  })

  it('la resistencia avisa contra su potencia nominal (0.25 W por omisión) con su potencia media', () => {
    expect(potenciaNominal(undefined)).toBe(0.25)
    expect(potenciaNominal('0.5 W')).toBe(0.5)
    expect(potenciaNominal('basura')).toBe(0.25)
    const r = lectura({ r: { v: 0, i: 0, p: 0 } })
    expect(excesoDe(r, 'r', { tipo: 'resistencia', potencia: 0.25 }, 0.49)!.texto).toBe('0.49 W, máximo 0.25 W')
    expect(excesoDe(r, 'r', { tipo: 'resistencia', potencia: 0.5 }, 0.49)).toBeNull()
    expect(textoVatios(2)).toBe('2 W')
    expect(textoVatios(0.125)).toBe('0.125 W')
  })

  it('el transistor avisa por su corriente o por su potencia máximas, la que pase primero', () => {
    const lim: LimitePieza = { tipo: 'transistor', corriente: 0.6, potencia: 0.625, modelo: '2N2222' }
    expect(excesoDe(lectura({ q: { v: 1, i: 0.71, p: 0.71 } }), 'q', lim, 0.71)!.texto).toBe('710 mA, máximo 600 mA')
    expect(excesoDe(lectura({ q: { v: 2, i: 0.4, p: 0.8 } }), 'q', lim, 0.8)!.texto).toBe('0.8 W, máximo 0.625 W')
  })

  it('el fusible dice desde cuántas veces su nominal se funde y con qué corriente', () => {
    const lim: LimitePieza = { tipo: 'fusible', corriente: 1, fusible: { ohms: 0.1, ifusion: 2, tau: 1 } }
    const l = lectura({ f: { v: 0.15, i: 1.5, p: 0.2, extra: { tipo: 'fusible', fundido: false, calentamiento: 0.5 } } as MedicionPieza })
    const e = excesoDe(l, 'f', lim, undefined)!
    expect(e.registro('F1')).toContain('Se funde desde 2 veces la nominal (2 A).')
  })

  it('un aviso se queda un segundo de reloj después de volver debajo del límite y el Registro lo dice una vez', () => {
    const v = new VigiaDeAvisos()
    const limites = new Map<string, LimitePieza>([['r', { tipo: 'resistencia', potencia: 0.25 }]])
    const alta = lectura({ r: { v: 7, i: 0.07, p: 0.49 } })
    const baja = lectura({ r: { v: 3, i: 0.03, p: 0.09 } })
    const p = (x: number) => new Map([['r', x]])
    expect(v.revisar(alta, limites, p(0.49), 0, () => 'R1').registro).toEqual(['R1 disipa 0.49 W, más de su potencia nominal de 0.25 W: usa una de más potencia o cambia el circuito.'])
    expect(v.revisar(alta, limites, p(0.49), 100, () => 'R1').registro).toEqual([])
    expect(v.revisar(baja, limites, p(0.09), 200, () => 'R1').visibles.get('r')).toMatchObject({ excedido: false })
    expect(v.revisar(baja, limites, p(0.09), 100 + PERMANENCIA_MS - 1, () => 'R1').visibles.has('r')).toBe(true)
    expect(v.revisar(baja, limites, p(0.09), 100 + PERMANENCIA_MS, () => 'R1').visibles.has('r')).toBe(false)
  })

  it('una potencia nominal que no es una de las opciones (un .kir editado a mano) se lee como la de omisión', () => {
    const lib = libreriaDePrueba().piezas
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '100', potencia: '1000 W' }, pines: { '1': 'a', '2': '0' } }
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(limitesDelCircuito(d, lib, r).get('p_1')).toMatchObject({ tipo: 'resistencia', potencia: 0.25 })
  })
})

describe('piezas compuestas: límites por canal y por sentido', () => {
  const canal = (nombre: string, elementos: number[], extra: Partial<NonNullable<LimitePieza['canales']>[number]> = {}) => ({ nombre, elementos, sentido: 'positiva' as const, max: 0.5, consejo: 'baja la carga.', fuente: 'prueba', ...extra })
  const pieza = (corrientes: number[], voltajes: number[] = []): MedicionPieza => ({ v: 0, i: 0, p: 0, extra: { tipo: 'compuesto', corrientes, voltajes } })

  it('suma las corrientes de los elementos del canal y avisa con el canal que más se pasa', () => {
    const lim: LimitePieza = { tipo: 'compuesto', canales: [canal('canal 1', [0, 1]), canal('canal 2', [2, 3])] }
    expect(excesoDe(lectura({ u: pieza([0.2, 0.2, 0.2, 0.2]) }), 'u', lim, undefined)).toBeNull()
    const e = excesoDe(lectura({ u: pieza([0.3, 0.3, 0.2, 0.5]) }), 'u', lim, undefined)!
    expect(e.texto).toBe('canal 2: 700 mA, máximo 500 mA')
    expect(e.registro('U1')).toBe('U1 lleva 700 mA de canal 2, más de los 500 mA que admite: baja la carga.')
    expect(excesoDe(lectura({ u: pieza([0.3, 0.3, 0.2, 0.2]) }), 'u', lim, undefined)!.texto).toBe('canal 1: 600 mA, máximo 500 mA')
  })

  it('el sentido negativo mira el opuesto de la suma y la medida de voltaje, los voltajes', () => {
    const lim: LimitePieza = { tipo: 'compuesto', canales: [canal('salida sobre la entrada', [0], { medida: 'voltaje', sentido: 'negativa', max: 0.6 })] }
    expect(excesoDe(lectura({ u: pieza([0], [3]) }), 'u', lim, undefined)).toBeNull()
    expect(excesoDe(lectura({ u: pieza([0], [-0.6]) }), 'u', lim, undefined)).toBeNull()
    expect(excesoDe(lectura({ u: pieza([0], [-5]) }), 'u', lim, undefined)!.registro('U1')).toBe('U1 tiene 5.00 V de salida sobre la entrada, más de los 600 mV que admite: baja la carga.')
  })

  it('una pieza sin la lectura de compuesto no avisa', () => {
    expect(excesoDe(lectura({ u: { v: 0, i: 0, p: 0 } }), 'u', { tipo: 'compuesto', canales: [canal('canal 1', [0])] }, undefined)).toBeNull()
  })

  it('el ULN2003 trae siete canales de 500 mA y los reguladores uno de voltaje, desde su pieza.json', () => {
    const lib = libreriaDePrueba().piezas
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'uln2003', ref: 'U1', props: {}, pines: { '1B': 'a', '1C': 'c', '2B': 'x2b', '2C': 'x2c', '3B': 'x3b', '3C': 'x3c', '4B': 'x4b', '4C': 'x4c', '5B': 'x5b', '5C': 'x5c', '6B': 'x6b', '6C': 'x6c', '7B': 'x7b', '7C': 'x7c', E: '0', COM: 'a' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': 'c' } }
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const lim = [...limitesDelCircuito(d, lib, r).values()].find((x) => x.tipo === 'compuesto')!
    expect(lim.canales!.map((c) => c.nombre)).toEqual(['canal 1', 'canal 2', 'canal 3', 'canal 4', 'canal 5', 'canal 6', 'canal 7'])
    expect(new Set(lim.canales!.map((c) => c.max))).toEqual(new Set([0.5]))
    for (const id of ['regulador-positivo', 'regulador-negativo', 'regulador-ajustable']) {
      const c = lib.get(id)!.limites!.compuesto!
      expect(c, id).toHaveLength(1)
      expect(c[0], id).toMatchObject({ medida: 'voltaje', max: 0.6 })
      expect(c[0].fuente, id).toMatch(/Criterio de Kirchi/)
    }
  })
})

describe('capacitor electrolítico', () => {
  const lim: LimitePieza = { tipo: 'capacitor', voltaje: { nominal: 25, aviso: 1, inverso: 1 }, quema: { factor: 1, durante: 0.5, elemento: 0 } }
  const con = (v: number): Lectura => lectura({ c: { v, i: 0, p: 0 } })

  it('avisa con más de 1 V al revés y con más de su voltaje nominal, y con menos no dice nada', () => {
    expect(excesoDe(con(-0.9), 'c', lim, undefined)).toBeNull()
    expect(excesoDe(con(20), 'c', lim, undefined)).toBeNull()
    expect(excesoDe(con(-1.5), 'c', lim, undefined)).toMatchObject({ texto: '1.50 V al revés, máximo 1 V' })
    expect(excesoDe(con(-1.5), 'c', lim, undefined)!.registro('C1')).toBe('C1 tiene 1.50 V al revés, más de los 1 V que admite: un electrolítico polarizado se daña. Invierte sus terminales.')
    expect(excesoDe(con(30), 'c', lim, undefined)).toMatchObject({ texto: '30.0 V, nominal 25 V' })
  })

  it('se queman con voltaje inverso o sobre el nominal, medio segundo seguido, solo si la opción lo pide', () => {
    expect(VigiaDeQuemado.veces(con(-2), 'c', lim, undefined)).toBe(2)
    expect(VigiaDeQuemado.veces(con(50), 'c', lim, undefined)).toBe(2)
    expect(VigiaDeQuemado.veces(con(12), 'c', lim, undefined)).toBeLessThan(1)
    const v = new VigiaDeQuemado()
    const limites = new Map([['c', lim]])
    expect(v.revisar(con(-2), 0.3, 1, limites, new Map())).toEqual([])
    expect(v.revisar(con(-2), 0.3, 2, limites, new Map())).toEqual(['c'])
    const sano = new VigiaDeQuemado()
    expect(sano.revisar(con(10), 0.6, 1, limites, new Map())).toEqual([])
  })

  it('el circuito arma su límite con el voltaje nominal elegido y el elemento que se abre', () => {
    const lib = libreriaDePrueba().piezas
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'capacitor-electrolitico', ref: 'C1', props: { valor: '100u', voltaje: '10 V' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'capacitor-electrolitico', ref: 'C2', props: { valor: '10u', voltaje: 'basura' }, pines: { '+': 'a', '-': '0' } }
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const l = limitesDelCircuito(d, lib, r)
    const [c1, c2] = [l.get('p_1')!, l.get('p_2')!]
    expect(c1).toMatchObject({ tipo: 'capacitor', voltaje: { nominal: 10, aviso: 1, inverso: 1 }, quema: { factor: 1, durante: 0.5 } })
    expect(r.netlist!.elements[c1.quema!.elemento]).toMatchObject({ type: 'C', farads: 100e-6 })
    // Una opción que no existe (un .kir editado a mano) toma la de omisión.
    expect(c2.voltaje!.nominal).toBe(25)
  })
})

describe('motor con límites', () => {
  const lim: LimitePieza = { tipo: 'motor', voltaje: { nominal: 6, aviso: 1.5 }, quema: { factor: 2, durante: 0.5, elemento: 0 } }
  const con = (v: number): Lectura => lectura({ m: { v, i: 0.2, p: 0.2 * v } })

  it('avisa con más de 1.5 veces su voltaje nominal, en un sentido o en el otro, y con menos no dice nada', () => {
    expect(excesoDe(con(9), 'm', lim, undefined)).toBeNull()
    expect(excesoDe(con(-8.9), 'm', lim, undefined)).toBeNull()
    expect(excesoDe(con(9.6), 'm', lim, undefined)).toMatchObject({ texto: '9.60 V, nominal 6 V' })
    expect(excesoDe(con(-9.6), 'm', lim, undefined)!.registro('M1')).toBe('M1 tiene 9.60 V, más de 1.5 veces sus 6 V nominales: se calienta de más.')
  })

  it('se quema con más del doble de su nominal medio segundo seguido, solo si la opción lo pide', () => {
    expect(VigiaDeQuemado.veces(con(12), 'm', lim, undefined)).toBe(2)
    const v = new VigiaDeQuemado()
    const limites = new Map([['m', lim]])
    // Exactamente el doble no pasa de él; un poco más, sí.
    expect(v.revisar(con(12), 0.6, 1, limites, new Map())).toEqual([])
    expect(v.revisar(con(12.5), 0.3, 2, limites, new Map())).toEqual([])
    expect(v.revisar(con(12.5), 0.3, 3, limites, new Map())).toEqual(['m'])
  })

  it('el circuito arma su límite con el voltaje nominal que se escribió', () => {
    const lib = libreriaDePrueba().piezas
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '9' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'motor-dc', ref: 'M1', props: { voltaje: '12' }, pines: { '+': 'a', '-': '0' } }
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const m = limitesDelCircuito(d, lib, r).get('p_1')!
    expect(m).toMatchObject({ tipo: 'motor', voltaje: { nominal: 12, aviso: 1.5 }, quema: { factor: 2, durante: 0.5 } })
    expect(r.netlist!.elements[m.quema!.elemento]).toMatchObject({ type: 'MOTOR' })
  })
})

describe('biestable que necesita un reinicio (B14)', () => {
  const ff = (t: number, clk: '0' | '1', q: 'X' | '0' | '1', pre = '1', clr = '1'): Lectura => ({
    ...lectura({
      u: {
        v: 0, i: 0, p: 0,
        extra: {
          tipo: 'digital', modelo: 'biestable-jk', q,
          pines: [{ id: 'CLK', nivel: clk }, { id: 'PRE', nivel: pre }, { id: 'CLR', nivel: clr }]
        }
      } as unknown as MedicionPieza
    }),
    t
  })

  it('avisa una vez cuando sigue en X con el reloj andando y sin PRE ni CLR activos', () => {
    const v = new VigiaDeReinicio()
    expect(v.revisar(ff(0.1, '0', 'X'), () => 'U1')).toEqual([])
    expect(v.revisar(ff(0.2, '1', 'X'), () => 'U1')).toEqual([])
    expect(v.revisar(ff(0.9, '0', 'X'), () => 'U1')).toEqual(['U1 sigue en X con el reloj andando: necesita un pulso en CLR al arrancar.'])
    expect(v.revisar(ff(2, '1', 'X'), () => 'U1')).toEqual([])
  })

  it('no avisa si sale de X, si el reloj no se mueve o si CLR está activo', () => {
    const v = new VigiaDeReinicio()
    for (const t of [0.1, 0.8, 1.5]) expect(v.revisar(ff(t, '1', 'X'), () => 'U1')).toEqual([])
    const w = new VigiaDeReinicio()
    for (const [t, c] of [[0.1, '0'], [0.2, '1'], [1, '0'], [2, '1']] as const) expect(w.revisar(ff(t, c, '0'), () => 'U1')).toEqual([])
    const z = new VigiaDeReinicio()
    for (const [t, c] of [[0.1, '0'], [0.2, '1'], [1, '0']] as const) expect(z.revisar(ff(t, c, 'X', '1', '0'), () => 'U1')).toEqual([])
  })
})
