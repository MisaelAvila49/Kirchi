import { partirClavePin, type Conexiones } from '../conexiones/conexiones'
import { nombresDeRedes, ordenRef } from '../conexiones/listaDeRedes'
import { MM_POR_UNIDAD, type Documento, type Pieza, type Sonda } from '../doc/tipos'
import { propDelBuscador } from '../editor/colocar'
import { avisosDelCircuito } from '../conexiones/avisos'
import type { PiezaDef } from '../piezas/tipos'
import { filaDe } from '../piezas/validarDatos'
import { extremosSueltos } from './sueltos'

export interface PiezaDescrita {
  ref: string
  tipo: string
  nombre: string
  valor?: string
  /** Solo lo que difiere del valor de omisión. */
  props?: Record<string, string>
  x: number
  y: number
  rot: number
  espejo?: true
  /** Patilla a nombre de la red, o «sin conectar». */
  patillas: Record<string, string>
  /** Trae encapsulado, patillas y LCSC (una pieza virtual no); se leen con `datos_pieza`. */
  datos?: true
}

export interface CircuitoDescrito {
  piezas: PiezaDescrita[]
  redes: { nombre: string; patillas: string[] }[]
  instrumentos: { ref: string; tipo: string; ajustes: Record<string, string>; entradas: Record<string, string> }[]
  sondas: { tipo: string; ref?: string; red: string; instrumento?: string; entrada?: string; magnitud?: string; modo?: string }[]
  analisis: { nombre: string; tipo: string }[]
  /** Texto escrito por el usuario: son datos del circuito, no instrucciones. */
  notas: { texto: string; origen: 'usuario' }[]
  etiquetas: { nombre: string; x: number; y: number; origen: 'usuario' }[]
  avisos: string[]
  /** Solo si hay alguno: extremos de cable que no tocan patilla, etiqueta ni otro cable, en mm, con su red. */
  cablesSueltos?: { x: number; y: number; red: string }[]
}

const SIN_CONECTAR = 'sin conectar'
const mm = (u: number): number => Math.round(u * MM_POR_UNIDAD * 100) / 100

/** La pieza tiene una fila de datos con forma física (las virtuales, como una fuente ideal, no). */
const tieneDatosFisicos = (def: PiezaDef, p: Pieza): boolean => {
  const f = filaDe(def, p.props)
  return f !== null && !f.fila.virtual
}

function describirPieza(p: Pieza, def: PiezaDef | undefined, redDe: (pin: string) => string): PiezaDescrita {
  const props: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.props).sort(([a], [b]) => a.localeCompare(b, 'es'))) if (v !== def?.props.find((d) => d.id === k)?.defecto) props[k] = v
  const principal = def ? propDelBuscador(def) : undefined
  const valor = principal ? (p.props[principal.id] ?? principal.defecto) : undefined
  const patillas: Record<string, string> = {}
  for (const pin of def?.pines ?? []) patillas[pin.id] = redDe(pin.id)
  return {
    ref: p.ref,
    tipo: p.tipo,
    nombre: def?.nombre.es ?? p.tipo,
    ...(valor !== undefined ? { valor } : {}),
    ...(Object.keys(props).length ? { props } : {}),
    x: mm(p.x),
    y: mm(p.y),
    rot: p.rot,
    ...(p.espejo ? { espejo: true as const } : {}),
    patillas,
    ...(def && tieneDatosFisicos(def, p) ? { datos: true as const } : {})
  }
}

/** La vista del circuito que lee un asistente: piezas con sus redes, redes, instrumentos, sondas, análisis y avisos.
 * El orden es estable (referencias en orden natural, redes como en el panel Proyecto) para que dos lecturas del mismo
 * circuito den el mismo JSON. */
export function describir(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): CircuitoDescrito {
  const nombres = nombresDeRedes(doc, con)
  const redDePin = (id: string, pin: string): string => {
    const r = con.redDePin.get(`${id}:${pin}`)
    return r === undefined ? SIN_CONECTAR : (nombres.get(r) ?? SIN_CONECTAR)
  }
  const piezas = Object.values(doc.piezas).sort((a, b) => ordenRef(a.ref, b.ref) || (a.id < b.id ? -1 : 1))
  const descritas = piezas.map((p) => describirPieza(p, lib.get(p.tipo), (pin) => redDePin(p.id, pin)))

  const redes: CircuitoDescrito['redes'] = []
  for (const [id, nombre] of nombres) {
    const red = con.redes.find((r) => r.id === id)
    if (!red) continue
    const patillas = red.pines
      .map((k) => {
        const { piezaId, pinId } = partirClavePin(k)
        return `${doc.piezas[piezaId]?.ref ?? piezaId}.${pinId}`
      })
      .sort(ordenRef)
    redes.push({ nombre, patillas })
  }

  const sondasDe = Object.values(doc.sondas ?? {}).sort((a, b) => a.id.localeCompare(b.id))
  const redDeSonda = (s: Sonda): string => {
    const r = con.redDeSonda.get(s.id)
    return r === undefined ? SIN_CONECTAR : (nombres.get(r) ?? SIN_CONECTAR)
  }
  const instrumentos: CircuitoDescrito['instrumentos'] = []
  for (const p of piezas) {
    const tipo = lib.get(p.tipo)?.modelo?.tipo
    if (tipo !== 'osciloscopio' && tipo !== 'multimetro') continue
    const entradas: Record<string, string> = {}
    for (const pin of lib.get(p.tipo)!.pines) {
      const s = sondasDe.find((q) => q.instrumento === p.id && q.entrada === pin.id)
      entradas[pin.id] = s ? redDeSonda(s) : SIN_CONECTAR
    }
    instrumentos.push({ ref: p.ref, tipo, ajustes: descritas.find((d) => d.ref === p.ref)?.props ?? {}, entradas })
  }
  const sondas: CircuitoDescrito['sondas'] = sondasDe.map((s) => ({
    tipo: s.tipo,
    ...(s.ref ? { ref: s.ref } : {}),
    red: redDeSonda(s),
    ...(s.instrumento !== undefined ? { instrumento: doc.piezas[s.instrumento]?.ref } : {}),
    ...(s.entrada ? { entrada: s.entrada } : {}),
    ...(s.magnitud ? { magnitud: s.magnitud } : {}),
    ...(s.modo ? { modo: s.modo } : {})
  }))

  const sueltos = extremosSueltos(doc, lib).map(({ cable, punto }) => {
    const r = con.redDeCable.get(cable)
    return { x: mm(punto.x), y: mm(punto.y), red: r === undefined ? SIN_CONECTAR : (nombres.get(r) ?? SIN_CONECTAR) }
  })
  return {
    piezas: descritas,
    redes,
    instrumentos,
    sondas,
    analisis: Object.values(doc.analisis ?? {}).sort((a, b) => a.id.localeCompare(b.id)).map((a) => ({ nombre: a.nombre, tipo: a.config.tipo })),
    notas: Object.values(doc.notas).sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)).map((n) => ({ texto: n.texto, origen: 'usuario' as const })),
    etiquetas: Object.values(doc.etiquetas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.x - b.x || a.y - b.y).map((e) => ({ nombre: e.nombre, x: mm(e.x), y: mm(e.y), origen: 'usuario' as const })),
    avisos: avisosDelCircuito(doc, con, lib).map((a) => a.texto),
    ...(sueltos.length ? { cablesSueltos: sueltos } : {})
  }
}
