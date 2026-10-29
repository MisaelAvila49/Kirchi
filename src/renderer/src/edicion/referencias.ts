import { clavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Documento, Pieza, Punto, Sonda } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'

/** La pieza con esa referencia (sin distinguir mayúsculas, como SPICE). */
export function piezaPorRef(doc: Documento, ref: string): Pieza | undefined {
  const k = ref.trim().toUpperCase()
  for (const p of Object.values(doc.piezas)) if (p.ref.toUpperCase() === k) return p
  return undefined
}

/** El medidor rápido con esa referencia («M1»). */
export function medidorPorRef(doc: Documento, ref: string): Sonda | undefined {
  const k = ref.trim().toUpperCase()
  for (const s of Object.values(doc.sondas ?? {})) if (s.tipo === 'medidor' && s.ref?.toUpperCase() === k) return s
  return undefined
}

export const sinPieza = (ref: string): string => `No hay ninguna pieza con la referencia «${ref}».`

export type Patilla = { pieza: Pieza; def: PiezaDef; pin: string; punto: Punto }

/** «R1.2» a su pieza, su patilla y el punto donde está. El id de la patilla es el de `pieza.json`; null si no existe. */
export function resolverPatilla(doc: Documento, lib: Map<string, PiezaDef>, texto: string): Patilla | { motivo: string } | null {
  const i = texto.indexOf('.')
  if (i <= 0) return null
  const ref = texto.slice(0, i), pin = texto.slice(i + 1)
  const pieza = piezaPorRef(doc, ref)
  if (!pieza) return { motivo: sinPieza(ref) }
  const def = lib.get(pieza.tipo)
  const p = def ? pinesEnMundo(pieza, def).find((q) => q.id === pin) : undefined
  if (!def || !p) return { motivo: `${pieza.ref} no tiene el pin «${pin}».` }
  return { pieza, def, pin, punto: { x: p.x, y: p.y } }
}

/** La red que nombra el texto: una patilla («R1.2»), «red de R1.2» o el nombre de una etiqueta o terminal («VCC»). */
export function resolverRed(est: { doc: Documento; lib: Map<string, PiezaDef>; con: Conexiones }, texto: string): { red: Red } | { motivo: string } {
  const t = texto.trim().replace(/^red de /i, '')
  const pat = resolverPatilla(est.doc, est.lib, t)
  if (pat) {
    if ('motivo' in pat) return pat
    const i = est.con.redDePin.get(clavePin(pat.pieza.id, pat.pin))
    const red = i === undefined ? undefined : est.con.redes.find((r) => r.id === i)
    return red ? { red } : { motivo: `El pin ${t} no está en ninguna red.` }
  }
  const k = t.toLowerCase()
  const red = est.con.redes.find((r) => r.nombre === t) ?? est.con.redes.find((r) => r.nombre?.toLowerCase() === k)
  return red ? { red } : { motivo: `No hay ninguna red llamada «${t}».` }
}
