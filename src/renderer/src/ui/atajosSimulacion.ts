import type { Atajos } from '../editor/teclado'
import { nombreLargo } from './cinta/comandos'

export interface AccionesSimulacion {
  /** Detenida: arranca la vista previa; corriendo: la pausa; en pausa: la reanuda. */
  simularOPausar(): void
  detener(): void
  /** Muestra u oculta los chips de voltaje de todas las redes. */
  alternarVoltajes(): void
  /** El potenciómetro seleccionado: `+` y `−` mueven su cursor 5 % (existen solo cuando hay uno seleccionado). */
  potenciometro?: { paso(dir: 1 | -1): void; hay(): boolean }
  /** Las órdenes del tiempo y de lo que se muestra (cada una por el ejecutor de la cinta, que dice su razón). */
  tiempo?: { ejecutar(id: 'avanzar' | 'retroceder' | 'avanzar-hasta' | 'mas-lento' | 'mas-rapido' | 'corriente' | 'animaciones' | 'sonido'): void }
}

/** F5, Shift+F5, V, F6, Shift+F6, C y M. Los demás comandos de simulación se asignan en Configuración › Atajos. */
export function registrarAtajosDeSimulacion(a: Atajos, v: AccionesSimulacion): void {
  a.registrar({ id: 'simular', nombre: nombreLargo('simular'), teclas: ['F5'], ejecutar: () => v.simularOPausar() })
  a.registrar({ id: 'detener', nombre: nombreLargo('detener'), teclas: ['Shift+F5'], ejecutar: () => v.detener() })
  a.registrar({ id: 'voltajes', nombre: nombreLargo('voltajes'), teclas: ['V'], ejecutar: () => v.alternarVoltajes() })
  const t = v.tiempo
  if (t) {
    a.registrar({ id: 'avanzar', nombre: nombreLargo('avanzar'), teclas: ['F6'], ejecutar: () => t.ejecutar('avanzar'), repetir: true })
    a.registrar({ id: 'retroceder', nombre: nombreLargo('retroceder'), teclas: ['Shift+F6'], ejecutar: () => t.ejecutar('retroceder'), repetir: true })
    a.registrar({ id: 'corriente', nombre: nombreLargo('corriente'), teclas: ['C'], ejecutar: () => t.ejecutar('corriente') })
    a.registrar({ id: 'sonido', nombre: nombreLargo('sonido'), teclas: ['M'], ejecutar: () => t.ejecutar('sonido') })
    for (const id of ['avanzar-hasta', 'mas-lento', 'mas-rapido', 'animaciones'] as const) a.registrar({ id, nombre: nombreLargo(id), teclas: [], ejecutar: () => t.ejecutar(id) })
  }
  const pot = v.potenciometro
  if (pot) {
    // Con la vista previa, las flechas izquierda y derecha hacen lo mismo (con Shift, 1 %): las atiende el editor.
    a.registrar({ id: 'pot-mas', nombre: 'Subir el cursor del potenciómetro seleccionado 5 %', teclas: ['+'], ejecutar: () => pot.paso(1), repetir: true, activo: () => pot.hay() })
    a.registrar({ id: 'pot-menos', nombre: 'Bajar el cursor del potenciómetro seleccionado 5 %', teclas: ['-'], ejecutar: () => pot.paso(-1), repetir: true, activo: () => pot.hay() })
  }
}
