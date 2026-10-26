import { clavePin, partirClavePin, porId, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import type { ModeloDef, PiezaDef } from '../piezas/tipos'
import { pinesDelModeloDigital } from '../piezas/validarDigital'
import { formatearValor, leerValor } from '../valores/valores'
import { FAMILIAS, parametrosDeFamilia, type Familia, type ParametrosLogicos } from './familias'

/** Lo digital de la netlist: piezas digitales, su familia y alimentación, pines de entrada o salida y avisos previos a
 * simular (dos salidas en una red, entrada CMOS al aire, alimentación fuera de familia). Lo usan `compilarNetlist` y los
 * avisos de Proyecto para decir lo mismo. */

export type ModeloDigital = Extract<ModeloDef, { tipo: 'compuerta' | 'biestable-d' | 'biestable-jk' | 'contador' | 'decodificador' | 'estado-logico' }>

const DIGITALES = new Set(['compuerta', 'biestable-d', 'biestable-jk', 'contador', 'decodificador', 'estado-logico'])

/** El modelo es de una pieza solo digital (las compuertas, los biestables, el contador, el decodificador y el estado lógico). */
export const esModeloDigital = (m: ModeloDef | undefined): m is ModeloDigital => m !== undefined && DIGITALES.has(m.tipo)

/** Hay alguna pieza digital o un 555. Sin ellas no se busca nada digital: con 5,000 resistencias los recorridos duplicaban
 * el tiempo de los avisos (6.6 a 11.6 ms, con límite de 10). */
export function hayLogica(piezas: Iterable<Pieza>, lib: Map<string, PiezaDef>): boolean {
  for (const p of piezas) {
    const m = lib.get(p.tipo)?.modelo
    if (esModeloDigital(m) || m?.tipo === '555') return true
  }
  return false
}

/** Un pin de una pieza digital: su id, el campo del modelo que lo nombra y si es una salida. */
export interface PinDigital {
  id: string
  campo: string
  salida: boolean
}

const CAMPOS_DE_SALIDA = /^(salida|q|qn|co|salidas\[\d+\]|q\[\d+\])$/
const cachePines = new WeakMap<ModeloDef, PinDigital[]>()
/** Los pines de un modelo digital en el orden del modelo, con su dirección. */
export function pinesDigitales(m: ModeloDigital): PinDigital[] {
  let r = cachePines.get(m)
  if (!r) {
    r = pinesDelModeloDigital(m).map(([campo, id]) => ({ id: id as string, campo, salida: CAMPOS_DE_SALIDA.test(campo) }))
    cachePines.set(m, r)
  }
  return r
}

/** La familia de una pieza digital y su alimentación, o la oración que impide simular. */
export type FamiliaDePieza = { ok: true; nombre: string; familia: Familia; vcc: number; params: ParametrosLogicos; aviso?: string } | { ok: false; error: string }

/** La opción guardada de una propiedad de lista, sin cambiarla por la de omisión. */
const guardada = (p: Pieza, def: PiezaDef, prop: string) => p.props[prop] ?? def.props.find((d) => d.id === prop)?.defecto ?? ''

export function familiaDe(p: Pieza, def: PiezaDef, m: ModeloDigital): FamiliaDePieza {
  const pedida = guardada(p, def, m.familia)
  let nombre = pedida
  let aviso: string | undefined
  if (!Object.hasOwn(FAMILIAS.familias, pedida)) {
    nombre = FAMILIAS.omision
    // Un .kir manipulado: simula con la de omisión y lo avisa.
    aviso = `${p.ref} trae la familia «${pedida}», que no existe: se simula como ${nombre}.`
    if (!Object.hasOwn(FAMILIAS.familias, nombre)) return { ok: false, error: `No hay familias lógicas: revisa componentes/familias-logicas.json.` }
  }
  const familia = FAMILIAS.familias[nombre]
  const texto = guardada(p, def, m.alimentacion)
  const v = leerValor(texto)
  if (!v || !Number.isFinite(v.valor) || (v.unidad !== '' && v.unidad !== 'V')) return { ok: false, error: `La alimentación «${texto}» de ${p.ref} no es válida.` }
  const { min, max } = familia.alimentacion
  if (!(v.valor >= min && v.valor <= max)) {
    const intervalo = min === max ? formatearValor(min, 'V') : `${formatearValor(min, 'V')} a ${formatearValor(max, 'V')}`
    return { ok: false, error: `La alimentación de ${formatearValor(v.valor, 'V')} de ${p.ref} está fuera del intervalo de ${nombre} (${intervalo}).` }
  }
  return { ok: true, nombre, familia, vcc: v.valor, params: parametrosDeFamilia(familia, v.valor), ...(aviso ? { aviso } : {}) }
}

/** Alimentaciones de la lista de la pieza que admite la familia `familia` (provisional: el inspector solo ofrece estas).
 * Una familia inexistente da la lista entera. */
export function alimentacionesDeFamilia(opciones: readonly string[], familia: string): string[] {
  const f = Object.hasOwn(FAMILIAS.familias, familia) ? FAMILIAS.familias[familia] : undefined
  if (!f) return [...opciones]
  return opciones.filter((o) => {
    const v = leerValor(o)
    return !!v && v.valor >= f.alimentacion.min - 1e-9 && v.valor <= f.alimentacion.max + 1e-9
  })
}

/** Al cambiar la familia de una pieza digital, su alimentación si la nueva no la admite: la admitida más cercana y el
 * aviso para el Registro. null si cabe (o no hay opción admitida). */
export function alimentacionAlCambiarFamilia(p: Pieza, def: PiezaDef, m: ModeloDigital, familia: string): { alimentacion: string; aviso: string } | null {
  const prop = def.props.find((d) => d.id === m.alimentacion)
  const f = Object.hasOwn(FAMILIAS.familias, familia) ? FAMILIAS.familias[familia] : undefined
  if (!prop?.opciones || !f) return null
  const actual = guardada(p, def, m.alimentacion)
  const validas = alimentacionesDeFamilia(prop.opciones, familia)
  if (validas.includes(actual) || validas.length === 0) return null
  const v = leerValor(actual)?.valor ?? f.alimentacion.omision
  const cercana = validas.reduce((a, b) => (Math.abs((leerValor(b)?.valor ?? 0) - v) < Math.abs((leerValor(a)?.valor ?? 0) - v) ? b : a))
  const intervalo = `de ${formatearValor(f.alimentacion.min, 'V')} a ${formatearValor(f.alimentacion.max, 'V')}`
  return { alimentacion: cercana, aviso: `La alimentación de ${p.ref} pasó de ${actual} a ${cercana}: ${familia} admite ${intervalo}.` }
}

/** Una salida que maneja una red: la de una pieza digital o la del 555. */
interface Salida {
  pieza: Pieza
  red: number
}

/** Las salidas de cada red (digitales y la del 555), halladas en un solo recorrido. */
function salidasPorRed(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): Map<number, Salida[]> {
  const porRed = new Map<number, Salida[]>()
  const poner = (pieza: Pieza, pin: string) => {
    const red = con.redDePin.get(clavePin(pieza.id, pin))
    if (red === undefined) return
    const lista = porRed.get(red) ?? []
    lista.push({ pieza, red })
    porRed.set(red, lista)
  }
  for (const p of Object.values(doc.piezas).sort(porId)) {
    const m = lib.get(p.tipo)?.modelo
    if (esModeloDigital(m)) for (const pin of pinesDigitales(m)) if (pin.salida) poner(p, pin.id)
    if (m?.tipo === '555') poner(p, m.out)
  }
  return porRed
}

/** «A», «A y B», «A, B y C». */
export const enumerar = (refs: string[]) => (refs.length < 2 ? refs.join('') : `${refs.slice(0, -1).join(', ')} y ${refs[refs.length - 1]}`)

/** Dos salidas en la misma red no simulan: en el chip real es un corto. Una oración por red. */
export function salidasUnidas(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { texto: string; piezas: Id[] }[] {
  const r: { texto: string; piezas: Id[] }[] = []
  for (const salidas of salidasPorRed(doc, lib, con).values()) {
    if (salidas.length < 2) continue
    const piezas = [...new Map(salidas.map((s) => [s.pieza.id, s.pieza])).values()]
    const refs = piezas.map((q) => q.ref).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    const texto = piezas.length === 1 ? `Dos salidas de ${refs[0]} manejan la misma red: únelas con una compuerta, no con un cable.` : `${enumerar(refs)} manejan la misma red: une sus salidas con una compuerta, no con un cable.`
    r.push({ texto, piezas: piezas.map((q) => q.id) })
  }
  return r
}

/** Una salida digital unida a la tierra es un corto. */
export function salidasATierra(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { texto: string; piezas: Id[] }[] {
  const r: { texto: string; piezas: Id[] }[] = []
  for (const p of Object.values(doc.piezas).sort(porId)) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || !esModeloDigital(m)) continue
    for (const pin of pinesDigitales(m)) {
      const red = con.redes[con.redDePin.get(clavePin(p.id, pin.id)) ?? -1]
      if (pin.salida && red?.tierra) r.push({ texto: `La salida ${def.pines.find((x) => x.id === pin.id)?.nombre ?? pin.id} de ${p.ref} está unida a tierra: es un corto.`, piezas: [p.id] })
    }
  }
  return r
}

/** Entradas de piezas CMOS (74HC y CD4000B) en una red que nadie maneja: la entrada lee X, sin impedir simular. Una red
 * sin salidas con algo analógico (resistencia a tierra, fuente) no está al aire. */
export function entradasAlAire(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { texto: string; piezas: Id[]; entrada: string; reinicio?: true }[] {
  const salidas = salidasPorRed(doc, lib, con)
  const digitalPura = redesDigitalesPuras(doc, lib, con)
  const r: { texto: string; piezas: Id[]; entrada: string; reinicio?: true }[] = []
  for (const p of Object.values(doc.piezas).sort(porId)) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || !esModeloDigital(m)) continue
    const f = familiaDe(p, def, m)
    if (!f.ok || f.familia.entrada.al_aire === '1') continue
    for (const pin of pinesDigitales(m)) {
      if (pin.salida) continue
      const red = con.redDePin.get(clavePin(p.id, pin.id))
      if (red === undefined || !digitalPura.has(red) || salidas.has(red)) continue
      const nombre = def.pines.find((x) => x.id === pin.id)?.nombre ?? pin.id
      // PRE y CLR (activos en bajo) al aire dejan las salidas en X: se dice qué hacer con ellos.
      if (pin.id === 'PRE' || pin.id === 'CLR') {
        r.push({ texto: `La entrada ${pin.id} de ${p.ref} está al aire: en CMOS su nivel no está definido. Llévala a VCC si no la usas.`, piezas: [p.id], entrada: `${pin.id} de ${p.ref}`, reinicio: true })
        continue
      }
      r.push({ texto: `La entrada ${nombre} de ${p.ref} está al aire: en CMOS su nivel no está definido.`, piezas: [p.id], entrada: `${nombre} de ${p.ref}` })
    }
  }
  return r
}

/** Las entradas al aire en una oración para el Registro: una línea por F5 con las primeras cinco nombradas. */
export function textoEntradasAlAire(entradas: { texto: string; entrada: string; reinicio?: true }[]): string | null {
  if (entradas.length === 0) return null
  if (entradas.length === 1) return entradas[0].texto
  const nombradas = entradas.slice(0, 5).map((e) => e.entrada)
  const resto = entradas.length - nombradas.length
  const lista = resto > 0 ? `${nombradas.join(', ')} y ${resto.toLocaleString('es-MX')} más` : enumerar(nombradas)
  const cola = entradas.some((e) => e.reinicio) ? ' Llévalos a VCC si no usas PRE y CLR.' : ''
  return `Las entradas ${lista} están al aire: en CMOS su nivel no está definido.${cola}`
}

/** Los pines de contacto de un interruptor, un botón o un relé: abiertos, no conducen. */
function pinesDeContacto(m: ModeloDef | undefined): string[] {
  // El común de un conmutador siempre sigue a uno de sus tiros: solo ellos pueden dejar una entrada al aire.
  if (m?.tipo === 'interruptor') return m.c !== undefined ? [m.b, m.c] : [m.a, m.b]
  if (m?.tipo === 'rele') return [m.com, m.na, m.nc]
  return []
}

/** Redes que solo unen contactos con entradas CMOS: el contacto abierto es 1 GΩ y la entrada no toma corriente, así que la
 * red quedaba en el voltaje del otro lado (15 V con el botón suelto). `compilarNetlist` le pone una fuga a tierra
 * (`R_FUGA`) y el Registro lo dice. Una entrada 74LS fija su nivel y no cuenta. */
export function entradasTrasContactos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): { red: number; entradas: string[]; contactos: string[]; piezas: Id[] }[] {
  const r: { red: number; entradas: string[]; contactos: string[]; piezas: Id[] }[] = []
  for (const red of con.redes) {
    if (red.tierra || red.pines.length === 0) continue
    const entradas: string[] = [], contactos = new Set<string>(), piezas = new Set<Id>()
    let vale = true
    for (const clave of red.pines) {
      const { piezaId, pinId } = partirClavePin(clave)
      const p = doc.piezas[piezaId]
      const def = p ? lib.get(p.tipo) : undefined
      const m = def?.modelo
      if (p && pinesDeContacto(m).includes(pinId)) {
        contactos.add(p.ref)
        piezas.add(p.id)
        continue
      }
      const pin = p && def && esModeloDigital(m) ? pinesDigitales(m).find((x) => x.id === pinId) : undefined
      const f = pin && !pin.salida ? familiaDe(p!, def!, m as ModeloDigital) : null
      if (!f?.ok || f.familia.entrada.al_aire !== 'X') {
        vale = false
        break
      }
      entradas.push(`${def!.pines.find((x) => x.id === pinId)?.nombre ?? pinId} de ${p!.ref}`)
      piezas.add(p!.id)
    }
    if (vale && entradas.length && contactos.size) r.push({ red: red.id, entradas, contactos: [...contactos].sort(), piezas: [...piezas].sort() })
  }
  return r
}

/** Las entradas que solo llegan a contactos, en una sola oración para el Registro. */
export function textoEntradasTrasContactos(redes: { entradas: string[]; contactos: string[] }[]): string | null {
  if (redes.length === 0) return null
  const entradas = redes.flatMap((x) => x.entradas)
  const contactos = [...new Set(redes.flatMap((x) => x.contactos))].sort()
  const una = entradas.length === 1
  return `${una ? 'La entrada' : 'Las entradas'} ${enumerar(entradas.slice(0, 5))}${entradas.length > 5 ? ` y ${entradas.length - 5} más` : ''} solo ${una ? 'llega' : 'llegan'} a ${enumerar(contactos)}: con el contacto abierto ${una ? 'queda' : 'quedan'} al aire y se ${una ? 'toma' : 'toman'} como 0 V. Agrega una resistencia a tierra para fijar su nivel.`
}

/** Redes digitales puras: todos sus pines son de piezas digitales (sin tierra, alimentación ni pieza analógica, directa o
 * por etiqueta). No entran a la matriz: tienen nivel y no voltaje. */
export function redesDigitalesPuras(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): Set<number> {
  const r = new Set<number>()
  for (const red of con.redes) {
    if (red.tierra || red.pines.length === 0) continue
    let pura = true
    let digitales = 0
    for (const clave of red.pines) {
      const p = doc.piezas[partirClavePin(clave).piezaId]
      const m = p ? lib.get(p.tipo)?.modelo : undefined
      // Una entrada del osciloscopio no vuelve analógica una red digital): no la carga.
      if (m?.tipo === 'osciloscopio') continue
      if (!p || !esModeloDigital(m)) {
        pura = false
        break
      }
      digitales++
    }
    if (pura && digitales > 0) r.add(red.id)
  }
  return r
}

