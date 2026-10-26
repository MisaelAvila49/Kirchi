// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import {
  ajustesFuente, ajustesGenerador, ajustesMultimetro, ajustesOsciloscopio, CARGAS, estructuraMultimetro, FUSIBLE_MULTIMETRO,
  ondaDelGenerador, desdeExtremos, extremosDe, periodoDeFrecuencia, PROPS_OSCILOSCOPIO, aspectoOsciloscopio, resistenciaGenerador, RANGOS_OHM
} from './ajustes'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, ref: string, props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo, ref, x: 0, y: 0, rot: 0, espejo: false, props })
const osc = (props: Record<string, string> = {}) => ajustesOsciloscopio(pieza('osciloscopio', 'XSC1', props), lib.get('osciloscopio')!)
const gen = (props: Record<string, string> = {}) => ajustesGenerador(pieza('generador', 'XFG1', props), lib.get('generador')!)

describe('aspecto del osciloscopio', () => {
  const asp = (props: Record<string, string> = {}) => aspectoOsciloscopio(pieza('osciloscopio', 'XSC1', props), lib.get('osciloscopio')!)
  it('por omisión es la pantalla A1 aprobada: eje del tiempo arriba, sin rayitas, rejilla y 1.5 px', () => {
    const r = asp()
    expect(r.aspecto).toEqual({ tema: 'app', grosor: 1.5, rejilla: true, marcas: true, ejeX: 'arriba', textoTono: null, textoPeso: 'normal', textoTam: null, rejillaEstilo: 'lineas', lectura: true, prefijoX: null })
    expect(r.canales).toEqual({})
  })
  it('lee el texto de la propiedad y solo guarda canales de A a D', () => {
    const r = asp({ aspecto: 'tema=oscuro tiempo=abajo A=derecha/negro B=centro Z=derecha' })
    expect(r.aspecto).toMatchObject({ tema: 'oscuro', ejeX: 'abajo' })
    expect(r.canales).toEqual({ A: { lado: 'derecha', color: 'negro' }, B: { lado: 'centro', color: null } })
  })
  it('lee el estilo nuevo: texto, peso, rejilla, lectura, unidad del tiempo y grosor y unidad de un canal (N8b)', () => {
    const r = asp({ aspecto: 'texto=negro peso=negrita estilo=guiones lectura=no ux=u A=derecha A.grosor=3 A.unidad=m' })
    expect(r.aspecto).toMatchObject({ textoTono: 'negro', textoPeso: 'negrita', rejillaEstilo: 'guiones', lectura: false, prefijoX: 'u' })
    expect(r.canales.A).toEqual({ lado: 'derecha', color: null, grosor: 3, prefijo: 'm' })
  })
  it('no es parte de los ajustes que van a la simulación', () => {
    const r = osc({ aspecto: 'tema=oscuro A=derecha' })
    expect(r.ok && 'aspecto' in r.a).toBe(false)
  })
})

describe('ajustes del osciloscopio', () => {
  it('el pieza.json trae cada propiedad que lee el osciloscopio, de la clase que espera', () => {
    const def = lib.get('osciloscopio')!
    for (const [id, clase] of Object.entries(PROPS_OSCILOSCOPIO)) {
      const p = def.props.find((x) => x.id === id)
      expect(p, id).toBeDefined()
      if (clase === 'casilla') expect(p!.casilla, id).toBe(true)
      else if (clase === 'lista') expect(p!.opciones, id).toBeDefined()
      else if (clase === 'texto') expect(p!.texto, id).toBe(true)
      else expect(p!.opciones ?? p!.texto, id).toBeUndefined()
    }
  })

  it('el modo Rodante se lee de la propiedad y está entre las opciones de la pieza', () => {
    const r = osc({ disp_modo: 'Rodante' })
    expect(r.ok && r.a.disparo.modo).toBe('rodante')
    expect(lib.get('osciloscopio')!.props.find((x) => x.id === 'disp_modo')!.opciones).toContain('Rodante')
  })

  it('por omisión: A y B encendidos a 1 V/div, 1 ms/div, disparo en A de subida a 0 V, Rodante y al 10 %', () => {
    const r = osc()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.a.canales.map((c) => [c.canal, c.on, c.vdiv, c.pos, c.acople])).toEqual([
      ['A', true, 1, 0, 'DC'], ['B', true, 1, 0, 'DC'], ['C', false, 1, 0, 'DC'], ['D', false, 1, 0, 'DC']
    ])
    expect(r.a).toMatchObject({ base: 1e-3, matematico: false, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'rodante' }, ideal: false })
    expect(r.a.medidas).toEqual([{ canal: 'A', medida: 'vpp' }, { canal: 'A', medida: 'f' }])
  })

  it('rechaza lo que un archivo manipulado traería, con el nombre del ajuste', () => {
    expect(osc({ a_vdiv: '3' })).toEqual({ ok: false, error: 'Los voltios por división «3» del canal A de XSC1 no son de la serie 1, 2 y 5 de 1 mV a 50 V.' })
    expect(osc({ base: '3m' })).toEqual({ ok: false, error: 'La base de tiempo «3m» de XSC1 no es de la serie 1, 2 y 5 de 1 µs a 10 s.' })
    expect(osc({ base: '100' })).toMatchObject({ ok: false })
    expect(osc({ b_pos: '9' })).toEqual({ ok: false, error: 'La posición «9» del canal B de XSC1 está fuera de rango: de −4 a 4 divisiones.' })
    expect(osc({ disp_nivel: '5k' })).toEqual({ ok: false, error: 'El nivel de disparo «5k» de XSC1 está fuera de rango: de −1 kV a 1 kV.' })
    // Una opción que no es de la lista es la de omisión, como en cualquier pieza.
    const raro = osc({ a_acople: 'RF' })
    expect(raro.ok && raro.a.canales[0].acople).toBe('DC')
  })

  it('las medidas a la vista: hasta cuatro, con letras de canal y de medida; lo que no se lee se ignora', () => {
    const r = osc({ medidas: 'Ap Bf Ce Dc Mv Ax' })
    expect(r.ok && r.a.medidas).toEqual([
      { canal: 'A', medida: 'vpp' }, { canal: 'B', medida: 'f' }, { canal: 'C', medida: 'rms' }, { canal: 'D', medida: 'ciclo' }
    ])
  })
})

describe('ajustes del multímetro', () => {
  it('la estructura de cada modo: la fuente de prueba en serie y la resistencia de toda la cadena (preguntas 70 y 71, decisión P3)', () => {
    expect(estructuraMultimetro('V DC', false, 1e3)).toEqual({ prueba: 0, ohms: CARGAS.voltimetro, sinCarga: false })
    expect(estructuraMultimetro('A AC', false, 1e3)).toEqual({ prueba: 0, ohms: CARGAS.amperimetro, sinCarga: false })
    expect(estructuraMultimetro('Ω', false, 1e4)).toEqual({ prueba: 1, ohms: 1e4, sinCarga: false })
    expect(estructuraMultimetro('Continuidad', false, 1e6)).toEqual({ prueba: 1, ohms: 100, sinCarga: false })
    // El voltímetro ideal es solo su sonda: el elemento no estampa nada.
    expect(estructuraMultimetro('V AC', true, 1e3)).toEqual({ prueba: 0, ohms: CARGAS.abierto, sinCarga: true })
    expect(estructuraMultimetro('A DC', true, 1e3)).toEqual({ prueba: 0, ohms: CARGAS.cerrado, sinCarga: false })
    expect(FUSIBLE_MULTIMETRO).toEqual({ inom: 10, ifusion: 20, tau: 0.125 })
    expect(RANGOS_OHM).toEqual([100, 1e3, 1e4, 1e5, 1e6, 1e7])
  })

  it('lee el modo y la casilla; un modo que no es de la lista es el de omisión', () => {
    const def = lib.get('multimetro')!
    expect(ajustesMultimetro(pieza('multimetro', 'XMM1', { modo: 'A DC', ideal: 'sí' }), def)).toEqual({ modo: 'A DC', ideal: true })
    expect(ajustesMultimetro(pieza('multimetro', 'XMM1', { modo: 'kΩ' }), def)).toEqual({ modo: 'V DC', ideal: false })
  })
})

describe('ajustes del generador', () => {
  it('por omisión: senoidal de 1 kHz, 2 Vpp sin desplazamiento, con la salida encendida y 50 Ω', () => {
    const r = gen()
    expect(r).toEqual({ ok: true, a: { forma: 'Senoidal', frecuencia: 1000, vpp: 2, desplazamiento: 0, simetria: 0.5, ciclo: 0.25, desfase: 0, retardo: 0, pasos: 4, salida: true, ideal: false } })
    if (r.ok) {
      expect(ondaDelGenerador(r.a)).toEqual({ kind: 'sine', offset: 0, amp: 1, freq: 1000, phase: 0, continua: true })
      expect(resistenciaGenerador(r.a)).toBe(50)
    }
  })

  it('cada forma es su onda de SPICE con fase continua; la amplitud es de pico a pico', () => {
    const onda = (props: Record<string, string>) => {
      const r = gen(props)
      if (!r.ok) throw new Error(r.error)
      return ondaDelGenerador(r.a)
    }
    expect(onda({ forma: 'Cuadrada', amplitud: '4', desplazamiento: '1' })).toEqual({ kind: 'pulse', low: -1, high: 3, freq: 1000, rise: 0, fall: 0, width: 0.0005, phase: 0, continua: true })
    expect(onda({ forma: 'Pulso', ciclo: '10 %' })).toMatchObject({ kind: 'pulse', width: 0.0001 })
    expect(onda({ forma: 'Triangular' })).toMatchObject({ kind: 'pulse', rise: 0.0005, fall: 0.0005, width: 0 })
    expect(onda({ forma: 'Triangular', simetria: '100 %' })).toMatchObject({ rise: 0.001, fall: 0 })
    expect(onda({ forma: 'Triangular', simetria: '0 %' })).toMatchObject({ rise: 0, fall: 0.001 })
  })

  it('un generador guardado con los campos de antes se abre igual: sin desfase, retardo ni pasos', () => {
    const viejo = { forma: 'Pulso', frecuencia: '2k', amplitud: '4', desplazamiento: '1', simetria: '50 %', ciclo: '10 %', salida: 'encendida', ideal: 'no' }
    const r = gen(viejo)
    expect(r.ok && ondaDelGenerador(r.a)).toEqual({ kind: 'pulse', low: -1, high: 3, freq: 2000, rise: 0, fall: 0, width: 0.1 / 2000, phase: 0, continua: true })
    const s = gen({ ...viejo, forma: 'Senoidal' })
    expect(s.ok && ondaDelGenerador(s.a)).toEqual({ kind: 'sine', offset: 1, amp: 2, freq: 2000, phase: 0, continua: true })
  })

  it('el diente de sierra sube todo el periodo y cae de golpe', () => {
    const r = gen({ forma: 'Diente de sierra', amplitud: '4', desplazamiento: '1' })
    expect(r.ok && ondaDelGenerador(r.a)).toEqual({ kind: 'pulse', low: -1, high: 3, freq: 1000, rise: 0.001, fall: 0, width: 0, phase: 0, continua: true })
  })

  it('la escalera lleva sus pasos y el escalón su retardo (arranca bajo y sube a los 2 ms)', () => {
    const e = gen({ forma: 'Escalera', pasos: '8', amplitud: '7' })
    expect(e.ok && ondaDelGenerador(e.a)).toEqual({ kind: 'stair', low: -3.5, high: 3.5, freq: 1000, steps: 8, phase: 0, continua: true })
    const c = gen({ forma: 'Escalón', retardo: '2m', amplitud: '2' })
    expect(c.ok && ondaDelGenerador(c.a)).toMatchObject({ kind: 'pulse', low: -1, high: 1, freq: 1e-3, rise: 0, fall: 0, width: 1000 - 0.002 })
    const sin = gen({ forma: 'Escalón', amplitud: '2' })
    expect(sin.ok && ondaDelGenerador(sin.a)).toMatchObject({ width: 1000, phase: 0 })
  })

  it('el desfase en grados es la fracción del ciclo en t = 0', () => {
    const w = (desfase: string, forma = 'Senoidal') => {
      const r = gen({ forma, desfase })
      return r.ok ? ondaDelGenerador(r.a) : null
    }
    expect(w('90')).toMatchObject({ phase: 0.25 })
    expect(w('-90')).toMatchObject({ phase: 0.75 })
    expect(w('360')).toMatchObject({ phase: 0 })
    expect(w('180', 'Cuadrada')).toMatchObject({ phase: 0.5 })
    expect(gen({ desfase: '400' })).toEqual({ ok: false, error: 'El desfase «400» de XFG1 está fuera de rango: de −360 a 360 grados.' })
    expect(gen({ forma: 'Escalera', pasos: '1' })).toMatchObject({ ok: false })
    expect(gen({ forma: 'Escalera', pasos: '2.5' })).toMatchObject({ ok: false })
  })

  it('frecuencia y periodo se calculan uno del otro, y el mínimo y el máximo de la amplitud y el desplazamiento', () => {
    expect(periodoDeFrecuencia(250)).toBe(0.004)
    expect(desdeExtremos(-1, 3)).toEqual({ vpp: 4, desplazamiento: 1 })
    expect(extremosDe(4, 1)).toEqual({ minimo: -1, maximo: 3 })
  })

  it('la salida apagada es 1 GΩ y la ideal 1 µΩ', () => {
    const apagada = gen({ salida: 'apagada' })
    const ideal = gen({ ideal: 'sí' })
    expect(apagada.ok && resistenciaGenerador(apagada.a)).toBe(1e9)
    expect(ideal.ok && resistenciaGenerador(ideal.a)).toBe(1e-6)
  })

  it('rechaza lo que un generador de banco no da', () => {
    expect(gen({ frecuencia: '2M' })).toEqual({ ok: false, error: 'La frecuencia «2M» de XFG1 está fuera de rango: de 1 mHz a 1 MHz.' })
    expect(gen({ amplitud: '30' })).toEqual({ ok: false, error: 'La amplitud «30» de XFG1 está fuera de rango: de 0 a 20 Vpp.' })
    expect(gen({ amplitud: '10', desplazamiento: '6' })).toEqual({ ok: false, error: 'El desplazamiento «6» de XFG1 con su amplitud pasa de 10 V: el desplazamiento más la mitad de la amplitud debe ser 10 V o menos.' })
    expect(gen({ frecuencia: 'mucho' })).toEqual({ ok: false, error: 'La frecuencia «mucho» de XFG1 no es válida.' })
  })
})

describe('ajustes de la fuente variable', () => {
  const fuente = (props: Record<string, string> = {}) => ajustesFuente(pieza('fuente-variable', 'XPS1', props), lib.get('fuente-variable')!)
  it('por omisión: 5 V con 100 mA de límite y la salida encendida', () => {
    expect(fuente()).toEqual({ ok: true, a: { voltaje: 5, limite: 0.1, salida: true } })
  })
  it('rechaza lo que una fuente de un canal no da', () => {
    expect(fuente({ voltaje: '40' })).toEqual({ ok: false, error: 'El voltaje «40» de XPS1 está fuera de rango: de 0 a 30 V.' })
    expect(fuente({ limite: '5' })).toEqual({ ok: false, error: 'El límite de corriente «5» de XPS1 está fuera de rango: de 1 mA a 3 A.' })
  })
})

describe('el modo de pantalla del osciloscopio', () => {
  it('por omisión es Y/T, y B/A y A/B se leen de la propiedad modo_xy', () => {
    const modo = (props: Record<string, string> = {}) => {
      const r = osc(props)
      if (!r.ok) throw new Error(r.error)
      return r.a.modoXY
    }
    expect(modo()).toBe('yt')
    expect(modo({ modo_xy: 'B/A' })).toBe('ba')
    expect(modo({ modo_xy: 'A/B' })).toBe('ab')
    expect(modo({ modo_xy: 'otro' })).toBe('yt')
  })
})
