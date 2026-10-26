import { documentoVacio, type Documento, type Pieza, type Punto, type Rotacion } from '../doc/tipos'
import { enrutar } from '../editor/enrutar'
import { anchoNotaAuto } from '../lienzo/medidas'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'

/** Arma un circuito desde piezas con posición y conexiones pin a pin que enruta el mismo A* del editor. Lo usan las
 * plantillas incluidas (`prueba/plantillasIncluidas.ts`) y «Generar circuito». */

export type Parte = [clave: string, tipo: string, x: number, y: number, rot: Rotacion, props?: Record<string, string>, textos?: Pieza['textos']]

export interface DefCircuito {
  partes: Parte[]
  /** Pares `clave.pin`: se enrutan en este orden. */
  conexiones: [string, string][]
  /** Cables ya trazados (tramos en rejilla fina): con ellos no se enruta y `conexiones` solo comprueba que cada pin
   * exista. Los de las calculadoras vienen de `calculadoras/disposicion.ts`. */
  cables?: Punto[][]
  /** Etiquetas de red ya puestas (sobre un vértice o una punta de cable: no mueven nada). */
  etiquetas?: { nombre: string; x: number; y: number; rot: Rotacion }[]
  /** Nota con la fórmula o la lectura, a la derecha o debajo del dibujo. */
  nota?: { x: number; y: number; texto: string }
}

const prefijoDe = (lib: Map<string, PiezaDef>, tipo: string) => lib.get(tipo)?.prefijo ?? 'X'

/** Arma el documento de una definición con el enrutador del editor. Lanza si falta una pieza o un pin. */
export function armar(def: DefCircuito, lib: Map<string, PiezaDef>, nombre = 'circuito'): Documento {
  const d = documentoVacio()
  const cuenta = new Map<string, number>()
  const pines = new Map<string, Punto>()
  for (const [clave, tipo, x, y, rot, props, textos] of def.partes) {
    const pd = lib.get(tipo)
    if (!pd) throw new Error(`${nombre}: no existe la pieza ${tipo}`)
    const prefijo = prefijoDe(lib, tipo)
    const n = (cuenta.get(prefijo) ?? 0) + 1
    cuenta.set(prefijo, n)
    const p: Pieza = { id: `p_${clave}`, tipo, ref: `${prefijo}${n}`, x, y, rot, espejo: false, props: props ?? {}, ...(textos ? { textos: { ...textos } } : {}) }
    d.piezas[p.id] = p
    for (const q of pinesEnMundo(p, pd)) pines.set(`${clave}.${q.id}`, { x: q.x, y: q.y })
  }
  let k = 0
  for (const [a, b] of def.conexiones) {
    const pa = pines.get(a), pb = pines.get(b)
    if (!pa || !pb) throw new Error(`${nombre}: conexión ${a} - ${b}: falta un pin`)
    if (def.cables) continue
    const puntos = enrutar(d, lib, pa, pb)
    const id = `c_${++k}`
    d.cables[id] = { id, puntos }
  }
  for (const c of def.cables ?? []) {
    const id = `c_${++k}`
    d.cables[id] = { id, puntos: c.map((q) => ({ x: q.x, y: q.y })) }
  }
  def.etiquetas?.forEach((e, i) => {
    const id = `e_${i + 1}`
    d.etiquetas[id] = { id, nombre: e.nombre, x: e.x, y: e.y, rot: e.rot }
  })
  if (def.nota) {
    // Sin caja y en gris: la nota explica, no compite con el dibujo.
    const formato = { tinta: 'gris', contorno: 'ninguno' } as const
    const nota = { id: 'n_1', x: def.nota.x, y: def.nota.y, ancho: anchoNotaAuto(def.nota.texto, formato), texto: def.nota.texto, formato }
    d.notas[nota.id] = nota
  }
  return d
}
