import { nombreParecido, PARAMETROS, problemaDeParametro } from '../netlist/rangos'
import type { PropDef } from './tipos'

// Validación de una pieza `compuesto`. El tipo está en `tipos.ts` y el armado en `netlist/netlist.ts`.

export const CLAVES_COMPUESTO = ['tipo', 'prop', 'modelos', 'internas', 'opcionales', 'medida', 'elementos']

/** Los campos de nodo de cada tipo de elemento, en el orden del motor, y los de valor (obligatorios y opcionales). */
const CAMPOS: Record<string, { nodos: string[]; valores: string[]; opcionales?: string[]; extra?: string[] }> = {
  R: { nodos: ['a', 'b'], valores: ['ohms'] },
  C: { nodos: ['a', 'b'], valores: ['farads'] },
  L: { nodos: ['a', 'b'], valores: ['henries'] },
  V: { nodos: ['a', 'b'], valores: ['volts'] },
  I: { nodos: ['a', 'b'], valores: ['amps'] },
  senoidal: { nodos: ['a', 'b'], valores: ['amp', 'freq'], opcionales: ['fase'] },
  D: { nodos: ['a', 'b'], valores: [], extra: ['params'] },
  Q: { nodos: ['c', 'b', 'e'], valores: [], extra: ['params', 'pnp'] },
  OA: { nodos: ['mas', 'menos', 'sal', 'vmas', 'vmenos'], valores: [], extra: ['params'] },
  T: { nodos: ['a1', 'b1', 'a2', 'b2'], valores: ['l1', 'n', 'k'] }
}

const PARAMETROS_DIODO = ['is', 'n', 'rs', 'bv', 'ibv', 'nbv', 'cjo', 'vj', 'm', 'tt', 'fc']

type Err = (campo: string, msg: string) => void

/** Revisa el modelo `compuesto`: claves, modelos por opción, nodos existentes, valores resolubles (en todas las opciones o
 * como propiedad numérica) y parámetros SPICE con nombres y rangos. `pines` son los ids de los pines de la pieza. */
export function validarCompuesto(m: any, pines: string[], props: PropDef[], err: Err): void {
  const esObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v)
  const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  // El modelo por opción de una propiedad de lista.
  let opciones: Record<string, Record<string, number>> = {}
  if (m.prop !== undefined || m.modelos !== undefined) {
    const prop = props.find((p) => p.id === m.prop)
    if (!prop) err('modelo.prop', 'no es una propiedad de la pieza')
    else if (!prop.opciones) err('modelo.prop', 'debe ser una propiedad de lista')
    else if (!esObj(m.modelos)) err('modelo.modelos', 'debe ser un objeto con los parámetros de cada opción')
    else {
      for (const o of prop.opciones) {
        const v = m.modelos[o]
        if (!esObj(v)) err(`modelo.modelos.${o}`, 'falta: cada opción de la propiedad necesita sus parámetros')
        else for (const [k, x] of Object.entries(v)) if (!esNumero(x)) err(`modelo.modelos.${o}.${k}`, 'debe ser un número')
      }
      for (const k of Object.keys(m.modelos)) if (!prop.opciones.includes(k)) err(`modelo.modelos.${k}`, 'no es una de las opciones de la propiedad')
      opciones = m.modelos
    }
  }
  const claves = new Set(Object.values(opciones).flatMap((x) => (esObj(x) ? Object.keys(x) : [])))
  const internas: string[] = Array.isArray(m.internas) ? m.internas : []
  if (m.internas !== undefined && !(Array.isArray(m.internas) && m.internas.every((x: unknown) => typeof x === 'string' && x !== ''))) err('modelo.internas', 'debe ser una lista de nombres')
  for (const n of internas) if (pines.includes(n)) err('modelo.internas', `«${n}» ya es un pin de la pieza`)
  if (new Set(internas).size !== internas.length) err('modelo.internas', 'tiene nombres repetidos')
  const nodoExiste = (n: unknown) => typeof n === 'string' && (pines.includes(n) || internas.includes(n))
  if (m.opcionales !== undefined) {
    if (!Array.isArray(m.opcionales) || !m.opcionales.every((x: unknown) => typeof x === 'string' && pines.includes(x))) err('modelo.opcionales', 'debe ser una lista de pines de la pieza')
  }
  if (!Array.isArray(m.elementos) || m.elementos.length === 0) {
    err('modelo.elementos', 'debe ser una lista con al menos un elemento')
    return
  }
  // Un nombre de valor se resuelve en TODAS las opciones del modelo (y no en alguna) o es una propiedad numérica de la pieza.
  const nombre = (campo: string, v: unknown) => {
    if (esNumero(v)) return
    if (typeof v !== 'string' || v === '' || v === '-') return err(campo, 'debe ser un número o el nombre de un parámetro o de una propiedad')
    const n = v.startsWith('-') ? v.slice(1) : v
    if (claves.has(n)) {
      for (const [o, x] of Object.entries(opciones)) if (esObj(x) && !Object.hasOwn(x, n)) err(campo, `«${n}» falta en la opción «${o}» del modelo`)
      return
    }
    const q = props.find((p) => p.id === n)
    if (!q) err(campo, `«${n}» no es un parámetro del modelo ni una propiedad de la pieza`)
    else if (q.opciones || q.texto) err(campo, `«${n}» debe ser una propiedad numérica`)
  }
  const usados = new Set<string>()
  m.elementos.forEach((e: any, k: number) => {
    const c = `modelo.elementos[${k}]`
    if (!esObj(e)) return err(c, 'debe ser un objeto')
    const def = typeof e.t === 'string' ? CAMPOS[e.t] : undefined
    if (!def) return err(`${c}.t`, `debe ser uno de ${Object.keys(CAMPOS).join(', ')}`)
    const permitidas = ['t', ...def.nodos, ...def.valores, ...(def.opcionales ?? []), ...(def.extra ?? [])]
    for (const clave of Object.keys(e)) {
      if (permitidas.includes(clave)) continue
      const parecida = nombreParecido(clave, permitidas)
      err(`${c}.${clave}`, `clave desconocida en un elemento «${e.t}»${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
    }
    for (const n of def.nodos) {
      if (!nodoExiste(e[n])) err(`${c}.${n}`, 'debe ser un pin de la pieza o una de las redes internas')
      else usados.add(e[n])
    }
    if (new Set(def.nodos.map((n) => e[n])).size !== def.nodos.length && e.t !== 'Q' && e.t !== 'OA') err(c, 'sus dos nodos deben ser distintos')
    for (const v of def.valores) nombre(`${c}.${v}`, e[v])
    for (const v of def.opcionales ?? []) if (e[v] !== undefined) nombre(`${c}.${v}`, e[v])
    if (e.pnp !== undefined && typeof e.pnp !== 'boolean') err(`${c}.pnp`, 'debe ser verdadero o falso')
    if (def.extra?.includes('params')) {
      const params = e.params
      if (e.t !== 'D' && !esObj(params)) return err(`${c}.params`, 'debe ser un objeto con los parámetros')
      if (params !== undefined && !esObj(params)) return err(`${c}.params`, 'debe ser un objeto con los parámetros')
      for (const [p, x] of Object.entries(params ?? {})) {
        const cc = `${c}.params.${p}`
        nombre(cc, x)
        if (e.t === 'D') {
          if (!PARAMETROS_DIODO.includes(p)) err(cc, `parámetro desconocido (los del diodo son ${PARAMETROS_DIODO.join(', ')})`)
        } else {
          const familia = e.t === 'Q' ? 'bjt' : 'ampop'
          if (!PARAMETROS[familia].nombres.includes(p)) err(cc, problemaDeParametro(familia, p, 1) ?? 'parámetro desconocido')
          else if (esNumero(x)) {
            const problema = problemaDeParametro(familia, p, x)
            if (problema) err(cc, problema)
          }
        }
      }
    }
  })
  for (const p of pines) if (!usados.has(p)) err('modelo.elementos', `ningún elemento usa el pin «${p}»`)
  for (const n of internas) if (!usados.has(n)) err('modelo.internas', `la red «${n}» no la usa ningún elemento`)
  const med = m.medida
  if (!esObj(med)) err('modelo.medida', 'es obligatoria: { mas, menos, i } con los pines del voltaje y el elemento de la corriente')
  else {
    for (const c of ['mas', 'menos']) if (!nodoExiste(med[c])) err(`modelo.medida.${c}`, 'debe ser un pin de la pieza o una de las redes internas')
    if (!(Number.isInteger(med.i) && med.i >= 0 && med.i < m.elementos.length)) err('modelo.medida.i', 'debe ser el índice de uno de los elementos (desde 0)')
  }
}
