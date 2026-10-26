import type { Tramo } from '../conexiones/corrientes'

/** Puntas de flecha de la corriente animada: cada 5 mm a lo largo del cable, en el sentido convencional de la corriente
 * media. Aquí vive lo que no es WebGL: velocidad por tramo, alternancia, fase acumulada entre lecturas e instancias que
 * sube `capaFlechas.ts`. */

/** Milímetros por unidad de rejilla fina (la rejilla de esquema es de 2.5 mm y la fina de 1.25 mm). */
export const MM_POR_UNIDAD = 1.25
/** Separación de las puntas: 5 mm del dibujo. */
export const SEPARACION_FLECHAS = 5 / MM_POR_UNIDAD
/** Por debajo de esta separación en pantalla las puntas dejan de leerse como flechas y no se dibujan. */
export const SEPARACION_MINIMA_PX = 8
/** Un tramo con menos corriente media no lleva flechas. */
export const CORRIENTE_MINIMA = 1e-6
/** A 1×: 2 mm/s con 1 µA, 4 mm/s más por década y un tope de 30 mm/s. */
export const VELOCIDAD_BASE_MM = 2
export const VELOCIDAD_POR_DECADA_MM = 4
export const VELOCIDAD_MAXIMA_MM = 30
/** Un tramo alterna dentro del intervalo si su media es menor que esta fracción de la media de su valor absoluto. */
export const FRACCION_ALTERNA = 0.25
/** «Velocidad de las flechas» de Configuración › Simulación. */
export const RANGO_FACTOR_FLECHAS: readonly [number, number] = [0.25, 4]

/** Velocidad de las puntas en unidades de rejilla fina por segundo de reloj, con el signo de la corriente: crece con su
 * logaritmo, se multiplica por la velocidad del tiempo si es menor que 1× (por encima se queda como a 1×) y por el factor
 * de Configuración. */
export function velocidadFlecha(i: number, velocidadTiempo: number, factor = 1): number {
  const a = Math.abs(i)
  if (!(a >= CORRIENTE_MINIMA) || !Number.isFinite(a)) return 0
  const mm = Math.min(VELOCIDAD_MAXIMA_MM, VELOCIDAD_BASE_MM + VELOCIDAD_POR_DECADA_MM * Math.log10(a / CORRIENTE_MINIMA))
  return (Math.sign(i) * mm * Math.min(1, velocidadTiempo) * factor) / MM_POR_UNIDAD
}

/** Qué lleva un tramo: nada, flechas que avanzan o puntas dobles quietas (la corriente alterna más rápido de lo que se ve). */
export const SIN_FLECHA = 0
export const FLECHA = 1
export const DOBLE = 2
export type TipoFlecha = typeof SIN_FLECHA | typeof FLECHA | typeof DOBLE

export function tipoDeTramo(media: number, absoluta: number): TipoFlecha {
  if (!(absoluta >= CORRIENTE_MINIMA)) return SIN_FLECHA
  if (Math.abs(media) < FRACCION_ALTERNA * absoluta) return DOBLE
  return Math.abs(media) >= CORRIENTE_MINIMA ? FLECHA : SIN_FLECHA
}

/** Si las flechas se dibujan con este zoom (píxeles CSS por unidad de rejilla fina). */
export const flechasVisibles = (zoom: number): boolean => SEPARACION_FLECHAS * zoom >= SEPARACION_MINIMA_PX

/** Fase de las puntas de cada tramo (0 a la separación, en unidades). Al llegar una lectura se acumula con la velocidad
 * anterior y sigue con la nueva, así una punta nunca salta hacia atrás. Con animaciones en pausa no avanza pero conserva
 * el sentido. */
export class FasesDeFlechas {
  fases: Float64Array
  velocidades: Float64Array
  /** Instante de reloj (ms) de la última lectura. */
  desde = 0
  /** Lo que reutiliza cada lectura (sin reservar memoria): las velocidades nuevas, el tipo de cada tramo y las instancias. */
  nuevas: Float64Array
  tipos: Uint8Array
  datos: Float32Array
  constructor(n: number) {
    this.fases = new Float64Array(n)
    this.velocidades = new Float64Array(n)
    this.nuevas = new Float64Array(n)
    this.tipos = new Uint8Array(n)
    this.datos = new Float32Array(FLOTANTES_FLECHA * n)
  }

  /** La lectura nueva en `ahora` (ms): acumula lo andado con las velocidades de antes y toma las nuevas. */
  actualizar(nuevas: ArrayLike<number>, ahora: number, pausadas: boolean): void {
    const dt = pausadas ? 0 : Math.max(0, (ahora - this.desde) / 1000)
    for (let k = 0; k < this.fases.length; k++) {
      const f = modulo(this.fases[k] + this.velocidades[k] * dt, SEPARACION_FLECHAS)
      // Una velocidad que no es un número no deja la fase rota para siempre.
      this.fases[k] = Number.isFinite(f) ? f : 0
      const v = nuevas[k] ?? 0
      this.velocidades[k] = Number.isFinite(v) ? v : 0
    }
    this.desde = ahora
  }

  /** La fase del tramo `k` en `ahora` (ms), sin acumular. */
  fase(k: number, ahora: number, pausadas: boolean): number {
    const dt = pausadas ? 0 : Math.max(0, (ahora - this.desde) / 1000)
    return modulo(this.fases[k] + this.velocidades[k] * dt, SEPARACION_FLECHAS)
  }
}

const modulo = (x: number, m: number): number => ((x % m) + m) % m

/** Flotantes por instancia de `capaFlechas.ts`: x0, y0, x1, y1, inicio (largo acumulado del cable), fase, velocidad y tipo. */
export const FLOTANTES_FLECHA = 8

/** Instancias de las flechas de esta lectura: una por tramo que lleva algo, con largo acumulado a lo largo de su cable
 * (las puntas siguen continuas entre tramos), fase y velocidad. `fases` se actualiza aquí con las velocidades nuevas. */
export function instanciasDeFlechas(
  tramos: readonly Tramo[],
  media: ArrayLike<number>,
  absoluta: ArrayLike<number>,
  velocidadTiempo: number,
  factor: number,
  fases: FasesDeFlechas,
  ahora: number,
  pausadas: boolean
): { datos: Float32Array; cuenta: number; moviles: number; caja: CajaFlechas | null } {
  // Los arreglos de las fases se reutilizan de lectura en lectura; con otra lista de tramos empiezan de nuevo.
  if (fases.tipos.length !== tramos.length) Object.assign(fases, new FasesDeFlechas(tramos.length))
  const { nuevas: velocidades, tipos, datos } = fases
  for (let k = 0; k < tramos.length; k++) {
    tipos[k] = tipoDeTramo(media[k], absoluta[k])
    velocidades[k] = tipos[k] === FLECHA ? velocidadFlecha(media[k], velocidadTiempo, factor) : 0
  }
  fases.actualizar(velocidades, ahora, pausadas)
  let n = 0, acumulado = 0, moviles = 0
  let caja: CajaFlechas | null = null
  for (let k = 0; k < tramos.length; k++) {
    const t = tramos[k], antes = tramos[k - 1]
    acumulado = antes && antes.cable === t.cable && antes.x1 === t.x0 && antes.y1 === t.y0 ? acumulado + antes.largo : 0
    if (tipos[k] === SIN_FLECHA) continue
    const o = FLOTANTES_FLECHA * n++
    datos[o] = t.x0
    datos[o + 1] = t.y0
    datos[o + 2] = t.x1
    datos[o + 3] = t.y1
    datos[o + 4] = modulo(acumulado, SEPARACION_FLECHAS)
    datos[o + 5] = fases.fases[k]
    datos[o + 6] = fases.velocidades[k]
    datos[o + 7] = tipos[k]
    // Las que avanzan y dónde están: sin ninguna a la vista el lienzo no pide cuadros.
    if (!pausadas && fases.velocidades[k] !== 0) {
      moviles++
      const x0 = Math.min(t.x0, t.x1), x1 = Math.max(t.x0, t.x1), y0 = Math.min(t.y0, t.y1), y1 = Math.max(t.y0, t.y1)
      caja = caja ? { minX: Math.min(caja.minX, x0), minY: Math.min(caja.minY, y0), maxX: Math.max(caja.maxX, x1), maxY: Math.max(caja.maxY, y1) } : { minX: x0, minY: y0, maxX: x1, maxY: y1 }
    }
  }
  return { datos: datos.subarray(0, FLOTANTES_FLECHA * n), cuenta: n, moviles, caja }
}

/** La caja (mundo) de las flechas que avanzan. */
export interface CajaFlechas {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** El texto del globo de un cable con la corriente animada: su corriente media y, si alterna, cómo verla. */
export function globoDeCorriente(media: number, absoluta: number, formatear: (a: number) => string): string | null {
  const tipo = tipoDeTramo(media, absoluta)
  if (tipo === SIN_FLECHA) return null
  if (tipo === DOBLE) return `Corriente alterna, ${formatear(absoluta)} de media en valor absoluto: baja la velocidad para verla cambiar de sentido.`
  return `Corriente media ${formatear(Math.abs(media))}.`
}

/** Las flechas de la corriente de una lectura, como las sube el lienzo (sus fases corren desde `desde`, en ms de reloj). */
export interface FlechasSim {
  datos: Float32Array
  cuenta: number
  /** Las que avanzan y la caja (mundo) donde están: sin ninguna a la vista el lienzo no pide cuadros. */
  moviles: number
  caja: CajaFlechas | null
  desde: number
  /** Las animaciones en pausa: las flechas se quedan quietas y siguen diciendo el sentido. */
  pausadas: boolean
}
