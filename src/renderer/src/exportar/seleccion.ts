import { sondasDe } from '../doc/sondas'
import { MM_POR_UNIDAD, type Coleccion, type Documento } from '../doc/tipos'
import { Indice } from '../editor/indice'
import { pantallaDeMedidor } from '../lienzo/medidores'
import { seleccionVacia, tamañoSeleccion, type Seleccion } from '../editor/seleccion'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'

/** Qué se exporta: el dibujo completo, solo lo seleccionado o lo que cruza un área. */
export type AlcanceExportar = 'todo' | 'seleccion' | 'area'

/** El área que se exporta, en milímetros del mundo (1 unidad = 1.25 mm). Vive en la sesión del diálogo, no en el documento ni en los ajustes. */
export interface AreaMm {
  x: number
  y: number
  ancho: number
  alto: number
}

/** El área en unidades de mundo, como caja. */
export const cajaDeArea = (a: AreaMm): Caja => ({ minX: a.x / MM_POR_UNIDAD, minY: a.y / MM_POR_UNIDAD, maxX: (a.x + a.ancho) / MM_POR_UNIDAD, maxY: (a.y + a.alto) / MM_POR_UNIDAD })

/** Documento con solo lo seleccionado (piezas, cables, etiquetas, notas, figuras y tabla de alimentaciones), sin tocar el
 * original. Los ids se buscan con `Object.hasOwn`; el que ya no está se ignora. null sin selección. */
export function documentoDeSeleccion(doc: Documento, sel: Seleccion): Documento | null {
  if (tamañoSeleccion(sel) === 0) return null
  const sub = (col: Coleccion) => {
    const fuente = (doc[col] ?? {}) as Record<string, unknown>
    return Object.fromEntries([...sel[col]].filter((id) => Object.hasOwn(fuente, id)).map((id) => [id, fuente[id]]))
  }
  const d = { piezas: sub('piezas'), cables: sub('cables'), etiquetas: sub('etiquetas'), notas: sub('notas') } as Documento
  const figuras = sub('figuras') as Documento['figuras']
  if (Object.keys(figuras ?? {}).length > 0) d.figuras = figuras
  const sondas = sub('sondas') as NonNullable<Documento['sondas']>
  if (Object.keys(sondas).length > 0) d.sondas = sondas
  if (!Object.values(d).some((c) => Object.keys(c ?? {}).length > 0)) return null
  // Los terminales de lo seleccionado dicen el voltaje de su riel: la tabla viaja entera.
  return doc.alimentaciones ? { ...d, alimentaciones: doc.alimentaciones } : d
}

const cruza = (a: Caja, b: Caja) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

/** Documento con lo que cruza el área `caja` (unidades de mundo): elementos cuya caja la toca, sondas dentro de ella y
 * medidores cuyo cuerpo la toca. No recorta: un cable que sale entra entero y la lámina lo corta. Null si no toca nada. */
export function documentoDeArea(doc: Documento, lib: Map<string, PiezaDef>, caja: Caja): Documento | null {
  const ind = new Indice()
  ind.reconstruir(doc, lib)
  const sel = seleccionVacia()
  for (const it of ind.buscar(caja)) sel[it.col].add(it.id)
  for (const s of Object.values(sondasDe(doc))) {
    const dentro = s.x >= caja.minX && s.x <= caja.maxX && s.y >= caja.minY && s.y <= caja.maxY
    if (dentro || (s.tipo === 'medidor' && cruza(pantallaDeMedidor(s).caja, caja))) sel.sondas.add(s.id)
  }
  return documentoDeSeleccion(doc, sel)
}

const INSTRUMENTOS = new Set(['multimetro', 'osciloscopio', 'generador', 'fuente-variable'])

/** Documento sin instrumentos: sin sus piezas, sin etiquetas en sus terminales y sin las de «Medir con…» («XSC1·A»,
 * «XMM1+»). No toca el original. */
export function documentoSinInstrumentos(doc: Documento, lib: Map<string, PiezaDef>): Documento {
  const fuera = Object.values(doc.piezas).filter((p) => INSTRUMENTOS.has(lib.get(p.tipo)?.modelo?.tipo ?? ''))
  if (fuera.length === 0) return doc
  const puntos = new Set(fuera.flatMap((p) => pinesEnMundo(p, lib.get(p.tipo)!).map((q) => `${q.x},${q.y}`)))
  const nombres = new Set(fuera.flatMap((p) => [`${p.ref}+`, ...['A', 'B', 'C', 'D'].map((c) => `${p.ref}·${c}`)]))
  const idsFuera = new Set(fuera.map((p) => p.id))
  return {
    ...doc,
    piezas: Object.fromEntries(Object.entries(doc.piezas).filter(([id]) => !idsFuera.has(id))),
    etiquetas: Object.fromEntries(Object.entries(doc.etiquetas).filter(([, e]) => !puntos.has(`${e.x},${e.y}`) && !nombres.has(e.nombre))),
    // Las sondas de los instrumentos se van con ellos; las de voltaje y de corriente quedan.
    ...(doc.sondas ? { sondas: Object.fromEntries(Object.entries(doc.sondas).filter(([, s]) => s.instrumento === undefined || !idsFuera.has(s.instrumento))) } : {})
  }
}
