import { SERIES_COMERCIALES, type SerieComercial } from '../../compartido/ajustes'
import { escribirKir } from '../../renderer/src/archivo/kir'
import { CALCULADORAS, calculadoraDe, estadoInicial, IDS_CALCULADORAS, type IdCalculadora } from '../../renderer/src/calculadoras/catalogo'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import { armar } from '../../renderer/src/plantillas/armar'
import { conTextosFijos } from '../../renderer/src/plantillas/textosFijos'

/** Las calculadoras del panel como herramientas: las mismas fórmulas, series comerciales y circuitos que «Generar circuito». */

export const SERIE_POR_OMISION: SerieComercial = 'E12'
export { IDS_CALCULADORAS, SERIES_COMERCIALES }

/** Qué campos lleva cada calculadora, para la descripción de las herramientas: «divisor (vin, vout, modo, rtotal, corriente)». */
export function resumenDeCampos(): string {
  return CALCULADORAS.map((c) => `${c.id} (${c.campos.map((k) => k.id).join(', ')})`).join('; ')
}

export interface CalculoHecho {
  /** Lo que se le dice al asistente: valores exactos y comerciales, lo que resulta con ellos, avisos y ecuaciones. */
  resultado: {
    calculadora: string
    serie: SerieComercial
    valores: { rotulo: string; exacto: string; comercial?: string; desvio?: string }[]
    reales: { rotulo: string; valor: string; detalle?: string }[]
    avisos: string[]
    nota?: string
    ecuaciones: { ecuacion: string; sustitucion: string }[]
  }
  /** El circuito de «Generar circuito», listo como `.kir` para colocarse. */
  circuito: { nombre: string; descripcion: string; bytes: Uint8Array }
}

export function calcular(lib: Map<string, PiezaDef>, version: string, id: unknown, campos: unknown, serie: unknown): CalculoHecho | { motivo: string } {
  if (typeof id !== 'string' || !(IDS_CALCULADORAS as readonly string[]).includes(id)) return { motivo: `Calculadora «${String(id).slice(0, 30)}» no existe. Hay: ${IDS_CALCULADORAS.join(', ')}.` }
  const def = calculadoraDe(id as IdCalculadora)
  const s = serie === undefined ? SERIE_POR_OMISION : serie
  if (!(SERIES_COMERCIALES as readonly unknown[]).includes(s)) return { motivo: `La serie «${String(s).slice(0, 10)}» no existe. Hay: ${SERIES_COMERCIALES.join(', ')}.` }
  const estado = estadoInicial(def)
  if (campos !== undefined) {
    if (typeof campos !== 'object' || campos === null || Array.isArray(campos)) return { motivo: '«campos» debe ser un objeto con los valores, como { "vin": "9" }.' }
    const validos = def.campos.map((k) => k.id)
    for (const [k, v] of Object.entries(campos)) {
      if (!validos.includes(k)) return { motivo: `La calculadora ${def.id} no tiene el campo «${k.slice(0, 30)}». Tiene: ${validos.join(', ')}.` }
      if (typeof v !== 'string' && typeof v !== 'number') return { motivo: `El campo «${k}» debe ser un texto o un número, como 4k7.` }
      estado[k] = String(v)
    }
  }
  const ev = def.evaluar(estado, { serie: s as SerieComercial, lib })
  const errores = Object.entries(ev.erroresCampo)
  if (errores.length > 0) return { motivo: errores.map(([k, m]) => `${k}: ${m}`).join(' ') }
  if (ev.error) return { motivo: ev.error }
  const sal = ev.salida!
  let bytes: Uint8Array
  try {
    bytes = escribirKir(conTextosFijos(armar(sal.armado.def, lib, sal.armado.nombre), lib), version)
  } catch (e) {
    return { motivo: `No se pudo armar el circuito: ${e instanceof Error ? e.message : String(e)}.` }
  }
  return {
    resultado: {
      calculadora: def.id,
      serie: s as SerieComercial,
      valores: sal.valores.map((f) => ({ rotulo: f.rotulo, exacto: f.exacto, ...(f.comercial ? { comercial: f.comercial, desvio: f.desvio } : {}) })),
      reales: sal.reales.map((f) => ({ rotulo: f.rotulo, valor: f.valor, ...(f.detalle ? { detalle: f.detalle } : {}) })),
      avisos: sal.avisos,
      ...(sal.nota ? { nota: sal.nota } : {}),
      ecuaciones: sal.ecuaciones
    },
    circuito: { nombre: sal.armado.nombre, descripcion: sal.armado.descripcion, bytes }
  }
}
