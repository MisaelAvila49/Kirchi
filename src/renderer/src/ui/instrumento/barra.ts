import type { NombreIcono } from '../cinta/trazos'
import type { Tono } from '../colores'

/**
 * Barra del instrumento, común al osciloscopio y a las gráficas: qué botones hay, su grupo, icono, nombre corto, atajo, descripción y tecla.
 */
export type AccionBarra = 'pausa' | 'auto' | 'cursores' | 'acercar' | 'alejar' | 'restablecer' | 'exportar' | 'aspecto' | 'mas' | 'ventana'
export type GrupoBarra = 'captura' | 'medir' | 'zoom' | 'salida' | 'ventana'

export interface DefBoton {
  accion: AccionBarra
  grupo: GrupoBarra
  tono: Tono
  icono: NombreIcono
  /** Nombre completo: lo que lee el lector de pantalla y dice el globo. */
  nombre: string
  /** El rótulo visible; sin él, el botón es solo un icono (el zoom y Aspecto). */
  corto?: string
  /** El nombre para el lector de pantalla cuando el rótulo corto no es parte de `nombre` («Auto: ajuste automático»): el nombre accesible lleva el texto visible (WCAG 2.5.3). */
  aria?: string
  /** Atajo con el foco dentro del panel, como se escribe en el globo («Ctrl+Mayús+V»). */
  atajo: string
}

export const GRUPOS_BARRA: readonly { id: GrupoBarra; nombre: string }[] = [
  { id: 'captura', nombre: 'Captura' },
  { id: 'medir', nombre: 'Medir' },
  { id: 'zoom', nombre: 'Zoom' },
  { id: 'salida', nombre: 'Salida' },
  { id: 'ventana', nombre: 'Ventana' }
]

export const BOTONES_BARRA: Readonly<Record<AccionBarra, DefBoton>> = {
  pausa: { accion: 'pausa', grupo: 'captura', tono: 'azul', icono: 'pausa', nombre: 'Pausar', corto: 'Pausar', atajo: 'P' },
  auto: { accion: 'auto', grupo: 'captura', tono: 'verdeazul', icono: 'ajusteAuto', nombre: 'Ajuste automático', corto: 'Auto', aria: 'Auto: ajuste automático', atajo: 'A' },
  cursores: { accion: 'cursores', grupo: 'medir', tono: 'magenta', icono: 'cursores', nombre: 'Cursores', corto: 'Cursores', atajo: 'C' },
  acercar: { accion: 'acercar', grupo: 'zoom', tono: 'cian', icono: 'acercar', nombre: 'Acercar', atajo: '+' },
  alejar: { accion: 'alejar', grupo: 'zoom', tono: 'cian', icono: 'alejar', nombre: 'Alejar', atajo: '−' },
  restablecer: { accion: 'restablecer', grupo: 'zoom', tono: 'cian', icono: 'zoomRestablecer', nombre: 'Restablecer el zoom', atajo: '0' },
  exportar: { accion: 'exportar', grupo: 'salida', tono: 'naranja', icono: 'exportar', nombre: 'Exportar…', corto: 'Exportar', atajo: 'Ctrl+E' },
  aspecto: { accion: 'aspecto', grupo: 'salida', tono: 'gris', icono: 'configuracion', nombre: 'Aspecto', atajo: 'S' },
  mas: { accion: 'mas', grupo: 'salida', tono: 'ocre', icono: 'masAjustes', nombre: 'Más ajustes', corto: 'Ajustes', atajo: 'M' },
  ventana: { accion: 'ventana', grupo: 'ventana', tono: 'violeta', icono: 'ventanaAparte', nombre: 'Abrir en ventana', corto: 'Ventana', atajo: 'Ctrl+Mayús+V' }
}

/** Cómo se ve un botón según su estado: Pausar pasa a Reanudar y Ventana a Acoplar. */
export interface AspectoBoton {
  nombre: string
  /** El nombre accesible: el de siempre, o el que empieza por el rótulo visible. */
  aria: string
  corto?: string
  icono: NombreIcono
  atajo: string
}

export function aspectoDeBoton(accion: AccionBarra, estado: { pausada?: boolean; enVentana?: boolean } = {}): AspectoBoton {
  const d = BOTONES_BARRA[accion]
  if (accion === 'pausa' && estado.pausada) return { nombre: 'Reanudar', aria: 'Reanudar', corto: 'Reanudar', icono: 'simular', atajo: d.atajo }
  if (accion === 'ventana' && estado.enVentana) return { nombre: 'Acoplar a la franja', aria: 'Acoplar a la franja', corto: 'Acoplar', icono: 'acoplar', atajo: d.atajo }
  return { nombre: d.nombre, aria: d.aria ?? d.nombre, ...(d.corto ? { corto: d.corto } : {}), icono: d.icono, atajo: d.atajo }
}

/** El texto del globo: el nombre y, entre paréntesis, el atajo. */
export const textoGlobo = (a: AspectoBoton): string => `${a.nombre} (${a.atajo})`

/** El valor de `aria-keyshortcuts` de un atajo escrito como en el globo. */
export const atajoAria = (atajo: string): string => atajo.replace('Mayús', 'Shift').replace('−', '-')

interface TeclaBarra {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** La orden que enciende una tecla con el foco dentro del panel (null si no es de la barra). */
export function accionDeTecla(e: TeclaBarra): AccionBarra | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (e.altKey) return null
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) return k === 'v' ? 'ventana' : null
  if (e.ctrlKey || e.metaKey) return k === 'e' ? 'exportar' : null
  switch (k) {
    case 'p':
      return e.shiftKey ? null : 'pausa'
    case 'a':
      return e.shiftKey ? null : 'auto'
    case 'c':
      return e.shiftKey ? null : 'cursores'
    case 's':
      return e.shiftKey ? null : 'aspecto'
    case 'm':
      return e.shiftKey ? null : 'mas'
    case '+':
    case '=':
      return 'acercar'
    case '-':
    case '−':
      return 'alejar'
    case '0':
      return 'restablecer'
    default:
      return null
  }
}
