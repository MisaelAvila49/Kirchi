import type { Conexiones } from '../conexiones/conexiones'
import { medidoresDe } from '../doc/sondas'
import type { Documento, Id } from '../doc/tipos'
import type { VoltajesDeCables } from '../lienzo/voltajes'
import { lecturaDeMedidor, type LecturaAc, type LecturaMedidor } from '../sim/medidor'
import type { Lectura } from '../sim/lectura'

/** Lo de la vista previa que lleva el esquema exportado: voltaje de cada cable y unión (escala ±`vmax`) y lectura de cada
 * medidor rápido. Se calcula sobre el documento completo para valer también en selección o área, cuyas redes se
 * numerarían distinto. */
export function voltajesDeCables(doc: Documento, con: Conexiones, l: Lectura, vmax: number): VoltajesDeCables {
  const cables = new Map<Id, number>()
  const puntos = new Map<string, number>()
  for (const c of Object.values(doc.cables)) {
    const red = con.redDeCable.get(c.id)
    const v = red === undefined ? undefined : l.redes.get(red)
    if (v === undefined) continue
    cables.set(c.id, v)
    for (const q of c.puntos) puntos.set(`${q.x},${q.y}`, v)
  }
  return { cables, puntos, vmax }
}

/** La lectura de cada medidor rápido del documento como los dibuja la vista previa. */
export function lecturasDeMedidores(doc: Documento, con: Conexiones, l: Lectura, alternas?: ReadonlyMap<Id, LecturaAc>): Map<Id, LecturaMedidor> {
  const out = new Map<Id, LecturaMedidor>()
  for (const m of medidoresDe(doc)) out.set(m.id, lecturaDeMedidor(m, con, l, alternas?.get(m.id)))
  return out
}
