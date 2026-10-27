/** Pestañas del diálogo Configuración: el orden es el de la fila. */
export type PestañaConfig = 'general' | 'apariencia' | 'simulacion' | 'asistente' | 'atajos'

export const PESTAÑAS_CONFIG: readonly { id: PestañaConfig; nombre: string }[] = [
  { id: 'general', nombre: 'General' },
  { id: 'apariencia', nombre: 'Apariencia' },
  { id: 'simulacion', nombre: 'Simulación' },
  { id: 'asistente', nombre: 'Asistente' },
  { id: 'atajos', nombre: 'Atajos' }
]

/** Las pestañas que se muestran: sin registro de atajos (una ventana sin proceso principal) no hay Atajos, y sin el puente del asistente no hay Asistente. */
export const pestañasVisibles = (hayAtajos: boolean, hayAsistente = false): readonly { id: PestañaConfig; nombre: string }[] =>
  PESTAÑAS_CONFIG.filter((p) => (p.id !== 'atajos' || hayAtajos) && (p.id !== 'asistente' || hayAsistente))

/** La pestaña con que abre: la pedida si existe (`archivos` y `tutorial` de antes ya no), y si no General. */
export const pestañaInicial = (pedida: string | undefined, hayAtajos: boolean, hayAsistente = false): PestañaConfig =>
  pestañasVisibles(hayAtajos, hayAsistente).find((p) => p.id === pedida)?.id ?? 'general'

/**
 * `aria-controls` de una pestaña: solo la activa tiene su panel en el DOM, así que solo ella apunta a un id que existe (WAI-ARIA).
 */
export const panelDeConfig = (id: PestañaConfig, activa: PestañaConfig): string | undefined => (id === activa ? `config-panel-${id}` : undefined)
