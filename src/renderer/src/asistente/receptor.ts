import { ESPERA_GESTO_MS, TEXTO_USUARIO_EDITANDO } from '../../../compartido/asistente'
import { escribirKir, leerKir } from '../archivo/kir'
import type { Documento } from '../doc/tipos'
import { propDelBuscador } from '../editor/colocar'
import { cuerpoEnMundo } from '../editor/colision'
import type { Fragmento } from '../editor/portapapeles'
import type { LectorDeArchivos } from '../edicion/operaciones/fragmento'
import { validarOrden, type Orden } from '../edicion/ordenes'
import { resolverPerilla, valorDePerilla } from '../edicion/perillas'
import type { Resultado } from '../edicion/resultado'
import type { Efecto } from '../lienzo/animaciones'
import type { PiezaDef } from '../piezas/tipos'
import { fragmentoDeDocumento } from '../plantillas/plantilla'

/** Lo que el receptor necesita del editor de la ventana. */
export interface EditorDelReceptor {
  readonly lib: Map<string, PiezaDef>
  readonly doc: Documento
  /** Aplica la orden por el núcleo (mismo deshacer que el ratón). */
  aplicarDelAsistente(orden: Orden, nombre?: string, lector?: LectorDeArchivos): Resultado
  /** Por qué ahora no se puede editar, o null. */
  motivoNoEditable(): string | null
  enGesto(): boolean
  /** Mueve una perilla en el documento (también simulando); false si no se pudo. */
  cambiarPerilla(id: string, propId: string, texto: string): boolean
}

export interface DepsReceptor {
  editor: EditorDelReceptor
  version: string
  /** El nombre con que se muestra el circuito y el del archivo, si ya tiene uno. */
  titulo(): { titulo: string; archivo: string | null }
  registrar(texto: string): void
  /** Lleva el valor de una perilla al canal del motor si la vista previa corre. */
  moverPerilla?(id: string, propId: string, valor: number): void
  animar(e: Efecto): void
  /** Por qué la ventana no acepta órdenes del asistente aunque se pueda editar (el usuario conservó su versión frente a la
   * del disco), o null. */
  bloqueo?(): string | null
  /** Para pruebas: cómo se espera y qué hora es. */
  esperar?(ms: number): Promise<void>
  ahora?(): number
}

const AIRE_PULSO = 0.5
const PASO_ESPERA_MS = 50
const MAX_ANIMADAS = 12

export function aBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function deBase64(texto: string): Uint8Array {
  const s = atob(texto)
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

/** Un texto del circuito (referencias, nombres) acortado y sin caracteres de control, para el Registro y el nombre del paso. */
const corto = (t: unknown): string => String(t ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
const lista = (xs: readonly string[] | undefined): string => (xs ?? []).slice(0, 4).map(corto).join(', ') + ((xs?.length ?? 0) > 4 ? '…' : '')

/** El nombre del paso de deshacer, en infinitivo como los demás. */
export function nombreDelPaso(o: Orden): string {
  switch (o.orden) {
    case 'colocar':
      return `Asistente: colocar ${corto(o.ref ?? o.tipo)}`
    case 'conectar':
      return `Asistente: conectar ${corto(o.desde)} con ${corto(o.hasta)}`
    case 'mover':
      return `Asistente: mover ${lista(o.refs)}`
    case 'borrar':
      return `Asistente: borrar ${lista([...(o.refs ?? []), ...(o.cables ?? []), ...(o.etiquetas ?? [])])}`
    case 'propiedad':
      return `Asistente: cambiar ${corto(o.prop)} de ${corto(o.ref)}`
    case 'unidad':
      return `Asistente: pasar ${corto(o.ref)} a la unidad ${corto(o.unidad)}`
    case 'agrupar':
      return 'Asistente: agrupar en encapsulados'
    case 'transformar':
      return `Asistente: ${o.op === 'espejoX' || o.op === 'espejoY' ? 'reflejar' : 'girar'} ${lista(o.refs)}`
    case 'instrumento':
      return `Asistente: poner ${corto(o.tipo)}`
    case 'sonda':
      return `Asistente: poner sonda en ${corto(o.punto)}`
    case 'fragmento':
      return `Asistente: insertar ${corto(o.plantilla ?? o.archivo)}`
    case 'nombrar':
      return `Asistente: nombrar ${corto(o.punto)}`
    case 'analisis':
      return `Asistente: guardar el análisis ${corto(o.nombre)}`
    case 'vaciar':
      return 'Asistente: vaciar el circuito'
    case 'lote':
      return `Asistente: lote de ${o.ordenes.length} órdenes`
    case 'cablear':
      return 'Asistente: cablear'
    default:
      return 'Asistente'
  }
}

/** El renglón del Registro, en pasado, con lo que de verdad quedó (la referencia que se asignó, el valor). */
export function renglonDelRegistro(o: Orden, r: Extract<Resultado, { ok: true }>, doc: Documento, lib: Map<string, PiezaDef>): string | null {
  switch (o.orden) {
    case 'colocar': {
      const ref = Object.keys(r.creados)[0] ?? o.ref ?? o.tipo
      const p = Object.values(doc.piezas).find((x) => x.ref === ref)
      const def = p ? lib.get(p.tipo) : undefined
      const principal = def ? propDelBuscador(def) : undefined
      const valor = p && principal ? (p.props[principal.id] ?? principal.defecto) : undefined
      return `Asistente: colocó ${corto(ref)}${valor ? ` (${corto(valor)})` : ''}.`
    }
    case 'conectar':
      return r.yaUnidas ? null : `Asistente: conectó ${corto(o.desde)} con ${corto(o.hasta)}${r.via === 'etiquetas' ? ' con etiquetas' : ''}.`
    case 'mover':
      return `Asistente: movió ${lista(o.refs)}.`
    case 'borrar':
      return `Asistente: borró ${lista([...(o.refs ?? []), ...(o.cables ?? []), ...(o.etiquetas ?? [])])}.`
    case 'propiedad':
      return `Asistente: cambió ${corto(o.prop)} de ${corto(o.ref)} a ${corto(o.valor)}.`
    case 'unidad':
      return `Asistente: pasó ${corto(o.ref)} a la unidad ${corto(o.unidad)}.`
    case 'agrupar':
      return 'Asistente: agrupó las piezas en encapsulados.'
    case 'transformar':
      return `Asistente: ${o.op === 'espejoX' || o.op === 'espejoY' ? 'reflejó' : 'giró'} ${lista(o.refs)}.`
    case 'instrumento':
      return `Asistente: puso ${corto(Object.keys(r.creados)[0] ?? o.tipo)}.`
    case 'sonda':
      return `Asistente: puso una sonda en ${corto(o.punto)}.`
    case 'fragmento':
      return `Asistente: insertó ${corto(o.plantilla ?? o.archivo)}.`
    case 'nombrar':
      return r.yaUnidas ? null : `Asistente: nombró ${corto(o.punto)} como ${corto(o.nombre)}.`
    case 'analisis':
      return r.yaUnidas ? null : `Asistente: guardó el análisis ${corto(o.nombre)}.`
    case 'vaciar':
      return 'Asistente: vació el circuito.'
    case 'lote':
      return `Asistente: aplicó un lote de ${o.ordenes.length} órdenes.`
    case 'cablear':
      return 'Asistente: trazó un cable.'
    case 'deshacer':
      return 'Asistente: deshizo el último paso.'
    case 'rehacer':
      return 'Asistente: rehízo el último paso.'
  }
}

/**
 * Atiende las peticiones del puente en la ventana: aplica órdenes con el núcleo del editor (un paso de deshacer con nombre,
 * un renglón en el Registro y la animación del gesto equivalente) y entrega el documento. Las lecturas no dejan renglón.
 */
export class Receptor {
  constructor(private readonly deps: DepsReceptor) {}

  async atender(tipo: string, datos: unknown): Promise<unknown> {
    switch (tipo) {
      case 'estado': {
        const { titulo, archivo } = this.deps.titulo()
        const e = this.deps.editor
        return { ventana: true, titulo, archivo, editable: e.motivoNoEditable(), piezas: Object.keys(e.doc.piezas).length }
      }
      case 'documento': {
        const { titulo, archivo } = this.deps.titulo()
        return { bytes: aBase64(escribirKir(this.deps.editor.doc, this.deps.version)), titulo, archivo, editable: this.deps.editor.motivoNoEditable() }
      }
      case 'orden':
        return this.orden(datos)
      case 'perilla':
        return this.perilla(datos)
      default:
        return { ok: false, motivo: `Petición desconocida: «${corto(tipo)}».` }
    }
  }

  /** Mueve una perilla, con la vista previa corriendo o sin ella: es lo único que el asistente edita simulando. */
  private perilla(datos: unknown): { ok: true; ref: string; prop: string; valor: string } | { ok: false; motivo: string } {
    const d = (typeof datos === 'object' && datos !== null ? datos : {}) as { ref?: unknown; prop?: unknown; valor?: unknown }
    const e = this.deps.editor
    const p = resolverPerilla(e.doc, e.lib, String(d.ref ?? ''), typeof d.prop === 'string' ? d.prop : undefined)
    if ('motivo' in p) return { ok: false, motivo: p.motivo }
    if (typeof d.valor !== 'number' && typeof d.valor !== 'string') return { ok: false, motivo: 'Indica «valor».' }
    const v = valorDePerilla(p.prop, d.valor)
    if ('motivo' in v) return { ok: false, motivo: v.motivo }
    const bloqueo = this.deps.bloqueo?.() ?? null
    if (bloqueo) return { ok: false, motivo: bloqueo }
    if (e.enGesto()) return { ok: false, motivo: TEXTO_USUARIO_EDITANDO }
    if (!e.cambiarPerilla(p.pieza.id, p.prop.id, v.texto)) return { ok: false, motivo: e.motivoNoEditable() ?? 'No se pudo mover la perilla.' }
    this.deps.moverPerilla?.(p.pieza.id, p.prop.id, v.valor)
    this.deps.registrar(`Asistente: movió ${corto(p.prop.nombre.toLowerCase())} de ${corto(p.pieza.ref)} a ${corto(v.texto)}.`)
    return { ok: true, ref: p.pieza.ref, prop: p.prop.id, valor: v.texto }
  }

  private async orden(datos: unknown): Promise<Resultado> {
    const d = (typeof datos === 'object' && datos !== null ? datos : {}) as { orden?: unknown; archivos?: unknown }
    const v = validarOrden(d.orden)
    if (!v.ok) return { ok: false, motivo: v.motivo }
    const e = this.deps.editor
    const bloqueo = e.motivoNoEditable() ?? this.deps.bloqueo?.() ?? null
    if (bloqueo) return { ok: false, motivo: bloqueo }
    const esperar = this.deps.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)))
    const ahora = this.deps.ahora ?? (() => performance.now())
    const limite = ahora() + ESPERA_GESTO_MS
    while (e.enGesto()) {
      if (ahora() >= limite) return { ok: false, motivo: TEXTO_USUARIO_EDITANDO }
      await esperar(PASO_ESPERA_MS)
    }
    // Entre la espera y ahora pudo empezar la vista previa.
    const bloqueoAhora = e.motivoNoEditable()
    if (bloqueoAhora) return { ok: false, motivo: bloqueoAhora }
    const orden = v.orden
    const archivos = (typeof d.archivos === 'object' && d.archivos !== null ? d.archivos : {}) as Record<string, unknown>
    const lector: LectorDeArchivos = (nombre) => this.fragmentoDe(archivos[nombre], nombre)
    const antes = e.doc
    const r = e.aplicarDelAsistente(orden, orden.orden === 'deshacer' || orden.orden === 'rehacer' ? undefined : nombreDelPaso(orden), lector)
    if (!r.ok) return r
    if (e.doc !== antes) {
      const renglon = renglonDelRegistro(orden, r, e.doc, e.lib)
      if (renglon) this.deps.registrar(renglon)
      this.animarCreados(Object.values(r.creados))
    }
    return r
  }

  private fragmentoDe(b64: unknown, nombre: string): Fragmento | { motivo: string } {
    if (typeof b64 !== 'string') return { motivo: `No se recibió ${corto(nombre)}.` }
    const k = leerKir(deBase64(b64))
    if (!k.ok) return { motivo: k.error }
    return fragmentoDeDocumento(k.doc, this.deps.editor.lib) ?? { motivo: `${corto(nombre)} no tiene nada que colocar.` }
  }

  private animarCreados(ids: string[]): void {
    const { doc, lib } = this.deps.editor
    const cables: string[] = []
    for (const id of ids.slice(0, MAX_ANIMADAS)) {
      const p = doc.piezas[id]
      if (p) this.deps.animar({ tipo: 'pulso', caja: cuerpoEnMundo(p, lib.get(p.tipo), AIRE_PULSO) })
      else cables.push(id)
    }
    if (cables.length) this.deps.animar({ tipo: 'brillo', cables })
  }

}
