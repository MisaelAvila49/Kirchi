import { aplicar, fusionar, modificar, type Comando } from '../../doc/comandos'
import type { Documento, Id, Pieza } from '../../doc/tipos'
import { pasoArrastre, planArrastre } from '../../editor/arrastre'
import { choqueDeGrupo } from '../../editor/colision'
import { repararCable } from '../../editor/enrutar'
import { insertarEnCable } from '../../editor/insertar'
import { partirEnUniones } from '../../editor/normalizar'
import { conflictoDeTocados } from '../../editor/conflictos'
import { seleccionVacia, type Seleccion } from '../../editor/seleccion'
import { comandoDentroDelMundo, MOTIVO_FUERA_DEL_MUNDO } from '../../doc/limites'
import { motivoDeChoque } from '../motivos'
import type { Orden } from '../ordenes'
import { esRechazo, rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { piezaPorRef, sinPieza } from '../referencias'
import { MOTIVO_FUERA_DE_REJILLA, puntoAUnidades } from '../unidades'

type Mover = Extract<Orden, { orden: 'mover' }>

/** Lo que hace soltar un arrastre o pulsar una flecha: los cables siguen a la pieza, los estirados se reparan y una
 * pieza de dos pines sobre un cable queda en serie. */
export function moverOrden(est: Estado, o: Mover): Plan | Rechazo {
  const { doc, lib } = est
  const piezas: Pieza[] = []
  for (const ref of o.refs) {
    const p = piezaPorRef(doc, ref)
    if (!p) return rechazo(sinPieza(ref))
    if (!piezas.includes(p)) piezas.push(p)
  }
  const destino = puntoAUnidades((o.a ?? o.desplazar)!)
  if (!destino) return rechazo(MOTIVO_FUERA_DE_REJILLA)
  const dx = o.a ? destino.x - piezas[0].x : destino.x
  const dy = o.a ? destino.y - piezas[0].y : destino.y
  const vacio: Plan = { cmd: { nombre: 'mover', cambios: [] }, creados: {}, avisos: [] }
  if (dx === 0 && dy === 0) return vacio

  const sel = seleccionVacia()
  for (const p of piezas) sel.piezas.add(p.id)
  const plan = moverElegidos(est, sel, dx, dy)
  if (esRechazo(plan)) return plan
  return plan.cmd.cambios.length === 0 ? vacio : { ...plan, cmd: { ...plan.cmd, nombre: 'mover' } }
}

/** Lo que hacen soltar un arrastre y las flechas con lo elegido (`dx`, `dy` en unidades): los cables siguen, los
 * estirados se reparan y una pieza de dos pines sobre un cable queda en serie. Un plan sin cambios quiere decir que no
 * había nada que mover. */
export function moverElegidos(est: Estado, sel: Seleccion, dx: number, dy: number): Plan | Rechazo {
  const { doc, lib } = est
  let d = doc
  let total: Comando | null = null
  const sumar = (c: Comando | null) => {
    if (!c || c.cambios.length === 0) return
    total = total ? fusionar(total, c) : c
    d = aplicar(d, c)
  }
  sumar(partirEnUniones(d, est.gen))
  const plan = planArrastre(d, lib, sel)
  sumar(pasoArrastre(plan, dx, dy))
  const estirados = plan.estirados.map((e) => e.cable.id)
  completar(est, sel, estirados, () => d, sumar)
  const cmd = total as Comando | null
  if (!cmd) return { cmd: { nombre: 'mover', cambios: [] }, creados: {}, avisos: [] }
  const choque = choqueDeGrupo(d, lib, [...sel.piezas].map((id) => d.piezas[id]).filter(Boolean), sel.piezas)
  const conflicto = choque ? null : conflictoDeTocados(d, lib, { piezas: sel.piezas, cables: [...sel.cables, ...estirados] })
  const fuera = !choque && !conflicto && !comandoDentroDelMundo(cmd)
  if (choque || conflicto || fuera) return rechazo(`No se pudo mover la selección: ${fuera ? MOTIVO_FUERA_DEL_MUNDO : motivoDeChoque(d, choque, conflicto)}.`)
  return { cmd, creados: {}, avisos: [], verbo: 'No se pudo mover la selección' }
}

/** Lo que falta tras mover: una pieza de dos pines sobre un cable queda en serie, los cables estirados que cruzan un
 * cuerpo o hacen una vuelta en U se reenrutan y las uniones en T se parten. Cada paso lee el documento que dejó el anterior. */
function completar(est: Estado, sel: Seleccion, estirados: Id[], doc: () => Documento, sumar: (c: Comando | null) => void): void {
  const { lib } = est
  for (const id of sel.piezas) {
    const p = doc().piezas[id]
    if (p) sumar(insertarEnCable(doc(), lib, p, est.gen, sel.cables))
  }
  for (const id of estirados) {
    const c = doc().cables[id]
    const r = c ? repararCable(doc(), lib, id) : null
    if (c && r) sumar(modificar('enrutar', 'cables', c, { ...c, puntos: r }))
  }
  sumar(partirEnUniones(doc(), est.gen))
}

/** Lo que hay que añadir al paso de un arrastre ya hecho, vivo en el documento, al soltarlo (`estirados` son los cables
 * que se estiraron con las piezas). Rechaza, con la causa, si el resultado rompería el invariante de cables. */
export function ajustesAlSoltar(est: Estado, sel: Seleccion, estirados: Id[]): { cmd: Comando | null } | Rechazo {
  let d = est.doc
  let total: Comando | null = null
  const sumar = (c: Comando | null) => {
    if (!c || c.cambios.length === 0) return
    total = total ? fusionar(total, c) : c
    d = aplicar(d, c)
  }
  completar(est, sel, estirados, () => d, sumar)
  // El invariante: ningún cable atraviesa una pieza ni corre encima de otra red.
  const conflicto = conflictoDeTocados(d, est.lib, { piezas: sel.piezas, cables: [...sel.cables, ...estirados] })
  return conflicto ? rechazo(motivoDeChoque(d, null, conflicto)) : { cmd: total }
}

/** Al soltar un tramo de cable arrastrado: parte las uniones en T que resulten y revisa el cable movido y los trozos
 * nuevos (`antes` son los cables que había al empezar a soltar). */
export function ajustesAlSoltarTramo(est: Estado, tramo: Id, antes: Set<Id>): { cmd: Comando | null } | Rechazo {
  const extra = partirEnUniones(est.doc, est.gen)
  const d = extra ? aplicar(est.doc, extra) : est.doc
  // El cable arrastrado y los trozos en que lo partan las uniones nuevas.
  const tocados = Object.keys(d.cables).filter((id) => id === tramo || !antes.has(id))
  const conflicto = conflictoDeTocados(d, est.lib, { cables: tocados })
  return conflicto ? rechazo(motivoDeChoque(d, null, conflicto)) : { cmd: extra }
}
