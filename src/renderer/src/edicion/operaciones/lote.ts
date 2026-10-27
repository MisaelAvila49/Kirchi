import { fusionar, type Comando } from '../../doc/comandos'
import type { Documento } from '../../doc/tipos'
import type { NucleoEdicion } from '../nucleo'
import type { Orden } from '../ordenes'
import { MAX_ORDENES_LOTE } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'

type Lote = Extract<Orden, { orden: 'lote' }>

/** Tope de piezas del documento resultante: lo que la vista previa admite simular. */
export const MAX_PIEZAS_LOTE = 1024

const ESCAPAR = /[.*+?^${}()|[\]\\]/g
const COMO_CLAVE = (clave: string) => new RegExp(`^(red de )?${clave.replace(ESCAPAR, '\\$&')}(\\.|$)`, 'i')

/** Cambia una clave del lote por la referencia que recibió su pieza: «rc.1» pasa a «R3.1». */
function sustituir(texto: string, claves: Map<string, string>): string {
  for (const [clave, ref] of claves) if (COMO_CLAVE(clave).test(texto)) return texto.replace(COMO_CLAVE(clave), (_m, red = '', punto = '') => `${red}${ref}${punto}`)
  return texto
}

/** Las órdenes con las claves ya cambiadas por referencias, solo en los campos que nombran piezas, patillas o redes. */
function conReferencias(o: Orden, claves: Map<string, string>): Orden {
  if (claves.size === 0) return o
  const s = (t: string) => sustituir(t, claves)
  const copia = { ...o } as Record<string, unknown>
  for (const campo of ['ref', 'desde', 'hasta', 'punto', 'instrumento']) if (typeof copia[campo] === 'string') copia[campo] = s(copia[campo] as string)
  if (Array.isArray(copia.refs)) copia.refs = (copia.refs as string[]).map(s)
  if (copia.medir && typeof copia.medir === 'object') copia.medir = { ...(copia.medir as object), punto: s((copia.medir as { punto: string }).punto) }
  return copia as Orden
}

/** Todo o nada: las órdenes corren una tras otra sobre una copia del documento y, si todas pasan, quedan juntas en un
 * solo comando. La primera que falla da su posición y su motivo y no cambia nada. */
export function loteOrden(est: Estado, o: Lote, trabajo: (doc: Documento) => NucleoEdicion): Plan | Rechazo {
  if (o.ordenes.length > MAX_ORDENES_LOTE) return rechazo(`Un lote admite ${MAX_ORDENES_LOTE} órdenes como máximo.`)
  const copia = trabajo(est.doc)
  const claves = new Map<string, string>()
  const creados: Record<string, string> = {}
  const avisos: string[] = []
  let total: Comando | null = null
  for (let i = 0; i < o.ordenes.length; i++) {
    const orden = o.ordenes[i]
    if (orden.orden === 'lote' || orden.orden === 'deshacer' || orden.orden === 'rehacer') return rechazo(`La orden ${i + 1} del lote no puede ser «${orden.orden}».`, i)
    if (orden.clave !== undefined && claves.has(orden.clave)) return rechazo(`La clave «${orden.clave}» se repite en el lote.`, i)
    copia.ultimoComando = null
    const r = copia.aplicar(conReferencias(orden, claves))
    if (!r.ok) return rechazo(`Orden ${i + 1}: ${r.motivo}`, i)
    Object.assign(creados, r.creados)
    avisos.push(...r.avisos)
    if (orden.clave !== undefined) {
      const ref = Object.keys(r.creados)[0]
      if (ref) claves.set(orden.clave, ref)
    }
    if (copia.ultimoComando) total = total ? fusionar(total, copia.ultimoComando) : copia.ultimoComando
    if (Object.keys(copia.doc.piezas).length > MAX_PIEZAS_LOTE) return rechazo(`El lote dejaría más de ${MAX_PIEZAS_LOTE.toLocaleString('en-US')} piezas.`, i)
  }
  return { cmd: total ?? { nombre: 'lote', cambios: [] }, creados, avisos, verbo: 'No se aplicó el lote' }
}
