import { leerValor } from './valores'

/** A lo más 1,000 puntos, el tope del motor. */
export const MAX_PUNTOS_PWL = 1000

export type PuntosPwl = { ok: true; puntos: [number, number][] } | { ok: false; error: string }

/** Lee «0 0, 1m 5, 2m 5»: pares tiempo y valor con prefijos, separados por coma. El primer tiempo es 0 y crecen. */
export function leerPuntosPwl(texto: string): PuntosPwl {
  const partes = texto.split(',').map((x) => x.trim())
  if (partes[partes.length - 1] === '') partes.pop()
  if (partes.length === 0) return { ok: false, error: 'faltan los puntos (tiempo y valor, separados por coma).' }
  if (partes.length > MAX_PUNTOS_PWL) return { ok: false, error: `son más de ${MAX_PUNTOS_PWL} puntos.` }
  const puntos: [number, number][] = []
  for (const [k, parte] of partes.entries()) {
    const campos = parte.split(/\s+/)
    if (campos.length !== 2) return { ok: false, error: `el punto ${k + 1} («${parte}») debe ser un tiempo y un valor.` }
    const t = leerValor(campos[0]), v = leerValor(campos[1])
    if (!t || (t.unidad && t.unidad !== 's')) return { ok: false, error: `el tiempo «${campos[0]}» del punto ${k + 1} no es válido.` }
    if (!v || (v.unidad && v.unidad !== 'V' && v.unidad !== 'A')) return { ok: false, error: `el valor «${campos[1]}» del punto ${k + 1} no es válido.` }
    puntos.push([t.valor, v.valor])
  }
  if (puntos[0][0] !== 0) return { ok: false, error: 'el primer tiempo debe ser 0.' }
  for (let k = 1; k < puntos.length; k++) if (!(puntos[k][0] > puntos[k - 1][0])) return { ok: false, error: `el tiempo del punto ${k + 1} debe ser mayor que el anterior.` }
  return { ok: true, puntos }
}
