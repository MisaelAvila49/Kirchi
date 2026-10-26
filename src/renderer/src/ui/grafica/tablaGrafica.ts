import { textoMarca } from '../../../../compartido/grafica/ticks'
import type { ModeloGrafica, VistaGrafica } from './modelo'

/**
 * Gráfica como tabla para quien no ve el lienzo. Una traza larga se reduce a `maxFilas` (con primera y última), y con zoom solo trae ese tramo. El CSV trae todas.
 */
export interface BloqueTabla {
  titulo: string
  columnas: string[]
  filas: string[][]
  /** Aviso de que la tabla muestra menos puntos de los que tiene el tramo; null si los muestra todos. */
  nota: string | null
}

export const MAX_FILAS_TABLA = 100

/** Un valor con prefijo SI y su unidad; los dB y los grados no llevan prefijo (no existen los «mdB»). */
export function valorTexto(v: number, unidad: string): string {
  if (!Number.isFinite(v)) return 'sin dato'
  if (unidad === 'dB' || unidad === '°') return `${String(Number(v.toPrecision(4))).replace('-', '−')}${unidad === 'dB' ? ' dB' : '°'}`
  return textoMarca(v, unidad)
}

/** Índices repartidos parejo entre 0 y n - 1, con los dos extremos. */
export function indicesRepartidos(n: number, maximo: number): number[] {
  if (n <= maximo) return Array.from({ length: n }, (_, i) => i)
  const salida: number[] = []
  for (let k = 0; k < maximo; k++) salida.push(Math.round((k * (n - 1)) / (maximo - 1)))
  return salida
}

/** Dos arreglos con los mismos valores (a saltos, como en el CSV). */
function mismoEje(a: Float64Array, b: Float64Array): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  const paso = Math.max(1, Math.floor(a.length / 64))
  for (let i = 0; i < a.length; i += paso) if (a[i] !== b[i]) return false
  return a[a.length - 1] === b[b.length - 1]
}

const textoNota = (total: number, mostradas: number): string | null => (mostradas < total ? `Se muestran ${mostradas} de ${total} puntos, repartidos parejo. El CSV de exportar trae todos.` : null)

export function tablaDeModelo(m: ModeloGrafica, v: VistaGrafica, maxFilas = MAX_FILAS_TABLA): BloqueTabla[] {
  if (m.tipo === 'barras' && m.barras) {
    const b = m.barras
    const visibles = b.series.filter((s) => !v.ocultas.has(s.clave))
    const idx = indicesRepartidos(b.categorias.length, maxFilas)
    return [
      {
        titulo: 'Armónicos',
        columnas: ['Armónico', 'Frecuencia', ...visibles.map((s) => `${s.etiqueta} (${s.unidad})`)],
        filas: idx.map((i) => [b.categorias[i], valorTexto(b.frecuencias[i], 'Hz'), ...visibles.map((s) => valorTexto(s.valores[i], s.unidad))]),
        nota: textoNota(b.categorias.length, idx.length)
      }
    ]
  }
  const trazas = m.trazas.filter((t) => !v.ocultas.has(t.clave))
  const bloques: (typeof trazas)[] = []
  for (const t of trazas) {
    const b = bloques.find((x) => mismoEje(x[0].x, t.x))
    if (b) b.push(t)
    else bloques.push([t])
  }
  const nombreX = `${m.ejeX.nombre || 'x'}${m.ejeX.unidad ? ` (${m.ejeX.unidad})` : ''}`
  return bloques.map((b, k) => {
    const x = b[0].x
    // Solo el tramo que se ve.
    const dentro: number[] = []
    for (let i = 0; i < x.length; i++) if (!v.x || (x[i] >= v.x.min && x[i] <= v.x.max)) dentro.push(i)
    const pos = indicesRepartidos(dentro.length, maxFilas).map((j) => dentro[j])
    return {
      titulo: bloques.length > 1 ? `Bloque ${k + 1}: ${b.map((t) => t.etiqueta).join('; ')}` : '',
      columnas: [nombreX, ...b.map((t) => `${t.etiqueta} (${t.unidad})`)],
      filas: pos.map((i) => [textoMarca(x[i], m.ejeX.unidad), ...b.map((t) => valorTexto(t.y[i], t.unidad))]),
      nota: textoNota(dentro.length, pos.length)
    }
  })
}

/** Una frase para quien no ve la gráfica: el tramo del eje horizontal y el intervalo de cada traza (las primeras seis). */
export function resumenDeModelo(m: ModeloGrafica, v: VistaGrafica): string {
  if (m.tipo === 'barras' && m.barras) {
    const b = m.barras
    const series = b.series
      .slice(0, 6)
      .map((s) => {
        const f = Array.from(s.valores).filter(Number.isFinite)
        return f.length ? `${s.etiqueta}: la fundamental vale ${valorTexto(f[0], s.unidad)}` : s.etiqueta
      })
      .join('. ')
    return `Barras de ${b.categorias.length} armónicos de ${b.series.length} ${b.series.length === 1 ? 'señal' : 'señales'}. ${series}.`
  }
  const trazas = m.trazas.filter((t) => !v.ocultas.has(t.clave))
  const claves = [...new Set(trazas.map((t) => t.clave))]
  const dom = v.x ?? m.ejeX.datos
  const eje = `${m.ejeX.nombre || 'x'} de ${textoMarca(dom.min, m.ejeX.unidad)} a ${textoMarca(dom.max, m.ejeX.unidad)}`
  const partes = trazas.slice(0, 6).map((t) => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < t.y.length; i++) {
      if (t.y[i] < lo) lo = t.y[i]
      if (t.y[i] > hi) hi = t.y[i]
    }
    return Number.isFinite(lo) ? `${t.etiqueta} va de ${valorTexto(lo, t.unidad)} a ${valorTexto(hi, t.unidad)}` : t.etiqueta
  })
  return `Gráfica de ${claves.length} ${claves.length === 1 ? 'traza' : 'trazas'}, ${eje}. ${partes.join('. ')}${trazas.length > 6 ? `. Y ${trazas.length - 6} más` : ''}.`
}
