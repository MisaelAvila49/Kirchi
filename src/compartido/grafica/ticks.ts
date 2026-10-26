/** Marcas «bonitas» de los ejes (pasos de 1, 2 o 5 por potencia de diez; décadas con marcas 2 a 9 en logarítmico) y su texto con prefijo SI. Sin dependencias. */

/** El paso 1, 2, 5 o 10 por una potencia de diez más cercano (por arriba) a `crudo`. */
export function pasoBonito(crudo: number): number {
  if (!(crudo > 0) || !Number.isFinite(crudo)) return 1
  const e = Math.floor(Math.log10(crudo))
  const base = 10 ** e
  const f = crudo / base
  const m = f <= 1.0000001 ? 1 : f <= 2.0000001 ? 2 : f <= 5.0000001 ? 5 : 10
  return m * base
}

/** Quita el ruido de coma flotante de un múltiplo de un paso (0.30000000000000004 pasa a 0.3). */
const limpio = (v: number): number => Number(v.toPrecision(12))

/** Marcas lineales dentro de [min, max], con unas `objetivo` marcas. Vacío si el intervalo no es válido. */
export function marcasLineales(min: number, max: number, objetivo = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  if (max === min) return [min]
  const paso = pasoBonito((max - min) / Math.max(1, objetivo))
  const k0 = Math.ceil(min / paso - 1e-9)
  const k1 = Math.floor(max / paso + 1e-9)
  const salida: number[] = []
  for (let k = k0; k <= k1 && salida.length < 1000; k++) salida.push(limpio(k * paso) + 0)
  return salida
}

export interface MarcaLog {
  valor: number
  /** Es una potencia de diez. */
  mayor: boolean
  /** Lleva rótulo con su número. */
  etiquetar: boolean
}

/** El primer dígito de un valor en notación científica (0.05 → 5, 2e-7 → 2), sin depender de cómo se escriba. */
const mantisa = (v: number): number => Math.round(v / 10 ** Math.floor(Math.log10(v) + 1e-9))

/** Marcas logarítmicas dentro de [min, max] (ambos positivos): décadas mayores y, con pocas décadas, las marcas 2 a 9. */
export function marcasLog(min: number, max: number): MarcaLog[] {
  if (!(min > 0) || !(max > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  const d0 = Math.floor(Math.log10(min) + 1e-12)
  const d1 = Math.ceil(Math.log10(max) - 1e-12)
  const decadas = d1 - d0
  const conMenores = decadas <= 4
  const salida: MarcaLog[] = []
  const dentro = (v: number) => v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)
  for (let d = d0; d <= d1 && salida.length < 400; d++) {
    for (let m = 1; m <= 9; m++) {
      if (m > 1 && !conMenores) break
      const v = limpio(m * 10 ** d)
      if (dentro(v)) salida.push({ valor: v, mayor: m === 1, etiquetar: m === 1 })
    }
  }
  // Una sola década (o ninguna mayor visible) se queda sin rótulos: se rotulan las menores 2 y 5, o todas si son pocas.
  if (salida.filter((x) => x.etiquetar).length < 2) {
    for (const x of salida) if (!x.mayor && ([2, 5].includes(mantisa(x.valor)) || salida.length <= 4)) x.etiquetar = true
  }
  return salida
}

/** Cuántas partes puede tener cada división con número: las de un osciloscopio (mitades, cuartos, quintos y décimos). */
export const SUBDIVISIONES = [1, 2, 4, 5, 10] as const

/** Marcas menores de un eje lineal: `n` partes iguales entre marcas con número. Con `min` y `max` siguen más allá de la primera y la última marca hasta cubrir el área. */
export function subdivisionesLineales(marcas: readonly number[], n: number, min?: number, max?: number): number[] {
  if (!(n >= 2) || marcas.length < 2 || marcas.some((m) => !Number.isFinite(m))) return []
  const salida: number[] = []
  for (let i = 1; i < marcas.length && salida.length < 4000; i++) {
    const paso = (marcas[i] - marcas[i - 1]) / n
    for (let k = 1; k < n; k++) salida.push(limpio(marcas[i - 1] + k * paso))
  }
  if (min !== undefined && max !== undefined && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    const ultimo = marcas.length - 1
    const [pa, pb] = [(marcas[1] - marcas[0]) / n, (marcas[ultimo] - marcas[ultimo - 1]) / n]
    const tol = Math.abs(pa) * 1e-6
    if (pa > 0 && pb > 0) {
      for (let k = 1; salida.length < 4000; k++) {
        const v = limpio(marcas[0] - k * pa)
        if (v < min - tol) break
        salida.push(v)
      }
      for (let k = 1; salida.length < 4000; k++) {
        const v = limpio(marcas[ultimo] + k * pb)
        if (v > max + tol) break
        salida.push(v)
      }
    }
  }
  return salida
}

/** Las marcas menores de un eje logarítmico: 2 a 9 de cada década dentro de [min, max], sin las décadas (que llevan el número). */
export function subdivisionesLog(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  const d0 = Math.floor(Math.log10(min) + 1e-12)
  const d1 = Math.ceil(Math.log10(max) - 1e-12)
  const salida: number[] = []
  for (let d = d0; d <= d1 && salida.length < 4000; d++)
    for (let m = 2; m <= 9; m++) {
      const v = limpio(m * 10 ** d)
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) salida.push(v)
    }
  return salida
}

const PREFIJOS: readonly (readonly [number, string])[] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']]

/** El texto de una marca: tres a cuatro cifras con el prefijo SI del valor y la unidad (`1 kHz`, `−250 mV`); el cero, sin unidad. */
export function textoMarca(v: number, unidad: string): string {
  if (!Number.isFinite(v)) return ''
  if (Math.abs(v) < 1e-18) return '0'
  const a = Math.abs(v)
  const [escala, prefijo] = PREFIJOS.find(([e]) => a >= e * 0.9999) ?? PREFIJOS[PREFIJOS.length - 1]
  const n = String(Number((v / escala).toPrecision(4))).replace('-', '−')
  return `${n}${prefijo || unidad ? ' ' : ''}${prefijo}${unidad}`
}
