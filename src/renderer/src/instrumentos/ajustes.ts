import { leerAnotaciones, type Anotaciones } from '../../../compartido/grafica/anotaciones'
import { ASPECTO_OSCILOSCOPIO, leerAspecto, type AspectoGrafica, type AspectoTraza } from '../../../compartido/grafica/aspecto'
import type { Pieza } from '../doc/tipos'
import type { Onda } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { formatearValor, leerPosicion, leerValor } from '../valores/valores'
import { esDeSerie } from './serie'

/** Las cuatro entradas del osciloscopio, referidas a tierra. */
export const CANALES = ['A', 'B', 'C', 'D'] as const
export type Canal = (typeof CANALES)[number]
/** El canal de matemáticas, A − B. */
export const MATEMATICO = 'M'
export type CanalOMatematico = Canal | typeof MATEMATICO

/** Voltios por división y base de tiempo: la serie 1, 2 y 5 entre estos extremos. */
export const VDIV_RANGO: readonly [number, number] = [1e-3, 50]
export const BASE_RANGO: readonly [number, number] = [1e-6, 10]
/** Posición vertical de un canal, en divisiones desde el centro; la pantalla mide 8 de alto. */
export const POS_RANGO: readonly [number, number] = [-4, 4]
export const NIVEL_MAX = 1e3
export const DIVISIONES_H = 10
export const DIVISIONES_V = 8
/** La frecuencia de corte del acoplamiento AC (Hz): la de `FRECUENCIA_AC` de engine/src/sonda.rs. */
export const FRECUENCIA_AC = 10

/** Las medidas automáticas y la letra con que se escriben en la propiedad `medidas` («Ap Bf»). */
export const MEDIDAS = ['vpp', 'vmax', 'vmin', 'prom', 'rms', 'f', 'periodo', 'ciclo'] as const
export type IdMedida = (typeof MEDIDAS)[number]
const LETRA_MEDIDA: Readonly<Record<string, IdMedida>> = { p: 'vpp', M: 'vmax', m: 'vmin', v: 'prom', e: 'rms', f: 'f', T: 'periodo', c: 'ciclo' }
export const LETRA_DE_MEDIDA: Readonly<Record<IdMedida, string>> = Object.fromEntries(Object.entries(LETRA_MEDIDA).map(([l, m]) => [m, l])) as Record<IdMedida, string>
/** Hasta cuatro medidas a la vista. */
export const MAX_MEDIDAS_VISTA = 4

export type Acople = 'DC' | 'AC' | 'GND'
/** La pantalla en tiempo (`yt`) o en X-Y: `ba` pone A en horizontal y B en vertical (B/A) y `ab` al revés (A/B). */
export type ModoXY = 'yt' | 'ba' | 'ab'
export const MODOS_XY: Readonly<Record<string, ModoXY>> = { 'Y/T': 'yt', 'B/A': 'ba', 'A/B': 'ab' }
/** `rodante`: sin disparo, el eje muestra el tiempo absoluto de la simulación y la traza corre de forma continua. */
export type ModoDisparo = 'auto' | 'normal' | 'unico' | 'rodante'

export interface AjustesCanal {
  canal: Canal
  on: boolean
  vdiv: number
  pos: number
  acople: Acople
}

export interface MedidaElegida {
  canal: CanalOMatematico
  medida: IdMedida
}

export interface AjustesOsciloscopio {
  canales: AjustesCanal[]
  matematico: boolean
  /** Segundos por división. */
  base: number
  /** El disparo al centro de la pantalla; si no, al 10 % (una división desde la izquierda). */
  disparoCentro: boolean
  disparo: { fuente: Canal; subida: boolean; nivel: number; modo: ModoDisparo }
  medidas: MedidaElegida[]
  ideal: boolean
  /** Ausente es `yt`. */
  modoXY?: ModoXY
}

/** Las propiedades que lee el osciloscopio y de qué clase son (la prueba revisa que el `pieza.json` las traiga). */
export const PROPS_OSCILOSCOPIO: Readonly<Record<string, 'casilla' | 'lista' | 'numero' | 'texto'>> = {
  ...Object.fromEntries(CANALES.flatMap((c) => {
    const k = c.toLowerCase()
    return [[`${k}_on`, 'casilla'], [`${k}_vdiv`, 'numero'], [`${k}_pos`, 'numero'], [`${k}_acople`, 'lista']]
  })),
  mat_on: 'casilla',
  base: 'numero',
  posh: 'lista',
  disp_fuente: 'lista',
  disp_flanco: 'lista',
  disp_nivel: 'numero',
  disp_modo: 'lista',
  modo_xy: 'lista',
  medidas: 'texto',
  ideal: 'casilla',
  aspecto: 'texto'
}

/** Las seis funciones del multímetro. */
export const MODOS_MULTIMETRO = ['V DC', 'V AC', 'A DC', 'A AC', 'Ω', 'Continuidad'] as const
export type ModoMultimetro = (typeof MODOS_MULTIMETRO)[number]
/** Rangos del óhmetro: de 100 Ω a 10 MΩ por décadas, con 1 V de prueba; arriba de 40 MΩ dice OL. */
export const RANGOS_OHM: readonly number[] = [100, 1e3, 1e4, 1e5, 1e6, 1e7]
export const PRUEBA_OHM = 1
export const OL_OHM = 40e6
/** Continuidad: el rango de 100 Ω con «hay paso» por debajo de 50 Ω. */
export const UMBRAL_CONTINUIDAD = 50
export const RANGO_CONTINUIDAD = 100

/** Las cargas de un instrumento de banco y las del ideal: 1 GΩ es el abierto que el motor resuelve. */
export const CARGAS = { voltimetro: 10e6, amperimetro: 0.1, osciloscopio: 1e6, generador: 50, abierto: 1e9, cerrado: 1e-6 } as const
/** El fusible del multímetro: 10 A nominales y fusión a 20 A; su resistencia va en la de cada modo. */
export const FUSIBLE_MULTIMETRO = { inom: 10, ifusion: 20, tau: 0.125 } as const

/** Las formas del generador. */
export const FORMAS = ['Senoidal', 'Cuadrada', 'Triangular', 'Diente de sierra', 'Pulso', 'Escalón', 'Escalera'] as const
export type Forma = (typeof FORMAS)[number]
export const RANGOS_GENERADOR = { frecuencia: [1e-3, 1e6], vpp: [0, 20], pico: 10, desfase: [-360, 360], retardo: [0, 500], pasos: [2, 64] } as const
/** El escalón es un pulso de periodo larguísimo (1,000 s) que se queda arriba el resto de su ciclo. */
export const FRECUENCIA_ESCALON = 1e-3

/** La fuente variable de un canal y su modelo de dos tramos. */
export const RANGOS_FUENTE = { voltaje: [0, 30], limite: [1e-3, 3] } as const
export const VK_FUENTE = 5e-3
export const C_SALIDA_FUENTE = 100e-9

export type Resultado<T> = { ok: true; a: T } | { ok: false; error: string }

/** El texto guardado de una propiedad, o el de omisión. */
const texto = (p: Pieza, def: PiezaDef, id: string): string => p.props[id] ?? def.props.find((d) => d.id === id)?.defecto ?? ''
/** La opción de una lista: la guardada si es una de las opciones; si no, la de omisión. */
function opcion(p: Pieza, def: PiezaDef, id: string): string {
  const d = def.props.find((x) => x.id === id)
  const g = p.props[id]
  return g !== undefined && (!d?.opciones || d.opciones.includes(g)) ? g : (d?.defecto ?? '')
}
/** La casilla está marcada: su opción es la segunda de la lista. */
function marcada(p: Pieza, def: PiezaDef, id: string): boolean {
  const d = def.props.find((x) => x.id === id)
  return !!d?.opciones && opcion(p, def, id) === d.opciones[1]
}

/** Un número de una propiedad: el valor o la oración que dice por qué no se lee («La frecuencia «x» de XFG1 no es válida.»). */
function numero(p: Pieza, def: PiezaDef, id: string, sujeto: string, verbo = 'no es válida'): number | string {
  const t = texto(p, def, id)
  const v = leerValor(t)
  const unidad = def.props.find((d) => d.id === id)?.unidad
  if (!v || !Number.isFinite(v.valor) || (v.unidad && unidad && v.unidad !== unidad)) return `${sujeto} «${t}» de ${p.ref} ${verbo}.`
  return v.valor
}

const fuera = (articulo: string, nombre: string, t: string, ref: string, rango: string) => `${articulo} ${nombre} «${t}» de ${ref} está fuera de rango: ${rango}.`

/** Los ajustes del osciloscopio, o el primer error con el nombre del ajuste. */
export function ajustesOsciloscopio(p: Pieza, def: PiezaDef): Resultado<AjustesOsciloscopio> {
  const canales: AjustesCanal[] = []
  for (const canal of CANALES) {
    const k = canal.toLowerCase()
    const vdiv = numero(p, def, `${k}_vdiv`, `Los voltios por división del canal ${canal}`, 'no son válidos')
    const pos = numero(p, def, `${k}_pos`, `La posición del canal ${canal}`)
    if (typeof vdiv === 'string') return { ok: false, error: vdiv }
    if (typeof pos === 'string') return { ok: false, error: pos }
    if (!(esDeSerie(vdiv) && vdiv >= VDIV_RANGO[0] * (1 - 1e-9) && vdiv <= VDIV_RANGO[1] * (1 + 1e-9)))
      return { ok: false, error: `Los voltios por división «${texto(p, def, `${k}_vdiv`)}» del canal ${canal} de ${p.ref} no son de la serie 1, 2 y 5 de 1 mV a 50 V.` }
    if (!(pos >= POS_RANGO[0] && pos <= POS_RANGO[1]))
      return { ok: false, error: `La posición «${texto(p, def, `${k}_pos`)}» del canal ${canal} de ${p.ref} está fuera de rango: de −4 a 4 divisiones.` }
    canales.push({ canal, on: marcada(p, def, `${k}_on`), vdiv, pos, acople: opcion(p, def, `${k}_acople`) as Acople })
  }
  const base = numero(p, def, 'base', 'La base de tiempo')
  if (typeof base === 'string') return { ok: false, error: base }
  if (!(esDeSerie(base) && base >= BASE_RANGO[0] * (1 - 1e-9) && base <= BASE_RANGO[1] * (1 + 1e-9)))
    return { ok: false, error: `La base de tiempo «${texto(p, def, 'base')}» de ${p.ref} no es de la serie 1, 2 y 5 de 1 µs a 10 s.` }
  const nivel = numero(p, def, 'disp_nivel', 'El nivel de disparo', 'no es válido')
  if (typeof nivel === 'string') return { ok: false, error: nivel }
  if (!(Math.abs(nivel) <= NIVEL_MAX)) return { ok: false, error: fuera('El', 'nivel de disparo', texto(p, def, 'disp_nivel'), p.ref, 'de −1 kV a 1 kV') }
  const modos: Record<string, ModoDisparo> = { Automático: 'auto', Normal: 'normal', Único: 'unico', Rodante: 'rodante' }
  const medidas: MedidaElegida[] = []
  for (const t of texto(p, def, 'medidas').split(/\s+/)) {
    const [c, l] = [t[0], t.slice(1)]
    if (t.length !== 2 || !(CANALES.includes(c as Canal) || c === MATEMATICO) || !Object.hasOwn(LETRA_MEDIDA, l)) continue
    if (medidas.length < MAX_MEDIDAS_VISTA) medidas.push({ canal: c as CanalOMatematico, medida: LETRA_MEDIDA[l] })
  }
  return {
    ok: true,
    a: {
      canales,
      matematico: marcada(p, def, 'mat_on'),
      base,
      disparoCentro: opcion(p, def, 'posh') === 'Centro',
      disparo: { fuente: opcion(p, def, 'disp_fuente') as Canal, subida: opcion(p, def, 'disp_flanco') !== 'Bajada', nivel, modo: modos[opcion(p, def, 'disp_modo')] ?? 'auto' },
      medidas,
      ideal: marcada(p, def, 'ideal'),
      modoXY: MODOS_XY[opcion(p, def, 'modo_xy')] ?? 'yt'
    }
  }
}

/** Aspecto de la pantalla (tema, grosor, rejilla, marcas, eje del tiempo y lado y tono de cada canal). Vive en la
 * propiedad `aspecto` y NO forma parte de `AjustesOsciloscopio`: cambiarlo no toca la simulación. Lo ilegible deja el
 * aspecto aprobado. */
export function aspectoOsciloscopio(p: Pieza, def: PiezaDef): { aspecto: AspectoGrafica; canales: Record<string, AspectoTraza>; notas: Anotaciones } {
  const { aspecto, trazas } = leerAspecto(texto(p, def, 'aspecto'), ASPECTO_OSCILOSCOPIO)
  const canales: Record<string, AspectoTraza> = Object.create(null)
  for (const c of CANALES) if (Object.hasOwn(trazas, c)) canales[c] = trazas[c]
  return { aspecto, canales, notas: leerAnotaciones(texto(p, def, 'notas')) }
}

export interface AjustesMultimetro {
  modo: ModoMultimetro
  ideal: boolean
}

export function ajustesMultimetro(p: Pieza, def: PiezaDef): AjustesMultimetro {
  const m = opcion(p, def, 'modo')
  return { modo: (MODOS_MULTIMETRO as readonly string[]).includes(m) ? (m as ModoMultimetro) : 'V DC', ideal: marcada(p, def, 'ideal') }
}

/** Estructura del multímetro en un modo: un fusible entre «+» y COM con la fuente de prueba en serie (V) y la resistencia
 * de toda la cadena (Ω). Sin nodos internos: tres elementos con dos nodos le costaban 30 % de capacidad a una isla chica.
 * Las seis funciones comparten estructura, así que cambiar de modo es un cambio en caliente. */
export function estructuraMultimetro(modo: ModoMultimetro, ideal: boolean, rangoOhm: number): { prueba: number; ohms: number; sinCarga: boolean } {
  switch (modo) {
    case 'V DC':
    case 'V AC':
      // El voltímetro ideal es solo su sonda: el fusible no estampa nada (`sin_carga`); `ohms` queda para
      // volver a cargar el circuito al desmarcar «Instrumento ideal» sin cambiar de elemento.
      return { prueba: 0, ohms: ideal ? CARGAS.abierto : CARGAS.voltimetro, sinCarga: ideal }
    case 'A DC':
    case 'A AC':
      return { prueba: 0, ohms: ideal ? CARGAS.cerrado : CARGAS.amperimetro, sinCarga: false }
    case 'Ω':
      return { prueba: PRUEBA_OHM, ohms: rangoOhm, sinCarga: false }
    case 'Continuidad':
      return { prueba: PRUEBA_OHM, ohms: RANGO_CONTINUIDAD, sinCarga: false }
  }
}

export interface AjustesGenerador {
  forma: Forma
  frecuencia: number
  /** Voltios pico a pico. */
  vpp: number
  desplazamiento: number
  /** Fracción del periodo en subida de la triangular (0 a 1). */
  simetria: number
  /** Fracción del periodo en alto del pulso (0.01 a 0.99). */
  ciclo: number
  /** Grados que adelanta la onda respecto de su origen. */
  desfase: number
  /** Segundos que tarda el escalón en subir. */
  retardo: number
  /** Niveles de la escalera. */
  pasos: number
  salida: boolean
  ideal: boolean
}

export function ajustesGenerador(p: Pieza, def: PiezaDef): Resultado<AjustesGenerador> {
  const f = numero(p, def, 'frecuencia', 'La frecuencia')
  const vpp = numero(p, def, 'amplitud', 'La amplitud')
  const d = numero(p, def, 'desplazamiento', 'El desplazamiento', 'no es válido')
  const fase = numero(p, def, 'desfase', 'El desfase', 'no es válido')
  const ret = numero(p, def, 'retardo', 'El retardo', 'no es válido')
  const np = numero(p, def, 'pasos', 'Los pasos', 'no son válidos')
  for (const v of [f, vpp, d, fase, ret, np]) if (typeof v === 'string') return { ok: false, error: v }
  const [frecuencia, amplitud, desplazamiento, desfase, retardo, pasos] = [f, vpp, d, fase, ret, np] as number[]
  const [fmin, fmax] = RANGOS_GENERADOR.frecuencia
  if (!(frecuencia >= fmin && frecuencia <= fmax)) return { ok: false, error: fuera('La', 'frecuencia', texto(p, def, 'frecuencia'), p.ref, 'de 1 mHz a 1 MHz') }
  if (!(desfase >= RANGOS_GENERADOR.desfase[0] && desfase <= RANGOS_GENERADOR.desfase[1])) return { ok: false, error: fuera('El', 'desfase', texto(p, def, 'desfase'), p.ref, 'de −360 a 360 grados') }
  if (!(retardo >= RANGOS_GENERADOR.retardo[0] && retardo <= RANGOS_GENERADOR.retardo[1])) return { ok: false, error: fuera('El', 'retardo', texto(p, def, 'retardo'), p.ref, 'de 0 a 500 s') }
  if (!(Number.isInteger(pasos) && pasos >= RANGOS_GENERADOR.pasos[0] && pasos <= RANGOS_GENERADOR.pasos[1])) return { ok: false, error: fuera('Los', 'pasos', texto(p, def, 'pasos'), p.ref, 'un entero de 2 a 64') }
  if (!(amplitud >= 0 && amplitud <= RANGOS_GENERADOR.vpp[1])) return { ok: false, error: fuera('La', 'amplitud', texto(p, def, 'amplitud'), p.ref, 'de 0 a 20 Vpp') }
  if (!(Math.abs(desplazamiento) + amplitud / 2 <= RANGOS_GENERADOR.pico * (1 + 1e-12)))
    return { ok: false, error: `El desplazamiento «${texto(p, def, 'desplazamiento')}» de ${p.ref} con su amplitud pasa de 10 V: el desplazamiento más la mitad de la amplitud debe ser 10 V o menos.` }
  return {
    ok: true,
    a: {
      forma: (FORMAS as readonly string[]).includes(opcion(p, def, 'forma')) ? (opcion(p, def, 'forma') as Forma) : 'Senoidal',
      frecuencia,
      vpp: amplitud,
      desplazamiento,
      simetria: leerPosicion(opcion(p, def, 'simetria')) ?? 0.5,
      ciclo: leerPosicion(opcion(p, def, 'ciclo')) ?? 0.25,
      desfase,
      retardo,
      pasos,
      salida: marcada(p, def, 'salida'),
      ideal: marcada(p, def, 'ideal')
    }
  }
}

/** La fracción del ciclo que corresponde a un desfase en grados (0 a 1, sin el 1). */
export const faseDeDesfase = (grados: number): number => (((grados / 360) % 1) + 1) % 1

/** La onda del motor de cada forma: la senoidal, la escalera o el pulso de SPICE, siempre con fase continua. */
export function ondaDelGenerador(a: AjustesGenerador): Onda {
  const { frecuencia: freq, vpp, desplazamiento: d } = a
  const [low, high] = [d - vpp / 2, d + vpp / 2]
  const phase = faseDeDesfase(a.desfase)
  switch (a.forma) {
    case 'Senoidal':
      return { kind: 'sine', offset: d, amp: vpp / 2, freq, phase, continua: true }
    case 'Cuadrada':
      return { kind: 'pulse', low, high, freq, rise: 0, fall: 0, width: 0.5 / freq, phase, continua: true }
    case 'Pulso':
      return { kind: 'pulse', low, high, freq, rise: 0, fall: 0, width: a.ciclo / freq, phase, continua: true }
    case 'Triangular':
      return { kind: 'pulse', low, high, freq, rise: a.simetria / freq, fall: (1 - a.simetria) / freq, width: 0, phase, continua: true }
    case 'Diente de sierra':
      return { kind: 'pulse', low, high, freq, rise: 1 / freq, fall: 0, width: 0, phase, continua: true }
    case 'Escalera':
      return { kind: 'stair', low, high, freq, steps: a.pasos, phase, continua: true }
    case 'Escalón': {
      // Bajo hasta `retardo` y arriba el resto de su ciclo de 1,000 s: el pulso arranca en el último tramo bajo de su ciclo.
      const per = 1 / FRECUENCIA_ESCALON
      return { kind: 'pulse', low, high, freq: FRECUENCIA_ESCALON, rise: 0, fall: 0, width: per - a.retardo, phase: a.retardo > 0 ? 1 - a.retardo / per : 0, continua: true }
    }
  }
}

/** El periodo de una frecuencia (s) y la frecuencia de un periodo (Hz): se calculan uno del otro (B11). */
export const periodoDeFrecuencia = (frecuencia: number): number => 1 / frecuencia

/** Amplitud pico a pico y desplazamiento que dan un mínimo y un máximo (B11). */
export const desdeExtremos = (minimo: number, maximo: number): { vpp: number; desplazamiento: number } => ({ vpp: maximo - minimo, desplazamiento: (maximo + minimo) / 2 })

/** El mínimo y el máximo de una amplitud y un desplazamiento. */
export const extremosDe = (vpp: number, desplazamiento: number): { minimo: number; maximo: number } => ({ minimo: desplazamiento - vpp / 2, maximo: desplazamiento + vpp / 2 })

/** La resistencia de salida del generador: 50 Ω de banco, 1 µΩ ideal y 1 GΩ con la salida apagada. */
export function resistenciaGenerador(a: AjustesGenerador): number {
  return !a.salida ? CARGAS.abierto : a.ideal ? CARGAS.cerrado : CARGAS.generador
}

export interface AjustesFuente {
  voltaje: number
  limite: number
  salida: boolean
}

export function ajustesFuente(p: Pieza, def: PiezaDef): Resultado<AjustesFuente> {
  const v = numero(p, def, 'voltaje', 'El voltaje', 'no es válido')
  const l = numero(p, def, 'limite', 'El límite de corriente', 'no es válido')
  if (typeof v === 'string') return { ok: false, error: v }
  if (typeof l === 'string') return { ok: false, error: l }
  if (!(v >= RANGOS_FUENTE.voltaje[0] && v <= RANGOS_FUENTE.voltaje[1])) return { ok: false, error: fuera('El', 'voltaje', texto(p, def, 'voltaje'), p.ref, 'de 0 a 30 V') }
  if (!(l >= RANGOS_FUENTE.limite[0] && l <= RANGOS_FUENTE.limite[1])) return { ok: false, error: fuera('El', 'límite de corriente', texto(p, def, 'limite'), p.ref, 'de 1 mA a 3 A') }
  return { ok: true, a: { voltaje: v, limite: l, salida: marcada(p, def, 'salida') } }
}

/** «1 mV», «10 s»: un extremo de un rango para los mensajes. */
export const textoExtremo = (v: number, unidad: string): string => formatearValor(v, unidad)
