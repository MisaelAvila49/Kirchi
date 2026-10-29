import { copiarAnotaciones, type EstiloTexto, type TextoFijo } from '../../../../../compartido/grafica/anotaciones'
import type { AspectoTraza } from '../../../../../compartido/grafica/aspecto'
import type { EstadoEditor } from './edicion'
import { mismaSeleccion, type Seleccion } from './objetos'

/**
 * Elegir varios objetos de la figura a la vez (Mayús o Ctrl y clic) y cambiarlos juntos. Solo se juntan objetos del mismo tipo: así una propiedad compartida (color, tamaño, grosor) significa lo mismo para todos. Lo propio de cada uno (el texto, la posición, los extremos de una flecha) no se copia.
 */

/** Lo elegido: el objeto principal (el que enseña el panel) y los que se le suman. */
export interface Grupo {
  sel: Seleccion | null
  extras: readonly Seleccion[]
}

/** Aviso de la ventana para el tutorial: la figura tuvo varios elegidos, un cambio aplicado a varios o se eligió el preajuste «Informe». */
export const EVENTO_FIGURA = 'kirchi:figura'
export function avisarFigura(detalle: 'seleccion-multiple' | 'cambio-multiple' | 'informe'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_FIGURA, { detail: detalle }))
}

/**
 * Mayús o Ctrl y clic sobre `hit`: lo suma al grupo si es del mismo tipo que el principal, lo quita si ya estaba, y si es de otro tipo empieza un grupo nuevo con él.
 */
export function sumarAlGrupo(g: Grupo, hit: Seleccion): Grupo {
  const { sel, extras } = g
  if (!sel || sel.tipo !== hit.tipo) return { sel: hit, extras: [] }
  if (mismaSeleccion(sel, hit)) return extras.length > 0 ? { sel: extras[0], extras: extras.slice(1) } : g
  if (extras.some((x) => mismaSeleccion(x, hit))) return { sel, extras: extras.filter((x) => !mismaSeleccion(x, hit)) }
  return { sel, extras: [...extras, hit] }
}

/** Todos los elegidos, el principal primero. */
export const todosLosElegidos = (g: Grupo): Seleccion[] => (g.sel ? [g.sel, ...g.extras] : [])

type Campos = Record<string, unknown>

/** Copia a `destino` los campos de `claves` que cambiaron entre `antes` y `despues`; un campo que desapareció se quita del destino. */
function copiarCambios(antes: Campos | undefined, despues: Campos | undefined, destino: Campos, claves: readonly string[]): boolean {
  let hubo = false
  for (const k of claves) {
    const a = antes?.[k], b = despues?.[k]
    if (a === b) continue
    hubo = true
    if (b === undefined || b === null) delete destino[k]
    else destino[k] = b
  }
  return hubo
}

const pick = (c: Campos | undefined, claves: readonly string[]): Campos => Object.fromEntries(claves.filter((k) => c?.[k] !== undefined).map((k) => [k, c![k]]))
const CAMPOS_TEXTO = ['tam', 'negrita', 'tono'] as const
const CAMPOS_FLECHA = ['grosor', 'tono'] as const
const CAMPOS_ETIQUETA = ['tono'] as const
const CAMPOS_EJE = ['tono', 'peso', 'tam', 'grosor'] as const
const CAMPOS_TRAZA = ['color', 'grosor', 'lado', 'prefijo', 'decimales'] as const
const CAMPOS_TRAZA_DE_EJE = ['lado', 'prefijo', 'decimales'] as const
const fijoDe = (id: string): TextoFijo => (id === 'subtitulo' ? 'subtitulo' : 'titulo')

/**
 * Lleva a los demás elegidos lo que una edición `antes → despues` cambió en el objeto principal. Sin grupo, o si nada compartible cambió, devuelve `despues` tal cual.
 */
export function propagar(antes: EstadoEditor, despues: EstadoEditor, sel: Seleccion | null, extras: readonly Seleccion[], claveDeTraza: (id: string) => string, forzar: readonly string[] = []): EstadoEditor {
  if (!sel || extras.length === 0 || (antes === despues && forzar.length === 0)) return despues
  const otros = extras.filter((x) => x.tipo === sel.tipo)
  if (otros.length === 0) return despues
  const anot = copiarAnotaciones(despues.anot)
  const trazas: Record<string, Partial<AspectoTraza>> = { ...despues.trazas }
  let hubo = false
  const alTraza = (kP: string, kO: string, claves: readonly string[]) => {
    const dest = { ...(trazas[kO] ?? {}) } as Campos
    let cambio = copiarCambios(antes.trazas[kP] as Campos | undefined, despues.trazas[kP] as Campos | undefined, dest, claves)
    // Elegir en el grupo el valor que el principal ya tenía no cambia al principal, pero sí debe igualar a los demás.
    if (kP !== kO) cambio = copiarCambios({}, pick(despues.trazas[kP] as Campos | undefined, forzar), dest, forzar) || cambio
    if (cambio) {
      trazas[kO] = dest as Partial<AspectoTraza>
      hubo = true
    }
  }
  if (sel.tipo === 'texto') {
    const a = antes.anot.textos.find((t) => t.id === sel.id), b = despues.anot.textos.find((t) => t.id === sel.id)
    for (const o of otros) {
      const n = anot.textos.find((t) => t.id === o.id)
      if (n && copiarCambios(a as Campos | undefined, b as Campos | undefined, n as unknown as Campos, CAMPOS_TEXTO)) hubo = true
    }
  } else if (sel.tipo === 'flecha') {
    const a = antes.anot.flechas.find((t) => t.id === sel.id), b = despues.anot.flechas.find((t) => t.id === sel.id)
    for (const o of otros) {
      const n = anot.flechas.find((t) => t.id === o.id)
      if (n && copiarCambios(a as Campos | undefined, b as Campos | undefined, n as unknown as Campos, CAMPOS_FLECHA)) hubo = true
    }
  } else if (sel.tipo === 'etiqueta') {
    const a = antes.anot.etiquetas.find((t) => t.id === sel.id), b = despues.anot.etiquetas.find((t) => t.id === sel.id)
    for (const o of otros) {
      const n = anot.etiquetas.find((t) => t.id === o.id)
      if (n && copiarCambios(a as Campos | undefined, b as Campos | undefined, n as unknown as Campos, CAMPOS_ETIQUETA)) hubo = true
    }
  } else if (sel.tipo === 'fijo') {
    const a = antes.anot.estilos[fijoDe(sel.id)], b = despues.anot.estilos[fijoDe(sel.id)]
    for (const o of otros) {
      const k = fijoDe(o.id)
      const dest: EstiloTexto = { ...(anot.estilos[k] ?? {}) }
      if (copiarCambios(a as Campos | undefined, b as Campos | undefined, dest as Campos, CAMPOS_TEXTO)) {
        hubo = true
        if (Object.keys(dest).length === 0) delete anot.estilos[k]
        else anot.estilos[k] = dest
      }
    }
  } else if (sel.tipo === 'traza') {
    for (const o of otros) alTraza(claveDeTraza(sel.id), claveDeTraza(o.id), CAMPOS_TRAZA)
  } else if (sel.tipo === 'eje') {
    const llave = (id: string) => id.slice(4)
    const a = antes.anot.ejes[llave(sel.id)], b = despues.anot.ejes[llave(sel.id)]
    for (const o of otros) {
      const k = llave(o.id)
      const dest = { ...(anot.ejes[k] ?? {}) } as Campos
      if (copiarCambios(a as Campos | undefined, b as Campos | undefined, dest, CAMPOS_EJE)) {
        hubo = true
        if (Object.keys(dest).length === 0) delete anot.ejes[k]
        else anot.ejes[k] = dest
      }
      // El eje de una traza también guarda su lado, su unidad y sus decimales en la traza (el eje horizontal no).
      if (llave(sel.id) !== 'x' && k !== 'x') alTraza(claveDeTraza(llave(sel.id).split('#')[0]), claveDeTraza(k.split('#')[0]), CAMPOS_TRAZA_DE_EJE)
    }
  }
  return hubo ? { ...despues, anot, trazas } : despues
}
