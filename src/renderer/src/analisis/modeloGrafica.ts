/** Del resultado de un análisis al modelo de gráfica. El Bode usa dos paneles (dB y grados), Fourier barras y el punto de
 * operación sin barrido va en tabla. */
import type { TonoFigura } from '../../../compartido/ajustes'
import type { AspectoTraza, LadoEjeY } from '../../../compartido/grafica/aspecto'
import { textoMarca } from '../../../compartido/grafica/ticks'
import type { ResultadoMapeado } from '../../../compartido/analisis/resultados'
import type { ModeloGrafica, TrazaGrafica } from '../ui/grafica/modelo'
import { tonoPorOmision } from '../ui/grafica/paleta'

const claveDe = (corrida: string, serie: string): string => (corrida ? `${corrida} · ${serie}` : serie)

/** Los lados por omisión: la primera unidad a la izquierda, la segunda a la derecha y las demás a la izquierda. */
function ladoPorOmision(unidades: readonly string[], u: string): LadoEjeY {
  return unidades.indexOf(u) === 1 ? 'derecha' : 'izquierda'
}

export interface OpcionesModelo {
  /** En CA: dBV absolutos en lugar de la ganancia respecto a la fuente de CA. */
  dbAbsoluto?: boolean
  /** Preajuste «Informe»: la fase va en su propio panel y a la derecha por omisión; en «Instrumento» comparte la pantalla y su columna va a la izquierda, junto a la de la magnitud. */
  informe?: boolean
}

export function modeloDeResultado(r: ResultadoMapeado, elegidas: Readonly<Record<string, AspectoTraza>> = {}, opciones: OpcionesModelo = {}): ModeloGrafica | null {
  if (r.tipo === 'fourier') return modeloFourier(r, elegidas)
  if (r.tipo === 'op' && r.corridas.length === 1 && r.corridas[0].eje.length <= 1) return null
  const ac = r.tipo === 'ac'
  // La ganancia es la magnitud entre la de la fuente: 20·log10(|V|/|Vac|). Con la fuente de 1 V coincide con los dBV.
  const relativo = ac && !opciones.dbAbsoluto && r.magnitudAc !== undefined && r.magnitudAc > 0
  const desfaseDb = relativo ? 20 * Math.log10(r.magnitudAc!) : 0
  const claves: string[] = []
  const unidades: string[] = []
  for (const c of r.corridas)
    for (const s of c.series) {
      const k = claveDe(c.etiqueta, s.etiqueta)
      if (!claves.includes(k)) claves.push(k)
      const u = ac ? 'dB' : s.unidad
      if (!unidades.includes(u)) unidades.push(u)
    }
  if (claves.length === 0) return null
  const trazas: TrazaGrafica[] = []
  const una = (k: string, etiqueta: string, unidad: string, x: Float64Array, y: Float64Array, panel: number, discontinua = false): void => {
    const e = Object.hasOwn(elegidas, k) ? elegidas[k] : undefined
    // Una misma red lleva el mismo tono en todos sus paneles: el panel (o el trazo discontinuo) distingue magnitud de fase.
    const tono: TonoFigura = e?.color ?? tonoPorOmision(claves.indexOf(k))
    const lado: LadoEjeY = e ? e.lado : ac && !opciones.informe ? 'izquierda' : ladoPorOmision(unidades, unidad)
    trazas.push({ clave: k, etiqueta, unidad, x, y, panel, tono, lado, ...(discontinua ? { discontinua: true } : {}), ...(e?.grosor != null ? { grosor: e.grosor } : {}), ...(e?.prefijo != null ? { prefijo: e.prefijo } : {}), ...(e?.decimales !== undefined ? { decimales: e.decimales } : {}), ...(e?.rango ? { rango: e.rango } : {}) })
  }
  for (const c of r.corridas)
    for (const s of c.series) {
      const k = claveDe(c.etiqueta, s.etiqueta)
      if (ac) {
        una(k, k, 'dB', c.eje, relativo && s.magnitud === 'V' ? s.valores.map((v) => v - desfaseDb) : s.valores, 0)
        // En «Instrumento» la fase comparte pantalla con la magnitud: mismo tono y trazo discontinuo para no confundirse con ella.
        if (s.fase) una(k, k, '°', c.eje, s.fase, 1, !opciones.informe)
      } else una(k, k, s.unidad, c.eje, s.valores, 0)
    }
  let min = Infinity
  let max = -Infinity
  for (const c of r.corridas)
    for (let i = 0; i < c.eje.length; i++) {
      if (c.eje[i] < min) min = c.eje[i]
      if (c.eje[i] > max) max = c.eje[i]
    }
  if (!Number.isFinite(min)) return null
  if (max === min) max = min + 1
  return {
    tipo: 'lineas',
    ejeX: { nombre: r.ejeNombre, unidad: r.ejeUnidad, escala: r.logX ? 'log' : 'lin', datos: { min, max } },
    paneles: ac ? [{ titulo: opciones.dbAbsoluto ? 'Magnitud (dBV)' : 'Ganancia (dB)' }, { titulo: 'Fase' }] : [{ titulo: '' }],
    trazas
  }
}

function modeloFourier(r: ResultadoMapeado, elegidas: Readonly<Record<string, AspectoTraza>>): ModeloGrafica | null {
  const f = r.corridas[0]?.fourier
  if (!f || f.length === 0) return null
  const n = Math.max(...f.map((s) => s.armonicos.length))
  const unidadDe = (u: string): string => (u === 'dB' ? 'V' : u)
  const unidades = [...new Set(f.map((s) => unidadDe(s.unidad)))]
  const frecuencia = f[0].armonicos[0]?.frecuencia ?? 0
  const categorias = Array.from({ length: n }, (_, i) => String(i + 1))
  const notas = f.map((s) => (s.thd === null ? `${s.etiqueta}: sin THD` : `${s.etiqueta}: THD ${Number(s.thd.toPrecision(3))} %`))
  return {
    tipo: 'barras',
    ejeX: { nombre: `Armónico (fundamental ${textoMarca(frecuencia, 'Hz')})`, unidad: '', escala: 'lin', datos: { min: 0, max: n } },
    paneles: [{ titulo: '' }],
    trazas: [],
    barras: {
      categorias,
      unidad: unidades.join(' y '),
      frecuencias: Float64Array.from({ length: n }, (_, k) => f[0].armonicos[k]?.frecuencia ?? Number.NaN),
      nota: [...notas, ...(unidades.length > 1 ? ['Las series tienen unidades distintas en un mismo eje.'] : [])].join('   '),
      series: f.map((s, i) => {
        const e = Object.hasOwn(elegidas, s.etiqueta) ? elegidas[s.etiqueta] : undefined
        return { clave: s.etiqueta, etiqueta: s.etiqueta, tono: e?.color ?? tonoPorOmision(i), unidad: unidadDe(s.unidad), valores: Float64Array.from({ length: n }, (_, k) => s.armonicos[k]?.magnitud ?? Number.NaN) }
      })
    }
  }
}

/** El valor de una curva (x creciente) en `t`, por interpolación lineal; NaN fuera de su rango. */
function interpolar(x: Float64Array, y: Float64Array, t: number): number {
  const n = x.length
  if (n === 0 || !(t >= x[0]) || !(t <= x[n - 1])) return Number.NaN
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (x[m] <= t) lo = m
    else hi = m
  }
  const d = x[hi] - x[lo]
  return d === 0 ? y[lo] : y[lo] + ((t - x[lo]) / d) * (y[hi] - y[lo])
}

/** Las trazas que pueden hacer de eje horizontal en una gráfica X-Y: las de un modelo de una sola pantalla con eje lineal (no un Bode ni barras). */
export function candidatosXY(m: ModeloGrafica | null): { clave: string; etiqueta: string; unidad: string }[] {
  if (!m || m.tipo !== 'lineas' || m.paneles.length !== 1 || m.ejeX.escala !== 'lin') return []
  const vistas = new Set<string>()
  const lista = m.trazas.filter((t) => !vistas.has(t.clave) && !!vistas.add(t.clave))
  return lista.length >= 2 ? lista.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, unidad: t.unidad })) : []
}

/** La gráfica con una traza como eje horizontal (X-Y), con las demás interpoladas en sus instantes. Devuelve null si no
 * existe o no queda otra traza. */
export function modeloXY(m: ModeloGrafica, claveX: string): ModeloGrafica | null {
  if (candidatosXY(m).length === 0) return null
  const tx = m.trazas.find((t) => t.clave === claveX)
  if (!tx) return null
  const trazas: TrazaGrafica[] = []
  let min = Infinity
  let max = -Infinity
  for (const t of m.trazas) {
    if (t.clave === claveX) continue
    const mismoEje = t.x.length === tx.x.length && t.x.every((v, i) => v === tx.x[i])
    const x = mismoEje ? tx.y : Float64Array.from(t.x, (v) => interpolar(tx.x, tx.y, v))
    const y = t.y
    for (const v of x) {
      if (v < min) min = v
      if (v > max) max = v
    }
    trazas.push({ ...t, x, y })
  }
  if (trazas.length === 0 || !Number.isFinite(min)) return null
  if (max === min) max = min + 1
  return { ...m, xy: true, ejeX: { nombre: tx.etiqueta, unidad: tx.unidad, escala: 'lin', datos: { min, max } }, trazas }
}
