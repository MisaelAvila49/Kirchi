import type { Id } from '../doc/tipos'
import { CANALES, DIVISIONES_H, estructuraMultimetro, MODOS_MULTIMETRO, type AjustesOsciloscopio, type ModoMultimetro } from '../instrumentos/ajustes'
import { baseDeCapturaAmplia } from '../instrumentos/serie'
import { Barrido, configuracionDeSondas, vaciarAntesDe, type PantallaBarrido } from '../instrumentos/barrido'
import { CIFRAS_COLUMNA_MOTOR, CIFRAS_VENTANA, medidasDeCanal, medidasDeColumnas } from '../instrumentos/medidas'
import { lecturaMultimetro, MS_LECTURA, rangoSiguiente } from '../instrumentos/multimetro'
import type { InstrumentosNetlist } from '../netlist/instrumentos'
import {
  CANALES_PANTALLA, CIFRAS_COLUMNA, COLUMNAS_PANTALLA, escribirMultimetro, escribirPantalla, MUESTRAS_CSV, N_MEDIDAS,
  type MedidaSab, type PantallaSab, type RazonSinMedida, type RegistroFino, type VistasInstrumentos
} from './protocoloInstrumentos'

/** La pantalla del osciloscopio se rehace a lo más 30 veces por segundo de reloj y sus 2,001 muestras de exportación a lo
 * más 4 (siempre que se fuerza). A 60 por segundo con las muestras en cada pantalla, armarla quitaba 13 % de capacidad a
 * la vista previa. */
export const MS_PANTALLA = 1000 / 30
export const MS_MUESTRAS = 250
/** Las ocho medidas de cada canal se calculan a lo más 4 veces por segundo de reloj, como el multímetro (siempre que se
 * fuerza o cambian los ajustes): cada una pide la ventana del motor, cuatro recorridos del búfer por canal, y a 30
 * pantallas por segundo eran la mitad del costo de armarlas. */
export const MS_MEDIDAS = 250
/** Columnas de una pantalla hasta que la interfaz dice su ancho (`columnas`). */
export const COLUMNAS_INICIALES = 1000
/** Tope de columnas finas de una captura (13 MB con cinco canales): más tiempo capturado, columnas más anchas. */
export const COLUMNAS_FINAS = 131072
const COLUMNAS_MIN = 64
/** La bandera de columna vacía (`Columna::VACIA` de `engine/src/sonda.rs`). */
const VACIA = 8

export interface MultimetroConfig {
  modo: ModoMultimetro
  ideal: boolean
  sondaV: number
  sondaI: number
  /** Su único elemento: el `FUSE` con la fuente de prueba en serie (su estado dice si se fundió; su resistencia es el rango). */
  elemento: number
  rango: number
}

export interface OsciloscopioConfig {
  ajustes: AjustesOsciloscopio
  /** La sonda de cada canal (A a D); null si la entrada está en tierra. */
  sondas: (number | null)[]
  /** Los canales cuya entrada no tiene cable: sin traza ni medidas. */
  alAire?: boolean[]
}

/** Lo que el worker necesita de los instrumentos (viaja por `postMessage`: solo datos). */
export interface ConfigInstrumentos {
  multimetros: MultimetroConfig[]
  osciloscopios: OsciloscopioConfig[]
}

/** La configuración y el orden de los instrumentos en la memoria compartida (el de la netlist). */
export interface InstrumentosCargados {
  config: ConfigInstrumentos
  multimetros: Id[]
  osciloscopios: Id[]
}

export function configDeInstrumentos(inst: InstrumentosNetlist): InstrumentosCargados {
  return {
    // Los medidores rápidos en AC van tras los multímetros con la misma ventana y el mismo registro (V AC, sin elemento propio).
    multimetros: [...inst.multimetros.keys(), ...inst.medidores.keys()],
    osciloscopios: [...inst.osciloscopios.keys()],
    config: {
      multimetros: [
        ...[...inst.multimetros.values()].map((m) => ({ modo: m.ajustes.modo, ideal: m.ajustes.ideal, sondaV: m.sondaV, sondaI: m.sondaI, elemento: m.elemento, rango: m.rangoOhm })),
        ...[...inst.medidores.values()].map((m) => ({ modo: 'V AC' as const, ideal: true, sondaV: m.sonda, sondaI: -1, elemento: -1, rango: 0 }))
      ],
      osciloscopios: [...inst.osciloscopios.values()].map((o) => ({ ajustes: o.ajustes, sondas: o.canales.map((c) => c.sonda), alAire: o.canales.map((c) => c.alAire) }))
    }
  }
}

/** Lo que se usa del `Simulator` (las pruebas del worker lo reemplazan por uno falso). */
export interface MotorSondas {
  time(): number
  sonda_tiempo(k: number): number
  /** El instante de la muestra más vieja que conserva el búfer de la sonda `k` (NaN si no existe). */
  sonda_cubre(k: number): number
  sonda_columnas(k: number, t0: number, dt: number, i0: number, i1: number): number
  sonda_columnas_pantalla(k: number, t0: number, dt: number, i0: number, i1: number): number
  sonda_resta(a: number, b: number, t0: number, dt: number, i0: number, i1: number): number
  sonda_muestras(k: number, t0: number, dt: number, n: number): number
  sonda_ventana(k: number, t0: number, t1: number): number
  sonda_disparo(k: number, tMax: number): number
  configurar_sonda(k: number, json: string): void
  sonda_activar(k: number, si: boolean): void
  set_resistance(indice: number, ohms: number): void
  estado_ptr(): number
  element_count(): number
}

/** El óhmetro `multimetro` pasó al rango `rango` (el worker ya cambió su resistencia en el motor). */
export interface CambioDeRango {
  multimetro: number
  rango: number
}

interface EstadoMm {
  desde: number
  ultima: number
  lecturas: number
  rango: number
  modo: ModoMultimetro
  ideal: boolean
  /** Lo que duró la ventana de la última lectura (s): al retroceder, la lectura vuelve a tomarse sobre una ventana igual. */
  largo: number
}

interface EstadoOsc {
  barrido: Barrido
  ultima: number
  version: number
  ncol: number
  /** Su pestaña está cerrada (0 columnas): la pantalla no se arma, salvo forzada (al pausar o detener). */
  oculta: boolean
  pantalla: PantallaBarrido | null
  /** Hay que volver a escribir la pantalla aunque el barrido no cambie (otro ancho, otros ajustes). */
  rehacer: boolean
  /** La última configuración mandada a cada sonda, para no repetirla. */
  sondas: Map<number, string>
  /** Cuándo (reloj) se armaron las últimas muestras de exportación, y si la pantalla escrita las trae. */
  ultimaMuestra: number
  muestrasAlDia: boolean
  /** Las últimas medidas calculadas y cuándo (reloj); entre una y otra, la pantalla lleva las mismas. */
  medidas: MedidaSab[][] | null
  ultimaMedida: number
}

const sinMedidas = (razon: RazonSinMedida): MedidaSab[] => Array.from({ length: N_MEDIDAS }, () => ({ valor: Number.NaN, razon }))

/** Las columnas del motor (siete cifras) de un canal negado: el canal A − B cuando A está en tierra. */
function negar(c: Float64Array): Float64Array {
  const r = new Float64Array(c.length)
  for (let i = 0; i + CIFRAS_COLUMNA_MOTOR <= c.length; i += CIFRAS_COLUMNA_MOTOR) {
    r.set([-c[i + 1], -c[i], -c[i + 2], -c[i + 3], -c[i + 4], c[i + 5], c[i + 6]], i)
  }
  return r
}

/** Los modos de corriente leen la sonda de corriente; los demás (V, Ω y continuidad), la de voltaje. */
const leeCorriente = (modo: ModoMultimetro): boolean => modo === 'A DC' || modo === 'A AC'

export class InstrumentosEnWorker {
  private mm: EstadoMm[] = []
  private osc: EstadoOsc[] = []
  private readonly columnasSab = new Float32Array(CANALES_PANTALLA * COLUMNAS_PANTALLA * CIFRAS_COLUMNA)
  private readonly muestrasSab = new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)

  constructor(
    private readonly m: MotorSondas,
    private readonly memoria: () => ArrayBuffer,
    private readonly v: VistasInstrumentos,
    private cfg: ConfigInstrumentos,
    ahora: number
  ) {
    this.configurar(cfg, ahora)
  }

  /** Una vista de la memoria del WASM: la dirección se pide antes (si la memoria creciera, el búfer viejo quedaría desconectado). */
  private f64(ptr: number, n: number): Float64Array {
    return new Float64Array(this.memoria(), ptr, n)
  }

  /** Hasta dónde registró la sonda que lee el modo (la otra está en pausa). */
  private hastaMm(c: MultimetroConfig): number {
    return this.m.sonda_tiempo(leeCorriente(c.modo) ? c.sondaI : c.sondaV)
  }

  /** Ajustes nuevos sin recargar: otro modo del multímetro empieza su lectura de nuevo; las sondas del osciloscopio se reconfiguran. */
  configurar(cfg: ConfigInstrumentos, ahora: number): void {
    cfg.multimetros.forEach((c, k) => {
      const e = this.mm[k]
      if (!e || e.modo !== c.modo || e.ideal !== c.ideal) {
        // La lectura nueva empieza en el tiempo de la isla: la sonda que estaba en marcha (la otra lleva su último tiempo de
        // antes de la pausa, o −∞).
        const desde = Math.max(c.sondaV >= 0 ? this.m.sonda_tiempo(c.sondaV) : Number.NEGATIVE_INFINITY, c.sondaI >= 0 ? this.m.sonda_tiempo(c.sondaI) : Number.NEGATIVE_INFINITY)
        this.mm[k] = { desde, ultima: ahora, lecturas: e?.lecturas ?? 0, rango: c.rango, modo: c.modo, ideal: c.ideal, largo: 0 }
      } else e.rango = c.rango
      // Solo registra la sonda que el modo lee: cada muestra de la otra costaba en cada paso de la isla. Al
      // reanudarse empieza vacía, y su ventana, desde su primera muestra.
      const a = leeCorriente(c.modo)
      if (c.sondaV >= 0) this.m.sonda_activar(c.sondaV, !a)
      if (c.sondaI >= 0) this.m.sonda_activar(c.sondaI, a)
    })
    this.mm.length = cfg.multimetros.length
    cfg.osciloscopios.forEach((c, k) => {
      let e = this.osc[k]
      if (!e) e = this.osc[k] = { barrido: new Barrido(c.ajustes), ultima: Number.NEGATIVE_INFINITY, version: 0, ncol: COLUMNAS_INICIALES, oculta: false, pantalla: null, rehacer: false, sondas: new Map(), ultimaMuestra: Number.NEGATIVE_INFINITY, muestrasAlDia: false, medidas: null, ultimaMedida: Number.NEGATIVE_INFINITY }
      else {
        e.barrido.configurar(c.ajustes)
        e.rehacer = true
      }
      for (const { sonda, config } of configuracionDeSondas(c.ajustes, c.sondas)) {
        const texto = JSON.stringify(config)
        if (e.sondas.get(sonda) === texto) continue
        this.m.configurar_sonda(sonda, texto)
        e.sondas.set(sonda, texto)
      }
    })
    this.osc.length = cfg.osciloscopios.length
    this.cfg = cfg
  }

  /** La pantalla `k` dibuja `n` columnas (su ancho en píxeles de dispositivo, entre 64 y 4,096). Con 0, su pestaña se
   * cerró: no se arma mientras nadie la ve y se retoma en la vuelta siguiente al verse. */
  columnas(k: number, n: number): void {
    const e = this.osc[k]
    if (!e) return
    if (!(n > 0)) {
      e.oculta = true
      return
    }
    const ncol = Math.max(COLUMNAS_MIN, Math.min(COLUMNAS_PANTALLA, Math.round(n)))
    if (ncol === e.ncol && !e.oculta) return
    e.oculta = false
    e.ncol = ncol
    e.rehacer = true
  }

  rearmar(k: number): void {
    this.osc[k]?.barrido.rearmar()
  }

  /** Retroceder: el motor recortó lo que registraron sus sondas hasta `t`, así que aquí se olvida lo armado con lo
   * deshecho: cada barrido empieza de nuevo y los multímetros se retoman sobre una ventana que termina en `t`. Los de
   * sondas vacías conservan su última cifra. */
  retroceder(t: number): void {
    this.cfg.multimetros.forEach((c, k) => {
      const e = this.mm[k]
      if (!e) return
      const cubre = this.m.sonda_cubre(leeCorriente(c.modo) ? c.sondaI : c.sondaV)
      e.desde = Number.isFinite(cubre) ? Math.max(cubre, t - e.largo) : t
    })
    for (const e of this.osc) {
      if (!e) continue
      e.barrido.retroceder(t)
      e.pantalla = null
      e.rehacer = true
      e.medidas = null
      e.muestrasAlDia = false
    }
  }

  /** La velocidad del tiempo vigente (infinita con lo más rápido posible y en un avance), para el rodillo. */
  velocidad(v: number): void {
    for (const e of this.osc) e?.barrido.ponerVelocidad(v)
  }

  /** Escribe lo que toca en la memoria compartida (`ahora` es el reloj en ms). `forzar` (paso en pausa, ajustes nuevos)
   * lee sin esperar los 250 ms del multímetro ni los 16 ms de la pantalla. Devuelve los cambios de rango del óhmetro. */
  publicar(ahora: number, forzar = false): CambioDeRango[] {
    const cambios: CambioDeRango[] = []
    let estado: Float64Array | null = null
    this.cfg.multimetros.forEach((c, k) => {
      const e = this.mm[k]
      if (!forzar && ahora - e.ultima < MS_LECTURA) return
      const t1 = this.hastaMm(c)
      if (!(t1 > e.desde)) return
      e.ultima = ahora
      // La ventana de la sonda que el modo lee: cada una recorre todo lo simulado desde la lectura anterior. En A
      // la de la corriente da también el tiempo medido; en V y en Ω, la del voltaje.
      const enA = leeCorriente(c.modo)
      const w = this.f64(this.m.sonda_ventana(enA ? c.sondaI : c.sondaV, e.desde, t1), CIFRAS_VENTANA).slice()
      const wv = w
      const l = lecturaMultimetro(c.modo, w, w, e.rango)
      estado ??= this.f64(this.m.estado_ptr(), this.m.element_count()).slice()
      e.lecturas++
      escribirMultimetro(this.v, k, {
        lecturas: e.lecturas, t: t1, ventana: l.ventana, valor: l.valor, frecuencia: l.frecuencia, rango: e.rango, estado: l.estado,
        modo: MODOS_MULTIMETRO.indexOf(c.modo), fundido: c.elemento >= 0 && estado[c.elemento] > 0, periodos: l.periodos
      })
      e.largo = Number.isFinite(e.desde) ? t1 - e.desde : 0
      e.desde = t1
      if (c.modo !== 'Ω') return
      const nuevo = rangoSiguiente(e.rango, wv)
      if (nuevo === e.rango) return
      this.m.set_resistance(c.elemento, estructuraMultimetro(c.modo, c.ideal, nuevo).ohms)
      e.rango = c.rango = nuevo
      cambios.push({ multimetro: k, rango: nuevo })
    })
    this.cfg.osciloscopios.forEach((c, k) => this.pantalla(c, k, ahora, forzar))
    return cambios
  }

  private escribirColumnas(canal: number, n: number, c: Float64Array | null, destino: Float32Array = this.columnasSab): void {
    // Con locales y un índice que avanza: con `this.columnasSab[...]` y la cuenta de cada índice costaba 25 µs por canal.
    const d = destino
    let o = canal * n * CIFRAS_COLUMNA
    const fin = o + n * CIFRAS_COLUMNA
    if (!c) {
      for (; o < fin; o += CIFRAS_COLUMNA) {
        d[o] = 0
        d[o + 1] = 0
        d[o + 2] = 0
        d[o + 3] = 0
        d[o + 4] = VACIA
      }
      return
    }
    for (let i = 0; o < fin; o += CIFRAS_COLUMNA, i += CIFRAS_COLUMNA_MOTOR) {
      d[o] = c[i]
      d[o + 1] = c[i + 1]
      d[o + 2] = c[i + 2]
      d[o + 3] = c[i + 3]
      d[o + 4] = c[i + 6]
    }
  }

  /** Captura entera de un osciloscopio: una sola pantalla de `ncol` columnas con todo lo que conservan las sondas, hasta
   * `hasta` si está congelada. Sin disparo (`tDisparo` NaN) el eje cuenta desde el inicio. No toca la memoria compartida.
   * Null sin osciloscopio `k`, sonda viva o tramo con dato. */
  capturaAmplia(k: number, ncol: number, hasta?: number): PantallaSab | null {
    const c = this.cfg.osciloscopios[k]
    const e = this.osc[k]
    if (!c || !e) return null
    const a = c.ajustes
    const usa = (i: number) => a.canales[i].on || (a.matematico && i < 2)
    const vivas = c.sondas.filter((s, i): s is number => s !== null && usa(i) && !(c.alAire?.[i] ?? false))
    if (!vivas.length) return null
    const fin = Math.min(hasta ?? Number.POSITIVE_INFINITY, ...vivas.map((s) => this.m.sonda_tiempo(s)))
    const ini = Math.max(0, ...vivas.map((s) => this.m.sonda_cubre(s)).filter((t) => Number.isFinite(t)))
    if (!(fin > ini)) return null
    const n = Math.max(COLUMNAS_MIN, Math.min(COLUMNAS_PANTALLA, Math.round(ncol)))
    // Las diez divisiones con una base redonda (marcas limpias): lo que sobra después del último dato queda vacío.
    const span = baseDeCapturaAmplia(fin - ini) * DIVISIONES_H
    const dt = span / n
    const dtCsv = (fin - ini) / (MUESTRAS_CSV - 1)
    const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
    const muestras = new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
    const cols: (Float64Array | null)[] = []
    const mues: (Float64Array | null)[] = []
    for (let i = 0; i < CANALES.length; i++) {
      const s = c.sondas[i]
      const alAire = c.alAire?.[i] ?? false
      if (!usa(i) || alAire) {
        this.escribirColumnas(i, n, null, columnas)
        muestras.fill(Number.NaN, i * MUESTRAS_CSV, (i + 1) * MUESTRAS_CSV)
        cols.push(null)
        mues.push(null)
        continue
      }
      const enCero = s === null || a.canales[i].acople === 'GND'
      const vista = enCero ? new Float64Array(n * CIFRAS_COLUMNA_MOTOR) : this.f64(this.m.sonda_columnas(s, ini, dt, 0, n), n * CIFRAS_COLUMNA_MOTOR).slice()
      const vm = enCero ? new Float64Array(MUESTRAS_CSV) : this.f64(this.m.sonda_muestras(s, ini, dtCsv, MUESTRAS_CSV), MUESTRAS_CSV).slice()
      this.escribirColumnas(i, n, a.canales[i].on ? vista : null, columnas)
      if (a.canales[i].on) muestras.set(vm, i * MUESTRAS_CSV)
      else muestras.fill(Number.NaN, i * MUESTRAS_CSV, (i + 1) * MUESTRAS_CSV)
      cols.push(vista)
      mues.push(vm)
    }
    const M = CANALES.length
    if (!a.matematico || !cols[0] || !cols[1]) {
      this.escribirColumnas(M, n, null, columnas)
      muestras.fill(Number.NaN, M * MUESTRAS_CSV, (M + 1) * MUESTRAS_CSV)
    } else {
      const [sa, sb] = [0, 1].map((i) => (a.canales[i].acople === 'GND' ? null : c.sondas[i]))
      const resta = sa !== null && sb !== null ? this.f64(this.m.sonda_resta(sa, sb, ini, dt, 0, n), n * CIFRAS_COLUMNA_MOTOR).slice() : sb === null ? cols[0] : negar(cols[1])
      this.escribirColumnas(M, n, resta, columnas)
      const [ma, mb] = [mues[0], mues[1]]
      if (ma && mb) for (let j = 0; j < MUESTRAS_CSV; j++) muestras[M * MUESTRAS_CSV + j] = ma[j] - mb[j]
    }
    return {
      version: 1, t0: ini, dt, ncol: n, tDisparo: Number.NaN, estado: 'congelado', tCaptura: fin, csv: { t0: ini, dt: dtCsv, n: MUESTRAS_CSV },
      completoHasta: Array(CANALES_PANTALLA).fill(fin), medidas: Array.from({ length: CANALES_PANTALLA }, () => sinMedidas('sin-datos')), columnas, muestras
    }
  }

  /** Todo lo que conservan las sondas de un osciloscopio como columnas finas e iguales, para desplazarse por la captura
   * detenida o en pausa. Cada columna dura lo de una de la pantalla actual o, si la captura es muy larga, lo que quepa en
   * `COLUMNAS_FINAS`. Null sin osciloscopio `k` ni tramo con dato. */
  capturaFina(k: number, hasta?: number): RegistroFino | null {
    const c = this.cfg.osciloscopios[k]
    const e = this.osc[k]
    if (!c || !e) return null
    const a = c.ajustes
    const usa = (i: number) => a.canales[i].on || (a.matematico && i < 2)
    const vivas = c.sondas.filter((s, i): s is number => s !== null && usa(i) && !(c.alAire?.[i] ?? false))
    if (!vivas.length) return null
    const fin = Math.min(hasta ?? Number.POSITIVE_INFINITY, ...vivas.map((s) => this.m.sonda_tiempo(s)))
    const ini = Math.max(0, ...vivas.map((s) => this.m.sonda_cubre(s)).filter((t) => Number.isFinite(t)))
    if (!(fin > ini)) return null
    const dt = Math.max((DIVISIONES_H * a.base) / Math.max(COLUMNAS_MIN, e.ncol), (fin - ini) / COLUMNAS_FINAS)
    const n = Math.max(1, Math.ceil((fin - ini) / dt))
    const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
    // Por trozos de lo que cabe en una llamada al motor; cada trozo se copia antes de pedir el siguiente.
    const porTrozos = (pedir: (i0: number, i1: number) => number): Float64Array => {
      const todo = new Float64Array(n * CIFRAS_COLUMNA_MOTOR)
      for (let i0 = 0; i0 < n; i0 += COLUMNAS_PANTALLA) {
        const i1 = Math.min(n, i0 + COLUMNAS_PANTALLA)
        todo.set(this.f64(pedir(i0, i1), (i1 - i0) * CIFRAS_COLUMNA_MOTOR), i0 * CIFRAS_COLUMNA_MOTOR)
      }
      return todo
    }
    const cols: (Float64Array | null)[] = []
    for (let i = 0; i < CANALES.length; i++) {
      const s = c.sondas[i]
      if (!usa(i) || (c.alAire?.[i] ?? false)) {
        this.escribirColumnas(i, n, null, columnas)
        cols.push(null)
        continue
      }
      const enCero = s === null || a.canales[i].acople === 'GND'
      const vista = enCero ? new Float64Array(n * CIFRAS_COLUMNA_MOTOR) : porTrozos((i0, i1) => this.m.sonda_columnas(s, ini, dt, i0, i1))
      this.escribirColumnas(i, n, a.canales[i].on ? vista : null, columnas)
      cols.push(vista)
    }
    const M = CANALES.length
    if (!a.matematico || !cols[0] || !cols[1]) this.escribirColumnas(M, n, null, columnas)
    else {
      const [sa, sb] = [0, 1].map((i) => (a.canales[i].acople === 'GND' ? null : c.sondas[i]))
      const resta = sa !== null && sb !== null ? porTrozos((i0, i1) => this.m.sonda_resta(sa, sb, ini, dt, i0, i1)) : sb === null ? cols[0] : negar(cols[1])
      this.escribirColumnas(M, n, resta, columnas)
    }
    return { t0: ini, dt, n, tCaptura: fin, columnas }
  }

  private pantalla(c: OsciloscopioConfig, k: number, ahora: number, forzar: boolean): void {
    const e = this.osc[k]
    if (!forzar && (e.oculta || (!e.rehacer && ahora - e.ultima < MS_PANTALLA))) return
    const a = c.ajustes
    const usa = (i: number) => a.canales[i].on || (a.matematico && i < 2)
    const vivas = c.sondas.filter((s, i): s is number => s !== null && usa(i))
    const hasta = vivas.length ? Math.min(...vivas.map((s) => this.m.sonda_tiempo(s))) : this.m.time()
    const sd = c.sondas[CANALES.indexOf(a.disparo.fuente)]
    const span = DIVISIONES_H * a.base
    const nueva = e.barrido.siguiente({ hasta, disparo: (t) => (sd === null ? Number.NaN : this.m.sonda_disparo(sd, t)) }, span / e.ncol)
    // Forzada y sin muestras al día (un paso en pausa, al pausar): la misma pantalla, ahora con ellas.
    const p = nueva ?? (e.rehacer || (forzar && !e.muestrasAlDia) ? e.pantalla : null)
    const rehecha = e.rehacer
    e.rehacer = false
    if (!p) return
    e.ultima = ahora
    e.pantalla = p
    e.version++
    const n = e.ncol
    if (!Number.isFinite(p.t0)) {
      // Esperando el primer disparo: solo el estado.
      escribirPantalla(this.v, k, {
        version: e.version, t0: Number.NaN, dt: 0, ncol: 0, tDisparo: Number.NaN, estado: p.estado, tCaptura: hasta, csv: { t0: Number.NaN, dt: 0, n: 0 },
        completoHasta: Array(CANALES_PANTALLA).fill(hasta), medidas: Array.from({ length: CANALES_PANTALLA }, () => sinMedidas('sin-datos')),
        columnas: this.columnasSab, muestras: this.muestrasSab
      })
      return
    }
    const dt = span / n
    const dtCsv = span / (MUESTRAS_CSV - 1)
    const conMuestras = forzar || ahora - e.ultimaMuestra >= MS_MUESTRAS
    if (conMuestras) e.ultimaMuestra = ahora
    e.muestrasAlDia = conMuestras
    const conMedidas = forzar || rehecha || !e.medidas || ahora - e.ultimaMedida >= MS_MEDIDAS
    if (conMedidas) e.ultimaMedida = ahora
    const medidas: MedidaSab[][] = []
    const completo: number[] = []
    const cols: (Float64Array | null)[] = []
    const muestras: (Float64Array | null)[] = []
    // Una pasada por canal: lo que da el motor se copia directo a la memoria compartida desde la del WASM (cada llamada al
    // motor reutiliza su búfer), y solo se guarda una copia de lo que hace falta después (las medidas, A − B).
    for (let i = 0; i < CANALES.length; i++) {
      const s = c.sondas[i]
      const on = a.canales[i].on
      const alAire = c.alAire?.[i] ?? false
      if (!usa(i) || alAire) {
        this.escribirColumnas(i, n, null)
        this.muestrasSab.fill(Number.NaN, i * MUESTRAS_CSV, (i + 1) * MUESTRAS_CSV)
        if (conMedidas) medidas.push(sinMedidas(usa(i) ? 'sin-datos' : 'apagado'))
        completo.push(hasta)
        cols.push(null)
        muestras.push(null)
        continue
      }
      // La entrada en tierra o en GND se dibuja en 0 V.
      const enCero = s === null || a.canales[i].acople === 'GND'
      const paraLaResta = a.matematico && i < 2
      // Las medidas toman el mínimo y el máximo de las columnas en f32 ya escritas y lo demás de la ventana del motor: solo
      // A − B (y un canal en tierra) necesita su copia en f64.
      const conCopia = paraLaResta || (enCero && conMedidas && on)
      let ci: Float64Array | null = null
      if (on && !enCero && !conCopia) {
        // Lo de casi todas las pantallas: las cinco cifras en f32, copiadas de una vez de la memoria del WASM.
        const ptr = this.m.sonda_columnas_pantalla(s, p.t0, dt, 0, n)
        this.columnasSab.set(new Float32Array(this.memoria(), ptr, n * CIFRAS_COLUMNA), i * n * CIFRAS_COLUMNA)
      } else {
        const vista = enCero ? new Float64Array(n * CIFRAS_COLUMNA_MOTOR) : this.f64(this.m.sonda_columnas(s, p.t0, dt, 0, n), n * CIFRAS_COLUMNA_MOTOR)
        this.escribirColumnas(i, n, on ? vista : null)
        ci = conCopia ? (enCero ? vista : vista.slice()) : null
      }
      let mi: Float64Array | null = null
      if (conMuestras) {
        const vm = enCero ? new Float64Array(MUESTRAS_CSV) : this.f64(this.m.sonda_muestras(s, p.t0, dtCsv, MUESTRAS_CSV), MUESTRAS_CSV)
        if (on) this.muestrasSab.set(vm, i * MUESTRAS_CSV)
        if (paraLaResta) mi = vm.slice()
      }
      if (!on) this.muestrasSab.fill(Number.NaN, i * MUESTRAS_CSV, (i + 1) * MUESTRAS_CSV)
      cols.push(ci)
      muestras.push(mi)
      if (!on) {
        if (conMedidas) medidas.push(sinMedidas('apagado'))
        completo.push(hasta)
        continue
      }
      if (enCero) {
        if (conMedidas) medidas.push(medidasDeColumnas(ci!, dt))
        completo.push(hasta)
        continue
      }
      if (conMedidas) {
        const w = this.f64(this.m.sonda_ventana(s, Math.max(p.t0, p.desde ?? p.t0), p.t0 + span), CIFRAS_VENTANA).slice()
        const desdeSab = () => this.columnasSab.subarray(i * n * CIFRAS_COLUMNA, (i + 1) * n * CIFRAS_COLUMNA)
        // Sin muestras crudas en la pantalla (toda de la rejilla), de las integrales de las columnas del motor.
        const delMotor = () => this.f64(this.m.sonda_columnas(s, p.t0, dt, 0, n), n * CIFRAS_COLUMNA_MOTOR).slice()
        medidas.push(ci ? medidasDeCanal(ci, w) : w[1] > w[0] ? medidasDeCanal(desdeSab(), w, CIFRAS_COLUMNA) : medidasDeCanal(delMotor(), w))
      }
      completo.push(this.m.sonda_tiempo(s))
    }
    // A − B: la resta del motor si las dos entradas tienen sonda; si una está en tierra, la otra (negada si es B).
    const M = CANALES.length
    if (!a.matematico || !cols[0] || !cols[1]) {
      this.escribirColumnas(M, n, null)
      this.muestrasSab.fill(Number.NaN, M * MUESTRAS_CSV, (M + 1) * MUESTRAS_CSV)
      if (conMedidas) medidas.push(sinMedidas('apagado'))
      completo.push(hasta)
    } else {
      const [sa, sb] = [0, 1].map((i) => (a.canales[i].acople === 'GND' ? null : c.sondas[i]))
      const resta =
        sa !== null && sb !== null ? this.f64(this.m.sonda_resta(sa, sb, p.t0, dt, 0, n), n * CIFRAS_COLUMNA_MOTOR).slice() : sb === null ? cols[0] : negar(cols[1])
      this.escribirColumnas(M, n, resta)
      const [ma, mb] = [muestras[0], muestras[1]]
      if (ma && mb) for (let j = 0; j < MUESTRAS_CSV; j++) this.muestrasSab[M * MUESTRAS_CSV + j] = ma[j] - mb[j]
      if (conMedidas) medidas.push(medidasDeColumnas(resta, dt))
      completo.push(Math.min(completo[0], completo[1]))
    }
    // Tras cambiar una escala, lo anterior al cambio no se dibuja: la traza nueva entra desde la derecha.
    if (p.desde !== undefined) for (let i = 0; i <= M; i++) vaciarAntesDe(this.columnasSab, i, n, p.t0, dt, p.desde)
    if (conMedidas) e.medidas = medidas
    escribirPantalla(this.v, k, {
      version: e.version, t0: p.t0, dt, ncol: n, tDisparo: p.tDisparo, estado: p.estado, tCaptura: p.estado === 'rodillo' ? hasta : p.t0 + span,
      // Sin muestras al día, `n` en 0: la exportación y la tabla las sacan de las columnas.
      csv: { t0: p.t0, dt: dtCsv, n: conMuestras ? MUESTRAS_CSV : 0 }, completoHasta: completo, medidas: e.medidas!, columnas: this.columnasSab, muestras: this.muestrasSab
    })
  }
}
