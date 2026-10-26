import type { Atajos } from '../editor/teclado'
import { nombreLargo } from './cinta/comandos'

export interface AccionesVentana {
  hojaDeAtajos(): void
  lienzoLimpio(): void
  configuracion(): void
  /** Shift+F10 o la tecla de menú: abre el menú contextual desde el teclado. */
  menuContextual(): void
  /** Alt+F10: pasa el foco a la barra flotante de formato (si hay notas o etiquetas seleccionadas). */
  enfocarFormato(): void
  /** Ctrl+F1: pliega la cinta de la barra superior (queda la fila de pestañas) o la vuelve a fijar. */
  plegarCinta?(): void
  /** Ctrl+K: lleva el foco al buscador de comandos de la barra superior. */
  buscarComando?(): void
  /** Lleva el foco al globo del tutorial en marcha. */
  enfocarTutorial?(): void
  /** Empieza a grabar con las opciones guardadas (sin tecla de fábrica). */
  grabar?(): void
  /** Detiene la grabación en curso (sin tecla de fábrica). */
  detenerGrabacion?(): void
}

/**
 * Atajos de la ventana. `Ctrl+\` también como `Ctrl+Alt+\`: en teclados en español la diagonal invertida llega con AltGr.
 */
export function registrarAtajosDeLaVentana(a: Atajos, v: AccionesVentana): void {
  a.registrar({ id: 'atajos', nombre: nombreLargo('atajos'), teclas: ['?'], ejecutar: () => v.hojaDeAtajos() })
  a.registrar({ id: 'limpio', nombre: nombreLargo('limpio'), teclas: ['Ctrl+Shift+L', 'Ctrl+\\', 'Ctrl+Alt+\\'], ejecutar: () => v.lienzoLimpio() })
  a.registrar({ id: 'menu-contextual', nombre: 'Menú contextual de la selección', teclas: ['Shift+F10', 'ContextMenu'], ejecutar: () => v.menuContextual() })
  a.registrar({ id: 'formato-barra', nombre: 'Ir a la barra de formato del texto', teclas: ['Alt+F10'], ejecutar: () => v.enfocarFormato() })
  a.registrar({ id: 'configuracion', nombre: nombreLargo('configuracion'), teclas: ['Ctrl+,'], ejecutar: () => v.configuracion() })
  const plegar = v.plegarCinta
  if (plegar) a.registrar({ id: 'plegar-cinta', nombre: nombreLargo('plegar-cinta'), teclas: ['Ctrl+F1'], ejecutar: () => plegar() })
  const tutorial = v.enfocarTutorial
  if (tutorial) a.registrar({ id: 'enfocar-tutorial', nombre: nombreLargo('enfocar-tutorial'), teclas: ['F1'], ejecutar: () => tutorial() })
  const grabar = v.grabar
  if (grabar) a.registrar({ id: 'grabar', nombre: nombreLargo('grabar'), teclas: [], ejecutar: () => grabar() })
  const detener = v.detenerGrabacion
  if (detener) a.registrar({ id: 'detener-grabacion', nombre: nombreLargo('detener-grabacion'), teclas: [], ejecutar: () => detener() })
  const buscar = v.buscarComando
  if (buscar) a.registrar({ id: 'buscar-comando', nombre: 'Buscar un comando', teclas: ['Ctrl+K'], ejecutar: () => buscar() })
}
