import { partirClavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'

/**
 * Orden natural de referencias: prefijo, número y resto (R2 antes que R10). Compara una tupla, así que es transitivo para cualquier texto.
 */
export function ordenRef(a: string, b: string): number {
  const partes = (r: string) => {
    const m = /^(\D*)(\d*)(.*)$/s.exec(r)!
    return { prefijo: m[1], numero: m[2] === '' ? 0 : Number(m[2]), resto: m[3] }
  }
  const x = partes(a), y = partes(b)
  return x.prefijo.localeCompare(y.prefijo, 'es') || x.numero - y.numero || x.resto.localeCompare(y.resto, 'es') || (a < b ? -1 : a > b ? 1 : 0)
}

/** Conexiones de una red: los pines que une. */
export const conexionesDeRed = (r: Red): number => r.pines.length

/** Lo que vale la pena listar como red: dos o más pines, algún cable, un nombre o la tierra. Un pin suelto no es una red. */
export const esRedVisible = (r: Red): boolean => r.pines.length >= 2 || r.cables.length > 0 || r.nombre !== undefined || r.tierra

/** Redes visibles: la tierra primero, luego las que tienen nombre (en orden alfabético) y después las demás. */
export function redesVisibles(con: Conexiones): Red[] {
  const rango = (r: Red) => (r.tierra ? 0 : r.nombre !== undefined ? 1 : 2)
  return con.redes.filter(esRedVisible).sort((a, b) => rango(a) - rango(b) || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es') || a.id - b.id)
}

/**
 * Nombre de cada red visible en orden de lista: tierra («GND»), con etiqueta y luego «red 1», «red 2»… sin huecos. Las numeradas siguen el menor de sus pines en orden natural, para que agregar una pieza no las renumere.
 */
export function nombresDeRedes(doc: Documento, con: Conexiones): Map<number, string> {
  const nombres = new Map<number, string>()
  const sinNombre: Red[] = []
  for (const r of redesVisibles(con)) {
    if (r.nombre !== undefined) nombres.set(r.id, r.nombre)
    else if (r.tierra) nombres.set(r.id, 'GND')
    else sinNombre.push(r)
  }
  const partir = (clave: string): [string, string] => {
    const { piezaId, pinId } = partirClavePin(clave)
    return [doc.piezas[piezaId]?.ref ?? '', pinId]
  }
  const menorPin = (r: Red): [string, string] | undefined =>
    r.pines.map(partir).sort((a, b) => ordenRef(a[0], b[0]) || a[1].localeCompare(b[1], 'es', { numeric: true }))[0]
  const llave = new Map(sinNombre.map((r) => [r.id, menorPin(r)]))
  sinNombre.sort((a, b) => {
    const pa = llave.get(a.id), pb = llave.get(b.id)
    if (pa && pb) return ordenRef(pa[0], pb[0]) || pa[1].localeCompare(pb[1], 'es', { numeric: true }) || a.id - b.id
    return pa ? -1 : pb ? 1 : a.id - b.id
  })
  sinNombre.forEach((r, i) => nombres.set(r.id, `red ${i + 1}`))
  return nombres
}
