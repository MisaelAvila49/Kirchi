import { CANALES, LETRA_DE_MEDIDA, MAX_MEDIDAS_VISTA, MEDIDAS, MATEMATICO, type IdMedida, type MedidaElegida } from '../../instrumentos/ajustes'
import type { MedidaSab, PantallaSab, RazonSinMedida } from '../../sim/protocoloInstrumentos'
import { formatearMedida } from '../../valores/valores'

export const NOMBRE_MEDIDA: Readonly<Record<IdMedida, string>> = {
  vpp: 'Vpp', vmax: 'Vmáx', vmin: 'Vmín', prom: 'Promedio', rms: 'Eficaz', f: 'Frecuencia', periodo: 'Periodo', ciclo: 'Ciclo de trabajo'
}
/** El nombre de cada medida en las fichas bajo la pantalla (corto, como en un banco); el largo va en los nombres accesibles. */
export const NOMBRE_CORTO: Readonly<Record<IdMedida, string>> = {
  vpp: 'Vpp', vmax: 'Vmáx', vmin: 'Vmín', prom: 'Prom', rms: 'Eficaz', f: 'Frec', periodo: 'Periodo', ciclo: 'Ciclo'
}
const UNIDAD:Readonly<Record<IdMedida, string>> = { vpp: 'V', vmax: 'V', vmin: 'V', prom: 'V', rms: 'V', f: 'Hz', periodo: 's', ciclo: '' }

/** Por qué una medida no tiene valor. */
export const RAZON_SIN_MEDIDA: Readonly<Record<Exclude<RazonSinMedida, ''>, string>> = {
  'sin-periodos': 'La señal no se repite en la pantalla: no tiene periodo.',
  'menos-de-un-ciclo': 'Hay menos de un ciclo en la pantalla.',
  apagado: 'El canal está apagado.',
  'sin-datos': 'Todavía no hay datos.'
}
/** La razón corta que se ve en lugar de la cifra. */
export const RAZON_CORTA: Readonly<Record<Exclude<RazonSinMedida, ''>, string>> = {
  'sin-periodos': 'sin periodo',
  'menos-de-un-ciclo': 'menos de un ciclo',
  apagado: 'canal apagado',
  'sin-datos': 'sin datos'
}

export function textoMedida(id: IdMedida, m: MedidaSab | undefined): { texto: string; razon: string | null } {
  if (!m || m.razon || !Number.isFinite(m.valor)) {
    const r = m?.razon || 'sin-datos'
    return { texto: RAZON_CORTA[r], razon: RAZON_SIN_MEDIDA[r] }
  }
  if (id === 'ciclo') return { texto: `${(m.valor * 100).toFixed(1)} %`, razon: null }
  return { texto: formatearMedida(m.valor, UNIDAD[id], 4), razon: null }
}

const indiceCanal = (c: MedidaElegida['canal']): number => (c === MATEMATICO ? CANALES.length : CANALES.indexOf(c))

export function medidaDePantalla(p: PantallaSab | null, e: MedidaElegida): MedidaSab | undefined {
  return p?.medidas[indiceCanal(e.canal)]?.[MEDIDAS.indexOf(e.medida)]
}

/** La propiedad `medidas` («Ap Bf»): canal y letra de cada medida. */
export const textoDeMedidas = (ms: readonly MedidaElegida[]): string => ms.map((m) => `${m.canal}${LETRA_DE_MEDIDA[m.medida]}`).join(' ')

/** Agrega la medida o la quita si ya está; null si ya hay cuatro. */
export function alternarMedida(actual: readonly MedidaElegida[], e: MedidaElegida): string | null {
  const ya = actual.some((m) => m.canal === e.canal && m.medida === e.medida)
  if (ya) return textoDeMedidas(actual.filter((m) => !(m.canal === e.canal && m.medida === e.medida)))
  if (actual.length >= MAX_MEDIDAS_VISTA) return null
  return textoDeMedidas([...actual, e])
}
