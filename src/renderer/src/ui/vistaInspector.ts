import { paqueteDe, patillasDeUnidad, unidadesDe } from '../doc/paquetes'
import { ocupantesDeUnidades, textoUnidadEnUso } from '../edicion/operaciones/paquetes'
import { clavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import { propModelo } from '../editor/colocar'
import { muestrasDeOpciones } from '../piezas/muestras'
import { NOMBRE_FIGURA } from '../doc/figuras'
import type { Documento, FormatoTexto, Id, Pieza, Rotacion, Sonda } from '../doc/tipos'
import { anclaDeSonda } from '../conexiones/anclas'
import { tocaAlgo } from '../editor/sondas'
import { pinesEnMundo } from '../piezas/transformar'
import { instrumentoDe } from '../doc/sondas'
import { fuenteDeEntrada } from '../instrumentos/entradas'
import { NOMBRE_SENTIDO, nombreLargoDeSonda, pinesQueMide } from './textosSonda'
import { tamañoSeleccion, type Seleccion } from '../editor/seleccion'
import { editableEnCaliente } from '../editor/enCaliente'
import { CAMPO_VOLTAJE, claveDeNombre, MENSAJE_VOLTAJE_DEL_NOMBRE, NOMBRE_CAMPO_VOLTAJE, rielDeTerminal, rielesUsados } from '../netlist/alimentaciones'
import { alimentacionesDeFamilia, esModeloDigital } from '../netlist/digital'
import { familiaSpice, textoBaseSpice, textoSpiceDe, type FamiliaSpice } from '../doc/spice'
import { comunesDeLaFicha, type PiezaDef, type PropDef } from '../piezas/tipos'
import { columnasDeModelos, type TablaModelos } from '../piezas/columnasModelo'
import { ENCAPSULADOS } from '../piezas/encapsulados'
import { filaDe } from '../piezas/validarDatos'
import { textoDeNumero } from '../instrumentos/ajusteAutomatico'
import { formatearValor, leerValor } from '../valores/valores'
import { nombreCategoria } from './catalogo'
import { tonoDeCategoria, type TonoCategoria } from './colores'
import { avisosDelCircuito, enumerar, MAX_FILAS, plural, type Aviso } from './proyecto'
import { conexionesDeRed, esRedVisible } from './redes'
import { soloFiguras, vistaFigura, type VistaFigura } from './vistaFigura'
import { soloTextos, vistaFormato, type VistaFormato } from './vistaFormato'
import { defDe } from '../piezas/sinEquivalencia'

export interface CampoProp {
  id: string
  nombre: string
  /** Texto guardado tal como se escribió («1k»). */
  texto: string
  unidad?: string
  /** Si existe, el campo es una lista cerrada. */
  opciones?: string[]
  /** La muestra de color de cada opción (`data-color`), si la lista es un color (el de un LED). */
  muestras?: Record<string, string>
  /** Valores comerciales: la serie que ofrece el editor (`elegida` es la de Configuración) y, con `catalogo`, los `comunes` como catálogo. */
  serie?: PropDef['serie']
  catalogo?: boolean
  comunes?: string[]
  /** De la propiedad de modelo: las cifras de cada modelo para la tabla de la ficha. */
  tabla?: TablaModelos
  /**
   * Modelo «Personalizado»: `texto` es el juego de SPICE de la pieza y `base` los parámetros del modelo elegido que se escriben al activarlo.
   */
  personalizado?: { familia: FamiliaSpice; base: string }
  /** El texto leído en notación de ingeniería («1 kΩ»); null si no se lee o es una lista. */
  lectura: string | null
  /** Se cambia sin detener la vista previa: el valor de una resistencia o de una fuente. */
  enCaliente: boolean
  /** Se muestra y no se edita (el voltaje de un terminal como «+15V»); `ayuda` dice por qué. */
  soloLectura?: true
  /** Una línea bajo el campo: por qué no se edita, o qué más cambia (los otros terminales del mismo riel). */
  ayuda?: string
}

export interface ConexionPin {
  pin: string
  /** Número de la patilla física («6»), si los datos de la pieza lo traen. */
  numero?: string
  /** Nombre de la red, o «sin conectar» si el pin está suelto. */
  red: string
}

/** Una red con nombre (de una etiqueta, o GND) y los pines que une. */
export interface RedConNombre {
  red: number
  nombre: string
  conexiones: number
}

/** Cuántas piezas de una categoría tiene el circuito (barra de composición del inspector sin selección). */
export interface CuentaCategoria {
  id: string
  nombre: string
  tono?: TonoCategoria
  piezas: number
}

/** Las piezas por categoría, de más a menos y, a igualdad, por nombre; las de una pieza desconocida no cuentan. */
export function piezasPorCategoria(doc: Documento, lib: Map<string, PiezaDef>): CuentaCategoria[] {
  const cuenta = new Map<string, number>()
  for (const id in doc.piezas) {
    const c = lib.get(doc.piezas[id].tipo)?.categoria
    if (c !== undefined) cuenta.set(c, (cuenta.get(c) ?? 0) + 1)
  }
  return [...cuenta]
    .map(([id, piezas]) => ({ id, nombre: nombreCategoria(id), tono: tonoDeCategoria(id), piezas }))
    .sort((a, b) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Avisos que el inspector muestra sin selección; el resto se ve en el panel Proyecto. */
/** Hasta cuántos campos de una pieza se ven sin abrir «Más ajustes». */
export const CAMPOS_A_LA_VISTA = 3

/**
 * Ficha compacta: primeros campos a la vista y el resto en «Más ajustes». Con uno de más todos se ven: esconder un solo campo cuesta más clics de los que ahorra.
 */
export function repartirCampos<T>(campos: readonly T[], siempreEnMas?: (campo: T) => boolean): { vistos: T[]; mas: T[] } {
  // Los que `siempreEnMas` nombra (el modelo Personalizado) van al final de «Más ajustes» aunque los demás quepan a la vista.
  const aparte = siempreEnMas ? campos.filter(siempreEnMas) : []
  const resto = siempreEnMas ? campos.filter((c) => !siempreEnMas(c)) : [...campos]
  if (resto.length <= CAMPOS_A_LA_VISTA + 1) return { vistos: resto, mas: aparte }
  return { vistos: resto.slice(0, CAMPOS_A_LA_VISTA), mas: [...resto.slice(CAMPOS_A_LA_VISTA), ...aparte] }
}

export const AVISOS_EN_INSPECTOR = 3

/** Redes con nombre que el inspector lista sin selección; el resto se ve en el panel Proyecto. */
export const REDES_EN_INSPECTOR = 8

/** Una unidad del chip en el selector «Unidad»: ocupada por otra pieza del paquete se muestra deshabilitada con su texto. */
export interface OpcionUnidad {
  nombre: string
  actual: boolean
  /** La referencia de la pieza que la ocupa, o null si está libre. */
  enUso: string | null
  /** «en uso por U1C» si está ocupada. */
  texto: string | null
}
export interface VistaPaquete {
  paquete: string
  unidad: string
  unidades: OpcionUnidad[]
}

/** El selector «Unidad» de una pieza agrupada; null si su chip no tiene unidades (la definición cambió). */
export function vistaPaquete(doc: Documento, def: PiezaDef, p: Pieza): VistaPaquete | null {
  const pq = paqueteDe(p)
  const u = pq ? unidadesDe(def, p.props) : null
  if (!pq || !u) return null
  const ocupantes = ocupantesDeUnidades(doc, p, u.nombres)
  return {
    paquete: pq.paquete,
    unidad: pq.unidad,
    unidades: ocupantes.map((o) => ({ nombre: o.nombre, actual: o.nombre === pq.unidad, enUso: o.enUso, texto: o.enUso ? textoUnidadEnUso(o.enUso) : null }))
  }
}

export type VistaInspector =
  | {
      tipo: 'nada'
      piezas: number
      redes: number
      cables: number
      figuras: number
      /** «vacio» sin piezas; «listo» sin avisos que impidan simular; «avisos» si algo lo impide. */
      estado: 'vacio' | 'listo' | 'avisos'
      /** Los primeros avisos, en el orden del panel Proyecto (los leves al final). */
      avisos: Aviso[]
      totalAvisos: number
      /** Los que impiden simular. */
      bloqueantes: number
      /** Las primeras redes con nombre (la tierra primero). */
      redesConNombre: RedConNombre[]
      totalRedesConNombre: number
      porCategoria: CuentaCategoria[]
      /** Las sondas del circuito y qué mide cada una («XSC1 · A ← R1:2», «Voltaje · R1:2»). */
      sondas: FilaSonda[]
    }
  | {
      tipo: 'pieza'
      id: Id
      ref: string
      nombre: string
      categoria: string
      /** La definición de la pieza (su símbolo en la cabecera). */
      defId: string
      /** El tono de su categoría: la cabecera toma su tinte. Lo decide la interfaz al dibujar; el documento no lo guarda. */
      tono?: TonoCategoria
      pines: number
      props: CampoProp[]
      rot: Rotacion
      espejo: boolean
      conexiones: ConexionPin[]
      /** La sección «Datos de la pieza»; `ninguno` si la pieza no trae datos y entonces no se muestra. */
      datos: VistaDatos
      /** El encapsulado de una unidad (U1) y las unidades que tiene; ausente si la pieza no está agrupada. */
      paquete?: VistaPaquete
    }
  | { tipo: 'desconocida'; id: Id; ref: string; tipoPieza: string }
  | { tipo: 'varias'; total: number; piezas: number; cables: number; etiquetas: number; notas: number; figuras: number; formato: VistaFormato | null }
  | { tipo: 'cable'; id: Id; red: string; conexiones: number }
  | { tipo: 'etiqueta'; id: Id; nombre: string; red: string; conexiones: number; formato: VistaFormato | null; formatoDoc?: FormatoTexto }
  | { tipo: 'nota'; id: Id; texto: string; formato: VistaFormato | null; formatoDoc?: FormatoTexto }
  | { tipo: 'figura'; ids: Id[]; titulo: string; figura: VistaFigura }
  /** Una sonda: qué es, qué mide (los pines de su red) y, la de corriente, su sentido. */
  | { tipo: 'sonda'; id: Id; titulo: string; mide: string; sentido: string | null; medidor: VistaMedidor | null }

/** El medidor rápido seleccionado: lo que edita su ficha. */
export interface VistaMedidor {
  ref: string
  magnitud: 'voltaje' | 'corriente'
  modo: 'dc' | 'ac'
  /** Puede medir corriente: su punto está en el interior de un tramo de cable. */
  puedeCorriente: boolean
  /** «Mide la red N respecto a tierra.» o «Mide la corriente del cable de X a Y.» */
  descripcion: string
}

/** Cómo se dice un extremo de cable: su pin («R1:2»), el nombre de su etiqueta o «una unión». */
function extremoDeCable(doc: Documento, lib: Map<string, PiezaDef>, q: { x: number; y: number }): string {
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    const pin = def ? pinesEnMundo(p, def).find((z) => z.x === q.x && z.y === q.y) : undefined
    if (pin) return `${p.ref}:${pin.id}`
  }
  for (const id in doc.etiquetas) if (doc.etiquetas[id].x === q.x && doc.etiquetas[id].y === q.y) return doc.etiquetas[id].nombre || 'una etiqueta'
  return 'una unión'
}

/** La ficha de un medidor rápido: qué mide en palabras y si puede pasar a corriente. */
export function vistaMedidor(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, s: Sonda): VistaMedidor {
  const magnitud = s.magnitud === 'corriente' ? 'corriente' : 'voltaje'
  const modo = s.modo === 'ac' ? 'ac' : 'dc'
  const puedeCorriente = tocaAlgo(doc, lib, { ...s, magnitud: 'corriente' })
  let descripcion: string
  if (magnitud === 'corriente') {
    const a = anclaDeSonda(doc, lib, s.x, s.y)
    const c = a?.tipo === 'cable' && Object.hasOwn(doc.cables, a.id) ? doc.cables[a.id] : undefined
    descripcion = c && c.puntos.length >= 2 ? `Mide la corriente del cable de ${extremoDeCable(doc, lib, c.puntos[0])} a ${extremoDeCable(doc, lib, c.puntos[c.puntos.length - 1])}.` : 'No está sobre ningún cable: arrastra el punto a uno.'
  } else {
    const red = con.redDeSonda.get(s.id)
    descripcion = red === undefined ? 'No toca ninguna red: muévelo a un cable o a un pin.' : `Mide la red ${con.redes[red]?.nombre ?? red + 1} respecto a tierra.`
  }
  return { ref: s.ref ?? '', magnitud, modo, puedeCorriente, descripcion }
}

/** Una fila de la lista de sondas del inspector sin selección. */
export interface FilaSonda {
  id: Id
  texto: string
}

/** Lo que mide una sonda en una frase corta: hasta cuatro pines de su red, el nombre de la red, o «nada». */
function loQueMide(doc: Documento, con: Conexiones, s: Sonda): string {
  const pines = pinesQueMide(doc, con, s)
  if (pines.length > 4) return `${pines.slice(0, 3).join(', ')} y ${pines.length - 3} más`
  if (pines.length) return enumerar(pines)
  const red = con.redDeSonda.get(s.id)
  return (red !== undefined && con.redes[red]?.nombre) || (con.redDeSonda.has(s.id) ? 'un cable' : 'nada')
}

/** Las filas de la lista de sondas, en orden de id. */
export function filasDeSondas(doc: Documento, con: Conexiones): FilaSonda[] {
  return Object.values(doc.sondas ?? {})
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((s) => {
      if (s.tipo === 'voltaje' || s.tipo === 'corriente') return { id: s.id, texto: `${s.tipo === 'voltaje' ? 'Voltaje' : 'Corriente'} · ${pinesQueMide(doc, con, s)[0] ?? loQueMide(doc, con, s)}` }
      if (s.tipo === 'medidor') return { id: s.id, texto: `${s.ref ?? 'Medidor'} · ${s.magnitud === 'corriente' ? 'Corriente' : 'Voltaje'} · ${pinesQueMide(doc, con, s)[0] ?? loQueMide(doc, con, s)}` }
      const inst = instrumentoDe(doc, s)
      const f = inst && con.redDeSonda.has(s.id) && !con.sondasSinUnir.includes(s.id) ? fuenteDeEntrada(doc, con, inst.id, s.entrada ?? '') : null
      return { id: s.id, texto: `${inst?.ref ?? '?'} · ${s.entrada} ← ${f ?? 'nada'}` }
    })
}

/** «10 elementos: 5 piezas y 5 cables.», con singular y plural de cada clase y solo las que hay. */
export function resumenSeleccion(v: { total: number; piezas: number; cables: number; etiquetas: number; notas: number; figuras?: number }): string {
  const clases: [number, string, string][] = [
    [v.piezas, 'pieza', 'piezas'],
    [v.cables, 'cable', 'cables'],
    [v.etiquetas, 'etiqueta de red', 'etiquetas de red'],
    [v.notas, 'nota', 'notas'],
    [v.figuras ?? 0, 'figura', 'figuras']
  ]
  const partes = clases.filter(([n]) => n > 0).map(([n, uno, varios]) => plural(n, uno, varios))
  return `${plural(v.total, 'elemento', 'elementos')}: ${enumerar(partes)}.`
}

/** «1» → «Pin 1»; «ánodo» → «Ánodo». */
export const nombrePin = (n: string): string => (/^\d+$/.test(n) ? `Pin ${n}` : n.charAt(0).toUpperCase() + n.slice(1))

/** Rótulo de la fila que cuenta los pines de una red (cables y etiquetas). */
/** «Seleccionar su red»: del clic derecho y del inspector de un cable, activo también al simular. */
export const TEXTO_SELECCIONAR_RED = 'Seleccionar su red'
export const FILA_PINES_CONECTADOS = 'Pines conectados'
/** Principio de la línea bajo «Alimentación» de una pieza digital. */
export const TEXTO_ALIMENTACION_IMPLICITA = 'Alimentación implícita'
/** Lo que dice el inspector de una etiqueta de red: las etiquetas de un mismo nombre son una sola red. */
export const TEXTO_ETIQUETAS_UNIDAS = 'Las etiquetas con el mismo nombre quedan unidas aunque no haya cable.'

const redLegible = (r: Red | undefined, nombres: Map<number, string>) => (r && esRedVisible(r) ? (nombres.get(r.id) ?? 'sin conectar') : 'sin conectar')

// Textos de la sección «Datos de la pieza»: una idea por texto.
export const TEXTO_DATOS_TITULO = 'Datos de la pieza'
export const TEXTO_DATOS_VIRTUAL = 'Pieza ideal: no tiene una versión física.'
export const TEXTO_DATOS_SIN_FILA = 'No hay un integrado comercial con esta combinación.'
export const TEXTO_DATOS_HOJA = 'Abrir hoja de datos'
export const TEXTO_DATOS_HOJA_AVISO = 'Se abre en tu navegador.'
export const TEXTO_DATOS_SIN_VERIFICAR = 'sin verificar'
export const TEXTO_DATOS_TIPICO = 'típico'
export const TEXTO_DATOS_IMPLICITA = 'alimentación implícita'
export const TEXTO_DATOS_SIN_SIMULAR = 'no se simula'
const MONTAJE: Record<string, string> = { THT: 'orificio pasante', SMD: 'montaje superficial' }
/** Cómo se llama cada campo pendiente en la línea «Sin dato de …». */
const CAMPO_PENDIENTE: Record<string, string> = { lcsc: 'LCSC', hoja: 'la hoja de datos', huella: 'la huella', parte: 'la parte', patillas: 'los pines', encapsulado: 'el encapsulado', fabricante: 'el fabricante' }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Una patilla del encapsulado: su número, qué es y, si no es un pin conectable, por qué. */
export interface FilaPatilla {
  numero: string
  nombre: string
  nota?: string
  /** Se muestra en gris: la alimentación implícita y las patillas que el modelo no usa. */
  atenuada: boolean
}

export type VistaDatos =
  | { tipo: 'ninguno' }
  | { tipo: 'virtual' }
  | { tipo: 'sinFila' }
  | {
      tipo: 'fisica'
      encapsulado?: string
      montaje?: string
      tipico: boolean
      parte?: string
      fabricante?: string
      patillas: FilaPatilla[]
      /** «2 unidades en el encapsulado (A y B)», si el chip trae más de una. */
      unidades?: string
      huella?: string
      lcsc?: { numero: string; fecha?: string; sinVerificar: boolean }
      hoja?: string
      avisos: string[]
    }

const textoFecha = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso
}
const lista = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v])
const porNumero = (a: string, b: string): number => {
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x !== y ? x - y : a.localeCompare(b, 'es', { numeric: true })
}

/** Las patillas de la unidad que la pieza eligió (con las compartidas); sin unidad o si no existe, las de la presentación. */
const patillasElegidas = (def: PiezaDef, pieza: Pieza, pres: { patillas: Record<string, string | string[]> }): Record<string, string | string[]> =>
  (pieza.props.unidad ? patillasDeUnidad(def, pieza.props, pieza.props.unidad) : null) ?? pres.patillas

/** Número de patilla de cada pin del símbolo (una sola, o «1, 8» si el pin va a varias). */
function numerosDePatillas(def: PiezaDef, pieza: Pieza): Map<string, string> {
  const r = new Map<string, string>()
  const pres = filaDe(def, pieza.props)?.fila.presentaciones?.[0]
  if (pres) for (const [pin, v] of Object.entries(patillasElegidas(def, pieza, pres))) r.set(pin, lista(v).join(', '))
  return r
}

/** Lo que muestra «Datos de la pieza» para esta pieza con sus valores: la fila de `datos` que le toca y su primera presentación. */
export function vistaDatos(def: PiezaDef, pieza: Pieza): VistaDatos {
  if (!def.datos) return { tipo: 'ninguno' }
  const f = filaDe(def, pieza.props)
  if (!f) return { tipo: 'sinFila' }
  const { fila } = f
  if (fila.virtual) return { tipo: 'virtual' }
  const pres = fila.presentaciones?.[0]
  const avisos: string[] = []
  if (fila.aproximada) avisos.push(fila.aproximada)
  for (const [campo, motivo] of Object.entries(fila.pendiente ?? {})) avisos.push(`Sin dato de ${CAMPO_PENDIENTE[campo] ?? campo}: ${motivo}.`)
  const enc = pres ? ENCAPSULADOS.get(pres.encapsulado) : undefined
  const patillas: FilaPatilla[] = []
  if (pres) {
    const nombres = new Map(def.pines.map((p) => [p.id, nombrePin(p.nombre)]))
    for (const [pin, v] of Object.entries(patillasElegidas(def, pieza, pres))) patillas.push({ numero: lista(v).join(', '), nombre: nombres.get(pin) ?? pin, atenuada: false })
    for (const [red, v] of Object.entries(pres.alimentacion ?? {})) patillas.push({ numero: lista(v).join(', '), nombre: red, nota: TEXTO_DATOS_IMPLICITA, atenuada: true })
    for (const [n, que] of Object.entries(pres.sinModelo ?? {})) patillas.push({ numero: n, nombre: /^\p{Lu}\p{Ll}/u.test(que) ? que.charAt(0).toLowerCase() + que.slice(1) : que, nota: TEXTO_DATOS_SIN_SIMULAR, atenuada: true })
    patillas.sort((a, b) => porNumero(a.numero, b.numero))
  }
  const unidades = pres?.unidades
  const parte = pres?.parte ?? fila.parte
  const huella = pres?.huella ?? enc?.huella
  return {
    tipo: 'fisica',
    ...(pres ? { encapsulado: pres.encapsulado, ...(enc ? { montaje: MONTAJE[enc.montaje] } : {}) } : {}),
    tipico: pres?.representativa === true,
    ...(parte ? { parte } : {}),
    ...(fila.fabricante ? { fabricante: fila.fabricante } : {}),
    patillas,
    ...(unidades && unidades.length > 1 ? { unidades: `${unidades.length} unidades en el encapsulado (${unidades.map((u) => u.nombre).join(' y ')})` } : {}),
    ...(huella ? { huella } : {}),
    ...(pres?.lcsc ? { lcsc: { numero: pres.lcsc.numero, ...(pres.lcsc.comprobado ? { fecha: `comprobado el ${textoFecha(pres.lcsc.comprobado)}` } : {}), sinVerificar: pres.lcsc.sinVerificar === true } } : {}),
    ...(fila.hoja ? { hoja: fila.hoja } : {}),
    avisos
  }
}

/** Lo que muestra el inspector para la selección actual. */
export function vistaInspector(
  doc: Documento,
  lib: Map<string, PiezaDef>,
  con: Conexiones,
  sel: Seleccion,
  nombres: Map<number, string>,
  /** Totales ya calculados (memos de la interfaz); sin ellos se cuentan aquí. */
  totales?: { piezas: number; redes: number },
  /** Avisos ya calculados por conexiones (memo de la interfaz); sin ellos se calculan aquí. */
  avisos?: Aviso[],
  /** «Ver los N avisos»: la lista entera (hasta `MAX_FILAS`) en lugar de las primeras. */
  todosLosAvisos = false
): VistaInspector {
  const total = tamañoSeleccion(sel)
  if (total === 0) {
    const piezas = totales?.piezas ?? Object.keys(doc.piezas).length
    const todos = avisos ?? avisosDelCircuito(doc, con, lib)
    // `nombres` ya viene en el orden de listado: la tierra, luego las que tienen etiqueta.
    const redesConNombre: RedConNombre[] = []
    for (const [id, nombre] of nombres) {
      const r = con.redes[id]
      if (r && (r.tierra || r.nombre !== undefined)) redesConNombre.push({ red: id, nombre, conexiones: conexionesDeRed(r) })
    }
    return {
      tipo: 'nada',
      piezas,
      redes: totales?.redes ?? nombres.size,
      cables: Object.keys(doc.cables).length,
      figuras: Object.keys(doc.figuras ?? {}).length,
      estado: piezas === 0 ? 'vacio' : todos.some((a) => !a.leve) ? 'avisos' : 'listo',
      avisos: todos.slice(0, todosLosAvisos ? MAX_FILAS : AVISOS_EN_INSPECTOR),
      totalAvisos: todos.length,
      bloqueantes: todos.filter((a) => !a.leve).length,
      redesConNombre: redesConNombre.slice(0, REDES_EN_INSPECTOR),
      totalRedesConNombre: redesConNombre.length,
      porCategoria: piezasPorCategoria(doc, lib),
      sondas: filasDeSondas(doc, con)
    }
  }
  // Una sonda sola.
  if (total === 1 && sel.sondas.size === 1) {
    const [id] = sel.sondas
    const s = doc.sondas && Object.hasOwn(doc.sondas, id) ? doc.sondas[id] : undefined
    if (s) {
      const sentido = s.tipo === 'corriente' ? NOMBRE_SENTIDO[s.sentido ?? 'derecha'] : null
      return { tipo: 'sonda', id, titulo: nombreLargoDeSonda(doc, s), mide: loQueMide(doc, con, s), sentido: sentido && sentido.charAt(0).toUpperCase() + sentido.slice(1), medidor: s.tipo === 'medidor' ? vistaMedidor(doc, lib, con, s) : null }
    }
  }
  // Solo figuras (una o varias): la sección Figura con lo que tienen en común.
  if (soloFiguras(sel)) {
    const figura = vistaFigura(doc, sel)
    if (figura) {
      const titulo = figura.total === 1 && figura.tipo !== 'varios' ? NOMBRE_FIGURA[figura.tipo] : plural(figura.total, 'figura', 'figuras')
      return { tipo: 'figura', ids: [...sel.figuras], titulo, figura }
    }
  }
  if (total > 1)
    return {
      tipo: 'varias', total, piezas: sel.piezas.size, cables: sel.cables.size, etiquetas: sel.etiquetas.size, notas: sel.notas.size, figuras: sel.figuras.size,
      // Varios textos y nada más: la sección Texto aplica a todos (con el estado mixto de cada control).
      formato: soloTextos(sel) ? vistaFormato(doc, sel) : null
    }
  const [idPieza] = sel.piezas
  if (idPieza) {
    const p = doc.piezas[idPieza]
    const def = p ? defDe(p, lib.get(p.tipo)) : undefined
    if (!p || !def) return { tipo: 'desconocida', id: idPieza, ref: p?.ref ?? '', tipoPieza: p?.tipo ?? '' }
    // Una lista de una sola opción no deja elegir nada (la salida «Voltaje» de la fuente PWL); el modelo que se muestra sí se ve.
    const props = def.props.filter((d) => d.opciones?.length !== 1 || d.mostrar).map((d): CampoProp => {
      const texto = p.props[d.id] ?? d.defecto
      const v = d.opciones || d.texto ? null : leerValor(texto)
      const muestras = muestrasDeOpciones(def, d.id)
      const tabla = d === propModelo(def) ? columnasDeModelos(def) : null
      return {
        id: d.id, nombre: d.nombre, texto, unidad: d.unidad, opciones: d.opciones, lectura: v ? formatearValor(v.valor, d.unidad ?? v.unidad) : null, enCaliente: editableEnCaliente(def, d.id),
        ...(muestras ? { muestras } : {}),
        ...(d.serie ? { serie: d.serie } : {}),
        ...(d.catalogo ? { catalogo: true, comunes: d.comunes } : comunesDeLaFicha(d) ? { comunes: d.comunes } : {}),
        ...(tabla ? { tabla } : {})
      }
    })
    // La fuente de pulso: el periodo no se guarda, es la frecuencia al revés; se escribe y se lee como un valor más.
    const mp = def.modelo?.tipo === 'pulso' ? def.modelo : null
    if (mp) {
      const f = leerValor(p.props[mp.frecuencia] ?? def.props.find((d) => d.id === mp.frecuencia)?.defecto ?? '')
      const periodo = f && f.valor > 0 ? textoDeNumero(1 / f.valor, 6) : ''
      const pv = leerValor(periodo)
      const i = props.findIndex((c) => c.id === mp.ciclo)
      props.splice(i + 1, 0, { id: 'periodo', nombre: 'Periodo', texto: periodo, unidad: 's', lectura: pv ? formatearValor(pv.valor, 's') : null, enCaliente: true })
    }
    // Modelo «Personalizado»: un transistor, un MOSFET o un amplificador puede llevar sus propios parámetros de SPICE.
    const familiaDeSpice = familiaSpice(def.modelo)
    if (familiaDeSpice) props.push({ id: 'spice', nombre: 'Personalizado', texto: textoSpiceDe(p, def), lectura: null, enCaliente: false, personalizado: { familia: familiaDeSpice, base: textoBaseSpice(p, def) } })
    // Una pieza digital no toma su alimentación del circuito: el campo lo dice.
    const m = def.modelo
    if (esModeloDigital(m)) {
      const campo = props.find((c) => c.id === m.alimentacion)
      // Solo las alimentaciones que admite su familia; la que tiene se ve aunque no la admita.
      const familia = props.find((c) => c.id === m.familia)?.texto
      if (campo?.opciones && familia !== undefined) {
        const validas = alimentacionesDeFamilia(campo.opciones, familia)
        campo.opciones = validas.includes(campo.texto) ? validas : [...validas, campo.texto]
      }
      const v = campo ? leerValor(campo.texto) : null
      if (campo && v) campo.ayuda = `${TEXTO_ALIMENTACION_IMPLICITA} de ${formatearValor(v.valor, 'V')}: no tiene pines de VCC ni GND y no toma corriente del circuito.`
    }
    // El voltaje de un terminal de alimentación no es suyo: es el de su riel, o el de su nombre si es un voltaje.
    const riel = rielDeTerminal(doc, p, def)
    if (riel) {
      const lectura = riel.valor === null ? null : formatearValor(riel.valor, 'V')
      const base = { id: CAMPO_VOLTAJE, nombre: NOMBRE_CAMPO_VOLTAJE, texto: riel.texto, unidad: 'V', lectura }
      if (riel.deNombre) props.push({ ...base, enCaliente: false, soloLectura: true, ayuda: MENSAJE_VOLTAJE_DEL_NOMBRE })
      else {
        const clave = claveDeNombre(riel.nombre)
        const n = rielesUsados(doc, lib).find((r) => claveDeNombre(r.nombre) === clave)?.terminales.length ?? 1
        props.push({ ...base, enCaliente: true, ayuda: n === 1 ? `Es el voltaje del riel ${riel.nombre}.` : `Cambia el de los ${n} terminales ${riel.nombre}.` })
      }
    }
    const paquete = vistaPaquete(doc, def, p)
    const numeros = numerosDePatillas(def, p)
    const conexiones = def.pines.map((pin) => {
      const red = con.redDePin.get(clavePin(p.id, pin.id))
      const numero = numeros.get(pin.id)
      return { pin: nombrePin(pin.nombre), ...(numero ? { numero } : {}), red: redLegible(red === undefined ? undefined : con.redes[red], nombres) }
    })
    return {
      tipo: 'pieza', id: p.id, ref: p.ref, nombre: def.nombre.es, categoria: nombreCategoria(def.categoria), defId: def.id, tono: tonoDeCategoria(def.categoria),
      pines: def.pines.length, props, rot: p.rot, espejo: p.espejo, conexiones, datos: vistaDatos(def, p),
      ...(paquete ? { paquete } : {})
    }
  }
  const [idCable] = sel.cables
  if (idCable) {
    const red = con.redDeCable.get(idCable)
    const r = red === undefined ? undefined : con.redes[red]
    return { tipo: 'cable', id: idCable, red: r ? (nombres.get(r.id) ?? 'sin red') : 'sin red', conexiones: r ? conexionesDeRed(r) : 0 }
  }
  const [idEtiqueta] = sel.etiquetas
  if (idEtiqueta) {
    const e = doc.etiquetas[idEtiqueta]
    const nombre = e?.nombre.trim() ?? ''
    const red = con.redDeEtiqueta.get(idEtiqueta)
    const r = red === undefined ? undefined : con.redes[red]
    return { tipo: 'etiqueta', id: idEtiqueta, nombre, red: r ? (nombres.get(r.id) ?? nombre) : nombre, conexiones: r ? conexionesDeRed(r) : 0, formato: vistaFormato(doc, sel), formatoDoc: e?.formato }
  }
  const [idNota] = sel.notas
  return { tipo: 'nota', id: idNota, texto: doc.notas[idNota]?.texto ?? '', formato: vistaFormato(doc, sel), formatoDoc: doc.notas[idNota]?.formato }
}
