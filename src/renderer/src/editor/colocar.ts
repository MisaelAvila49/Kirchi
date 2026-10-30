import type { GeneradorId } from '../doc/ids'
import { siguienteReferencia } from '../doc/referencias'
import type { Cable, Documento, Etiqueta, Nota, Pieza, Punto, Rotacion } from '../doc/tipos'
import { anchoNotaAuto } from '../lienzo/medidas'
import { MAX_TEXTO_PROP, type PiezaDef, type PropDef } from '../piezas/tipos'
import { leerValor } from '../valores/valores'

/** Mayor condición inicial (V o A) que acepta el motor, la misma de las fuentes. */
const IC_MAX = 1e6

/** La propiedad que se muestra y se edita como «valor»: la primera sin `opciones` ni `texto`. */
export const propNumerica = (def: PiezaDef): PropDef | undefined => def.props.find((p) => !p.opciones && !p.texto && !p.ajuste)
/** Propiedad que llena el valor del buscador («r 4k7») o un chip de valores comunes: la numérica o, en un terminal de
 * alimentación, su nombre. */
export function propDelBuscador(def: PiezaDef): PropDef | undefined {
  const m = def.modelo
  return propNumerica(def) ?? (m?.tipo === 'alimentacion' ? def.props.find((p) => p.id === m.nombre) : undefined) ?? propModelo(def)
}

/** La lista de modelos de una pieza que se muestra («2N2222», «TL081»): la propiedad de lista con `mostrar`; undefined si no tiene. */
export const propModelo = (def: PiezaDef): PropDef | undefined => def.props.find((p) => p.mostrar && p.opciones && p.opciones.length > 0)

/** El modelo que lleva una pieza (el elegido o el de omisión) o, para una definición, `valor` o el de omisión; undefined si no tiene. */
export function modeloDe(def: PiezaDef, elegido?: string): string | undefined {
  const p = propModelo(def)
  return p ? (elegido && p.opciones!.includes(elegido) ? elegido : p.defecto) : undefined
}

/** «Transistor NPN · 2N2222»: el nombre de la pieza con su modelo, o solo el nombre si no tiene. */
export function nombreConModelo(def: PiezaDef, elegido?: string): string {
  const m = modeloDe(def, elegido)
  return m ? `${def.nombre.es} · ${m}` : def.nombre.es
}

export function nuevaPieza(doc: Documento, def: PiezaDef, en: Punto, rot: Rotacion, espejo: boolean, gen: GeneradorId, valor?: string): Pieza {
  const props: Record<string, string> = {}
  for (const pr of def.props) if (!pr.omitir) props[pr.id] = pr.defecto
  const num = propDelBuscador(def)
  if (valor !== undefined && num) props[num.id] = valor
  return { id: gen('p'), tipo: def.id, ref: siguienteReferencia(doc, def.prefijo), x: en.x, y: en.y, rot, espejo, props }
}

export const nuevaEtiqueta = (nombre: string, en: Punto, gen: GeneradorId): Etiqueta => ({ id: gen('e'), nombre: nombre.trim(), x: en.x, y: en.y, rot: 0 })

export const nuevaNota = (texto: string, en: Punto, gen: GeneradorId): Nota => ({ id: gen('n'), x: en.x, y: en.y, ancho: anchoNotaAuto(texto), texto })

export const nuevoCable = (puntos: Punto[], gen: GeneradorId): Cable => ({ id: gen('c'), puntos })

export function valorEditable(p: Pieza, def: PiezaDef): { prop: PropDef; texto: string } | null {
  const prop = propNumerica(def)
  return prop ? { prop, texto: p.props[prop.id] ?? prop.defecto } : null
}

/** Cambia una propiedad con validación: lista cerrada solo con sus opciones, texto libre de 1 a 24 caracteres sin
 * controles, y las demás en notación de ingeniería con la unidad de la propiedad. Guarda el texto. */
export function cambiarProp(p: Pieza, def: PiezaDef, propId: string, texto: string): { pieza: Pieza } | { error: string } {
  const prop = def.props.find((d) => d.id === propId)
  if (!prop) return { error: `${p.ref} no tiene la propiedad «${propId}».` }
  const t = texto.trim()
  const listo = { pieza: { ...p, props: { ...p.props, [prop.id]: t } } }
  if (prop.texto) {
    if (t === '') return { error: `${prop.nombre} no puede quedar vacío.` }
    const tope = prop.largoMax ?? MAX_TEXTO_PROP
    if (t.length > tope) return { error: `${prop.nombre} admite ${tope} caracteres como máximo.` }
    if (/\p{C}/u.test(t)) return { error: `${prop.nombre} no admite caracteres de control.` }
    return listo
  }
  if (prop.opciones) return prop.opciones.includes(t) ? listo : { error: `Elige una opción: ${prop.opciones.join(', ')}.` }
  if (prop.opcional && t === '') return listo
  const v = leerValor(t)
  if (!v) return { error: `«${t}» no es un valor válido.` }
  if (v.unidad && prop.unidad && v.unidad !== prop.unidad) return { error: `Se esperaba un valor en ${prop.unidad}.` }
  // La condición inicial de un capacitor o inductor tiene el mismo tope que una fuente; el motor rechaza más.
  const m = def.modelo
  if ((m?.tipo === 'C' || m?.tipo === 'L') && m.ic === propId && !(Math.abs(v.valor) <= IC_MAX)) return { error: `${prop.nombre} admite hasta ${IC_MAX.toLocaleString('en-US')} ${prop.unidad}.` }
  return listo
}

export function cambiarValor(p: Pieza, def: PiezaDef, texto: string): { pieza: Pieza } | { error: string } {
  const prop = propNumerica(def)
  if (!prop) return { error: `${p.ref} no tiene un valor editable.` }
  return cambiarProp(p, def, prop.id, texto)
}
