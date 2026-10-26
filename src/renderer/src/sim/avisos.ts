import type { Conexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import { opcionDe, type ResultadoNetlist } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { formatearMedida, formatearValor, leerValor } from '../valores/valores'
import type { Lectura } from './lectura'
import { excesoAbsoluto, resolverAbsolutos, type AbsolutosDePieza } from './absolutos'
import { corrienteNominal } from './sobrecorriente'

/** Avisos de sobrecorriente: LED y segmento, foco, fusible, resistencia («Potencia nominal») y transistor. Se compara con
 * la media del intervalo, que es lo que calienta (un LED multiplexado con pulsos de 60 mA a un cuarto del tiempo lleva 15
 * mA). Dura al menos `PERMANENCIA_MS` tras volver abajo. */

/** Lo que el aviso se queda a la vista después de volver debajo del límite (ms de reloj). */
export const PERMANENCIA_MS = 1000
/** Potencia nominal de una resistencia que no la trae (un archivo anterior a el motor). */
export const POTENCIA_RESISTENCIA = 0.25
/** Corriente nominal de un segmento del display si su modelo no la trae. */
export const INOM_SEGMENTO = 0.02

export type TipoAviso = 'led' | 'display' | 'foco' | 'fusible' | 'resistencia' | 'transistor' | 'capacitor' | 'motor' | 'compuesto' | 'absolutos'

/** Lo que cada pieza admite, armado una vez al cargar la netlist (`limitesDelCircuito`). */
export interface LimitePieza {
  tipo: TipoAviso
  /** Corriente nominal o máxima (A): LED, segmento, fusible y transistor. */
  corriente?: number
  /** Potencia nominal o máxima (W): foco, resistencia y transistor. */
  potencia?: number
  /** El nombre de lo que da el límite del transistor («2N2222»), para el Registro. */
  modelo?: string
  /** Capacitor electrolítico y motor: su voltaje nominal (V), las veces que avisa y, el capacitor, el inverso máximo (V). */
  voltaje?: { nominal: number; aviso: number; inverso?: number }
  /** Pieza compuesta (ULN2003, reguladores): sus límites por canal o por sentido, de `limites.compuesto`. */
  canales?: NonNullable<NonNullable<PiezaDef['limites']>['compuesto']>
  /** Los máximos absolutos de la hoja de datos de su modelo, con los pines ya en redes. */
  absolutos?: AbsolutosDePieza
  /** Fusible: lo que hace falta para estimar cuánto le falta para fundirse (Ω, A de fusión y s). */
  fusible?: { ohms: number; ifusion: number; tau: number }
  /** «Las piezas se queman»: veces el límite, tiempo simulado seguido (s) y el elemento que se abre. */
  quema?: { factor: number; durante: number; elemento: number }
}

/** Un aviso a la vista: su chip («31.6 mA, máximo 20 mA») y si sigue pasado del límite o solo se queda su segundo. */
export interface Aviso {
  tipo: TipoAviso
  texto: string
  excedido: boolean
  /** Lo que ya no se pasa del límite se quita en este reloj (ms). */
  hasta: number
  /** La parte de la pieza (el segmento del display) o null si es toda. */
  segmento: number | null
}

/** Una potencia en vatios como se escribe la de una resistencia («0.25 W», «0.49 W», «0.125 W», «2 W»). */
export const textoVatios = (p: number): string => (Math.abs(p) >= 1 ? formatearValor(p, 'W') : `${Number(p.toPrecision(3))} W`)

/** La potencia nominal de una resistencia: la de su propiedad de lista («0.25 W») o la de omisión. */
export function potenciaNominal(texto: string | undefined): number {
  const v = texto ? leerValor(texto) : null
  return v && v.valor > 0 && (!v.unidad || v.unidad === 'W') ? v.valor : POTENCIA_RESISTENCIA
}

/** Lo que admite cada pieza del circuito cargado que avisa, con el elemento que se quema si la pieza lo hace. */
export function limitesDelCircuito(doc: Documento, lib: Map<string, PiezaDef>, r: ResultadoNetlist, con?: Conexiones): Map<Id, LimitePieza> {
  const out = new Map<Id, LimitePieza>()
  const elementoDe = new Map<Id, number>()
  r.piezaDeElemento.forEach((id, k) => {
    if (!elementoDe.has(id)) elementoDe.set(id, k)
  })
  const el = r.netlist?.elements ?? []
  for (const [id, k] of elementoDe) {
    const p = doc.piezas[id]
    const def = p ? lib.get(p.tipo) : undefined
    const m = def?.modelo
    if (!p || !def || !m) continue
    const q = def.limites?.quema
    // Una pieza compuesta abre el elemento que dice su `pieza.json` (el transistor de paso de un regulador).
    const abierto = q?.elemento !== undefined ? (r.compuestos?.get(id)?.elementos[q.elemento] ?? k) : k
    const quema = q ? { factor: q.factor, durante: q.durante, elemento: abierto } : undefined
    const e = el[k]
    // Los máximos absolutos solo se resuelven con las conexiones (los pines son de la pieza, las redes del documento).
    const maximos = con && def.limites?.absolutos ? resolverAbsolutos(p, def, con) : undefined
    const conMaximos = maximos ? { absolutos: maximos } : {}
    if (m.tipo === 'D') {
      const inom = corrienteNominal(p, def)
      if (inom !== null) out.set(id, { tipo: 'led', corriente: inom, ...(quema ? { quema } : {}) })
      else if (maximos) out.set(id, { tipo: 'absolutos', ...conMaximos, ...(quema ? { quema } : {}) })
    } else if (maximos && (m.tipo === 'ampop' || m.tipo === 'comparador' || m.tipo === 'zener' || m.tipo === '555')) {
      out.set(id, { tipo: 'absolutos', ...conMaximos, ...(quema ? { quema } : {}) })
    } else if (m.tipo === 'display') {
      out.set(id, { tipo: 'display', corriente: m.inom ?? INOM_SEGMENTO })
    } else if (m.tipo === 'foco' && e?.type === 'LAMP') {
      out.set(id, { tipo: 'foco', potencia: e.pnom })
    } else if (m.tipo === 'fusible' && e?.type === 'FUSE') {
      out.set(id, { tipo: 'fusible', corriente: e.inom, fusible: { ohms: e.ohms, ifusion: e.ifusion, tau: e.tau } })
    } else if ((m.tipo === 'C' || m.tipo === 'motor') && def.limites?.voltaje) {
      const l = def.limites.voltaje
      const v = leerValor(opcionDe(p, def, l.prop))
      if (v && v.valor > 0) out.set(id, { tipo: m.tipo === 'C' ? 'capacitor' : 'motor', voltaje: { nominal: v.valor, aviso: l.aviso, ...(l.inverso !== undefined ? { inverso: l.inverso } : {}) }, ...(quema ? { quema } : {}) })
    } else if (m.tipo === 'R' && def.limites?.potencia) {
      // Una de las opciones de la pieza (un .kir editado a mano con otra cifra toma la de omisión).
      out.set(id, { tipo: 'resistencia', potencia: potenciaNominal(opcionDe(p, def, def.limites.potencia)), ...(quema ? { quema } : {}) })
    } else if (m.tipo === 'compuesto' && (def.limites?.compuesto || maximos)) {
      out.set(id, { tipo: 'compuesto', ...(def.limites?.compuesto ? { canales: def.limites.compuesto } : {}), ...conMaximos, ...(quema ? { quema } : {}) })
    } else if ((m.tipo === 'bjt' || m.tipo === 'mosfet') && def.limites?.por) {
      const modelo = opcionDe(p, def, def.limites.por.prop)
      const v = def.limites.por.valores[modelo]
      if (v) out.set(id, { tipo: 'transistor', modelo, ...(v.corriente !== undefined ? { corriente: v.corriente } : {}), ...(v.potencia !== undefined ? { potencia: v.potencia } : {}), ...conMaximos, ...(quema ? { quema } : {}) })
    }
  }
  return out
}

/** Lo que dice el chip y la línea del Registro de una pieza que se pasa de su límite; null si no se pasa. */
export function excesoDe(l: Lectura, id: Id, lim: LimitePieza, potencia: number | undefined, instantanea?: Lectura): { texto: string; segmento: number | null; registro: (ref: string) => string } | null {
  const principal = excesoPrincipal(l, id, lim, potencia)
  if (principal || !lim.absolutos) return principal
  const a = excesoAbsoluto(lim.absolutos, { redes: l.redes, m: l.piezas.get(id) }, potencia, instantanea?.redes)
  return a ? { texto: a.texto, segmento: null, registro: a.registro } : null
}

/** El límite propio de cada tipo (corriente, potencia, voltaje nominal): lo que el motor ya avisaba antes de los máximos absolutos. */
function excesoPrincipal(l: Lectura, id: Id, lim: LimitePieza, potencia: number | undefined): { texto: string; segmento: number | null; registro: (ref: string) => string } | null {
  const m = l.piezas.get(id)
  if (!m) return null
  const x = m.extra
  switch (lim.tipo) {
    case 'led': {
      const inom = lim.corriente!
      if (!(m.i > inom)) return null
      return { texto: `${formatearMedida(m.i, 'A')}, máximo ${formatearValor(inom, 'A')}`, segmento: null, registro: (ref) => `${ref} lleva ${formatearMedida(m.i, 'A')}, más de sus ${formatearValor(inom, 'A')} nominales: agrega una resistencia en serie.` }
    }
    case 'display': {
      if (x?.tipo !== 'display') return null
      let peor = -1
      x.corrientes.forEach((i, k) => {
        if (i !== null && i > lim.corriente! && (peor < 0 || i > (x.corrientes[peor] ?? 0))) peor = k
      })
      if (peor < 0) return null
      const i = x.corrientes[peor]!
      const seg = SEGMENTOS[peor]
      return { texto: `${seg}: ${formatearMedida(i, 'A')}, máximo ${formatearValor(lim.corriente!, 'A')}`, segmento: peor, registro: (ref) => `${ref} lleva ${formatearMedida(i, 'A')} en el segmento ${seg}, más de sus ${formatearValor(lim.corriente!, 'A')} nominales: agrega una resistencia en serie a cada segmento.` }
    }
    case 'foco': {
      if (x?.tipo !== 'foco' || x.fundido || !((x.calentamiento ?? 0) > 1)) return null
      const p = Math.abs(m.p)
      return { texto: `${textoVatios(p)}, nominal ${textoVatios(lim.potencia!)}`, segmento: null, registro: (ref) => `${ref} disipa ${textoVatios(p)}, más de sus ${textoVatios(lim.potencia!)} nominales: su filamento se calienta de más.` }
    }
    case 'fusible': {
      if (x?.tipo !== 'fusible' || x.fundido) return null
      const f = lim.fusible!
      const nominal = (lim.corriente! / f.ifusion) ** 2
      const s = x.calentamiento ?? 0
      if (!(s > nominal)) return null
      // La corriente eficaz del intervalo: su potencia media entre su resistencia (o la media, sin potencia integrada).
      const i2 = potencia !== undefined && potencia > 0 ? potencia / f.ohms : m.i * m.i
      const i = Math.sqrt(i2)
      const s2 = s * f.ifusion * f.ifusion
      const falta = i2 > f.ifusion * f.ifusion ? f.tau * Math.log((i2 - s2) / (i2 - f.ifusion * f.ifusion)) : null
      // En tiempo simulado: a 0.01× tarda cien veces eso en el reloj.
      const cola = falta !== null && Number.isFinite(falta) && falta > 0 ? `, se funde en ${formatearMedida(falta, 's')} simulados` : ''
      return { texto: `${formatearMedida(i, 'A')}, nominal ${formatearValor(lim.corriente!, 'A')}${cola}`, segmento: null, registro: (ref) => `${ref} lleva ${formatearMedida(i, 'A')}, más de su corriente nominal de ${formatearValor(lim.corriente!, 'A')}${falta !== null ? ': se va a fundir.' : ': se calienta de más.'} Se funde desde ${Number((f.ifusion / lim.corriente!).toPrecision(3))} veces la nominal (${formatearValor(f.ifusion, 'A')}).` }
    }
    case 'resistencia': {
      const p = potencia ?? Math.abs(m.p)
      if (!(p > lim.potencia!)) return null
      return { texto: `${textoVatios(p)}, máximo ${textoVatios(lim.potencia!)}`, segmento: null, registro: (ref) => `${ref} disipa ${textoVatios(p)}, más de su potencia nominal de ${textoVatios(lim.potencia!)}: usa una de más potencia o cambia el circuito.` }
    }
    case 'capacitor': {
      const { nominal, aviso, inverso } = lim.voltaje!
      if (-m.v > inverso!) return { texto: `${formatearMedida(-m.v, 'V')} al revés, máximo ${formatearValor(inverso!, 'V')}`, segmento: null, registro: (ref) => `${ref} tiene ${formatearMedida(-m.v, 'V')} al revés, más de los ${formatearValor(inverso!, 'V')} que admite: un electrolítico polarizado se daña. Invierte sus terminales.` }
      if (m.v > aviso * nominal) return { texto: `${formatearMedida(m.v, 'V')}, nominal ${formatearValor(nominal, 'V')}`, segmento: null, registro: (ref) => `${ref} tiene ${formatearMedida(m.v, 'V')}, más de sus ${formatearValor(nominal, 'V')} nominales: usa uno de más voltaje.` }
      return null
    }
    case 'motor': {
      const { nominal, aviso } = lim.voltaje!
      const v = Math.abs(m.v)
      if (!(v > aviso * nominal)) return null
      return { texto: `${formatearMedida(v, 'V')}, nominal ${formatearValor(nominal, 'V')}`, segmento: null, registro: (ref) => `${ref} tiene ${formatearMedida(v, 'V')}, más de ${Number(aviso.toPrecision(3))} veces sus ${formatearValor(nominal, 'V')} nominales: se calienta de más.` }
    }
    case 'compuesto': {
      if (x?.tipo !== 'compuesto') return null
      // El canal que más se pasa de su máximo (en veces), si alguno se pasa.
      let peor: { c: NonNullable<LimitePieza['canales']>[number]; x: number } | null = null
      let veces = 1
      for (const c of lim.canales ?? []) {
        const origen = c.medida === 'voltaje' ? x.voltajes : x.corrientes
        const suma = c.elementos.reduce((a, k) => a + (origen[k] ?? 0), 0)
        const valor = c.sentido === 'positiva' ? suma : -suma
        if (valor / c.max > veces) {
          veces = valor / c.max
          peor = { c, x: valor }
        }
      }
      if (!peor) return null
      const { c, x: valor } = peor
      const [unidad, verbo] = c.medida === 'voltaje' ? ['V', 'tiene'] : ['A', 'lleva']
      return { texto: `${c.nombre}: ${formatearMedida(valor, unidad)}, máximo ${formatearValor(c.max, unidad)}`, segmento: null, registro: (ref) => `${ref} ${verbo} ${formatearMedida(valor, unidad)} de ${c.nombre}, más de los ${formatearValor(c.max, unidad)} que admite: ${c.consejo}` }
    }
    case 'absolutos':
      return null
    case 'transistor': {
      const i = Math.abs(m.i)
      const p = potencia ?? Math.abs(m.p)
      if (lim.corriente !== undefined && i > lim.corriente) {
        return { texto: `${formatearMedida(i, 'A')}, máximo ${formatearValor(lim.corriente, 'A')}`, segmento: null, registro: (ref) => `${ref} lleva ${formatearMedida(i, 'A')}, más de los ${formatearValor(lim.corriente!, 'A')} que admite el ${lim.modelo}.` }
      }
      if (lim.potencia !== undefined && p > lim.potencia) {
        return { texto: `${textoVatios(p)}, máximo ${textoVatios(lim.potencia)}`, segmento: null, registro: (ref) => `${ref} disipa ${textoVatios(p)}, más de los ${textoVatios(lim.potencia!)} que admite el ${lim.modelo}.` }
      }
      return null
    }
  }
}

const SEGMENTOS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'punto']

/** Lleva los avisos de una vista previa: los visibles (con su segundo de permanencia) y las líneas del Registro, una sola
 * vez por pieza (el LED ya lo dice `VigiaDeSobrecorriente`, con la misma media). */
export class VigiaDeAvisos {
  private vistos = new Map<Id, Aviso>()
  private dichos = new Set<Id>()

  /** Con la lectura promediada `l` (y la potencia media de las piezas que la integran) en el reloj `ahora` (ms): avisos a
   * la vista y líneas nuevas del Registro. */
  revisar(l: Lectura, limites: ReadonlyMap<Id, LimitePieza>, potencias: ReadonlyMap<Id, number>, ahora: number, ref: (id: Id) => string | undefined, instantanea?: Lectura): { visibles: ReadonlyMap<Id, Aviso>; registro: string[] } {
    const registro: string[] = []
    for (const [id, lim] of limites) {
      const e = excesoDe(l, id, lim, potencias.get(id), instantanea)
      if (e) {
        this.vistos.set(id, { tipo: lim.tipo, texto: e.texto, excedido: true, hasta: ahora + PERMANENCIA_MS, segmento: e.segmento })
        if (lim.tipo !== 'led' && !this.dichos.has(id)) {
          this.dichos.add(id)
          registro.push(e.registro(ref(id) ?? id))
        }
      } else {
        const v = this.vistos.get(id)
        if (!v) continue
        if (ahora >= v.hasta) this.vistos.delete(id)
        else if (v.excedido) this.vistos.set(id, { ...v, excedido: false })
      }
    }
    return { visibles: this.vistos, registro }
  }

  /** Al detener: la próxima vista previa vuelve a avisar. */
  reiniciar(): void {
    this.vistos.clear()
    this.dichos.clear()
  }
}

/** Segundos simulados con el reloj andando y la salida en X antes de avisar que el biestable necesita un reinicio. */
export const ESPERA_REINICIO_S = 0.5

/** Biestable (D, JK o T) con salida en X, reloj andando y PRE y CLR inactivos: alternar un estado desconocido da otro
 * desconocido y nunca sale sin un reinicio inicial (B14). Se dice una vez por pieza y vista previa. */
export class VigiaDeReinicio {
  private visto = new Map<Id, { bajo: boolean; alto: boolean; desde: number | null }>()
  private dichos = new Set<Id>()

  revisar(l: Lectura, ref: (id: Id) => string | undefined): string[] {
    const registro: string[] = []
    for (const [id, m] of l.piezas) {
      const x = m.extra
      if (x?.tipo !== 'digital' || (x.modelo !== 'biestable-d' && x.modelo !== 'biestable-jk') || this.dichos.has(id)) continue
      const nivel = (pin: string) => x.pines.find((q) => q.id === pin)?.nivel
      const v = this.visto.get(id) ?? { bajo: false, alto: false, desde: null }
      this.visto.set(id, v)
      const clk = nivel('CLK')
      if (clk === '0') v.bajo = true
      if (clk === '1') v.alto = true
      const sinActivar = nivel('PRE') !== '0' && nivel('CLR') !== '0'
      if (x.q !== 'X' || !sinActivar) {
        v.desde = null
        continue
      }
      if (!(v.bajo && v.alto)) continue
      v.desde ??= l.t
      if (l.t - v.desde >= ESPERA_REINICIO_S) {
        this.dichos.add(id)
        registro.push(`${ref(id) ?? id} sigue en X con el reloj andando: necesita un pulso en CLR al arrancar.`)
      }
    }
    return registro
  }

  reiniciar(): void {
    this.visto.clear()
    this.dichos.clear()
  }
}
