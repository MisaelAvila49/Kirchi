import { circuitoNotch, circuitoPasaBanda, circuitoRechazaBanda } from '../calculadoras/circuitos'
import { notchDobleT, pasaBanda, rechazaBanda } from '../calculadoras/filtros'
import type { Calculo } from '../calculadoras/formulas'
import { redondeoDe } from '../calculadoras/redondeo'
import type { DefPlantilla } from './plantillasIncluidas'



const E12 = redondeoDe('E12')
function ok<T extends object>(r: Calculo<T>): { ok: true } & T {
  if (!r.ok) throw new Error(r.error)
  return r
}

/** Los tres filtros de banda salen de las calculadoras con sus valores de inicio y la serie E12, así la plantilla y
 * «Generar circuito» dibujan lo mismo. */
export const FILTROS_DE_BANDA: DefPlantilla[] = [
  {
    id: 'filtro-pasa-banda',
    nombre: 'Filtro pasa banda',
    descripcion: 'Un pasa altas y un pasa bajas RC en serie dejan pasar de unos 100 Hz a 10 kHz.',
    ...circuitoPasaBanda(ok(pasaBanda({ fl: 100, fh: 10e3, c: 100e-9 }, E12))).def
  },
  {
    id: 'filtro-rechaza-banda',
    nombre: 'Filtro rechaza banda',
    descripcion: 'Un pasa bajas y un pasa altas sumados por un LM741 rechazan de unos 100 Hz a 10 kHz.',
    ...circuitoRechazaBanda(ok(rechazaBanda({ fl: 100, fh: 10e3, c: 100e-9 }, E12))).def
  },
  {
    id: 'filtro-notch-doble-t',
    nombre: 'Notch de doble T',
    descripcion: 'Una doble T pasiva anula el zumbido de 60 Hz, con 27 kΩ y 100 nF.',
    ...circuitoNotch(ok(notchDobleT({ f0: 60, c: 100e-9 }, E12))).def
  }
]
