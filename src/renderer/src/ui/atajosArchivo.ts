import type { Atajos } from '../editor/teclado'
import { nombreLargo } from './cinta/comandos'

export interface AccionesArchivo {
  nuevo(): void
  abrir(): void
  guardar(): void
  guardarComo(): void
}

/** Atajos del menú Archivo. No actúan mientras se escribe en un campo. */
export function registrarAtajosDeArchivo(a: Atajos, v: AccionesArchivo): void {
  a.registrar({ id: 'nuevo', nombre: nombreLargo('nuevo'), teclas: ['Ctrl+N'], ejecutar: () => v.nuevo() })
  a.registrar({ id: 'abrir', nombre: nombreLargo('abrir'), teclas: ['Ctrl+O'], ejecutar: () => v.abrir() })
  a.registrar({ id: 'guardar', nombre: nombreLargo('guardar'), teclas: ['Ctrl+S'], ejecutar: () => v.guardar() })
  a.registrar({ id: 'guardar-como', nombre: nombreLargo('guardar-como'), teclas: ['Ctrl+Shift+S'], ejecutar: () => v.guardarComo() })
}
