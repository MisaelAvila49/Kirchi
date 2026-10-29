export interface PuntoEnRecta {
  x: number
  y: number
  clave: string
}

export interface CableEnRecta {
  x1: number
  y1: number
  x2: number
  y2: number
  clave: string
}

/** Une a cada punto con los cables rectos (horizontales o verticales) que lo contienen sin ser su extremo; devuelve cuántos puntos quedaron sobre algún cable. */
export function unirPuntosEnCables(puntos: Iterable<PuntoEnRecta>, cables: Iterable<CableEnRecta>, unir: (punto: string, cable: string) => void, alUnir?: (punto: string) => void): void {
  const tramos = { h: new Map<number, Tramo[]>(), v: new Map<number, Tramo[]>() }
  for (const c of cables) {
    if (c.y1 === c.y2 && c.x1 !== c.x2) alta(tramos.h, c.y1, { a: Math.min(c.x1, c.x2), b: Math.max(c.x1, c.x2), clave: c.clave })
    else if (c.x1 === c.x2 && c.y1 !== c.y2) alta(tramos.v, c.x1, { a: Math.min(c.y1, c.y2), b: Math.max(c.y1, c.y2), clave: c.clave })
  }
  const filas = new Map<number, Tramo[]>()
  const columnas = new Map<number, Tramo[]>()
  for (const p of puntos) {
    if (tramos.h.has(p.y)) alta(filas, p.y, { a: p.x, b: p.x, clave: p.clave })
    if (tramos.v.has(p.x)) alta(columnas, p.x, { a: p.y, b: p.y, clave: p.clave })
  }
  for (const [k, ps] of filas) barrer(ps, tramos.h.get(k) as Tramo[], unir, alUnir)
  for (const [k, ps] of columnas) barrer(ps, tramos.v.get(k) as Tramo[], unir, alUnir)
}

interface Tramo {
  a: number
  b: number
  clave: string
}

function alta(m: Map<number, Tramo[]>, k: number, t: Tramo): void {
  const l = m.get(k)
  if (l) l.push(t)
  else m.set(k, [t])
}

/** Barrido sobre una recta: los tramos que cubren un punto quedan unidos entre sí por él y se reducen a uno solo, así el trabajo es lineal. */
function barrer(puntos: Tramo[], tramos: Tramo[], unir: (p: string, c: string) => void, alUnir?: (p: string) => void): void {
  puntos.sort((p, q) => p.a - q.a)
  tramos.sort((s, t) => s.a - t.a)
  let k = 0
  let activos: Tramo[] = []
  for (const p of puntos) {
    while (k < tramos.length && (tramos[k] as Tramo).a < p.a) activos.push(tramos[k++] as Tramo)
    activos = activos.filter((t) => t.b > p.a)
    if (!activos.length) continue
    let mayor = activos[0] as Tramo
    for (const t of activos) {
      unir(p.clave, t.clave)
      if (t.b > mayor.b) mayor = t
    }
    alUnir?.(p.clave)
    activos = [mayor]
  }
}
