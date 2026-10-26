import type { Tono } from './colores'
import { TONO_ICONO, type TonoIcono } from './cinta/planos'
import type { NombreIcono } from './cinta/trazos'
import type { Pestaña } from './Instrumentos'

/** El icono de cada pestaña de la franja: el de su orden en la cinta. */
export const ICONO_PESTAÑA: Readonly<Record<Pestaña, NombreIcono>> = { osciloscopio: 'osciloscopio', graficas: 'graficas', registro: 'registro' }

/** Pestañas de la franja y su nombre; el Osciloscopio volvió, con su pantalla. */
export const PESTAÑAS_FRANJA: readonly (readonly [Pestaña, string])[] = [
  ['osciloscopio', 'Osciloscopio'],
  ['graficas', 'Gráficas'],
  ['registro', 'Registro']
]

/** La pestaña de la franja al arrancar: el Osciloscopio, o el Registro si la librería trae errores (ahí se leen). */
export const pestañaInicialFranja = (erroresDeLibreria: number): Pestaña => (erroresDeLibreria > 0 ? 'registro' : 'osciloscopio')

/** Lo que la franja necesita saber de los instrumentos armados en la netlist (`ResultadoNetlist.instrumentos`). */
export interface InstrumentosArmados {
  multimetros: ReadonlyMap<unknown, unknown>
  osciloscopios: ReadonlyMap<unknown, { canales: readonly { sonda: number | null }[] }>
}

/**
 * Pestaña de la franja que se abre al empezar la vista previa: Osciloscopio con entrada conectada, Registro con avisos de conexión, si no null.
 */
export function pestañaAlSimular(inst: InstrumentosArmados | null | undefined, problemas: number): Pestaña | null {
  if (inst && [...inst.osciloscopios.values()].some((o) => o.canales.some((c) => c.sonda !== null))) return 'osciloscopio'
  return problemas > 0 ? 'registro' : null
}

/** Mediciones se abre sola, a la derecha, si hay un multímetro conectado. Un multímetro suelto (un terminal al aire) no cuenta, porque la netlist ni lo arma. */
export const abreMedicionesAlSimular = (inst: InstrumentosArmados | null | undefined): boolean => !!inst && inst.multimetros.size > 0

/** El tinte de la pestaña elegida: el color de su icono (con dos colores, el primero). */
export function tonoDePestaña(p: Pestaña): Tono {
  const t = (TONO_ICONO as Partial<Record<NombreIcono, TonoIcono>>)[ICONO_PESTAÑA[p]]!
  return typeof t === 'string' ? t : t[0]
}
