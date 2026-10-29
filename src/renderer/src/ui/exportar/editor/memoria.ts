import type { ModeloGrafica } from '../../grafica/modelo'
import type { EstadoEditor } from './edicion'

type Tipo = 'grafica' | 'pantalla'

// Lo ajustado en un diálogo de exportar se guarda por tipo y fuente de datos: reabrir con los mismos datos lo conserva.
const guardado = new Map<Tipo, { id: string; estado: EstadoEditor }>()

export function recordarEstado(tipo: Tipo, id: string | undefined, estado: EstadoEditor): void {
  if (id) guardado.set(tipo, { id, estado })
}

/** Lo que había la última vez con esta misma fuente de datos; null si es otra (otros datos empiezan limpios). */
export function recuperarEstado(tipo: Tipo, id: string | undefined): EstadoEditor | null {
  const g = guardado.get(tipo)
  return id && g && g.id === id ? g.estado : null
}

export const olvidarTodo = (): void => guardado.clear()

/** Suma de los valores finitos, sin copiar el arreglo (las trazas pueden tener millones de puntos). */
export function sumaFinita(a: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) s += a[i]
  return s
}

/** Identidad de los datos de una gráfica: título y, por traza, tamaño, extremos y suma (otro análisis o corrida da otra). */
export function huellaDeModelo(titulo: string, m: ModeloGrafica): string {
  const suma = sumaFinita
  const trazas = m.trazas.map((t) => `${t.clave}:${t.x.length}:${t.x[0]}:${t.x[t.x.length - 1]}:${suma(t.y)}`)
  return `${titulo}|${m.tipo}|${trazas.join(';')}|${m.barras ? m.barras.series.map((s) => `${s.clave}:${s.valores.length}:${suma(s.valores)}`).join(',') : ''}`
}
