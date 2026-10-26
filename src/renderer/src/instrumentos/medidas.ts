import type { MedidaSab, RazonSinMedida } from '../sim/protocoloInstrumentos'

/** Cifras por columna que da el motor (`CIFRAS_COLUMNA` de `engine/src/lectura_sondas.rs`): mínimo, máximo, primero, último, ∫v·dt, ∫v²·dt y banderas. */
export const CIFRAS_COLUMNA_MOTOR = 7
/** Cifras de la ventana del motor (`Ventana::cifras`): desde, hasta, ∫v, ∫v², mínimo, máximo, periodos, p0, p1, ∫v y ∫v² de los
 * periodos, el tiempo sobre el nivel medio y el tiempo medido sin X ni Z. */
export const CIFRAS_VENTANA = 13

/** El tiempo medido sin X ni Z de una ventana; una de doce cifras (sin el dato) da el intervalo entero. */
export const tiempoValido = (w: ArrayLike<number>): number => (Number.isFinite(w[12]) ? w[12] : w[1] - w[0])
const BANDERA_VACIA = 8

const medida = (valor: number, razon: RazonSinMedida = ''): MedidaSab => ({ valor: razon ? Number.NaN : valor, razon })
const sinDatos = (): MedidaSab[] => Array.from({ length: 8 }, () => medida(0, 'sin-datos'))

/** Mínimo, máximo y cuántas columnas tienen datos, con `cifras` por columna (las banderas son la última). */
function extremos(c: ArrayLike<number>, cifras = CIFRAS_COLUMNA_MOTOR): { min: number; max: number; llenas: number } {
  let [min, max, llenas] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]
  for (let i = 0; i + cifras <= c.length; i += cifras) {
    if (c[i + cifras - 1] & BANDERA_VACIA) continue
    llenas++
    if (c[i] < min) min = c[i]
    if (c[i + 1] > max) max = c[i + 1]
  }
  return { min, max, llenas }
}

/** Las ocho medidas de un canal (orden de `MEDIDAS`) con las columnas de su pantalla y la ventana del motor sobre la misma
 * pantalla (`Ventana::cifras`). Sin ventana, las de las columnas. */
export function medidasDeCanal(c: ArrayLike<number>, w: ArrayLike<number> | null, cifras = CIFRAS_COLUMNA_MOTOR): MedidaSab[] {
  const e = extremos(c, cifras)
  if (e.llenas === 0) return sinDatos()
  // Sin ventana, de las integrales de las columnas: solo las del motor las traen (`cifras` de siete).
  if (!w) return cifras === CIFRAS_COLUMNA_MOTOR ? medidasDeColumnas(c, Number.NaN) : sinDatos()
  const [desde, hasta, iv, iv2, , , periodos, p0, p1, ivP, iv2P, alto] = Array.from(w)
  if (!(hasta > desde)) return cifras === CIFRAS_COLUMNA_MOTOR ? medidasDeColumnas(c, Number.NaN) : sinDatos()
  const base = [medida(e.max - e.min), medida(e.max), medida(e.min)]
  if (periodos >= 1) {
    const t = p1 - p0
    return [...base, medida(ivP / t), medida(Math.sqrt(Math.max(0, iv2P / t))), medida(periodos / t), medida(t / periodos), medida(alto / t)]
  }
  // Sin X ni Z en la pantalla es el intervalo; con ellos, lo que se midió (lo que integran ∫v y ∫v²).
  const d = tiempoValido(w)
  if (!(d > 0)) return [...base, ...sinDatos().slice(3)]
  const razon: RazonSinMedida = e.max - e.min <= 1e-9 * Math.max(1, Math.abs(iv / d)) ? 'sin-periodos' : 'menos-de-un-ciclo'
  return [...base, medida(iv / d), medida(Math.sqrt(Math.max(0, iv2 / d))), medida(0, razon), medida(0, razon), medida(0, razon)]
}

/** Medidas solo con columnas (canal A − B, que no tiene ventana del motor, o una pantalla gruesa): promedio y eficaz con
 * sus integrales, y frecuencia y ciclo con cruces del nivel medio interpolados.
 * `dt` es el ancho de columna (NaN: se toma de las integrales de cada columna). */
export function medidasDeColumnas(c: ArrayLike<number>, dt: number): MedidaSab[] {
  const e = extremos(c)
  if (e.llenas === 0) return sinDatos()
  const n = Math.floor(c.length / CIFRAS_COLUMNA_MOTOR)
  let [iv, iv2, tiempo] = [0, 0, 0]
  const ancho = Number.isFinite(dt) ? dt : 1
  for (let i = 0; i < n; i++) {
    const k = i * CIFRAS_COLUMNA_MOTOR
    if (c[k + 6] & BANDERA_VACIA) continue
    iv += c[k + 4]
    iv2 += c[k + 5]
    tiempo += ancho
  }
  const base = [medida(e.max - e.min), medida(e.max), medida(e.min), medida(iv / tiempo), medida(Math.sqrt(Math.max(0, iv2 / tiempo)))]
  const medio = 0.5 * (e.max + e.min)
  const h = 0.05 * (e.max - e.min)
  if (!(e.max - e.min > 1e-12) || !Number.isFinite(dt)) return [...base, medida(0, 'sin-periodos'), medida(0, 'sin-periodos'), medida(0, 'sin-periodos')]
  // Los puntos (t, v): el principio y el final de cada columna.
  const cruces: number[] = []
  let armado = false
  let previo: [number, number] | null = null
  for (let i = 0; i < n; i++) {
    const k = i * CIFRAS_COLUMNA_MOTOR
    if (c[k + 6] & BANDERA_VACIA) continue
    for (const [t, v] of [[i * dt, c[k + 2]], [(i + 1) * dt, c[k + 3]]] as const) {
      if (previo) {
        const [t0, v0]: [number, number] = previo
        if (v0 < medio - h) armado = true
        if (armado && v0 < medio && v >= medio && v !== v0) {
          cruces.push(t0 + ((medio - v0) / (v - v0)) * (t - t0))
          armado = false
        }
        if (v < medio - h) armado = true
      }
      previo = [t, v]
    }
  }
  if (cruces.length < 2) return [...base, medida(0, 'menos-de-un-ciclo'), medida(0, 'menos-de-un-ciclo'), medida(0, 'menos-de-un-ciclo')]
  const t = cruces[cruces.length - 1] - cruces[0]
  const periodos = cruces.length - 1
  // El tiempo arriba contado desde el primer cruce, hasta el último.
  let alto = 0
  previo = null
  for (let i = 0; i < n; i++) {
    const k = i * CIFRAS_COLUMNA_MOTOR
    if (c[k + 6] & BANDERA_VACIA) continue
    for (const [tt, v] of [[i * dt, c[k + 2]], [(i + 1) * dt, c[k + 3]]] as const) {
      if (previo) {
        const [t0, v0]: [number, number] = previo
        const [a, b] = [Math.max(t0, cruces[0]), Math.min(tt, cruces[cruces.length - 1])]
        if (b > a) {
          const va = v0 + ((v - v0) * (a - t0)) / (tt - t0 || 1)
          const vb = v0 + ((v - v0) * (b - t0)) / (tt - t0 || 1)
          if (va > medio && vb > medio) alto += b - a
          else if (va > medio !== vb > medio) {
            const tc = a + ((medio - va) / (vb - va)) * (b - a)
            alto += vb > medio ? b - tc : tc - a
          }
        }
      }
      previo = [tt, v]
    }
  }
  return [...base, medida(periodos / t), medida(t / periodos), medida(alto / t)]
}
