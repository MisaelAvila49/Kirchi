import type { Conexiones } from '../../conexiones/conexiones'
import type { Id } from '../../doc/tipos'
import { borrarSeleccion } from '../../editor/acciones'
import { seleccionVacia, type Seleccion } from '../../editor/seleccion'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { medidorPorRef, piezaPorRef, resolverPatilla, resolverRed, sinPieza } from '../referencias'
import { extremosSueltos } from '../sueltos'

type Borrar = Extract<Orden, { orden: 'borrar' }>

export function borrarOrden(est: Estado, o: Borrar): Plan | Rechazo {
  const { doc } = est
  const sel = seleccionVacia()
  for (const ref of o.refs ?? []) {
    const p = piezaPorRef(doc, ref)
    const m = p ? undefined : medidorPorRef(doc, ref)
    if (p) sel.piezas.add(p.id)
    else if (m) sel.sondas.add(m.id)
    else return rechazo(sinPieza(ref))
  }
  for (const nombre of o.etiquetas ?? []) {
    const ids = Object.values(doc.etiquetas).filter((e) => e.nombre === nombre.trim()).map((e) => e.id)
    if (ids.length === 0) return rechazo(`No hay etiquetas con el nombre «${nombre}».`)
    for (const id of ids) sel.etiquetas.add(id)
  }
  for (const id of tramosDeEtiquetas(est, sel.etiquetas)) sel.cables.add(id)
  for (const texto of o.cables ?? []) {
    const ids = cablesDe(est, texto)
    if ('motivo' in ids) return rechazo(ids.motivo)
    if (ids.cables.length === 0) return rechazo(`${texto} no tiene cables.`)
    for (const id of ids.cables) sel.cables.add(id)
  }
  return borrarElegidos(est, sel)
}

/** El tramo corto que llevaba una etiqueta en su punta (el que ponen conectar y nombrar) se va con ella: sin la etiqueta
 * quedaría un cable colgando que parece una conexión que falta. */
function tramosDeEtiquetas(est: Estado, etiquetas: ReadonlySet<Id>): Id[] {
  if (etiquetas.size === 0) return []
  const { doc } = est
  const puntas = new Set([...etiquetas].map((id) => `${doc.etiquetas[id].x},${doc.etiquetas[id].y}`))
  const sinEllas = { ...doc, etiquetas: Object.fromEntries(Object.entries(doc.etiquetas).filter(([id]) => !etiquetas.has(id))) }
  return extremosSueltos(sinEllas, est.lib)
    .filter(({ cable, punto }) => doc.cables[cable].puntos.length === 2 && puntas.has(`${punto.x},${punto.y}`))
    .map(({ cable }) => cable)
}

/** Lo que hace Supr con lo elegido: piezas, cables, textos, figuras y las sondas que dependen de ellos, en un paso. */
export function borrarElegidos(est: Estado, sel: Seleccion): Plan | Rechazo {
  const cmd = borrarSeleccion(est.doc, sel)
  if (cmd.cambios.length === 0) return rechazo('No hay nada que borrar.')
  return { cmd, creados: {}, avisos: [] }
}

/** Una patilla da los cables que terminan en ella; una red, todos los suyos. */
function cablesDe(est: { doc: Estado['doc']; lib: Estado['lib']; con: Conexiones }, texto: string): { cables: Id[] } | { motivo: string } {
  const t = texto.trim()
  const pat = /^red de /i.test(t) ? null : resolverPatilla(est.doc, est.lib, t)
  if (pat) {
    if ('motivo' in pat) return pat
    const { x, y } = pat.punto
    const termina = (p: { x: number; y: number }) => p.x === x && p.y === y
    return { cables: Object.values(est.doc.cables).filter((c) => c.puntos.length >= 2 && (termina(c.puntos[0]) || termina(c.puntos[c.puntos.length - 1]))).map((c) => c.id) }
  }
  const r = resolverRed(est, t)
  return 'motivo' in r ? r : { cables: r.red.cables }
}
