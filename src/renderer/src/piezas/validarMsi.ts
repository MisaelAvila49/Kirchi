import { FAMILIAS } from '../netlist/familias'
import { nombreParecido } from '../netlist/rangos'
import { leerValor } from '../valores/valores'
import { generar } from './generadores'
import { compilarTabla, MAX_BITS_TABLA, type TablaDef } from './tablaVerdad'
import type { PropDef, RetardosPorFamilia } from './tipos'

/** Los modelos de la lógica MSI, los convertidores y las entradas para lógica. */
export const MODELOS_MSI = ['lut', 'msi', 'convertidor-ad', 'convertidor-da', 'interruptores', 'teclado'] as const

/** Las claves de cada uno: una errata se rechaza en vez de ignorarse. */
export const CLAVES_MSI: Record<string, string[]> = {
  lut: ['tipo', 'familia', 'alimentacion', 'comunes', 'rebanadas', 'bidireccionales', 'abiertas', 'tabla', 'generar', 'retardos'],
  msi: ['tipo', 'familia', 'alimentacion', 'nucleo', 'salidas', 'abiertas', 'tabla', 'retardos'],
  'convertidor-ad': ['tipo', 'cs', 'rd', 'wr', 'clkin', 'clkr', 'intr', 'vinp', 'vinn', 'agnd', 'vref2', 'dgnd', 'vcc', 'db', 'vil', 'vih', 'vtp', 'vtn', 'voh', 'vol', 'rref', 'r_lo', 'r_hi', 'ciclos_inicio', 'ciclos_bit', 't_acceso', 't_intr'],
  'convertidor-da': ['tipo', 'a', 'io', 'gnd', 'vee', 'vcc', 'vrefp', 'vrefn', 'comp', 'vil', 'vih', 't_asentamiento'],
  interruptores: ['tipo', 'contactos', 'estado', 'r_on', 'r_off'],
  teclado: ['tipo', 'filas', 'columnas', 'r_on', 'r_off', 'rebote']
}

const CLAVES_TABLA = ['columnas', 'salidas', 'filas']
const CLAVES_NUCLEO: Record<string, string[]> = {
  contador: ['tipo', 'bits', 'modulo', 'reloj', 'abajo', 'sentido', 'habilita', 'borra', 'carga'],
  desplazamiento: ['tipo', 'bits', 'reloj', 'serie', 'borra', 'carga', 'almacen']
}
const CLAVES_RELOJ = ['senales', 'combina', 'flanco']
const CLAVES_ACCION = ['senal', 'sincrona']
const CLAVES_CARGA = ['senal', 'sincrona', 'datos']
const CLAVES_GENERAR: Record<string, string[]> = {
  suma: ['tipo', 'a', 'b', 'acarreo', 'suma', 'salida_acarreo'],
  compara: ['tipo', 'a', 'b', 'cascada', 'salidas']
}
const CLAVES_CAJA = ['titulo', 'forma', 'izquierda', 'derecha', 'arriba', 'abajo', 'ancho', 'marcas']
const MARCAS = ['bajo', 'dinamico', 'z', 'oc']

type Err = (campo: string, texto: string) => void
const esObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v)
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esPositivo = (v: unknown): v is number => esNumero(v) && v > 0

/** Revisa que un objeto no traiga claves ajenas; sugiere la parecida. */
function clavesCerradas(o: Record<string, any>, validas: readonly string[], campo: string, err: Err): void {
  for (const k of Object.keys(o)) {
    if (validas.includes(k)) continue
    const parecida = nombreParecido(k, validas)
    err(`${campo}.${k}`, `clave desconocida${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
  }
}

/** El retardo de una salida: su nombre exacto, el patrón con `*` de prefijo más largo («Q*») y por último «*». */
export function retardoDe(retardos: Record<string, number | [number, number]>, salida: string): [number, number] | null {
  const dar = (v: number | [number, number] | undefined): [number, number] | null => (v === undefined ? null : typeof v === 'number' ? [v, v] : v)
  if (Object.hasOwn(retardos, salida) && salida !== 'vcc') return dar(retardos[salida])
  let mejor = ''
  for (const k of Object.keys(retardos)) if (k.length > 1 && k.endsWith('*') && salida.startsWith(k.slice(0, -1)) && k.length > mejor.length) mejor = k
  if (mejor) return dar(retardos[mejor])
  return dar(retardos['*'])
}

/** Los pines de un modelo lut o msi, entradas primero: en un lut con rebanadas, los comunes y luego los de cada rebanada
 * (un pin bidireccional va en las dos listas). Es el orden de `entradas` y `salidas` de los elementos del motor. */
export function pinesDelModeloMsi(m: any): { entradas: string[]; salidas: string[] } {
  const tabla = tablaDelModelo(m)
  if (m.tipo === 'lut') {
    const comunes: string[] = m.comunes ?? []
    if (!Array.isArray(m.rebanadas)) {
      const col = tabla?.columnas ?? comunes
      return { entradas: [...col], salidas: [...(tabla?.salidas ?? [])] }
    }
    const locales = (cols: string[]) => cols.filter((c) => !comunes.includes(c))
    const entradas = [...comunes]
    const salidas: string[] = []
    for (const r of m.rebanadas as Record<string, string>[]) {
      entradas.push(...locales(tabla?.columnas ?? []).map((n) => r[n]))
      salidas.push(...(tabla?.salidas ?? []).map((n) => r[n]))
    }
    return { entradas, salidas }
  }
  const n = m.nucleo ?? {}
  const reloj = (r: any): string[] => (r?.senales ?? []).map(sinBajo)
  const entradas = [
    ...reloj(n.reloj), ...reloj(n.abajo), ...reloj(n.almacen),
    ...(n.sentido ? [sinBajo(n.sentido) as string] : []),
    ...(n.habilita ?? []).map(sinBajo), ...(n.serie ?? []).map(sinBajo),
    ...(n.borra ? [sinBajo(n.borra.senal) as string] : []),
    ...(n.carga ? [sinBajo(n.carga.senal) as string, ...n.carga.datos] : []),
    ...(tabla?.columnas ?? []).filter((c) => c !== 'estado' && !/^[qa]\d+$/.test(c))
  ]
  return { entradas: [...new Set(entradas)], salidas: Object.keys(m.salidas ?? {}) }
}

/** La tabla de un modelo lut o msi: la escrita o la que da `generar`. */
export function tablaDelModelo(m: any): TablaDef | null {
  if (esObj(m.tabla)) return m.tabla
  if (esObj(m.generar) && Object.hasOwn(CLAVES_GENERAR, m.generar.tipo)) return generar(m.generar)
  return null
}

/** Los pines que nombra un reloj, una acción o una carga (con o sin `!`). */
const sinBajo = (s: unknown) => (typeof s === 'string' && s.startsWith('!') ? s.slice(1) : s)

/** Revisa un modelo de la lógica MSI; `err` recibe el campo y la oración. `pinIds` son todos los pines de la pieza. */
export function validarModeloMsi(m: any, pinExiste: (id: unknown) => boolean, props: PropDef[], err: Err, pinIds: string[]): void {
  const pin = (campo: string, v: unknown) => {
    if (!pinExiste(v)) err(`modelo.${campo}`, 'no es un pin de la pieza')
  }
  const numero = (campo: string) => {
    if (!esPositivo(m[campo])) err(`modelo.${campo}`, 'debe ser un número positivo')
  }
  const propiedad = (campo: string, tipo: 'lista' | 'texto') => {
    const q = props.find((x) => x.id === m[campo])
    if (!q) err(`modelo.${campo}`, 'no es una propiedad de la pieza')
    else if (tipo === 'lista' && !q.opciones) err(`modelo.${campo}`, 'debe ser una propiedad de lista')
    else if (tipo === 'texto' && q.texto !== true) err(`modelo.${campo}`, 'debe ser una propiedad de texto')
    return q
  }
  const pinesDistintos = (ids: unknown[], campo: string) => {
    if (new Set(ids).size !== ids.length) err(campo ? `modelo.${campo}` : 'modelo', 'cada pin debe aparecer una sola vez')
  }

  switch (m.tipo) {
    case 'convertidor-ad': {
      const unos = ['cs', 'rd', 'wr', 'clkin', 'clkr', 'intr', 'vinp', 'vinn', 'agnd', 'vref2', 'dgnd', 'vcc']
      for (const c of unos) pin(c, m[c])
      if (!Array.isArray(m.db) || m.db.length !== 8) err('modelo.db', 'debe tener los ocho pines DB0 a DB7, el bit 0 primero')
      else m.db.forEach((p: unknown, k: number) => pin(`db[${k}]`, p))
      pinesDistintos([...unos.map((c) => m[c]), ...(Array.isArray(m.db) ? m.db : [])], '')
      for (const c of ['vil', 'vih', 'vtp', 'vtn', 'voh', 'rref', 'r_lo', 'r_hi', 'ciclos_inicio', 'ciclos_bit', 't_acceso', 't_intr']) numero(c)
      if (!esNumero(m.vol) || m.vol < 0) err('modelo.vol', 'debe ser cero o positivo')
      if (esNumero(m.vil) && esNumero(m.vih) && !(m.vil < m.vih)) err('modelo.vil', 'debe ser menor que vih')
      if (esNumero(m.vtn) && esNumero(m.vtp) && !(m.vtn < m.vtp)) err('modelo.vtn', 'debe ser menor que vtp')
      return
    }
    case 'convertidor-da': {
      for (const c of ['io', 'gnd', 'vee', 'vcc', 'vrefp', 'vrefn', 'comp']) pin(c, m[c])
      if (!Array.isArray(m.a) || m.a.length !== 8) err('modelo.a', 'debe tener los ocho pines A1 a A8, el más significativo primero')
      else m.a.forEach((p: unknown, k: number) => pin(`a[${k}]`, p))
      pinesDistintos([...['io', 'gnd', 'vee', 'vcc', 'vrefp', 'vrefn', 'comp'].map((c) => m[c]), ...(Array.isArray(m.a) ? m.a : [])], '')
      for (const c of ['vil', 'vih', 't_asentamiento']) numero(c)
      if (esNumero(m.vil) && esNumero(m.vih) && !(m.vil < m.vih)) err('modelo.vil', 'debe ser menor que vih')
      return
    }
    case 'interruptores': {
      propiedad('estado', 'texto')
      numero('r_on')
      numero('r_off')
      if (esNumero(m.r_on) && esNumero(m.r_off) && !(m.r_on < m.r_off)) err('modelo.r_on', 'debe ser menor que r_off')
      if (!Array.isArray(m.contactos) || m.contactos.length === 0) return void err('modelo.contactos', 'debe ser una lista de pares de pines')
      const todos: unknown[] = []
      m.contactos.forEach((c: unknown, k: number) => {
        if (!Array.isArray(c) || c.length !== 2) return void err(`modelo.contactos[${k}]`, 'debe ser un par de pines')
        c.forEach((p, j) => pin(`contactos[${k}][${j}]`, p))
        todos.push(...c)
      })
      pinesDistintos(todos, 'contactos')
      return
    }
    case 'teclado': {
      numero('r_on')
      numero('r_off')
      if (esNumero(m.r_on) && esNumero(m.r_off) && !(m.r_on < m.r_off)) err('modelo.r_on', 'debe ser menor que r_off')
      if (m.rebote !== undefined) propiedad('rebote', 'lista')
      const todos: unknown[] = []
      for (const lado of ['filas', 'columnas']) {
        if (!Array.isArray(m[lado]) || m[lado].length === 0) err(`modelo.${lado}`, 'debe ser una lista de pines')
        else {
          m[lado].forEach((p: unknown, k: number) => pin(`${lado}[${k}]`, p))
          todos.push(...m[lado])
        }
      }
      pinesDistintos(todos, '')
      return
    }
  }

  // lut y msi: familia, alimentación, tabla, salidas y retardos.
  const lista = (campo: 'familia' | 'alimentacion') => {
    const q = propiedad(campo, 'lista')
    return q?.opciones ? q : undefined
  }
  const f = lista('familia')
  for (const o of f?.opciones ?? []) if (!Object.hasOwn(FAMILIAS.familias, o)) err('modelo.familia', `la opción «${o}» no es una familia de familias-logicas.json`)
  for (const o of lista('alimentacion')?.opciones ?? []) {
    const v = leerValor(o)
    if (!v || !(v.valor > 0) || (v.unidad !== undefined && v.unidad !== '' && v.unidad !== 'V')) err('modelo.alimentacion', `la opción «${o}» no es un voltaje positivo`)
  }

  const usados = new Set<string>()
  let nombres: string[] = pinIds
  let bitsEstado: number | undefined
  let bidireccionales: string[] = []
  let columnasComunes: string[] | undefined
  const localDe = new Map<string, string>()
  const compartidas: [number, string][] = []

  if (m.tipo === 'lut') {
    if (!Array.isArray(m.comunes) || !m.comunes.every(esTexto)) err('modelo.comunes', 'debe ser una lista de nombres de columnas')
    const comunes: string[] = Array.isArray(m.comunes) ? m.comunes : []
    columnasComunes = comunes
    if (m.rebanadas === undefined) {
      comunes.forEach((p, k) => pin(`comunes[${k}]`, p))
    } else if (!Array.isArray(m.rebanadas) || m.rebanadas.length === 0) err('modelo.rebanadas', 'debe ser una lista de objetos de nombre local a pin')
    else {
      const locales = esObj(m.rebanadas[0]) ? Object.keys(m.rebanadas[0]) : []
      m.rebanadas.forEach((r: unknown, k: number) => {
        if (!esObj(r)) return void err(`modelo.rebanadas[${k}]`, 'debe ser un objeto de nombre local a pin')
        const mios = Object.keys(r)
        if (mios.length !== locales.length || mios.some((n) => !locales.includes(n))) err(`modelo.rebanadas[${k}]`, 'debe tener los mismos nombres locales que la primera rebanada')
        for (const [n, p] of Object.entries(r)) {
          pin(`rebanadas[${k}].${n}`, p)
          // Una entrada puede repetirse con el mismo nombre local (el 1OE de las cuatro rebanadas del 244); una salida no.
          if (usados.has(p as string)) {
            if (localDe.get(p as string) === n) compartidas.push([k, n])
            else err(`modelo.rebanadas[${k}].${n}`, `el pin ${p} ya está en otra rebanada`)
          }
          localDe.set(p as string, n)
          usados.add(p as string)
        }
      })
      nombres = [...comunes, ...locales]
      comunes.forEach((p, k) => pin(`comunes[${k}]`, p))
    }
    comunes.forEach((p) => usados.add(p))
    if (m.bidireccionales !== undefined && (!Array.isArray(m.bidireccionales) || !m.bidireccionales.every(esTexto))) err('modelo.bidireccionales', 'debe ser una lista de nombres')
    bidireccionales = Array.isArray(m.bidireccionales) ? m.bidireccionales : []
  } else {
    // msi
    if (!esObj(m.nucleo)) err('modelo.nucleo', 'debe ser un objeto con tipo contador o desplazamiento')
    else {
      const n = m.nucleo
      if (!Object.hasOwn(CLAVES_NUCLEO, n.tipo)) err('modelo.nucleo.tipo', 'debe ser «contador» o «desplazamiento»')
      else {
        clavesCerradas(n, CLAVES_NUCLEO[n.tipo], 'modelo.nucleo', err)
        if (!Number.isInteger(n.bits) || n.bits < 1 || n.bits > 16) err('modelo.nucleo.bits', 'debe ser un entero de 1 a 16')
        else bitsEstado = n.bits
        if (n.tipo === 'contador' && !(Number.isInteger(n.modulo) && n.modulo >= 2 && (bitsEstado === undefined || n.modulo <= 2 ** bitsEstado))) err('modelo.nucleo.modulo', 'debe ser un entero de 2 a 2^bits')
        const senal = (campo: string, s: unknown) => {
          if (!esTexto(s) || !pinExiste(sinBajo(s))) err(`modelo.nucleo.${campo}`, 'no es un pin de la pieza (con ! delante si es activo en bajo)')
          else usados.add(sinBajo(s) as string)
        }
        const reloj = (campo: string, r: unknown) => {
          if (!esObj(r)) return void err(`modelo.nucleo.${campo}`, 'debe ser un objeto con señales y flanco')
          clavesCerradas(r, CLAVES_RELOJ, `modelo.nucleo.${campo}`, err)
          if (!Array.isArray(r.senales) || r.senales.length === 0) err(`modelo.nucleo.${campo}.senales`, 'debe tener al menos una señal')
          else r.senales.forEach((s: unknown, k: number) => senal(`${campo}.senales[${k}]`, s))
          if (r.combina !== undefined && r.combina !== 'Y' && r.combina !== 'O') err(`modelo.nucleo.${campo}.combina`, 'debe ser «Y» u «O»')
          if (r.flanco !== undefined && r.flanco !== 'subida' && r.flanco !== 'bajada') err(`modelo.nucleo.${campo}.flanco`, 'debe ser «subida» o «bajada»')
        }
        const accion = (campo: string, a: unknown, claves: string[]) => {
          if (!esObj(a)) return void err(`modelo.nucleo.${campo}`, 'debe ser un objeto con señal')
          clavesCerradas(a, claves, `modelo.nucleo.${campo}`, err)
          senal(`${campo}.senal`, a.senal)
          if (a.sincrona !== undefined && typeof a.sincrona !== 'boolean') err(`modelo.nucleo.${campo}.sincrona`, 'debe ser verdadero o falso')
          if (claves.includes('datos')) {
            if (!Array.isArray(a.datos) || (bitsEstado !== undefined && a.datos.length !== bitsEstado)) err(`modelo.nucleo.${campo}.datos`, `debe tener un pin por bit (${bitsEstado ?? 'bits'})`)
            else a.datos.forEach((s: unknown, k: number) => (pinExiste(s) ? usados.add(s as string) : err(`modelo.nucleo.${campo}.datos[${k}]`, 'no es un pin de la pieza')))
          }
        }
        reloj('reloj', n.reloj)
        if (n.abajo !== undefined) reloj('abajo', n.abajo)
        if (n.almacen !== undefined) reloj('almacen', n.almacen)
        if (n.sentido !== undefined) senal('sentido', n.sentido)
        for (const campo of ['habilita', 'serie'] as const)
          if (n[campo] !== undefined) {
            if (!Array.isArray(n[campo])) err(`modelo.nucleo.${campo}`, 'debe ser una lista de señales')
            else n[campo].forEach((s: unknown, k: number) => senal(`${campo}[${k}]`, s))
          }
        if (n.borra !== undefined) accion('borra', n.borra, CLAVES_ACCION)
        if (n.carga !== undefined) accion('carga', n.carga, CLAVES_CARGA)
      }
    }
    if (!esObj(m.salidas)) err('modelo.salidas', 'debe ser un objeto de pin a q3, !q3, a2 o tabla')
    else
      for (const [p, v] of Object.entries(m.salidas)) {
        pin(`salidas.${p}`, p)
        usados.add(p)
        const k = typeof v === 'string' ? /^!?([qa])(\d+)$/.exec(v) : null
        if (v === 'tabla') continue
        if (!k) err(`modelo.salidas.${p}`, 'debe ser q3, !q3, a2 (registro auxiliar) o tabla')
        else if (bitsEstado !== undefined && Number(k[2]) >= bitsEstado) err(`modelo.salidas.${p}`, `el registro tiene ${bitsEstado} bits`)
      }
  }

  // La tabla: escrita o generada, con claves cerradas y compilable.
  if (m.tabla !== undefined && m.generar !== undefined) err('modelo.generar', 'no va junto con tabla')
  if (m.tabla !== undefined) {
    if (!esObj(m.tabla)) err('modelo.tabla', 'debe ser un objeto con columnas, salidas y filas')
    else clavesCerradas(m.tabla, CLAVES_TABLA, 'modelo.tabla', err)
  }
  if (m.generar !== undefined) {
    if (m.tipo !== 'lut') err('modelo.generar', 'solo lo lleva un modelo lut')
    else if (!esObj(m.generar) || !Object.hasOwn(CLAVES_GENERAR, m.generar.tipo)) err('modelo.generar.tipo', 'debe ser «suma» o «compara»')
    else clavesCerradas(m.generar, CLAVES_GENERAR[m.generar.tipo], 'modelo.generar', err)
  }
  const tabla = esObj(m.tabla) || (esObj(m.generar) && Object.hasOwn(CLAVES_GENERAR, m.generar.tipo)) ? tablaDelModelo(m) : null
  if (m.tabla === undefined && m.generar === undefined && m.tipo === 'lut') err('modelo.tabla', 'falta: una pieza lut lleva tabla o generar')
  if (tabla && Array.isArray(tabla.columnas) && Array.isArray(tabla.salidas) && Array.isArray(tabla.filas)) {
    if (m.tipo === 'lut' && columnasComunes) {
      if (columnasComunes.some((c, k) => tabla.columnas[k] !== c)) err('modelo.tabla.columnas', 'deben empezar por las columnas de modelo.comunes, en el mismo orden')
      for (const b of bidireccionales) if (!tabla.columnas.includes(b) || !tabla.salidas.includes(b)) err('modelo.bidireccionales', `«${b}» debe ser columna y salida de la tabla`)
      for (const c of tabla.columnas) if (tabla.salidas.includes(c) && !bidireccionales.includes(c)) err('modelo.bidireccionales', `«${c}» es entrada y salida de la tabla: decláralo en bidireccionales`)
    }
    if (m.tipo === 'msi' && esObj(m.salidas))
      for (const s of tabla.salidas) {
        if (m.salidas[s] !== 'tabla') err('modelo.salidas', `«${s}» está en la tabla: su valor debe ser «tabla»`)
        usados.add(s)
      }
    if (m.tipo === 'msi' && esObj(m.salidas))
      for (const [p, v] of Object.entries(m.salidas)) if (v === 'tabla' && !tabla.salidas.includes(p)) err(`modelo.salidas.${p}`, 'dice «tabla» pero la tabla no tiene esa salida')
    for (const [k, n] of compartidas) if (tabla.salidas.includes(n)) err(`modelo.rebanadas[${k}].${n}`, 'una salida no puede repetirse en otra rebanada')
    tabla.columnas.forEach((c) => usados.add(c))
    tabla.salidas.forEach((c) => usados.add(c))
    const ancho = tabla.columnas.reduce((a, c) => a + (c === 'estado' ? (bitsEstado ?? 1) : 1), 0)
    if (ancho > MAX_BITS_TABLA) err('modelo.tabla', `tiene ${ancho} bits de entrada y el máximo es ${MAX_BITS_TABLA}`)
    else {
      const r = compilarTabla(tabla, nombres, { ...(bitsEstado !== undefined ? { bitsEstado } : {}), bidireccionales })
      for (const e of r.errores) err('modelo.tabla', e)
    }
    if (m.abiertas !== undefined) {
      if (!Array.isArray(m.abiertas) || !m.abiertas.every((a: unknown) => tabla.salidas.includes(a as string))) err('modelo.abiertas', 'debe ser una lista de salidas de la tabla')
    }
  } else if (m.tipo === 'msi' && m.tabla === undefined && esObj(m.salidas) && Object.values(m.salidas).includes('tabla')) err('modelo.tabla', 'falta: hay salidas con valor «tabla»')

  // Cada pin de la pieza aparece en el modelo (los nombres locales de una rebanada cuentan por sus pines).
  if (m.tipo === 'lut' && Array.isArray(m.rebanadas)) for (const r of m.rebanadas) if (esObj(r)) for (const p of Object.values(r)) usados.add(p as string)
  if (m.tipo === 'lut' && m.rebanadas === undefined && tabla) [...tabla.columnas, ...tabla.salidas].forEach((c) => usados.add(c))
  for (const p of pinIds) if (!usados.has(p)) err('modelo', `el pin ${p} no aparece en el modelo`)

  // Un retardo por cada opción de familia, y que cubra cada salida.
  if (!esObj(m.retardos)) return void err('modelo.retardos', 'debe ser un objeto con un juego de retardos por familia')
  const retardos = m.retardos as RetardosPorFamilia
  for (const o of f?.opciones ?? []) if (!esObj(retardos[o])) err(`modelo.retardos.${o}`, 'falta: cada opción de familia necesita sus retardos')
  for (const k of Object.keys(retardos)) if (f && !f.opciones!.includes(k)) err(`modelo.retardos.${k}`, 'no es una de las opciones de familia')
  const salidasDe = m.tipo === 'msi' && esObj(m.salidas) ? Object.keys(m.salidas) : (tabla?.salidas ?? [])
  for (const [fam, juego] of Object.entries(retardos)) {
    if (!esObj(juego)) continue
    if (!esPositivo(juego.vcc)) err(`modelo.retardos.${fam}.vcc`, 'debe ser la alimentación de la hoja, positiva')
    for (const [k, v] of Object.entries(juego)) {
      if (k === 'vcc') continue
      const ok = esPositivo(v) || (Array.isArray(v) && v.length === 2 && v.every(esPositivo))
      if (!ok) err(`modelo.retardos.${fam}.${k}`, 'debe ser un tiempo positivo o [subida, bajada]')
    }
    for (const s of salidasDe) if (!retardoDe(juego as Record<string, number | [number, number]>, s)) err(`modelo.retardos.${fam}`, `falta el retardo de ${s} (o un «*»)`)
  }
}

/** Revisa la clave `caja`: claves cerradas con sugerencia, forma, pines y marcas. El dibujo lo valida el generador. */
export function validarCaja(caja: unknown, pinExiste: (id: unknown) => boolean, err: Err): void {
  if (!esObj(caja)) return void err('caja', 'debe ser un objeto')
  clavesCerradas(caja, CLAVES_CAJA, 'caja', err)
  if (caja.forma !== 'funcional' && caja.forma !== 'dip') err('caja.forma', 'debe ser «funcional» o «dip»')
  if (caja.titulo !== undefined && !esTexto(caja.titulo)) err('caja.titulo', 'debe ser un texto')
  if (caja.ancho !== undefined && !(Number.isInteger(caja.ancho) && caja.ancho > 0)) err('caja.ancho', 'debe ser un entero positivo')
  for (const lado of ['izquierda', 'derecha', 'arriba', 'abajo']) {
    if (caja[lado] === undefined) continue
    if (!Array.isArray(caja[lado])) err(`caja.${lado}`, 'debe ser una lista')
    else caja[lado].forEach((e: unknown, k: number) => e !== null && !pinExiste(sinBajo(e)) && err(`caja.${lado}[${k}]`, `«${String(e)}» no es un pin de la pieza`))
  }
  if (caja.marcas !== undefined) {
    if (!esObj(caja.marcas)) return void err('caja.marcas', 'debe ser un objeto de pin a lista de marcas')
    for (const [id, lista] of Object.entries(caja.marcas)) {
      if (!pinExiste(id)) err(`caja.marcas.${id}`, 'no es un pin de la pieza')
      if (!Array.isArray(lista)) err(`caja.marcas.${id}`, 'debe ser una lista')
      else
        for (const x of lista)
          if (!MARCAS.includes(x)) {
            const parecida = nombreParecido(String(x), MARCAS)
            err(`caja.marcas.${id}`, `«${x}» no es una marca (${MARCAS.join(', ')})${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
          }
    }
  }
}
