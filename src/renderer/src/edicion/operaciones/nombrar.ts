import { claveDeNombre } from '../../conexiones/nombres'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { etiquetaEn, resolverExtremo } from './conectar'

type Nombrar = Extract<Orden, { orden: 'nombrar' }>

/** Da nombre a la red de una patilla con una etiqueta puesta junto a ella, como la del editor: la red sale con ese nombre en
 * las trazas y el Registro. No une redes: si el nombre ya es de otra, se rechaza. */
export function nombrarOrden(est: Estado, o: Nombrar): Plan | Rechazo {
  const e = resolverExtremo(est, o.punto)
  if ('motivo' in e) return rechazo(e.motivo)
  const verbo = `No se nombró ${o.punto}`
  const nombre = o.nombre.trim()
  if (nombre === '') return rechazo(`${verbo}: el nombre está vacío.`)
  const clave = claveDeNombre(nombre)
  if (e.red.nombre !== undefined) {
    if (claveDeNombre(e.red.nombre) === clave) return { cmd: { nombre: 'nombrar red', cambios: [] }, creados: {}, avisos: [], yaUnidas: true }
    return rechazo(`${verbo}: esa red ya se llama «${e.red.nombre}».`)
  }
  if (est.con.redes.some((r) => r.id !== e.red.id && r.nombre !== undefined && claveDeNombre(r.nombre) === clave)) {
    return rechazo(`${verbo}: ya hay otra red llamada «${nombre}»; para unirlas usa conectar.`)
  }
  const r = etiquetaEn(est, est.doc, e.puntos[0], e.patilla, nombre)
  return { cmd: { ...r.cmd, nombre: 'nombrar red' }, creados: { [nombre]: r.etiqueta.id }, avisos: [], verbo }
}
