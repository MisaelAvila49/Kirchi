/** Pestañas del diálogo Configuración: el orden es el de la fila. */
export type PestañaConfig = 'general' | 'apariencia' | 'simulacion' | 'archivos' | 'atajos' | 'tutorial'

export const PESTAÑAS_CONFIG: readonly { id: PestañaConfig; nombre: string }[] = [
  { id: 'general', nombre: 'General' },
  { id: 'apariencia', nombre: 'Apariencia' },
  { id: 'simulacion', nombre: 'Simulación' },
  { id: 'archivos', nombre: 'Archivos' },
  { id: 'atajos', nombre: 'Atajos' },
  { id: 'tutorial', nombre: 'Tutorial' }
]

/** Las pestañas que se muestran: sin registro de atajos (una ventana sin proceso principal) no hay pestaña Atajos. */
export const pestañasVisibles = (hayAtajos: boolean): readonly { id: PestañaConfig; nombre: string }[] =>
  hayAtajos ? PESTAÑAS_CONFIG : PESTAÑAS_CONFIG.filter((p) => p.id !== 'atajos')

/** La pestaña con que abre: la pedida si existe, y si no General. */
export const pestañaInicial = (pedida: PestañaConfig | undefined, hayAtajos: boolean): PestañaConfig =>
  pedida && pestañasVisibles(hayAtajos).some((p) => p.id === pedida) ? pedida : 'general'

/**
 * `aria-controls` de una pestaña: solo la activa tiene su panel en el DOM, así que solo ella apunta a un id que existe (WAI-ARIA).
 */
export const panelDeConfig = (id: PestañaConfig, activa: PestañaConfig): string | undefined => (id === activa ? `config-panel-${id}` : undefined)
