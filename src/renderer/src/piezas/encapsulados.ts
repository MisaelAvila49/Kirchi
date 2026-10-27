import datos from '../../../../componentes/encapsulados.json'
import { nombreParecido } from '../netlist/rangos'

/** Una forma física de montar una pieza. Paso, filas y separación son lo que necesita el arte de protoboard. */
export interface Encapsulado {
  id: string
  nombre: string
  patillas: number
  /** Las patillas se numeran de 1 a `patillas`; si no, se nombran (la caja del TO-3). */
  numerada: boolean
  montaje: 'THT' | 'SMD'
  /** mm entre patillas contiguas de una fila. */
  paso?: number
  filas?: number
  /** mm entre filas (DIP). */
  separacion?: number
  /** Huella de KiCad «Biblioteca:Nombre» de omisión. */
  huella?: string
}

/** Id de huella o de símbolo de KiCad: «Biblioteca:Nombre». */
export const ID_KICAD = /^[A-Za-z0-9_.+-]+:[^\s:]+$/

const CAMPOS = ['nombre', 'patillas', 'numerada', 'montaje', 'paso', 'filas', 'separacion', 'huella']
const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const positivo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Revisa el archivo de encapsulados; cada error dice el campo y una clave ajena sugiere la más parecida. */
export function validarEncapsulados(json: unknown): { ok: true; encapsulados: Map<string, Encapsulado> } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const err = (campo: string, msg: string) => errores.push(`encapsulados.json: ${campo} ${msg}`)
  if (!esObjeto(json) || !esObjeto(json.encapsulados)) return { ok: false, errores: ['encapsulados.json: debe tener «encapsulados»'] }
  for (const k of Object.keys(json)) if (k !== 'encapsulados') err(k, 'no es un campo conocido')
  const mapa = new Map<string, Encapsulado>()
  for (const [id, e] of Object.entries(json.encapsulados)) {
    const c = `encapsulados.${id}`
    if (!esObjeto(e)) {
      err(c, 'debe ser un objeto')
      continue
    }
    let bien = true
    for (const k of Object.keys(e)) {
      if (CAMPOS.includes(k)) continue
      const parecida = nombreParecido(k, CAMPOS)
      err(`${c}.${k}`, `clave desconocida${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
      bien = false
    }
    const mal = (campo: string, msg: string) => {
      err(`${c}.${campo}`, msg)
      bien = false
    }
    if (typeof e.nombre !== 'string' || e.nombre.trim() === '') mal('nombre', 'es obligatorio')
    if (!(Number.isInteger(e.patillas) && (e.patillas as number) > 0)) mal('patillas', 'debe ser un entero positivo')
    if (typeof e.numerada !== 'boolean') mal('numerada', 'debe ser verdadero o falso')
    if (e.montaje !== 'THT' && e.montaje !== 'SMD') mal('montaje', 'debe ser «THT» o «SMD»')
    for (const k of ['paso', 'separacion']) if (e[k] !== undefined && !positivo(e[k])) mal(k, 'debe ser un número positivo en mm')
    if (e.filas !== undefined && !(Number.isInteger(e.filas) && (e.filas as number) > 0)) mal('filas', 'debe ser un entero positivo')
    if (e.huella !== undefined && !(typeof e.huella === 'string' && ID_KICAD.test(e.huella))) mal('huella', 'debe ser un id de KiCad «Biblioteca:Nombre»')
    if (bien) mapa.set(id, { id, ...(e as Omit<Encapsulado, 'id'>) })
  }
  return errores.length ? { ok: false, errores } : { ok: true, encapsulados: mapa }
}

const leidos = validarEncapsulados(datos)
/** Los errores del archivo incluido; `cargarLibreria` los suma a los suyos. */
export const ERRORES_ENCAPSULADOS: string[] = leidos.ok ? [] : leidos.errores
/** Los encapsulados del archivo incluido; con errores, ninguno. */
export const ENCAPSULADOS: Map<string, Encapsulado> = leidos.ok ? leidos.encapsulados : new Map()
