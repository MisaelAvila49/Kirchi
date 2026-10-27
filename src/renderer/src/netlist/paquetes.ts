import { clavePin, porId, type Conexiones, type Red } from '../conexiones/conexiones'
import { paqueteDe, patillasDeUnidad, unidadesDe } from '../doc/paquetes'
import type { Documento, Id, Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'

/** Dos pines de unidades distintas que son la misma patilla: [pieza, pin, pieza, pin]. */
export type Union = [Id, string, Id, string]

/** Una patilla compartida (V+ y V- del LM358) es una sola en todo el encapsulado. Si una unidad la tiene conectada y otra
 * suelta, son la misma red (la unión); si dos unidades la conectan a redes distintas, el circuito no puede simularse. */
export function unirCompartidas(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { uniones: Union[]; errores: { texto: string; piezas: Id[] }[] } {
  const uniones: Union[] = []
  const errores: { texto: string; piezas: Id[] }[] = []
  const paquetes = new Map<string, Pieza[]>()
  // Se ordenan solo las piezas con encapsulado: ordenar todo el documento en cada aviso costaba más que el resto del recorrido.
  const conPaquete = Object.values(doc.piezas).filter((p) => paqueteDe(p)).sort(porId)
  for (const p of conPaquete) {
    const clave = `${p.tipo}#${paqueteDe(p)!.paquete}`
    paquetes.set(clave, [...(paquetes.get(clave) ?? []), p])
  }
  for (const miembros of paquetes.values()) {
    if (miembros.length < 2) continue
    const def = lib.get(miembros[0].tipo)
    const u = def ? unidadesDe(def, miembros[0].props) : null
    if (!def || !u) continue
    const ordenadas = [...miembros].sort((a, b) => a.props.unidad.localeCompare(b.props.unidad))
    for (const pin of u.compartidos) {
      const redDe = (p: Pieza) => con.redDePin.get(clavePin(p.id, pin))
      const suelta = (p: Pieza) => {
        const r: Red | undefined = con.redes[redDe(p) ?? -1]
        return !r || (r.pines.length === 1 && !r.tierra)
      }
      const conectadas = ordenadas.filter((p) => !suelta(p))
      if (conectadas.length === 0) continue
      const base = conectadas[0]
      const distintas = conectadas.filter((p) => redDe(p) !== redDe(base))
      if (distintas.length > 0) {
        const patilla = patillasDeUnidad(def, base.props, base.props.unidad)?.[pin] ?? pin
        for (const p of distintas) errores.push({ texto: `${base.ref} y ${p.ref} comparten la patilla ${patilla} (${pin}) y están en redes distintas.`, piezas: [base.id, p.id] })
        continue
      }
      for (const p of ordenadas) if (suelta(p)) uniones.push([base.id, pin, p.id, pin])
    }
  }
  return { uniones, errores }
}

/** Las mismas conexiones con cada unión hecha: el pin de la segunda pieza pasa a la red de la primera. La red vacía se queda
 * en la lista para que el id de cada red siga siendo su posición. */
export function aplicarUniones(con: Conexiones, uniones: Union[]): Conexiones {
  if (uniones.length === 0) return con
  const redes = con.redes.map((r) => ({ ...r }))
  const redDePin = new Map(con.redDePin)
  const redDeCable = new Map(con.redDeCable)
  const redDeEtiqueta = new Map(con.redDeEtiqueta)
  const redDeSonda = new Map(con.redDeSonda)
  const mover = (m: Map<Id, number>, de: number, a: number) => {
    for (const [k, v] of m) if (v === de) m.set(k, a)
  }
  for (const [a, pa, b, pb] of uniones) {
    const ra = redDePin.get(clavePin(a, pa))
    const rb = redDePin.get(clavePin(b, pb))
    if (ra === undefined || rb === undefined || ra === rb) continue
    const [destino, origen] = [redes[ra], redes[rb]]
    destino.pines = [...destino.pines, ...origen.pines]
    destino.cables = [...destino.cables, ...origen.cables]
    destino.nombre ??= origen.nombre
    destino.tierra ||= origen.tierra
    origen.pines = []
    origen.cables = []
    for (const clave of destino.pines) redDePin.set(clave, ra)
    mover(redDeCable, rb, ra)
    mover(redDeEtiqueta, rb, ra)
    mover(redDeSonda, rb, ra)
  }
  return { ...con, redes, redDePin, redDeCable, redDeEtiqueta, redDeSonda }
}
