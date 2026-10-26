/** Navegación con flechas dentro de la barra de formato. `null` si la tecla no mueve. */
export function siguienteControl(total: number, actual: number, tecla: string): number | null {
  if (total <= 0) return null
  if (tecla === 'ArrowRight') return Math.min(total - 1, actual + 1)
  if (tecla === 'ArrowLeft') return Math.max(0, actual - 1)
  if (tecla === 'Home') return 0
  if (tecla === 'End') return total - 1
  return null
}
