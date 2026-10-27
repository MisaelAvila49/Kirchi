import { fusionar, modificar } from '../doc/comandos'
import type { Comando } from '../doc/comandos'
import type { Documento, Id, Pieza, Punto } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import { choqueDeGrupo } from './colision'
import { enrutar } from './enrutar'
import { iguales } from './rutas'

/** El id de la compuerta de `n` entradas de la familia `base` (`and` para dos, `and-3` para tres). */
export const idConEntradas = (base: string, n: number): string => (n === 2 ? base : `${base}-${n}`)

/** Cambia la cantidad de entradas de una compuerta: la pieza pasa a la de `n` entradas de su familia y los cables que
 * llegaban a un pin que sigue existiendo lo siguen a su lugar nuevo (se vuelven a enrutar). Los de un pin que desaparece
 * quedan sueltos. Devuelve el error si la pieza nueva choca con otra o no existe. */
export function cambiarEntradas(doc: Documento, lib: Map<string, PiezaDef>, id: Id, n: number): Comando | { error: string } {
  const p = doc.piezas[id]
  const def = p ? lib.get(p.tipo) : undefined
  const nueva = def?.entradas ? lib.get(idConEntradas(def.entradas.base, n)) : undefined
  if (!p || !def?.entradas || !nueva) return { error: `${p?.ref ?? 'La pieza'} no admite ${n} entradas.` }
  const { entradas: _quitada, ...props } = p.props
  const pieza: Pieza = { ...p, tipo: nueva.id, props }
  const choque = choqueDeGrupo(doc, lib, [pieza], new Set([id]))
  if (choque) return { error: `${p.ref} no cabe con ${n} entradas: choca con ${doc.piezas[choque.con]?.ref ?? 'otra pieza'}.` }

  // Dónde estaba y dónde queda cada pin que existe en las dos.
  const antes = new Map(pinesEnMundo(p, def).map((q) => [q.id, { x: q.x, y: q.y }]))
  const movimientos: [Punto, Punto][] = []
  for (const q of pinesEnMundo(pieza, nueva)) {
    const a = antes.get(q.id)
    if (a && !iguales(a, q)) movimientos.push([a, { x: q.x, y: q.y }])
  }
  let cmd: Comando = modificar('entradas', 'piezas', p, pieza)
  const nuevo: Documento = { ...doc, piezas: { ...doc.piezas, [id]: pieza } }
  for (const c of Object.values(doc.cables)) {
    const puntos = c.puntos.map((pt) => movimientos.find(([a]) => iguales(a, pt))?.[1] ?? pt)
    if (puntos.every((pt, k) => pt === c.puntos[k])) continue
    // Los extremos son fijos: la ruta nueva va de uno al otro con el enrutador de siempre.
    const ruta = enrutar(nuevo, lib, puntos[0], puntos[puntos.length - 1], { ignorarCables: new Set([c.id]) })
    cmd = fusionar(cmd, modificar('entradas', 'cables', c, { ...c, puntos: ruta }))
  }
  return cmd
}
