import { aplicar, fusionar, type Comando } from '../../doc/comandos'
import { sondaDeEntrada } from '../../doc/sondas'
import type { Id, Pieza, Punto } from '../../doc/tipos'
import { cambiarProp } from '../../editor/colocar'
import { comandoMedir, type PedidoMedir } from '../../editor/medir'
import { MOTIVO_CORRIENTE_AC, MOTIVO_MEDIDOR_DE_CORRIENTE, MOTIVO_SONDA_DE_CORRIENTE, tocaAlgo } from '../../editor/sondas'
import { CANALES, type Canal } from '../../instrumentos/ajustes'
import type { PiezaDef } from '../../piezas/tipos'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { piezaPorRef, sinPieza } from '../referencias'
import { puntosDeRed, resolverExtremo, type Extremo } from './conectar'

type Sonda = Extract<Orden, { orden: 'sonda' }>

export const TERMINALES = ['+', 'COM'] as const

const conPunto = (t: string): string => (t.endsWith('.') ? t : `${t}.`)

/** El instrumento con esa referencia, de ese modelo, o por qué no. */
export function instrumentoPorRef(est: Estado, ref: string, modelo: 'osciloscopio' | 'multimetro'): Pieza | { motivo: string } {
  const p = piezaPorRef(est.doc, ref)
  if (!p) return { motivo: sinPieza(ref) }
  if (est.lib.get(p.tipo)?.modelo?.tipo !== modelo) return { motivo: `${p.ref} no es un ${modelo === 'osciloscopio' ? 'osciloscopio' : 'multímetro'}.` }
  return p
}

/** Dónde poner una sonda para medir lo que nombra `e`: la patilla o un punto de su red. Para corriente, puntos del
 * interior de un tramo recto de sus cables, empezando por los que tocan la patilla. */
function lugaresDeMedida(est: Estado, e: Extremo, corriente: boolean): { en: Punto; cable?: Id }[] {
  if (!corriente) {
    const en = e.patilla ? e.patilla.punto : puntosDeRed(est, e.red)[0]
    return en ? [{ en }] : []
  }
  const salida: { en: Punto; cable: Id; toca: boolean }[] = []
  const par = (v: number) => Math.round(v / 2) * 2
  for (const id of e.red.cables) {
    const c = est.doc.cables[id]
    if (!c) continue
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      const en = a.y === b.y ? { x: par((a.x + b.x) / 2), y: a.y } : { x: a.x, y: par((a.y + b.y) / 2) }
      const toca = !!e.patilla && [a, b].some((q) => q.x === e.patilla!.punto.x && q.y === e.patilla!.punto.y)
      salida.push({ en, cable: id, toca })
    }
  }
  return salida.sort((x, y) => Number(y.toca) - Number(x.toca))
}

/** Aplica `ajustes` a una pieza ya presente en el comando (recién creada o existente), en el mismo paso. */
export function conAjustes(est: Estado, cmd: Comando, id: Id, def: PiezaDef, ajustes: Record<string, string> | undefined): Comando | { motivo: string } {
  if (!ajustes || Object.keys(ajustes).length === 0) return cmd
  const base = aplicar(est.doc, cmd).piezas[id]
  if (!base) return cmd
  let pieza = base
  for (const [k, v] of Object.entries(ajustes)) {
    const r = cambiarProp(pieza, def, k, v)
    if ('error' in r) return { motivo: r.error }
    pieza = r.pieza
  }
  return fusionar(cmd, { nombre: cmd.nombre, cambios: [{ col: 'piezas', id, antes: base, despues: pieza }] })
}

export interface PedidoDeSonda {
  punto: string
  pedido: PedidoMedir
  /** Para entradas de un instrumento que ya está: la pieza y su entrada, para no pisar una sonda que mide otra red. */
  entrada?: { instrumento: Pieza; nombre: string }
  ajustes?: Record<string, string>
  medidor?: { magnitud?: string; modo?: string }
}

/** Pone una sonda con las reglas del clic derecho de un cable (`comandoMedir`): sondas, no etiquetas. */
export function medirEn(est: Estado, q: PedidoDeSonda): Plan | Rechazo {
  const { doc, lib, con } = est
  const verbo = 'No se puso la sonda'
  const e = resolverExtremo(est, q.punto)
  if ('motivo' in e) return rechazo(e.motivo)
  const corriente = q.pedido.con === 'corriente'
  const lugares = lugaresDeMedida(est, e, corriente)
  if (lugares.length === 0) return rechazo(`${verbo}: ${conPunto(corriente ? MOTIVO_SONDA_DE_CORRIENTE : 'ahí no hay dónde medir')}`)

  if (q.entrada) {
    const antes = sondaDeEntrada(doc, q.entrada.instrumento.id, q.entrada.nombre)
    if (antes && con.redDeSonda.get(antes.id) !== e.red.id) return rechazo(`${verbo}: la entrada ${q.entrada.nombre} de ${q.entrada.instrumento.ref} ya mide otra red.`)
  }
  let ultimo = ''
  for (const l of lugares) {
    const r = comandoMedir(doc, lib, con, e.red.id, l.en, q.pedido, est.gen, l.cable)
    if ('error' in r) {
      ultimo = ultimo || r.error
      continue
    }
    let cmd = r.cmd
    const creados: Record<string, string> = {}
    const despues = aplicar(doc, cmd)
    if (r.instrumento !== undefined && doc.piezas[r.instrumento] === undefined) creados[despues.piezas[r.instrumento].ref] = r.instrumento
    const idInstrumento = q.entrada?.instrumento.id ?? r.instrumento
    const def = idInstrumento ? lib.get(despues.piezas[idInstrumento]?.tipo ?? '') : undefined
    if (idInstrumento && def) {
      const a = conAjustes(est, cmd, idInstrumento, def, q.ajustes)
      if ('motivo' in a) return rechazo(`${verbo}: ${conPunto(a.motivo)}`)
      cmd = a
    }
    if (q.pedido.con === 'medidor') {
      const s = aplicar(doc, cmd).sondas?.[r.sonda]
      if (s) {
        const magnitud = q.medidor?.magnitud === 'corriente' ? 'corriente' : q.medidor?.magnitud === 'voltaje' ? 'voltaje' : s.magnitud
        const modo = q.medidor?.modo === 'ac' ? 'ac' : q.medidor?.modo === 'dc' ? 'dc' : s.modo
        if (magnitud === 'corriente' && modo === 'ac') return rechazo(`${verbo}: ${MOTIVO_CORRIENTE_AC}`)
        const nueva = { ...s, magnitud, modo }
        if (magnitud === 'corriente' && !tocaAlgo(aplicar(doc, cmd), lib, nueva)) return rechazo(`${verbo}: ${MOTIVO_MEDIDOR_DE_CORRIENTE}`)
        cmd = fusionar(cmd, { nombre: cmd.nombre, cambios: [{ col: 'sondas', id: s.id, antes: s, despues: nueva }] })
        if (s.ref) creados[s.ref] = s.id
      }
    }
    return { cmd, creados, avisos: [], verbo }
  }
  return rechazo(`${verbo}: ${conPunto(ultimo || MOTIVO_SONDA_DE_CORRIENTE)}`)
}

/** La primera entrada del osciloscopio sin sonda. */
export function primerCanalLibre(est: Estado, osc: Pieza): Canal {
  return CANALES.find((c) => !sondaDeEntrada(est.doc, osc.id, c)) ?? 'A'
}

/** Pone una sonda de voltaje, de corriente, de medidor o de la entrada de un instrumento. */
export function sondaOrden(est: Estado, o: Sonda): Plan | Rechazo {
  switch (o.tipo) {
    case 'voltaje':
    case 'corriente':
    case 'medidor':
      return medirEn(est, { punto: o.punto, pedido: { con: o.tipo } })
    case 'osciloscopio': {
      const pedida = o.entrada?.toUpperCase()
      if (pedida !== undefined && !CANALES.includes(pedida as Canal)) return rechazo(`La entrada del osciloscopio es una de: ${CANALES.join(', ')}.`)
      if (o.instrumento === undefined) return medirEn(est, { punto: o.punto, pedido: { con: 'osciloscopio', canal: (pedida ?? 'A') as Canal } })
      const osc = instrumentoPorRef(est, o.instrumento, 'osciloscopio')
      if ('motivo' in osc) return rechazo(osc.motivo)
      const canal = (pedida ?? primerCanalLibre(est, osc)) as Canal
      return medirEn(est, { punto: o.punto, pedido: { con: 'osciloscopio', osc: osc.id, canal }, entrada: { instrumento: osc, nombre: canal } })
    }
    case 'multimetro': {
      const terminal = o.entrada ?? '+'
      if (!(TERMINALES as readonly string[]).includes(terminal)) return rechazo('La terminal del multímetro es + o COM.')
      if (o.instrumento === undefined) return medirEn(est, { punto: o.punto, pedido: { con: 'multimetro-nuevo' } })
      const mm = instrumentoPorRef(est, o.instrumento, 'multimetro')
      if ('motivo' in mm) return rechazo(mm.motivo)
      return medirEn(est, { punto: o.punto, pedido: { con: 'multimetro', mm: mm.id, terminal: terminal as '+' | 'COM' }, entrada: { instrumento: mm, nombre: terminal } })
    }
  }
}
