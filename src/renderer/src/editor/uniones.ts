import { claveDeNombre, nombreDeRiel } from '../netlist/alimentaciones'
import type { Documento, Id } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'

/** Cuántos terminales se nombran antes de resumir el resto («y 2 terminales más»). */
const TOPE_NOMBRADOS = 3

const enLista = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/** Con qué se une un terminal o etiqueta llamado `nombre`: terminales (hasta tres y el resto contado) y etiquetas con la
 * misma `claveDeNombre`, sin contar `propio`. null si nada. Repetir un nombre se permite, el campo solo lo dice. */
export function unionesDeNombre(doc: Documento, lib: Map<string, PiezaDef>, nombre: string, propio: { pieza?: Id; etiqueta?: Id }): string | null {
  const t = nombre.trim()
  if (!t) return null
  const k = claveDeNombre(t)
  const terminales: string[] = []
  for (const id in doc.piezas) {
    if (id === propio.pieza) continue
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    if (def?.modelo?.tipo !== 'alimentacion') continue
    const n = nombreDeRiel(p, def)
    if (claveDeNombre(n) === k) terminales.push(`${n} de ${p.ref}`)
  }
  const etiquetas: string[] = []
  for (const id in doc.etiquetas) {
    if (id === propio.etiqueta) continue
    const e = doc.etiquetas[id]
    if (claveDeNombre(e.nombre) === k) etiquetas.push(e.nombre)
  }
  const partes = terminales.slice(0, TOPE_NOMBRADOS)
  const resto = terminales.length - partes.length
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'terminal más' : 'terminales más'}`)
  if (etiquetas.length === 1) partes.push(`la etiqueta de red ${etiquetas[0]}`)
  else if (etiquetas.length > 1) partes.push(`${etiquetas.length} etiquetas de red`)
  return partes.length ? `Se une con ${enLista(partes)}.` : null
}
