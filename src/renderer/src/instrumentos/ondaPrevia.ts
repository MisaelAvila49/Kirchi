import { formatearValor } from '../valores/valores'
import { extremosDe, periodoDeFrecuencia, type AjustesGenerador, type Forma } from './ajustes'

/** Qué ajustes de la onda usa cada forma además de la amplitud: la ficha solo muestra los que cuentan. */
export type ExtraDeForma = 'simetria' | 'ciclo' | 'retardo' | 'pasos' | 'fase'

const EXTRAS: Readonly<Record<Forma, readonly ExtraDeForma[]>> = {
  Senoidal: ['fase'],
  Cuadrada: ['fase'],
  Triangular: ['simetria', 'fase'],
  'Diente de sierra': ['fase'],
  Pulso: ['ciclo', 'fase'],
  Escalón: ['retardo'],
  Escalera: ['pasos', 'fase']
}
const NOMBRE_EXTRA: Readonly<Record<ExtraDeForma, string>> = { simetria: 'simetría', ciclo: 'ciclo', retardo: 'retardo', pasos: 'pasos', fase: 'fase' }

/** Cómo se llama cada forma en la interfaz: el documento sigue guardando «Diente de sierra»; la gente la busca como «Rampa». */
const NOMBRE_DE_FORMA: Readonly<Partial<Record<Forma, string>>> = { 'Diente de sierra': 'Rampa' }
export const nombreDeForma = (f: Forma): string => NOMBRE_DE_FORMA[f] ?? f

/** Los ajustes propios de la forma, en el orden en que se muestran. */
export const extrasDeForma = (f: Forma): readonly ExtraDeForma[] => EXTRAS[f]
/** El escalón no es periódico: no tiene frecuencia. */
export const usaFrecuencia = (f: Forma): boolean => f !== 'Escalón'
/** «ciclo, fase»: el resumen de lo que esconde «Más ajustes». */
export const resumenExtras = (f: Forma): string => EXTRAS[f].map((e) => NOMBRE_EXTRA[e]).join(', ')

/** Lo que la onda necesita para dibujarse, en unidades normalizadas (un periodo = 1). */
export interface ParametrosOnda {
  forma: Forma
  /** Fracción del periodo, de 0 a 1 (la posición de la cima de la triangular). */
  simetria: number
  /** Fracción del periodo en alto, de 0 a 1. */
  ciclo: number
  /** Grados. */
  desfase: number
  pasos: number
}

/** El valor de la onda normalizada, de −1 a 1, en el instante `t` medido en periodos. */
export function valorOnda(p: ParametrosOnda, t: number): number {
  const ph = (((t + p.desfase / 360) % 1) + 1) % 1
  switch (p.forma) {
    case 'Senoidal':
      return Math.sin(2 * Math.PI * ph)
    case 'Cuadrada':
      return ph < 0.5 ? 1 : -1
    case 'Triangular': {
      const q = p.simetria
      if (q <= 0) return 1 - 2 * ph
      if (q >= 1) return -1 + 2 * ph
      return ph < q ? -1 + (2 * ph) / q : 1 - (2 * (ph - q)) / (1 - q)
    }
    case 'Diente de sierra':
      return -1 + 2 * ph
    case 'Pulso':
      return ph < p.ciclo ? 1 : -1
    case 'Escalón':
      return t < 1 / 3 ? -1 : 1
    case 'Escalera': {
      const n = Math.max(2, Math.round(p.pasos))
      return -1 + (2 * Math.min(n - 1, Math.floor(ph * n))) / (n - 1)
    }
  }
}

const OMISION: Omit<ParametrosOnda, 'forma'> = { simetria: 0.5, ciclo: 0.25, desfase: 0, pasos: 4 }

function recorrer(n: number, punto: (i: number, n: number) => [number, number]): string {
  let d = ''
  for (let i = 0; i <= n; i++) {
    const [x, y] = punto(i, n)
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

/** El trazo de una forma con sus ajustes de omisión, para los iconos de la tira (viewBox 36 × 14). */
export function trazoIcono(forma: Forma): string {
  return recorrer(120, (i, n) => [1 + (34 * i) / n, 7 - valorOnda({ ...OMISION, forma }, i / n) * 6])
}

export interface GeometriaPrevia {
  ancho: number
  alto: number
  /** Margen horizontal y vertical del trazo. */
  mx: number
  my: number
  /** Alto reservado abajo para el eje de tiempo. */
  eje: number
  /** Periodos que caben a lo ancho. */
  periodos: number
}

export const GEOMETRIA_PREVIA: GeometriaPrevia = { ancho: 240, alto: 86, mx: 12, my: 14, eje: 16, periodos: 2 }

/** La vista previa de la onda con sus ajustes: el trazo, el voltaje de los extremos y la altura de 0 V. */
export function vistaPrevia(a: AjustesGenerador, g: GeometriaPrevia = GEOMETRIA_PREVIA): { trazo: string; minimo: number; maximo: number; yCero: number; yMax: number; yMin: number } {
  const { minimo, maximo } = extremosDe(a.vpp, a.desplazamiento)
  const lo = Math.min(minimo, 0)
  const hi = Math.max(maximo, 0)
  const rango = hi - lo || 1
  const y = (v: number) => g.my + ((hi - v) / rango) * (g.alto - 2 * g.my - g.eje)
  const par: ParametrosOnda = { forma: a.forma, simetria: a.simetria, ciclo: a.ciclo, desfase: a.desfase, pasos: a.pasos }
  // El escalón se dibuja en una ventana de un «periodo» con el salto a un tercio; las demás formas, en dos periodos.
  const periodos = a.forma === 'Escalón' ? 1 : g.periodos
  const trazo = recorrer(240, (i, n) => [g.mx + ((g.ancho - 2 * g.mx) * i) / n, y(a.desplazamiento + (valorOnda(par, (periodos * i) / n) * a.vpp) / 2)])
  return { trazo, minimo, maximo, yCero: y(0), yMax: y(maximo), yMin: y(minimo) }
}

/** Una marca del eje de tiempo: su posición en el dibujo y su rótulo en unidades reales. */
export interface MarcaTiempo {
  x: number
  texto: string
}

/** Marcas cada medio periodo a lo ancho de la vista previa («0», «500 µs», «1 ms»…). El escalón no es periódico y no lleva eje. */
export function marcasDeTiempo(a: AjustesGenerador, g: GeometriaPrevia = GEOMETRIA_PREVIA): MarcaTiempo[] {
  if (!usaFrecuencia(a.forma) || !(a.frecuencia > 0)) return []
  const T = periodoDeFrecuencia(a.frecuencia)
  const n = g.periodos * 2
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: g.mx + ((g.ancho - 2 * g.mx) * i) / n,
    texto: i === 0 ? '0' : formatearValor((T * i) / 2, 's'),
  }))
}
