import type { TextoAjuste } from '../../../compartido/ajustes'
import type { Pieza } from '../doc/tipos'
import { tramoMinimoPot } from '../netlist/netlist'
import type { ModeloDef, ParametrosSpice, PiezaDef } from '../piezas/tipos'
import { posicionDeProp, textoPosicion } from '../sim/potenciometro'
import { leerEnVivo } from '../valores/enVivo'
import { fraccionConLey } from '../valores/leyPot'
import { formatearValor, leerValor } from '../valores/valores'

/** Id de la propiedad de lista que elige qué dice el recuadro del ajuste de una pieza que se mueve: lo de Configuración, el ajuste, los valores, ambos o nada. */
export const PROP_JUNTO = 'junto'
/** Entre el ajuste y la resistencia de la misma línea. */
export const SEPARADOR_AJUSTE = ' · '
/** La opción por omisión de cada pieza: lo que diga Configuración. */
export const JUNTO_GENERAL = 'Como en Configuración'

type Junto = TextoAjuste

// El ajuste general de Configuración; la interfaz lo fija al abrir y al cambiarlo (como la serie comercial).
let general: TextoAjuste = 'Valores'
export const ponerTextoAjuste = (v: TextoAjuste): void => void (general = v)

/** Qué dice el recuadro del ajuste de esta pieza: lo que pidió el lector o, con «Como en Configuración», el ajuste general;
 * una pieza sin resistencia que ver (LM35, TMP36) dice su ajuste cuando se piden los valores. null si la pieza no tiene la opción.
 * «Resistencia» es como se guardaba antes la opción «Valores». */
export function juntoDe(p: Pieza, def: PiezaDef): Junto | null {
  const d = def.props.find((q) => q.id === PROP_JUNTO)
  if (!d?.opciones) return null
  let v = p.props[PROP_JUNTO] ?? d.defecto
  if (v === 'Resistencia') v = 'Valores'
  if (!d.opciones.includes(v)) v = d.defecto
  const elegido = v === JUNTO_GENERAL ? general : (v as Junto)
  return !d.opciones.includes('Valores') && (elegido === 'Valores' || elegido === 'Ambos') ? 'Ajuste' : elegido
}

const K_CERO = 273.15, T_REF = 298.15

/** Resistencia (Ω) de un termistor a `tc` °C: la tabla interpolada en ln R (extremos fijos) o la fórmula con beta, como el motor. */
export function resistenciaDeTermistor(m: Extract<ModeloDef, { tipo: 'termistor' }>, opcion: string, tc: number): number | null {
  const tabla = m.tablas?.[opcion]
  if (tabla && tabla.length > 1) {
    if (tc <= tabla[0][0]) return tabla[0][1]
    const ult = tabla.length - 1
    if (tc >= tabla[ult][0]) return tabla[ult][1]
    const k = tabla.findIndex((q) => q[0] > tc)
    const [t0, r0] = tabla[k - 1], [t1, r1] = tabla[k]
    return Math.exp(Math.log(r0) + ((Math.log(r1) - Math.log(r0)) * (tc - t0)) / (t1 - t0))
  }
  const x: ParametrosSpice | undefined = m.modelos[opcion]
  if (!x) return null
  const tk = Math.min(3000, Math.max(100, tc + K_CERO))
  return Math.exp(Math.log(x.r25) + (m.ptc ? -1 : 1) * x.beta * (1 / tk - 1 / T_REF))
}

/** Resistencia (Ω) en reposo de una fotorresistencia con `lux`: r10 por (lux/10)^gamma, sin pasar de su oscuridad. */
export function resistenciaDeLdr(m: Extract<ModeloDef, { tipo: 'ldr' }>, opcion: string, lux: number): number | null {
  const x: ParametrosSpice | undefined = m.modelos[opcion]
  if (!x) return null
  const luz = lux > 0 ? (lux / 10) ** x.gamma : 0
  return x.r10 / Math.max(luz, x.r10 / x.roscuro)
}

const opcionDeModelo = (p: Pieza, def: PiezaDef, prop: string): string => p.props[prop] ?? def.props.find((d) => d.id === prop)?.defecto ?? ''
const ohms = (r: number) => formatearValor(r, 'Ω')

/** Resistencia que el lector ve: la del termistor a `tc`, la de la fotorresistencia a `lux`; null si no aplica. */
export function resistenciaEnVivo(p: Pieza, def: PiezaDef, valor: number): string | null {
  const m = def.modelo
  if (m?.tipo === 'termistor') {
    const r = resistenciaDeTermistor(m, opcionDeModelo(p, def, m.prop), valor)
    return r === null ? null : ohms(r)
  }
  if (m?.tipo === 'ldr') {
    const r = resistenciaDeLdr(m, opcionDeModelo(p, def, m.prop), valor)
    return r === null ? null : ohms(r)
  }
  return null
}

/** Lo que dice el recuadro del ajuste según la opción elegida, con el documento: el ajuste («30 %», «25 °C») y la resistencia («3 kΩ | 7 kΩ»,
 * «10 kΩ»). El potenciómetro reparte su total por la ley y con el mismo tramo mínimo que el motor. */
export function partesDeAjuste(p: Pieza, def: PiezaDef): { ajuste: string | null; resistencia: string | null } {
  const junto = juntoDe(p, def)
  const sinNada = { ajuste: null, resistencia: null }
  if (junto === null || junto === 'Nada') return sinNada
  const conAjuste = junto === 'Ajuste' || junto === 'Ambos', conRes = junto === 'Valores' || junto === 'Ambos'
  const m = def.modelo
  if (m?.tipo === 'pot') {
    const pos = posicionDeProp(p.props[m.posicion] ?? def.props.find((d) => d.id === m.posicion)?.defecto)
    let resistencia: string | null = null
    if (conRes) {
      const v = leerValor(p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? '')
      if (v && v.valor > 0) {
        const x = fraccionConLey(pos / 100, m.ley ? opcionDeModelo(p, def, m.ley) : undefined), rMin = tramoMinimoPot(v.valor)
        const r1 = Math.max(rMin, v.valor * x), r2 = Math.max(rMin, v.valor * (1 - x))
        resistencia = m.reostato ? ohms(r1) : `${ohms(r1)} | ${ohms(r2)}`
      }
    }
    return { ajuste: conAjuste ? textoPosicion(pos) : null, resistencia }
  }
  // La perilla de la pieza (temperatura, luz): su valor guardado, o el mínimo si el texto no se lee.
  const d = def.props.find((q) => q.enVivo)
  if (!d?.enVivo) return sinNada
  const l = leerEnVivo(d, p.props[d.id] ?? d.defecto)
  const v = 'valor' in l ? l.valor : d.enVivo.min
  return { ajuste: conAjuste ? formatearValor(v, d.unidad ?? '') : null, resistencia: conRes ? resistenciaEnVivo(p, def, v) : null }
}

/** Lo que dice el recuadro del ajuste (el ajuste, la resistencia o ambos con su separador); null si no dice nada. */
export function textoDeAjuste(p: Pieza, def: PiezaDef): string | null {
  const { ajuste, resistencia } = partesDeAjuste(p, def)
  const partes = [ajuste, resistencia].filter((x): x is string => x !== null && x !== '')
  return partes.length ? partes.join(SEPARADOR_AJUSTE) : null
}

/** El recuadro del ajuste pide el ajuste mismo (el porcentaje del cursor) y no solo los valores. */
export function pideAjuste(p: Pieza, def: PiezaDef): boolean {
  const j = juntoDe(p, def)
  return j === 'Ajuste' || j === 'Ambos'
}

/** Las partes del recuadro del ajuste de una pieza con resistencia en vivo (termistor, fotorresistencia) cuando el lector pidió verla:
 * lo que no cambia con el motor (con su separador) y la resistencia del documento, por si la lectura aún no llega. */
export function partesVivas(p: Pieza, def: PiezaDef): { fijo: string; respaldo: string } | null {
  const t = def.modelo?.tipo
  if (t !== 'termistor' && t !== 'ldr') return null
  const { ajuste, resistencia } = partesDeAjuste(p, def)
  return resistencia === null ? null : { fijo: ajuste === null ? '' : ajuste + SEPARADOR_AJUSTE, respaldo: resistencia }
}
