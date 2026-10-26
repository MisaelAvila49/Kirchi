/** Aspecto de una gráfica, común al osciloscopio (texto en la propiedad `aspecto`) y a los análisis (colección en su configuración). Nunca un color escrito: el tono es el NOMBRE de un token de la tabla de colores. */
import { TONOS_FIGURA, type TonoFigura } from '../ajustes'
import { anotacionesParaDoc, validarAnotaciones, type Anotaciones } from './anotaciones'
import { SUBDIVISIONES } from './ticks'

export const TEMAS_GRAFICA = ['app', 'claro', 'oscuro'] as const
export type TemaGrafica = (typeof TEMAS_GRAFICA)[number]
export const LADOS_EJE_Y = ['izquierda', 'derecha', 'centro'] as const
export type LadoEjeY = (typeof LADOS_EJE_Y)[number]
export const POSICIONES_EJE_X = ['arriba', 'abajo', 'centro'] as const
export type PosicionEjeX = (typeof POSICIONES_EJE_X)[number]
/** Grosor de las letras de los ejes. */
export const PESOS_TEXTO = ['normal', 'medio', 'negrita'] as const
export type PesoTexto = (typeof PESOS_TEXTO)[number]
export const NOMBRE_PESO: Readonly<Record<PesoTexto, string>> = { normal: 'Normal', medio: 'Medio', negrita: 'Negrita' }
/** Tamaño de las letras y cifras de los ejes en px; la pantalla y las figuras traen 11 px y el panel ofrece de 9 a 24. */
export const TEXTO_TAM_RANGO = [9, 24] as const
export const TEXTO_TAM_BASE = 11
const tamValido = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= TEXTO_TAM_RANGO[0] && v <= TEXTO_TAM_RANGO[1]
/** Cuánto crecen las columnas y las bandas de los ejes con el tamaño del texto: nunca menos que el diseño base. */
export const escalaDeTexto = (tam: number | null | undefined): number => (tam ? Math.max(1, tam / TEXTO_TAM_BASE) : 1)
/** Cómo se dibuja la rejilla (con ella encendida). */
export const ESTILOS_REJILLA = ['lineas', 'horizontal', 'vertical', 'puntos', 'guiones'] as const
export type EstiloRejilla = (typeof ESTILOS_REJILLA)[number]
export const NOMBRE_ESTILO_REJILLA: Readonly<Record<EstiloRejilla, string>> = { lineas: 'Líneas', horizontal: 'Solo horizontales', vertical: 'Solo verticales', puntos: 'Puntos', guiones: 'Guiones' }
/** Partes en que se divide cada división con número de un eje (rayas más tenues entre una marca y la siguiente); null deja lo de omisión. */
export type Subdivisiones = (typeof SUBDIVISIONES)[number]
export const NOMBRE_SUBDIVISIONES: Readonly<Record<Subdivisiones, string>> = { 1: 'Ninguna', 2: '2', 4: '4', 5: '5', 10: '10' }
/** Prefijo con que se escriben los números de un eje (`base` es la unidad sola; `u` es micro). Independiente de la escala por división. */
export const PREFIJOS_EJE = ['f', 'p', 'n', 'u', 'm', 'base', 'k', 'M'] as const
export type PrefijoEje = (typeof PREFIJOS_EJE)[number]
export const FACTOR_PREFIJO: Readonly<Record<PrefijoEje, number>> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, base: 1, k: 1e3, M: 1e6 }
export const SIMBOLO_PREFIJO: Readonly<Record<PrefijoEje, string>> = { f: 'f', p: 'p', n: 'n', u: 'µ', m: 'm', base: '', k: 'k', M: 'M' }
/** Decimales de las cifras de un eje: de 0 a 4, o «auto» (los que pide el paso entre marcas, hasta 3). Ausente es la omisión de cada eje. */
export const DECIMALES_EJE = [0, 1, 2, 3, 4, 'auto'] as const
export type Decimales = (typeof DECIMALES_EJE)[number]
export const esDecimales = (v: unknown): v is Decimales => (DECIMALES_EJE as readonly unknown[]).includes(v)
/** Grosor de la línea de las trazas en px CSS. */
export const GROSOR_RANGO = [1, 4] as const
/** Grosor general de las líneas de los ejes y de la rejilla en px. */
export const GROSOR_LINEAS_RANGO = [0.5, 4] as const
const grosorLineaValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= GROSOR_LINEAS_RANGO[0] && v <= GROSOR_LINEAS_RANGO[1]

/** Un rango escrito a mano para un eje, en las unidades base del eje (V, s, Hz…); ausente es el automático. */
export interface RangoEje {
  min: number
  max: number
}
const rangoValido = (v: unknown): v is RangoEje => typeof v === 'object' && v !== null && !Array.isArray(v) && Number.isFinite((v as RangoEje).min) && Number.isFinite((v as RangoEje).max) && (v as RangoEje).min < (v as RangoEje).max

export interface AspectoGrafica {
  tema: TemaGrafica
  grosor: number
  rejilla: boolean
  /** Rayitas en cada eje además de los números. */
  marcas: boolean
  ejeX: PosicionEjeX
  /** Tono de las letras de los ejes; null es el de la traza de cada eje (como siempre en el osciloscopio). */
  textoTono: TonoFigura | null
  textoPeso: PesoTexto
  /** Tamaño en px de las letras y cifras de los ejes; null es el de siempre (11 px). */
  textoTam: number | null
  rejillaEstilo: EstiloRejilla
  /** Subdivisiones de cada eje, independientes de los números: partes iguales en un eje lineal, y en uno logarítmico cualquier valor desde 2 pinta las marcas 2 a 9 de cada década. Ausente o null es lo de omisión. */
  subdivisionesX?: Subdivisiones | null
  subdivisionesY?: Subdivisiones | null
  /** Lectura de los valores al pasar el ratón, con su cruz; no cambia lo que se exporta. */
  lectura: boolean
  /** Prefijo de los números del eje horizontal (tiempo o frecuencia); null elige el que mejor cabe. */
  prefijoX: PrefijoEje | null
  /** Decimales de las cifras del eje horizontal; ausente, los de omisión (2 en el tiempo, 1 en lo demás). */
  decimalesX?: Decimales
  /** Grosor general de las líneas de todos los ejes en px (un eje puede traer el suyo); ausente es 1. */
  grosorEjes?: number
  /** Grosor general de las líneas de la rejilla en px; ausente es 1. */
  grosorRejilla?: number
  /** X-Y: la clave de la traza que hace de eje horizontal en lugar del tiempo o la frecuencia; ausente, el eje de siempre. */
  ejeXTraza?: string
  /** Desde y hasta del eje horizontal escritos a mano (también para la traza que hace de eje en X-Y); ausente, los límites automáticos. */
  rangoX?: RangoEje
  /** Decimales de los valores de las etiquetas puestas con doble clic («x: 1.8167 s, y: 137.7 mV»); propios, independientes de los de los ejes. Ausente, los del eje de cada traza. */
  decimalesEtiquetas?: Decimales
  /** Solo en la magnitud de un Bode: dBV absolutos en lugar de la ganancia respecto a la fuente de CA (lo de omisión). */
  dbAbsoluto?: boolean
  /** Preajuste «Informe»: paneles del Bode apilados, sin divisiones fijas y texto negro. Sin él, la gráfica de un análisis usa el estilo «Instrumento». */
  informe?: boolean
}

export interface AspectoTraza {
  lado: LadoEjeY
  /** Tono de la línea; null es el que le toca por omisión. */
  color: TonoFigura | null
  /** Grosor propio de la línea en px; null o ausente usa el de la gráfica. */
  grosor?: number | null
  /** Prefijo de los números de su eje vertical; null o ausente elige el que mejor cabe. */
  prefijo?: PrefijoEje | null
  /** Decimales de las cifras de su eje vertical; ausente, 1. */
  decimales?: Decimales
  /** Desde y hasta de su eje vertical escritos a mano; ausente, los límites automáticos. */
  rango?: RangoEje
}

/** El osciloscopio conserva su pantalla: eje del tiempo arriba y línea de 1.5 px, con rayitas y números en los ejes. */
export const ASPECTO_OSCILOSCOPIO: Readonly<AspectoGrafica> = Object.freeze({ tema: 'app', grosor: 1.5, rejilla: true, marcas: true, ejeX: 'arriba', textoTono: null, textoPeso: 'normal', textoTam: null, rejillaEstilo: 'lineas', lectura: true, prefijoX: null })
/** Estilo «Instrumento» de las gráficas de análisis: se dibujan como la pantalla del osciloscopio, con ocho divisiones verticales, escala por traza y cifras en el tono de cada traza. */
export const ASPECTO_ANALISIS: Readonly<AspectoGrafica> = Object.freeze({ tema: 'app', grosor: 1.5, rejilla: true, marcas: true, ejeX: 'arriba', textoTono: null, textoPeso: 'normal', textoTam: null, rejillaEstilo: 'lineas', lectura: true, prefijoX: null })
/** El preajuste «Informe» de la exportación: el aspecto clásico (Bode en dos paneles apilados, eje abajo y letras negras). */
export const ASPECTO_INFORME: Readonly<AspectoGrafica> = Object.freeze({ tema: 'app', grosor: 1.5, rejilla: true, marcas: true, ejeX: 'abajo', textoTono: 'negro', textoPeso: 'normal', textoTam: null, rejillaEstilo: 'lineas', lectura: true, prefijoX: null, informe: true })

/** El aspecto con el tamaño general de la letra de la figura como tamaño de los ejes, si el aspecto no fijó uno propio. */
export function conTamañoGeneral(a: AspectoGrafica, px: number): AspectoGrafica {
  if (a.textoTam || px === TEXTO_TAM_BASE) return a
  return { ...a, textoTam: Math.max(TEXTO_TAM_RANGO[0], Math.min(TEXTO_TAM_RANGO[1], Math.round(px))) }
}

export const NOMBRE_TEMA_GRAFICA: Readonly<Record<TemaGrafica, string>> = { app: 'Como la aplicación', claro: 'Claro', oscuro: 'Oscuro' }
export const NOMBRE_LADO: Readonly<Record<LadoEjeY, string>> = { izquierda: 'Izquierda', derecha: 'Derecha', centro: 'En medio' }
export const NOMBRE_POSICION_X: Readonly<Record<PosicionEjeX, string>> = { arriba: 'Arriba', abajo: 'Abajo', centro: 'En medio' }

const MAX_TRAZAS = 64
const MAX_ID_TRAZA = 80
const esTono = (v: unknown): v is TonoFigura => typeof v === 'string' && (TONOS_FIGURA as readonly string[]).includes(v)
const esLado = (v: unknown): v is LadoEjeY => typeof v === 'string' && (LADOS_EJE_Y as readonly string[]).includes(v)
const esPosicion = (v: unknown): v is PosicionEjeX => typeof v === 'string' && (POSICIONES_EJE_X as readonly string[]).includes(v)
const esTema = (v: unknown): v is TemaGrafica => typeof v === 'string' && (TEMAS_GRAFICA as readonly string[]).includes(v)
const esPeso = (v: unknown): v is PesoTexto => typeof v === 'string' && (PESOS_TEXTO as readonly string[]).includes(v)
const esEstilo = (v: unknown): v is EstiloRejilla => typeof v === 'string' && (ESTILOS_REJILLA as readonly string[]).includes(v)
const esSubdivision = (v: unknown): v is Subdivisiones => typeof v === 'number' && (SUBDIVISIONES as readonly number[]).includes(v)
const esPrefijo = (v: unknown): v is PrefijoEje => typeof v === 'string' && (PREFIJOS_EJE as readonly string[]).includes(v)
const grosorValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= GROSOR_RANGO[0] && v <= GROSOR_RANGO[1]

/// ---------- Texto del osciloscopio ----------

const SI_NO: Readonly<Record<string, boolean>> = { si: true, sí: true, no: false }
const ID_TEXTO = /^[A-Za-z][A-Za-z0-9]{0,7}$/
const CLAVES = new Set(['tema', 'grosor', 'rejilla', 'marcas', 'tiempo', 'texto', 'peso', 'tam', 'estilo', 'lectura', 'ux', 'subx', 'suby', 'dx', 'de', 'gej', 'grej'])
/** Lo que sigue a `A.` en un par como `A.grosor=2` o `A.unidad=m`. */
const CAMPOS_CANAL = new Set(['grosor', 'unidad', 'dec'])

/** Lee la propiedad `aspecto`: pares `clave=valor` separados por espacios. Una palabra que no es clave del aspecto (`A`, `B`…) es un canal con `lado` o `lado/tono`. Lo desconocido o fuera de rango se ignora. */
export function leerAspecto(texto: string, base: Readonly<AspectoGrafica>): { aspecto: AspectoGrafica; trazas: Record<string, AspectoTraza> } {
  const aspecto: AspectoGrafica = { ...base }
  const trazas: Record<string, AspectoTraza> = Object.create(null)
  const extras: [string, string, string][] = []
  for (const par of texto.split(/\s+/)) {
    const i = par.indexOf('=')
    if (i <= 0) continue
    const k = par.slice(0, i)
    const v = par.slice(i + 1)
    if (CLAVES.has(k)) {
      if (k === 'tema' && esTema(v)) aspecto.tema = v
      else if (k === 'grosor') {
        const n = Number(v)
        if (grosorValido(n)) aspecto.grosor = n
      } else if (k === 'rejilla' && Object.hasOwn(SI_NO, v)) aspecto.rejilla = SI_NO[v]
      else if (k === 'marcas' && Object.hasOwn(SI_NO, v)) aspecto.marcas = SI_NO[v]
      else if (k === 'tiempo' && esPosicion(v)) aspecto.ejeX = v
      else if (k === 'texto' && (v === 'traza' || esTono(v))) aspecto.textoTono = v === 'traza' ? null : (v as TonoFigura)
      else if (k === 'peso' && esPeso(v)) aspecto.textoPeso = v
      else if (k === 'tam' && tamValido(Number(v))) aspecto.textoTam = Number(v)
      else if (k === 'estilo' && esEstilo(v)) aspecto.rejillaEstilo = v
      else if (k === 'lectura' && Object.hasOwn(SI_NO, v)) aspecto.lectura = SI_NO[v]
      else if ((k === 'gej' || k === 'grej') && grosorLineaValido(Number(v))) aspecto[k === 'gej' ? 'grosorEjes' : 'grosorRejilla'] = Number(v)
      else if (k === 'de') {
        const d = v === 'auto' ? v : Number(v)
        if (v === 'omision') delete aspecto.decimalesEtiquetas
        else if (esDecimales(d)) aspecto.decimalesEtiquetas = d
      } else if (k === 'dx') {
        const d = v === 'auto' ? v : Number(v)
        if (v === 'omision') delete aspecto.decimalesX
        else if (esDecimales(d)) aspecto.decimalesX = d
      } else if (k === 'ux') aspecto.prefijoX = esPrefijo(v) ? v : null
      else if ((k === 'subx' || k === 'suby') && (v === 'auto' || esSubdivision(Number(v)))) aspecto[k === 'subx' ? 'subdivisionesX' : 'subdivisionesY'] = v === 'auto' ? null : (Number(v) as Subdivisiones)
      continue
    }
    const punto = k.indexOf('.')
    if (punto > 0) {
      const id = k.slice(0, punto)
      const campo = k.slice(punto + 1)
      if (ID_TEXTO.test(id) && CAMPOS_CANAL.has(campo)) extras.push([id, campo, v])
      continue
    }
    if (!ID_TEXTO.test(k) || k === '__proto__') continue
    const [lado, color] = v.split('/')
    if (!esLado(lado)) continue
    trazas[k] = { lado, color: esTono(color) ? color : null }
  }
  for (const [id, campo, v] of extras) {
    if (id === '__proto__') continue
    const n = Number(v)
    const d = v === 'auto' ? v : n
    if (campo === 'grosor' ? !grosorValido(n) : campo === 'dec' ? !esDecimales(d) : !esPrefijo(v)) continue
    const t = (trazas[id] ??= { lado: 'izquierda', color: null })
    if (campo === 'grosor') t.grosor = n
    else if (campo === 'dec') t.decimales = d as Decimales
    else t.prefijo = v as PrefijoEje
  }
  return { aspecto, trazas }
}

/** El texto de la propiedad `aspecto`: solo lo que difiere de `base` y de «izquierda, tono por omisión» en cada canal. */
export function escribirAspecto(aspecto: AspectoGrafica, trazas: Readonly<Record<string, AspectoTraza>>, base: Readonly<AspectoGrafica>): string {
  const p: string[] = []
  if (aspecto.tema !== base.tema) p.push(`tema=${aspecto.tema}`)
  if (aspecto.grosor !== base.grosor) p.push(`grosor=${aspecto.grosor}`)
  if (aspecto.rejilla !== base.rejilla) p.push(`rejilla=${aspecto.rejilla ? 'si' : 'no'}`)
  if (aspecto.marcas !== base.marcas) p.push(`marcas=${aspecto.marcas ? 'si' : 'no'}`)
  if (aspecto.ejeX !== base.ejeX) p.push(`tiempo=${aspecto.ejeX}`)
  if (aspecto.textoTono !== base.textoTono) p.push(`texto=${aspecto.textoTono ?? 'traza'}`)
  if (aspecto.textoPeso !== base.textoPeso) p.push(`peso=${aspecto.textoPeso}`)
  if (aspecto.textoTam !== base.textoTam) p.push(`tam=${aspecto.textoTam ?? 'auto'}`)
  if (aspecto.rejillaEstilo !== base.rejillaEstilo) p.push(`estilo=${aspecto.rejillaEstilo}`)
  if (aspecto.lectura !== base.lectura) p.push(`lectura=${aspecto.lectura ? 'si' : 'no'}`)
  if (aspecto.prefijoX !== base.prefijoX) p.push(`ux=${aspecto.prefijoX ?? 'auto'}`)
  if ((aspecto.subdivisionesX ?? null) !== (base.subdivisionesX ?? null)) p.push(`subx=${aspecto.subdivisionesX ?? 'auto'}`)
  if ((aspecto.subdivisionesY ?? null) !== (base.subdivisionesY ?? null)) p.push(`suby=${aspecto.subdivisionesY ?? 'auto'}`)
  if (aspecto.decimalesX !== base.decimalesX) p.push(`dx=${aspecto.decimalesX ?? 'omision'}`)
  if (aspecto.grosorEjes !== base.grosorEjes) p.push(`gej=${aspecto.grosorEjes ?? 1}`)
  if (aspecto.grosorRejilla !== base.grosorRejilla) p.push(`grej=${aspecto.grosorRejilla ?? 1}`)
  if (aspecto.decimalesEtiquetas !== base.decimalesEtiquetas) p.push(`de=${aspecto.decimalesEtiquetas ?? 'omision'}`)
  for (const id of Object.keys(trazas).sort()) {
    const t = trazas[id]
    if (t.lado !== 'izquierda' || t.color !== null) p.push(`${id}=${t.lado}${t.color ? `/${t.color}` : ''}`)
    if (t.grosor != null) p.push(`${id}.grosor=${t.grosor}`)
    if (t.prefijo != null) p.push(`${id}.unidad=${t.prefijo}`)
    if (t.decimales !== undefined) p.push(`${id}.dec=${t.decimales}`)
  }
  return p.join(' ')
}

// ---------- Documento (análisis) ----------

/** La gráfica de un análisis tal como se guarda: solo lo que difiere de `ASPECTO_ANALISIS`, y las trazas por su nombre. */
export interface GraficaDoc {
  tema?: TemaGrafica
  grosor?: number
  rejilla?: boolean
  marcas?: boolean
  ejeX?: PosicionEjeX
  /** `null` es «el tono de cada traza» (lo de omisión es el negro). */
  textoTono?: TonoFigura | null
  textoPeso?: PesoTexto
  textoTam?: number
  rejillaEstilo?: EstiloRejilla
  lectura?: boolean
  prefijoX?: PrefijoEje
  decimalesX?: Decimales
  decimalesEtiquetas?: Decimales
  rangoX?: RangoEje
  ejeXTraza?: string
  grosorEjes?: number
  grosorRejilla?: number
  subdivisionesX?: Subdivisiones
  subdivisionesY?: Subdivisiones
  dbAbsoluto?: boolean
  informe?: boolean
  trazas?: { id: string; lado?: LadoEjeY; color?: TonoFigura; grosor?: number; prefijo?: PrefijoEje; decimales?: Decimales; rango?: RangoEje }[]
  /** Textos, flechas, etiquetas de valor y estilos de ejes del editor de exportar (solo lo que no está vacío). */
  anotaciones?: Partial<Anotaciones>
}

type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string }
const mal = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Revisa la gráfica de un análisis (datos de un `.kir`: no confiables). Devuelve una copia limpia sin lo que es igual a lo de omisión. */
export function validarGrafica(x: unknown): Validacion<GraficaDoc> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return mal('La configuración de la gráfica no tiene la forma esperada.')
  const o = x as Record<string, unknown>
  const g: GraficaDoc = {}
  const B = ASPECTO_ANALISIS
  if (o.tema !== undefined) {
    if (!esTema(o.tema)) return mal('El tema de la gráfica debe ser app, claro u oscuro.')
    if (o.tema !== B.tema) g.tema = o.tema
  }
  if (o.grosor !== undefined) {
    if (!grosorValido(o.grosor)) return mal(`El grosor de la línea debe estar entre ${GROSOR_RANGO[0]} y ${GROSOR_RANGO[1]} px.`)
    if (o.grosor !== B.grosor) g.grosor = o.grosor
  }
  for (const k of ['rejilla', 'marcas', 'lectura', 'dbAbsoluto', 'informe'] as const) {
    if (o[k] === undefined) continue
    if (typeof o[k] !== 'boolean') return mal(`«${k}» de la gráfica debe ser verdadero o falso.`)
    if (o[k] !== (B[k] ?? false)) g[k] = o[k] as boolean
  }
  if (o.ejeX !== undefined) {
    if (!esPosicion(o.ejeX)) return mal('El eje horizontal debe ir arriba, abajo o en medio.')
    if (o.ejeX !== B.ejeX) g.ejeX = o.ejeX
  }
  if (o.textoTono !== undefined) {
    if (o.textoTono !== null && !esTono(o.textoTono)) return mal('El tono del texto de los ejes no existe.')
    if (o.textoTono !== B.textoTono) g.textoTono = o.textoTono as TonoFigura | null
  }
  if (o.textoPeso !== undefined) {
    if (!esPeso(o.textoPeso)) return mal('El peso del texto de los ejes debe ser normal, medio o negrita.')
    if (o.textoPeso !== B.textoPeso) g.textoPeso = o.textoPeso
  }
  if (o.textoTam !== undefined) {
    if (!tamValido(o.textoTam)) return mal(`El tamaño del texto de los ejes debe ser un entero de ${TEXTO_TAM_RANGO[0]} a ${TEXTO_TAM_RANGO[1]} px.`)
    g.textoTam = o.textoTam
  }
  if (o.rejillaEstilo !== undefined) {
    if (!esEstilo(o.rejillaEstilo)) return mal('El estilo de la rejilla debe ser líneas, solo horizontales, solo verticales, puntos o guiones.')
    if (o.rejillaEstilo !== B.rejillaEstilo) g.rejillaEstilo = o.rejillaEstilo
  }
  if (o.prefijoX !== undefined) {
    if (!esPrefijo(o.prefijoX)) return mal('El prefijo del eje horizontal no existe.')
    g.prefijoX = o.prefijoX
  }
  if (o.decimalesX !== undefined) {
    if (!esDecimales(o.decimalesX)) return mal('Los decimales del eje horizontal deben ser de 0 a 4 o auto.')
    g.decimalesX = o.decimalesX
  }
  if (o.rangoX !== undefined) {
    if (!rangoValido(o.rangoX)) return mal('El rango del eje horizontal debe tener un desde menor que el hasta.')
    g.rangoX = { min: o.rangoX.min, max: o.rangoX.max }
  }
  if (o.ejeXTraza !== undefined) {
    if (typeof o.ejeXTraza !== 'string') return mal('La traza del eje horizontal de la gráfica debe ser un nombre.')
    const id = o.ejeXTraza.replace(/[ -]/g, '').trim().slice(0, MAX_ID_TRAZA)
    if (id) g.ejeXTraza = id
  }
  for (const k of ['grosorEjes', 'grosorRejilla'] as const) {
    if (o[k] === undefined) continue
    if (!grosorLineaValido(o[k])) return mal(`El grosor de las líneas de la gráfica debe estar entre ${GROSOR_LINEAS_RANGO[0]} y ${GROSOR_LINEAS_RANGO[1]} px.`)
    g[k] = o[k] as number
  }
  if (o.decimalesEtiquetas !== undefined) {
    if (!esDecimales(o.decimalesEtiquetas)) return mal('Los decimales de las etiquetas de valor deben ser de 0 a 4 o auto.')
    g.decimalesEtiquetas = o.decimalesEtiquetas
  }
  for (const k of ['subdivisionesX', 'subdivisionesY'] as const) {
    if (o[k] === undefined) continue
    if (!esSubdivision(o[k])) return mal(`Las subdivisiones de la gráfica deben ser ${SUBDIVISIONES.join(', ')}.`)
    g[k] = o[k]
  }
  if (o.trazas !== undefined) {
    if (!Array.isArray(o.trazas)) return mal('Las trazas de la gráfica no tienen la forma esperada.')
    if (o.trazas.length > MAX_TRAZAS) return mal(`La gráfica guarda ajustes de ${o.trazas.length} trazas y el tope es ${MAX_TRAZAS}.`)
    const vistos = new Set<string>()
    const trazas: NonNullable<GraficaDoc['trazas']> = []
    for (const t of o.trazas) {
      if (typeof t !== 'object' || t === null) return mal('Una traza de la gráfica no tiene la forma esperada.')
      const r = t as Record<string, unknown>
      // Los caracteres de control no entran a un nombre que luego se escribe en archivos y diálogos.
      const id = typeof r.id === 'string' ? r.id.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_ID_TRAZA) : ''
      if (!id) return mal('Una traza de la gráfica no tiene nombre.')
      if (r.lado !== undefined && !esLado(r.lado)) return mal(`El eje de «${id}» debe ir a la izquierda, a la derecha o en medio.`)
      if (r.color !== undefined && !esTono(r.color)) return mal(`El tono de «${id}» no existe.`)
      if (r.grosor !== undefined && !grosorValido(r.grosor)) return mal(`El grosor de «${id}» debe estar entre ${GROSOR_RANGO[0]} y ${GROSOR_RANGO[1]} px.`)
      if (r.prefijo !== undefined && !esPrefijo(r.prefijo)) return mal(`El prefijo del eje de «${id}» no existe.`)
      if (r.decimales !== undefined && !esDecimales(r.decimales)) return mal(`Los decimales del eje de «${id}» deben ser de 0 a 4 o auto.`)
      if (r.rango !== undefined && !rangoValido(r.rango)) return mal(`El rango del eje de «${id}» debe tener un desde menor que el hasta.`)
      if (vistos.has(id)) continue
      vistos.add(id)
      const lado = r.lado as LadoEjeY | undefined
      const color = r.color as TonoFigura | undefined
      const grosor = r.grosor as number | undefined
      const prefijo = r.prefijo as PrefijoEje | undefined
      const decimales = r.decimales as Decimales | undefined
      const rango = r.rango as RangoEje | undefined
      if ((lado === undefined || lado === 'izquierda') && color === undefined && grosor === undefined && prefijo === undefined && decimales === undefined && rango === undefined) continue
      trazas.push({ id, ...(lado && lado !== 'izquierda' ? { lado } : {}), ...(color ? { color } : {}), ...(grosor !== undefined ? { grosor } : {}), ...(prefijo ? { prefijo } : {}), ...(decimales !== undefined ? { decimales } : {}), ...(rango ? { rango: { min: rango.min, max: rango.max } } : {}) })
    }
    if (trazas.length > 0) g.trazas = trazas
  }
  if (o.anotaciones !== undefined) {
    const r = validarAnotaciones(o.anotaciones)
    if (!r.ok) return r
    const doc = anotacionesParaDoc(r.valor)
    if (doc) g.anotaciones = doc as Partial<Anotaciones>
  }
  return { ok: true, valor: g }
}

/** El aspecto completo de un análisis: lo de omisión con lo guardado encima. */
export function aspectoDeGrafica(g: GraficaDoc | undefined): AspectoGrafica {
  const B = ASPECTO_ANALISIS
  return {
    tema: g?.tema ?? B.tema,
    grosor: g?.grosor ?? B.grosor,
    rejilla: g?.rejilla ?? B.rejilla,
    marcas: g?.marcas ?? B.marcas,
    ejeX: g?.ejeX ?? B.ejeX,
    textoTono: g && 'textoTono' in g ? (g.textoTono ?? null) : B.textoTono,
    textoPeso: g?.textoPeso ?? B.textoPeso,
    textoTam: g?.textoTam ?? B.textoTam,
    rejillaEstilo: g?.rejillaEstilo ?? B.rejillaEstilo,
    lectura: g?.lectura ?? B.lectura,
    prefijoX: g?.prefijoX ?? B.prefijoX,
    ...(g?.decimalesX !== undefined ? { decimalesX: g.decimalesX } : {}),
    ...(g?.decimalesEtiquetas !== undefined ? { decimalesEtiquetas: g.decimalesEtiquetas } : {}),
    ...(g?.ejeXTraza ? { ejeXTraza: g.ejeXTraza } : {}),
    ...(g?.rangoX ? { rangoX: g.rangoX } : {}),
    ...(g?.grosorEjes !== undefined ? { grosorEjes: g.grosorEjes } : {}),
    ...(g?.grosorRejilla !== undefined ? { grosorRejilla: g.grosorRejilla } : {}),
    ...(g?.subdivisionesX ? { subdivisionesX: g.subdivisionesX } : {}),
    ...(g?.subdivisionesY ? { subdivisionesY: g.subdivisionesY } : {}),
    ...(g?.dbAbsoluto ? { dbAbsoluto: true } : {}),
    ...(g?.informe ? { informe: true } : {})
  }
}

/** Las trazas guardadas como mapa por nombre (sin prototipo). */
export function trazasDeGrafica(g: GraficaDoc | undefined): Record<string, AspectoTraza> {
  const m: Record<string, AspectoTraza> = Object.create(null)
  for (const t of g?.trazas ?? []) m[t.id] = { lado: t.lado ?? 'izquierda', color: t.color ?? null, ...(t.grosor !== undefined ? { grosor: t.grosor } : {}), ...(t.prefijo ? { prefijo: t.prefijo } : {}), ...(t.decimales !== undefined ? { decimales: t.decimales } : {}), ...(t.rango ? { rango: t.rango } : {}) }
  return m
}

/** De un aspecto y un mapa de trazas a lo que se guarda (solo lo que difiere). */
export function graficaDeAspecto(a: AspectoGrafica, trazas: Readonly<Record<string, AspectoTraza>>): GraficaDoc {
  const g: GraficaDoc = {}
  const B = ASPECTO_ANALISIS
  if (a.tema !== B.tema) g.tema = a.tema
  if (a.grosor !== B.grosor) g.grosor = a.grosor
  if (a.rejilla !== B.rejilla) g.rejilla = a.rejilla
  if (a.marcas !== B.marcas) g.marcas = a.marcas
  if (a.ejeX !== B.ejeX) g.ejeX = a.ejeX
  if (a.textoTono !== B.textoTono) g.textoTono = a.textoTono
  if (a.textoPeso !== B.textoPeso) g.textoPeso = a.textoPeso
  if (a.textoTam) g.textoTam = a.textoTam
  if (a.rejillaEstilo !== B.rejillaEstilo) g.rejillaEstilo = a.rejillaEstilo
  if (a.lectura !== B.lectura) g.lectura = a.lectura
  if (a.prefijoX) g.prefijoX = a.prefijoX
  if (a.decimalesX !== undefined) g.decimalesX = a.decimalesX
  if (a.decimalesEtiquetas !== undefined) g.decimalesEtiquetas = a.decimalesEtiquetas
  if (a.ejeXTraza) g.ejeXTraza = a.ejeXTraza
  if (a.rangoX) g.rangoX = a.rangoX
  if (a.grosorEjes !== undefined) g.grosorEjes = a.grosorEjes
  if (a.grosorRejilla !== undefined) g.grosorRejilla = a.grosorRejilla
  if (a.subdivisionesX) g.subdivisionesX = a.subdivisionesX
  if (a.subdivisionesY) g.subdivisionesY = a.subdivisionesY
  if (a.dbAbsoluto) g.dbAbsoluto = true
  if (a.informe) g.informe = true
  const lista = Object.keys(trazas)
    .sort()
    .flatMap((id) => {
      const t = trazas[id]
      if (t.lado === 'izquierda' && t.color === null && t.grosor == null && t.prefijo == null && t.decimales === undefined && !t.rango) return []
      return [{ id, ...(t.lado !== 'izquierda' ? { lado: t.lado } : {}), ...(t.color ? { color: t.color } : {}), ...(t.grosor != null ? { grosor: t.grosor } : {}), ...(t.prefijo ? { prefijo: t.prefijo } : {}), ...(t.decimales !== undefined ? { decimales: t.decimales } : {}), ...(t.rango ? { rango: t.rango } : {}) }]
    })
  if (lista.length > 0) g.trazas = lista
  return g
}
