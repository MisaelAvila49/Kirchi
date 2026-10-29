import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { escribirKir, leerKir } from '../archivo/kir'
import { faltantesDe } from '../archivo/requisitos'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento } from '../doc/tipos'
import type { Orden } from '../edicion/ordenes'
import { MENSAJE_SOLO_LECTURA, NucleoEdicion } from '../edicion/nucleo'
import { resolverPerilla, valorDePerilla } from '../edicion/perillas'
import { resolverRed } from '../edicion/referencias'
import type { LectorMotor } from '../../../compartido/netlistMotor'
import type { Resultado } from '../edicion/resultado'
import { compilarNetlist, type ResultadoNetlist } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { basesDeTiempo, pasoDeVistaPrevia, topesDeVistaPrevia, topesPlanos } from '../sim/lectura'
import { MAX_ELEMENTS, MAX_NODES, MAX_REDES_DIGITALES } from '../sim/protocol'
import { armarAnalisis, type ArmadoAnalisis, type EntradaAnalisis } from '../edicion/analisisDoc'
import type { ResultadoEjecucion } from '../analisis/ejecucion'
import { analizarDocumento, ejecutarDocumento, type EjecutorAnalisis, type ResultadoResumen } from './analisis'
import { leerTodo, redondear, type LecturaSinVentana } from './lecturas'
import { cargarMotor, motorCargado, Simulator } from './motor'

export type { EjecutorAnalisis, LecturaSinVentana, ResultadoResumen }

export interface DepsSesion {
  lib: Map<string, PiezaDef>
  /** Los bytes de `kirchi_engine_bg.wasm`. */
  wasm: Uint8Array
  analisis?: EjecutorAnalisis
  /** La versión de la aplicación que se escribe en el manifiesto al guardar. */
  version: string
}

/** Segundos simulados que una llamada a `simular` puede avanzar y segundos de reloj que puede tardar. */
export const TOPE_SIMULADO_S = 10
export const TOPE_RELOJ_MS = 30_000
/** Tramo entre dos revisiones del reloj. */
const TRAMO_S = 0.02
/** Topes de lo que una llamada a `simular` programa: cambios de perilla, muestras pedidas y redes distintas que se leen. */
export const MAX_CAMBIOS = 500
export const MAX_MUESTRAS_PEDIDAS = 2000
export const MAX_TRAZAS_MUESTREADAS = 16

/** Un cambio de perilla en el instante `t` (s): `valor` es un número en la unidad de la perilla o un texto con ella. */
export interface CambioPerilla {
  t: number
  ref: string
  prop?: string
  valor: number | string
}
/** Una lectura exacta del voltaje de una red (patilla, «red de R1.2» o nombre) en el instante `t` (s). */
export interface PedidoMuestra {
  t: number
  traza: string
}
export interface Muestra {
  /** El instante pedido. */
  t: number
  traza: string
  v: number
}

interface Plan {
  cambios: { canal: number; t: number; valor: number }[]
  /** Un lector de voltaje por red distinta; `trazas[k]` es el nombre con que se pidió la del lector k. */
  trazas: string[]
  lectores: LectorMotor[]
  muestras: { lector: number; t: number }[]
}

export interface ResultadoCompilar {
  ok: boolean
  errores: string[]
  avisos: string[]
  redes: number
  elementos: number
}

export interface ResultadoSimular {
  /** Segundos simulados alcanzados. */
  t: number
  /** Por qué paró antes de `hasta`, si lo hizo. */
  corte?: 'tope-simulado' | 'tope-reloj'
  /** Paso máximo del motor, en segundos. */
  paso: number
  /** Las muestras pedidas con `muestrear` que el motor cumplió, en orden de tiempo. */
  muestras?: Muestra[]
  /** Cuántas muestras pedidas no se cumplieron porque la simulación cortó antes de su instante. */
  muestrasSinTomar?: number
}

/** Un circuito que se abre, edita, simula y lee sin ventana: el núcleo de edición más el motor sin worker. */
export class SesionSinVentana {
  readonly nucleo: NucleoEdicion
  private netlist: ResultadoNetlist | null = null
  private sim: Simulator | null = null
  private paso = 0
  private docCompilado: Documento | null = null

  /** Para pruebas y ayudantes que solo compilan: sin el motor cargado no se puede simular. */
  constructor(private readonly deps: Pick<DepsSesion, 'lib' | 'version' | 'analisis'>) {
    this.nucleo = new NucleoEdicion(deps.lib)
  }

  static async iniciar(deps: DepsSesion): Promise<SesionSinVentana> {
    await cargarMotor(deps.wasm)
    return new SesionSinVentana(deps)
  }

  get doc(): Documento {
    return this.nucleo.doc
  }

  get soloLectura(): boolean {
    return this.nucleo.soloLectura
  }

  crear(): void {
    this.cargar(documentoVacio(), false)
  }

  /** Abre un `.kir`; con un formato más nuevo queda en solo lectura. Lanza `Error` si el archivo no sirve. */
  abrir(bytes: Uint8Array): { avisos: string[]; soloLectura: boolean } {
    const l = leerKir(bytes)
    if (!l.ok) throw new Error(l.error)
    this.cargar(l.doc, l.soloLectura)
    const falta = faltantesDe(l.requiere, this.deps.lib, l.doc).aviso
    return { avisos: falta ? [...l.avisos, falta] : l.avisos, soloLectura: l.soloLectura }
  }

  /** Abre un documento ya leído (ayudantes de prueba). */
  abrirDocumento(doc: Documento): void {
    this.cargar(doc, false)
  }

  guardar(): Uint8Array {
    return escribirKir(this.doc, this.deps.version)
  }

  aplicar(orden: Orden): Resultado {
    const r = this.nucleo.aplicar(orden)
    if (r.ok) this.soltar()
    return r
  }

  motivoSoloLectura(): string | null {
    return this.nucleo.soloLectura ? MENSAJE_SOLO_LECTURA : null
  }

  /** Arma la netlist del documento actual; la deja lista para `simular`. */
  compilar(): ResultadoCompilar {
    const r = this.compilado()
    return { ok: r.netlist !== null, errores: r.errores, avisos: r.avisos, redes: r.netlist?.nodes ?? 0, elementos: r.netlist?.elements.length ?? 0 }
  }

  /** La netlist completa (con sus tablas de redes y piezas); lanza si el circuito no compila. */
  netlistCompleta(): ResultadoNetlist & { netlist: NonNullable<ResultadoNetlist['netlist']> } {
    const r = this.compilado()
    if (!r.netlist) throw new Error(r.errores.join(' ') || 'El circuito no se puede simular.')
    return r as ResultadoNetlist & { netlist: NonNullable<ResultadoNetlist['netlist']> }
  }

  /** Avanza el motor hasta `hasta` segundos simulados. Mismos topes que la vista previa, más `TOPE_SIMULADO_S` por
   * llamada y `TOPE_RELOJ_MS` de reloj, con corte limpio y la lectura hasta donde llegó. `cambios` mueve perillas en
   * instantes dados y `muestrear` lee redes en instantes exactos (arranca el motor de nuevo); lanza `Error` con el motivo
   * si algo de eso no vale, antes de tocar el motor. */
  simular(o: { hasta: number; paso?: number; cambios?: CambioPerilla[]; muestrear?: PedidoMuestra[] }): ResultadoSimular {
    if (!motorCargado()) throw new Error('El motor no está cargado: usa SesionSinVentana.iniciar.')
    const r = this.netlistCompleta()
    const plan = this.planear(r, o)
    if (!this.sim || (o.paso !== undefined && o.paso !== this.paso) || plan.lectores.length) this.arrancar(r, o.paso, plan.lectores)
    const sim = this.sim!
    // Un instante que el motor ya pasó no se puede programar.
    const ya = [...plan.cambios, ...plan.muestras].find((x) => x.t < sim.time() - 1e-12)
    if (ya) throw new Error(`t = ${ya.t} s ya pasó: el motor está en ${sim.time()} s.`)
    for (const c of plan.cambios) {
      try {
        sim.poner_valor(c.canal, c.t, c.valor)
      } catch (e) {
        throw new Error(`El motor rechazó un cambio de perilla: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    for (const m of plan.muestras) sim.pedir_muestra(m.lector, m.t)
    const meta = Math.min(o.hasta, sim.time() + TOPE_SIMULADO_S)
    const inicio = performance.now()
    let corte: ResultadoSimular['corte'] = meta < o.hasta ? 'tope-simulado' : undefined
    while (sim.time() < meta - 1e-12) {
      if (performance.now() - inicio > TOPE_RELOJ_MS) {
        corte = 'tope-reloj'
        break
      }
      sim.advance_to(Math.min(meta, sim.time() + TRAMO_S), 1e9)
    }
    const salida: ResultadoSimular = { t: sim.time(), ...(corte ? { corte } : {}), paso: this.paso }
    if (plan.muestras.length) {
      const crudas = sim.tomar_muestras()
      const muestras: Muestra[] = []
      for (let k = 0; k + 2 < crudas.length; k += 3) muestras.push({ t: crudas[k + 1], traza: plan.trazas[crudas[k]], v: redondear(crudas[k + 2]) })
      muestras.sort((a, b) => a.t - b.t)
      salida.muestras = muestras
      if (muestras.length < plan.muestras.length) salida.muestrasSinTomar = plan.muestras.length - muestras.length
    }
    return salida
  }

  /** Valida `cambios` y `muestrear` contra el circuito y los vuelve canales, lectores e instantes. */
  private planear(r: ResultadoNetlist, o: { hasta: number; cambios?: CambioPerilla[]; muestrear?: PedidoMuestra[] }): Plan {
    const plan: Plan = { cambios: [], trazas: [], lectores: [], muestras: [] }
    const instante = (donde: string, t: unknown): number => {
      if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw new Error(`${donde}: t debe ser un número de segundos de 0 en adelante.`)
      if (t > o.hasta) throw new Error(`${donde}: t = ${t} s pasa de «hasta» (${o.hasta} s).`)
      return t
    }
    const cambios = o.cambios ?? []
    if (cambios.length > MAX_CAMBIOS) throw new Error(`Hasta ${MAX_CAMBIOS} cambios por simulación y se pidieron ${cambios.length}.`)
    cambios.forEach((c, k) => {
      const donde = `cambios[${k}]`
      const t = instante(donde, c.t)
      const p = resolverPerilla(this.doc, this.nucleo.lib, String(c.ref ?? ''), c.prop)
      if ('motivo' in p) throw new Error(`${donde}: ${p.motivo}`)
      const v = valorDePerilla(p.prop, c.valor)
      if ('motivo' in v) throw new Error(`${donde}: ${v.motivo}`)
      const canal = r.canalDe.get(`${p.pieza.id}:${p.prop.id}`)
      if (canal === undefined) throw new Error(`${donde}: la perilla ${p.prop.id} de ${p.pieza.ref} no llega al motor en este circuito.`)
      plan.cambios.push({ canal, t, valor: v.valor })
    })
    plan.cambios.sort((a, b) => a.t - b.t)
    const pedidas = o.muestrear ?? []
    if (pedidas.length > MAX_MUESTRAS_PEDIDAS) throw new Error(`Hasta ${MAX_MUESTRAS_PEDIDAS} muestras por simulación y se pidieron ${pedidas.length}.`)
    const lectorDeNodo = new Map<number, number>()
    const lectorDeTraza = new Map<string, number>()
    pedidas.forEach((m, k) => {
      const donde = `muestrear[${k}]`
      const t = instante(donde, m.t)
      const traza = String(m.traza ?? '').trim()
      let lector = lectorDeTraza.get(traza)
      if (lector === undefined) {
        const red = resolverRed({ doc: this.doc, lib: this.nucleo.lib, con: this.nucleo.con }, traza)
        if ('motivo' in red) throw new Error(`${donde}: ${red.motivo}`)
        if (red.red.tierra) throw new Error(`${donde}: «${traza.slice(0, 40)}» es la tierra: vale 0 V.`)
        const nodo = r.nodoDeRed.get(red.red.id)
        if (nodo === undefined) throw new Error(`${donde}: «${traza.slice(0, 40)}» no es una red analógica del motor.`)
        // Dos nombres de la misma red comparten lector.
        lector = lectorDeNodo.get(nodo)
        if (lector === undefined) {
          if (plan.lectores.length >= MAX_TRAZAS_MUESTREADAS) throw new Error(`Hasta ${MAX_TRAZAS_MUESTREADAS} trazas distintas por simulación y se pidieron más.`)
          lector = plan.lectores.length
          lectorDeNodo.set(nodo, lector)
          plan.lectores.push({ kind: 'v', p: nodo, n: 0 })
          plan.trazas[lector] = traza
        }
        lectorDeTraza.set(traza, lector)
      }
      plan.muestras.push({ lector, t })
    })
    return plan
  }

  /** Las lecturas al instante simulado actual; `muestras` agrega hasta ese número de valores por canal del osciloscopio. */
  leer(opciones: { muestras?: number } = {}): LecturaSinVentana {
    const r = this.compilado()
    if (!r.netlist || !this.sim) throw new Error('Simula el circuito antes de leerlo.')
    return leerTodo(this.doc, this.nucleo.lib, this.nucleo.con, r, this.sim, opciones)
  }

  analizar(a: AnalisisDoc, etiquetas?: ReadonlyMap<number, string>): Promise<ResultadoResumen> {
    return analizarDocumento(this.doc, this.deps.lib, this.nucleo.con, a, this.deps.analisis, etiquetas)
  }

  /** El análisis de este circuito a partir de lo que pide el asistente (referencias, trazas por patilla), sin guardarlo. */
  armarAnalisis(e: EntradaAnalisis): ArmadoAnalisis {
    return armarAnalisis(this.nucleo, e)
  }

  /** El resultado completo de un análisis, el que dibuja la gráfica. */
  ejecutarAnalisis(a: AnalisisDoc, etiquetas?: ReadonlyMap<number, string>): Promise<ResultadoEjecucion> {
    return ejecutarDocumento(this.doc, this.deps.lib, this.nucleo.con, a, this.deps.analisis, etiquetas)
  }

  /** Libera el motor. */
  cerrar(): void {
    this.soltar()
  }

  private cargar(doc: Documento, soloLectura: boolean): void {
    this.soltar()
    this.nucleo.cargar(doc, { soloLectura })
  }

  private compilado(): ResultadoNetlist {
    if (this.netlist && this.docCompilado === this.doc) return this.netlist
    this.soltarMotor()
    this.docCompilado = this.doc
    this.netlist = compilarNetlist(this.doc, this.nucleo.lib, calcularConexiones(this.doc, this.nucleo.lib))
    return this.netlist
  }

  private arrancar(r: ResultadoNetlist & { netlist: NonNullable<ResultadoNetlist['netlist']> }, paso?: number, lectores: LectorMotor[] = []): void {
    this.soltarMotor()
    const h = paso ?? pasoDeVistaPrevia(r.netlist, basesDeTiempo(r))
    const sim = new Simulator(JSON.stringify(lectores.length ? { ...r.netlist, lectores } : r.netlist), h)
    const [nodos, elementos, digitales] = [sim.node_count(), sim.element_count(), sim.digital_count()]
    if (nodos > MAX_NODES || elementos > MAX_ELEMENTS || digitales > MAX_REDES_DIGITALES) {
      sim.free()
      throw new Error(
        nodos > MAX_NODES
          ? `La vista previa admite hasta ${MAX_NODES} redes y este circuito tiene ${nodos}.`
          : digitales > MAX_REDES_DIGITALES
            ? `La vista previa admite hasta ${MAX_REDES_DIGITALES} redes digitales y este circuito tiene ${digitales}.`
            : `La vista previa admite hasta ${MAX_ELEMENTS} piezas simuladas y este circuito tiene ${elementos}.`
      )
    }
    // Sin un paso pedido, cada isla con el suyo, como en la vista previa.
    if (paso === undefined) {
      const t = topesDeVistaPrevia(r.netlist, basesDeTiempo(r))
      sim.topes_de_paso(t.libre, topesPlanos(t))
    }
    this.sim = sim
    this.paso = h
  }

  private soltarMotor(): void {
    try {
      this.sim?.free()
    } catch {
      /* instancia ya inutilizable */
    }
    this.sim = null
  }

  private soltar(): void {
    this.soltarMotor()
    this.netlist = null
    this.docCompilado = null
  }
}
