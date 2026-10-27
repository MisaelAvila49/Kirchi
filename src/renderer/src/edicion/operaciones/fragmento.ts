import type { Comando } from '../../doc/comandos'
import { normalizar } from '../../buscador/buscar'
import { comandoDentroDelMundo, MOTIVO_FUERA_DEL_MUNDO } from '../../doc/limites'
import { MM_POR_UNIDAD, type Documento, type Punto } from '../../doc/tipos'
import { cuerpoEnMundo } from '../../editor/colision'
import { lugarParaPegar } from '../../editor/conflictos'
import { PASO_REJILLA } from '../../editor/rutas'
import type { PiezaDef } from '../../piezas/tipos'
import { pegar, type Fragmento } from '../../editor/portapapeles'
import type { Seleccion } from '../../editor/seleccion'
import { plantillasIncluidas } from '../../plantillas/almacen'
import { fragmentoParaColocar } from '../../plantillas/plantilla'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { MOTIVO_FUERA_DE_REJILLA, puntoAUnidades } from '../unidades'
import { MAX_PIEZAS_LOTE } from './lote'

type Fragmentos = Extract<Orden, { orden: 'fragmento' }>

/** De dónde sale un fragmento que no es una plantilla incluida: lo da quien llama (la carpeta del asistente), porque el
 * núcleo no toca el disco. */
export type LectorDeArchivos = (nombre: string) => Fragmento | { motivo: string }

const comoClave = (t: string): string => normalizar(t).replace(/[^a-z0-9]+/g, '-')

export interface Opciones {
  lector?: LectorDeArchivos
}

/** Pega una plantilla incluida o el `.kir` pedido, como Ctrl+V de la ventana: referencias renumeradas, redes con nombre
 * renombradas y, sin `en`, a la derecha de lo que hay. */
export function fragmentoOrden(est: Estado, o: Fragmentos, opciones: Opciones = {}): Plan | Rechazo {
  const { doc, lib } = est
  let f: Fragmento
  if (o.plantilla !== undefined) {
    const buscada = comoClave(o.plantilla)
    const { items } = plantillasIncluidas(lib)
    const item = items.find((i) => comoClave(i.nombre) === buscada || comoClave(i.clave) === buscada)
    if (!item) return rechazo(`No hay ninguna plantilla incluida llamada «${o.plantilla}».`)
    f = fragmentoParaColocar(item.fragmento)
  } else {
    if (!opciones.lector) return rechazo('Aquí no se pueden leer archivos.')
    const l = opciones.lector(o.archivo!)
    if ('motivo' in l) return rechazo(l.motivo)
    f = fragmentoParaColocar(l, true)
  }
  if (Object.keys(doc.piezas).length + f.piezas.length > MAX_PIEZAS_LOTE) return rechazo(`El circuito pasaría de ${MAX_PIEZAS_LOTE.toLocaleString('en-US')} piezas.`)

  const verbo = 'No se colocó el fragmento'
  let en: Punto
  const movido: string[] = []
  if (o.en) {
    const q = puntoAUnidades(o.en)
    if (!q) return rechazo(MOTIVO_FUERA_DE_REJILLA)
    const lugar = lugarParaPegar(doc, lib, f.piezas, f.cables, q, est.indice, 0)
    if (lugar.libre) en = lugar.en
    else if (!o.buscarLugar) return rechazo(`${verbo}: no hay lugar libre ahí.`)
    else {
      const libre = lugarLibre(est, f)
      if (!libre) return rechazo(`${verbo}: no hay lugar libre.`)
      en = libre.en
      movido.push(`Ahí no había lugar: se colocó ${mmDe(en)}, ${libre.donde} de lo que ya había.`)
    }
  } else {
    const libre = lugarLibre(est, f)
    if (!libre) return rechazo(`${verbo}: no hay lugar libre.`)
    en = libre.en
  }
  const r = pegarEn(est, f, en, true)
  if ('motivo' in r) return rechazo(`${verbo}: ${r.motivo}.`)
  r.avisos.unshift(...movido)
  const creados: Record<string, string> = {}
  for (const c of r.cmd.cambios) if (c.col === 'piezas' && c.antes === undefined) creados[(c.despues as { ref: string }).ref] = c.id
  return { cmd: { ...r.cmd, nombre: 'insertar plantilla' }, creados, avisos: r.avisos, verbo }
}

/** Pega `f` con su esquina en `en`, como Ctrl+V: referencias renumeradas y redes con nombre renombradas. Con `exacto` no se
 * corre por el camino. Devuelve también lo que queda seleccionado y los avisos para el Registro. */
export function pegarEn(est: Estado, f: Fragmento, en: Punto, exacto: boolean): { cmd: Comando; seleccion: Seleccion; avisos: string[] } | { motivo: string } {
  const r = pegar(est.doc, est.lib, f, en, est.gen, exacto)
  if (!comandoDentroDelMundo(r.cmd)) return { motivo: MOTIVO_FUERA_DEL_MUNDO }
  const avisos: string[] = []
  if (r.sinCanal) avisos.push(`${r.sinCanal} ${r.sinCanal === 1 ? 'sonda no se pegó porque su canal ya está' : 'sondas no se pegaron porque su canal ya está'} en uso.`)
  if (r.renombradas.length) avisos.push(`Se renombraron redes para que no se unan con las que ya hay: ${r.renombradas.map(([a, b]) => `${a} a ${b}`).join(', ')}.`)
  return { cmd: r.cmd, seleccion: r.seleccion, avisos }
}

/** Separación entre lo que ya hay y lo que se coloca: 10 mm. */
const MARGEN = 10 / MM_POR_UNIDAD
const aRejilla = (v: number): number => Math.ceil(v / PASO_REJILLA) * PASO_REJILLA

interface Caja {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function cajaDe(puntos: Iterable<Caja>): Caja | null {
  let c: Caja | null = null
  for (const p of puntos) c = c ? { minX: Math.min(c.minX, p.minX), minY: Math.min(c.minY, p.minY), maxX: Math.max(c.maxX, p.maxX), maxY: Math.max(c.maxY, p.maxY) } : { ...p }
  return c
}

const punto = (p: Punto): Caja => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })

/** Lo que ocupa el contenido: cuerpos de las piezas, cables, etiquetas y notas. */
function cajaDelContenido(doc: Pick<Documento, 'piezas' | 'cables' | 'etiquetas' | 'notas'>, lib: Map<string, PiezaDef>): Caja | null {
  const cajas: Caja[] = Object.values(doc.piezas).map((p) => cuerpoEnMundo(p, lib.get(p.tipo)))
  for (const c of Object.values(doc.cables)) cajas.push(...c.puntos.map(punto))
  for (const e of Object.values(doc.etiquetas)) cajas.push(punto(e))
  for (const n of Object.values(doc.notas)) cajas.push(punto(n))
  return cajaDe(cajas)
}

/** Un lugar libre para el fragmento: debajo de lo que hay, alineado a su izquierda y con 10 mm de aire; si no, a la derecha. */
function lugarLibre(est: Estado, f: Fragmento): { en: Punto; donde: 'debajo' | 'a la derecha' } | null {
  const { doc, lib } = est
  const propio = cajaDelContenido({ piezas: Object.fromEntries(f.piezas.map((p) => [p.id, p])), cables: Object.fromEntries(f.cables.map((c) => [c.id, c])), etiquetas: Object.fromEntries(f.etiquetas.map((e) => [e.id, e])), notas: {} }, lib) ?? punto({ x: 0, y: 0 })
  const hay = cajaDelContenido(doc, lib)
  const candidatos: { en: Punto; donde: 'debajo' | 'a la derecha' }[] = hay
    ? [
        { en: { x: aRejilla(hay.minX - propio.minX), y: aRejilla(hay.maxY + MARGEN - propio.minY) }, donde: 'debajo' },
        { en: { x: aRejilla(hay.maxX + MARGEN - propio.minX), y: aRejilla(hay.minY - propio.minY) }, donde: 'a la derecha' }
      ]
    : [{ en: { x: 0, y: 0 }, donde: 'debajo' }]
  for (const c of candidatos) {
    const lugar = lugarParaPegar(doc, lib, f.piezas, f.cables, c.en, est.indice)
    if (lugar.libre) return { en: lugar.en, donde: c.donde }
  }
  return null
}

/** El «en» de la orden que deja el fragmento ahí, en mm. */
const mmDe = (en: Punto): string => `en { x: ${en.x * MM_POR_UNIDAD}, y: ${en.y * MM_POR_UNIDAD} } mm`
