/** Convierte un circuito ajeno en un fragmento de Kirchi: piezas con sus valores, acomodo, cables, instrumentos, análisis e
 * informe. No toca el disco ni el documento: devuelve lo que `importar.ts` coloca. */
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { nombreDeVoltaje, voltajeDeNombre } from '../conexiones/nombres'
import { refDe, unidadesDe } from '../doc/paquetes'
import type { EntradaAnalisis } from '../edicion/analisisDoc'
import { idSecuencial, type GeneradorId } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza, type Punto, type Sonda } from '../doc/tipos'
import type { Fragmento } from '../editor/portapapeles'
import { defDe, ID_SIN_EQUIVALENCIA } from '../piezas/sinEquivalencia'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { CircuitoAjeno, FormatoAjeno, InstrumentoAjeno, PiezaAjena } from './ajeno'
import { acomodar, proyectar } from './acomodo'
import { cablear, type RedParaCablear } from './cables'
import { claseDe, entradasDe, FAMILIAS } from './familias'
import { buscarEquivalencia, indiceDeEquivalencias, type Equivalencia, type IndiceEquivalencias } from './equivalencias'
import { describirAnalisis, recortarAvisos, type Informe } from './informe'
import { analisisDe, piezaDeGenerador, type ContextoAnalisis } from './instrumentos'
import { numeroSpice } from './lectores/spice'
import { emparejarPines } from './pines'
import { aplicarValor, comoReostato, numeroDeValor, pinesDeCaja } from './valores'

export { numeroDeValor }

export interface Conversion {
  fragmento: Fragmento
  analisis: EntradaAnalisis[]
  informe: Informe
  avisos: string[]
}

const indices = new WeakMap<ReadonlyMap<string, PiezaDef>, IndiceEquivalencias>()
const indiceDe = (lib: Map<string, PiezaDef>): IndiceEquivalencias => {
  let i = indices.get(lib)
  if (!i) indices.set(lib, (i = indiceDeEquivalencias(lib)))
  return i
}

interface Elem {
  /** Pieza de Kirchi (con su `pines` si es una caja). */
  pieza: Pieza
  def: PiezaDef
  ajena?: PiezaAjena
  eq?: Equivalencia
  /** Número o nombre ajeno a id de pin de Kirchi. */
  pares: Map<string, string>
  /** Pin de Kirchi a índice de red. */
  redes: Map<string, number>
  deseados?: Map<string, Punto>
  /** Instrumento sin pines conectados (osciloscopio, multímetro): se mide con sondas. */
  virtual?: boolean
}

interface Red {
  nombre?: string
  tierra: boolean
  miembros: { el: Elem; pin: string }[]
}

const REF_VALIDA = /^[^\s]{1,24}$/
const ID_REOSTATO = 'reostato'
const esTierra = (nombre: string | undefined): boolean => nombre !== undefined && (nombre === '0' || /^gnd$/i.test(nombre))

/** Los pines que la familia de la pieza fija por nombre, si el tipo elegido es el de su familia. Dos pines ajenos solo comparten
 * pin de Kirchi si el origen los tiene en la misma red; si no, el segundo queda fuera para no unir redes distintas. */
export function fijosDe(ajeno: CircuitoAjeno, p: PiezaAjena, tipo: string): Record<string, string> | undefined {
  const clase = claseDe(ajeno.formato, p)
  const fijos = clase && FAMILIAS[clase].pieza === tipo ? FAMILIAS[clase].pines : undefined
  if (!fijos) return undefined
  const redDe = (clave: string): number => ajeno.redes.findIndex((r) => r.pines.some((q) => q.ref === p.ref && q.pin.toUpperCase() === clave))
  const primero = new Map<string, string>()
  const salida: Record<string, string> = {}
  for (const [clave, id] of Object.entries(fijos)) {
    const antes = primero.get(id)
    if (antes === undefined) primero.set(id, clave)
    else if (redDe(antes) === -1 || redDe(antes) !== redDe(clave)) continue
    salida[clave] = id
  }
  return salida
}

/** Nombre de la etiqueta de una red: el del origen si es usable, si no uno generado; único entre todas. */
function nombresDeEtiqueta(redes: Red[]): string[] {
  const usados = new Set<string>()
  return redes.map((r, k) => {
    let base = (r.nombre ?? '').trim()
    if (!base || voltajeDeNombre(base) !== null) base = base ? `N_${base}` : `N${k + 1}`
    let nombre = base
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base}_${n}`
    usados.add(nombre.toLowerCase())
    return nombre
  })
}

export function convertir(ajeno: CircuitoAjeno, lib: Map<string, PiezaDef>, gen: GeneradorId = idSecuencial()): Conversion {
  const indice = indiceDe(lib)
  const avisos: string[] = [...ajeno.avisos]
  const elems: Elem[] = []
  const porRefAjena = new Map<string, Elem>()
  /** Todas las unidades de una referencia del origen: un pin del origen se busca entre ellas por su número. */
  const unidadesDeRef = new Map<string, Elem[]>()

  // Referencias: las del origen si son válidas y únicas; el resto se numera por prefijo.
  const usadas = new Set<string>()
  const contador = new Map<string, number>()
  const refNueva = (prefijo: string): string => {
    let n = contador.get(prefijo) ?? 0
    let ref: string
    do ref = `${prefijo}${++n}`
    while (usadas.has(ref.toLowerCase()))
    contador.set(prefijo, n)
    usadas.add(ref.toLowerCase())
    return ref
  }
  /** Referencia de una unidad (`U1A`): la misma si nadie la usa; si no, una nueva del mismo prefijo. */
  const unidadUnica = (ref: string): string => {
    if (usadas.has(ref.toLowerCase())) return refNueva(/^[^\d]*/.exec(ref)?.[0] || 'U')
    usadas.add(ref.toLowerCase())
    return ref
  }
  const refDeOrigen = (ref: string): string | undefined => {
    if (!REF_VALIDA.test(ref) || usadas.has(ref.toLowerCase())) return undefined
    usadas.add(ref.toLowerCase())
    return ref
  }
  // Las unidades de un símbolo multiunidad comparten la referencia del origen: se resuelve una vez por referencia.
  const conservadas = new Map<string, string>()
  const primera = new Map<string, PiezaAjena>()
  const frescas = new Map<string, string>()
  const unidadesPorRef = new Map<string, Set<string>>()
  for (const p of ajeno.piezas) {
    if (p.unidad !== undefined) unidadesPorRef.set(p.ref, (unidadesPorRef.get(p.ref) ?? new Set()).add(p.unidad))
    if (primera.has(p.ref)) continue
    primera.set(p.ref, p)
    const r = refDeOrigen(p.ref)
    if (r) conservadas.set(p.ref, r)
  }

  const generadores = new Map<string, Extract<InstrumentoAjeno, { tipo: 'generador' }>>()
  for (const i of ajeno.instrumentos) if (i.tipo === 'generador' && i.nombre) generadores.set(i.nombre.toLowerCase(), i)
  const fisico = ajeno.formato === 'kicad' || ajeno.formato === 'proteus'
  const informe: Informe = {
    origen: { formato: ajeno.formato, ...(ajeno.version !== undefined ? { version: ajeno.version } : {}), nombre: ajeno.nombre },
    total: ajeno.piezas.length,
    convertidas: 0,
    aproximadas: [],
    sinEquivalencia: [],
    redesConEtiqueta: [],
    analisis: [],
    omitidas: [],
    avisos: []
  }

  const conectados = new Set<string>()
  for (const r of ajeno.redes) for (const q of r.pines) conectados.add(`${q.ref}\0${q.pin}`)
  const cajaDef = lib.get(ID_SIN_EQUIVALENCIA)
  for (const p of ajeno.piezas) {
    const g = generadores.get(p.ref.toLowerCase())
    let tipo: string | undefined
    let props: Record<string, string> = {}
    let eq: Equivalencia = { tipo: 'ninguna' }
    if (g) {
      const gp = piezaDeGenerador(g)
      tipo = gp.tipo
      props = gp.props
      avisos.push(...gp.avisos)
      eq = { tipo: 'exacta', pieza: gp.tipo, props: gp.props }
    } else {
      // El riel variable de Falstad (172) es un terminal de alimentación, como el riel R.
      eq = ajeno.formato === 'falstad' && p.tipo === '172' ? { tipo: 'exacta', pieza: 'alimentacion', props: {} } : buscarEquivalencia(indice, lib, ajeno.formato, p)
      if (eq.tipo !== 'ninguna') {
        tipo = eq.pieza
        props = { ...eq.props }
      }
    }
    if (!g && tipo) {
      const clase = claseDe(ajeno.formato, p)
      const prop = clase ? FAMILIAS[clase].entradas : undefined
      const n = prop ? entradasDe(ajeno.formato, p) : null
      if (prop && n !== null && FAMILIAS[clase!].pieza === tipo) {
        // Cada cantidad de entradas es una pieza de la librería (`and`, `and-3`…`and-8`).
        if (n <= 2) props[prop] = String(n)
        else if (lib.has(`${tipo}-${n}`)) tipo = `${tipo}-${n}`
        else avisos.push(`${p.ref}: Kirchi no tiene compuertas de ${n} entradas y se usó la de 2.`)
      }
    }
    let def = tipo ? lib.get(tipo) : undefined
    if (!def) {
      if (!cajaDef) throw new Error('Falta la pieza sin equivalencia en la librería.')
      def = cajaDef
      tipo = ID_SIN_EQUIVALENCIA
      eq = { tipo: 'ninguna' }
    }
    let reostato: ReturnType<typeof comoReostato> = null
    if (!g && def && tipo !== ID_SIN_EQUIVALENCIA && lib.has(ID_REOSTATO)) {
      reostato = comoReostato(p, def, props, fisico && !(ajeno.formato === 'proteus' && p.unidad !== undefined), conectados)
      if (reostato) {
        tipo = ID_REOSTATO
        def = lib.get(ID_REOSTATO)!
        eq = { tipo: 'aproximada', pieza: ID_REOSTATO, props, motivo: `${p.ref} tenía un extremo libre: se importó como reóstato.` }
      }
    }
    const id = gen('p')
    // Solo comparten referencia las unidades de un mismo símbolo; una referencia repetida sin unidades se renumera.
    const comparte = primera.get(p.ref) === p || (p.unidad !== undefined && primera.get(p.ref)?.unidad !== undefined)
    const baseRef = comparte ? (conservadas.get(p.ref) ?? frescas.get(p.ref) ?? (frescas.set(p.ref, refNueva(def.prefijo)), frescas.get(p.ref)!)) : refNueva(def.prefijo)
    let ref = baseRef
    let pieza: Pieza
    let pares: Map<string, string>
    if (tipo === ID_SIN_EQUIVALENCIA) {
      const c = pinesDeCaja(p, ajeno)
      pares = c.pares
      const nombre = (p.modelo ?? p.valor ?? p.tipo.split(':').pop() ?? p.tipo).slice(0, 24)
      pieza = { id, tipo, ref, x: 0, y: 0, rot: 0, espejo: false, props: { nombre, origen: ajeno.formato }, pines: c.pines }
      if (p.unidad !== undefined && (unidadesPorRef.get(p.ref)?.size ?? 0) > 1) ref = unidadUnica(baseRef + p.unidad)
      pieza.ref = ref
      informe.sinEquivalencia.push({ id, ref, tipo: p.tipo, original: nombre })
    } else {
      if (!g) {
        const pos = numeroSpice(p.props.posicion ?? '')
        const clase = claseDe(ajeno.formato, p)
        const omision = clase && FAMILIAS[clase].pieza === tipo ? FAMILIAS[clase].valorPorOmision : undefined
        aplicarValor(def, reostato?.invertida && pos !== null ? { ...p, props: { ...p.props, posicion: String(1 - pos) } } : p, props, avisos, ajeno.formato, omision)
      }
      if (def.modelo?.tipo === 'alimentacion') {
        const t = (ajeno.dibujo?.terminales ?? []).find((q) => q.tipo === 'alimentacion' && p.pines.some((n) => n.x === q.x && n.y === q.y))
        const valor = numeroDeValor(p.valor ?? '', ajeno.formato)
        props.nombre = (t?.nombre ?? (valor !== null ? nombreDeVoltaje(valor) : (p.valor ?? p.tipo.split(':').pop() ?? 'VCC'))).slice(0, 24)
      }
      // Una pieza de Kirchi con unidades A, B... las toma como paquete; si no las tiene, cada unidad es una pieza con su letra.
      const unidades = p.unidad !== undefined ? unidadesDe(def, props) : null
      if (p.unidad !== undefined && unidades?.nombres.includes(p.unidad)) {
        props.paquete = baseRef
        props.unidad = p.unidad
        ref = unidadUnica(refDe(baseRef, p.unidad))
      } else if (p.unidad !== undefined && (unidadesPorRef.get(p.ref)?.size ?? 0) > 1) ref = unidadUnica(baseRef + p.unidad)
      pieza = { id, tipo: tipo!, ref, x: 0, y: 0, rot: 0, espejo: false, props }
      // En Proteus los pines de una unidad se numeran dentro de la unidad, no por patilla del encapsulado.
      const e = reostato
        ? { pares: reostato.pares, sobrantes: [] as string[], faltantes: [] as string[] }
        : emparejarPines(p, def, props, { fisico: fisico && !(ajeno.formato === 'proteus' && p.unidad !== undefined), fijos: fijosDe(ajeno, p, tipo!) })
      pares = e.pares
      if (e.sobrantes.length) avisos.push(`${ref}: los pines ${e.sobrantes.join(', ')} no tienen equivalente en ${def.id}.`)
      if (e.faltantes.length && def.modelo?.tipo !== 'alimentacion' && def.modelo?.tipo !== 'tierra') avisos.push(`${ref}: los pines ${e.faltantes.join(', ')} de ${def.id} quedan sin conexión.`)
      informe.convertidas++
      if (eq.tipo === 'aproximada') {
        informe.aproximadas.push({ id, ref, tipo: p.tipo, original: (p.modelo ?? p.tipo.split(':').pop() ?? p.tipo).slice(0, 40), pieza: tipo!, ...(props.modelo !== undefined ? { modelo: props.modelo } : {}) })
        avisos.push(`${ref}: ${eq.motivo}`)
      }
    }
    if (p.giro !== undefined && Number.isFinite(p.giro) && p.giro % 90 !== 0) avisos.push(`${ref}: el giro de ${p.giro}° se ajustó a un múltiplo de 90°.`)
    const deseados = new Map<string, Punto>()
    for (const q of p.pines) {
      if (q.x === undefined || q.y === undefined) continue
      const id = (q.numero !== undefined ? pares.get(q.numero) : undefined) ?? (q.nombre !== undefined ? pares.get(q.nombre) : undefined)
      if (id) deseados.set(id, proyectar(ajeno, q.x, q.y))
    }
    const el: Elem = { pieza, def: defDe(pieza, def), ajena: p, eq, pares, redes: new Map(), ...(deseados.size ? { deseados } : {}) }
    elems.push(el)
    if (!porRefAjena.has(p.ref)) porRefAjena.set(p.ref, el)
    // La unidad también se puede nombrar sola (`U1:A`), como lo hace Proteus en sus redes.
    // Una referencia repetida sin unidades es ambigua en las redes del origen: solo la primera pieza responde por ella.
    if (comparte) for (const k of p.unidad !== undefined ? [p.ref, `${p.ref}:${p.unidad}`] : [p.ref]) unidadesDeRef.set(k, [...(unidadesDeRef.get(k) ?? []), el])
  }

  // Redes del origen.
  const redes: Red[] = ajeno.redes.map((r) => ({ ...(r.nombre !== undefined ? { nombre: r.nombre } : {}), tierra: esTierra(r.nombre), miembros: [] }))
  const porNombre = new Map<string, number>()
  redes.forEach((r, k) => r.nombre !== undefined && !porNombre.has(r.nombre.toLowerCase()) && porNombre.set(r.nombre.toLowerCase(), k))
  const unir = (k: number, el: Elem, pin: string): void => {
    el.redes.set(pin, k)
    redes[k]!.miembros.push({ el, pin })
  }
  let sinPin = 0
  ajeno.redes.forEach((r, k) => {
    for (const q of r.pines) {
      let hallado = false
      for (const el of unidadesDeRef.get(q.ref) ?? []) {
        const id = el.pares.get(q.pin)
        if (id) (unir(k, el, id), (hallado = true))
      }
      if (!hallado) sinPin++
    }
  })
  if (sinPin) avisos.push(`${sinPin} ${sinPin === 1 ? 'conexión del origen no encontró' : 'conexiones del origen no encontraron'} su pin en Kirchi.`)

  const redPorNombre = (nombre: string): number => {
    const k = porNombre.get(nombre.toLowerCase())
    if (k !== undefined) return k
    redes.push({ nombre, tierra: esTierra(nombre), miembros: [] })
    porNombre.set(nombre.toLowerCase(), redes.length - 1)
    return redes.length - 1
  }

  // Instrumentos: un generador sin pieza es una pieza nueva conectada; los virtuales se miden con sondas.
  const nuevoElem = (tipo: string, props: Record<string, string>, virtual?: boolean): Elem | null => {
    const def = lib.get(tipo)
    if (!def) return null
    const pieza: Pieza = { id: gen('p'), tipo, ref: refNueva(def.prefijo), x: 0, y: 0, rot: 0, espejo: false, props }
    const el: Elem = { pieza, def, pares: new Map(), redes: new Map(), ...(virtual ? { virtual } : {}) }
    elems.push(el)
    return el
  }
  const conectar = (el: Elem, pin: string, nombreRed: string): void => unir(redPorNombre(nombreRed), el, pin)
  const sondasPorHacer: { tipo: 'voltaje' | 'corriente'; red: number; nombre: string }[] = []
  const deInstrumento: { el: Elem; entradas: { entrada: string; red: number }[]; tipo: 'osciloscopio' | 'multimetro' }[] = []
  for (const i of ajeno.instrumentos) {
    if (i.tipo === 'generador') {
      if (i.nombre && porRefAjena.has(i.nombre)) continue
      const gp = piezaDeGenerador(i)
      avisos.push(...gp.avisos)
      const el = nuevoElem(gp.tipo, gp.props)
      if (!el) continue
      const negativo = lib.get(gp.tipo)!.pines.find((q) => q.id === 'COM' || q.id === '-')?.id
      const positivo = lib.get(gp.tipo)!.pines.find((q) => q.id === '+')?.id
      if (!positivo || !negativo) continue
      conectar(el, positivo, i.red)
      conectar(el, negativo, i.referencia ?? '0')
    } else if (i.tipo === 'sonda') {
      if (i.red === undefined) avisos.push(`La sonda ${i.nombre} no dice qué red mide y se omitió.`)
      else {
        // Dos sondas del origen sobre la misma red darían dos marcas encimadas.
        const red = redPorNombre(i.red)
        if (!sondasPorHacer.some((s) => s.tipo === i.magnitud && s.red === red)) sondasPorHacer.push({ tipo: i.magnitud, red, nombre: i.nombre })
      }
    } else if (i.clase === 'osciloscopio') {
      const canales = ['a', 'b', 'c', 'd']
      const props: Record<string, string> = {}
      i.redes.slice(0, 4).forEach((_, k) => (props[`${canales[k]}_on`] = 'encendido'))
      if (i.redes.length > 4) avisos.push(`El osciloscopio ${i.nombre} mide ${i.redes.length} redes y Kirchi tiene 4 canales: se midieron las primeras.`)
      const el = nuevoElem('osciloscopio', props, true)
      if (el) deInstrumento.push({ el, tipo: 'osciloscopio', entradas: i.redes.slice(0, 4).map((r, k) => ({ entrada: 'ABCD'[k]!, red: redPorNombre(r) })) })
    } else {
      const el = nuevoElem('multimetro', { modo: i.clase === 'amperimetro' ? 'A DC' : 'V DC' }, true)
      if (!el) continue
      if (i.clase === 'amperimetro') avisos.push(`El amperímetro ${i.nombre} queda en paralelo entre sus redes: muévelo a la rama que mide.`)
      deInstrumento.push({ el, tipo: 'multimetro', entradas: [{ entrada: '+', red: redPorNombre(i.redes[0] ?? '0') }, { entrada: 'COM', red: redPorNombre(i.redes[1] ?? '0') }] })
    }
  }


  // Acomodo: `acomodar` reemplaza `pieza` de cada elemento por una copia en su lugar.
  const tierras = new Set<number>(redes.flatMap((r, k) => (r.tierra ? [k] : [])))
  acomodar(elems, tierras, lib)

  // Cables.
  const doc: Documento = documentoVacio()
  for (const e of elems) doc.piezas[e.pieza.id] = e.pieza
  const nombres = nombresDeEtiqueta(redes)
  const paraCablear: RedParaCablear[] = redes.map((r, k) => ({ nombre: nombres[k]!, tierra: r.tierra, pines: r.miembros.map((m) => ({ pieza: m.el.pieza, pin: m.pin })) }))
  const cables = cablear(doc, lib, paraCablear, gen, () => ({ id: gen('p'), tipo: 'tierra', ref: refNueva('GND'), x: 0, y: 0, rot: 0, espejo: false, props: {} }))
  avisos.push(...cables.avisos)
  informe.redesConEtiqueta = cables.conEtiqueta.map((r) => ({ nombre: r.nombre.slice(0, 300), ids: r.piezas.slice(0, 200) }))

  // Sondas.
  const puntoDeRed = (k: number): Punto | undefined => {
    const m = redes[k]?.miembros.find((x) => !x.el.virtual)
    const def = m && lib.get(m.el.pieza.tipo)
    const q = m && def ? pinesEnMundo(m.el.pieza, def).find((x) => x.id === m.pin) : undefined
    return q ? { x: q.x, y: q.y } : undefined
  }
  const sondas: Sonda[] = []
  const hayCorriente = s_hayCorriente(ajeno)
  const con = hayCorriente ? calcularConexiones(doc, lib) : null
  for (const s of sondasPorHacer) {
    if (s.tipo === 'voltaje') {
      const p = puntoDeRed(s.red)
      if (p) sondas.push({ id: gen('s'), tipo: 'voltaje', x: p.x, y: p.y })
      else avisos.push(`La sonda ${s.nombre} mide una red sin piezas y se omitió.`)
      continue
    }
    const m = redes[s.red]?.miembros.find((x) => !x.el.virtual)
    const r = m && con?.redDePin.get(clavePin(m.el.pieza.id, m.pin))
    const cable = r === undefined || !con ? undefined : doc.cables[con.redes[r]?.cables[0] ?? '']
    const a = cable?.puntos[0], b = cable?.puntos[1]
    if (!a || !b) {
      avisos.push(`La sonda de corriente ${s.nombre} no tiene un cable donde medir y se omitió.`)
      continue
    }
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y)
    const largo = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    const paso = largo >= 2 ? 2 : 0
    sondas.push({ id: gen('s'), tipo: 'corriente', x: a.x + dx * paso, y: a.y + dy * paso, sentido: dx > 0 ? 'derecha' : dx < 0 ? 'izquierda' : dy > 0 ? 'abajo' : 'arriba' })
  }
  for (const i of deInstrumento)
    for (const e of i.entradas) {
      const p = puntoDeRed(e.red)
      if (p) sondas.push({ id: gen('s'), tipo: i.tipo, x: p.x, y: p.y, instrumento: i.el.pieza.id, entrada: e.entrada })
      else avisos.push(`La entrada ${e.entrada} de ${i.el.pieza.ref} mide una red sin piezas y quedó sin conectar.`)
    }

  // Análisis y directivas.
  const buscarEl = (nombre: string): Elem | undefined => porRefAjena.get(nombre) ?? [...porRefAjena].find(([k]) => k.toLowerCase() === nombre.toLowerCase())?.[1]
  const analisis: EntradaAnalisis[] = []
  const trazadas = new Map<number, { el: Elem; pin: string }>()
  const ctx: ContextoAnalisis = {
    refDe: (nombre) => buscarEl(nombre)?.pieza.ref,
    trazaDeRed: (nombre) => {
      const k = porNombre.get(nombre.toLowerCase())
      const m = k === undefined || redes[k]!.tierra ? undefined : redes[k]!.miembros.find((x) => !x.el.virtual)
      if (k !== undefined && m) trazadas.set(k, m)
      return m ? `${m.el.pieza.ref}.${m.pin}` : undefined
    },
    fuenteAc: () => {
      const conAc = elems.find((e) => e.ajena?.props.ac !== undefined)
      if (conAc) return { ref: conAc.pieza.ref, magnitud: numeroSpice(conAc.ajena!.props.ac!) ?? 1 }
      const alguna = elems.find((e) => ['V', 'senoidal', 'generador', 'pulso'].includes(e.def.modelo?.tipo ?? ''))
      if (alguna) avisos.push(`El origen no dice cuál fuente es la de CA: se usó ${alguna.pieza.ref} con 1 V.`)
      return alguna ? { ref: alguna.pieza.ref, magnitud: 1 } : undefined
    }
  }
  const sinModelo = new Set(elems.filter((e) => e.eq?.tipo !== 'exacta').flatMap((e) => [e.ajena?.modelo, e.ajena?.tipo.split(':').pop()].filter((x): x is string => !!x).map((x) => x.toLowerCase())))
  for (const d of ajeno.directivas) {
    if (d.tipo === 'analisis') {
      const r = analisisDe(d, ctx)
      avisos.push(...r.avisos)
      if (!r.entrada) continue
      let nombre = r.entrada.nombre
      for (let n = 2; informe.analisis.some((a) => a.nombre === nombre); n++) nombre = `${r.entrada.nombre} ${n}`
      analisis.push({ ...r.entrada, nombre })
      informe.analisis.push({ nombre, de: describirAnalisis(r.entrada.config as Parameters<typeof describirAnalisis>[0]) })
    } else if (d.tipo === 'otra') informe.omitidas.push(d.texto.slice(0, 300))
    else if (d.tipo === 'subcircuito') informe.omitidas.push(`.subckt ${d.nombre}`.slice(0, 300))
    else if (sinModelo.has(d.nombre.toLowerCase())) informe.omitidas.push(`.model ${d.nombre}`.slice(0, 300))
  }

  // Una red graficada lleva su nombre del origen en una etiqueta, para que la traza no dependa del número de red.
  const yaEtiquetadas = new Set(cables.etiquetas.map((e) => e.nombre))
  for (const [k, m] of trazadas) {
    const def = lib.get(m.el.pieza.tipo)
    const q = def ? pinesEnMundo(m.el.pieza, def).find((x) => x.id === m.pin) : undefined
    if (!q || yaEtiquetadas.has(nombres[k]!)) continue
    cables.etiquetas.push({ id: gen('e'), nombre: nombres[k]!, x: q.x, y: q.y, rot: 0 })
  }

  const piezas = [...elems.map((e) => e.pieza), ...cables.tierras]
  informe.avisos = recortarAvisos(avisos)
  return {
    fragmento: { origen: { x: 0, y: 0 }, piezas, cables: cables.cables, etiquetas: cables.etiquetas, notas: [], figuras: [], ...(sondas.length ? { sondas } : {}) },
    analisis,
    informe,
    avisos
  }
}

/** Hay una sonda de corriente que colocar: solo entonces vale la pena calcular las redes del dibujo. */
const s_hayCorriente = (a: CircuitoAjeno): boolean => a.instrumentos.some((i) => i.tipo === 'sonda' && i.magnitud === 'corriente')
