import type { MotorTutorial } from './motor'

/**
 * Si el paso en curso se dibuja encima del diálogo abierto: él mismo lo pide o, ya cumplido, el que sigue. Así «Siguiente» no queda tapado por el telón del diálogo que el propio paso abrió.
 */
export function pasoSobreDialogo(e: ReturnType<MotorTutorial['estado']>): boolean {
  if (!e) return false
  return e.capitulo.pasos[e.paso].sobreDialogo === true || (e.cumplido && e.capitulo.pasos[e.paso + 1]?.sobreDialogo === true)
}
