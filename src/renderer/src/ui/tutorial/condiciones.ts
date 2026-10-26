import { clavePin, partirClavePin } from '../../conexiones/conexiones'
import { sondasDe, sondasDeInstrumento } from '../../doc/sondas'
import type { Pieza } from '../../doc/tipos'
import { cajaEnMundo, pinesEnMundo } from '../../piezas/transformar'
import type { Caja } from '../../piezas/tipos'
import { leerValor } from '../../valores/valores'
import { EVENTO_SIM_ACTIVA } from './motor'
import type { CtxTutorial } from './tipos'

/** Las piezas de un tipo, en el orden de su id (el de colocación). */
export function piezasDe(ctx: CtxTutorial, tipo: string): Pieza[] {
  return Object.values(ctx.doc.piezas)
    .filter((p) => p.tipo === tipo)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** El valor numérico de una propiedad de la pieza (el guardado o, si no hay, el de la definición); null si no se lee. */
export function valorDe(ctx: CtxTutorial, p: Pieza, propId: string): number | null {
  const texto = p.props[propId] ?? ctx.lib.get(p.tipo)?.props.find((d) => d.id === propId)?.defecto
  return texto === undefined ? null : (leerValor(texto)?.valor ?? null)
}

/** Dos valores son el mismo número aunque se hayan escrito distinto («220», «220 Ω», «0.22k»). */
export const mismoValor = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) <= Math.abs(b) * 1e-6

export const hayFuente5V = (ctx: CtxTutorial): boolean => piezasDe(ctx, 'fuente-dc').some((p) => mismoValor(valorDe(ctx, p, 'voltaje'), 5))
export const hayResistencia220 = (ctx: CtxTutorial): boolean => piezasDe(ctx, 'resistencia').some((p) => mismoValor(valorDe(ctx, p, 'valor'), 220))
export const hayLed = (ctx: CtxTutorial): boolean => piezasDe(ctx, 'led').length > 0

/** La resistencia cambió de valor: ya no hay ninguna de 220 Ω y queda alguna con valor legible. */
export const resistenciaCambiada = (ctx: CtxTutorial): boolean => {
  const rs = piezasDe(ctx, 'resistencia')
  return rs.length > 0 && !rs.some((p) => mismoValor(valorDe(ctx, p, 'valor'), 220)) && rs.some((p) => valorDe(ctx, p, 'valor') !== null)
}

/** Algún LED con el cátodo (la barra) justo debajo de su ánodo. */
export function ledCatodoAbajo(ctx: CtxTutorial): boolean {
  return piezasDe(ctx, 'led').some((p) => {
    const def = ctx.lib.get(p.tipo)
    if (!def) return false
    const pines = pinesEnMundo(p, def)
    const a = pines.find((x) => x.id === 'A')
    const k = pines.find((x) => x.id === 'K')
    return !!a && !!k && a.x === k.x && k.y > a.y
  })
}

/** Circuito del capítulo 1 cerrado, mirado en las redes (no importa por dónde pasen los cables). */
export function circuitoCerrado(ctx: CtxTutorial): boolean {
  const red = (p: Pieza, pin: string) => ctx.con.redDePin.get(clavePin(p.id, pin))
  for (const v of piezasDe(ctx, 'fuente-dc'))
    for (const r of piezasDe(ctx, 'resistencia'))
      for (const d of piezasDe(ctx, 'led')) {
        const mas = red(v, '+'), menos = red(v, '-'), a = red(d, 'A'), k = red(d, 'K'), r1 = red(r, '1'), r2 = red(r, '2')
        if (mas === undefined || menos === undefined || a === undefined || k === undefined || r1 === undefined || r2 === undefined) continue
        if (mas === menos || k !== menos || a === mas || a === menos) continue
        if ((r1 === mas && r2 === a) || (r2 === mas && r1 === a)) return true
      }
  return false
}

/** La red del − de la fuente es la tierra: hay una pieza de tierra unida a ella (la vista previa pide una referencia). */
export function tierraEnLaFuente(ctx: CtxTutorial): boolean {
  return piezasDe(ctx, 'fuente-dc').some((v) => {
    const id = ctx.con.redDePin.get(clavePin(v.id, '-'))
    return id !== undefined && ctx.con.redes.some((r) => r.id === id && r.tierra)
  })
}

export const caja = (ctx: CtxTutorial, p: Pieza, margen = 1): Caja => {
  const def = ctx.lib.get(p.tipo)
  return def ? cajaEnMundo(p, def, margen) : { minX: p.x - margen, minY: p.y - margen, maxX: p.x + margen, maxY: p.y + margen }
}

export const unirCajas = (cajas: readonly Caja[]): Caja | null =>
  cajas.length === 0
    ? null
    : cajas.reduce((a, c) => ({ minX: Math.min(a.minX, c.minX), minY: Math.min(a.minY, c.minY), maxX: Math.max(a.maxX, c.maxX), maxY: Math.max(a.maxY, c.maxY) }))

/** Una zona de 20 × 16 unidades centrada en (x, y): el marco donde se sugiere colocar una pieza. */
export const zonaEn = (x: number, y: number): Caja => ({ minX: x - 10, minY: y - 8, maxX: x + 10, maxY: y + 8 })

const par = (n: number) => Math.round(n / 2) * 2

/**
 * Sitios del mundo de las piezas del capítulo 1 (los de `arranques.ts`), independientes de lo que se vea para que la sombra de cada paso caiga siempre igual.
 */
export const SITIOS = {
  fuente: { x: 0, y: 0 },
  resistencia: { x: 16, y: -4 },
  led: { x: 32, y: 0 },
  tierra: { x: 0, y: 12 },
  /** Capítulo 3: el generador arriba de donde estaba la fuente, el capacitor a la derecha del LED y el osciloscopio abajo. */
  generador: { x: 0, y: -10 },
  capacitor: { x: 40, y: 0 },
  osciloscopio: { x: 28, y: 24 },
  /** Capítulo 2: el multímetro en serie, a media altura del cable de abajo. */
  serie: { x: 16, y: 4 }
} as const

export const sitioFuente = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.fuente
export const sitioResistencia = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.resistencia
export const sitioLed = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.led
export const sitioTierra = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.tierra

/** Cuánto puede quedar una pieza del centro de su sombra y cumplir el paso (en unidades del mundo: una celda mide 2). */
export const TOLERANCIA_SOMBRA = 1

/** La pieza está sobre su sombra: a menos de una unidad en cada eje y, si la sombra pide un giro, con ese giro. */
export function enSombra(p: Pieza, g: { x: number; y: number; rot?: Pieza['rot'] }): boolean {
  return Math.abs(p.x - g.x) <= TOLERANCIA_SOMBRA && Math.abs(p.y - g.y) <= TOLERANCIA_SOMBRA && (g.rot === undefined || p.rot === g.rot)
}

/** Hay una pieza del tipo (y que cumpla `ok`) sobre la sombra. */
export function piezaEnSombra(ctx: CtxTutorial, tipo: string, g: { x: number; y: number; rot?: Pieza['rot'] }, ok: (p: Pieza) => boolean = () => true): boolean {
  return piezasDe(ctx, tipo).some((p) => ok(p) && enSombra(p, g))
}

/** Hay una pieza del tipo (y que cumpla `ok`), pero ninguna sobre la sombra: se colocó en otro lugar. */
export function piezaFueraDeSombra(ctx: CtxTutorial, tipo: string, g: { x: number; y: number; rot?: Pieza['rot'] }, ok: (p: Pieza) => boolean = () => true): boolean {
  const cumplen = piezasDe(ctx, tipo).filter(ok)
  return cumplen.length > 0 && !cumplen.some((p) => enSombra(p, g))
}

/** La posición de un pin de una pieza puesta, en el mundo; undefined si la pieza o el pin no existen. */
export function pinDe(ctx: CtxTutorial, p: Pieza | undefined, pin: string): { x: number; y: number } | undefined {
  const def = p && ctx.lib.get(p.tipo)
  return def ? pinesEnMundo(p, def).find((x) => x.id === pin) : undefined
}

/**
 * Cable esperado entre dos puntos: recto si comparten un eje, en L (primero horizontal) si no. Null si ya están en la misma red o falta alguno.
 */
export function cableGuia(ctx: CtxTutorial, a: { p: Pieza | undefined; pin: string }, b: { p: Pieza | undefined; pin: string }): { x: number; y: number }[] | null {
  const qa = pinDe(ctx, a.p, a.pin), qb = pinDe(ctx, b.p, b.pin)
  if (!qa || !qb || !a.p || !b.p) return null
  const pa = { x: qa.x, y: qa.y }, pb = { x: qb.x, y: qb.y }
  const ra = ctx.con.redDePin.get(clavePin(a.p.id, a.pin)), rb = ctx.con.redDePin.get(clavePin(b.p.id, b.pin))
  if (ra !== undefined && ra === rb) return null
  return pa.x === pb.x || pa.y === pb.y ? [pa, pb] : [pa, { x: pb.x, y: pa.y }, pb]
}

/* ---------- Bloque 2: capítulos 2 a 5 ---------- */

/** Un hecho de la aplicación (guardado, exportado…) ocurrido desde que empezó el paso. */
export const vio = (ctx: CtxTutorial, evento: string): boolean => ctx.eventos?.has(evento) ?? false

/** La vista previa se detuvo: está detenida y durante este paso se la vio en marcha (no basta con estar detenida al empezar). */
export const detenidaTrasCorrer = (ctx: CtxTutorial): boolean => ctx.fase === 'detenida' && vio(ctx, EVENTO_SIM_ACTIVA)

/** El texto de una propiedad de la pieza: el guardado o, si no hay, el de la definición. */
export function textoDe(ctx: CtxTutorial, p: Pieza, propId: string): string | undefined {
  return p.props[propId] ?? ctx.lib.get(p.tipo)?.props.find((d) => d.id === propId)?.defecto
}

export const modoDe = (ctx: CtxTutorial, p: Pieza): string => textoDe(ctx, p, 'modo') ?? 'V DC'

/** Los pines de una red que no son del instrumento `propio` (los de las demás piezas). */
function pinesAjenos(ctx: CtxTutorial, redId: number | undefined, propio: string): string[] {
  const red = ctx.con.redes.find((r) => r.id === redId)
  return red ? red.pines.filter((k) => partirClavePin(k).piezaId !== propio) : []
}

/** Hay un multímetro con una sonda de multímetro puesta con «Medir» (su entrada + o COM unida a un punto del circuito). */
export function medidorConSonda(ctx: CtxTutorial): Pieza | undefined {
  const sondas = Object.values(sondasDe(ctx.doc)).filter((s) => s.tipo === 'multimetro' && s.instrumento !== undefined)
  return piezasDe(ctx, 'multimetro').find((p) => sondas.some((s) => s.instrumento === p.id))
}

/**
 * Multímetro en serie: dos terminales cableadas (sin la sonda de «Medir») en redes distintas, cada una con un pin de otra pieza y sin que ninguna pieza (salvo multímetros) tenga pines en las dos, o estaría en paralelo.
 */
export function medidorEnSerie(ctx: CtxTutorial, p: Pieza): boolean {
  if (sondasDeInstrumento(ctx.doc, p.id).length > 0) return false
  const mas = ctx.con.redDePin.get(clavePin(p.id, '+'))
  const com = ctx.con.redDePin.get(clavePin(p.id, 'COM'))
  if (mas === undefined || com === undefined || mas === com) return false
  const piezasDe = (redId: number): Set<string> => new Set(pinesAjenos(ctx, redId, p.id).map((k) => partirClavePin(k).piezaId))
  const a = piezasDe(mas), b = piezasDe(com)
  if (a.size === 0 || b.size === 0) return false
  for (const id of a) if (b.has(id) && ctx.doc.piezas[id]?.tipo !== 'multimetro') return false
  return true
}

export const medidorEnSerieDe = (ctx: CtxTutorial): Pieza | undefined => piezasDe(ctx, 'multimetro').find((p) => medidorEnSerie(ctx, p))

/** Dónde se sugiere poner el multímetro en serie: a media altura del cable de abajo, el que lleva del LED a la fuente. */
export function sitioSerie(ctx: CtxTutorial): { x: number; y: number } {
  const v = piezasDe(ctx, 'fuente-dc')[0] ?? piezasDe(ctx, 'generador')[0], d = piezasDe(ctx, 'led')[0]
  return v && d ? { x: par((v.x + d.x) / 2), y: SITIOS.serie.y } : SITIOS.serie
}
export const sitioOsciloscopio = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.osciloscopio
export const sitioGenerador = (_ctx?: CtxTutorial): { x: number; y: number } => SITIOS.generador

/** Caja del tramo entre dos tipos de pieza (la primera de cada uno): sirve para señalar el cable que las une. */
export function tramoEntre(ctx: CtxTutorial, a: string, b: string, margen = 1): Caja | null {
  const pa = piezasDe(ctx, a)[0], pb = piezasDe(ctx, b)[0]
  return pa && pb ? unirCajas([caja(ctx, pa, margen), caja(ctx, pb, margen)]) : null
}

/** Un generador de funciones con su salida en la red de una resistencia (la del circuito) y su COM en la tierra. */
export function generadorConectado(ctx: CtxTutorial): boolean {
  return piezasDe(ctx, 'generador').some((g) => {
    const sal = ctx.con.redDePin.get(clavePin(g.id, '+'))
    const com = ctx.con.redDePin.get(clavePin(g.id, 'COM'))
    if (sal === undefined || com === undefined || sal === com) return false
    const tierra = ctx.con.redes.some((r) => r.id === com && r.tierra)
    return tierra && pinesAjenos(ctx, sal, g.id).some((k) => ctx.doc.piezas[partirClavePin(k).piezaId]?.tipo === 'resistencia')
  })
}

/** El capacitor de 100 µF forma el RC con la resistencia: un pin en el cable de la resistencia al LED y el otro en la tierra. */
export function capacitorEnRC(ctx: CtxTutorial): boolean {
  const led = piezasDe(ctx, 'led')[0]
  const nodo = led ? ctx.con.redDePin.get(clavePin(led.id, 'A')) : undefined
  if (nodo === undefined) return false
  const esTierra = (id: number | undefined) => ctx.con.redes.some((r) => r.id === id && r.tierra)
  return piezasDe(ctx, 'capacitor').some((c) => {
    const r1 = ctx.con.redDePin.get(clavePin(c.id, '1')), r2 = ctx.con.redDePin.get(clavePin(c.id, '2'))
    return mismoValor(valorDe(ctx, c, 'valor'), 100e-6) && ((r1 === nodo && esTierra(r2)) || (r2 === nodo && esTierra(r1)))
  })
}

/** Una sonda del osciloscopio puesta en esa entrada, sobre un punto que sí está en una red. */
export function sondaDeOsciloscopio(ctx: CtxTutorial, entrada: string): boolean {
  return Object.values(sondasDe(ctx.doc)).some((s) => s.tipo === 'osciloscopio' && s.entrada === entrada && ctx.con.redDeSonda.has(s.id))
}

/** La base de tiempo (s/div) del primer osciloscopio, o null. */
export function baseDelOsciloscopio(ctx: CtxTutorial): number | null {
  const o = piezasDe(ctx, 'osciloscopio')[0]
  return o ? valorDe(ctx, o, 'base') : null
}
