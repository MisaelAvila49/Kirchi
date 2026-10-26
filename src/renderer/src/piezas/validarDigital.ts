import { FAMILIAS } from '../netlist/familias'
import { leerValor } from '../valores/valores'
import type { PropDef } from './tipos'

/** Los modelos de las piezas digitales, el 555 y el display. */
export const MODELOS_DIGITALES = ['compuerta', 'biestable-d', 'biestable-jk', 'contador', 'decodificador', 'estado-logico', '555', 'display'] as const

/** Las claves de cada uno: una errata se rechaza en vez de ignorarse. */
export const CLAVES_DIGITALES: Record<string, string[]> = {
  compuerta: ['tipo', 'funcion', 'entradas', 'salida', 'familia', 'alimentacion'],
  'biestable-d': ['tipo', 'd', 'clk', 'pre', 'clr', 'q', 'qn', 'familia', 'alimentacion'],
  'biestable-jk': ['tipo', 'j', 'k', 'clk', 'pre', 'clr', 'q', 'qn', 'familia', 'alimentacion'],
  contador: ['tipo', 'clk', 'rst', 'q', 'co', 'hasta', 'familia', 'alimentacion'],
  decodificador: ['tipo', 'entradas', 'salidas', 'polaridad', 'bajo', 'familia', 'alimentacion'],
  'estado-logico': ['tipo', 'salida', 'prop', 'familia', 'alimentacion'],
  '555': ['tipo', 'gnd', 'trig', 'out', 'reset', 'cv', 'thr', 'dis', 'vcc', 'prop', 'modelos'],
  display: ['tipo', 'segmentos', 'comun', 'conexion', 'anodo', 'is', 'n', 'por', 'inom']
}

/** Los parámetros de cada modelo del 555 (los de `K555` en `engine/referencias/digital.lib`), y los que deben ser positivos. */
export const PARAMETROS_555 = ['rdiv', 'rq', 'vres', 'td', 'tr', 'tf', 'vlo', 'rlo', 'vhi', 'rhi', 'rdis', 'vmin', 'vmax'] as const
const POSITIVOS_555 = new Set<string>(['rdiv', 'rq', 'vres', 'td', 'tr', 'tf', 'rlo', 'rhi', 'rdis', 'vmin', 'vmax'])

const esObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v)
const enLista = (m: any, campo: string): [string, unknown][] => (Array.isArray(m[campo]) ? m[campo] : []).map((p: unknown, k: number) => [`${campo}[${k}]`, p])

/** Los pines que nombra un modelo, con el campo que los nombra (los de una lista llevan su posición). */
export function pinesDelModeloDigital(m: any): [string, unknown][] {
  const campos = (cs: string[]) => cs.map((c): [string, unknown] => [c, m[c]])
  switch (m.tipo) {
    case 'compuerta':
      return [...enLista(m, 'entradas'), ['salida', m.salida]]
    case 'biestable-d':
      return campos(['d', 'clk', 'pre', 'clr', 'q', 'qn'])
    case 'biestable-jk':
      return campos(['j', 'k', 'clk', 'pre', 'clr', 'q', 'qn'])
    case 'contador':
      return [['clk', m.clk], ['rst', m.rst], ...enLista(m, 'q'), ['co', m.co]]
    case 'decodificador':
      return [...enLista(m, 'entradas'), ...enLista(m, 'salidas')]
    case 'estado-logico':
      return [['salida', m.salida]]
    case '555':
      return campos(['gnd', 'trig', 'out', 'reset', 'cv', 'thr', 'dis', 'vcc'])
    default:
      return [...enLista(m, 'segmentos'), ['comun', m.comun]]
  }
}

/** Revisa un modelo; `err` recibe el campo y la oración, como el resto de `validarPieza`. */
export function validarModeloDigital(m: any, pinExiste: (id: unknown) => boolean, props: PropDef[], err: (campo: string, texto: string) => void): void {
  const pines = pinesDelModeloDigital(m)
  for (const [c, p] of pines) if (!pinExiste(p)) err(`modelo.${c}`, 'no es un pin de la pieza')
  if (new Set(pines.map((x) => x[1])).size !== pines.length) err('modelo', 'cada terminal debe ser un pin distinto')
  /** La propiedad de lista que nombra `campo`, o undefined (y el error) si no existe o no es de lista. */
  const lista = (campo: string): PropDef | undefined => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    else if (!q.opciones) err(`modelo.${campo}`, 'debe ser una propiedad de lista')
    return q?.opciones ? q : undefined
  }
  if (m.tipo !== '555' && m.tipo !== 'display') {
    const f = lista('familia')
    for (const o of f?.opciones ?? []) if (!Object.hasOwn(FAMILIAS.familias, o)) err('modelo.familia', `la opción «${o}» no es una familia de familias-logicas.json`)
    const a = lista('alimentacion')
    for (const o of a?.opciones ?? []) {
      const v = leerValor(o)
      if (!v || !(v.valor > 0) || (v.unidad !== undefined && v.unidad !== '' && v.unidad !== 'V')) err('modelo.alimentacion', `la opción «${o}» no es un voltaje positivo`)
    }
  }
  switch (m.tipo) {
    case 'compuerta': {
      const funciones = ['not', 'and', 'or', 'nand', 'nor', 'xor']
      if (!funciones.includes(m.funcion)) err('modelo.funcion', `debe ser una de ${funciones.join(', ')}`)
      else if (!Array.isArray(m.entradas) || m.entradas.length !== (m.funcion === 'not' ? 1 : 2)) err('modelo.entradas', m.funcion === 'not' ? 'debe tener una entrada' : 'debe tener dos entradas')
      break
    }
    case 'contador': {
      if (!Array.isArray(m.q) || m.q.length !== 4) err('modelo.q', 'debe tener las cuatro salidas Q0 a Q3')
      const h = lista('hasta')
      if (h && !h.opciones!.every((o) => o === '9' || o === '15')) err('modelo.hasta', 'sus opciones deben ser «9» o «15»')
      break
    }
    case 'decodificador': {
      if (!Array.isArray(m.entradas) || m.entradas.length !== 4) err('modelo.entradas', 'debe tener las cuatro entradas A a D')
      if (!Array.isArray(m.salidas) || m.salidas.length !== 7) err('modelo.salidas', 'debe tener las siete salidas a a g')
      const p = lista('polaridad')
      if (p && !p.opciones!.includes(m.bajo)) err('modelo.bajo', 'debe ser una de las opciones de la propiedad de polaridad')
      break
    }
    case 'estado-logico': {
      const p = lista('prop')
      if (p && (p.opciones!.length !== 2 || !p.opciones!.includes('0') || !p.opciones!.includes('1'))) err('modelo.prop', 'sus opciones deben ser «0» y «1»')
      break
    }
    case '555': {
      const p = lista('prop')
      if (!p) break
      if (!esObj(m.modelos)) {
        err('modelo.modelos', 'debe ser un objeto')
        break
      }
      for (const o of p.opciones!) {
        const v = m.modelos[o]
        if (!esObj(v)) {
          err(`modelo.modelos.${o}`, 'falta: cada opción de la propiedad necesita sus parámetros')
          continue
        }
        for (const k of PARAMETROS_555) {
          const x = v[k]
          if (typeof x !== 'number' || !Number.isFinite(x)) err(`modelo.modelos.${o}.${k}`, 'debe ser un número')
          else if (POSITIVOS_555.has(k) && !(x > 0)) err(`modelo.modelos.${o}.${k}`, 'debe ser positivo')
        }
        for (const k of Object.keys(v)) if (!(PARAMETROS_555 as readonly string[]).includes(k)) err(`modelo.modelos.${o}.${k}`, 'no es un parámetro del 555')
        if (typeof v.vmin === 'number' && typeof v.vmax === 'number' && !(v.vmin < v.vmax)) err(`modelo.modelos.${o}.vmin`, 'debe ser menor que vmax')
      }
      for (const k of Object.keys(m.modelos)) if (!p.opciones!.includes(k)) err(`modelo.modelos.${k}`, 'no es una de las opciones de la propiedad')
      break
    }
    case 'display': {
      if (!Array.isArray(m.segmentos) || m.segmentos.length !== 8) err('modelo.segmentos', 'debe tener los siete segmentos y el punto')
      const c = lista('conexion')
      if (c && !c.opciones!.includes(m.anodo)) err('modelo.anodo', 'debe ser una de las opciones de la propiedad de conexión')
      if (!(typeof m.is === 'number' && m.is > 0)) err('modelo.is', 'debe ser positivo')
      if (!(typeof m.n === 'number' && m.n > 0)) err('modelo.n', 'debe ser positivo')
      // La corriente nominal de cada segmento (el aviso de sobrecorriente).
      if (m.inom !== undefined && !(typeof m.inom === 'number' && Number.isFinite(m.inom) && m.inom > 0)) err('modelo.inom', 'debe ser una corriente positiva en A')
      if (m.por !== undefined) {
        const q = props.find((x) => x.id === m.por?.prop)
        if (!q?.opciones) err('modelo.por.prop', 'debe ser una propiedad de lista de la pieza')
        else if (!esObj(m.por.valores)) err('modelo.por.valores', 'debe ser un objeto')
        else
          for (const [k, v] of Object.entries(m.por.valores)) {
            if (!q.opciones.includes(k)) err(`modelo.por.valores.${k}`, 'no es una de las opciones de la propiedad')
            else if (!(esObj(v) && typeof v.is === 'number' && v.is > 0 && typeof v.n === 'number' && v.n > 0)) err(`modelo.por.valores.${k}`, 'debe tener is y n positivos')
          }
      }
      break
    }
  }
}
