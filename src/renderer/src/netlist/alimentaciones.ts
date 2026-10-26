import { nombreDeTerminal, porId } from '../conexiones/conexiones'
import { claveDeNombre, conGuion, voltajeDeNombre } from '../conexiones/nombres'
import { crear, borrar, modificar, type Comando } from '../doc/comandos'
import type { GeneradorId } from '../doc/ids'
import type { Alimentacion, Documento, Id, Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { leerValor } from '../valores/valores'

/** Terminales de alimentación como los de Proteus: el NOMBRE es la red. Un nombre que es voltaje («+15V», «3.3V») da ese
 * voltaje; si no (VCC, VDD, VEE…) es un riel cuyo voltaje comparten todos, de la tabla del documento
 * (`Documento.alimentaciones`, solo los que difieren del de omisión). */

/** Voltaje de omisión de los rieles conocidos; cualquier otro nombre que no sea un voltaje empieza en 5 V. */
export const RIELES_POR_OMISION: Readonly<Record<string, string>> = { VCC: '5', VDD: '5', VEE: '-5' }
export const VOLTAJE_DE_OMISION = '5'
/** Id del campo «Voltaje» del inspector de un terminal: edita su riel, no la pieza. */
export const CAMPO_VOLTAJE = 'voltaje'
export const NOMBRE_CAMPO_VOLTAJE = 'Voltaje'
/** Por qué el voltaje de un terminal como «+15V» no se edita. */
export const MENSAJE_VOLTAJE_DEL_NOMBRE = 'El voltaje sale del nombre.'

export { claveDeNombre, nombreDeVoltaje, voltajeDeNombre } from '../conexiones/nombres'

/** El voltaje que da un nombre: el suyo si es un voltaje; si no, el de su riel en la tabla o el de omisión. */
export interface VoltajeDeRiel {
  nombre: string
  /** Texto del voltaje («15», «-5», «3.3 V»). */
  texto: string
  /** El voltaje leído en V; null si el texto no se lee (no pasa con lo validado al abrir). */
  valor: number | null
  /** El voltaje sale del nombre («+15V»): no se edita. */
  deNombre: boolean
  /** Está en la tabla del documento (difiere del de omisión). */
  guardado: boolean
}

/** Lo único del documento que leen los rieles: su tabla. */
export type ConRieles = Pick<Documento, 'alimentaciones'>
export const SIN_RIELES: ConRieles = {}

const porNombre = new WeakMap<Record<Id, Alimentacion>, Map<string, Alimentacion>>()

/** La tabla de rieles del documento por la llave del nombre (`claveDeNombre`; la primera de cada una), calculada una vez por tabla. */
export function tablaDeRieles(doc: ConRieles): Map<string, Alimentacion> {
  const t = doc.alimentaciones
  if (!t) return new Map()
  let m = porNombre.get(t)
  if (!m) {
    m = new Map()
    for (const a of Object.values(t).sort(porId)) {
      const k = claveDeNombre(a.nombre)
      if (!m.has(k)) m.set(k, a)
    }
    porNombre.set(t, m)
  }
  return m
}

/** Lo que vale el voltaje de omisión de un riel. */
export const voltajeDeOmision = (nombre: string): string => {
  const k = claveDeNombre(nombre)
  return Object.hasOwn(RIELES_POR_OMISION, k) ? RIELES_POR_OMISION[k] : VOLTAJE_DE_OMISION
}

const leerVoltios = (texto: string): number | null => {
  const v = leerValor(conGuion(texto))
  return v && Number.isFinite(v.valor) && (v.unidad === '' || v.unidad === 'V') ? v.valor : null
}

export function voltajeDeRiel(doc: ConRieles, nombre: string): VoltajeDeRiel {
  const propio = voltajeDeNombre(nombre)
  if (propio !== null) return { nombre, texto: String(propio), valor: propio, deNombre: true, guardado: false }
  const g = tablaDeRieles(doc).get(claveDeNombre(nombre))
  const texto = g ? g.voltaje : voltajeDeOmision(nombre)
  return { nombre, texto, valor: leerVoltios(texto), deNombre: false, guardado: !!g }
}

/** El nombre de riel de un terminal: el de su propiedad, o el de omisión de la pieza si está en blanco. */
export function nombreDeRiel(p: Pieza, def: PiezaDef): string {
  const m = def.modelo
  if (m?.tipo !== 'alimentacion') return ''
  return nombreDeTerminal(p, def) || (def.props.find((d) => d.id === m.nombre)?.defecto ?? '').trim()
}

/** El riel de un terminal de alimentación; null si la pieza no es uno. */
export function rielDeTerminal(doc: ConRieles, p: Pieza, def: PiezaDef): VoltajeDeRiel | null {
  return def.modelo?.tipo === 'alimentacion' ? voltajeDeRiel(doc, nombreDeRiel(p, def)) : null
}

/** Comando que pone el riel `nombre` en `texto` (voltaje en V): lo agrega, cambia o quita si vuelve al de omisión. null si
 * no cambia nada; error si el texto no es voltaje o el nombre ya lo es. */
export function cambioDeRiel(doc: ConRieles, nombre: string, texto: string, gen: GeneradorId): Comando | { error: string } | null {
  if (voltajeDeNombre(nombre) !== null) return { error: MENSAJE_VOLTAJE_DEL_NOMBRE }
  const t = conGuion(texto.trim())
  const v = leerValor(t)
  if (!v || !Number.isFinite(v.valor)) return { error: `«${texto.trim()}» no es un valor válido.` }
  if (v.unidad && v.unidad !== 'V') return { error: 'Se esperaba un valor en V.' }
  const actual = voltajeDeRiel(doc, nombre)
  const g = tablaDeRieles(doc).get(claveDeNombre(nombre))
  if (actual.valor === v.valor && (!g || g.voltaje === t)) return null
  const omision = leerVoltios(voltajeDeOmision(nombre))
  if (v.valor === omision) return g ? borrar('voltaje del riel', 'alimentaciones', g) : null
  return g ? modificar('voltaje del riel', 'alimentaciones', g, { ...g, voltaje: t }) : crear('voltaje del riel', 'alimentaciones', { id: gen('a'), nombre, voltaje: t })
}

/** Un riel que usa el documento, con sus terminales. */
export interface RielUsado extends VoltajeDeRiel {
  terminales: Id[]
}

/** Rieles y nombres con voltaje que usan los terminales, cada uno con sus terminales: primero rieles por nombre y luego
 * los voltajes de mayor a menor. Los de la tabla que nadie usa no aparecen. */
export function rielesUsados(doc: Documento, lib: Map<string, PiezaDef>): RielUsado[] {
  const usados = new Map<string, RielUsado>()
  // En el orden del documento (determinista); ordenar miles de piezas para hallar unos pocos terminales no vale la pena.
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    if (!def || def.modelo?.tipo !== 'alimentacion') continue
    const nombre = nombreDeRiel(p, def)
    // «V−» y «V-» (o «+15V» y «15 V») son el mismo riel: una fila, con el nombre del primero.
    const k = claveDeNombre(nombre)
    let r = usados.get(k)
    if (!r) usados.set(k, (r = { ...voltajeDeRiel(doc, nombre), terminales: [] }))
    r.terminales.push(p.id)
  }
  return [...usados.values()].sort((a, b) =>
    a.deNombre !== b.deNombre ? (a.deNombre ? 1 : -1) : a.deNombre ? (b.valor ?? 0) - (a.valor ?? 0) : a.nombre.localeCompare(b.nombre, 'es')
  )
}
