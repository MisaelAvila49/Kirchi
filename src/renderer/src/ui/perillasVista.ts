import type { Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { leerEnVivo } from '../valores/enVivo'
import type { PerillaVista } from './ControlPerilla'

/** Las perillas en vivo de una pieza: una por propiedad con `enVivo`, con su valor guardado (o el de omisión). Vacía si no tiene. */
export function perillasDe(p: Pieza | undefined, def: PiezaDef | undefined): PerillaVista[] {
  if (!p || !def) return []
  return def.props
    .filter((d) => d.enVivo)
    .map((d) => {
      const ev = d.enVivo!
      const l = leerEnVivo(d, p.props[d.id] ?? d.defecto ?? '')
      return { id: p.id, propId: d.id, ref: p.ref, nombre: d.nombre, unidad: d.unidad ?? '', valor: 'valor' in l ? l.valor : ev.min, enVivo: ev }
    })
}

/** El texto de puntos de una fuente PWL, o null si la pieza no es una. */
export function textoPwlDe(p: Pieza | undefined, def: PiezaDef | undefined): string | null {
  const m = def?.modelo
  if (!p || !def || m?.tipo !== 'pwl') return null
  return p.props[m.puntos] ?? def.props.find((d) => d.id === m.puntos)?.defecto ?? ''
}
