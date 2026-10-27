import { nombreParecido } from '../netlist/rangos'
import { ENCAPSULADOS, ID_KICAD } from './encapsulados'
import { FORMATOS_EQUIVALENCIA, type DatosPieza, type FilaDatos, type PiezaDef, type PinDef, type PropDef } from './tipos'

type Err = (campo: string, msg: string) => void

const CLAVES_DATOS = ['por', 'equivalencias', 'valores']
const CLAVES_FILA = ['virtual', 'fabricante', 'parte', 'hoja', 'aproximada', 'equivalencias', 'presentaciones', 'pendiente', 'comprobado', 'nota']
const CLAVES_PRESENTACION = ['encapsulado', 'patillas', 'alimentacion', 'sinModelo', 'unidades', 'huella', 'parte', 'lcsc', 'representativa', 'protoboard']
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const LCSC = /^C\d{1,9}$/

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const lista = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v])

/** Rechaza las claves ajenas de un objeto y sugiere la más parecida. */
function cerrar(o: Record<string, unknown>, permitidas: readonly string[], donde: string, err: Err, que: string): void {
  for (const k of Object.keys(o)) {
    if (permitidas.includes(k)) continue
    const parecida = nombreParecido(k, permitidas)
    err(`${donde}.${k}`, `clave desconocida en ${que}${parecida ? `, ¿quisiste decir «${parecida}»?` : ''}`)
  }
}

/** Una patilla o una lista de patillas (un pin conectado a varias). */
const esPatillas = (v: unknown): v is string | string[] => esTexto(v) || (Array.isArray(v) && v.length > 0 && v.every(esTexto))

function validarEquivalencias(e: unknown, donde: string, err: Err): void {
  if (!esObjeto(e)) return void err(donde, 'debe ser un objeto')
  cerrar(e, [...FORMATOS_EQUIVALENCIA, 'sinVerificar'], donde, err, 'las equivalencias')
  for (const f of FORMATOS_EQUIVALENCIA) {
    const v = e[f]
    if (v === undefined) continue
    if (!esPatillas(v)) err(`${donde}.${f}`, 'debe ser un nombre o una lista de nombres')
    else if (f === 'kicad' && !lista(v).every((x) => ID_KICAD.test(x))) err(`${donde}.kicad`, 'debe ser un id de KiCad «Biblioteca:Nombre»')
  }
  const s = e.sinVerificar
  if (s !== undefined && !(Array.isArray(s) && s.every((x) => (FORMATOS_EQUIVALENCIA as readonly string[]).includes(x as string) && e[x as string] !== undefined)))
    err(`${donde}.sinVerificar`, `debe ser una lista de formatos de esta misma equivalencia (${FORMATOS_EQUIVALENCIA.join(', ')})`)
}

/** Las patillas físicas que usa una presentación, una sola vez cada una: patillas, alimentación, patillas sin modelo y unidades
 * distintas de la primera. */
function patillasUsadas(p: Record<string, unknown>): string[] {
  const usadas: string[] = []
  for (const campo of ['patillas', 'alimentacion']) {
    const o = p[campo]
    if (esObjeto(o)) for (const v of Object.values(o)) if (esPatillas(v)) usadas.push(...lista(v))
  }
  if (esObjeto(p.sinModelo)) usadas.push(...Object.keys(p.sinModelo))
  if (Array.isArray(p.unidades)) for (const u of p.unidades.slice(1)) if (esObjeto(u) && esObjeto(u.patillas)) usadas.push(...Object.values(u.patillas).filter(esTexto))
  return usadas
}

function validarPresentacion(p: unknown, donde: string, fila: Record<string, unknown>, err: Err): void {
  if (!esObjeto(p)) return void err(donde, 'debe ser un objeto')
  cerrar(p, CLAVES_PRESENTACION, donde, err, 'una presentación')
  const enc = typeof p.encapsulado === 'string' ? ENCAPSULADOS.get(p.encapsulado) : undefined
  if (!esTexto(p.encapsulado)) err(`${donde}.encapsulado`, 'es obligatorio')
  else if (!enc) {
    const ids = [...ENCAPSULADOS.keys()]
    const minuscula = nombreParecido(p.encapsulado, ids.map((x) => x.toLowerCase()))
    const parecido = ids.find((x) => x.toLowerCase() === minuscula)
    err(`${donde}.encapsulado`, `«${p.encapsulado}» no está en componentes/encapsulados.json${parecido ? `, ¿quisiste decir «${parecido}»?` : ''}`)
  }
  if (!esObjeto(p.patillas) || !Object.values(p.patillas).every(esPatillas)) err(`${donde}.patillas`, 'debe ser un objeto de id de pin a patilla (o lista de patillas)')
  if (p.alimentacion !== undefined && (!esObjeto(p.alimentacion) || !Object.values(p.alimentacion).every(esPatillas))) err(`${donde}.alimentacion`, 'debe ser un objeto de red a patilla (o lista de patillas)')
  if (p.sinModelo !== undefined && (!esObjeto(p.sinModelo) || !Object.values(p.sinModelo).every(esTexto))) err(`${donde}.sinModelo`, 'debe ser un objeto de patilla a texto')
  if (p.unidades !== undefined) {
    const u = p.unidades
    if (!Array.isArray(u) || u.length === 0) err(`${donde}.unidades`, 'debe ser una lista con al menos una unidad')
    else {
      u.forEach((x, k) => {
        const c = `${donde}.unidades[${k}]`
        if (!esObjeto(x)) return void err(c, 'debe ser un objeto')
        cerrar(x, ['nombre', 'patillas'], c, err, 'una unidad')
        if (!esTexto(x.nombre)) err(`${c}.nombre`, 'es obligatorio')
        if (!esObjeto(x.patillas) || !Object.values(x.patillas).every(esTexto)) err(`${c}.patillas`, 'debe ser un objeto de id de pin a patilla')
      })
      const ok = u.every((x) => esObjeto(x) && esObjeto(x.patillas))
      if (ok) {
        const claves = (x: any) => Object.keys(x.patillas).sort().join()
        u.forEach((x, k) => k > 0 && claves(x) !== claves(u[0]) && err(`${donde}.unidades[${k}].patillas`, 'debe mapear los mismos pines que la primera unidad'))
        if (esObjeto(p.patillas)) for (const [pin, v] of Object.entries((u[0] as any).patillas)) if (!esPatillas(p.patillas[pin]) || lista(p.patillas[pin] as string | string[]).join() !== v) err(`${donde}.unidades[0].patillas.${pin}`, 'la primera unidad debe coincidir con «patillas»')
      }
    }
  }
  if (p.huella !== undefined && !(typeof p.huella === 'string' && ID_KICAD.test(p.huella))) err(`${donde}.huella`, 'debe ser un id de KiCad «Biblioteca:Nombre»')
  if (p.parte !== undefined && !esTexto(p.parte)) err(`${donde}.parte`, 'debe ser un texto')
  if (p.representativa !== undefined && p.representativa !== true) err(`${donde}.representativa`, 'solo puede ser verdadero')
  if (p.lcsc !== undefined) {
    const l = p.lcsc
    if (!esObjeto(l)) err(`${donde}.lcsc`, 'debe ser un objeto')
    else {
      cerrar(l, ['numero', 'comprobado', 'sinVerificar'], `${donde}.lcsc`, err, 'lcsc')
      if (typeof l.numero !== 'string' || !LCSC.test(l.numero)) err(`${donde}.lcsc.numero`, 'debe ser un número de LCSC como «C2150»')
      const fecha = l.comprobado !== undefined, marca = l.sinVerificar !== undefined
      if (fecha === marca) err(`${donde}.lcsc`, 'lleva exactamente uno de «comprobado» (fecha) o «sinVerificar»: true')
      else if (fecha && !(typeof l.comprobado === 'string' && FECHA.test(l.comprobado))) err(`${donde}.lcsc.comprobado`, 'debe ser una fecha AAAA-MM-DD')
      else if (marca && l.sinVerificar !== true) err(`${donde}.lcsc.sinVerificar`, 'solo puede ser verdadero')
    }
  }
  if (p.protoboard !== undefined) {
    const b = p.protoboard
    if (!esObjeto(b)) err(`${donde}.protoboard`, 'debe ser un objeto')
    else {
      cerrar(b, ['arte', 'separacion'], `${donde}.protoboard`, err, 'protoboard')
      if (b.arte !== undefined && !(typeof b.arte === 'string' && /^protoboard-[a-z0-9-]+\.svg$/.test(b.arte))) err(`${donde}.protoboard.arte`, 'debe ser un archivo protoboard-<nombre>.svg')
      if (b.separacion !== undefined && !(Number.isInteger(b.separacion) && (b.separacion as number) > 0)) err(`${donde}.protoboard.separacion`, 'debe ser un entero de huecos de 2.54 mm')
    }
  }
  // Con las patillas pendientes la fila declara que aún no cubre el encapsulado.
  const pendientes = esObjeto(fila.pendiente) && fila.pendiente.patillas !== undefined
  const usadas = patillasUsadas(p)
  const repetidas = usadas.filter((x, i) => usadas.indexOf(x) !== i)
  if (repetidas.length) err(`${donde}`, `usa la patilla ${[...new Set(repetidas)].join(', ')} más de una vez`)
  if (enc?.numerada) {
    const validas = new Set(Array.from({ length: enc.patillas }, (_, i) => String(i + 1)))
    const ajenas = [...new Set(usadas)].filter((x) => !validas.has(x))
    if (ajenas.length) err(`${donde}`, `${enc.id} no tiene la patilla ${ajenas.join(', ')} (va de 1 a ${enc.patillas})`)
    const faltan = [...validas].filter((x) => !usadas.includes(x))
    if (!pendientes && faltan.length && !ajenas.length && !repetidas.length) err(`${donde}`, `${enc.id} tiene ${enc.patillas} patillas, ${faltan.length === 1 ? 'falta la' : 'faltan la'} ${faltan.join(' y la ')}`)
  }
}

function validarFila(f: unknown, donde: string, err: Err): void {
  if (!esObjeto(f)) return void err(donde, 'debe ser un objeto')
  cerrar(f, CLAVES_FILA, donde, err, 'una fila de datos')
  for (const k of ['fabricante', 'parte', 'aproximada', 'nota']) if (f[k] !== undefined && !esTexto(f[k])) err(`${donde}.${k}`, 'debe ser un texto')
  if (f.hoja !== undefined && !(typeof f.hoja === 'string' && /^https:\/\/[^\s/]+\S*$/.test(f.hoja))) err(`${donde}.hoja`, 'debe ser un enlace https del fabricante')
  if (f.virtual !== undefined) {
    if (f.virtual !== true) err(`${donde}.virtual`, 'solo puede ser verdadero')
    else for (const k of ['presentaciones', 'parte', 'hoja']) if (f[k] !== undefined) err(`${donde}.${k}`, 'una pieza virtual no lo lleva')
  }
  if (f.equivalencias !== undefined) validarEquivalencias(f.equivalencias, `${donde}.equivalencias`, err)
  if (f.pendiente !== undefined && !(esObjeto(f.pendiente) && Object.values(f.pendiente).every(esTexto))) err(`${donde}.pendiente`, 'debe ser un objeto de campo a motivo')
  if (f.comprobado !== undefined) {
    const c = f.comprobado
    if (!esObjeto(c)) err(`${donde}.comprobado`, 'debe ser un objeto con fecha y fuente')
    else {
      cerrar(c, ['fecha', 'fuente'], `${donde}.comprobado`, err, 'comprobado')
      if (typeof c.fecha !== 'string' || !FECHA.test(c.fecha)) err(`${donde}.comprobado.fecha`, 'debe ser una fecha AAAA-MM-DD')
      if (!esTexto(c.fuente)) err(`${donde}.comprobado.fuente`, 'debe decir de dónde salen los datos (documento, revisión y página)')
    }
  }
  if (f.presentaciones !== undefined) {
    if (!Array.isArray(f.presentaciones) || f.presentaciones.length === 0) err(`${donde}.presentaciones`, 'debe ser una lista con al menos una presentación')
    else f.presentaciones.forEach((p, i) => validarPresentacion(p, `${donde}.presentaciones[${i}]`, f, err))
  }
}

/** Los problemas de los pines de una fila contra los de la pieza: patillas de pines que no existen y pines sin patilla. Aparte del
 * resto porque en una compuerta de entradas variables cada cantidad tiene sus pines. */
export function problemasDePines(fila: FilaDatos, pines: PinDef[]): string[] {
  const ids = new Set(pines.map((p) => p.id))
  const problemas: string[] = []
  fila.presentaciones?.forEach((p, i) => {
    const donde = `presentaciones[${i}]`
    for (const k of Object.keys(p.patillas)) if (!ids.has(k)) problemas.push(`${donde}.patillas.${k} no es un pin de la pieza`)
    for (const u of p.unidades ?? []) for (const k of Object.keys(u.patillas)) if (!ids.has(k)) problemas.push(`${donde}.unidades.${u.nombre}.${k} no es un pin de la pieza`)
    if (fila.pendiente?.patillas === undefined) {
      const sin = pines.filter((q) => p.patillas[q.id] === undefined).map((q) => q.id)
      if (sin.length) problemas.push(`${donde}.patillas no cubre ${sin.length === 1 ? 'el pin' : 'los pines'} ${sin.join(', ')}`)
    }
  })
  return problemas
}

/** Revisa la clave `datos` de una pieza. Las claves de `valores` son opciones de las propiedades de `por`. */
export function validarDatos(d: unknown, pines: PinDef[], props: PropDef[], err: Err): DatosPieza | undefined {
  const antes = { n: 0 }
  const e: Err = (campo, msg) => {
    antes.n++
    err(campo, msg)
  }
  if (!esObjeto(d)) return void e('datos', 'debe ser un objeto')
  cerrar(d, CLAVES_DATOS, 'datos', e, 'los datos')
  const lis = (id: unknown) => props.find((p) => p.id === id && p.opciones)
  const por: string[] = d.por === undefined ? [] : Array.isArray(d.por) ? (d.por as unknown[]).map(String) : [String(d.por)]
  if (d.por !== undefined) {
    if (!(typeof d.por === 'string' || (Array.isArray(d.por) && d.por.length === 2)) || !por.every((id) => lis(id))) e('datos.por', 'debe ser una propiedad de lista de la pieza (o dos)')
  }
  if (d.equivalencias !== undefined) validarEquivalencias(d.equivalencias, 'datos.equivalencias', e)
  if (!esObjeto(d.valores) || Object.keys(d.valores).length === 0) e('datos.valores', 'debe ser un objeto con al menos una fila')
  else {
    const porOk = d.por === undefined || por.every((id) => lis(id))
    for (const [clave, fila] of Object.entries(d.valores)) {
      const donde = `datos.valores.${clave}`
      if (porOk) {
        if (por.length === 0) clave !== '*' && e(donde, 'sin «por», la única fila va en la llave «*»')
        else {
          const partes = clave.split('|')
          const opciones = por.map((id) => lis(id)!.opciones!)
          if (partes.length !== por.length || partes.some((x, i) => !opciones[i].includes(x))) e(donde, `no es una opción de ${por.join(' y ')}${por.length === 2 ? ' (unidas con «|»)' : ''}`)
        }
      }
      validarFila(fila, donde, e)
      // Una compuerta de entradas variables comprueba sus pines en la librería, cuando arma cada cantidad.
      if (esObjeto(fila) && !(por[1] === 'entradas')) for (const p of problemasDePines(fila as FilaDatos, pines)) e(donde, p)
    }
  }
  return antes.n ? undefined : (d as unknown as DatosPieza)
}

/** La fila de datos de una pieza con las propiedades dadas (las que falten toman su valor por omisión), con su llave; null si la
 * pieza no tiene datos o no hay fila para esa combinación. */
export function filaDe(def: PiezaDef, props: Record<string, string>): { clave: string; fila: FilaDatos } | null {
  const d = def.datos
  if (!d) return null
  const por = d.por === undefined ? [] : lista(d.por)
  const valor = (id: string) => props[id] ?? def.props.find((p) => p.id === id)?.defecto
  const partes = por.map(valor)
  if (partes.some((x) => x === undefined)) return null
  const clave = por.length === 0 ? '*' : partes.join('|')
  const fila = Object.hasOwn(d.valores, clave) ? d.valores[clave] : undefined
  return fila ? { clave, fila } : null
}
