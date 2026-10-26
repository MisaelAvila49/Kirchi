import type { Editor } from './Editor'
import { PASO_REJILLA } from './rutas'
import type { Atajos } from './teclado'
// Los nombres de las órdenes que también son botones de la cinta salen de su tabla: uno solo en todas partes.
import { nombreLargo } from '../comandos/comandos'

export interface Extras {
  encuadrar(): void
  /** Mueve la vista una fracción de su tamaño (flechas sin nada seleccionado). */
  desplazarVista?(fx: number, fy: number): void
}

/** Pasos de rejilla que mueve Shift+flecha. */
export const PASOS_SHIFT = 5
/** Fracción de la vista que mueve una flecha sin selección. */
export const FRACCION_VISTA = 0.1

/** Teclas de fábrica del editor; la hoja de atajos y su configuración llegan en 1C. */
export function registrarAtajosDelEditor(a: Atajos, ed: Editor, extras: Extras): void {
  const lista: [string, string, string[], () => void][] = [
    ['deshacer', nombreLargo('deshacer'), ['Ctrl+Z'], () => ed.deshacer()],
    ['rehacer', nombreLargo('rehacer'), ['Ctrl+Y', 'Ctrl+Shift+Z'], () => ed.rehacer()],
    ['borrar', nombreLargo('borrar'), ['Supr'], () => ed.borrar()],
    ['cortar', nombreLargo('cortar'), ['Ctrl+X'], () => ed.cortar()],
    ['copiar', nombreLargo('copiar'), ['Ctrl+C'], () => ed.copiar()],
    ['pegar', nombreLargo('pegar'), ['Ctrl+V'], () => ed.pegar()],
    ['duplicar', nombreLargo('duplicar'), ['Ctrl+D'], () => ed.duplicar()],
    ['todo', nombreLargo('todo'), ['Ctrl+A'], () => ed.seleccionarTodo()],
    ['girar', nombreLargo('girar'), ['R'], () => ed.transformar('girar')],
    ['girar-izq', nombreLargo('girar-izq'), ['Shift+R'], () => ed.transformar('girarIzq')],
    ['espejo-x', nombreLargo('espejo-x'), ['X'], () => ed.transformar('espejoX')],
    ['espejo-y', nombreLargo('espejo-y'), ['Y'], () => ed.transformar('espejoY')],
    ['etiqueta', nombreLargo('etiqueta'), ['L'], () => ed.colocarEtiqueta()],
    ['tierra', nombreLargo('tierra'), ['G'], () => ed.colocarTierra()],
    ['nota', nombreLargo('nota'), ['T'], () => ed.colocarNota()],
    ['escape', 'Cancelar o deseleccionar', ['Esc'], () => ed.escape()],
    ['retroceso', 'Quitar la última esquina del cable', ['Retroceso'], () => ed.retroceso()],
    ['invertir-l', 'Invertir la L del cable', ['/'], () => ed.invertirL()],
    ['encuadrar', nombreLargo('encuadrar'), ['F'], () => extras.encuadrar()],
    ['negrita', 'Negrita', ['Ctrl+B'], () => ed.alternarFormato('negrita')],
    ['cursiva', 'Cursiva', ['Ctrl+I'], () => ed.alternarFormato('cursiva')],
    ['subrayado', 'Subrayado', ['Ctrl+U'], () => ed.alternarFormato('subrayado')],
    ['tam-mayor', 'Siguiente tamaño de letra', ['Ctrl+Shift+.'], () => ed.pasoTam(1)],
    ['tam-menor', 'Tamaño de letra anterior', ['Ctrl+Shift+,'], () => ed.pasoTam(-1)],
    ['alinear-izq', 'Alinear a la izquierda', ['Ctrl+Shift+Q'], () => ed.cambiarFormato({ alinear: 'izq' })],
    ['alinear-centro', 'Centrar', ['Ctrl+Shift+E'], () => ed.cambiarFormato({ alinear: 'centro' })],
    ['alinear-der', 'Alinear a la derecha', ['Ctrl+Shift+R'], () => ed.cambiarFormato({ alinear: 'der' })],
    ['justificar', 'Justificar', ['Ctrl+Shift+J'], () => ed.cambiarFormato({ alinear: 'just' })]
  ]
  for (const [id, nombre, teclas, ejecutar] of lista) a.registrar({ id, nombre, teclas, ejecutar })
  // Solo existen mientras se coloca: fuera de eso Enter y Espacio activan el botón enfocado.
  const colocando = () => ed.herramienta === 'colocar'
  a.registrar({ id: 'colocar-pieza', nombre: 'Colocar la pieza en el fantasma', teclas: ['Enter', 'Espacio'], ejecutar: () => ed.colocarConTeclado(false), activo: colocando })
  a.registrar({ id: 'colocar-seguir', nombre: 'Colocar y seguir colocando', teclas: ['Shift+Enter', 'Shift+Espacio'], ejecutar: () => ed.colocarConTeclado(true), activo: colocando })
  const flechas: [string, string, string, number, number][] = [
    ['izq', 'la izquierda', 'Izquierda', -1, 0],
    ['der', 'la derecha', 'Derecha', 1, 0],
    ['arriba', 'arriba', 'Arriba', 0, -1],
    ['abajo', 'abajo', 'Abajo', 0, 1]
  ]
  for (const [id, hacia, tecla, sx, sy] of flechas) {
    const mover = (pasos: number) => () => {
      if (!ed.desplazar(sx * pasos * PASO_REJILLA, sy * pasos * PASO_REJILLA)) extras.desplazarVista?.(sx * FRACCION_VISTA, sy * FRACCION_VISTA)
    }
    const nombre = hacia === 'arriba' || hacia === 'abajo' ? `Mover selección hacia ${hacia}` : `Mover selección a ${hacia}`
    a.registrar({ id: `mover-${id}`, nombre, teclas: [tecla], ejecutar: mover(1), repetir: true })
    a.registrar({ id: `mover-${id}-5`, nombre: `${nombre} cinco pasos`, teclas: [`Shift+${tecla}`], ejecutar: mover(PASOS_SHIFT), repetir: true })
  }
}
