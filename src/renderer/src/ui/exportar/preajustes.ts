import type { OpcionesExportar, Tema } from '../../../../compartido/ajustes'
import { ASPECTO_ANALISIS, ASPECTO_INFORME, ASPECTO_OSCILOSCOPIO, type AspectoGrafica } from '../../../../compartido/grafica/aspecto'

/**
 * Preajustes «Instrumento» (como la pantalla del osciloscopio) e «Informe» (figura de artículo). Elegir uno conserva el tema y la magnitud absoluta en dBV.
 */
export type NombrePreajuste = 'instrumento' | 'informe'
/** `pantalla`: la captura del osciloscopio; `grafica`: el resultado de un análisis. */
export type TipoFigura = 'pantalla' | 'grafica'

/** Lo que se agrega alrededor del dibujo; no forma parte del aspecto que se guarda con la pantalla. */
export interface Adornos {
  /** Título y subtítulo arriba. */
  titulo: boolean
  /** Leyenda con el nombre de cada traza, arriba. */
  leyenda: boolean
  /** Marco doble y la franja de escalas, disparo y medidas abajo. */
  marco: boolean
  /** Halo de fósforo bajo cada línea. */
  resplandor: boolean
}

export const ADORNOS_PREAJUSTE: Readonly<Record<NombrePreajuste, Adornos>> = {
  instrumento: { titulo: false, leyenda: false, marco: true, resplandor: true },
  informe: { titulo: true, leyenda: true, marco: false, resplandor: false }
}

export interface EstiloDeFigura {
  aspecto: AspectoGrafica
  adornos: Adornos
}

export const NOMBRE_PREAJUSTE: Readonly<Record<NombrePreajuste, string>> = { instrumento: 'Instrumento', informe: 'Informe' }
export const PREAJUSTES: readonly NombrePreajuste[] = ['instrumento', 'informe']

const iguales = (a: Adornos, b: Adornos) => a.titulo === b.titulo && a.leyenda === b.leyenda && a.marco === b.marco && a.resplandor === b.resplandor

/** Qué preajuste describe estos adornos; null si el lector cambió alguno a mano («a medida»). */
export const preajusteDe = (adornos: Adornos): NombrePreajuste | null => PREAJUSTES.find((n) => iguales(ADORNOS_PREAJUSTE[n], adornos)) ?? null

export function aplicarPreajuste(tipo: TipoFigura, n: NombrePreajuste, a: AspectoGrafica): EstiloDeFigura {
  const base =
    tipo === 'grafica'
      ? n === 'informe'
        ? ASPECTO_INFORME
        : ASPECTO_ANALISIS
      : n === 'informe'
        ? { ...ASPECTO_OSCILOSCOPIO, ejeX: 'abajo' as const, textoTono: 'negro' as const }
        : ASPECTO_OSCILOSCOPIO
  return { aspecto: { ...base, tema: a.tema, ...(a.dbAbsoluto ? { dbAbsoluto: true } : {}) }, adornos: { ...ADORNOS_PREAJUSTE[n] } }
}

/**
 * Preajustes «Pantalla» (como el lienzo) e «Informe» (fondo blanco, sin rejilla ni colores de voltaje). Solo tocan estas opciones.
 */
export type PreajusteEsquema = 'pantalla' | 'informe'
export const PREAJUSTES_ESQUEMA: readonly PreajusteEsquema[] = ['pantalla', 'informe']
export const NOMBRE_PREAJUSTE_ESQUEMA: Readonly<Record<PreajusteEsquema, string>> = { pantalla: 'Pantalla', informe: 'Informe' }
export const OPCIONES_PREAJUSTE_ESQUEMA: Readonly<Record<PreajusteEsquema, Pick<OpcionesExportar, 'fondo' | 'rejilla' | 'coloresVoltaje' | 'tintaNegra'>>> = {
  pantalla: { fondo: 'papel', rejilla: true, coloresVoltaje: true, tintaNegra: false },
  informe: { fondo: 'blanco', rejilla: false, coloresVoltaje: false, tintaNegra: true }
}

/** Las opciones de un preajuste: «Pantalla» lleva el fondo del tema que se ve (claro o oscuro, ya explícito). */
export const opcionesDePreajusteEsquema = (n: PreajusteEsquema, tema: Tema) => ({ ...OPCIONES_PREAJUSTE_ESQUEMA[n], ...(n === 'pantalla' ? { fondo: (tema === 'oscuro' ? 'oscuro' : 'papel') as OpcionesExportar['fondo'] } : {}) })

/** Qué preajuste describen estas opciones; null si el lector cambió alguna a mano («a medida»). «Pantalla» vale con el fondo claro o el oscuro. */
export const preajusteEsquemaDe = (o: OpcionesExportar): PreajusteEsquema | null =>
  PREAJUSTES_ESQUEMA.find((n) =>
    (Object.entries(OPCIONES_PREAJUSTE_ESQUEMA[n]) as [keyof OpcionesExportar, unknown][]).every(([k, v]) => (k === 'fondo' && n === 'pantalla' ? o.fondo === 'papel' || o.fondo === 'oscuro' : o[k] === v))
  ) ?? null
