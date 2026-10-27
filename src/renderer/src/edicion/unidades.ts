import { MM_POR_UNIDAD, type Punto } from '../doc/tipos'

/** Paso de la rejilla de cableado en mm: las órdenes solo hablan en múltiplos de este paso. */
export const PASO_MM = 2.5
export const MOTIVO_FUERA_DE_REJILLA = 'La posición va en múltiplos de 2.5 mm.'

/** Un valor en mm que cae en la rejilla de cableado (con tolerancia de redondeo de coma flotante). */
export const enRejilla = (mm: number): boolean => Number.isFinite(mm) && Math.abs(mm / PASO_MM - Math.round(mm / PASO_MM)) < 1e-9

/** mm a unidades de rejilla fina (1 = 1.25 mm); null si no cae en la rejilla de cableado. */
export function mmAUnidades(mm: number): number | null {
  return enRejilla(mm) ? Math.round(mm / MM_POR_UNIDAD) : null
}

export const unidadesAMm = (u: number): number => u * MM_POR_UNIDAD

export function puntoAUnidades(p: { x: number; y: number }): Punto | null {
  const x = mmAUnidades(p.x), y = mmAUnidades(p.y)
  return x === null || y === null ? null : { x, y }
}

export const puntoAMm = (p: Punto): { x: number; y: number } => ({ x: unidadesAMm(p.x), y: unidadesAMm(p.y) })
