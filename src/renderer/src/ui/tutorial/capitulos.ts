import { CAPITULO_1 } from './capitulo1'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { CAPITULO_4 } from './capitulo4'
import { CAPITULO_5 } from './capitulo5'
import type { CapituloDef } from './tipos'

/** Los cinco capítulos de «Aprende Kirchi». */
export const CAPITULOS: readonly CapituloDef[] = [CAPITULO_1, CAPITULO_2, CAPITULO_3, CAPITULO_4, CAPITULO_5]

export const capituloPorId = (id: string): CapituloDef | undefined => CAPITULOS.find((c) => c.id === id)
export const minutosTotales = (): number => CAPITULOS.reduce((s, c) => s + c.minutos, 0)
