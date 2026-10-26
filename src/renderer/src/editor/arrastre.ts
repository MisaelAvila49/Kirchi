import { juntar, modificar, type Comando } from '../doc/comandos'
import type { Cable, Documento, Id, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { limpiarPolilinea } from './rutas'
import type { Seleccion } from './seleccion'

export const clave = (p: Punto) => `${p.x},${p.y}`
export const mas = (p: Punto, dx: number, dy: number): Punto => ({ x: p.x + dx, y: p.y + dy })

/** Extremo `p` que pasa a `p2`, con vecino `q`: agrega la esquina que conserva la orientación del tramo hacia `q`. */
export function estirar(p: Punto, q: Punto, p2: Punto): Punto[] {
  if (p.y === q.y && p.x !== q.x) return [p2, { x: p2.x, y: q.y }]
  if (p.x === q.x && p.y !== q.y) return [p2, { x: q.x, y: p2.y }]
  return [p2]
}

/** Cable sin seleccionar con extremos sobre algo que se mueve. */
interface Estirado {
  cable: Cable
  ini: boolean
  fin: boolean
}

/** Lo que un arrastre necesita y no cambia mientras dura: se calcula una vez al empezar, y cada paso cuesta solo la
 * selección y sus cables. */
export interface PlanArrastre {
  doc: Documento
  sel: Seleccion
  estirados: Estirado[]
  /** Cables seleccionados cuyos extremos están sobre algo que no se mueve: se quedan clavados ahí. */
  clavados: Map<Id, { ini: boolean; fin: boolean }>
}

export function planArrastre(doc: Documento, lib: Map<string, PiezaDef>, sel: Seleccion): PlanArrastre {
  const movidos = new Set<string>()
  for (const id of sel.piezas) {
    const p = doc.piezas[id]
    const def = p ? lib.get(p.tipo) : undefined
    if (p && def) for (const pin of pinesEnMundo(p, def)) movidos.add(clave(pin))
  }
  for (const id of sel.etiquetas) {
    const e = doc.etiquetas[id]
    if (e) movidos.add(clave(e))
  }
  const estirados: Estirado[] = []
  const fijos = new Set<string>()
  for (const c of Object.values(doc.cables)) {
    if (sel.cables.has(c.id) || c.puntos.length < 2) continue
    const k0 = clave(c.puntos[0]), k1 = clave(c.puntos[c.puntos.length - 1])
    fijos.add(k0)
    fijos.add(k1)
    const ini = movidos.has(k0), fin = movidos.has(k1)
    if (ini || fin) estirados.push({ cable: c, ini, fin })
  }
  const clavados = new Map<Id, { ini: boolean; fin: boolean }>()
  if (sel.cables.size) {
    for (const p of Object.values(doc.piezas)) {
      const def = lib.get(p.tipo)
      if (!sel.piezas.has(p.id) && def) for (const pin of pinesEnMundo(p, def)) fijos.add(clave(pin))
    }
    for (const e of Object.values(doc.etiquetas)) if (!sel.etiquetas.has(e.id)) fijos.add(clave(e))
    for (const id of sel.cables) {
      const c = doc.cables[id]
      if (!c || c.puntos.length < 2) continue
      const k0 = clave(c.puntos[0]), k1 = clave(c.puntos[c.puntos.length - 1])
      const ini = !movidos.has(k0) && fijos.has(k0), fin = !movidos.has(k1) && fijos.has(k1)
      if (ini || fin) clavados.set(id, { ini, fin })
    }
  }
  return { doc, sel, estirados, clavados }
}

/** Esquina del conector que une el extremo viejo `a` con el nuevo `a2` sin encimarse al tramo `a`→`vecino`. */
function esquinaConector(a: Punto, a2: Punto, vecino: Punto): Punto {
  if (a.y === vecino.y && a.x !== vecino.x) return { x: a.x, y: a2.y }
  if (a.x === vecino.x && a.y !== vecino.y) return { x: a2.x, y: a.y }
  return a2
}

export function pasoArrastre(plan: PlanArrastre, dx: number, dy: number, grupo?: string): Comando {
  const { doc, sel } = plan
  const cmds: Comando[] = []
  for (const id of sel.piezas) {
    const p = doc.piezas[id]
    if (p) cmds.push(modificar('mover', 'piezas', p, { ...p, x: p.x + dx, y: p.y + dy }, grupo))
  }
  for (const id of sel.cables) {
    const c = doc.cables[id]
    if (!c) continue
    let puntos = c.puntos.map((pt) => mas(pt, dx, dy))
    const k = plan.clavados.get(id)
    if (k) {
      const n = c.puntos.length
      const antes = k.ini ? [c.puntos[0], esquinaConector(c.puntos[0], puntos[0], c.puntos[1])] : []
      const despues = k.fin ? [esquinaConector(c.puntos[n - 1], puntos[n - 1], c.puntos[n - 2]), c.puntos[n - 1]] : []
      puntos = limpiarPolilinea([...antes, ...puntos, ...despues])
    }
    cmds.push(modificar('mover', 'cables', c, { ...c, puntos }, grupo))
  }
  for (const id of sel.etiquetas) {
    const e = doc.etiquetas[id]
    if (e) cmds.push(modificar('mover', 'etiquetas', e, { ...e, x: e.x + dx, y: e.y + dy }, grupo))
  }
  // Las sondas seleccionadas se mueven con lo demás; si no quedan sobre nada, `mantenerSondas` las lleva a su red.
  for (const id of sel.sondas) {
    const so = doc.sondas?.[id]
    if (so) cmds.push(modificar('mover', 'sondas', so, { ...so, x: so.x + dx, y: so.y + dy }, grupo))
  }
  for (const id of sel.notas) {
    const n = doc.notas[id]
    if (n) cmds.push(modificar('mover', 'notas', n, { ...n, x: n.x + dx, y: n.y + dy }, grupo))
  }
  for (const id of sel.figuras) {
    const f = doc.figuras?.[id]
    if (f) cmds.push(modificar('mover', 'figuras', f, { ...f, x1: f.x1 + dx, y1: f.y1 + dy, x2: f.x2 + dx, y2: f.y2 + dy }, grupo))
  }
  for (const { cable: c, ini, fin } of plan.estirados) {
    let puntos: Punto[]
    if (ini && fin) puntos = c.puntos.map((pt) => mas(pt, dx, dy))
    else {
      const pts = ini ? c.puntos : [...c.puntos].reverse()
      const limpio = limpiarPolilinea([...estirar(pts[0], pts[1], mas(pts[0], dx, dy)), ...pts.slice(1)])
      puntos = ini ? limpio : limpio.reverse()
    }
    cmds.push(modificar('estirar', 'cables', c, { ...c, puntos }, grupo))
  }
  return juntar('mover', cmds, grupo)
}

export function moverSeleccion(doc: Documento, lib: Map<string, PiezaDef>, sel: Seleccion, dx: number, dy: number, grupo?: string): Comando {
  return pasoArrastre(planArrastre(doc, lib, sel), dx, dy, grupo)
}

/** Arrastre del tramo `i` (como KiCad): se mueve `d` en perpendicular y los vecinos se estiran; una punta clavada gana un
 * codo. `conectar` da el camino del codo y `dentro` el otro extremo (el recto puede correr sobre otro cable de la unión). */
export function moverTramo(
  puntos: Punto[],
  i: number,
  d: number,
  clavado: { ini: boolean; fin: boolean },
  conectar: (desde: Punto, hasta: Punto, dentro: Punto) => Punto[] = (a, b) => [a, b]
): Punto[] {
  const a = puntos[i], b = puntos[i + 1]
  const horizontal = a.y === b.y
  const mover = (p: Punto): Punto => (horizontal ? { x: p.x, y: p.y + d } : { x: p.x + d, y: p.y })
  const out: Punto[] = []
  for (let k = 0; k < puntos.length; k++) {
    const p = puntos[k]
    if (k !== i && k !== i + 1) out.push(p)
    else if (k === 0 && clavado.ini) out.push(...conectar(p, mover(p), puntos[1]))
    else if (k === puntos.length - 1 && clavado.fin) out.push(...conectar(p, mover(p), puntos[k - 1]).reverse())
    else out.push(mover(p))
  }
  return limpiarPolilinea(out)
}
