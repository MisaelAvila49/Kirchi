import type { Canal } from '../../instrumentos/ajustes'
import { CANALES } from '../../instrumentos/ajustes'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { colocarOrden } from './colocar'
import { instrumentoPorRef, medirEn, primerCanalLibre, TERMINALES } from './sonda'

type Instrumento = Extract<Orden, { orden: 'instrumento' }>

/** Coloca un instrumento y, si trae `medir`, lo conecta con sondas como «Medir con…» del clic derecho. Un instrumento
 * nuevo y medido se pone a la derecha del dibujo. `ref` nombra al instrumento que se pone, o al que ya está si se mide. */
export function instrumentoOrden(est: Estado, o: Instrumento): Plan | Rechazo {
  if (o.tipo === 'medidor') {
    if (!o.medir) return rechazo('Un medidor rápido se pone sobre algo: falta «medir».')
    return medirEn(est, { punto: o.medir.punto, pedido: { con: 'medidor' }, medidor: o.ajustes })
  }
  if (!o.medir) return colocarOrden(est, { orden: 'colocar', tipo: o.tipo, ref: o.ref, props: o.ajustes, en: o.en })

  const { punto, canal, terminal } = o.medir
  if (o.tipo === 'osciloscopio') {
    const pedida = canal?.toUpperCase()
    if (pedida !== undefined && !CANALES.includes(pedida as Canal)) return rechazo(`La entrada del osciloscopio es una de: ${CANALES.join(', ')}.`)
    if (o.ref === undefined) return medirEn(est, { punto, pedido: { con: 'osciloscopio', canal: (pedida ?? 'A') as Canal }, ajustes: o.ajustes })
    const osc = instrumentoPorRef(est, o.ref, 'osciloscopio')
    if ('motivo' in osc) return rechazo(osc.motivo)
    const elegido = (pedida ?? primerCanalLibre(est, osc)) as Canal
    return medirEn(est, { punto, pedido: { con: 'osciloscopio', osc: osc.id, canal: elegido }, entrada: { instrumento: osc, nombre: elegido }, ajustes: o.ajustes })
  }
  const t = terminal ?? '+'
  if (!(TERMINALES as readonly string[]).includes(t)) return rechazo('La terminal del multímetro es + o COM.')
  if (o.ref === undefined) return medirEn(est, { punto, pedido: { con: 'multimetro-nuevo', modo: o.ajustes?.modo }, ajustes: o.ajustes })
  const mm = instrumentoPorRef(est, o.ref, 'multimetro')
  if ('motivo' in mm) return rechazo(mm.motivo)
  return medirEn(est, { punto, pedido: { con: 'multimetro', mm: mm.id, terminal: t as '+' | 'COM' }, entrada: { instrumento: mm, nombre: t }, ajustes: o.ajustes })
}
