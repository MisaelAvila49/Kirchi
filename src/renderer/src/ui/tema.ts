import type { Tema } from '../../../compartido/ajustes'

export const NOMBRE_TEMA: Record<Tema, string> = { claro: 'Claro', oscuro: 'Oscuro' }

/** Nombre accesible del botón de tema: es un interruptor del tema oscuro y contiene el texto visible (el tema de ahora). */
export const nombreBotonTema = (t: Tema): string => `Tema oscuro, ahora ${NOMBRE_TEMA[t].toLowerCase()}`
