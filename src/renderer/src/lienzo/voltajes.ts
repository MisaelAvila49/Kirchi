import { mezclar, type Paleta, type RGBA } from './paleta'

/** Color de un cable a `v` voltios en escala simétrica ±`vmax`: naranja a lo positivo, gris en 0 V y azul a lo negativo
 * (azul↔naranja se distingue con daltonismo; nunca rojo↔verde). Lo que pasa de ±`vmax` queda en el extremo; sin escala o
 * lectura, gris. */
export function colorDeVoltaje(v: number, vmax: number, p: Paleta): RGBA {
  if (!Number.isFinite(v) || !(vmax > 0)) return p.voltajeCero
  const t = Math.max(-1, Math.min(1, v / vmax))
  // Los extremos y el cero son los tokens exactos (la mezcla en t = 1 deja un error de redondeo).
  if (t === 1) return p.voltajeAlto
  if (t === -1) return p.voltajeNegativo
  if (t === 0) return p.voltajeCero
  return t >= 0 ? mezclar(p.voltajeAlto, p.voltajeCero, t) : mezclar(p.voltajeNegativo, p.voltajeCero, -t)
}

/** El voltaje de cada cable (por id) y de cada punto «x,y» donde hay una unión, con la escala ±`vmax`: lo que necesita la exportación para colorear. */
export interface VoltajesDeCables {
  cables: ReadonlyMap<string, number>
  puntos: ReadonlyMap<string, number>
  vmax: number
}
