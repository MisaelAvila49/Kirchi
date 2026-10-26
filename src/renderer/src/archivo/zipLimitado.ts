import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

export type ResultadoZip = { ok: true; archivos: Record<string, Uint8Array> } | { ok: false; motivo: 'zip' | 'grande' }

/** Trozo de entrada por empuje: acota cuánto puede expandir una sola llamada al descompresor (como mucho ~1000×). */
const TROZO = 16 * 1024

/** Descomprime solo las entradas que `limite(nombre)` acepta y cuenta bytes REALES: el tamaño de la cabecera se puede
 * falsear (bomba de descompresión).
 * Al pasar el tope de una entrada aborta todo con `grande`. */
export function descomprimirLimitado(bytes: Uint8Array, limite: (nombre: string) => number | null): ResultadoZip {
  // Sin la firma de una entrada local no es un zip (el lector en flujo no avisa de basura).
  if (bytes.length < 4 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== 0x04034b50) return { ok: false, motivo: 'zip' }
  const trozos = new Map<string, Uint8Array[]>()
  const completos = new Set<string>()
  let grande = false
  let fallo = false
  const unz = new Unzip((f) => {
    const tope = limite(f.name)
    if (tope === null || grande || fallo) return
    if (f.originalSize !== undefined && f.originalSize > tope) {
      grande = true
      return
    }
    let total = 0
    const lista: Uint8Array[] = []
    trozos.set(f.name, lista)
    f.ondata = (err, datos, final) => {
      if (err) {
        fallo = true
        return
      }
      if (grande) return
      total += datos.length
      if (total > tope) {
        grande = true
        f.terminate()
        return
      }
      lista.push(datos)
      if (final) completos.add(f.name)
    }
    f.start()
  })
  unz.register(UnzipInflate)
  unz.register(UnzipPassThrough)
  try {
    for (let i = 0; i < bytes.length && !grande && !fallo; i += TROZO) unz.push(bytes.subarray(i, Math.min(i + TROZO, bytes.length)), i + TROZO >= bytes.length)
  } catch {
    return { ok: false, motivo: grande ? 'grande' : 'zip' }
  }
  if (grande) return { ok: false, motivo: 'grande' }
  if (fallo) return { ok: false, motivo: 'zip' }
  const archivos: Record<string, Uint8Array> = {}
  for (const [nombre, lista] of trozos) {
    if (!completos.has(nombre)) return { ok: false, motivo: 'zip' }
    const salida = new Uint8Array(lista.reduce((a, c) => a + c.length, 0))
    let p = 0
    for (const c of lista) {
      salida.set(c, p)
      p += c.length
    }
    archivos[nombre] = salida
  }
  return { ok: true, archivos }
}
