import { combinacion } from '../editor/teclado'
import type { Tono } from './colores'

/**
 * Nivel de un mensaje del Registro: rojo para errores, ámbar para avisos, gris para lo informativo. Cada nivel lleva palabra e icono: el color nunca va solo.
 */
export type NivelRegistro = 'error' | 'aviso' | 'info'

/** Los niveles, del más grave al más leve: el contador de la pestaña toma el primero que haya. */
export const NIVELES_REGISTRO: readonly { id: NivelRegistro; nombre: string; tono: Tono }[] = [
  { id: 'error', nombre: 'Error', tono: 'rojo' },
  { id: 'aviso', nombre: 'Aviso', tono: 'ambar' },
  { id: 'info', nombre: 'Información', tono: 'gris' }
]

export interface EntradaRegistro {
  /** Número de entrada, creciente: sirve de llave para la lista. */
  n: number
  hora: string
  texto: string
  tipo: NivelRegistro
  /** Veces seguidas que llegó el mismo mensaje. */
  veces: number
}

export const MAX_REGISTRO = 200

const dos = (v: number) => String(v).padStart(2, '0')
export const horaCorta = (d: Date): string => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`

/** Agrega un mensaje al Registro. El mismo mensaje seguido cuenta una vez más; se conservan los últimos `max`. */
export function agregarAlRegistro(lista: EntradaRegistro[], texto: string, tipo: EntradaRegistro['tipo'], ahora: Date, max = MAX_REGISTRO): EntradaRegistro[] {
  const ultima = lista[lista.length - 1]
  if (ultima && ultima.texto === texto && ultima.tipo === tipo) return [...lista.slice(0, -1), { ...ultima, hora: horaCorta(ahora), veces: ultima.veces + 1 }]
  const n = (ultima?.n ?? 0) + 1
  return [...lista, { n, hora: horaCorta(ahora), texto, tipo, veces: 1 }].slice(-max)
}

/** El nivel más grave de la lista (el que pinta el contador de la pestaña); null sin mensajes. */
export function nivelDelRegistro(lista: readonly EntradaRegistro[]): NivelRegistro | null {
  let hay: NivelRegistro | null = null
  for (const e of lista) {
    if (e.tipo === 'error') return 'error'
    if (e.tipo === 'aviso') hay = 'aviso'
    else hay ??= 'info'
  }
  return hay
}

/** Lo que copia «Copiar todo»: un renglón por mensaje, en el orden en que se ven (el más nuevo arriba). */
export function textoDelRegistro(lista: readonly EntradaRegistro[]): string {
  const renglones: string[] = []
  for (let i = lista.length - 1; i >= 0; i--) {
    const e = lista[i]
    renglones.push(`${e.hora} ${e.texto}${e.veces > 1 ? ` (×${e.veces})` : ''}`)
  }
  return renglones.join('\n')
}

/** Las de edición del lienzo: con el foco en el Registro no hacen nada (no se cortan, pegan ni borran piezas). */
const PROPIAS = new Set(['Ctrl+X', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Supr', 'Retroceso'])

/**
 * Con el foco en el Registro, Ctrl+C copia el texto seleccionado (lo hace el navegador), Ctrl+A selecciona solo los mensajes y las teclas de edición del lienzo no hacen nada.
 */
export function teclaDelRegistro(combinacion: string): 'copiar' | 'seleccionar' | 'propia' | null {
  return combinacion === 'Ctrl+C' ? 'copiar' : combinacion === 'Ctrl+A' ? 'seleccionar' : PROPIAS.has(combinacion) ? 'propia' : null
}

/**
 * Escucha las teclas del panel del Registro (`activo` dice si es la pestaña) y no las deja subir a los atajos del lienzo. Devuelve cómo quitarlo.
 */
export function instalarTeclasDelRegistro(panel: HTMLElement, activo: () => boolean, mensajes: () => HTMLElement | undefined): () => void {
  const f = (e: KeyboardEvent) => {
    if (!activo()) return
    const accion = teclaDelRegistro(combinacion(e))
    if (!accion) return
    e.stopPropagation()
    if (accion === 'copiar') return
    // Ni el navegador hace nada con ellas en un panel que no se edita: se cancelan para que nadie más las tome.
    e.preventDefault()
    const m = mensajes()
    if (accion !== 'seleccionar' || !m) return
    const r = document.createRange()
    r.selectNodeContents(m)
    const sel = getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
  }
  panel.addEventListener('keydown', f)
  return () => panel.removeEventListener('keydown', f)
}

/**
 * Pone `texto` en el portapapeles: primero con el evento `copy` (no pide permiso) y, si falla, con la API del portapapeles. Devuelve si se pudo.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  let puesto = false
  const alCopiar = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', texto)
    e.preventDefault()
    puesto = !!e.clipboardData
  }
  document.addEventListener('copy', alCopiar)
  try {
    document.execCommand('copy')
  } catch {
    puesto = false
  } finally {
    document.removeEventListener('copy', alCopiar)
  }
  if (puesto) return true
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}
