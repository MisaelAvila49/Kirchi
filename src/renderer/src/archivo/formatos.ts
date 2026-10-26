import { hayAnalisis } from '../doc/analisis'
import { haySondas, hayMedidores } from '../doc/sondas'
import type { Documento } from '../doc/tipos'

/** Una regla: si el documento cumple `aplica`, necesita al menos el formato `formato`. El del archivo es el mayor de las que aplican. */
export interface ReglaFormato {
  formato: number
  nombre: string
  aplica: (doc: Documento) => boolean
}

const algunaPieza = (doc: Documento, f: (p: Documento['piezas'][string]) => boolean): boolean => {
  for (const id in doc.piezas) if (f(doc.piezas[id])) return true
  return false
}

const libre = (v: number | undefined): boolean => v !== undefined && !Number.isInteger(v)

/** Alguna nota, figura o pantalla de medidor con coordenadas no enteras. */
function hayPosicionesLibres(doc: Documento): boolean {
  for (const n of Object.values(doc.notas ?? {})) if (libre(n.x) || libre(n.y)) return true
  for (const f of Object.values(doc.figuras ?? {})) if (libre(f.x1) || libre(f.y1) || libre(f.x2) || libre(f.y2)) return true
  for (const s of Object.values(doc.sondas ?? {})) if (s.tipo === 'medidor' && (libre(s.pantalla?.dx) || libre(s.pantalla?.dy))) return true
  return false
}

/** Las reglas de hoy, en el orden en que se fueron agregando. Cada formato nuevo agrega una regla con su número, sin tocar las demás. */
export const REGLAS: readonly ReglaFormato[] = [
  { formato: 2, nombre: 'terminales de alimentación', aplica: (d) => algunaPieza(d, (p) => p.tipo === 'alimentacion') },
  { formato: 3, nombre: 'textos de pieza movidos', aplica: (d) => algunaPieza(d, (p) => !!p.textos && Object.keys(p.textos).length > 0) },
  { formato: 4, nombre: 'figuras', aplica: (d) => !!d.figuras && Object.keys(d.figuras).length > 0 },
  { formato: 5, nombre: 'sondas', aplica: (d) => haySondas(d) },
  { formato: 6, nombre: 'modelo SPICE propio', aplica: (d) => algunaPieza(d, (p) => !!p.spice && Object.keys(p.spice).length > 0) },
  { formato: 7, nombre: 'análisis de ngspice', aplica: (d) => hayAnalisis(d) },
  // También del 8: las posiciones fuera de la rejilla (Alt) se escriben con decimales y una versión anterior las rechazaría.
  { formato: 8, nombre: 'medidor rápido y posiciones libres', aplica: (d) => hayMedidores(d) || hayPosicionesLibres(d) }
]

/** Números que ya tienen dueño aunque su regla aún no exista: una prueba impide que una regla los use por error. */
export const RESERVADOS: Readonly<Record<number, string>> = {
  9: 'bloques',
  10: 'protoboard',
  11: 'microcontroladores'
}

/** El formato que necesita el documento: el mayor de las reglas que aplican, o 1 (el de antes). */
export function formatoDe(doc: Documento): number {
  let f = 1
  for (const r of REGLAS) if (r.formato > f && r.aplica(doc)) f = r.formato
  return f
}
