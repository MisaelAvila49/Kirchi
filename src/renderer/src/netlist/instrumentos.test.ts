// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, divisor, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { basesDeTiempo, PASO_MAX, pasoDeSimulacion } from '../sim/lectura'
import { cambiosEnCaliente } from '../sim/control'
import { bytesDeSonda, MEMORIA_SONDAS } from '../instrumentos/memoria'
import { compilarNetlist, type OpcionesNetlist } from './netlist'

const lib = libreriaDePrueba().piezas
const compilar = (d: Documento, o?: OpcionesNetlist) => compilarNetlist(d, lib, calcularConexiones(d, lib), o)
const circuito = (partes: Parte[]) => conEtiquetas(lib, partes)
const nodo = (d: Documento, r: ReturnType<typeof compilar>, pieza: string, pin: string) => r.nodoDeRed.get(calcularConexiones(d, lib).redDePin.get(clavePin(pieza, pin))!)

/** 5 V sobre 1 MΩ y 1 MΩ, con el multímetro en el punto medio (la pieza p_3). */
const voltimetro = (props: Record<string, string> = {}) =>
  circuito([
    { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1M' }, pines: { '1': 'vcc', '2': 'medio' } },
    { tipo: 'resistencia', ref: 'R2', props: { valor: '1M' }, pines: { '1': 'medio', '2': '0' } },
    { tipo: 'multimetro', ref: 'XMM1', props, pines: { '+': 'medio', COM: '0' } }
  ])

describe('el multímetro en la netlist', () => {
  it('es un solo fusible con su fuente de prueba en serie y la resistencia del modo, con dos sondas', () => {
    const d = voltimetro()
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const mm = r.instrumentos.multimetros.get('p_3')!
    const el = r.netlist!.elements
    expect(el[mm.elemento]).toEqual({ type: 'FUSE', a: nodo(d, r, 'p_3', '+'), b: 0, ohms: 10e6, inom: 10, ifusion: 20, tau: 0.125, v: 0 })
    expect(r.netlist!.sondas).toEqual([
      // Solo sus muestras: la lectura es la ventana sobre ellas y nunca pide columnas.
      { kind: 'v', p: nodo(d, r, 'p_3', '+'), n: 0, muestras: 32768, columna: 1e-3, sin_rejilla: true },
      { kind: 'i', element: mm.elemento, signo: 1, muestras: 32768, columna: 1e-3, sin_rejilla: true }
    ])
    expect([mm.sondaV, mm.sondaI]).toEqual([0, 1])
  })

  it('en Ω usa la prueba de 1 V y el rango de la sesión', () => {
    const r = compilar(voltimetro({ modo: 'Ω' }), { rangosOhm: new Map([['p_3', 1e6]]) })
    const mm = r.instrumentos.multimetros.get('p_3')!
    expect(r.netlist!.elements[mm.elemento]).toMatchObject({ type: 'FUSE', v: 1, ohms: 1e6 })
  })

  it('cambiar de modo o pasar a ideal simulando es un cambio en caliente de su único elemento', () => {
    const antes = compilar(voltimetro()).netlist!
    const despues = compilar(voltimetro({ modo: 'Ω' })).netlist!
    expect(cambiosEnCaliente(antes, despues)?.map((c) => c.elemento)).toEqual([expect.objectContaining({ type: 'FUSE', v: 1, ohms: 1e4 })])
    const ideal = compilar(voltimetro({ ideal: 'sí' })).netlist!
    expect(cambiosEnCaliente(antes, ideal)?.map((c) => c.elemento)).toEqual([expect.objectContaining({ type: 'FUSE', ohms: 1e9 })])
  })

  it('un multímetro con una terminal al aire no se arma ni impide simular', () => {
    const d = circuito([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', pines: { '1': 'vcc', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', pines: { '+': 'suelto', COM: '0' } }
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.instrumentos.sueltos).toEqual(new Set(['p_2']))
    expect(r.netlist!.sondas).toBeUndefined()
  })
})

describe('un circuito sin instrumentos', () => {
  it('da el mismo JSON que antes: sin el campo sondas', () => {
    const r = compilar(divisor())
    expect(JSON.stringify(r.netlist)).not.toContain('sondas')
    expect(r.instrumentos.osciloscopios.size + r.instrumentos.multimetros.size).toBe(0)
  })
})

describe('el osciloscopio en la netlist', () => {
  const partes = (props: Record<string, string> = {}): Parte[] => [
    { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
    { tipo: 'resistencia', ref: 'R1', pines: { '1': 'a', '2': '0' } },
    { tipo: 'estado-logico', ref: 'E1', props: { estado: '1' }, pines: { S: 'q' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props, pines: { A: 'a', B: 'suelta', C: '0', D: 'q' } }
  ]

  it('una entrada analógica es 1 MΩ a tierra con su sonda; al aire, nada y sin aviso; en la tierra, nada; en una red digital pura, la sonda digital', () => {
    const d = circuito(partes())
    const r = compilar(d)
    expect(r.errores).toEqual([])
    expect(r.avisos.filter((a) => a.includes('XSC1'))).toEqual([])
    const o = r.instrumentos.osciloscopios.get('p_3')!
    const [a, b, c, dd] = o.canales
    expect(r.netlist!.elements[a.resistencia]).toMatchObject({ type: 'R', ohms: 1e6, b: 0 })
    expect(r.netlist!.sondas![a.sonda!]).toMatchObject({ kind: 'v', p: nodo(d, r, 'p_3', 'A'), n: 0, muestras: 262144 })
    // Una pantalla de 10 ms (1 ms/div por omisión) en 2,048 columnas.
    expect(r.netlist!.sondas![a.sonda!].columna).toBeCloseTo(1e-2 / 2048, 15)
    // Al aire no se arma ni su resistencia ni su sonda: el canal no dibuja una línea de 0 V; en la tierra sí es un 0 V real.
    expect(b).toMatchObject({ sonda: null, alAire: true, resistencia: -1 })
    expect(c).toMatchObject({ sonda: null, alAire: false, digital: false })
    expect(dd.digital).toBe(true)
    expect(r.netlist!.sondas![dd.sonda!]).toMatchObject({ kind: 'd', bajo: 0, alto: 5 })
    // La red del estado lógico sigue digital pura: el osciloscopio no le agrega puentes.
    expect(r.netlist!.elements.some((e) => e.type === 'DAC' || e.type === 'ADC')).toBe(false)
  })

  it('la base de tiempo más rápida acota el paso a 500 por pantalla, solo con algún canal encendido', () => {
    const r = compilar(circuito(partes({ base: '1u' })))
    expect(pasoDeSimulacion(r.netlist!, basesDeTiempo(r))).toBeCloseTo(2e-8, 20)
    const apagado = compilar(circuito(partes({ base: '1u', a_on: 'apagado', b_on: 'apagado' })))
    expect(pasoDeSimulacion(apagado.netlist!, basesDeTiempo(apagado))).toBe(PASO_MAX)
  })

  it('un ajuste del osciloscopio no cambia la netlist (se ajusta la sonda, no el circuito)', () => {
    const antes = compilar(circuito(partes())).netlist!
    const despues = compilar(circuito(partes({ a_vdiv: '2', disp_nivel: '1' }))).netlist!
    expect(cambiosEnCaliente(antes, despues)).toEqual([])
  })

  it('un ajuste fuera de rango impide simular con su nombre (decisión P8)', () => {
    const r = compilar(circuito(partes({ base: '3m' })))
    expect(r.netlist).toBeNull()
    expect(r.errores).toEqual(['La base de tiempo «3m» de XSC1 no es de la serie 1, 2 y 5 de 1 µs a 10 s.'])
  })

  it('tres osciloscopios caben en 16 MiB con los canales a la cuarta parte', () => {
    const tres: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', pines: { '1': 'a', '2': '0' } },
      ...[1, 2, 3].map((k): Parte => ({ tipo: 'osciloscopio', ref: `XSC${k}`, pines: { A: 'a', B: 'a', C: 'a', D: 'a' } }))
    ]
    const r = compilar(circuito(tres))
    const s = r.netlist!.sondas!
    expect(s).toHaveLength(12)
    expect(s.every((x) => x.muestras === 65536)).toBe(true)
    expect(s.reduce((t, x) => t + bytesDeSonda(x.muestras), 0)).toBeLessThanOrEqual(MEMORIA_SONDAS)
  })
})

describe('el generador y la fuente variable en la netlist', () => {
  const generador = (props: Record<string, string> = {}) =>
    circuito([
      { tipo: 'generador', ref: 'XFG1', props, pines: { '+': 's', COM: '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } }
    ])

  it('el generador es su onda con fase continua en serie con 50 Ω', () => {
    const r = compilar(generador())
    const g = r.instrumentos.generadores.get('p_0')!
    expect(r.netlist!.elements[g.fuente]).toMatchObject({ type: 'V', wave: { kind: 'sine', offset: 0, amp: 1, freq: 1000, phase: 0, continua: true } })
    expect(r.netlist!.elements[g.resistencia]).toMatchObject({ type: 'R', ohms: 50 })
    const ideal = compilar(generador({ ideal: 'sí', forma: 'Triangular' }))
    const gi = ideal.instrumentos.generadores.get('p_0')!
    expect(ideal.netlist!.elements[gi.resistencia]).toMatchObject({ ohms: 1e-6 })
    expect(ideal.netlist!.elements[gi.fuente]).toMatchObject({ wave: { kind: 'pulse', rise: 0.0005, fall: 0.0005 } })
  })

  it('cambiar la frecuencia o la forma simulando es un cambio en caliente de la fuente', () => {
    const antes = compilar(generador()).netlist!
    expect(cambiosEnCaliente(antes, compilar(generador({ frecuencia: '2k' })).netlist!)).toHaveLength(1)
    expect(cambiosEnCaliente(antes, compilar(generador({ forma: 'Cuadrada' })).netlist!)).toHaveLength(1)
    expect(cambiosEnCaliente(antes, compilar(generador({ salida: 'apagada' })).netlist!)?.[0].elemento).toMatchObject({ type: 'R', ohms: 1e9 })
  })

  it('la fuente variable es su dispositivo de dos tramos con 100 nF', () => {
    const d = circuito([
      { tipo: 'fuente-variable', ref: 'XPS1', props: { voltaje: '12', limite: '100m' }, pines: { '+': 'v', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '100' }, pines: { '1': 'v', '2': '0' } }
    ])
    const r = compilar(d)
    const f = r.instrumentos.fuentes.get('p_0')!
    expect(r.netlist!.elements[f.elemento]).toEqual({ type: 'PSU', a: nodo(d, r, 'p_0', '+'), b: 0, v: 12, ilim: 0.1, vk: 0.005, encendida: true })
    expect(r.netlist!.elements.find((e) => e.type === 'C')).toMatchObject({ farads: 1e-7 })
    const fuera = compilar(circuito([{ tipo: 'fuente-variable', ref: 'XPS1', props: { voltaje: '40' }, pines: { '+': 'v', '-': '0' } }, { tipo: 'resistencia', ref: 'R1', pines: { '1': 'v', '2': '0' } }]))
    expect(fuera.errores).toEqual(['El voltaje «40» de XPS1 está fuera de rango: de 0 a 30 V.'])
  })
})
