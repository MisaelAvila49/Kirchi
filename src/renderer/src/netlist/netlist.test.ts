// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { conPiezaSinModelo } from '../prueba/sinModelo'
import { compilarNetlist, diodosDirectos, leerPropiedad, parametrosDiodo, R_ABIERTO, R_CERRADO, tramoMinimoPot } from './netlist'

const lib = libreriaDePrueba().piezas
const compilar = (d: Documento) => compilarNetlist(d, lib, calcularConexiones(d, lib))

describe('compilarNetlist', () => {
  it('el divisor da tres nodos, dos resistencias y una fuente', () => {
    const d = divisor()
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist!.nodes).toBe(3)
    const tipos = r.netlist!.elements.map((e) => e.type).sort()
    expect(tipos).toEqual(['R', 'R', 'V'])
    const con = calcularConexiones(d, lib)
    const medio = r.nodoDeRed.get(con.redDePin.get(clavePin('p_r1', '2'))!)
    const tierra = r.nodoDeRed.get(con.redDePin.get(clavePin('p_v1', '-'))!)
    expect(tierra).toBe(0)
    expect(medio).toBeGreaterThan(0)
    expect(r.netlist!.elements.find((e) => e.type === 'V')).toMatchObject({ wave: { kind: 'dc', v: 5 } })
  })

  it('una pieza sin modelo impide simular y se lista', () => {
    const d = divisor()
    d.piezas.p_u = { id: 'p_u', tipo: 'sin-modelo', ref: 'U1', x: 60, y: 40, rot: 0, espejo: false, props: {} }
    const sm = conPiezaSinModelo(lib)
    const r = compilarNetlist(d, sm, calcularConexiones(d, sm))
    expect(r.netlist).toBeNull()
    expect(r.sinModelo).toEqual(['U1'])
  })

  it('una caja sin equivalencia impide compilar con su motivo y no entra a la lista de sin modelo', () => {
    const d = divisor()
    expect(compilar(d).errores).toEqual([])
    d.piezas.u2 = { id: 'u2', tipo: 'sin-equivalencia', ref: 'U2', x: 60, y: 40, rot: 0, espejo: false, props: { nombre: 'XYZ' } }
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.sinModelo).toEqual([])
    expect(r.errores).toEqual(['U2 no tiene equivalencia en Kirchi: reemplázala para simular.'])
  })

  it('los circuitos con piezas que sí tienen modelo siguen compilando', () => {
    for (const d of [divisor(), ledConBateria()]) {
      const r = compilar(d)
      expect(r.sinModelo).toEqual([])
      expect(r.errores).toEqual([])
      expect(r.netlist).not.toBeNull()
    }
  })

  it('sin tierra da error', () => {
    const d = divisor()
    delete d.piezas.p_g
    expect(compilar(d).errores).toEqual(['Falta una tierra: agrega una con G.'])
  })

  it('un valor inválido da error con la referencia', () => {
    const d = divisor()
    d.piezas.p_r1 = { ...d.piezas.p_r1, props: { valor: 'abc' } }
    expect(compilar(d).errores).toContain('El valor «abc» de R1 no es válido.')
  })

  it('un pin suelto da error', () => {
    const d = divisor()
    delete d.cables.c_a
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toContain('El pin + de V1 no está conectado a nada.')
  })

  it('el interruptor es una resistencia de 1 GΩ abierto y 1 mΩ cerrado', () => {
    const d = divisor()
    d.piezas.p_r2 = { ...d.piezas.p_r2, tipo: 'interruptor', ref: 'S1', props: { estado: 'abierto' } }
    expect(compilar(d).netlist!.elements).toContainEqual(expect.objectContaining({ type: 'R', ohms: R_ABIERTO }))
    d.piezas.p_r2 = { ...d.piezas.p_r2, props: { estado: 'cerrado' } }
    expect(compilar(d).netlist!.elements).toContainEqual(expect.objectContaining({ type: 'R', ohms: R_CERRADO }))
  })

  it('usa el valor por omisión si la pieza no lo trae', () => {
    const d = divisor()
    d.piezas.p_r1 = { ...d.piezas.p_r1, props: {} }
    expect(compilar(d).netlist!.elements).toContainEqual(expect.objectContaining({ type: 'R', ohms: 1000 }))
  })

  const res = (id: string, ref: string, x: number, y: number, valor = '1k') => ({ id, tipo: 'resistencia', ref, x, y, rot: 0 as const, espejo: false, props: { valor } })

  it('una resistencia en corto se omite con aviso y no crea nodos', () => {
    const d = divisor()
    d.piezas.p_x = res('p_x', 'R3', 40, 40)
    d.cables.c_x = { id: 'c_x', puntos: [{ x: 36, y: 40 }, { x: 44, y: 40 }] }
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist!.nodes).toBe(3)
    expect(r.netlist!.elements).toHaveLength(3)
    expect(r.avisos).toEqual(['R3 tiene sus dos terminales en la misma red y se omite.'])
  })

  it('una fuente de voltaje en corto es un error', () => {
    const d = divisor()
    d.cables.c_s = { id: 'c_s', puntos: [{ x: 0, y: -4 }, { x: 0, y: 4 }] }
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toContain('V1 está en corto: sus dos terminales están en la misma red.')
  })

  it('una isla sin camino a tierra da error con sus referencias', () => {
    const d = divisor()
    d.piezas.p_x = res('p_x', 'R3', 40, 40)
    d.piezas.p_y = res('p_y', 'R4', 52, 40)
    d.cables.c_x = { id: 'c_x', puntos: [{ x: 44, y: 40 }, { x: 48, y: 40 }] }
    d.cables.c_y = { id: 'c_y', puntos: [{ x: 56, y: 40 }, { x: 56, y: 50 }, { x: 36, y: 50 }, { x: 36, y: 40 }] }
    const r = compilar(d)
    expect(r.netlist).toBeNull()
    expect(r.errores).toEqual(['R3, R4 no tienen camino a tierra.'])
  })

  it('el LED toma is y n de su color si el modelo los da por opción; un color sin valores usa los del modelo', () => {
    const led = lib.get('led')!
    const m = led.modelo as Extract<NonNullable<typeof led.modelo>, { tipo: 'D' }>
    const conColor = new Map(lib).set('led', { ...led, modelo: { ...m, por: { prop: 'color', valores: { azul: { is: 2e-28, n: 2 } } } } })
    const diodo = (color: string) => {
      const d = ledConBateria()
      d.piezas.p_d1 = { ...d.piezas.p_d1, props: { color } }
      return compilarNetlist(d, conColor, calcularConexiones(d, conColor)).netlist!.elements.find((e) => e.type === 'D')
    }
    expect(diodo('azul')).toMatchObject({ is: 2e-28, n: 2 })
    expect(diodo('rojo')).toMatchObject({ is: m.is, n: m.n })
  })

  it('un valor que desborda a infinito no es válido', () => {
    const d = divisor()
    const enorme = '9'.repeat(400)
    d.piezas.p_r1 = { ...d.piezas.p_r1, props: { valor: enorme } }
    expect(compilar(d).errores).toEqual([`El valor «${enorme}» de R1 no es válido.`])
    expect(leerPropiedad(d.piezas.p_r1, lib.get('resistencia')!, 'valor', null).ok).toBe(false)
  })

  it('la opción de un diodo que no es de su lista usa la opción por omisión', () => {
    const led = lib.get('led')!
    const m = led.modelo as Extract<NonNullable<typeof led.modelo>, { tipo: 'D' }>
    const def = { ...led, props: [{ ...led.props[0], defecto: 'verde' }], modelo: { ...m, por: { prop: 'color', valores: { verde: { is: 1e-20, n: 2 }, naranja: { is: 9e-20, n: 2 } } } } }
    const con = (color: string) => parametrosDiodo(def.modelo, { id: 'p', tipo: 'led', ref: 'D1', x: 0, y: 0, rot: 0, espejo: false, props: { color } }, def)
    expect(con('verde')).toEqual({ is: 1e-20, n: 2 })
    // «naranja» tiene renglón en valores pero no es una de las opciones del color: se toma la opción por omisión.
    expect(con('naranja')).toEqual({ is: 1e-20, n: 2 })
    expect(con('__proto__')).toEqual({ is: 1e-20, n: 2 })
  })

  it('cada elemento sabe de qué pieza viene, en el orden de la netlist', () => {
    const r = compilar(divisor())
    expect(r.piezaDeElemento).toEqual(['p_r1', 'p_r2', 'p_v1'])
    expect(r.netlist!.elements.map((e) => e.type)).toEqual(['R', 'R', 'V'])
  })

  /** El divisor con V1 cambiada por otra fuente. */
  const conFuente = (tipo: string, props: Record<string, string>) => {
    const d = divisor()
    d.piezas.p_v1 = { ...d.piezas.p_v1, tipo, props }
    return compilar(d)
  }

  it('una fuente más rápida de lo que la vista previa puede seguir da aviso y la netlist se arma igual', () => {
    const r = conFuente('fuente-ac', { amplitud: '5', frecuencia: '50M' })
    expect(r.errores).toEqual([])
    expect(r.netlist).not.toBeNull()
    expect(r.avisos).toEqual(['La fuente V1 de 50 MHz es más rápida de lo que la vista previa puede seguir.'])
    expect(conFuente('fuente-pulso', { frecuencia: '10M' }).avisos).toEqual(['La fuente V1 de 10 MHz es más rápida de lo que la vista previa puede seguir.'])
    expect(conFuente('fuente-ac', { frecuencia: '1M' }).avisos).toEqual([])
    expect(conFuente('fuente-ac', { frecuencia: '5M' }).avisos).toEqual([])
  })

  it('la fuente AC es una senoidal sin desplazamiento con su amplitud de pico y su frecuencia', () => {
    const r = conFuente('fuente-ac', { amplitud: '10', frecuencia: '1k' })
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.find((e) => e.type === 'V')).toMatchObject({ wave: { kind: 'sine', offset: 0, amp: 10, freq: 1000 } })
  })

  it('la fuente de pulso va de 0 V a su voltaje alto con su ciclo de trabajo', () => {
    const r = conFuente('fuente-pulso', { alto: '3.3', frecuencia: '100', ciclo: '25 %' })
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.find((e) => e.type === 'V')).toMatchObject({ wave: { kind: 'square', low: 0, high: 3.3, freq: 100, duty: 0.25 } })
    expect(conFuente('fuente-pulso', {}).netlist!.elements.find((e) => e.type === 'V')).toMatchObject({ wave: { kind: 'square', high: 5, freq: 1000, duty: 0.5 } })
  })

  describe('fuente de pulso: ancho, subida, bajada y retardo', () => {
    const onda = (props: Record<string, string>) => conFuente('fuente-pulso', props).netlist!.elements.find((e) => e.type === 'V') as { wave: Record<string, unknown> }
    it('sin tocar los tiempos nuevos la onda es la cuadrada de siempre (un .kir viejo no cambia)', () => {
      expect(onda({ alto: '5', frecuencia: '1k', ciclo: '50 %' }).wave).toEqual({ kind: 'square', low: 0, high: 5, freq: 1000, duty: 0.5 })
      expect(onda({ subida: '0', bajada: '0 s', retardo: '0', ancho: '0' }).wave).toMatchObject({ kind: 'square', duty: 0.5 })
    })
    it('el ancho manda sobre el ciclo y sale como pulso de SPICE', () => {
      expect(onda({ frecuencia: '1k', ancho: '200u' }).wave).toMatchObject({ kind: 'pulse', low: 0, high: 5, freq: 1000, rise: 0, fall: 0, width: 2e-4, phase: 0 })
    })
    it('la subida y la bajada hacen flancos con pendiente y el ciclo sigue dando el ancho de la meseta', () => {
      expect(onda({ frecuencia: '1k', ciclo: '25 %', subida: '10u', bajada: '20u' }).wave).toMatchObject({ kind: 'pulse', rise: 1e-5, fall: 2e-5, width: 2.5e-4 })
    })
    it('el retardo desplaza la onda: el primer pulso llega después de ese tiempo', () => {
      const w = onda({ frecuencia: '1k', ciclo: '25 %', retardo: '300u' }).wave as { phase: number }
      expect(w.phase).toBeCloseTo(0.7, 9)
    })
    it('lo que no cabe en el periodo se dice con la referencia y las cifras', () => {
      expect(conFuente('fuente-pulso', { frecuencia: '1k', ancho: '900u', subida: '100u', bajada: '100u' }).errores).toEqual([
        'La subida, el ancho y la bajada de V1 suman 1.1 ms y no caben en su periodo de 1 ms.'
      ])
      expect(conFuente('fuente-pulso', { frecuencia: '1k', ciclo: '25 %', retardo: '900u' }).errores).toEqual([
        'El retardo de V1 (900 µs) más su pulso (250 µs) no caben en su periodo de 1 ms.'
      ])
    })
    it('valida unidades y signos', () => {
      expect(conFuente('fuente-pulso', { ancho: 'mucho' }).errores).toEqual(['El valor «mucho» de V1 no es válido.'])
      expect(conFuente('fuente-pulso', { subida: '5 V' }).errores[0]).toContain('no es compatible')
      expect(conFuente('fuente-pulso', { bajada: '-1u' }).errores).toEqual(['La bajada de V1 no puede ser negativa.'])
    })
  })

  it('una frecuencia de cero o un ciclo que no es porcentaje dan error con la referencia', () => {
    expect(conFuente('fuente-ac', { frecuencia: '0' }).errores).toEqual(['La frecuencia de V1 debe ser mayor que cero.'])
    expect(conFuente('fuente-pulso', { ciclo: 'mitad' }).errores).toEqual(['El ciclo de trabajo «mitad» de V1 no es válido.'])
  })

  it('una fuente AC en corto es un error si tiene amplitud y se omite si es de 0 V', () => {
    const corto = (amplitud: string) => {
      const d = divisor()
      d.piezas.p_v1 = { ...d.piezas.p_v1, tipo: 'fuente-ac', props: { amplitud } }
      d.cables.c_s = { id: 'c_s', puntos: [{ x: 0, y: -4 }, { x: 0, y: 4 }] }
      return compilar(d)
    }
    expect(corto('5').errores).toContain('V1 está en corto: sus dos terminales están en la misma red.')
    expect(corto('0').avisos).toContain('V1 tiene sus dos terminales en la misma red y se omite.')
  })

  /** El divisor con un potenciómetro en lugar de R1 y R2: pin 1 a V1+, pin 2 a tierra; el cursor queda suelto o a una resistencia. */
  const conPotenciometro = (posicion: string, cursor: boolean, valor = '10k') => {
    const d = divisor()
    delete d.piezas.p_r1
    delete d.piezas.p_r2
    d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: -8, rot: 0, espejo: false, props: { valor, posicion } }
    d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    if (cursor) {
      d.cables.c_c = { id: 'c_c', puntos: [{ x: 10, y: -12 }, { x: 10, y: -16 }, { x: 30, y: -16 }] }
      d.piezas.p_rc = { id: 'p_rc', tipo: 'resistencia', ref: 'R9', x: 34, y: -16, rot: 0, espejo: false, props: { valor: '1G' } }
      d.cables.c_d = { id: 'c_d', puntos: [{ x: 38, y: -16 }, { x: 40, y: -16 }, { x: 40, y: 8 }, { x: 18, y: 8 }] }
    }
    return compilar(d)
  }

  it('el potenciómetro son dos resistencias que suman su valor; en un extremo el tramo queda en su mínimo: 10 Ω o el 1 % del valor', () => {
    const rs = (posicion: string, valor = '10k') => conPotenciometro(posicion, true, valor).netlist!.elements.filter((e) => e.type === 'R' && e.ohms !== 1e9).map((e) => (e as { ohms: number }).ohms)
    expect(rs('25 %')).toEqual([2500, 7500])
    expect(rs('0 %')).toEqual([10, 10000])
    expect(rs('100 %')).toEqual([10000, 10])
    expect(rs('0.05 %')).toEqual([10, 9995])
    // Un potenciómetro de 100 Ω: el 1 % es 1 Ω, menos que 10 Ω.
    expect(rs('0 %', '100')).toEqual([1, 100])
    expect(tramoMinimoPot(10000)).toBe(10)
    expect(tramoMinimoPot(100)).toBe(1)
    // Nunca por debajo del de un interruptor cerrado: más chico, la tolerancia de pivote lo leería como un corto.
    expect(tramoMinimoPot(0.05)).toBe(R_CERRADO)
    const r = conPotenciometro('25 %', true)
    expect(r.piezaDeElemento.filter((id) => id === 'p_rv')).toHaveLength(2)
    expect(r.piezaDeElemento.filter((id) => id === '')).toHaveLength(0)
    expect([...r.potenciometros.keys()]).toEqual(['p_rv'])
  })

  it('un cursor sin conectar da el mismo error que cualquier pin suelto, y una posición inválida se explica', () => {
    expect(conPotenciometro('50 %', false).errores).toEqual(['El pin cursor de RV1 no está conectado a nada.'])
    expect(conPotenciometro('tope', true).errores).toEqual(['La posición «tope» del cursor de RV1 no es válida.'])
  })

  it('la fuente de corriente es una fuente ideal de la entrada a la salida', () => {
    const d = divisor()
    delete d.piezas.p_r2
    d.piezas.p_v1 = { ...d.piezas.p_v1, tipo: 'fuente-corriente', props: { corriente: '2m' } }
    d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.netlist!.elements.find((e) => e.type === 'I')).toMatchObject({ amps: 0.002, a: 0 })
    d.piezas.p_v1 = { ...d.piezas.p_v1, props: { corriente: 'mucha' } }
    expect(compilar(d).errores).toEqual(['El valor «mucha» de V1 no es válido.'])
  })

  /** Batería de 9 V con el ánodo del LED conectado directo a su polo positivo (sin R1); `rot` 270 lo pone al revés. */
  const ledDirecto = (voltaje: string, rot: 90 | 270 = 90) => {
    const d = ledConBateria()
    delete d.piezas.p_r1
    d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 14, y: -8 }] }
    d.piezas.p_b1 = { ...d.piezas.p_b1, props: { voltaje } }
    d.piezas.p_d1 = { ...d.piezas.p_d1, rot }
    return d
  }

  it('un LED directo sobre la batería no simula y se explica; en inversa, o con poco voltaje, sí', () => {
    expect(compilar(ledDirecto('9')).errores).toEqual(['D1 está conectado directo a B1, sin resistencia: agrega una en serie.'])
    expect(compilar(ledDirecto('9')).netlist).toBeNull()
    expect(compilar(ledDirecto('9', 270)).errores).toEqual([])
    expect(compilar(ledDirecto('0.3')).errores).toEqual([])
  })

  it('el aviso nombra la pieza y la fuente para poder seleccionarlas, y sirve para el panel Proyecto', () => {
    const d = ledDirecto('9')
    expect(diodosDirectos(d, lib, calcularConexiones(d, lib))).toEqual([
      { texto: 'D1 está conectado directo a B1, sin resistencia: agrega una en serie.', piezas: ['p_d1', 'p_b1'] }
    ])
  })

  it('también detecta el diodo sobre una cadena de fuentes ideales en serie', () => {
    const d = ledDirecto('9')
    // B2 encima de B1: el polo positivo de B1 es el negativo de B2 y el LED queda sobre las dos.
    d.piezas.p_b2 = { id: 'p_b2', tipo: 'bateria', ref: 'B2', x: 0, y: -16, rot: 0, espejo: false, props: { voltaje: '9' } }
    d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -12 }] }
    d.cables.c_x = { id: 'c_x', puntos: [{ x: 0, y: -20 }, { x: 14, y: -20 }, { x: 14, y: -8 }] }
    expect(compilar(d).errores).toEqual(['D1 está conectado directo a B1 y B2, sin resistencia: agrega una en serie.'])
  })

  it('un LED con resistencia en serie no da aviso', () => {
    const d = ledConBateria()
    expect(compilar(d).errores).toEqual([])
    expect(diodosDirectos(d, lib, calcularConexiones(d, lib))).toEqual([])
  })

  it('una unidad incompatible da error y una compatible se acepta', () => {
    const d = divisor()
    d.piezas.p_r1 = { ...d.piezas.p_r1, props: { valor: '5V' } }
    expect(compilar(d).errores).toContain('La unidad «5V» de R1 no es compatible: se esperaba Ω.')
    d.piezas.p_r1 = { ...d.piezas.p_r1, props: { valor: '1kΩ' } }
    expect(compilar(d).errores).toEqual([])
  })
})
