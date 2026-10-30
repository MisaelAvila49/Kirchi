/** Los parámetros de un `.model` del archivo que el motor entiende, para que el transistor use el modelo del original. */
import { PARAMETROS, problemaDeParametro } from '../netlist/rangos'
import type { DirectivaAjena } from './ajeno'
import { numeroSpice } from './lectores/spice'

type ModeloAjeno = Extract<DirectivaAjena, { tipo: 'modelo' }>

/** Nombres de SPICE que el motor escribe distinto. */
const ALIAS: Record<'bjt' | 'mosfet', Record<string, string>> = {
  bjt: { va: 'vaf', vb: 'var', ik: 'ikf', pe: 'vje', me: 'mje', pc: 'vjc', mc: 'mjc' },
  mosfet: {}
}
const CLASES: Record<string, { familia: 'bjt' | 'mosfet'; polaridad: boolean }> = {
  npn: { familia: 'bjt', polaridad: false },
  pnp: { familia: 'bjt', polaridad: true },
  nmos: { familia: 'mosfet', polaridad: false },
  pmos: { familia: 'mosfet', polaridad: true }
}

export interface ModeloDelArchivo {
  nombre: string
  spice: Record<string, number>
  /** Lo que el motor no entiende o no acepta, con el motivo. */
  descartados: string[]
}

/** El juego de parámetros del modelo `nombre` para una pieza de `familia` y polaridad (pnp o pmos); null si el archivo no lo
 * define, es de otra clase o no deja ningún parámetro que el motor entienda. */
export function modeloDelArchivo(modelos: Map<string, ModeloAjeno>, nombre: string | undefined, familia: 'bjt' | 'mosfet', polaridad: boolean): ModeloDelArchivo | null {
  const m = nombre ? modelos.get(nombre.toLowerCase()) : undefined
  return m ? deParametros(m.nombre, m.clase, m.parametros, familia, polaridad) : null
}

/** Parámetros ya separados (`Sim.Params` de KiCad o un `.model`): los que el motor lee, con su nombre. */
export function deParametros(nombre: string, clase: string, parametros: Record<string, number | string>, familia: 'bjt' | 'mosfet', polaridad: boolean): ModeloDelArchivo | null {
  const c = CLASES[clase.toLowerCase()]
  if (!c || c.familia !== familia || c.polaridad !== polaridad) return null
  const spice: Record<string, number> = {}
  const descartados: string[] = []
  for (const [k0, v0] of Object.entries(parametros)) {
    const k = ALIAS[familia][k0.toLowerCase()] ?? k0.toLowerCase()
    const v = typeof v0 === 'number' ? v0 : numeroSpice(String(v0))
    if (k === 'level' || k === 'type') continue
    if (!PARAMETROS[familia].nombres.includes(k) || v === null || !Number.isFinite(v)) {
      descartados.push(`${k0} (no lo usa el motor)`)
      continue
    }
    const problema = problemaDeParametro(familia, k, v)
    if (problema) descartados.push(`${k0} (${problema})`)
    else spice[k] = v
  }
  return Object.keys(spice).length ? { nombre, spice, descartados } : null
}
