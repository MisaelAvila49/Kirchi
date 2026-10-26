export type GeneradorId = (prefijo: string) => string

export const idAleatorio: GeneradorId = (prefijo) => `${prefijo}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

/** Para pruebas: p_0001, c_0002… */
export function idSecuencial(): GeneradorId {
  let n = 0
  return (prefijo) => `${prefijo}_${String(++n).padStart(4, '0')}`
}
