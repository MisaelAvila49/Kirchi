import { CIFRAS_COLUMNA, type EstadoDisparo } from '../sim/protocoloInstrumentos'
import { DIVISIONES_H, type AjustesOsciloscopio } from './ajustes'

/** Desde esta base de tiempo (s/div) el barrido es de rodillo a 1×. */
export const RODILLO_DESDE = 0.05
/** Barrido de rodillo cuando una pantalla tarda 0.5 s de reloj o más con la velocidad vigente (a 1× es `RODILLO_DESDE`);
 * nunca con «sin límite» o en un avance (velocidad infinita). */
export const RODILLO_RELOJ_S = 0.5
export const esRodillo = (base: number, velocidad: number): boolean => velocidad > 0 && Number.isFinite(velocidad) && (DIVISIONES_H * base) / velocidad >= RODILLO_RELOJ_S - 1e-12
/** En Automático, sin disparo en este número de pantallas de tiempo simulado, se barre libre. */
export const PANTALLAS_SIN_DISPARO = 2
/** Histéresis del estado del disparo: nunca «libre» antes de este tiempo simulado sin disparo. Con bases muy cortas dos
 * pantallas son microsegundos y una señal de 40 Hz pasaba a «libre» entre disparos, alternando estado y eje sin parar. */
export const ESPERA_AUTO_MINIMA = 0.1
/** Cuánto sin disparo en Automático antes de barrer libre: dos pantallas, pero no menos de `ESPERA_AUTO_MINIMA`. */
export const esperaAuto = (span: number): number => Math.max(PANTALLAS_SIN_DISPARO * span, ESPERA_AUTO_MINIMA)
/** El disparo se arma al alejarse esta fracción de división del nivel3). */
export const HISTERESIS_DISPARO_DIV = 0.1
/** Columnas de la rejilla de una sonda por pantalla (dos pantallas en 4,096. */
const COLUMNAS_POR_PANTALLA = 2048

/** Lo que el barrido necesita saber de las sondas. */
export interface FuenteBarrido {
  /** Hasta dónde hay datos de los canales encendidos (el mínimo de sus islas). */
  hasta: number
  /** El último disparo de la sonda de disparo que no pasa de `tMax`; NaN si no hay. */
  disparo(tMax: number): number
}

export interface PantallaBarrido {
  t0: number
  tDisparo: number
  estado: EstadoDisparo
  /** La pantalla mide diez divisiones. */
  span: number
  /** Tras cambiar una escala: lo anterior a este instante no se dibuja (la traza nueva entra desde la derecha). Sin el campo, todo. */
  desde?: number
}

/** La bandera de columna vacía (`Columna::VACIA` de `engine/src/sonda.rs`) en la cifra de bandera de cada columna. */
const BANDERA_VACIA = 8

/** Vacía las columnas de `canal` (`n` columnas de `dt` desde `t0`, formato de cinco cifras de la memoria compartida)
 * anteriores a `desde`: lo previo a un cambio de escala no se dibuja. Devuelve cuántas vació. */
export function vaciarAntesDe(columnas: Float32Array, canal: number, n: number, t0: number, dt: number, desde: number): number {
  if (!Number.isFinite(desde) || !(dt > 0)) return 0
  // La primera columna que ya no es anterior: la que contiene a `desde` se queda (su parte vieja es menor que una columna).
  const primera = Math.min(n, Math.max(0, Math.floor((desde - t0) / dt + 1e-9)))
  let o = canal * n * CIFRAS_COLUMNA
  for (let i = 0; i < primera; i++, o += CIFRAS_COLUMNA) {
    columnas[o] = 0
    columnas[o + 1] = 0
    columnas[o + 2] = 0
    columnas[o + 3] = 0
    columnas[o + 4] = BANDERA_VACIA
  }
  return primera
}

export class Barrido {
  private a: AjustesOsciloscopio
  private ultimoDisparo = Number.NEGATIVE_INFINITY
  private ultimoVisto = 0
  /** Dónde termina el barrido del último disparo (tc + lo que va después): el siguiente disparo solo vale pasado este instante. */
  private barridoHasta = Number.NEGATIVE_INFINITY
  private fin = Number.NEGATIVE_INFINITY
  private congelado = false
  private actual: PantallaBarrido | null = null
  /** Desde dónde espera un disparo en Normal (NaN: aún no se ha visto ninguna llamada); sirve para el aviso «Sin disparo». */
  private esperaDesde = Number.NaN
  /** Se cambió una escala: la próxima pantalla fija desde dónde cuenta lo nuevo. */
  private reentrada = false
  /** Desde dónde cuenta lo nuevo mientras la traza todavía no llena la pantalla; null si ya la llenó. */
  private origen: number | null = null
  /** Lo anterior a este instante es de antes del cambio de escala: ningún disparo puede mostrarlo. */
  private piso = Number.NEGATIVE_INFINITY
  /** La velocidad del tiempo vigente (el rodillo se decide en tiempo de reloj). */
  private velocidad = 1

  constructor(a: AjustesOsciloscopio) {
    this.a = a
  }

  /** Otra velocidad del tiempo; pasar de rodillo a barrido normal (o al revés) empieza de nuevo. La pausa (0) no cambia
   * nada: la pantalla a la vista es la de la velocidad con que corría. */
  ponerVelocidad(v: number): void {
    if (v === 0) return
    const antes = esRodillo(this.a.base, this.velocidad)
    this.velocidad = v
    if (esRodillo(this.a.base, v) !== antes) this.reiniciar()
  }

  /** Ajustes nuevos: cambiar la base, la posición o el modo del disparo empieza de nuevo. */
  configurar(a: AjustesOsciloscopio): void {
    const otro = a.base !== this.a.base || a.disparoCentro !== this.a.disparoCentro || a.disparo.modo !== this.a.disparo.modo || a.disparo.fuente !== this.a.disparo.fuente
    const escala = a.base !== this.a.base || a.canales.some((c, k) => c.vdiv !== this.a.canales[k]?.vdiv)
    const habia = this.actual !== null || Number.isFinite(this.fin)
    // Otro nivel, flanco o acople del canal de disparo: lo visto y el fin del barrido anterior eran de otro criterio.
    const acople = (x: AjustesOsciloscopio) => x.canales.find((c) => c.canal === x.disparo.fuente)?.acople
    const criterio = a.disparo.nivel !== this.a.disparo.nivel || a.disparo.subida !== this.a.disparo.subida || acople(a) !== acople(this.a)
    this.a = a
    if (criterio) {
      this.ultimoVisto = 0
      this.barridoHasta = Number.NEGATIVE_INFINITY
    }
    if (otro) this.reiniciar()
    // Otra escala, con una pantalla ya a la vista: se vacía y la traza nueva entra por la derecha hasta llenarla.
    if (escala && habia) {
      this.reiniciar()
      this.reentrada = true
    }
  }

  /** Retroceder: las sondas del motor ya no tienen lo posterior, así que lo visto, el fin del barrido y el disparo eran
   * del futuro deshecho y se empieza con lo que quedó (la captura única congelada también se rearma). */
  retroceder(t: number): void {
    this.reiniciar()
    this.ultimoVisto = Math.min(this.ultimoVisto, t)
    if (this.origen !== null) this.origen = Math.min(this.origen, t)
    if (this.piso > t) this.piso = Number.NEGATIVE_INFINITY
  }

  /** «Rearmar» del modo Único. */
  rearmar(): void {
    this.congelado = false
    this.ultimoDisparo = Number.NEGATIVE_INFINITY
    this.barridoHasta = Number.NEGATIVE_INFINITY
  }

  private reiniciar(): void {
    this.rearmar()
    this.fin = Number.NEGATIVE_INFINITY
    this.actual = null
    this.esperaDesde = Number.NaN
  }

  get span(): number {
    return DIVISIONES_H * this.a.base
  }

  private get pre(): number {
    return this.a.disparoCentro ? this.span / 2 : this.span / DIVISIONES_H
  }

  /** La pantalla nueva que toca con columnas de `dt`, o null si sigue la que hay (la interfaz no redibuja). */
  siguiente(f: FuenteBarrido, dt: number): PantallaBarrido | null {
    const S = this.span
    if (f.hasta < this.piso) this.piso = Number.NEGATIVE_INFINITY
    if (this.reentrada) {
      this.reentrada = false
      this.origen = f.hasta
      this.piso = f.hasta
    }
    if (this.origen !== null && f.hasta - this.origen >= S) this.origen = null
    const entrando = this.origen !== null
    if (entrando || this.a.disparo.modo === 'rodante' || esRodillo(this.a.base, this.velocidad)) {
      // El inicio en un múltiplo del ancho de columna: de una pantalla a la siguiente las columnas se corren un número entero.
      // Al entrar, t0 puede ser negativo (pantalla más larga que lo simulado): las columnas anteriores a `desde` se vacían.
      const t0r = Math.floor((f.hasta - S) / dt) * dt
      const t0 = entrando ? t0r : Math.max(0, t0r)
      if (this.actual?.estado === 'rodillo' && f.hasta <= this.fin) return null
      this.fin = f.hasta
      return (this.actual = { t0, tDisparo: Number.NaN, estado: 'rodillo', span: S, ...(entrando ? { desde: this.origen! } : {}) })
    }
    if (this.congelado) return null
    const visto = f.disparo(f.hasta)
    if (Number.isFinite(visto)) this.ultimoVisto = Math.max(this.ultimoVisto, visto)
    const post = S - this.pre
    const tc = f.disparo(f.hasta - post)
    // Los barridos van uno tras otro, como en un osciloscopio: el disparo siguiente se toma cuando el barrido en curso terminó, así una
    // pantalla de 200 ms se renueva unas 5 veces por segundo y no con cada ciclo de la señal.
    if (Number.isFinite(tc) && tc > this.ultimoDisparo && tc >= this.barridoHasta && tc - this.pre >= this.piso) {
      this.ultimoDisparo = tc
      this.barridoHasta = tc + post
      this.esperaDesde = Number.NaN
      const unico = this.a.disparo.modo === 'unico'
      if (unico) this.congelado = true
      this.fin = tc + post
      return (this.actual = { t0: tc - this.pre, tDisparo: tc, estado: unico ? 'congelado' : 'disparado', span: S })
    }
    if (this.a.disparo.modo === 'auto' && f.hasta - this.ultimoVisto >= esperaAuto(S) && f.hasta - this.fin >= S) {
      this.fin = f.hasta
      return (this.actual = { t0: f.hasta - S, tDisparo: Number.NaN, estado: 'libre', span: S })
    }
    // Normal sin disparo en dos pantallas: se avisa una vez (con la pantalla anterior a la vista, si la hay).
    if (this.a.disparo.modo === 'normal') {
      if (Number.isNaN(this.esperaDesde)) this.esperaDesde = f.hasta
      if (this.actual?.estado !== 'sin-disparo' && f.hasta - this.esperaDesde >= PANTALLAS_SIN_DISPARO * S && (!this.actual || this.actual.estado === 'esperando')) {
        return (this.actual = { t0: Number.NaN, tDisparo: Number.NaN, estado: 'sin-disparo', span: S })
      }
    }
    if (!this.actual) return (this.actual = { t0: Number.NaN, tDisparo: Number.NaN, estado: 'esperando', span: S })
    return null
  }
}

/** La configuración de una sonda en el motor (`ConfigSonda` de `engine/src/sonda.rs`). */
export interface ConfigSonda {
  columna: number
  acople: 'dc' | 'ac'
  disparo: { nivel: number; subida: boolean; histeresis: number } | null
}

/** Configuración de las sondas de un osciloscopio (canales A a D; null sin sonda): rejilla de dos pantallas, acoplamiento
 * (GND se dibuja en 0 sin tocar la sonda) y disparo en la sonda de su canal. */
export function configuracionDeSondas(a: AjustesOsciloscopio, sondas: readonly (number | null)[]): { sonda: number; config: ConfigSonda }[] {
  const columna = (DIVISIONES_H * a.base) / COLUMNAS_POR_PANTALLA
  const out: { sonda: number; config: ConfigSonda }[] = []
  a.canales.forEach((c, k) => {
    const sonda = sondas[k]
    if (sonda === null || sonda === undefined) return
    const disparo = c.canal === a.disparo.fuente ? { nivel: a.disparo.nivel, subida: a.disparo.subida, histeresis: HISTERESIS_DISPARO_DIV * c.vdiv } : null
    out.push({ sonda, config: { columna, acople: c.acople === 'AC' ? 'ac' : 'dc', disparo } })
  })
  return out
}

const ANUNCIOS: Readonly<Record<EstadoDisparo, string>> = {
  disparado: 'Disparado',
  esperando: 'Esperando disparo',
  libre: 'Sin disparo: barrido libre',
  congelado: 'Captura única congelada',
  rodillo: 'Modo rodillo',
  'sin-disparo': 'Sin disparo: ajusta el nivel o usa Auto'
}

/** El estado del disparo en palabras, para anunciarlo cuando cambia. */
export const anuncioDeDisparo = (e: EstadoDisparo): string => ANUNCIOS[e]
