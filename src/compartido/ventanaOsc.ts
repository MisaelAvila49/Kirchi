/**
 * Osciloscopio en ventana aparte: carga la misma página con la ruta `#osciloscopio` y pide sus datos al proceso principal. El editor es el dueño del estado y la ventana es un espejo que devuelve órdenes.
 * La memoria compartida no cruza ventanas, así que las pantallas viajan como copias, solo cuando cambian.
 */
import type { Tema } from './ajustes'

/** Osciloscopios que caben en un circuito (el mismo tope de la vista previa, `MAX_OSCILOSCOPIOS`). */
export const MAX_OSC_VENTANA = 4

export const RUTA_OSC = '#osciloscopio'

/** Argumento con que el proceso principal abre la ventana del osciloscopio: el preload expone solo `osciloscopio`. */
export const ARG_SOLO_OSC = '--kirchi-solo-osciloscopio'

export const CANALES_OSC = {
  /** Del editor al proceso principal: abre la ventana o, si ya está, le manda estos datos y la enfoca. */
  abrir: 'osc:abrir',
  /** Del editor: datos nuevos solo si la ventana ya está abierta (no la crea ni la enfoca). */
  actualizar: 'osc:actualizar',
  /** De la ventana: pide los últimos datos al arrancar. */
  pedir: 'osc:pedir',
  /** Del proceso principal a la ventana: datos nuevos. */
  datos: 'osc:datos',
  /** De la ventana al editor (por el proceso principal): una orden. */
  comando: 'osc:comando',
  alComando: 'osc:al-comando',
  /** De la ventana: «Acoplar». El proceso principal la cierra y se lo dice al editor. */
  acoplar: 'osc:acoplar',
  alAcoplar: 'osc:al-acoplar',
  /** Del editor: cierra la ventana (el botón «Acoplar» de la franja mientras la ventana está abierta). */
  cerrar: 'osc:cerrar',
  /** Del proceso principal al editor: la ventana se cerró (por su botón de cerrar o por acoplar). */
  alCerrar: 'osc:al-cerrar'
} as const

/** La pantalla de un osciloscopio, copiada fuera de la memoria compartida (los mismos campos que `PantallaSab`). */
export interface PantallaOsc {
  version: number
  t0: number
  dt: number
  ncol: number
  tDisparo: number
  estado: string
  tCaptura: number
  csv: { t0: number; dt: number; n: number }
  completoHasta: number[]
  medidas: { valor: number; razon: string }[][]
  columnas: Float32Array
  muestras: Float32Array
}

/** Una pantalla congelada con los ajustes con que se congeló. */
export interface CongeladaOsc {
  pantalla: PantallaOsc
  ajustes: Record<string, unknown>
}

export interface DatosOsc {
  tema: Tema
  /** Los osciloscopios del circuito y el que se ve. */
  osciloscopios: { id: string; ref: string }[]
  elegido: string | null
  /** Los ajustes del elegido (`AjustesOsciloscopio`), el aspecto de su pantalla y el de cada canal. */
  ajustes: Record<string, unknown> | null
  aspecto: Record<string, unknown> | null
  aspectoCanales: Record<string, unknown>
  fase: string
  teclaSimular: string | null
  /** «Disparado», «Esperando disparo»…: el estado del disparo para los mandos. */
  estadoDisparo: string
  /** De dónde mide cada entrada («R1:2», «GND» o null). */
  fuentes: Record<string, string | null>
  aviso: string | null
  notaAjuste: string | null
  /** Los cursores a la vista; la ventana los mueve y los devuelve con una orden. */
  cursores: { canal: string; t: [number, number] | null; v: [number, number] | null; xy?: [{ x: number; y: number }, { x: number; y: number }] | null } | null
  /** La pantalla en vivo; ausente si no cambió desde el último envío. */
  pantalla?: PantallaOsc | null
  /** La pantalla congelada: ausente si no cambió, null si se reanudó. */
  congelada?: CongeladaOsc | null
  capturada: boolean
}

/** Lo nuevo sobre lo que ya había: la pantalla y la congelada que no llegan (sin cambios) se conservan. */
export function fusionarDatosOsc(antes: DatosOsc | null, nuevos: DatosOsc): DatosOsc {
  if (!antes) return nuevos
  return {
    ...nuevos,
    ...(nuevos.pantalla === undefined && antes.pantalla !== undefined ? { pantalla: antes.pantalla } : {}),
    ...(nuevos.congelada === undefined && antes.congelada !== undefined ? { congelada: antes.congelada } : {})
  }
}

/** Lo que la ventana le pide al editor. */
export type ComandoOsc =
  | { tipo: 'pausar' }
  | { tipo: 'reanudar' }
  | { tipo: 'forzar' }
  | { tipo: 'auto' }
  | { tipo: 'rearmar' }
  | { tipo: 'exportar' }
  | { tipo: 'elegir'; id: string }
  | { tipo: 'columnas'; id: string; n: number }
  | { tipo: 'cursores'; cursores: DatosOsc['cursores'] }
  | { tipo: 'escala'; eje: { tipo: 'tiempo' } | { tipo: 'canal'; canal: string }; dir: 1 | -1 }
  | { tipo: 'posicion'; canal: string; pos: number; gesto: string }
  | { tipo: 'ajuste'; prop: string; texto: string; gesto?: string }

export const MAX_COLUMNAS_OSC = 4096
const MAX_JSON_OSC = 20_000

export const urlDeOsc = (base: string): string => `${base.replace(/#.*$/, '')}${RUTA_OSC}`
export const esRutaOsc = (hash: string | undefined | null): boolean => hash === RUTA_OSC

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const esF32 = (x: unknown): x is Float32Array => x instanceof Float32Array
const esNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
/** Un número o NaN: antes del primer disparo el motor manda NaN en el origen del tiempo y en el disparo (nunca infinitos). */
const esNumONaN = (x: unknown): x is number => typeof x === 'number' && x !== Infinity && x !== -Infinity
const esTexto = (x: unknown, max = 400): x is string => typeof x === 'string' && x.length <= max

/** Un objeto de datos planos (números, textos, casillas, listas y objetos) de tamaño acotado: lo que cabe en un `.kir`. */
export function esJsonPlano(x: unknown, presupuesto = { n: MAX_JSON_OSC }, prof = 0): boolean {
  if (--presupuesto.n < 0 || prof > 8) return false
  if (x === undefined || x === null || typeof x === 'boolean' || typeof x === 'string') return typeof x !== 'string' || x.length <= 400
  if (typeof x === 'number') return Number.isFinite(x)
  if (Array.isArray(x)) return x.every((v) => esJsonPlano(v, presupuesto, prof + 1))
  if (esObjeto(x)) return Object.values(x).every((v) => esJsonPlano(v, presupuesto, prof + 1))
  return false
}

export function validarPantallaOsc(p: unknown): PantallaOsc | null {
  if (!esObjeto(p)) return null
  const { version, t0, dt, ncol, tDisparo, tCaptura, csv, completoHasta, medidas, columnas, muestras } = p
  if (![version, dt, ncol, tCaptura].every(esNum) || ![t0, tDisparo].every(esNumONaN) || !esTexto(p.estado, 40)) return null
  if (!Number.isInteger(ncol) || (ncol as number) < 0 || (ncol as number) > MAX_COLUMNAS_OSC) return null
  if (!esObjeto(csv) || !esNumONaN(csv.t0) || ![csv.dt, csv.n].every(esNum) || !Number.isInteger(csv.n) || (csv.n as number) < 0 || (csv.n as number) > 2001) return null
  if (!Array.isArray(completoHasta) || completoHasta.length > 8 || !completoHasta.every((x) => typeof x === 'number')) return null
  if (!Array.isArray(medidas) || medidas.length > 8) return null
  for (const c of medidas) {
    if (!Array.isArray(c) || c.length > 16) return null
    for (const m of c) if (!esObjeto(m) || typeof m.valor !== 'number' || !esTexto(m.razon, 40)) return null
  }
  if (!esF32(columnas) || !esF32(muestras) || columnas.length > 5 * MAX_COLUMNAS_OSC * 5 || muestras.length > 5 * 2001) return null
  return p as unknown as PantallaOsc
}

const validarCursores = (c: unknown): c is DatosOsc['cursores'] => {
  if (c === null) return true
  if (!esObjeto(c) || !esTexto(c.canal, 2)) return false
  const par = (x: unknown) => x === null || (Array.isArray(x) && x.length === 2 && x.every(esNum))
  const punto = (x: unknown) => esObjeto(x) && esNum(x.x) && esNum(x.y)
  const puntos = c.xy === undefined || c.xy === null || (Array.isArray(c.xy) && c.xy.length === 2 && c.xy.every(punto))
  return par(c.t) && par(c.v) && puntos
}

/** Revisa lo que llega por el IPC. Devuelve el objeto limpio o null. */
export function validarDatosOsc(x: unknown): DatosOsc | null {
  if (!esObjeto(x)) return null
  if (x.tema !== 'claro' && x.tema !== 'oscuro') return null
  if (!Array.isArray(x.osciloscopios) || x.osciloscopios.length > MAX_OSC_VENTANA) return null
  const osciloscopios: DatosOsc['osciloscopios'] = []
  for (const o of x.osciloscopios) {
    if (!esObjeto(o) || !esTexto(o.id, 80) || !esTexto(o.ref, 40)) return null
    osciloscopios.push({ id: o.id, ref: o.ref })
  }
  if (x.elegido !== null && !esTexto(x.elegido, 80)) return null
  if (x.ajustes !== null && (!esObjeto(x.ajustes) || !esJsonPlano(x.ajustes))) return null
  if (x.aspecto !== null && (!esObjeto(x.aspecto) || !esJsonPlano(x.aspecto))) return null
  if (!esObjeto(x.aspectoCanales) || !esJsonPlano(x.aspectoCanales)) return null
  if (!esTexto(x.fase, 20) || !(x.teclaSimular === null || esTexto(x.teclaSimular, 40)) || !esTexto(x.estadoDisparo, 80)) return null
  if (!esObjeto(x.fuentes) || !esJsonPlano(x.fuentes)) return null
  if (!(x.aviso === null || esTexto(x.aviso, 600)) || !(x.notaAjuste === null || esTexto(x.notaAjuste, 600))) return null
  if (!validarCursores(x.cursores) || typeof x.capturada !== 'boolean') return null
  let pantalla: PantallaOsc | null | undefined
  if (x.pantalla !== undefined) {
    pantalla = x.pantalla === null ? null : validarPantallaOsc(x.pantalla)
    if (pantalla === null && x.pantalla !== null) return null
  }
  let congelada: CongeladaOsc | null | undefined
  if (x.congelada !== undefined) {
    if (x.congelada === null) congelada = null
    else {
      if (!esObjeto(x.congelada) || !esObjeto(x.congelada.ajustes) || !esJsonPlano(x.congelada.ajustes)) return null
      const p = validarPantallaOsc(x.congelada.pantalla)
      if (!p) return null
      congelada = { pantalla: p, ajustes: x.congelada.ajustes }
    }
  }
  return {
    tema: x.tema,
    osciloscopios,
    elegido: x.elegido,
    ajustes: x.ajustes as DatosOsc['ajustes'],
    aspecto: x.aspecto as DatosOsc['aspecto'],
    aspectoCanales: x.aspectoCanales,
    fase: x.fase,
    teclaSimular: x.teclaSimular as string | null,
    estadoDisparo: x.estadoDisparo,
    fuentes: x.fuentes as DatosOsc['fuentes'],
    aviso: x.aviso as string | null,
    notaAjuste: x.notaAjuste as string | null,
    cursores: x.cursores as DatosOsc['cursores'],
    capturada: x.capturada,
    ...(pantalla !== undefined ? { pantalla } : {}),
    ...(congelada !== undefined ? { congelada } : {})
  }
}

export function validarComandoOsc(x: unknown): ComandoOsc | null {
  if (!esObjeto(x) || typeof x.tipo !== 'string') return null
  switch (x.tipo) {
    case 'pausar':
    case 'reanudar':
    case 'forzar':
    case 'auto':
    case 'rearmar':
    case 'exportar':
      return { tipo: x.tipo }
    case 'elegir':
      return esTexto(x.id, 80) ? { tipo: 'elegir', id: x.id } : null
    case 'columnas':
      return esTexto(x.id, 80) && esNum(x.n) && Number.isInteger(x.n) && x.n >= 0 && x.n <= MAX_COLUMNAS_OSC ? { tipo: 'columnas', id: x.id, n: x.n } : null
    case 'cursores':
      return validarCursores(x.cursores) ? { tipo: 'cursores', cursores: x.cursores } : null
    case 'escala': {
      const e = x.eje
      if (x.dir !== 1 && x.dir !== -1) return null
      if (esObjeto(e) && e.tipo === 'tiempo') return { tipo: 'escala', eje: { tipo: 'tiempo' }, dir: x.dir }
      if (esObjeto(e) && e.tipo === 'canal' && esTexto(e.canal, 2)) return { tipo: 'escala', eje: { tipo: 'canal', canal: e.canal }, dir: x.dir }
      return null
    }
    case 'posicion':
      return esTexto(x.canal, 2) && esNum(x.pos) && esTexto(x.gesto, 80) ? { tipo: 'posicion', canal: x.canal, pos: x.pos, gesto: x.gesto } : null
    case 'ajuste':
      if (!esTexto(x.prop, 40) || !esTexto(x.texto, 400) || !(x.gesto === undefined || esTexto(x.gesto, 80))) return null
      return { tipo: 'ajuste', prop: x.prop, texto: x.texto, ...(x.gesto !== undefined ? { gesto: x.gesto } : {}) }
    default:
      return null
  }
}

/** Resultado de `actualizar`: sin ventana (la bandera baja), datos que no pasaron la revisión (la ventana sigue viva) o entregado. */
export type ResultadoActualizarOsc = 'sin-ventana' | 'invalido' | 'ok'

/** Lo que el preload expone del osciloscopio aparte (en `window.kirchi.osciloscopio`). */
export interface ApiOsciloscopio {
  abrir(datos: DatosOsc): Promise<boolean>
  actualizar(datos: DatosOsc): Promise<ResultadoActualizarOsc>
  pedir(): Promise<DatosOsc | null>
  alDatos(f: (d: DatosOsc) => void): () => void
  /** La ventana le manda una orden al editor. */
  comando(c: ComandoOsc): void
  alComando(f: (c: ComandoOsc) => void): () => void
  /** La ventana pide acoplarse: el proceso principal la cierra. */
  acoplar(): void
  /** El editor cierra la ventana (devuelve falso si no había). */
  cerrar(): Promise<boolean>
  alAcoplar(f: () => void): () => void
  /** La ventana ya no existe (la cerró el usuario o se acopló). */
  alCerrar(f: () => void): () => void
}
