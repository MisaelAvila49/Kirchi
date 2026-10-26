import type { PestañaCinta } from '../../../../compartido/ajustes'
import { COMANDOS, type IdComando } from './comandos'
import type { NombreIcono } from './trazos'

/** Controles que no son un botón: el zoom del lienzo y el tamaño de la interfaz (Vista › Ventana, dirección A). */
export type Control = 'control-zoom' | 'control-tamano'
/** Una columna de un grupo: botón grande, pila de chicos, cuadrícula solo con icono o texto. */
export type Columna =
  | { tipo: 'grande'; id: IdComando }
  | { tipo: 'pila'; ids: readonly (IdComando | Control)[] }
  | { tipo: 'iconos'; ids: readonly IdComando[]; filas: number }
  | { tipo: 'texto'; texto: string }
  /** Un botón con menú arriba y, debajo, dos botones chicos lado a lado (Avanzar en el tiempo con Retroceder y Avanzar). */
  | { tipo: 'par'; arriba: IdComando; abajo: readonly [IdComando, IdComando] }

export interface DefGrupo {
  /** Único entre todas las pestañas (es parte de ids del DOM). */
  id: string
  nombre: string
  /** Icono del botón del grupo cuando se pliega por falta de ancho. */
  icono: NombreIcono
  /** Orden de plegado: el número más alto se pliega primero; 0 es el último en plegarse. */
  prioridad: number
  /**
   * Si sobra ancho y nada está plegado, sus pilas pasan a botones grandes (primero el número más bajo). Sin el campo no crece.
   */
  crecer?: number
  columnas: readonly Columna[]
}

export interface DefPestaña {
  id: PestañaCinta
  nombre: string
  grupos: readonly DefGrupo[]
}

const grande = (id: IdComando): Columna => ({ tipo: 'grande', id })
const pila = (...ids: (IdComando | Control)[]): Columna => ({ tipo: 'pila', ids })
const iconos = (filas: number, ...ids: IdComando[]): Columna => ({ tipo: 'iconos', ids, filas })
const par = (arriba: IdComando, ...abajo: [IdComando, IdComando]): Columna => ({ tipo: 'par', arriba, abajo })

/** Id fijo del último grupo de Inicio, el que cambia con la selección: el DOM y las mediciones lo buscan por él. */
export const ID_GRUPO_SELECCION = 'seleccion'

/** Lo que hay seleccionado: los casos que distingue la cinta, más figura y sonda y nada. */
export type TipoSeleccion = 'nada' | 'pieza' | 'cable' | 'osciloscopio' | 'multimetro' | 'nota' | 'etiqueta' | 'figura' | 'sonda' | 'varios'

const COLUMNAS_SELECCION: Readonly<Record<TipoSeleccion, readonly Columna[]>> = {
  nada: [{ tipo: 'texto', texto: 'Elige algo en el lienzo.' }],
  pieza: [iconos(2, 'girar-izq', 'girar', 'espejo-x', 'espejo-y'), grande('panel-inspector'), grande('guardar-plantilla')],
  cable: [grande('panel-inspector'), grande('guardar-plantilla')],
  osciloscopio: [grande('franja-osciloscopio'), grande('panel-mediciones'), grande('franja-registro')],
  multimetro: [grande('panel-mediciones'), grande('panel-inspector')],
  nota: [grande('panel-inspector')],
  etiqueta: [grande('panel-inspector')],
  figura: [grande('panel-inspector'), grande('guardar-plantilla')],
  sonda: [grande('panel-mediciones')],
  varios: [iconos(2, 'girar-izq', 'girar', 'espejo-x', 'espejo-y'), grande('guardar-plantilla')]
}

/** Los tipos que distingue, en el orden en que se recorren para buscar dónde está cada comando. */
export const TIPOS_SELECCION = Object.keys(COLUMNAS_SELECCION) as TipoSeleccion[]

/** Último grupo de Inicio: sus órdenes y su título cambian con la selección. Sin título, «Selección». */
export function grupoDeSeleccion(tipo: TipoSeleccion, titulo: string): DefGrupo {
  return { id: ID_GRUPO_SELECCION, nombre: titulo || 'Selección', icono: 'todo', prioridad: 0, columnas: COLUMNAS_SELECCION[tipo] }
}

/** Los grupos de una pestaña con el último de Inicio ya puesto según la selección. */
export function gruposConSeleccion(p: DefPestaña, tipo: TipoSeleccion, titulo: string): readonly DefGrupo[] {
  return p.id === 'inicio' ? [...p.grupos, grupoDeSeleccion(tipo, titulo)] : p.grupos
}

/** Lo que abre cada botón con menú de Inicio (Instrumentos y Analizar); `titulo` rotula una sección del menú. */
export const ENTRADAS_MENU: Readonly<Partial<Record<IdComando, readonly (IdComando | { titulo: string })[]>>> = {
  instrumentos: ['colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente'],
  analizar: ['analisis-op', 'analisis-dc', 'analisis-ac', 'analisis-tran', 'analisis-fourier', 'analisis-param', { titulo: 'Resultados' }, 'franja-graficas', 'panel-analisis']
}

/** Las tres pestañas de arriba. El último grupo de Inicio se agrega con `gruposConSeleccion`. */
export const PESTAÑAS: readonly DefPestaña[] = [
  {
    id: 'inicio',
    nombre: 'Inicio',
    grupos: [
      { id: 'archivo', nombre: 'Archivo', icono: 'abrir', prioridad: 1, columnas: [grande('guardar'), pila('nuevo', 'abrir'), pila('guardar-como', 'recientes'), pila('exportar', 'guardar-plantilla')] },
      { id: 'editar', nombre: 'Editar', icono: 'pegar', prioridad: 7, columnas: [iconos(2, 'cortar', 'copiar', 'pegar', 'duplicar', 'borrar', 'todo')] },
      { id: 'colocar', nombre: 'Colocar', icono: 'pieza', prioridad: 8, columnas: [grande('pieza'), grande('figura'), iconos(2, 'etiqueta', 'tierra', 'alimentacion', 'nota')] },
      // Avanzar en el tiempo (el menú de qué avanza cada vez) con las flechas Retroceder y Avanzar debajo, junto a Simular y Detener.
      { id: 'vista-previa', nombre: 'Simular', icono: 'simular', prioridad: 9, columnas: [grande('simular'), grande('detener'), par('avanzar-tiempo', 'retroceder', 'avanzar'), grande('grabar')] },
      { id: 'instrumentos', nombre: 'Instrumento', icono: 'osciloscopio', prioridad: 3, columnas: [grande('instrumentos')] },
      { id: 'analisis', nombre: 'Análisis', icono: 'analisis', prioridad: 2, columnas: [grande('analizar'), pila('analisis-ejecutar', 'analisis-cancelar')] }
    ]
  },
  {
    id: 'vista',
    nombre: 'Vista',
    grupos: [
      { id: 'zoom', nombre: 'Zoom', icono: 'acercar', prioridad: 1, columnas: [grande('encuadrar'), pila('control-zoom', 'zoom-100')] },
      { id: 'paneles', nombre: 'Paneles', icono: 'paneles', prioridad: 3, columnas: [pila('panel-libreria', 'panel-plantillas'), pila('panel-calculadoras', 'panel-inspector'), pila('panel-proyecto', 'panel-mediciones'), pila('panel-instrumentos')] },
      // No van en un grupo propio: la velocidad del tiempo, las animaciones y el sonido van con la vista para no ensanchar Simular.
      { id: 'tiempo', nombre: 'Tiempo y animación', icono: 'velocidad', prioridad: 4, columnas: [grande('velocidad'), pila('mas-lento', 'mas-rapido'), pila('animaciones', 'sonido')] },
      { id: 'ventana', nombre: 'Ventana', icono: 'pantallaCompleta', prioridad: 2, columnas: [grande('limpio'), pila('pantalla-completa', 'control-tamano')] }
    ]
  },
  {
    // Tutorial: la pestaña Ayuda, con el selector de «Aprende Kirchi».
    id: 'ayuda',
    nombre: 'Ayuda',
    grupos: [
      { id: 'aprender', nombre: 'Aprender', icono: 'ayuda', prioridad: 1, columnas: [grande('aprender'), grande('atajos'), pila('enfocar-tutorial')] },
      { id: 'sobre-kirchi', nombre: 'Más ayuda', icono: 'ejemplos', prioridad: 2, columnas: [grande('ejemplos'), grande('acerca')] }
    ]
  }
]

/** Fila de título, siempre a la vista: Guardar, Deshacer, Rehacer, Voltajes y Corriente. */
export const ACCESO_RAPIDO: readonly (IdComando | '|')[] = ['guardar', 'deshacer', 'rehacer', '|', 'simular', 'detener', '|', 'voltajes', 'corriente']
/** Iconos fijos a la derecha de la fila de arriba. */
export const FIJOS: readonly IdComando[] = ['atajos', 'tema', 'configuracion', 'plegar-cinta']

/**
 * Comandos del registro que no son botones de la cinta (gestos del lienzo, barra de formato, potenciómetro, buscador).
 */
export const SOLO_TECLADO: readonly string[] = [
  'escape', 'retroceso', 'invertir-l', 'colocar-pieza', 'colocar-seguir', 'menu-contextual', 'formato-barra', 'buscar-comando', 'pot-mas', 'pot-menos',
  'negrita', 'cursiva', 'subrayado', 'tam-mayor', 'tam-menor', 'alinear-izq', 'alinear-centro', 'alinear-der', 'justificar',
  'mover-izq', 'mover-der', 'mover-arriba', 'mover-abajo', 'mover-izq-5', 'mover-der-5', 'mover-arriba-5', 'mover-abajo-5'
]

/** Rótulo de lo que está fuera de las pestañas (acceso rápido e iconos fijos). */
export const DONDE_BARRA = 'Barra'

/** Los comandos de una columna, sin el control de zoom. */
export const esControl = (x: string): x is Control => x === 'control-zoom' || x === 'control-tamano'
/** Los ids que trae una columna, en el orden en que se ven. */
const idsCrudos = (c: Columna): readonly (IdComando | Control)[] => (c.tipo === 'grande' ? [c.id] : c.tipo === 'texto' ? [] : c.tipo === 'par' ? [c.arriba, ...c.abajo] : c.ids)
export const idsDeColumna = (c: Columna): IdComando[] => idsCrudos(c).filter((x): x is IdComando => !esControl(x))

/**
 * Órdenes que viven dentro de otro control (zoom, tamaño, menús). Tienen el lugar de su control para el buscador.
 */
export const DENTRO_DE: Readonly<Partial<Record<IdComando | Control, readonly IdComando[]>>> = {
  'control-zoom': ['zoom-menos', 'zoom-mas'],
  'control-tamano': ['pagina-menos', 'pagina-real', 'pagina-mas'],
  figura: ['figura-linea', 'figura-rectangulo', 'figura-elipse', 'figura-flecha'],
  instrumentos: ['colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente'],
  analizar: ['analisis-op', 'analisis-dc', 'analisis-ac', 'analisis-tran', 'analisis-fourier', 'analisis-param', 'franja-graficas', 'panel-analisis'],
  grabar: ['detener-grabacion'],
  'avanzar-tiempo': ['avanzar-hasta'],
  // Sin botón propio: solo Ctrl+K la encuentra (ya no está en el clic derecho de la pieza).
  'girar-izq': ['restablecer-textos']
}

export interface Lugar {
  id: IdComando
  pestaña?: DefPestaña
  grupo?: DefGrupo
}

/** Recorre cada lugar de la cinta en orden: pestañas (con lo que hay dentro de cada control), acceso rápido e iconos fijos. */
export function* lugares(): Generator<Lugar> {
  function* deGrupos(pestaña: DefPestaña, grupos: readonly DefGrupo[]): Generator<Lugar> {
    for (const grupo of grupos)
      for (const c of grupo.columnas)
        for (const x of idsCrudos(c)) {
          if (!esControl(x)) yield { id: x, pestaña, grupo }
          for (const id of DENTRO_DE[x] ?? []) yield { id, pestaña, grupo }
        }
  }
  for (const pestaña of PESTAÑAS) yield* deGrupos(pestaña, pestaña.grupos)
  // El último grupo de Inicio cambia con la selección: se recorre con cada tipo, al final, para que todo lo suyo tenga lugar
  // sin quitárselo a lo fijo (Mediciones e Inspector están en Vista › Paneles).
  yield* deGrupos(PESTAÑAS[0], TIPOS_SELECCION.map((t) => grupoDeSeleccion(t, 'Selección')))
  for (const id of [...ACCESO_RAPIDO, ...FIJOS]) if (id !== '|') yield { id }
}

/** Todos los comandos que tienen al menos un botón. */
export function idsColocados(): Set<IdComando> {
  const s = new Set<IdComando>()
  for (const l of lugares()) s.add(l.id)
  return s
}

/** La primera pestaña que trae un comando; undefined si solo está en la fila de arriba. */
export function pestañaDe(id: IdComando): PestañaCinta | undefined {
  for (const l of lugares()) if (l.id === id && l.pestaña) return l.pestaña.id
  return undefined
}

/** Dónde está el botón de un comando del registro («Inicio › Editar», «Barra»); undefined si no tiene. */
export function lugarDeTecla(idRegistro: string): string | undefined {
  for (const l of lugares()) if (COMANDOS[l.id].tecla === idRegistro) return l.pestaña && l.grupo ? `${l.pestaña.nombre} › ${l.grupo.nombre}` : DONDE_BARRA
  return undefined
}
