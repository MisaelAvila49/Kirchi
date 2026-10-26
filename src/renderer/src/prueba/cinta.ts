import type { EstadoCinta } from '../ui/cinta/estado'

/** Estado de la cinta para las pruebas: detenida, con historial, portapapeles, una pieza seleccionada y ventana de Electron. */
export const estadoCintaDePrueba = (extra: Partial<EstadoCinta> = {}): EstadoCinta => ({
  fase: 'detenida', puedeDeshacer: true, puedeRehacer: true, puedePegar: true, soloLectura: false, vacio: false, recientes: 2, voltajes: false,
  tema: 'claro', panel: 'libreria', lateral: true, inspector: true, panelDerecho: 'inspector', franja: null, plegada: false, ventana: true,
  seleccion: 1, piezasSeleccionadas: 1, colocando: false, topeZoom: null, tamañoInterfaz: 100,
  velocidad: 1, corriente: false, animaciones: true, movimientoReducido: false, sonido: true, ...extra
})
