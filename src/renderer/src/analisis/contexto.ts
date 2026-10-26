/** Lo que la interfaz necesita del circuito para configurar un análisis: netlist, fuentes y piezas barribles, redes y
 * corrientes graficables.
 * Se arma una vez por circuito. */
import type { Nombres } from '../../../compartido/analisis/resultados'
import type { ElementoMotor, NetlistMotor } from '../../../compartido/netlistMotor'
import type { Conexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import { CANALES } from '../instrumentos/ajustes'
import { compilarNetlist } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { nombresDeRedes } from '../ui/redes'

/** Una pieza cuyo valor se puede barrer, con su unidad SI y el valor que tiene ahora. */
export interface PiezaBarrible {
  id: Id
  ref: string
  unidad: 'Ω' | 'F' | 'H' | 'V' | 'A'
  valor: number
}

export interface RedAnalisis {
  /** Id de la red en las conexiones del documento. */
  red: number
  /** Nodo de la netlist del motor (nunca 0: la tierra no se grafica). */
  nodo: number
  nombre: string
  /** La red tiene una etiqueta puesta por el usuario: sale por omisión en las gráficas. */
  conNombre: boolean
  /** La red es un riel de alimentación (un terminal «+15V» o «VCC»): no sale por omisión en las gráficas. */
  riel?: boolean
}

/** La red sale en las gráficas sin pedirla: tiene nombre y no es un riel de alimentación. */
export const salePorOmision = (r: Pick<RedAnalisis, 'conNombre' | 'riel'>): boolean => r.conNombre && !r.riel

export interface CorrienteAnalisis {
  pieza: Id
  ref: string
  /** El elemento de la netlist cuya corriente se pide. */
  elemento: number
}

/** Clase de fuente para elegir la entrada de un barrido: generador, señal, CD o riel de alimentación. Sin clase cuenta
 * como de CD. */
export type ClaseFuente = 'generador' | 'senal' | 'continua' | 'riel'
export interface FuenteAnalisis {
  id: Id
  ref: string
  clase?: ClaseFuente
}

export interface ContextoAnalisis {
  netlist: NetlistMotor
  piezaDeElemento: readonly Id[]
  nombres: Nombres
  /** Piezas con una fuente de voltaje: la entrada de un barrido de CD o de CA, en orden de referencia. */
  fuentes: FuenteAnalisis[]
  barribles: PiezaBarrible[]
  redes: RedAnalisis[]
  corrientes: CorrienteAnalisis[]
  /** Nodo de la netlist de cada red del documento. */
  nodoDeRed: ReadonlyMap<number, number>
  /** Avisos de la compilación que no impiden analizar. */
  avisos: string[]
}

export type ResultadoContexto = { ok: true; ctx: ContextoAnalisis } | { ok: false; error: string }

/** Tipos de elemento cuya corriente expone ngspice (los demás, compuertas y fuentes de laboratorio, se avisan). */
const CON_CORRIENTE = new Set(['R', 'C', 'L', 'V', 'D', 'I', 'LAMP', 'MOTOR', 'FUSE', 'BUZZER'])

/** Los dos terminales de un elemento de dos puntas; null si no los tiene. */
export function terminalesDe(e: ElementoMotor): [number, number] | null {
  return 'a' in e && 'b' in e && typeof e.a === 'number' && typeof e.b === 'number' ? [e.a, e.b] : null
}

function barribleDe(e: ElementoMotor): Pick<PiezaBarrible, 'unidad' | 'valor'> | null {
  switch (e.type) {
    case 'R':
      return { unidad: 'Ω', valor: e.ohms }
    case 'C':
      return { unidad: 'F', valor: e.farads }
    case 'L':
      return { unidad: 'H', valor: e.henries }
    case 'V':
      return e.wave.kind === 'dc' ? { unidad: 'V', valor: e.wave.v } : null
    case 'I':
      return { unidad: 'A', valor: e.amps }
    default:
      return null
  }
}

export function armarContexto(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): ResultadoContexto {
  if (Object.keys(doc.piezas).length === 0) return { ok: false, error: 'El circuito está vacío: no hay nada que analizar.' }
  const r = compilarNetlist(doc, lib, con)
  if (!r.netlist) {
    if (r.errores.length > 0) return { ok: false, error: r.errores[0] }
    if (r.sinModelo.length > 0) return { ok: false, error: `${r.sinModelo.join(', ')} todavía no tiene modelo eléctrico.` }
    return { ok: false, error: 'El circuito no se puede analizar.' }
  }
  if (r.errores.length > 0) return { ok: false, error: r.errores[0] }
  const ref = (id: Id): string => doc.piezas[id]?.ref ?? id
  const fuentes: FuenteAnalisis[] = []
  const rieles = new Set<number>()
  const barribles: PiezaBarrible[] = []
  const corrientes: CorrienteAnalisis[] = []
  const vistoFuente = new Set<Id>()
  const vistoBarrible = new Set<Id>()
  const vistoCorriente = new Set<Id>()
  r.netlist.elements.forEach((e, k) => {
    const id = r.piezaDeElemento[k]
    if (id === undefined || !doc.piezas[id]) return
    if (e.type === 'V' && !vistoFuente.has(id)) {
      vistoFuente.add(id)
      const pieza = doc.piezas[id]
      const clase: ClaseFuente = lib.get(pieza.tipo)?.modelo?.tipo === 'alimentacion' ? 'riel' : pieza.tipo === 'generador' ? 'generador' : e.wave.kind === 'dc' ? 'continua' : 'senal'
      fuentes.push({ id, ref: ref(id), clase })
      if (clase === 'riel') rieles.add(e.a !== 0 ? e.a : e.b)
    }
    const b = r.potenciometros.has(id) ? null : barribleDe(e)
    if (b && !vistoBarrible.has(id)) {
      vistoBarrible.add(id)
      barribles.push({ id, ref: ref(id), ...b })
    }
    if (CON_CORRIENTE.has(e.type) && !vistoCorriente.has(id)) {
      vistoCorriente.add(id)
      corrientes.push({ pieza: id, ref: ref(id), elemento: k })
    }
  })
  const porRef = (a: { ref: string }, b: { ref: string }) => a.ref.localeCompare(b.ref, 'es', { numeric: true })
  fuentes.sort(porRef)
  barribles.sort(porRef)
  corrientes.sort(porRef)

  const todas = nombresDeRedes(doc, con)
  const redes: RedAnalisis[] = []
  const nombradas = new Map<number, string>()
  const todasPorNodo = new Map<number, string>()
  for (const red of con.redes) {
    const nodo = r.nodoDeRed.get(red.id)
    if (nodo === undefined || nodo === 0) continue
    const nombre = todas.get(red.id)
    if (nombre === undefined) continue
    const conNombre = red.nombre !== undefined
    redes.push({ red: red.id, nodo, nombre, conNombre, riel: rieles.has(nodo) })
    todasPorNodo.set(nodo, nombre)
    if (conNombre) nombradas.set(nodo, red.nombre!)
  }
  redes.sort((a, b) => Number(b.conNombre) - Number(a.conNombre) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))

  const sondas: { nombre: string; tipo: 'v' | 'i' | 'd' }[] = []
  const poner = (k: number | null | undefined, nombre: string, tipo: 'v' | 'i') => {
    if (typeof k === 'number' && k >= 0) sondas[k] = { nombre, tipo }
  }
  for (const [id, o] of r.instrumentos.osciloscopios) o.canales.forEach((c, i) => poner(c.sonda, `${ref(id)} canal ${CANALES[i] ?? i + 1}`, 'v'))
  for (const [id, m] of r.instrumentos.multimetros) {
    poner(m.sondaV, `${ref(id)} (voltaje)`, 'v')
    poner(m.sondaI, `${ref(id)} (corriente)`, 'i')
  }
  const nombres: Nombres = {
    redes: nombradas,
    todasLasRedes: todasPorNodo,
    rieles,
    elementos: r.piezaDeElemento.map((id) => doc.piezas[id]?.ref),
    sondas: Array.from(sondas, (s, i) => s ?? { nombre: `Sonda ${i + 1}`, tipo: 'd' as const }),
    pieza: (id: Id) => doc.piezas[id]?.ref ?? 'una pieza que ya no está'
  }
  return { ok: true, ctx: { netlist: r.netlist, piezaDeElemento: r.piezaDeElemento, nombres, fuentes, barribles, redes, corrientes, nodoDeRed: r.nodoDeRed, avisos: r.avisos } }
}
