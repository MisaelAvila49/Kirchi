import type { Rotacion } from '../doc/tipos'
import { enRejilla, MOTIVO_FUERA_DE_REJILLA } from './unidades'

/** Posición en mm, múltiplo de 2.5 mm, con el origen del documento. */
export interface PosMm {
  x: number
  y: number
}

export type OpTransformar = 'girar' | 'girarIzq' | 'espejoX' | 'espejoY'
export type TipoInstrumento = 'osciloscopio' | 'multimetro' | 'medidor'
export type TipoSondaOrden = 'osciloscopio' | 'multimetro' | 'voltaje' | 'corriente' | 'medidor'

/** Las órdenes de edición: el contrato serializable del asistente, el modo sin ventana y las pruebas. Nunca llevan ids
 * internos: las piezas van por referencia, las patillas por `R1.2` y las redes por nombre. */
export type Orden = (
  | { orden: 'colocar'; tipo: string; ref?: string; valor?: string; props?: Record<string, string>; en?: PosMm; rot?: Rotacion; espejo?: boolean }
  | { orden: 'cablear'; puntos: PosMm[] }
  | { orden: 'conectar'; desde: string; hasta: string; via?: 'auto' | 'cable' | 'etiqueta' }
  | { orden: 'mover'; refs: string[]; a?: PosMm; desplazar?: PosMm }
  | { orden: 'borrar'; refs?: string[]; cables?: string[]; etiquetas?: string[] }
  | { orden: 'propiedad'; ref: string; prop: string; valor: string }
  | { orden: 'unidad'; ref: string; unidad: string }
  | { orden: 'agrupar' }
  | { orden: 'transformar'; refs: string[]; op: OpTransformar }
  | { orden: 'instrumento'; tipo: TipoInstrumento; ref?: string; ajustes?: Record<string, string>; en?: PosMm; medir?: { punto: string; canal?: string; terminal?: string } }
  | { orden: 'sonda'; tipo: TipoSondaOrden; punto: string; instrumento?: string; entrada?: string }
  | { orden: 'fragmento'; plantilla?: string; archivo?: string; en?: PosMm; buscarLugar?: boolean }
  | { orden: 'nombrar'; punto: string; nombre: string }
  | { orden: 'analisis'; nombre: string; config: Record<string, unknown>; parametro?: Record<string, unknown>; trazas?: string[]; corrientes?: string[] }
  | { orden: 'vaciar' }
  | { orden: 'lote'; ordenes: Orden[] }
  | { orden: 'deshacer' }
  | { orden: 'rehacer' }
) & { clave?: string }

export type ResultadoValidar = { ok: true; orden: Orden } | { ok: false; motivo: string }

export const MAX_TEXTO_ORDEN = 200
export const MAX_LISTA_ORDEN = 2000
export const MAX_ORDENES_LOTE = 2000

class Rechazo extends Error {}
const no = (motivo: string): never => {
  throw new Rechazo(motivo)
}

type Campos = Record<string, unknown>
const esObjeto = (x: unknown): x is Campos => typeof x === 'object' && x !== null && !Array.isArray(x)

function texto(v: unknown, campo: string): string {
  if (typeof v !== 'string') return no(`«${campo}» debe ser un texto.`)
  if (v.length === 0) return no(`«${campo}» no puede estar vacío.`)
  if (v.length > MAX_TEXTO_ORDEN) return no(`«${campo}» admite ${MAX_TEXTO_ORDEN} caracteres como máximo.`)
  return v
}

/** Un valor de propiedad: texto, o un número que se pasa a texto. */
function valor(v: unknown, campo: string): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return no(`«${campo}» debe ser un número finito.`)
    return String(v)
  }
  return texto(v, campo)
}

function listaDe<T>(v: unknown, campo: string, cada: (x: unknown, i: number) => T, minimo = 0): T[] {
  if (!Array.isArray(v)) return no(`«${campo}» debe ser una lista.`)
  if (v.length > MAX_LISTA_ORDEN) return no(`«${campo}» admite ${MAX_LISTA_ORDEN} elementos como máximo.`)
  if (v.length < minimo) return no(`«${campo}» necesita al menos ${minimo} elementos.`)
  return v.map(cada)
}

function sinExtras(o: Campos, permitidos: string[], nombre: string): void {
  for (const k of Object.keys(o)) if (!permitidos.includes(k)) no(`${nombre === 'orden' ? 'La orden' : `«${nombre}»`} no admite el campo «${k.slice(0, 40)}».`)
}

function pos(v: unknown, campo: string): PosMm {
  if (!esObjeto(v)) return no(`«${campo}» debe ser un punto con x e y en mm.`)
  sinExtras(v, ['x', 'y'], campo)
  for (const k of ['x', 'y']) if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) no(`«${campo}.${k}» debe ser un número finito.`)
  if (!enRejilla(v.x as number) || !enRejilla(v.y as number)) no(MOTIVO_FUERA_DE_REJILLA)
  return { x: v.x as number, y: v.y as number }
}

function elegir<T extends string>(v: unknown, campo: string, opciones: readonly T[]): T {
  if (typeof v !== 'string' || !opciones.includes(v as T)) return no(`«${campo}» debe ser una de: ${opciones.join(', ')}.`)
  return v as T
}

function props(v: unknown, campo: string): Record<string, string> {
  if (!esObjeto(v)) return no(`«${campo}» debe ser un objeto de textos.`)
  const claves = Object.keys(v)
  if (claves.length > 64) no(`«${campo}» admite 64 propiedades como máximo.`)
  const salida: Record<string, string> = {}
  for (const k of claves) {
    if (k.length > 40) no(`«${campo}» tiene un nombre de propiedad demasiado largo.`)
    salida[k] = valor(v[k], `${campo}.${k}`)
  }
  return salida
}

const ROTACIONES: readonly number[] = [0, 90, 180, 270]
const OPS: readonly OpTransformar[] = ['girar', 'girarIzq', 'espejoX', 'espejoY']
const INSTRUMENTOS: readonly TipoInstrumento[] = ['osciloscopio', 'multimetro', 'medidor']
const SONDAS: readonly TipoSondaOrden[] = ['osciloscopio', 'multimetro', 'voltaje', 'corriente', 'medidor']

/** El nombre de una red: corto, porque se escribe junto a la patilla. */
export const MAX_NOMBRE_RED_ORDEN = 24
function nombreDeRed(v: unknown): string {
  const t = texto(v, 'nombre').trim()
  if (t === '') return no('«nombre» no puede estar vacío.')
  if (t.length > MAX_NOMBRE_RED_ORDEN) return no(`«nombre» admite ${MAX_NOMBRE_RED_ORDEN} caracteres como máximo.`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return no('«nombre» no puede llevar caracteres de control.')
  return t
}

/** `refs` o, por comodidad, `ref` con una sola: las dos formas dan una lista. */
function refs(o: Campos, obligatorio: boolean): string[] | undefined {
  if (o.refs !== undefined && o.ref !== undefined) no('Usa «ref» o «refs», no las dos.')
  const v = o.refs ?? (o.ref === undefined ? undefined : [o.ref])
  if (v === undefined) return obligatorio ? no('Falta «refs».') : undefined
  return listaDe(v, 'refs', (x) => texto(x, 'refs'), obligatorio ? 1 : 0)
}

function leer(o: Campos, anidada: boolean): Orden {
  const tipo = o.orden
  if (typeof tipo !== 'string') return no('Falta el campo «orden».')
  const permitir = (...c: string[]) => sinExtras(o, ['orden', 'clave', ...c], 'orden')
  let base: Orden
  switch (tipo) {
    case 'colocar': {
      permitir('tipo', 'ref', 'valor', 'props', 'en', 'rot', 'espejo')
      const c: Orden = { orden: 'colocar', tipo: texto(o.tipo, 'tipo') }
      if (o.ref !== undefined) c.ref = texto(o.ref, 'ref')
      if (o.valor !== undefined) c.valor = valor(o.valor, 'valor')
      if (o.props !== undefined) c.props = props(o.props, 'props')
      if (o.en !== undefined) c.en = pos(o.en, 'en')
      if (o.rot !== undefined) {
        if (typeof o.rot !== 'number' || !ROTACIONES.includes(o.rot)) no('La rotación es 0, 90, 180 o 270.')
        c.rot = o.rot as Rotacion
      }
      if (o.espejo !== undefined) {
        if (typeof o.espejo !== 'boolean') no('«espejo» debe ser verdadero o falso.')
        c.espejo = o.espejo as boolean
      }
      base = c
      break
    }
    case 'cablear':
      permitir('puntos')
      base = { orden: 'cablear', puntos: listaDe(o.puntos, 'puntos', (p) => pos(p, 'puntos'), 2) }
      break
    case 'conectar': {
      permitir('desde', 'hasta', 'via')
      const c: Orden = { orden: 'conectar', desde: texto(o.desde, 'desde'), hasta: texto(o.hasta, 'hasta') }
      if (o.via !== undefined) c.via = elegir(o.via, 'via', ['auto', 'cable', 'etiqueta'] as const)
      base = c
      break
    }
    case 'mover': {
      permitir('ref', 'refs', 'a', 'desplazar')
      if ((o.a === undefined) === (o.desplazar === undefined)) no('Mover pide «a» o «desplazar», uno solo.')
      const c: Orden = { orden: 'mover', refs: refs(o, true)! }
      if (o.a !== undefined) c.a = pos(o.a, 'a')
      if (o.desplazar !== undefined) c.desplazar = pos(o.desplazar, 'desplazar')
      base = c
      break
    }
    case 'borrar': {
      permitir('ref', 'refs', 'cables', 'etiquetas')
      const c: Orden = { orden: 'borrar' }
      const r = refs(o, false)
      if (r) c.refs = r
      if (o.cables !== undefined) c.cables = listaDe(o.cables, 'cables', (x) => texto(x, 'cables'))
      if (o.etiquetas !== undefined) c.etiquetas = listaDe(o.etiquetas, 'etiquetas', (x) => texto(x, 'etiquetas'))
      base = c
      break
    }
    case 'propiedad':
      permitir('ref', 'prop', 'valor')
      base = { orden: 'propiedad', ref: texto(o.ref, 'ref'), prop: texto(o.prop, 'prop'), valor: valor(o.valor, 'valor') }
      break
    case 'unidad':
      permitir('ref', 'unidad')
      base = { orden: 'unidad', ref: texto(o.ref, 'ref'), unidad: texto(o.unidad, 'unidad') }
      break
    case 'transformar':
      permitir('ref', 'refs', 'op')
      base = { orden: 'transformar', refs: refs(o, true)!, op: elegir(o.op, 'op', OPS) }
      break
    case 'instrumento': {
      permitir('tipo', 'ref', 'ajustes', 'en', 'medir')
      const c: Orden = { orden: 'instrumento', tipo: elegir(o.tipo, 'tipo', INSTRUMENTOS) }
      if (o.ref !== undefined) c.ref = texto(o.ref, 'ref')
      if (o.ajustes !== undefined) c.ajustes = props(o.ajustes, 'ajustes')
      if (o.en !== undefined) c.en = pos(o.en, 'en')
      if (o.medir !== undefined) {
        if (!esObjeto(o.medir)) no('«medir» debe ser un objeto.')
        const m = o.medir as Campos
        sinExtras(m, ['punto', 'canal', 'terminal'], 'medir')
        c.medir = { punto: texto(m.punto, 'medir.punto') }
        if (m.canal !== undefined) c.medir.canal = texto(m.canal, 'medir.canal')
        if (m.terminal !== undefined) c.medir.terminal = texto(m.terminal, 'medir.terminal')
      }
      base = c
      break
    }
    case 'sonda': {
      permitir('tipo', 'punto', 'instrumento', 'entrada')
      const c: Orden = { orden: 'sonda', tipo: elegir(o.tipo, 'tipo', SONDAS), punto: texto(o.punto, 'punto') }
      if (o.instrumento !== undefined) c.instrumento = texto(o.instrumento, 'instrumento')
      if (o.entrada !== undefined) c.entrada = texto(o.entrada, 'entrada')
      base = c
      break
    }
    case 'fragmento': {
      permitir('plantilla', 'archivo', 'en', 'buscarLugar')
      if ((o.plantilla === undefined) === (o.archivo === undefined)) no('Un fragmento pide «plantilla» o «archivo», uno solo.')
      const c: Orden = { orden: 'fragmento' }
      if (o.plantilla !== undefined) c.plantilla = texto(o.plantilla, 'plantilla')
      if (o.archivo !== undefined) c.archivo = texto(o.archivo, 'archivo')
      if (o.en !== undefined) c.en = pos(o.en, 'en')
      if (o.buscarLugar !== undefined) {
        if (typeof o.buscarLugar !== 'boolean') no('«buscarLugar» debe ser verdadero o falso.')
        c.buscarLugar = o.buscarLugar as boolean
      }
      base = c
      break
    }
    case 'nombrar':
      permitir('punto', 'nombre')
      base = { orden: 'nombrar', punto: texto(o.punto, 'punto'), nombre: nombreDeRed(o.nombre) }
      break
    case 'analisis': {
      permitir('nombre', 'config', 'parametro', 'trazas', 'corrientes')
      if (!esObjeto(o.config)) no('«config» debe ser un objeto con el tipo de análisis.')
      const c: Orden = { orden: 'analisis', nombre: texto(o.nombre, 'nombre'), config: o.config as Record<string, unknown> }
      if (o.parametro !== undefined) {
        if (!esObjeto(o.parametro)) no('«parametro» debe ser un objeto.')
        c.parametro = o.parametro as Record<string, unknown>
      }
      if (o.trazas !== undefined) c.trazas = listaDe(o.trazas, 'trazas', (x) => texto(x, 'trazas'))
      if (o.corrientes !== undefined) c.corrientes = listaDe(o.corrientes, 'corrientes', (x) => texto(x, 'corrientes'))
      base = c
      break
    }
    case 'lote': {
      if (anidada) no('Un lote no puede llevar otro lote.')
      permitir('ordenes')
      if (Array.isArray(o.ordenes) && o.ordenes.length > MAX_ORDENES_LOTE) no(`Un lote admite ${MAX_ORDENES_LOTE} órdenes como máximo.`)
      base = {
        orden: 'lote',
        ordenes: listaDe(
          o.ordenes,
          'ordenes',
          (x, i) => {
            if (!esObjeto(x)) return no(`La orden ${i + 1} del lote debe ser un objeto.`)
            return leer(x, true)
          },
          1
        )
      }
      break
    }
    case 'vaciar':
    case 'agrupar':
    case 'deshacer':
    case 'rehacer':
      permitir()
      base = { orden: tipo }
      break
    default:
      return no(`La orden «${tipo.slice(0, 40)}» no existe.`)
  }
  if (o.clave !== undefined) base.clave = texto(o.clave, 'clave')
  return base
}

/** Revisa una orden venida de fuera. Nunca lanza: cualquier entrada da una orden o un motivo en español. */
export function validarOrden(x: unknown): ResultadoValidar {
  try {
    if (!esObjeto(x)) return { ok: false, motivo: 'Una orden debe ser un objeto.' }
    return { ok: true, orden: leer(x, false) }
  } catch (e) {
    return { ok: false, motivo: e instanceof Rechazo ? e.message : 'La orden no es válida.' }
  }
}
