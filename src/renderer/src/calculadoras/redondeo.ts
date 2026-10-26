import type { SerieComercial } from '../../../compartido/ajustes'
import { masCercano, vecinosHasta } from '../valores/series'
import { SIN_REDONDEO, type Redondeo } from './formulas'

/** Desde esta capacitancia el circuito generado usa un electrolítico, cuya serie es la E6 (como en su `pieza.json`). */
export const ELECTROLITICO_DESDE = 1e-6

/** Valores comerciales de la serie elegida en Configuración. Con «libre» no se redondea; desde 1 µF un capacitor es electrolítico y usa E6. */
/** Paso de cada serie: la tolerancia que le corresponde. */
const PASO: Record<Exclude<SerieComercial, 'libre'>, number> = { E6: 0.2, E12: 0.1, E24: 0.05 }

export function redondeoDe(serie: SerieComercial): Redondeo {
  if (serie === 'libre') return SIN_REDONDEO
  return {
    tol: PASO[serie],
    r: (x) => masCercano(x, serie) ?? x,
    rVecinas: (x, k) => {
      const v = vecinosHasta(x, serie, k)
      return v.length > 0 ? v : [x]
    },
    c: (x) => masCercano(x, x >= ELECTROLITICO_DESDE * 0.999 ? 'E6' : serie) ?? x
  }
}
