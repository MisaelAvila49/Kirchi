export interface CondicionAvance {
  /** El paso ya se cumplió. */
  cumplido: boolean
  /** Es el último paso del capítulo: ahí se termina con un botón, nunca solo. */
  ultimo: boolean
  /** Configuración › «Avanzar solo en el tutorial». */
  avanzarSolo: boolean
  /** `prefers-reduced-motion`. */
  movimientoReducido: boolean
  /** El ratón está sobre el globo o el foco está dentro: se lee o se usa, no se avanza. */
  retenido: boolean
}

/** Si el paso cumplido debe pasar solo al siguiente tras la espera. */
export const avanzaSolo = (c: CondicionAvance): boolean => c.cumplido && !c.ultimo && c.avanzarSolo && !c.movimientoReducido && !c.retenido

/**
 * Si el globo lleva el carril de la barra de avance, sin mirar `retenido`: si no, al poner el ratón el globo encoge, el ratón sale de su borde, la barra vuelve y el globo parpadea.
 */
export const reservaBarra = (c: CondicionAvance): boolean => avanzaSolo({ ...c, retenido: false })
