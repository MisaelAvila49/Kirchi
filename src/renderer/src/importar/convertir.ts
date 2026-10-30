/** Convierte un circuito ajeno en un fragmento de Kirchi: piezas con sus valores, acomodo, cables, instrumentos, análisis e
 * informe. No toca el disco ni el documento: devuelve lo que `importar.ts` coloca. */
import { calcularConexiones, clavePin, type Conexiones } from '../conexiones/conexiones'
import { claveDeNombre, nombreDeVoltaje, voltajeDeNombre } from '../conexiones/nombres'
import { refDe, unidadesDe } from '../doc/paquetes'
import type { EntradaAnalisis } from '../edicion/analisisDoc'
import { idSecuencial, type GeneradorId } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Etiqueta, type Pieza, type Punto, type Sonda } from '../doc/tipos'
import { giroDeEtiqueta } from '../editor/etiquetaEnTramo'
import type { Fragmento } from '../editor/portapapeles'
import { defDe, ID_SIN_EQUIVALENCIA } from '../piezas/sinEquivalencia'
import { cajaEnMundo, pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { CircuitoAjeno, DirectivaAjena, FormatoAjeno, InstrumentoAjeno, PiezaAjena } from './ajeno'
import { acomodar, proyectar } from './acomodo'
import { cablear, type RedParaCablear } from './cables'
import { puntoParaSonda, trazar, type ClaseRed, type MarcaOriginal, type PinOriginal, type RedTrazado } from './trazado'
import { claseDe, entradasDe, FAMILIAS } from './familias'
import { buscarEquivalencia, indiceDeEquivalencias, type Equivalencia, type IndiceEquivalencias } from './equivalencias'
import { describirAnalisis, recortarAvisos, type Informe } from './informe'
import { BASE_RANGO, DIVISIONES_H, DIVISIONES_V, POS_RANGO, VDIV_RANGO } from '../instrumentos/ajustes'
import { valoresSerie } from '../instrumentos/serie'
import { analisisDe, piezaDeGenerador, textoNumero, type ContextoAnalisis } from './instrumentos'
import { numeroSpice } from './lectores/spice'
import { deParametros, modeloDelArchivo, type ModeloDelArchivo } from './modelosSpice'
import { emparejarPines } from './pines'
import { aplicarValor, comoReostato, numeroDeValor, pinesDeCaja } from './valores'

export { numeroDeValor }

export interface Conversion {
  fragmento: Fragmento
  /** Voltajes de rieles con nombre (VCC, V+) que daba una fuente de CD del origen. */
  alimentaciones: { nombre: string; voltaje: string }[]
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
  /** Terminal o tierra del origen: se pone con el dibujo, no con el acomodo. */
  marca?: boolean
  /** Pin de Kirchi a dónde estaba en el origen, en sus coordenadas. */
  origen?: Map<string, { x: number; y: number }>
}

interface Red {
  nombre?: string
  tierra: boolean
  miembros: { el: Elem; pin: string }[]
  clase?: ClaseRed
  /** Nombre de sus terminales de alimentación. */
  marca?: string
}

/** Nombres que en el origen son una alimentación: VCC, VDD, V+, +5V, -Vcc. */
const SUMINISTRO = /^([+-]?\d+(\.\d+)?V|[+-]?V(CC|DD|EE|SS|BB|PP)\d*|V[+-])$/i

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

/** Las condiciones iniciales del origen en los capacitores y los inductores: la del propio elemento (`ic=`, el estado de Falstad) ya está en sus propiedades;
 * un `.ic V(nodo)=valor` es la del capacitor que tiene ese nodo en un terminal y la tierra (o otro nodo con `.ic`) en el otro. */
function condicionesIniciales(ajeno: CircuitoAjeno, elems: Elem[], redes: Red[]): { avisos: string[] } {
  const avisos: string[] = []
  const nodos = new Map<string, number>()
  const lineas: { texto: string; nodos: string[] }[] = []
  for (const d of ajeno.directivas) {
    if (d.tipo !== 'otra' || !/^\.ic(\s|$)/i.test(d.texto.trim())) continue
    const de: string[] = []
    for (const m of d.texto.matchAll(/v\(\s*([^)\s]+)\s*\)\s*=\s*([^\s,]+)/gi)) {
      const v = numeroSpice(m[2]!)
      if (v === null) continue
      nodos.set(m[1]!.toLowerCase(), v)
      de.push(m[1]!.toLowerCase())
    }
    lineas.push({ texto: d.texto, nodos: de })
  }
  const usados = new Set<string>()
  const voltaje = (k: number | undefined): number | undefined => (k === undefined ? undefined : redes[k]?.tierra ? 0 : nodos.get((redes[k]?.nombre ?? '').toLowerCase()))
  for (const e of elems) {
    const m = e.def.modelo
    if (m?.tipo !== 'C' || m.ic === undefined || e.pieza.props[m.ic] !== undefined) continue
    const [ra, rb] = [e.redes.get(m.a), e.redes.get(m.b)]
    const [va, vb] = [voltaje(ra), voltaje(rb)]
    if (va === undefined || vb === undefined || (ra !== undefined && redes[ra]?.tierra && rb !== undefined && redes[rb]?.tierra)) continue
    for (const k of [ra, rb]) if (k !== undefined && !redes[k]?.tierra) usados.add((redes[k]?.nombre ?? '').toLowerCase())
    e.pieza.props[m.ic] = textoNumero(va - vb)
  }
  for (const l of lineas) {
    const sueltos = l.nodos.filter((n) => !usados.has(n))
    if (!l.nodos.length || sueltos.length) avisos.push(`${l.texto.trim().slice(0, 80)}: ${l.nodos.length ? `V(${sueltos.join('), V(')}) no es un terminal de un capacitor con el otro a tierra` : 'no se leyó ningún V(nodo)=valor'} y no se aplicó.`)
  }
  const puestas = elems.flatMap((e) => {
    const m = e.def.modelo
    const ic = (m?.tipo === 'C' || m?.tipo === 'L') && m.ic !== undefined ? e.pieza.props[m.ic] : undefined
    return ic === undefined ? [] : [`${e.pieza.ref} ${ic} ${m!.tipo === 'C' ? 'V' : 'A'}`]
  })
  if (puestas.length) avisos.push(`Condiciones iniciales del origen: ${puestas.slice(0, 8).join(', ')}${puestas.length > 8 ? ` y ${puestas.length - 8} más` : ''}.`)
  return { avisos }
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

  const modelosAjenos = new Map<string, Extract<DirectivaAjena, { tipo: 'modelo' }>>()
  for (const d of ajeno.directivas) if (d.tipo === 'modelo' && !modelosAjenos.has(d.nombre.toLowerCase())) modelosAjenos.set(d.nombre.toLowerCase(), d)
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
      // Un transistor cuyo `.model` viene en el archivo conserva sus parámetros en lugar de los de la lista de Kirchi.
      const propio = modeloPropio(def, p, modelosAjenos)
      if (propio) {
        pieza.spice = propio.spice
        avisos.push(`${ref}: usa el modelo del archivo «${propio.nombre}» (${Object.keys(propio.spice).join(', ')})${propio.descartados.length ? `; no se conservó ${propio.descartados.join(', ')}` : ''}.`)
      }
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
    const origen = new Map<string, { x: number; y: number }>()
    for (const q of p.pines) {
      if (q.x === undefined || q.y === undefined) continue
      const id = (q.numero !== undefined ? pares.get(q.numero) : undefined) ?? (q.nombre !== undefined ? pares.get(q.nombre) : undefined)
      if (id && !deseados.has(id)) (deseados.set(id, proyectar(ajeno, q.x, q.y)), origen.set(id, { x: q.x, y: q.y }))
    }
    // Una fuente de un solo terminal de Falstad se dibuja del terminal hacia su otro extremo: su polo libre va hacia allá.
    const libre = def.pines.find((q) => !deseados.has(q.id))
    if (ajeno.formato === 'falstad' && p.pines.length === 1 && def.pines.length === 2 && libre && p.x !== undefined && p.y !== undefined && p.pines[0]!.x !== undefined && p.pines[0]!.y !== undefined)
      deseados.set(libre.id, proyectar(ajeno, 2 * p.x - p.pines[0]!.x, 2 * p.y - p.pines[0]!.y!))
    const esMarca = def.modelo?.tipo === 'alimentacion' || def.modelo?.tipo === 'tierra'
    const el: Elem = { pieza, def: defDe(pieza, def), ajena: p, eq, pares, redes: new Map(), ...(deseados.size ? { deseados, origen } : {}), ...(esMarca ? { marca: true } : {}) }
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
  /** Osciloscopios: cada entrada se une a su red por una etiqueta con el nombre de la red, junto a la entrada. */
  const escopios: { el: Elem; entradas: { entrada: string; red: number }[] }[] = []
  const deInstrumento: { el: Elem; entradas: { entrada: string; red: number }[]; tipo: 'osciloscopio' | 'multimetro' }[] = []
  // Cómo nombra el dibujo del origen cada red: tierra, alimentación (terminal o bandera VCC) o etiqueta.
  const RANGO: ClaseRed[] = ['ninguna', 'etiqueta', 'alimentacion', 'tierra']
  const clasificar = (k: number | undefined, clase: ClaseRed, marca?: string): void => {
    const r = k === undefined ? undefined : redes[k]
    if (!r) return
    if (RANGO.indexOf(clase) > RANGO.indexOf(r.clase ?? 'ninguna')) {
      r.clase = clase
      r.marca = marca
    } else if (clase === r.clase && r.marca === undefined) r.marca = marca
  }
  redes.forEach((r, k) => r.tierra && clasificar(k, 'tierra'))
  // Una tierra con otro nombre (GNDPWR, GNDA) es otra red en el origen: se nombra con etiquetas para no unirla a la tierra.
  for (const t of ajeno.dibujo?.terminales ?? []) {
    const k = t.tipo === 'tierra' ? (porNombre.get(t.nombre.toLowerCase()) ?? redes.findIndex((r) => r.tierra)) : porNombre.get(t.nombre.toLowerCase())
    clasificar(k, t.tipo === 'tierra' ? (k !== undefined && redes[k]?.tierra ? 'tierra' : 'etiqueta') : t.tipo === 'alimentacion' ? 'alimentacion' : 'etiqueta', t.nombre)
  }
  // Una bandera con nombre de voltaje («4V») solo nombra un punto: alimenta si una fuente de CD la sostiene.
  for (const et of ajeno.dibujo?.etiquetas ?? []) clasificar(porNombre.get(et.nombre.toLowerCase()), SUMINISTRO.test(et.nombre.trim()) && voltajeDeNombre(et.nombre) === null ? 'alimentacion' : 'etiqueta', et.nombre)
  for (const el of elems)
    if (el.marca) for (const k of el.redes.values()) clasificar(k, el.def.modelo?.tipo === 'tierra' ? 'tierra' : 'alimentacion', el.def.modelo?.tipo === 'alimentacion' ? String(el.pieza.props.nombre ?? '') : undefined)

  // Una fuente de CD entre tierra y una red con nombre es el voltaje de ese riel: va a la tabla de alimentaciones, no es pieza.
  const alimentaciones: { nombre: string; voltaje: string }[] = []
  const conNombre = (k: number | undefined): k is number => k !== undefined && (redes[k]?.clase === 'alimentacion' || redes[k]?.clase === 'etiqueta') && !redes[k]!.tierra
  const aTierra = (k: number | undefined): boolean => k !== undefined && (redes[k]!.tierra || redes[k]!.clase === 'tierra')
  // Una fuente que un análisis cita (barrido, entrada de CA) o cuya corriente se grafica (`.probe i(v1)`) se queda como pieza.
  const enAnalisis = (ref: string): boolean => {
    const r = ref.toLowerCase()
    return ajeno.directivas.some((d) => d.tipo === 'analisis' && (JSON.stringify(d.parametros).toLowerCase().includes(`"${r}"`) || d.trazas.some((t) => [r, `i(${r})`].includes(t.trim().toLowerCase()))))
  }
  const comoAlimentacion = (k: number, v: number, quien: string): boolean => {
    const r = redes[k]!
    const nombre = (r.marca || r.nombre || nombresDeEtiqueta(redes)[k]!).trim().slice(0, 24)
    const delNombre = voltajeDeNombre(nombre)
    if (!nombre || (delNombre !== null && Math.abs(delNombre - v) > 1e-9)) return false
    const previa = alimentaciones.find((a) => claveDeNombre(a.nombre) === claveDeNombre(nombre))
    if (previa && Number(previa.voltaje) !== v) return false
    if (!previa && delNombre === null) alimentaciones.push({ nombre, voltaje: String(v) })
    r.clase = 'alimentacion'
    r.marca = nombre
    avisos.push(`${quien} daba ${v} V a ${nombre}: ahora es el voltaje de ese riel de alimentación.`)
    return true
  }
  for (const el of [...elems]) {
    if (el.def.id !== 'fuente-dc' || !el.ajena || el.ajena.props.ac !== undefined || enAnalisis(el.ajena.ref)) continue
    const mas = el.redes.get('+'), menos = el.redes.get('-')
    const v = Number(el.pieza.props.voltaje)
    if (!Number.isFinite(v)) continue
    const lado = aTierra(menos) && conNombre(mas) ? { k: mas, v } : aTierra(mas) && conNombre(menos) ? { k: menos, v: -v } : null
    if (!lado || elems.some((o) => o !== el && o.def.modelo?.tipo === 'V' && [...o.redes.values()].includes(lado.k))) continue
    if (!comoAlimentacion(lado.k, lado.v, el.pieza.ref)) continue
    elems.splice(elems.indexOf(el), 1)
    for (const r of redes) r.miembros = r.miembros.filter((m) => m.el !== el)
  }

  for (const i of ajeno.instrumentos) {
    if (i.tipo === 'generador') {
      if (i.nombre && porRefAjena.has(i.nombre)) {
        // Fuente de un solo terminal (Falstad): su otro polo va a la referencia, que suele ser tierra.
        const el = porRefAjena.get(i.nombre)!
        const neg = el.def.pines.find((q) => q.id === 'COM' || q.id === '-')?.id
        if (neg && el.redes.size && !el.redes.has(neg)) conectar(el, neg, i.referencia ?? '0')
        continue
      }
      const red = porNombre.get(i.red.toLowerCase())
      if (i.forma === 'cd' && typeof i.parametros.valor === 'number' && conNombre(red) && esTierra(i.referencia ?? '0') && comoAlimentacion(red, i.parametros.valor, `El generador ${i.nombre}`)) continue
      const gp = piezaDeGenerador(i)
      avisos.push(...gp.avisos)
      const el = nuevoElem(gp.tipo, gp.props)
      if (!el) continue
      const negativo = lib.get(gp.tipo)!.pines.find((q) => q.id === 'COM' || q.id === '-')?.id
      const positivo = lib.get(gp.tipo)!.pines.find((q) => q.id === '+')?.id
      if (!positivo || !negativo) continue
      conectar(el, positivo, i.red)
      conectar(el, negativo, i.referencia ?? '0')
      // El generador de Proteus se engancha al cable en su punto: ahí va su polo positivo.
      if (i.x !== undefined && i.y !== undefined) {
        el.deseados = new Map([[positivo, proyectar(ajeno, i.x, i.y)]])
        el.origen = new Map([[positivo, { x: i.x, y: i.y }]])
      }
    } else if (i.tipo === 'sonda') {
      if (i.red === undefined) avisos.push(`La sonda ${i.nombre} no dice qué red mide y se omitió.`)
      else {
        // Dos sondas del origen sobre la misma red darían dos marcas encimadas.
        const red = redPorNombre(i.red)
        if (!sondasPorHacer.some((s) => s.tipo === i.magnitud && s.red === red)) sondasPorHacer.push({ tipo: i.magnitud, red, nombre: i.nombre })
      }
    } else if (i.clase === 'osciloscopio') {
      const props = propsDeOsciloscopio(i)
      if (i.redes.length > 4) avisos.push(`El osciloscopio ${i.nombre} mide ${i.redes.length} redes y Kirchi tiene 4 canales: se midieron las primeras.`)
      if (i.ventana) avisos.push(`La gráfica ${i.nombre} pasó a un osciloscopio y a un análisis transitorio.`)
      const el = nuevoElem('osciloscopio', props, true)
      if (el) {
        // Donde estaba el instrumento: sus cuatro entradas a la izquierda de ese punto, como el símbolo de Kirchi.
        if (i.x !== undefined && i.y !== undefined) {
          const c = proyectar(ajeno, i.x, i.y)
          el.deseados = new Map(el.def.pines.map((q) => [q.id, { x: c.x + q.x, y: c.y + q.y }]))
        }
        escopios.push({ el, entradas: i.redes.slice(0, 4).map((r, k) => ({ entrada: 'ABCD'[k]!, red: redPorNombre(r) })) })
      }
    } else {
      const el = nuevoElem('multimetro', { modo: i.clase === 'amperimetro' ? 'A DC' : 'V DC' }, true)
      if (!el) continue
      if (i.clase === 'amperimetro') avisos.push(`El amperímetro ${i.nombre} queda en paralelo entre sus redes: muévelo a la rama que mide.`)
      deInstrumento.push({ el, tipo: 'multimetro', entradas: [{ entrada: '+', red: redPorNombre(i.redes[0] ?? '0') }, { entrada: 'COM', red: redPorNombre(i.redes[1] ?? '0') }] })
    }
  }


  // Acomodo: `acomodar` reemplaza `pieza` de cada elemento por una copia en su lugar.
  const tierras = new Set<number>(redes.flatMap((r, k) => (r.tierra ? [k] : [])))
  // Con dibujo del origen, los terminales y tierras se ponen con sus cables: no pasan por el acomodo.
  const original = !!ajeno.dibujo && elems.some((e) => !e.marca && e.deseados?.size)
  const conDibujo = (e: Elem): boolean => original && !!e.marca && !!e.origen?.size
  const encuadre = acomodar(elems.filter((e) => !conDibujo(e)), tierras, lib)

  // Cables.
  const doc: Documento = documentoVacio()
  for (const e of elems) if (!conDibujo(e)) doc.piezas[e.pieza.id] = e.pieza
  const nombres = nombresDeEtiqueta(redes)
  const nuevaPieza = (tipo: 'tierra' | 'alimentacion', props: Record<string, string>): Pieza => ({ id: gen('p'), tipo, ref: refNueva(lib.get(tipo)?.prefijo ?? 'X'), x: 0, y: 0, rot: 0, espejo: false, props })
  let cables: { cables: Cable[]; etiquetas: Etiqueta[]; tierras: Pieza[]; conEtiqueta: { nombre: string; piezas: string[] }[]; avisos: string[] }
  if (original) {
    const t = trazar({
      doc,
      lib,
      gen,
      proyectar: (x, y) => {
        const p = proyectar(ajeno, x, y)
        return { x: p.x * encuadre.escala + encuadre.dx, y: p.y * encuadre.escala + encuadre.dy }
      },
      cables: ajeno.dibujo!.cables,
      uniones: ajeno.dibujo!.uniones,
      ...origenDelDibujo(ajeno, elems, redes, porNombre),
      redes: redes.map((r, k): RedTrazado => ({
        nombre: nombres[k]!,
        marca: (r.marca || r.nombre || nombres[k]!).trim().slice(0, 24),
        clase: r.tierra ? 'tierra' : (r.clase ?? 'ninguna'),
        pines: r.miembros.filter((m) => !m.el.virtual && !conDibujo(m.el)).map((m) => ({ pieza: m.el.pieza, pin: m.pin }))
      })),
      nuevaPieza
    })
    // Las marcas del origen que se pusieron quedan en su lugar; las que no, se quitan.
    const puestas = new Map(t.marcas.map((m) => [m.id, m]))
    for (let i = elems.length - 1; i >= 0; i--) {
      const e = elems[i]!
      if (!conDibujo(e)) continue
      const m = puestas.get(e.pieza.id)
      if (m) (e.pieza = m), puestas.delete(m.id)
      else elems.splice(i, 1)
    }
    cables = { cables: t.cables, etiquetas: t.etiquetas, tierras: [...puestas.values()], conEtiqueta: t.conEtiqueta, avisos: t.avisos }
    for (const r of redes) r.miembros = r.miembros.filter((m) => elems.includes(m.el))
    encuadrarEnPositivo(elems.map((e) => e.pieza).concat(cables.tierras), cables.cables, cables.etiquetas, lib)
  } else {
    const paraCablear: RedParaCablear[] = redes.map((r, k) => ({ nombre: nombres[k]!, tierra: r.tierra, pines: r.miembros.map((m) => ({ pieza: m.el.pieza, pin: m.pin })) }))
    cables = cablear(doc, lib, paraCablear, gen, () => nuevaPieza('tierra', {}))
  }
  avisos.push(...cables.avisos)
  informe.redesConEtiqueta = cables.conEtiqueta.map((r) => ({ nombre: r.nombre.slice(0, 300), ids: r.piezas.slice(0, 200) }))
  if (original) for (const p of [...elems.map((e) => e.pieza), ...cables.tierras]) doc.piezas[p.id] = p

  // Sondas.
  const puntoDeRed = (k: number): Punto | undefined => {
    const m = redes[k]?.miembros.find((x) => !x.el.virtual)
    const def = m && lib.get(m.el.pieza.tipo)
    const q = m && def ? pinesEnMundo(m.el.pieza, def).find((x) => x.id === m.pin) : undefined
    if (!q || !m) return undefined
    // La bandera va donde tenga lugar: en un pin pegado a una pieza taparía su texto.
    conSonda ??= calcularConexiones(doc, lib)
    return puntoParaSonda(doc, lib, conSonda, conSonda.redDePin.get(clavePin(m.el.pieza.id, m.pin)), { x: q.x, y: q.y }, sondas)
  }
  let conSonda: Conexiones | undefined
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
  for (const o of escopios) {
    const def = lib.get('osciloscopio')
    for (const e of o.entradas) {
      const q = def ? pinesEnMundo(o.el.pieza, def).find((x) => x.id === e.entrada) : undefined
      const nombre = nombres[e.red]
      const m = redes[e.red]?.tierra ? undefined : redes[e.red]?.miembros.find((x) => !x.el.virtual)
      if (!q || !nombre || !m) {
        avisos.push(`La entrada ${e.entrada} de ${o.el.pieza.ref} mide una red sin piezas o la tierra y quedó sin conectar.`)
        continue
      }
      const pm = lib.get(m.el.pieza.tipo)
      const qm = pm ? pinesEnMundo(m.el.pieza, pm).find((x) => x.id === m.pin) : undefined
      // La red lleva su nombre en una etiqueta (si aún no tiene) y la entrada otra igual: el nombre las une sin cables largos.
      if (qm && !cables.etiquetas.some((t) => t.nombre === nombre)) cables.etiquetas.push({ id: gen('e'), nombre, x: qm.x, y: qm.y, rot: giroDeEtiqueta(doc, lib, qm, nombre) })
      cables.etiquetas.push({ id: gen('e'), nombre, x: q.x, y: q.y, rot: giroDeEtiqueta(doc, lib, q, nombre) })
    }
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
  const iniciales = condicionesIniciales(ajeno, elems, redes)
  avisos.push(...iniciales.avisos)
  const sinModelo = new Set(elems.filter((e) => e.eq?.tipo !== 'exacta' && !e.pieza.spice).flatMap((e) => [e.ajena?.modelo, e.ajena?.tipo.split(':').pop()].filter((x): x is string => !!x).map((x) => x.toLowerCase())))
  for (const d of ajeno.directivas) {
    if (d.tipo === 'analisis') {
      const r = analisisDe(d, ctx)
      avisos.push(...r.avisos)
      if (!r.entrada) continue
      let nombre = r.entrada.nombre
      for (let n = 2; informe.analisis.some((a) => a.nombre === nombre); n++) nombre = `${r.entrada.nombre} ${n}`
      analisis.push({ ...r.entrada, nombre })
      informe.analisis.push({ nombre, de: describirAnalisis(r.entrada.config as Parameters<typeof describirAnalisis>[0]) })
    } else if (d.tipo === 'otra') {
      informe.omitidas.push(d.texto.slice(0, 300))
      if (/^\.nodeset(\s|$)/i.test(d.texto)) avisos.push(`${d.texto.trim().slice(0, 80)}: es una ayuda de convergencia de SPICE y Kirchi no la usa.`)
    }
    else if (d.tipo === 'subcircuito') informe.omitidas.push(`.subckt ${d.nombre}`.slice(0, 300))
    else if (sinModelo.has(d.nombre.toLowerCase())) informe.omitidas.push(`.model ${d.nombre}`.slice(0, 300))
  }

  // Una red graficada lleva su nombre del origen en una etiqueta, para que la traza no dependa del número de red.
  const yaEtiquetadas = new Set(cables.etiquetas.map((e) => e.nombre))
  for (const [k, m] of trazadas) {
    const def = lib.get(m.el.pieza.tipo)
    const q = def ? pinesEnMundo(m.el.pieza, def).find((x) => x.id === m.pin) : undefined
    if (!q || yaEtiquetadas.has(nombres[k]!)) continue
    cables.etiquetas.push({ id: gen('e'), nombre: nombres[k]!, x: q.x, y: q.y, rot: giroDeEtiqueta(doc, lib, q, nombres[k]!) })
  }

  const piezas = [...elems.map((e) => e.pieza), ...cables.tierras]
  informe.avisos = recortarAvisos(avisos)
  return {
    fragmento: { origen: { x: 0, y: 0 }, piezas, cables: cables.cables, etiquetas: cables.etiquetas, notas: [], figuras: [], ...(sondas.length ? { sondas } : {}) },
    alimentaciones,
    analisis,
    informe,
    avisos
  }
}

/** Los parámetros propios de un transistor: los del `.model` que nombra, o los `Sim.Params` de KiCad. */
function modeloPropio(def: PiezaDef, p: PiezaAjena, modelos: Map<string, Extract<DirectivaAjena, { tipo: 'modelo' }>>): ModeloDelArchivo | null {
  const m = def.modelo
  if (m?.tipo !== 'bjt' && m?.tipo !== 'mosfet') return null
  const polaridad = m.tipo === 'bjt' ? m.pnp : m.pmos
  const deArchivo = modeloDelArchivo(modelos, p.modelo ?? p.valor, m.tipo, polaridad)
  if (deArchivo) return deArchivo
  const dispositivo = p.props['Sim.Device']
  const inline = p.props['Sim.Params']
  if (!dispositivo || !inline) return null
  const valores: Record<string, string> = {}
  for (const x of inline.matchAll(/([A-Za-z_]\w*)\s*=\s*(\S+)/g)) valores[x[1]!] = x[2]!
  return deParametros(p.props['Sim.Name'] ?? dispositivo, dispositivo, valores, m.tipo, polaridad)
}

/** Propiedades de un osciloscopio importado: un canal por red y, si viene de una gráfica, su base de tiempo y la escala que
 * deja ver su rango vertical. */
function propsDeOsciloscopio(i: Extract<InstrumentoAjeno, { tipo: 'virtual' }>): Record<string, string> {
  const canales = ['a', 'b', 'c', 'd']
  const props: Record<string, string> = {}
  const n = Math.min(4, i.redes.length)
  for (let k = 0; k < n; k++) props[`${canales[k]}_on`] = 'encendido'
  if (i.ventana) {
    const base = valoresSerie(BASE_RANGO[0], BASE_RANGO[1]).find((b) => b * DIVISIONES_H >= (i.ventana![1] - i.ventana![0]) * (1 - 1e-9)) ?? BASE_RANGO[1]
    props.base = textoNumero(base)
    if (i.rangoY) {
      // La escala más fina que deja el rango entero en las ocho divisiones de alto, con un 10 % de aire, y centrado.
      const [minimo, maximo] = i.rangoY
      const vdiv = valoresSerie(VDIV_RANGO[0], VDIV_RANGO[1]).find((v) => v * DIVISIONES_V >= (maximo - minimo) * 1.1 * (1 - 1e-9)) ?? VDIV_RANGO[1]
      const pos = Math.min(POS_RANGO[1], Math.max(POS_RANGO[0], Math.round(-((maximo + minimo) / 2) / vdiv / 0.2) * 0.2))
      for (let k = 0; k < n; k++) {
        props[`${canales[k]}_vdiv`] = textoNumero(vdiv)
        props[`${canales[k]}_pos`] = String(Number(pos.toFixed(1)) || 0)
      }
    }
  }
  return props
}

/** Hay una sonda de corriente que colocar: solo entonces vale la pena calcular las redes del dibujo. */
const s_hayCorriente = (a: CircuitoAjeno): boolean => a.instrumentos.some((i) => i.tipo === 'sonda' && i.magnitud === 'corriente')

/** Pines y marcas del dibujo del origen, con sus coordenadas originales, para trazar sus cables. */
function origenDelDibujo(ajeno: CircuitoAjeno, elems: Elem[], redes: Red[], porNombre: Map<string, number>): { pines: PinOriginal[]; marcas: MarcaOriginal[] } {
  const pines: PinOriginal[] = []
  const marcas: MarcaOriginal[] = []
  // Las piezas de marca primero: en un mismo punto gana la del origen (riel de Falstad) sobre su terminal.
  for (const el of elems) {
    if (!el.origen || el.virtual) continue
    for (const [pin, o] of el.origen) {
      const red = el.redes.get(pin)
      if (red === undefined) continue
      if (el.marca) marcas.push({ ...o, red, tipo: el.def.modelo?.tipo === 'tierra' ? 'tierra' : 'alimentacion', pieza: el.pieza })
      else pines.push({ ...o, pieza: el.pieza, pin, red })
    }
  }
  const tierra = redes.findIndex((r) => r.tierra)
  for (const t of ajeno.dibujo?.terminales ?? []) {
    const red = t.tipo === 'tierra' ? (porNombre.get(t.nombre.toLowerCase()) ?? tierra) : (porNombre.get(t.nombre.toLowerCase()) ?? -1)
    const tipo = t.tipo === 'tierra' ? (redes[red]?.tierra ? 'tierra' : 'etiqueta') : t.tipo === 'alimentacion' ? 'alimentacion' : 'etiqueta'
    marcas.push({ x: t.x, y: t.y, red, tipo })
  }
  for (const e of ajeno.dibujo?.etiquetas ?? []) marcas.push({ x: e.x, y: e.y, red: porNombre.get(e.nombre.toLowerCase()) ?? -1, tipo: 'etiqueta', ...(e.giro !== undefined ? { giro: e.giro } : {}) })
  return { pines, marcas }
}

/** Lleva todo lo trazado a positivo, a 8 unidades del borde, moviendo en la rejilla. */
function encuadrarEnPositivo(piezas: Pieza[], cables: Cable[], etiquetas: Etiqueta[], lib: Map<string, PiezaDef>): void {
  let minX = Infinity, minY = Infinity
  for (const p of piezas) {
    const def = lib.get(p.tipo)
    const c = def ? cajaEnMundo(p, def) : { minX: p.x, minY: p.y }
    minX = Math.min(minX, c.minX)
    minY = Math.min(minY, c.minY)
  }
  for (const c of cables) for (const q of c.puntos) (minX = Math.min(minX, q.x)), (minY = Math.min(minY, q.y))
  for (const e of etiquetas) (minX = Math.min(minX, e.x)), (minY = Math.min(minY, e.y))
  if (!Number.isFinite(minX)) return
  const paso = (v: number): number => (v > 0 ? Math.ceil(v / 2) * 2 : 0)
  const dx = paso(8 - minX), dy = paso(8 - minY)
  if (!dx && !dy) return
  for (const p of piezas) (p.x += dx), (p.y += dy)
  for (const c of cables) c.puntos = c.puntos.map((q) => ({ x: q.x + dx, y: q.y + dy }))
  for (const e of etiquetas) (e.x += dx), (e.y += dy)
}
