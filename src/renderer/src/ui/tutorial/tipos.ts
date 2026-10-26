import type { Conexiones } from '../../conexiones/conexiones'
import type { Documento, Punto, Rotacion } from '../../doc/tipos'
import type { Caja, PiezaDef } from '../../piezas/tipos'
import type { FaseSim } from '../../sim/control'
import type { TonoCategoria } from '../colores'

/** Lo que una condición puede mirar: documento, simulación y centro de la vista. Nunca simula ni escribe. */
export interface CtxTutorial {
  doc: Documento
  con: Conexiones
  lib: ReadonlyMap<string, PiezaDef>
  fase: FaseSim
  /** Centro del lienzo visible, en unidades del mundo (sirve para señalar dónde colocar la primera pieza). */
  centro: Punto
  /**
   * Eventos de la aplicación desde que empezó el paso (guardar, abrir reciente, exportar, mover con Alt). Los pone `MotorTutorial.registrar`.
   */
  eventos?: ReadonlySet<string>
  /** La pestaña de la franja inferior a la vista (null con la franja plegada). */
  franja?: 'osciloscopio' | 'graficas' | 'registro' | null
  /** El panel del riel derecho a la vista (null con el panel plegado). */
  derecho?: 'inspector' | 'mediciones' | 'proyecto' | 'analisis' | null
  /** Las piezas seleccionadas. */
  seleccion?: ReadonlySet<string>
  /** Los cursores del osciloscopio están encendidos. */
  cursores?: boolean
  /** El lienzo limpio (Ctrl+Shift+L, o Ctrl+\) está activo. */
  limpio?: boolean
  /** El diálogo abierto, si hay uno. */
  dialogo?: string | null
}

/** Dónde pone el foco el paso: un control de la interfaz (por selector), una zona del lienzo (mundo) o nada. */
export type Objetivo = { tipo: 'control'; selector: string; /** Pestaña de la cinta que lo trae: si el control no está a la vista se señala su pestaña. */ pestana?: string; /** Otro control que se señala si el principal no está a la vista (el botón de la pestaña de la franja, si la franja muestra otra). */ respaldo?: string } | { tipo: 'zona'; caja: Caja } | { tipo: 'ninguno' }

/** Una pieza que se dibuja translúcida en el lienzo: dónde va y en qué giro. */
export interface GuiaPieza {
  tipo: string
  x: number
  y: number
  rot: Rotacion
  props?: Readonly<Record<string, string>>
}

/** Lo que el paso dibuja sobre el lienzo para guiar: las piezas esperadas (la sombra) y los cables esperados, punteados. */
export interface Guia {
  piezas: GuiaPieza[]
  cables: Punto[][]
}

export interface PasoDef {
  id: string
  /** Lo que se hace, en una línea: el «Sigue: …» del paso anterior y el nombre accesible del punto. */
  resumen: string
  /** Texto del globo. `{tecla:id}` se cambia por la tecla vigente del comando (la que el usuario tenga configurada). */
  texto: string
  /** Lo que se dice al cumplirse el paso (con el ✓ delante). */
  cumplido: string
  /** Ayuda opcional, un renglón más abajo del texto. */
  pista?: string
  objetivo(ctx: CtxTutorial): Objetivo
  /** Lo que el paso abre al empezar, porque los paneles arrancan plegados: la librería, un panel del riel derecho o una pestaña de la franja. */
  abre?: 'libreria' | 'inspector' | 'mediciones' | 'proyecto' | 'analisis' | 'osciloscopio'
  /** Otras zonas o controles que quedan a la vista junto al objetivo: el resultado de la acción aparece en otro lugar (la lectura, la pantalla). */
  focos?(ctx: CtxTutorial): Objetivo[]
  /** La sombra de la pieza esperada y los cables esperados. Colocar la pieza sobre la sombra cumple el paso. */
  guia?(ctx: CtxTutorial): Guia
  /** Hay una pieza del tipo esperado, pero no sobre la sombra: el globo dice «colócalo sobre la sombra». */
  fueraDeSombra?(ctx: CtxTutorial): boolean
  /**
   * La condición depende de algo que pasa y se va y no se lee del documento: al reanudar estos pasos no cuentan como pendientes.
   */
  transitorio?: boolean
  /**
   * Cómo se comprueba el paso al retomar cuando una acción posterior pudo cambiarlo (220 Ω pasa a 1 kΩ en «valor»). Sin esto se usa `hecho`.
   */
  sigueVigente?(ctx: CtxTutorial): boolean
  /** El lado del objetivo donde se prefiere el globo (por omisión, debajo): un paso que se hace debajo del objetivo lo pide a un costado. */
  lado?: 'abajo' | 'arriba' | 'derecha' | 'izquierda'
  /** Verdadero cuando la acción ocurrió en el editor o en la simulación. */
  hecho(ctx: CtxTutorial): boolean
}

export interface CapituloDef {
  /** Id estable: es la clave del avance en `settings.json`. */
  id: string
  numero: number
  titulo: string
  /** Una línea para el selector. */
  resumen: string
  minutos: number
  tono: TonoCategoria
  /** Los pasos; vacío en un capítulo que todavía no está hecho (el selector lo marca «Próximamente»). */
  pasos: readonly PasoDef[]
  /** La zona del mundo que ocupa el circuito del capítulo: la vista se encuadra sobre ella con un zoom fijo. */
  zona: Caja
  /** Pasos que tendrá cuando esté hecho, para el selector. */
  totalPasos: number
  /** Abre un documento nuevo al empezar (el capítulo 1). */
  documentoNuevo?: boolean
  /** Empieza con su circuito de arranque (`arranques.ts`), el que deja el capítulo anterior (capítulos 2 a 5). */
  arranque?: boolean
}
