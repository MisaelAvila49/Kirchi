/** Cálculo máximo por tick del worker, en milisegundos. */
export const BUDGET_MS = 8
/** Pasos por llamada a `advance_to` como máximo. */
export const LOTE_MAX = 200

/** Cuántos pasos pedir al motor por llamada sin pasarse del presupuesto: un lote fijo de 200 con 256 nodos y 1,024
 * elementos tardaba cerca de 660 ms y congelaba la lectura. */
export class PresupuestoDeLote {
  /** Milisegundos por paso suavizados; NaN mientras no hay medida. */
  msPorPaso = Number.NaN

  /** Pasos que caben en `restanteMs`, entre 1 y LOTE_MAX; sin medida, uno. */
  tamano(restanteMs: number): number {
    if (Number.isNaN(this.msPorPaso)) return 1
    const lote = Math.floor(restanteMs / Math.max(this.msPorPaso, 1e-4))
    return Math.min(LOTE_MAX, Math.max(1, lote))
  }

  /** Registra que `pasos` pasos tardaron `ms`: sube al instante si se encarecen, baja un 30 % hacia lo nuevo. */
  medir(ms: number, pasos: number): void {
    if (!(pasos > 0) || !(ms >= 0)) return
    const m = ms / pasos
    this.msPorPaso = Number.isNaN(this.msPorPaso) || m > this.msPorPaso ? m : 0.7 * this.msPorPaso + 0.3 * m
  }
}
