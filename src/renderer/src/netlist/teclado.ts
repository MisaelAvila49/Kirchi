import type { ElementoMotor } from '../../../compartido/netlistMotor'
import type { ModeloDef } from '../piezas/tipos'
import type { TerminalPuente } from './puenteH'

/** El interruptor DIP y el teclado matricial: un `INTC` por contacto, cada uno con su canal, así que mover una palanca o
 * pulsar una tecla escribe un canal y no rehace la netlist. */
export type ModeloInterruptores = Extract<ModeloDef, { tipo: 'interruptores' }>
export type ModeloTeclado = Extract<ModeloDef, { tipo: 'teclado' }>

export interface ArmadoContactos {
  red: (pin: string) => number
  etiqueta: (pin: string) => string
  /** Un canal nuevo con su valor inicial (0 abierto, 1 cerrado); `k` es el contacto y la clave de `canalDe` es `idPieza:propId:k`. */
  canal: (propId: string, k: number, inicial: 0 | 1) => number
  analogico: (terminales: TerminalPuente[], el: (nodos: number[]) => ElementoMotor, grupos: { pines: number[]; tierra: boolean }[]) => void
}

/** Id de propiedad con que se escriben los canales de las teclas del teclado (no es una propiedad del `pieza.json`: la tecla pulsada no se guarda). */
export const PROP_TECLA = 'tecla'

/** Los contactos del DIP: la posición k une el par k de `contactos`; arranca como dice `estado` («10100000»), un 1 es cerrado. */
export function armarInterruptores(m: ModeloInterruptores, estado: string, a: ArmadoContactos): void {
  m.contactos.forEach(([x, y], k) => contacto(a, m.estado, k, x, y, m.r_on, m.r_off, estado[k] === '1' ? 1 : 0))
}

/** Las teclas del teclado: la tecla (fila i, columna j) es la k = i · columnas + j y une la fila i con la columna j; arrancan sueltas. */
export function armarTeclado(m: ModeloTeclado, a: ArmadoContactos): void {
  m.filas.forEach((f, i) => m.columnas.forEach((c, j) => contacto(a, PROP_TECLA, i * m.columnas.length + j, f, c, m.r_on, m.r_off, 0)))
}

/** Un contacto entre dos pines: ninguno de los dos se reporta suelto por tenerlo (un teclado sin cablear es normal). */
function contacto(a: ArmadoContactos, propId: string, k: number, x: string, y: string, r_on: number, r_off: number, inicial: 0 | 1): void {
  const canal = a.canal(propId, k, inicial)
  const t = (pin: string): TerminalPuente => ({ red: a.red(pin), etiqueta: '', pin, mudo: true })
  a.analogico([t(x), t(y)], ([p, n]) => ({ type: 'INTC', a: p, b: n, canal, r_on, r_off }), [])
}

/** Rebote de un contacto en 5 ms: cambios `[t, valor]` fijos (el mismo patrón siempre), el primero en t = 0 y el último en
 * el valor final. Al cerrar el valor final es 1; al abrir, 0. */
export function secuenciaDeRebote(cierra: boolean): [number, 0 | 1][] {
  const cierre: [number, 0 | 1][] = [[0, 1], [0.3e-3, 0], [0.7e-3, 1], [1.4e-3, 0], [2e-3, 1], [3.2e-3, 0], [4.5e-3, 1]]
  return cierra ? cierre : cierre.map(([t, v]) => [t, (1 - v) as 0 | 1])
}
