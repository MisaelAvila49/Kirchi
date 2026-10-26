import { MATEMATICO, type AjustesOsciloscopio, type CanalOMatematico } from '../../instrumentos/ajustes'
import { CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { formatearMedida } from '../../valores/valores'

/** «Ver como tabla»: 21 filas, de una orilla de la pantalla a la otra cada media división. */
export const FILAS_TABLA = 21
const BANDERA_VACIA = 8

/**
 * Valor del bloque `i` (A a D y A − B) en el instante `t`, en línea recta entre el primero y el último de su columna. NaN si está vacía. Lo usan la tabla y el CSV cuando faltan muestras.
 */
export function valorDeColumnas(p: PantallaSab, i: number, t: number): number {
  if (p.ncol === 0 || !(p.dt > 0)) return Number.NaN
  const x = (t - p.t0) / p.dt
  const j = Math.min(p.ncol - 1, Math.max(0, Math.floor(x)))
  const q = (i * p.ncol + j) * CIFRAS_COLUMNA
  if (p.columnas[q + 4] & BANDERA_VACIA) return Number.NaN
  const f = Math.min(1, Math.max(0, x - j))
  return p.columnas[q + 2] + (p.columnas[q + 3] - p.columnas[q + 2]) * f
}

/** Las columnas (Tiempo y cada canal encendido, A − B al final) y las filas, con cuatro cifras; «sin dato» donde no hay. */
export function tablaDePantalla(p: PantallaSab, a: AjustesOsciloscopio): { columnas: string[]; filas: string[][] } {
  const canales: { id: CanalOMatematico; i: number }[] = a.canales.flatMap((c, i) => (c.on ? [{ id: c.canal, i }] : []))
  if (a.matematico) canales.push({ id: MATEMATICO, i: a.canales.length })
  const conMuestras = p.csv.n > 0
  const span = p.ncol * p.dt
  const filas: string[][] = []
  for (let f = 0; f < FILAS_TABLA && (conMuestras || p.ncol > 0); f++) {
    const k = conMuestras ? Math.round((f * (p.csv.n - 1)) / (FILAS_TABLA - 1)) : 0
    const t = conMuestras ? p.csv.t0 + k * p.csv.dt : p.t0 + (f * span) / (FILAS_TABLA - 1)
    const fila = [formatearMedida(t, 's', 4)]
    for (const c of canales) {
      const v = conMuestras ? p.muestras[c.i * MUESTRAS_CSV + k] : valorDeColumnas(p, c.i, t)
      fila.push(Number.isFinite(v) ? formatearMedida(v, 'V', 4) : 'sin dato')
    }
    filas.push(fila)
  }
  return { columnas: ['Tiempo', ...canales.map((c) => (c.id === MATEMATICO ? 'A − B' : c.id))], filas }
}
