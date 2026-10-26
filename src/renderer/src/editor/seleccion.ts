import type { Coleccion, Documento, Id } from '../doc/tipos'

export type Seleccion = Record<Coleccion, Set<Id>>

const COLECCIONES: Coleccion[] = ['piezas', 'cables', 'etiquetas', 'notas', 'figuras', 'sondas']

export const seleccionVacia = (): Seleccion => ({ piezas: new Set(), cables: new Set(), etiquetas: new Set(), notas: new Set(), figuras: new Set(), sondas: new Set() })

const copiar = (s: Seleccion): Seleccion => ({
  piezas: new Set(s.piezas), cables: new Set(s.cables), etiquetas: new Set(s.etiquetas), notas: new Set(s.notas), figuras: new Set(s.figuras), sondas: new Set(s.sondas)
})

export function seleccionDe(col: Coleccion, id: Id): Seleccion {
  const s = seleccionVacia()
  s[col].add(id)
  return s
}

/** Misma selección por contenido (los conjuntos nuevos de `depurar` no cuentan como cambio). */
export function mismaSeleccion(a: Seleccion, b: Seleccion): boolean {
  if (a === b) return true
  return COLECCIONES.every((c) => a[c].size === b[c].size && [...a[c]].every((id) => b[c].has(id)))
}

export const tamañoSeleccion = (s: Seleccion): number => COLECCIONES.reduce((n, c) => n + s[c].size, 0)

export function alternar(s: Seleccion, col: Coleccion, id: Id): Seleccion {
  const n = copiar(s)
  if (n[col].has(id)) n[col].delete(id)
  else n[col].add(id)
  return n
}

export function unir(a: Seleccion, b: Seleccion): Seleccion {
  const n = copiar(a)
  for (const c of COLECCIONES) for (const id of b[c]) n[c].add(id)
  return n
}

export function todo(doc: Documento): Seleccion {
  const s = seleccionVacia()
  for (const c of COLECCIONES) for (const id of Object.keys(doc[c] ?? {})) s[c].add(id)
  return s
}

/** Quita los identificadores que ya no están en el documento (tras deshacer o borrar). */
export function depurar(s: Seleccion, doc: Documento): Seleccion {
  const n = seleccionVacia()
  for (const c of COLECCIONES) {
    const col = doc[c] ?? {}
    for (const id of s[c]) if (Object.hasOwn(col, id)) n[c].add(id)
  }
  return n
}
