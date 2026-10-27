import { nombreParecido, problemaDeParametro, type FamiliaParametros } from '../netlist/rangos'
import type { EnVivo, PropDef } from './tipos'

// Modelos con sensores, motor a pasos, puente H, fuentes controladas y PWL, más la perilla en vivo de una propiedad.

export const MODELOS_NUEVOS = ['jfet', 'termistor', 'ldr', 'pasos', 'puente-h', 'controlada', 'pwl'] as const

/** Las claves de cada uno: una errata se rechaza en vez de ignorarse. */
export const CLAVES_NUEVOS: Record<string, string[]> = {
  jfet: ['tipo', 'd', 'g', 's', 'pjf', 'prop', 'modelos'],
  termistor: ['tipo', 'a', 'b', 'ptc', 'prop', 'modelos', 'tablas', 'temperatura'],
  ldr: ['tipo', 'a', 'b', 'prop', 'modelos', 'luz'],
  pasos: ['tipo', 'nodos', 'unipolar', 'prop', 'modelos', 'carga'],
  'puente-h': ['tipo', 'entradas', 'habilita', 'salidas', 'sensa', 'sensb', 'vs', 'vss', 'gnd', 'prop', 'modelos'],
  controlada: ['tipo', 'forma', 'p', 'n', 'cp', 'cn', 'prop'],
  pwl: ['tipo', 'a', 'b', 'puntos', 'repetir', 'modo']
}

/** Cada magnitud de perilla con su unidad: el inspector y el motor la leen así. */
export const UNIDAD_DE_MAGNITUD: Record<EnVivo['magnitud'], string> = { temperatura: '°C', luz: 'lx', carga: 'N·m' }
const CLAVES_ENVIVO = ['magnitud', 'min', 'max', 'paso', 'pasoFino', 'escala']

type Err = (campo: string, texto: string) => void
const esObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v)
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Revisa `enVivo` de la propiedad `p` (campo `c`): claves cerradas, rango ordenado, pasos positivos, `log` solo con
 * `min` positivo, la unidad de su magnitud y un valor por omisión dentro del rango. */
export function validarEnVivo(p: any, c: string, err: Err): void {
  const v = p.enVivo
  if (!esObj(v)) return err(`${c}.enVivo`, 'debe ser un objeto con magnitud, min, max, paso y pasoFino')
  for (const k of Object.keys(v)) {
    if (CLAVES_ENVIVO.includes(k)) continue
    const parecida = nombreParecido(k, CLAVES_ENVIVO)
    err(`${c}.enVivo.${k}`, `clave desconocida${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
  }
  if (p.opciones !== undefined || p.texto === true) return err(`${c}.enVivo`, 'solo aplica a una propiedad numérica')
  const magnitudes = Object.keys(UNIDAD_DE_MAGNITUD)
  if (!magnitudes.includes(v.magnitud)) err(`${c}.enVivo.magnitud`, `debe ser ${magnitudes.slice(0, -1).join(', ')} o ${magnitudes[magnitudes.length - 1]}`)
  else if (p.unidad !== UNIDAD_DE_MAGNITUD[v.magnitud as EnVivo['magnitud']]) err(`${c}.enVivo.magnitud`, `«${v.magnitud}» pide la unidad «${UNIDAD_DE_MAGNITUD[v.magnitud as EnVivo['magnitud']]}» en la propiedad`)
  for (const k of ['min', 'max', 'paso', 'pasoFino']) if (!esNumero(v[k])) err(`${c}.enVivo.${k}`, 'debe ser un número')
  if (esNumero(v.min) && esNumero(v.max) && !(v.max > v.min)) err(`${c}.enVivo.max`, 'debe ser mayor que min')
  if (esNumero(v.paso) && !(v.paso > 0)) err(`${c}.enVivo.paso`, 'debe ser positivo')
  if (esNumero(v.pasoFino) && !(v.pasoFino > 0 && (!esNumero(v.paso) || v.pasoFino <= v.paso))) err(`${c}.enVivo.pasoFino`, 'debe ser positivo y no mayor que paso')
  if (v.escala !== undefined) {
    if (v.escala !== 'log') err(`${c}.enVivo.escala`, 'solo puede ser «log»')
    else if (!(esNumero(v.min) && v.min > 0)) err(`${c}.enVivo.escala`, 'solo aplica con min mayor que cero')
  }
}

/** Revisa uno de esos modelos; `err` recibe el campo y la oración, como el resto de `validarPieza`. */
export function validarModeloNuevo(m: any, pinExiste: (id: unknown) => boolean, props: PropDef[], err: Err): void {
  const pin = (campo: string, v: unknown = m[campo]) => {
    if (!pinExiste(v)) err(`modelo.${campo}`, 'no es un pin de la pieza')
  }
  /** Una lista de pines de la pieza con uno de los `largos`; `dicho` completa la oración del error. */
  const pines = (campo: string, largos: number[], dicho: string) => {
    const l = m[campo]
    if (!Array.isArray(l) || !largos.includes(l.length)) return void err(`modelo.${campo}`, dicho)
    l.forEach((p: unknown, k: number) => pin(`${campo}[${k}]`, p))
  }
  const distintos = (campos: string[]) => {
    if (new Set(campos.map((c) => m[c])).size !== campos.length) err('modelo', 'cada terminal debe ser un pin distinto')
  }
  const numerica = (campo: string) => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    else if (q.opciones || q.texto) err(`modelo.${campo}`, 'debe ser una propiedad numérica')
  }
  /** Una propiedad con perilla de esa magnitud (la que mueve el usuario simulando). */
  const perilla = (campo: string, magnitud: EnVivo['magnitud']) => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    else if (q.enVivo?.magnitud !== magnitud) err(`modelo.${campo}`, `debe ser una propiedad con perilla de ${magnitud}`)
  }
  const booleano = (campo: string, obligatorio: boolean) => {
    if (m[campo] === undefined ? obligatorio : typeof m[campo] !== 'boolean') err(`modelo.${campo}`, 'debe ser verdadero o falso')
  }
  /** El juego de parámetros por opción de `prop`; con `familia`, nombres y rangos de ngspice y los `obligatorios` presentes. */
  const modelos = (familia: FamiliaParametros | null, obligatorios: string[]) => {
    const prop = props.find((x) => x.id === m.prop)
    if (!prop) return void err('modelo.prop', 'no es una propiedad de la pieza')
    if (!prop.opciones) return void err('modelo.prop', 'debe ser una propiedad de lista')
    if (!esObj(m.modelos)) return void err('modelo.modelos', 'debe ser un objeto')
    for (const o of prop.opciones) {
      const v = m.modelos[o]
      if (!esObj(v)) {
        err(`modelo.modelos.${o}`, 'falta: cada opción de la propiedad necesita sus parámetros')
        continue
      }
      for (const k of obligatorios) if (v[k] === undefined) err(`modelo.modelos.${o}.${k}`, 'falta: el modelo necesita todos sus parámetros')
      for (const [k, x] of Object.entries(v)) {
        if (!esNumero(x)) err(`modelo.modelos.${o}.${k}`, 'debe ser un número')
        else if (familia) {
          const problema = problemaDeParametro(familia, k, x)
          if (problema) err(`modelo.modelos.${o}.${k}`, problema)
        }
      }
    }
    for (const k of Object.keys(m.modelos)) if (!prop.opciones.includes(k)) err(`modelo.modelos.${k}`, 'no es una de las opciones de la propiedad')
  }
  const lista = (campo: string, opciones?: number) => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    else if (!q.opciones || (opciones !== undefined && q.opciones.length !== opciones)) err(`modelo.${campo}`, opciones === undefined ? 'debe ser una propiedad de lista' : `debe ser una propiedad de lista de dos opciones`)
  }

  switch (m.tipo) {
    case 'jfet':
      for (const c of ['d', 'g', 's']) pin(c)
      distintos(['d', 'g', 's'])
      booleano('pjf', true)
      modelos('jfet', [])
      break
    case 'termistor': {
      for (const c of ['a', 'b']) pin(c)
      distintos(['a', 'b'])
      if (m.ptc !== undefined && m.ptc !== true) err('modelo.ptc', 'solo puede ser verdadero')
      modelos('termistor', PARAMETROS_TERMISTOR)
      perilla('temperatura', 'temperatura')
      if (m.tablas !== undefined) {
        if (!esObj(m.tablas)) err('modelo.tablas', 'debe ser un objeto con la tabla [°C, Ω] de cada opción')
        else
          for (const [o, t] of Object.entries(m.tablas)) {
            const ok = Array.isArray(t) && t.length >= 2 && t.length <= 256 && t.every((f) => Array.isArray(f) && f.length === 2 && esNumero(f[0]) && esNumero(f[1]) && f[1] > 0)
            if (!ok) err(`modelo.tablas.${o}`, 'debe tener de 2 a 256 pares [°C, Ω] con resistencias positivas')
            else if (t.some((f: number[], i: number) => i > 0 && !(f[0] > t[i - 1][0]))) err(`modelo.tablas.${o}`, 'debe tener temperaturas crecientes')
          }
      }
      break
    }
    case 'ldr':
      for (const c of ['a', 'b']) pin(c)
      distintos(['a', 'b'])
      modelos('ldr', ['r10', 'gamma', 'roscuro', 'tau_sube', 'tau_baja'])
      perilla('luz', 'luz')
      break
    case 'pasos': {
      pines('nodos', [4, 6], 'debe tener 4 pines (bipolar) o 6 (unipolar)')
      if (m.unipolar !== undefined && m.unipolar !== true) err('modelo.unipolar', 'solo puede ser verdadero')
      else if (Array.isArray(m.nodos) && [4, 6].includes(m.nodos.length) && (m.nodos.length === 6) !== (m.unipolar === true)) err('modelo.nodos', m.unipolar === true ? 'debe tener 6 pines con unipolar' : 'debe tener 4 pines sin unipolar')
      modelos('pasos', PARAMETROS_PASOS)
      if (m.carga !== undefined) perilla('carga', 'carga')
      break
    }
    case 'puente-h':
      pines('entradas', [4], 'debe ser una lista de 4 pines')
      pines('habilita', [2], 'debe ser una lista de 2 pines')
      pines('salidas', [4], 'debe ser una lista de 4 pines')
      for (const c of ['sensa', 'sensb', 'vs', 'vss', 'gnd']) pin(c)
      modelos(null, [])
      break
    case 'controlada':
      if (!['E', 'G', 'H', 'F'].includes(m.forma)) err('modelo.forma', 'debe ser E, G, H o F')
      for (const c of ['p', 'n', 'cp', 'cn']) pin(c)
      if (m.p === m.n) err('modelo.n', 'debe ser distinto de modelo.p')
      if (m.cp === m.cn) err('modelo.cn', 'debe ser distinto de modelo.cp')
      numerica('prop')
      break
    case 'pwl': {
      for (const c of ['a', 'b']) pin(c)
      distintos(['a', 'b'])
      const q = props.find((x) => x.id === m.puntos)
      if (!q) err('modelo.puntos', 'no es una propiedad de la pieza')
      else if (!q.texto) err('modelo.puntos', 'debe ser una propiedad de texto (con "texto": true)')
      lista('repetir', 2)
      lista('modo')
      break
    }
  }
}

/** Los parámetros que el motor exige sin valor por omisión. */
const PARAMETROS_TERMISTOR = ['r25', 'beta', 'delta', 'tau', 'tmax']
const PARAMETROS_PASOS = ['r', 'l', 'km', 'dientes', 'td', 'j', 'bm']
