import { aplicar, fusionar, modificar } from '../../doc/comandos'
import { esGiro, transformarSeleccion, type Orientacion, type Transformacion } from '../../editor/acciones'
import { conflictoDeTocados } from '../../editor/conflictos'
import { choqueDeGrupo } from '../../editor/colision'
import { repararCable } from '../../editor/enrutar'
import { partirEnUniones } from '../../editor/normalizar'
import { seleccionVacia, type Seleccion } from '../../editor/seleccion'
import { motivoDeChoque } from '../motivos'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { piezaPorRef, sinPieza } from '../referencias'

type Transformar = Extract<Orden, { orden: 'transformar' }>

/** Igual que R, Shift+R, X e Y: con una pieza gira sobre su origen; con varias, el grupo entero sobre el centro de su caja. */
export function transformarOrden(est: Estado, o: Transformar): Plan | Rechazo {
  const { doc } = est
  const sel = seleccionVacia()
  for (const ref of o.refs) {
    const p = piezaPorRef(doc, ref)
    if (!p) return rechazo(sinPieza(ref))
    sel.piezas.add(p.id)
  }
  return transformarElegidos(est, sel, o.op)
}

/** Lo que hacen las teclas de giro y reflejo (o la orientación absoluta del inspector) con lo elegido. Un plan sin
 * cambios quiere decir que la selección no tiene piezas ni etiquetas que transformar. */
export function transformarElegidos(est: Estado, sel: Seleccion, op: Transformacion | Orientacion): Plan | Rechazo {
  const { doc, lib } = est
  const nombre = typeof op === 'object' ? 'orientar' : op
  let total = transformarSeleccion(doc, sel, op, lib)
  if (total.cambios.length === 0) return { cmd: total, creados: {}, avisos: [] }
  let d = aplicar(doc, total)
  // Las puntas que se estiraron hasta los pines nuevos se vuelven a enrutar si cruzan un cuerpo o hacen una vuelta en U.
  // Los cables elegidos giran con el grupo y conservan su forma: solo se reparan los que se estiraron.
  const estirados = [...new Set(total.cambios.filter((c) => c.col === 'cables' && !sel.cables.has(c.id)).map((c) => c.id))]
  for (const id of estirados) {
    const r = repararCable(d, lib, id)
    if (!r) continue
    const m = modificar(nombre, 'cables', d.cables[id], { ...d.cables[id], puntos: r })
    total = fusionar(total, m)
    d = aplicar(d, m)
  }
  const extra = partirEnUniones(d, est.gen)
  if (extra) {
    total = fusionar(total, extra)
    d = aplicar(d, extra)
  }
  const pieza = choqueDeGrupo(d, lib, [...sel.piezas].map((id) => d.piezas[id]).filter(Boolean), sel.piezas)
  const conflicto = pieza ? null : conflictoDeTocados(d, lib, { piezas: sel.piezas, cables: [...sel.cables, ...estirados] })
  if (pieza || conflicto) {
    const sujeto = sel.piezas.size === 1 ? doc.piezas[[...sel.piezas][0]]?.ref : null
    const verbo = typeof op === 'object' ? 'cambiar la orientación' : esGiro(op) ? 'girar' : 'reflejar'
    return rechazo(`${sujeto ? `${sujeto} no se pudo` : 'Las piezas no se pudieron'} ${verbo}: ${motivoDeChoque(d, pieza, conflicto)}.`)
  }
  return { cmd: total, creados: {}, avisos: [] }
}
