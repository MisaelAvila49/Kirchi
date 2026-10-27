import type { Documento } from './tipos'

/** Siguiente referencia libre para un prefijo de 1 a 4 mayúsculas: R1, R2… */
export function siguienteReferencia(doc: Documento, prefijo: string): string {
  const escapado = prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escapado}(\\d+)$`)
  let max = 0
  for (const p of Object.values(doc.piezas)) {
    // El paquete de una unidad (U1 de U1B) también ocupa su número.
    for (const t of [p.ref, p.props.paquete]) {
      const m = t === undefined ? null : re.exec(t)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return `${prefijo}${max + 1}`
}

/** Siguiente referencia libre de medidor rápido (M1, M2…). Cuenta también piezas con referencia M# (un motor) para no
 * repetir. */
export function siguienteReferenciaMedidor(doc: Documento): string {
  let max = 0
  const ver = (ref: string | undefined) => {
    const m = ref === undefined ? null : /^M(\d+)$/.exec(ref)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const p of Object.values(doc.piezas)) ver(p.ref)
  for (const s of Object.values(doc.sondas ?? {})) if (s.tipo === 'medidor') ver(s.ref)
  return `M${max + 1}`
}

/** Largo máximo de una referencia (el de las propiedades de texto). */
export const MAX_REFERENCIA = 24

/** Por qué `texto` no sirve como referencia de la pieza `id`, o null: no vacía, sin espacios, hasta `MAX_REFERENCIA`
 * caracteres y única sin importar mayúsculas (SPICE no las distingue).
 * Cuentan también las piezas que no la rotulan, como la tierra. */
export function errorDeReferencia(doc: Documento, id: string, texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Escribe la referencia.'
  if (/\s/.test(t)) return 'La referencia no lleva espacios.'
  if (t.length > MAX_REFERENCIA) return `La referencia admite ${MAX_REFERENCIA} caracteres como máximo.`
  const k = t.toUpperCase()
  for (const otro in doc.piezas) {
    if (otro === id) continue
    const r = doc.piezas[otro].ref
    if (r.toUpperCase() === k) return `Ya hay otra pieza con la referencia ${r}.`
    const q = doc.piezas[otro].props.paquete
    if (q?.toUpperCase() === k) return `Ya hay otra pieza con la referencia ${q}.`
  }
  return null
}

/** Por qué `texto` no sirve como referencia del medidor rápido `id`, o null: una M y de uno a cuatro dígitos, sin
 * repetirse con ninguna pieza ni medidor. */
export function errorDeReferenciaMedidor(doc: Documento, id: string, texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Escribe la referencia.'
  if (!/^M[0-9]{1,4}$/.test(t)) return 'La referencia de un medidor es una M y un número, como M1.'
  const k = t.toUpperCase()
  for (const otro in doc.piezas) if (doc.piezas[otro].ref.toUpperCase() === k) return `Ya hay otra pieza con la referencia ${doc.piezas[otro].ref}.`
  for (const otro in doc.sondas ?? {}) {
    const s = doc.sondas![otro]
    if (otro !== id && s.tipo === 'medidor' && s.ref?.toUpperCase() === k) return `Ya hay otro medidor con la referencia ${s.ref}.`
  }
  return null
}
