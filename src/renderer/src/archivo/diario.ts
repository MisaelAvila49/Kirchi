import type { Comando } from '../doc/comandos'
import type { TipoAviso } from '../doc/historial'
import type { ColeccionDoc, Documento, Id } from '../doc/tipos'
import { documentoDeDatos, leerKir } from './kir'

/** Diario de autoguardado: base (documento completo) más renglones con el estado final de lo tocado, escritos juntos a lo
 * más un segundo después.
 * Se guarda el estado y no el comando para que un arrastre de mil pasos ocupe lo mismo que su resultado. */

export const VERSION_DIARIO = 1
/** Espera máxima entre un cambio y su renglón en el diario. */
export const INTERVALO_DIARIO_MS = 1000
/** Pasado esto (en caracteres escritos desde la última base), la base se rehace con el documento entero. */
export const LIMITE_DIARIO = 8 * 2 ** 20

const COLECCIONES: readonly ColeccionDoc[] = ['piezas', 'cables', 'etiquetas', 'notas', 'alimentaciones', 'figuras', 'sondas', 'analisis', 'importacion']

/** Un elemento en el diario: colección, id y su estado final (null si se borró). */
export type EntradaDiario = [ColeccionDoc, Id, unknown]

export interface DestinoDiario {
  /** Agrega un renglón al diario. */
  anotar(renglon: string): void
  /** Reemplaza la base por el documento entero y vacía el diario. */
  nuevaBase(doc: Documento): void
}

export interface Reloj {
  poner(f: () => void, ms: number): unknown
  quitar(t: unknown): void
}

const relojReal: Reloj = { poner: (f, ms) => setTimeout(f, ms), quitar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }

export class Diario {
  private pendientes = new Map<string, EntradaDiario>()
  private temporizador: unknown = null
  private escritos = 0

  constructor(
    private destino: DestinoDiario,
    private doc: () => Documento,
    /** Mientras devuelve true (un arrastre en curso) el renglón espera: cada paso del gesto lo reescribiría. */
    private ocupado: () => boolean = () => false,
    private reloj: Reloj = relojReal,
    private intervalo = INTERVALO_DIARIO_MS,
    private limite = LIMITE_DIARIO
  ) {}

  /** Oyente del historial (`Historial.suscribir`). Reemplazar el documento no se anota: trae su propia base. */
  alCambiar = (_doc: Documento, cmd: Comando, tipo: TipoAviso): void => {
    if (tipo === 'reemplazar') return
    for (const c of cmd.cambios) this.pendientes.set(`${c.col}\0${c.id}`, [c.col, c.id, c.despues ?? null])
    if (this.pendientes.size > 0) this.programar()
  }

  /** La base cambió (abrir, nuevo, recuperar, guardar): lo pendiente ya está en ella. */
  reiniciar(): void {
    this.pendientes.clear()
    this.escritos = 0
    this.cancelar()
  }

  /** Se guardó: lo guardado es la base nueva y el diario se vacía. Lo pendiente son cambios posteriores. */
  guardado(): void {
    this.escritos = 0
  }

  /** Escribe lo pendiente ahora mismo, haya o no un gesto en curso (al cerrar la ventana o antes de guardar). */
  vaciar(): void {
    this.cancelar()
    this.escribir(true)
  }

  get hayPendientes(): boolean {
    return this.pendientes.size > 0
  }

  private cancelar(): void {
    if (this.temporizador !== null) this.reloj.quitar(this.temporizador)
    this.temporizador = null
  }

  private programar(): void {
    if (this.temporizador !== null) return
    this.temporizador = this.reloj.poner(() => {
      this.temporizador = null
      this.escribir(false)
    }, this.intervalo)
  }

  private escribir(forzar: boolean): void {
    if (this.pendientes.size === 0) return
    if (!forzar && this.ocupado()) {
      this.programar()
      return
    }
    if (this.escritos >= this.limite) {
      this.pendientes.clear()
      this.escritos = 0
      this.destino.nuevaBase(this.doc())
      return
    }
    const renglon = JSON.stringify({ v: VERSION_DIARIO, c: [...this.pendientes.values()] })
    this.pendientes.clear()
    this.escritos += renglon.length
    this.destino.anotar(renglon)
  }
}

const IDS_PROHIBIDOS = new Set(['__proto__', 'constructor', 'prototype'])
const entradaValida = (e: unknown): boolean => Array.isArray(e) && COLECCIONES.includes(e[0]) && typeof e[1] === 'string' && !IDS_PROHIBIDOS.has(e[1])

export type Recuperado = { ok: true; doc: Documento; soloLectura: boolean; avisos: string[]; renglones: number } | { ok: false; error: string }

/** Documento que dejan la base y los renglones, validado como archivo. Un renglón dañado detiene la reconstrucción (los
 * siguientes dependen de él). */
export function recuperar(base: Uint8Array, texto: string): Recuperado {
  const leido = leerKir(base)
  if (!leido.ok) return leido
  const datos = JSON.parse(JSON.stringify(leido.doc)) as Record<ColeccionDoc, Record<Id, unknown>>
  const avisos = [...leido.avisos]
  const renglones = texto.split('\n')
  // El último renglón con algo escrito: el único que puede haber quedado a medias al cerrarse Kirchi.
  let ultimoLleno = -1
  for (let i = renglones.length - 1; i >= 0; i--) {
    if (renglones[i].trim()) {
      ultimoLleno = i
      break
    }
  }
  const danado = (hasta: number) => `Se recuperó hasta el cambio ${hasta}: el resto de la copia de seguridad automática está dañado.`
  let aplicados = 0
  for (let i = 0; i < renglones.length; i++) {
    const r = renglones[i].trim()
    if (!r) continue
    const ultimo = i === ultimoLleno
    let obj: { v?: unknown; c?: unknown }
    try {
      obj = JSON.parse(r)
    } catch {
      avisos.push(ultimo ? 'Se perdió el último segundo de cambios: Kirchi se cerró mientras lo guardaba.' : danado(aplicados))
      break
    }
    // Un renglón es un solo paso: si una entrada no es de una colección conocida o su id no es un
    // texto utilizable, el renglón entero está dañado y no se aplica nada de él.
    if (obj?.v !== VERSION_DIARIO || !Array.isArray(obj.c) || !obj.c.every(entradaValida)) {
      avisos.push(danado(aplicados))
      break
    }
    for (const e of obj.c as EntradaDiario[]) {
      // La tabla de alimentaciones, las figuras y las sondas pueden no estar en la base (un documento sin rieles cambiados, figuras ni sondas).
      if (e[0] === 'importacion') {
        if (e[2] === null) delete (datos as Record<string, unknown>).importacion
        else (datos as Record<string, unknown>).importacion = e[2]
        continue
      }
      const col = (datos[e[0]] ??= {})
      if (e[2] === null) delete col[e[1]]
      else col[e[1]] = e[2]
    }
    aplicados++
  }
  const v = documentoDeDatos(datos)
  if (!v) return { ok: false, error: 'La copia de seguridad automática está dañada.' }
  return { ok: true, doc: v.doc, soloLectura: leido.soloLectura, avisos: [...avisos, ...v.avisos], renglones: aplicados }
}
