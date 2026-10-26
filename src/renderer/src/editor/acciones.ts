import { borrar, juntar, modificar, type Comando } from '../doc/comandos'
import type { Documento, Figura, Punto, Rotacion, SentidoSonda } from '../doc/tipos'
import { cajaNota } from '../lienzo/medidas'
import { cajaEnMundo, girar, pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { clave, estirar } from './arrastre'
import { limpiarPolilinea } from './rutas'
import { tamañoSeleccion, type Seleccion } from './seleccion'
import { sondasDeLasPiezas } from './sondas'

/** `girar` es 90° a la derecha (R) y `girarIzq` 90° a la izquierda (Shift+R), ambos en sentido de pantalla. */
export type Transformacion = 'girar' | 'girarIzq' | 'espejoX' | 'espejoY'

export const esGiro = (op: Transformacion | Orientacion): op is 'girar' | 'girarIzq' => op === 'girar' || op === 'girarIzq'
/** Giro y reflejo absolutos (botones Posición del inspector). */
export interface Orientacion {
  rot: Rotacion
  espejo: boolean
}

export function orientar(rot: Rotacion, espejo: boolean, op: Transformacion | Orientacion): Orientacion {
  if (typeof op === 'object') return { rot: op.rot, espejo: op.espejo }
  if (op === 'girar') return { rot: girar(rot, 1), espejo }
  if (op === 'girarIzq') return { rot: girar(rot, -1), espejo }
  if (op === 'espejoX') return { rot: ((360 - rot) % 360) as Rotacion, espejo: !espejo }
  return { rot: ((540 - rot) % 360) as Rotacion, espejo: !espejo }
}

/** Giro de una etiqueta tras una transformación. La bandera es simétrica respecto de su eje: X cambia 0° por 180°, Y
 * cambia 90° por 270°.
 * La punta es el punto de conexión y no se mueve. */
export function rotEtiqueta(rot: Rotacion, op: Transformacion): Rotacion {
  if (esGiro(op)) return girar(rot, op === 'girar' ? 1 : -1)
  return ((((op === 'espejoX' ? 180 : 0) - rot) % 360) + 360) % 360 as Rotacion
}

/** Con dos o más elementos, R, Shift+R, X e Y transforman la selección entera alrededor del centro de su caja, ajustado a
 * la rejilla de 2.5 mm, en un solo comando.
 * Las puntas de cables no elegidos que llegan a un pin movido se estiran hasta el pin nuevo. */
function transformarGrupo(doc: Documento, sel: Seleccion, op: Transformacion, lib?: Map<string, PiezaDef>): Comando {
  // Caja de todo lo elegido.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const cubrir = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const id of sel.piezas) {
    const p = doc.piezas[id]
    if (!p) continue
    const def = lib?.get(p.tipo)
    if (def) {
      const c = cajaEnMundo(p, def)
      cubrir(c.minX, c.minY)
      cubrir(c.maxX, c.maxY)
    } else cubrir(p.x, p.y)
  }
  for (const id of sel.cables) for (const q of doc.cables[id]?.puntos ?? []) cubrir(q.x, q.y)
  for (const id of sel.etiquetas) if (doc.etiquetas[id]) cubrir(doc.etiquetas[id].x, doc.etiquetas[id].y)
  for (const id of sel.notas) {
    const n = doc.notas[id]
    if (!n) continue
    const c = cajaNota(n)
    cubrir(c.minX, c.minY)
    cubrir(c.maxX, c.maxY)
  }
  for (const id of sel.figuras) {
    const f = doc.figuras?.[id]
    if (f) {
      cubrir(f.x1, f.y1)
      cubrir(f.x2, f.y2)
    }
  }
  for (const id of sel.sondas) if (doc.sondas?.[id]) cubrir(doc.sondas[id].x, doc.sondas[id].y)
  if (minX === Infinity) return juntar(op, [])
  const cx = 2 * Math.round((minX + maxX) / 4), cy = 2 * Math.round((minY + maxY) / 4)
  const mover = (x: number, y: number): Punto => {
    if (op === 'girar') return { x: cx + cy - y + 0, y: cy - cx + x + 0 }
    if (op === 'girarIzq') return { x: cx - cy + y + 0, y: cy + cx - x + 0 }
    if (op === 'espejoX') return { x: 2 * cx - x + 0, y: y + 0 }
    return { x: x + 0, y: 2 * cy - y + 0 }
  }
  const cmds: Comando[] = []
  const nuevosPuntos = new Map<string, Punto>()
  for (const id of sel.piezas) {
    const p = doc.piezas[id]
    if (!p) continue
    const q = { ...p, ...mover(p.x, p.y), ...orientar(p.rot, p.espejo, op) }
    cmds.push(modificar(op, 'piezas', p, q))
    const def = lib?.get(p.tipo)
    if (def) {
      const despues = pinesEnMundo(q, def)
      pinesEnMundo(p, def).forEach((pin, i) => nuevosPuntos.set(clave(pin), { x: despues[i].x, y: despues[i].y }))
    }
  }
  for (const id of sel.cables) {
    const c = doc.cables[id]
    if (c) cmds.push(modificar(op, 'cables', c, { ...c, puntos: c.puntos.map((q) => mover(q.x, q.y)) }))
  }
  for (const id of sel.etiquetas) {
    const e = doc.etiquetas[id]
    if (!e) continue
    const m = mover(e.x, e.y)
    cmds.push(modificar(op, 'etiquetas', e, { ...e, ...m, rot: rotEtiqueta(e.rot, op) }))
    // Los cables sin elegir que llegan a la punta la siguen, como los que llegan al pin de una pieza.
    nuevosPuntos.set(clave(e), m)
  }
  for (const id of sel.notas) {
    const n = doc.notas[id]
    if (!n) continue
    // La caja no gira: su centro va al lugar nuevo y la esquina se ajusta a la rejilla fina.
    const c = cajaNota(n)
    const m = mover((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2)
    cmds.push(modificar(op, 'notas', n, { ...n, x: Math.round(m.x - (c.maxX - c.minX) / 2) + 0, y: Math.round(m.y - (c.maxY - c.minY) / 2) + 0 }))
  }
  for (const id of sel.figuras) {
    const f = doc.figuras?.[id]
    if (!f) continue
    const a = mover(f.x1, f.y1), b = mover(f.x2, f.y2)
    const g: Figura = f.tipo === 'rectangulo' || f.tipo === 'elipse'
      ? { ...f, x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }
      : { ...f, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    cmds.push(modificar(op, 'figuras', f, g))
  }
  for (const id of sel.sondas) {
    const s = doc.sondas?.[id]
    if (!s) continue
    const m = mover(s.x, s.y)
    cmds.push(modificar(op, 'sondas', s, { ...s, ...m, ...(s.sentido ? { sentido: sentidoGirado(s.sentido, op) } : {}) }))
  }
  if (nuevosPuntos.size) {
    for (const c of Object.values(doc.cables)) {
      if (sel.cables.has(c.id) || c.puntos.length < 2) continue
      let pts = c.puntos
      const ini = nuevosPuntos.get(clave(pts[0]))
      if (ini) pts = limpiarPolilinea([...estirar(pts[0], pts[1], ini), ...pts.slice(1)])
      const fin = pts.length >= 2 ? nuevosPuntos.get(clave(c.puntos[c.puntos.length - 1])) : undefined
      if (fin) {
        const r = [...pts].reverse()
        pts = limpiarPolilinea([...estirar(r[0], r[1], fin), ...r.slice(1)]).reverse()
      }
      if (pts !== c.puntos) cmds.push(modificar(op, 'cables', c, { ...c, puntos: pts }))
    }
  }
  return juntar(op, cmds)
}

const SENTIDOS_EN_ORDEN: SentidoSonda[] = ['derecha', 'abajo', 'izquierda', 'arriba']
function sentidoGirado(s: SentidoSonda, op: Transformacion): SentidoSonda {
  if (op === 'girar') return SENTIDOS_EN_ORDEN[(SENTIDOS_EN_ORDEN.indexOf(s) + 1) % 4]
  if (op === 'girarIzq') return SENTIDOS_EN_ORDEN[(SENTIDOS_EN_ORDEN.indexOf(s) + 3) % 4]
  if (op === 'espejoX') return s === 'derecha' ? 'izquierda' : s === 'izquierda' ? 'derecha' : s
  return s === 'arriba' ? 'abajo' : s === 'abajo' ? 'arriba' : s
}

/** Como Proteus, con UN elemento solo cambian las PIEZAS (y las etiquetas, en su punta). Ningún cable gira: con `lib`, las
 * puntas que llegan a un pin movido se estiran y el editor las reenruta. Con una `Orientacion` cada pieza queda con ese
 * giro y reflejo. */
export function transformarSeleccion(doc: Documento, sel: Seleccion, op: Transformacion | Orientacion, lib?: Map<string, PiezaDef>): Comando {
  if (typeof op !== 'object' && tamañoSeleccion(sel) >= 2) return transformarGrupo(doc, sel, op, lib)
  const nombre = typeof op === 'object' ? 'orientar' : op
  const cmds: Comando[] = []
  const nuevosPuntos = new Map<string, Punto>()
  for (const id of sel.piezas) {
    const p = doc.piezas[id]
    if (!p) continue
    const q = { ...p, ...orientar(p.rot, p.espejo, op) }
    if (q.rot === p.rot && q.espejo === p.espejo) continue
    cmds.push(modificar(nombre, 'piezas', p, q))
    const def = lib?.get(p.tipo)
    if (def) {
      const despues = pinesEnMundo(q, def)
      pinesEnMundo(p, def).forEach((pin, i) => {
        // Solo x e y: el resultado de pinesEnMundo trae también el id del pin, que no va en un cable.
        if (pin.x !== despues[i].x || pin.y !== despues[i].y) nuevosPuntos.set(clave(pin), { x: despues[i].x, y: despues[i].y })
      })
    }
  }
  // Una orientación absoluta (inspector) no toca las etiquetas; girar y reflejar sí, cada una sobre su punta.
  if (typeof op !== 'object')
    for (const id of sel.etiquetas) {
      const e = doc.etiquetas[id]
      if (e) cmds.push(modificar(nombre, 'etiquetas', e, { ...e, rot: rotEtiqueta(e.rot, op) }))
    }
  if (nuevosPuntos.size) {
    for (const c of Object.values(doc.cables)) {
      if (c.puntos.length < 2) continue
      let pts = c.puntos
      const ini = nuevosPuntos.get(clave(pts[0]))
      if (ini) pts = limpiarPolilinea([...estirar(pts[0], pts[1], ini), ...pts.slice(1)])
      const fin = pts.length >= 2 ? nuevosPuntos.get(clave(c.puntos[c.puntos.length - 1])) : undefined
      if (fin) {
        const r = [...pts].reverse()
        pts = limpiarPolilinea([...estirar(r[0], r[1], fin), ...r.slice(1)]).reverse()
      }
      if (pts !== c.puntos) cmds.push(modificar(nombre, 'cables', c, { ...c, puntos: pts }))
    }
  }
  return juntar(nombre, cmds)
}

export function borrarSeleccion(doc: Documento, sel: Seleccion): Comando {
  const cmds: Comando[] = []
  for (const id of sel.piezas) if (doc.piezas[id]) cmds.push(borrar('borrar', 'piezas', doc.piezas[id]))
  for (const id of sel.cables) if (doc.cables[id]) cmds.push(borrar('borrar', 'cables', doc.cables[id]))
  for (const id of sel.etiquetas) if (doc.etiquetas[id]) cmds.push(borrar('borrar', 'etiquetas', doc.etiquetas[id]))
  for (const id of sel.notas) if (doc.notas[id]) cmds.push(borrar('borrar', 'notas', doc.notas[id]))
  for (const id of sel.figuras) {
    const f = doc.figuras?.[id]
    if (f) cmds.push(borrar('borrar', 'figuras', f))
  }
  // Las sondas elegidas y las de cada instrumento que se borra, cada una una sola vez.
  const sondas = new Set([...sel.sondas].filter((id) => doc.sondas?.[id]))
  for (const s of sondasDeLasPiezas(doc, sel.piezas)) sondas.add(s.id)
  for (const id of [...sondas].sort()) cmds.push(borrar('borrar', 'sondas', doc.sondas![id]))
  return juntar('borrar', cmds)
}
