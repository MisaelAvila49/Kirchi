/** Anotaciones de una figura (textos, flechas, etiquetas de valor, títulos y estilo de cada eje), guardadas con el aspecto de la gráfica. Nunca un color escrito. Lo que viene de un archivo no es confiable: todo se acota. */
import { TONOS_FIGURA, type TonoFigura } from '../ajustes'
import type { PesoTexto } from './aspecto'

/** Los mismos pesos de `aspecto.ts`; aquí no se importan para no cerrar un ciclo entre los dos módulos. */
const PESOS_TEXTO: readonly PesoTexto[] = ['normal', 'medio', 'negrita']

export const MAX_TEXTOS = 12
export const MAX_FLECHAS = 12
export const MAX_ETIQUETAS = 12
export const MAX_EJES_ESTILO = 16
/** Largo de un texto puesto a mano y de un título de eje. */
export const LARGO_TEXTO_NOTA = 120
export const LARGO_TITULO_EJE = 40
/** Tamaño de un texto de la figura en px de la figura (la figura mide 800 o 900 px de ancho). */
export const TAM_NOTA_RANGO = [8, 48] as const
export const TAM_NOTA_BASE = 16
export const GROSOR_FLECHA_RANGO = [1, 6] as const
/** Cuánto puede alejarse de su punto el globo de una etiqueta de valor, en px de la figura. */
export const DESPLAZAMIENTO_MAX = 600
/** Una nota puede salir un poco del lienzo (se arrastra de vuelta), no ir al infinito. */
export const FRACCION_RANGO = [-0.25, 1.25] as const
/** Largo máximo del texto guardado en la propiedad `notas` del osciloscopio. */
export const LARGO_MAX_NOTAS = 6000
/** Los dos títulos de la figura que se pueden reescribir y reestilizar. */
export const TEXTOS_FIJOS = ['titulo', 'subtitulo'] as const
export type TextoFijo = (typeof TEXTOS_FIJOS)[number]

export interface NotaTexto {
  id: string
  texto: string
  /** Posición del texto como fracción del ancho y del alto de la figura (esquina izquierda, línea base media). */
  fx: number
  fy: number
  tam: number
  negrita: boolean
  tono: TonoFigura
}

export interface NotaFlecha {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  tono: TonoFigura
  grosor: number
}

export interface NotaEtiqueta {
  id: string
  /** La traza a la que está pegada (su clave o letra) y el valor del eje horizontal del punto elegido. */
  traza: string
  x: number
  /** Dónde queda el globo respecto de su punto, en px de la figura. */
  dx: number
  dy: number
  /** Tono del globo; null es el de la traza. */
  tono: TonoFigura | null
}

/** Cómo se escribe uno de los dos títulos de la figura: el texto propio (ausente es el automático; una cadena vacía lo deja en blanco) y su letra. */
export interface EstiloTexto {
  texto?: string
  tam?: number
  negrita?: boolean
  tono?: TonoFigura
}

/** Lo propio de un eje: `x` es el horizontal; cualquier otro es la traza o el canal del eje vertical. */
export interface EstiloEje {
  titulo?: string
  /** Color de sus números y título; ausente es el de siempre (el del texto de los ejes o el de la traza). */
  tono?: TonoFigura
  peso?: PesoTexto
  tam?: number
  /** Grosor propio de la línea del eje en px; ausente es el general de los ejes. */
  grosor?: number
}

export interface Anotaciones {
  textos: NotaTexto[]
  flechas: NotaFlecha[]
  etiquetas: NotaEtiqueta[]
  estilos: Partial<Record<TextoFijo, EstiloTexto>>
  ejes: Record<string, EstiloEje>
}

export const anotacionesVacias = (): Anotaciones => ({ textos: [], flechas: [], etiquetas: [], estilos: {}, ejes: Object.create(null) })

export const hayAnotaciones = (a: Anotaciones | undefined | null): boolean =>
  !!a && (a.textos.length > 0 || a.flechas.length > 0 || a.etiquetas.length > 0 || Object.keys(a.estilos).length > 0 || Object.keys(a.ejes).length > 0)

type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string }
const mal = (error: string): { ok: false; error: string } => ({ ok: false, error })

const ID = /^[a-z][a-z0-9]{0,9}$/
const esTono = (v: unknown): v is TonoFigura => typeof v === 'string' && (TONOS_FIGURA as readonly string[]).includes(v)
const esPeso = (v: unknown): v is PesoTexto => typeof v === 'string' && (PESOS_TEXTO as readonly string[]).includes(v)
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const enRango = (v: unknown, r: readonly [number, number]): v is number => finito(v) && v >= r[0] && v <= r[1]
const entero = (v: unknown, r: readonly [number, number]): v is number => enRango(v, r) && Number.isInteger(v)
/** Sin caracteres de control (no entran a archivos ni diálogos) y con el largo acotado. */
const limpio = (v: unknown, largo: number): string | null => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, largo) : null)
const r4 = (v: number): number => Math.round(v * 10000) / 10000

type Salida<T> = { ok: true; valor: T } | { ok: false; error: string }

/** Revisa una lista de objetos con una función por elemento; con `estricto`, el primer elemento malo es un error, si no se descarta. */
function lista<T>(x: unknown, tope: number, nombre: string, estricto: boolean, uno: (o: Record<string, unknown>) => Salida<T>, idDe: (v: T) => string): Validacion<T[]> {
  if (x === undefined) return { ok: true, valor: [] }
  if (!Array.isArray(x)) return mal(`Las ${nombre} de la figura no tienen la forma esperada.`)
  if (x.length > tope && estricto) return mal(`La figura guarda ${x.length} ${nombre} y el tope es ${tope}.`)
  const salida: T[] = []
  const vistos = new Set<string>()
  for (const e of x) {
    if (salida.length >= tope) break
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      if (estricto) return mal(`Una de las ${nombre} de la figura no tiene la forma esperada.`)
      continue
    }
    const r = uno(e as Record<string, unknown>)
    if (!r.ok) {
      if (estricto) return mal(r.error)
      continue
    }
    const id = idDe(r.valor)
    if (vistos.has(id)) continue
    vistos.add(id)
    salida.push(r.valor)
  }
  return { ok: true, valor: salida }
}

const texto = (o: Record<string, unknown>): Salida<NotaTexto> => {
  const t = limpio(o.texto, LARGO_TEXTO_NOTA)
  if (typeof o.id !== 'string' || !ID.test(o.id)) return mal('Un texto de la figura no tiene un nombre válido.')
  if (t === null || t === '') return mal('Un texto de la figura está vacío.')
  if (!enRango(o.fx, FRACCION_RANGO) || !enRango(o.fy, FRACCION_RANGO)) return mal('Un texto de la figura queda demasiado lejos del lienzo.')
  if (!entero(o.tam, TAM_NOTA_RANGO)) return mal(`El tamaño de un texto de la figura debe ser un entero de ${TAM_NOTA_RANGO[0]} a ${TAM_NOTA_RANGO[1]} px.`)
  if (typeof o.negrita !== 'boolean') return mal('Un texto de la figura debe decir si va en negrita.')
  if (!esTono(o.tono)) return mal('El tono de un texto de la figura no existe.')
  return { ok: true, valor: { id: o.id, texto: t, fx: r4(o.fx), fy: r4(o.fy), tam: o.tam, negrita: o.negrita, tono: o.tono } }
}

const flecha = (o: Record<string, unknown>): Salida<NotaFlecha> => {
  if (typeof o.id !== 'string' || !ID.test(o.id)) return mal('Una flecha de la figura no tiene un nombre válido.')
  for (const k of ['x1', 'y1', 'x2', 'y2'] as const) if (!enRango(o[k], FRACCION_RANGO)) return mal('Una flecha de la figura queda demasiado lejos del lienzo.')
  if (!esTono(o.tono)) return mal('El tono de una flecha de la figura no existe.')
  if (!enRango(o.grosor, GROSOR_FLECHA_RANGO)) return mal(`El grosor de una flecha debe estar entre ${GROSOR_FLECHA_RANGO[0]} y ${GROSOR_FLECHA_RANGO[1]} px.`)
  return { ok: true, valor: { id: o.id, x1: r4(o.x1 as number), y1: r4(o.y1 as number), x2: r4(o.x2 as number), y2: r4(o.y2 as number), tono: o.tono, grosor: o.grosor } }
}

const etiqueta = (o: Record<string, unknown>): Salida<NotaEtiqueta> => {
  if (typeof o.id !== 'string' || !ID.test(o.id)) return mal('Una etiqueta de valor no tiene un nombre válido.')
  const traza = limpio(o.traza, 80)
  if (!traza) return mal('Una etiqueta de valor no dice a qué traza pertenece.')
  if (!finito(o.x)) return mal('Una etiqueta de valor no tiene un valor en el eje horizontal.')
  if (!enRango(o.dx, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX]) || !enRango(o.dy, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX])) return mal('El globo de una etiqueta de valor queda demasiado lejos de su punto.')
  if (o.tono !== null && o.tono !== undefined && !esTono(o.tono)) return mal('El tono de una etiqueta de valor no existe.')
  return { ok: true, valor: { id: o.id, traza, x: o.x, dx: Math.round(o.dx), dy: Math.round(o.dy), tono: (o.tono as TonoFigura | null | undefined) ?? null } }
}

function estiloTexto(x: unknown, estricto: boolean): Validacion<EstiloTexto> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return mal('El estilo de un título de la figura no tiene la forma esperada.')
  const o = x as Record<string, unknown>
  const e: EstiloTexto = {}
  if (o.texto !== undefined) {
    const t = limpio(o.texto, LARGO_TEXTO_NOTA)
    if (t === null) return mal('El texto de un título de la figura debe ser texto.')
    // La cadena vacía se conserva: es un título en blanco a propósito, distinto del automático.
    e.texto = t
  }
  if (o.tam !== undefined) {
    if (!entero(o.tam, TAM_NOTA_RANGO)) {
      if (estricto) return mal(`El tamaño de un título debe ser un entero de ${TAM_NOTA_RANGO[0]} a ${TAM_NOTA_RANGO[1]} px.`)
    } else e.tam = o.tam
  }
  if (o.negrita !== undefined) {
    if (typeof o.negrita !== 'boolean') {
      if (estricto) return mal('Un título de la figura debe decir si va en negrita.')
    } else e.negrita = o.negrita
  }
  if (o.tono !== undefined) {
    if (!esTono(o.tono)) {
      if (estricto) return mal('El tono de un título de la figura no existe.')
    } else e.tono = o.tono
  }
  return { ok: true, valor: e }
}

function estiloEje(x: unknown, estricto: boolean): Validacion<EstiloEje> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return mal('El estilo de un eje de la figura no tiene la forma esperada.')
  const o = x as Record<string, unknown>
  const e: EstiloEje = {}
  if (o.titulo !== undefined) {
    const t = limpio(o.titulo, LARGO_TITULO_EJE)
    if (t === null) return mal('El título de un eje debe ser texto.')
    if (t) e.titulo = t
  }
  if (o.tono !== undefined) {
    if (!esTono(o.tono)) {
      if (estricto) return mal('El tono de un eje de la figura no existe.')
    } else e.tono = o.tono
  }
  if (o.peso !== undefined) {
    if (!esPeso(o.peso)) {
      if (estricto) return mal('El grosor del texto de un eje debe ser normal, medio o negrita.')
    } else e.peso = o.peso
  }
  if (o.tam !== undefined) {
    if (!entero(o.tam, [9, 24])) {
      if (estricto) return mal('El tamaño del texto de un eje debe ser un entero de 9 a 24 px.')
    } else e.tam = o.tam
  }
  if (o.grosor !== undefined) {
    if (!enRango(o.grosor, [0.5, 4])) {
      if (estricto) return mal('El grosor de la línea de un eje debe estar entre 0.5 y 4 px.')
    } else e.grosor = o.grosor
  }
  return { ok: true, valor: e }
}

function normalizar(x: unknown, estricto: boolean): Validacion<Anotaciones> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return mal('Las anotaciones de la figura no tienen la forma esperada.')
  const o = x as Record<string, unknown>
  const a = anotacionesVacias()
  const t = lista(o.textos, MAX_TEXTOS, 'textos', estricto, texto, (v) => v.id)
  if (!t.ok) return t
  const f = lista(o.flechas, MAX_FLECHAS, 'flechas', estricto, flecha, (v) => v.id)
  if (!f.ok) return f
  const e = lista(o.etiquetas, MAX_ETIQUETAS, 'etiquetas de valor', estricto, etiqueta, (v) => v.id)
  if (!e.ok) return e
  a.textos = t.valor
  a.flechas = f.valor
  a.etiquetas = e.valor
  if (o.estilos !== undefined) {
    if (typeof o.estilos !== 'object' || o.estilos === null || Array.isArray(o.estilos)) return mal('Los títulos de la figura no tienen la forma esperada.')
    const s = o.estilos as Record<string, unknown>
    for (const k of TEXTOS_FIJOS) {
      if (!Object.hasOwn(s, k)) continue
      const r = estiloTexto(s[k], estricto)
      if (!r.ok) {
        if (estricto) return r
        continue
      }
      if (Object.keys(r.valor).length > 0) a.estilos[k] = r.valor
    }
  }
  if (o.ejes !== undefined) {
    if (typeof o.ejes !== 'object' || o.ejes === null || Array.isArray(o.ejes)) return mal('Los ejes de la figura no tienen la forma esperada.')
    const entradas = Object.entries(o.ejes as Record<string, unknown>)
    if (entradas.length > MAX_EJES_ESTILO && estricto) return mal(`La figura guarda el estilo de ${entradas.length} ejes y el tope es ${MAX_EJES_ESTILO}.`)
    for (const [k, v] of entradas) {
      if (Object.keys(a.ejes).length >= MAX_EJES_ESTILO) break
      const id = limpio(k, 80)
      if (!id || id === '__proto__') continue
      const r = estiloEje(v, estricto)
      if (!r.ok) {
        if (estricto) return r
        continue
      }
      if (Object.keys(r.valor).length > 0) a.ejes[id] = r.valor
    }
  }
  return { ok: true, valor: a }
}

/** Revisa las anotaciones de un análisis (datos de un `.kir`): un error dice qué está mal; lo bueno sale como copia limpia. */
export const validarAnotaciones = (x: unknown): Validacion<Anotaciones> => normalizar(x, true)

const sinVacios = (a: Anotaciones): Record<string, unknown> => ({
  ...(a.textos.length ? { textos: a.textos } : {}),
  ...(a.flechas.length ? { flechas: a.flechas } : {}),
  ...(a.etiquetas.length ? { etiquetas: a.etiquetas } : {}),
  ...(Object.keys(a.estilos).length ? { estilos: a.estilos } : {}),
  ...(Object.keys(a.ejes).length ? { ejes: a.ejes } : {})
})

/** Lo que se guarda en un análisis: solo lo que no está vacío; undefined si no hay nada. */
export const anotacionesParaDoc = (a: Anotaciones | undefined | null): Record<string, unknown> | undefined => (hayAnotaciones(a) ? sinVacios(a!) : undefined)

/** El texto de la propiedad `notas` del osciloscopio. Sin anotaciones es «ninguna» (lo de omisión). Error si pasa del largo permitido. */
export function escribirAnotaciones(a: Anotaciones): { ok: true; texto: string } | { ok: false; error: string } {
  if (!hayAnotaciones(a)) return { ok: true, texto: 'ninguna' }
  const t = JSON.stringify(sinVacios(a))
  if (t.length > LARGO_MAX_NOTAS) return mal(`Las anotaciones ocupan ${t.length} caracteres y la pantalla guarda hasta ${LARGO_MAX_NOTAS}. Quita alguna.`)
  return { ok: true, texto: t }
}

/** Lee la propiedad `notas`: lo que no se entiende se ignora (el archivo puede venir de otra versión o a mano). */
export function leerAnotaciones(t: string | undefined | null): Anotaciones {
  if (!t || t === 'ninguna' || t.length > LARGO_MAX_NOTAS * 2) return anotacionesVacias()
  try {
    const r = normalizar(JSON.parse(t), false)
    return r.ok ? r.valor : anotacionesVacias()
  } catch {
    return anotacionesVacias()
  }
}

/** Una copia que no comparte nada con la original (el historial del editor guarda estados enteros). */
export function copiarAnotaciones(a: Anotaciones): Anotaciones {
  return {
    textos: a.textos.map((t) => ({ ...t })),
    flechas: a.flechas.map((f) => ({ ...f })),
    etiquetas: a.etiquetas.map((e) => ({ ...e })),
    estilos: Object.fromEntries(Object.entries(a.estilos).map(([k, v]) => [k, { ...v }])),
    ejes: Object.assign(Object.create(null), Object.fromEntries(Object.entries(a.ejes).map(([k, v]) => [k, { ...v }])))
  }
}

/** Un nombre libre para una nota nueva («t1», «f2», «e3»…). */
export function idNuevo(prefijo: 't' | 'f' | 'e', usados: readonly string[]): string {
  for (let n = 1; ; n++) {
    const id = `${prefijo}${n}`
    if (!usados.includes(id)) return id
  }
}

/** Las anotaciones de un análisis guardado (lo que no se entiende se ignora). */
export const anotacionesDeDoc = (x: unknown): Anotaciones => {
  if (x === undefined || x === null) return anotacionesVacias()
  const r = normalizar(x, false)
  return r.ok ? r.valor : anotacionesVacias()
}

/** El mayor tamaño de texto de los ejes (el general o el de algún eje): con él crecen las columnas y bandas para que todo quepa. */
export function tamTextoMax(base: number | null | undefined, ejes: Readonly<Record<string, EstiloEje>> | undefined): number | null {
  let m = base ?? 0
  for (const e of Object.values(ejes ?? {})) if (e.tam && e.tam > m) m = e.tam
  return m > 0 ? m : null
}
