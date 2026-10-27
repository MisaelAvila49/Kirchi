import { calcularConexiones, type Conexiones } from '../conexiones/conexiones'
import { aplicar as aplicarCmd, fusionar, type Comando } from '../doc/comandos'
import { Historial } from '../doc/historial'
import { idAleatorio, type GeneradorId } from '../doc/ids'
import { comandoDentroDelMundo, MOTIVO_FUERA_DEL_MUNDO } from '../doc/limites'
import { haySondas } from '../doc/sondas'
import { documentoVacio, type ColeccionDoc, type Documento, type Id } from '../doc/tipos'
import { conflictoDeTocados } from '../editor/conflictos'
import { Indice } from '../editor/indice'
import { partirEnUniones } from '../editor/normalizar'
import { mantenerSondas } from '../editor/sondas'
import type { PiezaDef } from '../piezas/tipos'
import { borrarOrden } from './operaciones/borrar'
import { cablearOrden } from './operaciones/cablear'
import { conectarOrden } from './operaciones/conectar'
import { fragmentoOrden, type LectorDeArchivos } from './operaciones/fragmento'
import { instrumentoOrden } from './operaciones/instrumento'
import { loteOrden } from './operaciones/lote'
import { sondaOrden } from './operaciones/sonda'
import { colocarOrden } from './operaciones/colocar'
import { moverOrden } from './operaciones/mover'
import { agruparOrden, unidadOrden } from './operaciones/paquetes'
import { propiedadOrden } from './operaciones/propiedad'
import { transformarOrden } from './operaciones/transformar'
import { analisisOrden } from './operaciones/analisis'
import { nombrarOrden } from './operaciones/nombrar'
import { vaciarOrden } from './operaciones/vaciar'
import { motivoDeChoque } from './motivos'
import type { Orden } from './ordenes'
import { esRechazo, type Estado, type Plan, type Rechazo } from './plan'
import type { Resultado } from './resultado'

export const MENSAJE_SOLO_LECTURA = 'Este circuito es de una versión más nueva de Kirchi y se abrió en solo lectura: se puede ver y exportar, pero no cambiar.'
export const MENSAJE_SIMULANDO = 'Mientras corre la vista previa el circuito no se edita: detenla para cambiarlo.'

export type ResultadoCmd =
  | { ok: true; cmd: Comando; creados: Partial<Record<ColeccionDoc, Id[]>>; avisos: string[] }
  | { ok: false; motivo: string; con?: { con: Id; col: 'piezas' | 'cables' } }

export interface OpcionesEjecutar {
  /** Parte los cables en las uniones en T que resulten, en el mismo paso. Por omisión sí. */
  normalizar?: boolean
  /** Rechaza lo que deje un cable atravesando una pieza o encimado sobre otra red. Por omisión sí. */
  verificar?: boolean
}

/** El documento sin gestos: historial, redes, índice espacial y el único camino por el que cambia. Lo usan el editor de
 * la ventana, el modo sin ventana y el servidor del asistente. */
export class NucleoEdicion implements Estado {
  readonly historial: Historial
  readonly indice = new Indice()
  readonly lib: Map<string, PiezaDef>
  readonly gen: GeneradorId
  con: Conexiones
  soloLectura = false
  simulando = false
  /** Quien llama lo enciende durante un gesto para recalcular solo al soltar. */
  pausarRecalculo = false
  /** Quien llama lo da para pausar el recalculo solo mientras dura un gesto. */
  enGesto?: () => boolean
  /** El comando que dejó la última orden aceptada (con uniones y sondas); lo usa el lote para juntarlos. */
  ultimoComando: Comando | null = null
  /** De dónde salen los `.kir` que pide la orden `fragmento`; sin él solo hay plantillas incluidas. */
  lectorDeArchivos?: LectorDeArchivos

  constructor(lib: Map<string, PiezaDef>, doc: Documento = documentoVacio(), gen: GeneradorId = idAleatorio) {
    this.lib = lib
    this.gen = gen
    this.historial = new Historial(doc)
    this.con = calcularConexiones(doc, lib)
    this.indice.reconstruir(doc, lib)
    this.historial.suscribir(() => {
      if (!this.pausarRecalculo && !this.enGesto?.()) this.recalcular()
    })
  }

  get doc(): Documento {
    return this.historial.doc
  }

  recalcular(): void {
    this.con = calcularConexiones(this.doc, this.lib)
    this.indice.reconstruir(this.doc, this.lib)
  }

  /** Reemplaza el documento; con `soloLectura` ningún comando lo cambia. */
  cargar(doc: Documento, opciones: { soloLectura?: boolean } = {}): void {
    this.soloLectura = opciones.soloLectura === true
    this.historial.reemplazar(doc)
  }

  /** Por qué ahora no se puede editar, o null. */
  editable(): string | null {
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    return this.simulando ? MENSAJE_SIMULANDO : null
  }

  /** El comando que parte en uniones las T que hay ahora, o null: lo pide un gesto que sigue moviendo cables y los
   * normaliza antes de empezar. */
  uniones(): Comando | null {
    return partirEnUniones(this.doc, this.gen)
  }

  /** Aplica un comando por el camino de todo cambio: uniones en T, mundo, invariante de cables, sondas y un paso del
   * historial. */
  ejecutar(cmd: Comando, opciones: OpcionesEjecutar = {}): ResultadoCmd {
    const motivo = this.editable()
    if (motivo) return { ok: false, motivo }
    if (opciones.normalizar !== false) {
      const extra = partirEnUniones(aplicarCmd(this.doc, cmd), this.gen)
      if (extra) cmd = fusionar(cmd, extra)
    }
    if (!comandoDentroDelMundo(cmd)) return { ok: false, motivo: MOTIVO_FUERA_DEL_MUNDO }
    if (opciones.verificar !== false) {
      const despues = aplicarCmd(this.doc, cmd)
      const conflicto = conflictoDeTocados(despues, this.lib, tocadosDe(this.doc, cmd), undefined)
      if (conflicto) return { ok: false, motivo: motivoDeChoque(despues, null, conflicto), con: conflicto }
    }
    // Las sondas que el cambio deja sin tocar nada se mudan o se borran en el mismo paso.
    const sondas = haySondas(this.doc) ? mantenerSondas(this.doc, () => aplicarCmd(this.doc, cmd), this.lib, this.con, cmd.cambios) : null
    const total = sondas?.cmd ? fusionar(cmd, sondas.cmd) : cmd
    this.historial.ejecutar(total)
    return { ok: true, cmd: total, creados: creadosDe(total), avisos: sondas?.avisos ?? [] }
  }

  /** Aplica una orden. `nombre` pone el nombre del paso de deshacer. */
  aplicar(orden: Orden, opciones: { nombre?: string } = {}): Resultado {
    const motivo = this.editable()
    if (motivo) return { ok: false, motivo }
    if (orden.orden === 'deshacer') return this.historial.deshacer() ? { ok: true, creados: {}, avisos: [] } : { ok: false, motivo: 'No hay nada que deshacer.' }
    if (orden.orden === 'rehacer') return this.historial.rehacer() ? { ok: true, creados: {}, avisos: [] } : { ok: false, motivo: 'No hay nada que rehacer.' }
    const plan = this.planDe(orden)
    if (esRechazo(plan)) return plan.indice === undefined ? { ok: false, motivo: plan.motivo } : { ok: false, motivo: plan.motivo, indice: plan.indice }
    if (plan.yaUnidas) return { ok: true, creados: {}, avisos: plan.avisos, yaUnidas: true }
    const cmd = opciones.nombre ? { ...plan.cmd, nombre: opciones.nombre } : plan.cmd
    const r = this.ejecutar(cmd)
    if (!r.ok) return { ok: false, motivo: plan.verbo ? `${plan.verbo}: ${r.motivo}.` : r.motivo }
    this.ultimoComando = r.cmd
    return { ok: true, creados: plan.creados, avisos: [...plan.avisos, ...r.avisos], ...(plan.via ? { via: plan.via } : {}) }
  }

  private planDe(orden: Orden): Plan | Rechazo {
    switch (orden.orden) {
      case 'colocar':
        return colocarOrden(this, orden)
      case 'borrar':
        return borrarOrden(this, orden)
      case 'mover':
        return moverOrden(this, orden)
      case 'propiedad':
        return propiedadOrden(this, orden)
      case 'unidad':
        return unidadOrden(this, orden)
      case 'agrupar':
        return agruparOrden(this)
      case 'transformar':
        return transformarOrden(this, orden)
      case 'cablear':
        return cablearOrden(this, orden)
      case 'conectar':
        return conectarOrden(this, orden)
      case 'lote':
        return loteOrden(this, orden, (doc) => {
          const copia = new NucleoEdicion(this.lib, doc, this.gen)
          copia.lectorDeArchivos = this.lectorDeArchivos
          return copia
        })
      case 'instrumento':
        return instrumentoOrden(this, orden)
      case 'sonda':
        return sondaOrden(this, orden)
      case 'nombrar':
        return nombrarOrden(this, orden)
      case 'analisis':
        return analisisOrden(this, orden)
      case 'fragmento':
        return fragmentoOrden(this, orden, { lector: this.lectorDeArchivos })
      case 'vaciar':
        return vaciarOrden(this)
      default:
        return { motivo: `La orden «${orden.orden}» todavía no está disponible.` }
    }
  }

  deshacer(): boolean {
    return this.editable() === null && this.historial.deshacer()
  }

  rehacer(): boolean {
    return this.editable() === null && this.historial.rehacer()
  }
}

/** Piezas y cables que el comando crea o cambia de lugar, para revisar el invariante solo sobre ellos. */
function tocadosDe(doc: Documento, cmd: Comando): { piezas: Id[]; cables: Id[] } {
  const piezas: Id[] = []
  const cables: Id[] = []
  for (const c of cmd.cambios) {
    if (c.despues === undefined) continue
    if (c.col === 'cables') cables.push(c.id)
    else if (c.col === 'piezas') {
      const antes = doc.piezas[c.id]
      const despues = c.despues as { x: number; y: number; rot: number; espejo: boolean; tipo: string }
      if (!antes || antes.x !== despues.x || antes.y !== despues.y || antes.rot !== despues.rot || antes.espejo !== despues.espejo || antes.tipo !== despues.tipo) piezas.push(c.id)
    }
  }
  return { piezas, cables }
}

function creadosDe(cmd: Comando): Partial<Record<ColeccionDoc, Id[]>> {
  const salida: Partial<Record<ColeccionDoc, Id[]>> = {}
  for (const c of cmd.cambios) if (c.antes === undefined && c.despues !== undefined) (salida[c.col] ??= []).push(c.id)
  return salida
}
