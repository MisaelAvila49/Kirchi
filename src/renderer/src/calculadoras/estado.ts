import { createSignal } from 'solid-js'
import { CALCULADORAS, estadoInicial, IDS_CALCULADORAS, type EstadoCalc, type IdCalculadora } from './catalogo'

/** Lo escrito en cada calculadora y cuál está abierta. Vive fuera del panel para que cambiar de panel no lo borre; se
 * pierde al cerrar la aplicación. */
const valoresIniciales = (): Record<IdCalculadora, EstadoCalc> => Object.fromEntries(CALCULADORAS.map((d) => [d.id, estadoInicial(d)])) as Record<IdCalculadora, EstadoCalc>

const [activa, ponerActiva] = createSignal<IdCalculadora>('divisor')
const [estados, ponerEstados] = createSignal<Record<IdCalculadora, EstadoCalc>>(valoresIniciales())

export const calculadoraActiva = activa
export const estadoDeCalculadora = (id: IdCalculadora): EstadoCalc => estados()[id]

/** Abre una calculadora de la lista; un id desconocido no cambia nada. */
export function elegirCalculadora(id: string): void {
  if ((IDS_CALCULADORAS as readonly string[]).includes(id)) ponerActiva(id as IdCalculadora)
}

/** Escribe un campo de una calculadora. */
export function ponerCampo(id: IdCalculadora, campo: string, texto: string): void {
  ponerEstados((e) => ({ ...e, [id]: { ...e[id], [campo]: texto } }))
}

