import type { EstadoMultimetro } from '../sim/protocoloInstrumentos'
import { formatearMedida } from '../valores/valores'
import { OL_OHM, PRUEBA_OHM, RANGO_CONTINUIDAD, RANGOS_OHM, UMBRAL_CONTINUIDAD, type ModoMultimetro } from './ajustes'
import { tiempoValido } from './medidas'

/** Lecturas por segundo de reloj y cifras significativas del multímetro. */
export const LECTURAS_POR_SEGUNDO = 4
export const CIFRAS_MULTIMETRO = 4
export const MS_LECTURA = 1000 / LECTURAS_POR_SEGUNDO
/** El óhmetro cambia de rango si el voltaje sale de este intervalo de la prueba. */
export const RANGO_BAJO = 0.09
export const RANGO_ALTO = 0.91

export interface LecturaMultimetro {
  valor: number
  frecuencia: number
  estado: EstadoMultimetro
  /** El tiempo simulado que se midió (s). */
  ventana: number
  periodos: number
}

/** Las cifras de `Ventana::cifras` con nombre (`tv`: el tiempo medido sin X ni Z). */
function ventana(w: ArrayLike<number>) {
  return { desde: w[0], hasta: w[1], iv: w[2], iv2: w[3], periodos: w[6], p0: w[7], p1: w[8], ivP: w[9], iv2P: w[10], tv: tiempoValido(w) }
}
type V = ReturnType<typeof ventana>

/** El promedio: sobre los periodos completos si los hay (una señal que conmuta no mueve la última cifra). */
function promedio(w: V): number {
  return w.periodos >= 1 ? w.ivP / (w.p1 - w.p0) : w.iv / w.tv
}

/** El valor eficaz de la componente alterna y la frecuencia, sobre los periodos completos si los hay. */
function eficazAlterna(w: V): { valor: number; frecuencia: number } {
  if (w.periodos >= 1) {
    const t = w.p1 - w.p0
    const m = w.ivP / t
    return { valor: Math.sqrt(Math.max(0, w.iv2P / t - m * m)), frecuencia: w.periodos / t }
  }
  const d = w.tv
  const m = w.iv / d
  return { valor: Math.sqrt(Math.max(0, w.iv2 / d - m * m)), frecuencia: Number.NaN }
}

/** El valor eficaz de la componente alterna (y la frecuencia) de la ventana de una sonda, como lo lee el multímetro en V AC y A AC. */
export const eficazDeVentana = (cifras: ArrayLike<number>): { valor: number; frecuencia: number } => eficazAlterna(ventana(cifras))

/** Lectura de un multímetro en un intervalo con las ventanas del motor de su sonda de voltaje (`wv`) y de corriente (`wi`)
 * y el rango vigente del óhmetro. */
export function lecturaMultimetro(modo: ModoMultimetro, wv: ArrayLike<number>, wi: ArrayLike<number>, rangoOhm: number): LecturaMultimetro {
  const v = ventana(wv)
  const i = ventana(wi)
  const d = v.hasta - v.desde
  const base = { frecuencia: Number.NaN, ventana: d, periodos: v.periodos }
  if (!(d > 0)) return { valor: Number.NaN, frecuencia: Number.NaN, estado: 'sin-medida', ventana: 0, periodos: 0 }
  switch (modo) {
    case 'V DC':
      return { ...base, valor: promedio(v), estado: 'ok' }
    case 'A DC':
      return { ...base, valor: promedio(i), estado: 'ok', periodos: i.periodos }
    case 'V AC':
      return { ...base, ...eficazAlterna(v), estado: 'ok' }
    case 'A AC':
      return { ...base, ...eficazAlterna(i), estado: 'ok', periodos: i.periodos }
    case 'Ω':
    case 'Continuidad': {
      const r = modo === 'Ω' ? rangoOhm : RANGO_CONTINUIDAD
      return { ...base, ...ohmsDeVoltaje(promedio(v), r) }
    }
  }
}

/** La resistencia que dice el voltaje `u` de la prueba de 1 V a través de la resistencia del rango `r` (divisor de voltaje). */
export function ohmsDeVoltaje(u: number, r: number): { valor: number; estado: EstadoMultimetro } {
  if (u < -1e-3 * PRUEBA_OHM || u > PRUEBA_OHM * (1 + 1e-3)) return { valor: Number.NaN, estado: 'voltaje' }
  const x = u >= PRUEBA_OHM ? Number.POSITIVE_INFINITY : (r * u) / (PRUEBA_OHM - u)
  if (!(x <= OL_OHM)) return { valor: Number.POSITIVE_INFINITY, estado: 'OL' }
  return { valor: Math.max(0, x), estado: 'ok' }
}

/** El rango siguiente del óhmetro: una década arriba o abajo si el voltaje sale de 9 % a 91 % de la prueba. */
export function rangoSiguiente(rango: number, wv: ArrayLike<number>): number {
  const w = ventana(wv)
  if (!(w.hasta > w.desde)) return rango
  return rangoParaVoltaje(rango, promedio(w))
}

/** Lo mismo con el voltaje `uV` ya promediado de la prueba. */
export function rangoParaVoltaje(rango: number, uV: number): number {
  const u = uV / PRUEBA_OHM
  const k = RANGOS_OHM.indexOf(rango)
  if (k < 0) return RANGOS_OHM[2]
  if (u > RANGO_ALTO && k < RANGOS_OHM.length - 1) return RANGOS_OHM[k + 1]
  if (u < RANGO_BAJO && u >= 0 && k > 0) return RANGOS_OHM[k - 1]
  return rango
}

const UNIDAD: Readonly<Record<ModoMultimetro, string>> = { 'V DC': 'V', 'V AC': 'V', 'A DC': 'A', 'A AC': 'A', Ω: 'Ω', Continuidad: 'Ω' }

/** La cifra del multímetro en palabras: cuatro significativas con su unidad, OL, «hay paso» o el aviso de voltaje. */
export function textoMultimetro(modo: ModoMultimetro, l: LecturaMultimetro): string {
  switch (l.estado) {
    case 'sin-medida':
      return 'sin lectura'
    case 'sin-conectar':
      return 'sin conectar'
    case 'OL':
      return 'OL'
    case 'voltaje':
      return `Apaga las fuentes para medir ${modo === 'Continuidad' ? 'continuidad' : 'resistencia'}`
  }
  const cifra = formatearMedida(l.valor, UNIDAD[modo], CIFRAS_MULTIMETRO)
  return modo === 'Continuidad' && l.valor < UMBRAL_CONTINUIDAD ? `${cifra} · hay paso` : cifra
}
