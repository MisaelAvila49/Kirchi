/** Del análisis guardado en el documento (piezas por id) a la petición del servicio de ngspice (elementos por índice de la netlist). Una pieza ausente detiene el armado con un mensaje que la nombra. */
import type { NetlistMotor } from '../netlistMotor'
import type { AnalisisSpice, OpcionesSolver, PeticionAnalisis } from '../spice/mazo'
import { puntosPorPeriodo, valoresDeParametro, type AnalisisDoc, type Id } from './config'

export interface ContextoPeticion {
  netlist: NetlistMotor
  /** `compilarNetlist().piezaDeElemento`: la pieza de cada elemento de la netlist. */
  piezaDeElemento: readonly Id[]
  /** Nombre legible de una pieza (su referencia) para los mensajes. */
  nombreDePieza?: (id: Id) => string
}

export interface OpcionesPeticion {
  solver?: OpcionesSolver
  /** Elementos (índices de la netlist) de los que se pide la corriente además de las sondas. */
  corrientes?: number[]
}

export type PeticionArmada = { ok: true; peticion: PeticionAnalisis } | { ok: false; error: string }

/** El primer elemento de la pieza con alguno de esos tipos. */
export function elementoDePieza(ctx: ContextoPeticion, pieza: Id, tipos: readonly string[]): number {
  const k = ctx.netlist.elements.findIndex((e, i) => ctx.piezaDeElemento[i] === pieza && tipos.includes((e as { type: string }).type))
  return k
}

export function peticionDe(a: AnalisisDoc, ctx: ContextoPeticion, o: OpcionesPeticion = {}): PeticionArmada {
  const nombre = (id: Id): string => ctx.nombreDePieza?.(id) ?? 'una pieza que ya no está'
  const fuente = (id: Id, que: string): number | string => {
    const k = elementoDePieza(ctx, id, ['V'])
    return k < 0 ? `${que} (${nombre(id)}) no es una fuente de voltaje del circuito.` : k
  }
  const c = a.config
  let analisis: AnalisisSpice
  switch (c.tipo) {
    case 'op':
      analisis = { tipo: 'op' }
      break
    case 'dc': {
      const f1 = fuente(c.fuente, 'La fuente que se barre')
      if (typeof f1 === 'string') return { ok: false, error: f1 }
      let segunda: { fuente: number; desde: number; hasta: number; paso: number } | undefined
      if (c.segunda) {
        const f2 = fuente(c.segunda.fuente, 'La segunda fuente')
        if (typeof f2 === 'string') return { ok: false, error: f2 }
        segunda = { fuente: f2, desde: c.segunda.desde, hasta: c.segunda.hasta, paso: c.segunda.paso }
      }
      analisis = { tipo: 'dc', fuente: f1, desde: c.desde, hasta: c.hasta, paso: c.paso, ...(segunda ? { segunda } : {}) }
      break
    }
    case 'ac': {
      const f = fuente(c.fuente, 'La entrada de CA')
      if (typeof f === 'string') return { ok: false, error: f }
      analisis = { tipo: 'ac', barrido: c.barrido, puntos: c.puntos, desde: c.desde, hasta: c.hasta, fuente: f, magnitud: c.magnitud }
      break
    }
    case 'tran': {
      const paso = c.maximo ?? c.fin / 1000
      analisis = { tipo: 'tran', paso, fin: c.fin, maximo: paso, ...(c.inicio !== undefined ? { inicio: c.inicio } : {}), ...(c.uic ? { uic: true } : {}) }
      break
    }
    case 'fourier': {
      const T = 1 / c.fundamental
      const ppp = puntosPorPeriodo(c.armonicos)
      const paso = T / ppp
      // Se guarda un poco antes de la ventana para poder interpolar en su primer instante.
      analisis = { tipo: 'tran', paso, fin: (c.descarte + c.periodos) * T, maximo: paso, inicio: Math.max(0, c.descarte * T - 4 * paso) }
      break
    }
  }
  let parametro: PeticionAnalisis['parametro']
  if (a.parametro) {
    const k = elementoDePieza(ctx, a.parametro.pieza, ['R', 'C', 'L', 'V', 'I'])
    if (k < 0) return { ok: false, error: `La pieza que se barre (${nombre(a.parametro.pieza)}) no es una resistencia, un capacitor, un inductor ni una fuente del circuito.` }
    parametro = { elemento: k, valores: valoresDeParametro(a.parametro) }
  }
  return { ok: true, peticion: { netlist: ctx.netlist, analisis, ...(o.solver ? { solver: o.solver } : {}), ...(parametro ? { parametro } : {}), ...(o.corrientes?.length ? { corrientes: o.corrientes } : {}) } }
}
