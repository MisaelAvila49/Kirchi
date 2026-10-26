import type { OpcionesExportar } from '../../../compartido/ajustes'
import type { Conexiones } from '../conexiones/conexiones'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, MM_POR_UNIDAD, type Documento, type Id } from '../doc/tipos'
import { construirEscena, type Escena } from '../lienzo/escena'
import type { Paleta } from '../lienzo/paleta'
import type { VoltajesDeCables } from '../lienzo/voltajes'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { LecturaMedidor } from '../sim/medidor'
import { cajaDeArea, documentoDeArea, documentoSinInstrumentos, type AlcanceExportar, type AreaMm } from './seleccion'

/** Lo de la vista previa que viaja al esquema (null si no corre): ya calculado sobre el documento completo. */
export interface VivoExportar {
  voltajes: VoltajesDeCables
  lecturas: ReadonlyMap<Id, LecturaMedidor>
}

export interface FuenteEscena {
  doc: Documento
  con: Conexiones
  lib: Map<string, PiezaDef>
  /** Lo seleccionado, como documento aparte (`documentoDeSeleccion`). */
  seleccion: Documento | null
  area: AreaMm | null
  vivo: VivoExportar | null
}

/** Documento que se exporta para un alcance y opciones: todo, la selección o lo que cruza el área, con o sin instrumentos.
 * Si no hay nada que quitar devuelve el original. */
export function documentoAExportar(f: Pick<FuenteEscena, 'doc' | 'lib' | 'seleccion' | 'area'>, alcance: AlcanceExportar, o: Pick<OpcionesExportar, 'instrumentos'>): Documento | null {
  const base = alcance === 'seleccion' ? f.seleccion : alcance === 'area' && f.area ? documentoDeArea(f.doc, f.lib, cajaDeArea(f.area)) : f.doc
  if (!base) return null
  return o.instrumentos ? base : documentoSinInstrumentos(base, f.lib)
}

/** La escena de lo que se exporta, con los voltajes y las lecturas de los medidores si las opciones los piden y la vista previa corre. */
export function escenaDeExportar(f: FuenteEscena, alcance: AlcanceExportar, o: OpcionesExportar, paleta: Paleta): Escena {
  const d = documentoAExportar(f, alcance, o) ?? documentoVacio()
  const con = d === f.doc ? f.con : calcularConexiones(d, f.lib)
  return construirEscena(d, f.lib, con, paleta, {
    ...(o.coloresVoltaje && f.vivo ? { voltajes: f.vivo.voltajes } : {}),
    ...(o.lecturasMedidores && f.vivo ? { lecturasMedidores: f.vivo.lecturas } : {})
  })
}

/** La caja de la lámina cuando el alcance es un área (antes del margen); null si la lámina se ciñe al dibujo. */
export const cajaDeExportar = (alcance: AlcanceExportar, area: AreaMm | null): Caja | null => (alcance === 'area' && area ? cajaDeArea(area) : null)

/** El margen de las opciones, en unidades de mundo. */
export const margenEnUnidades = (o: Pick<OpcionesExportar, 'margenMm'>): number => o.margenMm / MM_POR_UNIDAD
