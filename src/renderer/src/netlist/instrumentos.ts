import type { Id, Pieza } from '../doc/tipos'
import {
  ajustesFuente, ajustesGenerador, ajustesMultimetro, ajustesOsciloscopio, C_SALIDA_FUENTE, CANALES, CARGAS, DIVISIONES_H,
  estructuraMultimetro, FUSIBLE_MULTIMETRO, ondaDelGenerador, RANGOS_OHM, resistenciaGenerador, VK_FUENTE,
  type AjustesFuente, type AjustesGenerador, type AjustesMultimetro, type AjustesOsciloscopio, type Canal
} from '../instrumentos/ajustes'
import { COLUMNAS_SONDA, type UsoSonda } from '../instrumentos/memoria'
import type { ModeloDef, PiezaDef } from '../piezas/tipos'
import type { ElementoMotor } from './netlist'

export type ModeloInstrumento = Extract<ModeloDef, { tipo: 'multimetro' | 'osciloscopio' | 'generador' | 'fuente-variable' }>

/** El rango del óhmetro con que arranca la vista previa; el rango automático lo mueve. */
export const RANGO_OHM_INICIAL = RANGOS_OHM[2]
/** Ancho de la columna de la rejilla de una sonda de multímetro (s): 4,096 columnas son 4 s de historia. */
export const COLUMNA_MULTIMETRO = 1e-3

export type { SondaMotor } from '../../../compartido/netlistMotor'

/** Una sonda por armar: con las redes del documento (los nodos se numeran después) o el elemento que mide. */
export type SondaPorArmar =
  | { kind: 'v'; redP: number; redN: number; uso: UsoSonda; columna: number }
  | { kind: 'i'; elemento: () => number; signo: 1 | -1; uso: UsoSonda; columna: number }
  | { kind: 'd'; redDoc: number; uso: UsoSonda; columna: number }

/** Las sondas de un multímetro solo guardan sus muestras (`sin_rejilla` del motor): su lectura es la ventana sobre ellas. */
export const sinRejilla = (uso: UsoSonda): boolean => uso === 'multimetro'

export interface MultimetroNetlist {
  ajustes: AjustesMultimetro
  rangoOhm: number
  /** Su único elemento (un `FUSE` de «+» a COM con la fuente de prueba en serie) y sus sondas (índices de la netlist y de `sondas`). */
  elemento: number
  sondaV: number
  sondaI: number
}

export interface CanalNetlist {
  canal: Canal
  /** Su sonda; null si la entrada está en la tierra (lee 0 V) o al aire. */
  sonda: number | null
  /** Sin cable: la entrada es el único pin de su red. No se arma (ni su resistencia ni su sonda) y su canal no dibuja
   * nada, ni una línea de 0 V. */
  alAire: boolean
  /** Mide una red digital pura. */
  digital: boolean
  /** Su resistencia de entrada; −1 si no tiene. */
  resistencia: number
}

export interface OsciloscopioNetlist {
  ajustes: AjustesOsciloscopio
  canales: CanalNetlist[]
}

export interface GeneradorNetlist {
  ajustes: AjustesGenerador
  fuente: number
  resistencia: number
}

export interface FuenteNetlist {
  ajustes: AjustesFuente
  elemento: number
}

export interface InstrumentosNetlist {
  multimetros: Map<Id, MultimetroNetlist>
  osciloscopios: Map<Id, OsciloscopioNetlist>
  generadores: Map<Id, GeneradorNetlist>
  fuentes: Map<Id, FuenteNetlist>
  /** Los medidores rápidos en AC: cada uno con la sonda de voltaje de su red respecto de tierra, de donde sale su valor eficaz en vivo. */
  medidores: Map<Id, { sonda: number }>
  /** Instrumentos que no se arman porque una terminal está al aire: su lectura dice «sin conectar». */
  sueltos: Set<Id>
}

export const sinInstrumentos = (): InstrumentosNetlist => ({ multimetros: new Map(), osciloscopios: new Map(), generadores: new Map(), fuentes: new Map(), medidores: new Map(), sueltos: new Set() })

export interface Terminal {
  red: number
  etiqueta: string
  mudo?: true
}

/** Lo que `compilarNetlist` le presta al armado de un instrumento. */
export interface ArmadoInstrumento {
  red(pin: string): number
  /** La red tiene otro pin además del del instrumento. */
  conectada(red: number): boolean
  /** «El pin + de XMM1». */
  etiqueta(pin: string): string
  /** La red de tierra del documento. */
  tierra: number
  esDigitalPura(red: number): boolean
  nuevaInterna(): number
  /** Agrega un elemento; `alNumerar` recibe su índice en la netlist. */
  elemento(terminales: Terminal[], el: (nodos: number[]) => ElementoMotor, alNumerar?: (indice: number) => void): void
  /** Agrega una sonda y devuelve su número. */
  sonda(s: SondaPorArmar): number
  error(texto: string): void
}

/** Arma el instrumento `p` en la netlist. */
export function armarInstrumento(p: Pieza, def: PiezaDef, m: ModeloInstrumento, ctx: ArmadoInstrumento, inst: InstrumentosNetlist, rangoOhm: number): void {
  switch (m.tipo) {
    case 'multimetro':
      return armarMultimetro(p, def, m, ctx, inst, rangoOhm)
    case 'osciloscopio':
      return armarOsciloscopio(p, def, m, ctx, inst)
    case 'generador':
      return armarGenerador(p, def, m, ctx, inst)
    case 'fuente-variable':
      return armarFuente(p, def, m, ctx, inst)
  }
}

/** Las dos terminales de un instrumento de dos pines, o null (y queda suelto) si alguna está al aire o las dos en la misma red. */
function dosTerminales(p: Pieza, ctx: ArmadoInstrumento, inst: InstrumentosNetlist, a: string, b: string): [number, number] | null {
  const [ra, rb] = [ctx.red(a), ctx.red(b)]
  if (ra === undefined || rb === undefined || !ctx.conectada(ra) || !ctx.conectada(rb) || ra === rb) {
    inst.sueltos.add(p.id)
    return null
  }
  return [ra, rb]
}

function armarMultimetro(p: Pieza, def: PiezaDef, m: Extract<ModeloInstrumento, { tipo: 'multimetro' }>, ctx: ArmadoInstrumento, inst: InstrumentosNetlist, rangoOhm: number): void {
  const t = dosTerminales(p, ctx, inst, m.mas, m.com)
  if (!t) return
  const [mas, com] = t
  const ajustes = ajustesMultimetro(p, def)
  const e = estructuraMultimetro(ajustes.modo, ajustes.ideal, rangoOhm)
  const mm: MultimetroNetlist = { ajustes, rangoOhm, elemento: -1, sondaV: -1, sondaI: -1 }
  ctx.elemento(
    [{ red: mas, etiqueta: ctx.etiqueta(m.mas) }, { red: com, etiqueta: ctx.etiqueta(m.com) }],
    ([a, b]) => ({ type: 'FUSE', a, b, ohms: e.ohms, inom: FUSIBLE_MULTIMETRO.inom, ifusion: FUSIBLE_MULTIMETRO.ifusion, tau: FUSIBLE_MULTIMETRO.tau, v: e.prueba, ...(e.sinCarga ? { sin_carga: true } : {}) }),
    (i) => (mm.elemento = i)
  )
  mm.sondaV = ctx.sonda({ kind: 'v', redP: mas, redN: com, uso: 'multimetro', columna: COLUMNA_MULTIMETRO })
  // La corriente del elemento va de «+» a COM por dentro: la que entra por «+».
  mm.sondaI = ctx.sonda({ kind: 'i', elemento: () => mm.elemento, signo: 1, uso: 'multimetro', columna: COLUMNA_MULTIMETRO })
  inst.multimetros.set(p.id, mm)
}

function armarOsciloscopio(p: Pieza, def: PiezaDef, m: Extract<ModeloInstrumento, { tipo: 'osciloscopio' }>, ctx: ArmadoInstrumento, inst: InstrumentosNetlist): void {
  const r = ajustesOsciloscopio(p, def)
  if (!r.ok) return ctx.error(r.error)
  // Dos pantallas en las 4,096 columnas de la rejilla.
  const columna = (DIVISIONES_H * r.a.base) / (COLUMNAS_SONDA / 2)
  const ohms = r.a.ideal ? CARGAS.abierto : CARGAS.osciloscopio
  const canales = CANALES.map((canal, k): CanalNetlist => {
    const red = ctx.red(m.entradas[k])
    const c: CanalNetlist = { canal, sonda: null, alAire: false, digital: false, resistencia: -1 }
    if (red === undefined || (red !== ctx.tierra && !ctx.conectada(red))) {
      c.alAire = true
      return c
    }
    if (red === ctx.tierra) return c
    if (ctx.esDigitalPura(red)) {
      c.digital = true
      c.sonda = ctx.sonda({ kind: 'd', redDoc: red, uso: 'canal', columna })
      return c
    }
    ctx.elemento([{ red, etiqueta: '', mudo: true }, { red: ctx.tierra, etiqueta: '' }], ([a, b]) => ({ type: 'R', a, b, ohms }), (i) => (c.resistencia = i))
    c.sonda = ctx.sonda({ kind: 'v', redP: red, redN: ctx.tierra, uso: 'canal', columna })
    return c
  })
  inst.osciloscopios.set(p.id, { ajustes: r.a, canales })
}

function armarGenerador(p: Pieza, def: PiezaDef, m: Extract<ModeloInstrumento, { tipo: 'generador' }>, ctx: ArmadoInstrumento, inst: InstrumentosNetlist): void {
  const t = dosTerminales(p, ctx, inst, m.sal, m.com)
  if (!t) return
  const [sal, com] = t
  const r = ajustesGenerador(p, def)
  if (!r.ok) return ctx.error(r.error)
  const n1 = ctx.nuevaInterna()
  const g: GeneradorNetlist = { ajustes: r.a, fuente: -1, resistencia: -1 }
  ctx.elemento([{ red: n1, etiqueta: '' }, { red: com, etiqueta: ctx.etiqueta(m.com) }], ([a, b]) => ({ type: 'V', a, b, wave: ondaDelGenerador(r.a) }), (i) => (g.fuente = i))
  ctx.elemento([{ red: n1, etiqueta: '' }, { red: sal, etiqueta: ctx.etiqueta(m.sal) }], ([a, b]) => ({ type: 'R', a, b, ohms: resistenciaGenerador(r.a) }), (i) => (g.resistencia = i))
  inst.generadores.set(p.id, g)
}

function armarFuente(p: Pieza, def: PiezaDef, m: Extract<ModeloInstrumento, { tipo: 'fuente-variable' }>, ctx: ArmadoInstrumento, inst: InstrumentosNetlist): void {
  const t = dosTerminales(p, ctx, inst, m.mas, m.menos)
  if (!t) return
  const [mas, menos] = t
  const r = ajustesFuente(p, def)
  if (!r.ok) return ctx.error(r.error)
  const f: FuenteNetlist = { ajustes: r.a, elemento: -1 }
  ctx.elemento(
    [{ red: mas, etiqueta: ctx.etiqueta(m.mas) }, { red: menos, etiqueta: ctx.etiqueta(m.menos) }],
    ([a, b]) => ({ type: 'PSU', a, b, v: r.a.voltaje, ilim: r.a.limite, vk: VK_FUENTE, encendida: r.a.salida }),
    (i) => (f.elemento = i)
  )
  ctx.elemento([{ red: mas, etiqueta: '' }, { red: menos, etiqueta: '' }], ([a, b]) => ({ type: 'C', a, b, farads: C_SALIDA_FUENTE }))
  inst.fuentes.set(p.id, f)
}
