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
  /** Los chips de voltaje de las redes están visibles (tecla V). */
  voltajes?: boolean
  /** El diálogo abierto, si hay uno (`atajos`, `exportar-grafica`, `exportar-esquema`, `exportar-captura`...). */
  dialogo?: string | null
  /** El panel del riel izquierdo a la vista (null con el panel plegado). */
  izquierdo?: 'libreria' | 'plantillas' | 'calculadoras' | null
  /** La calculadora elegida y, en Filtros, el tipo y la frecuencia del muesco escritos. */
  calculadora?: { activa: string; tipo?: string; f0?: string }
  /** El botón Cursores de la gráfica de una corrida está encendido (se lee del DOM). */
  cursoresGrafica?: boolean
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

export type LadoGlobo = 'abajo' | 'arriba' | 'derecha' | 'izquierda'

export interface PasoDef {
  id: string
  /**
   * «Mira»: un marco enmarca una zona, el globo la explica en una línea y se avanza con «Siguiente». «Haz» (por omisión): la aplicación comprueba la acción y avanza.
   */
  tipo?: 'mira' | 'haz'
  /** El globo y el marco se dibujan encima del diálogo abierto (la figura que se exporta), en vez de esconderse. */
  sobreDialogo?: boolean
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
  abre?: 'libreria' | 'plantillas' | 'calculadoras' | 'inspector' | 'mediciones' | 'proyecto' | 'analisis' | 'osciloscopio' | 'graficas'
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
  /** El lado del objetivo donde se prefiere el globo (por omisión, debajo): un paso que se hace debajo del objetivo lo pide a un costado. Puede depender del circuito si el objetivo cambia de lugar durante el paso. */
  lado?: LadoGlobo | ((ctx: CtxTutorial) => LadoGlobo)
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
  /** Una frase que dice de qué trata el capítulo y qué se hace en él. */
  descripcion: string
  minutos: number
  tono: TonoCategoria
  /** Los pasos; vacío en un capítulo que todavía no está hecho (el selector lo marca «Próximamente»). */
  pasos: readonly PasoDef[]
  /** La zona del mundo que ocupa el circuito del capítulo: la vista se encuadra sobre ella con un zoom fijo. */
  zona: Caja
  /** Pasos que tendrá cuando esté hecho, para el selector. */
  totalPasos: number
  /** Abre un documento nuevo al empezar (los capítulos que parten de un lienzo vacío). */
  documentoNuevo?: boolean
  /** Empieza con su propio circuito de arranque (`arranques.ts`): cada capítulo se puede hacer solo. */
  arranque?: boolean
}
