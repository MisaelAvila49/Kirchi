import type { TonoFigura } from '../../../../../compartido/ajustes'
import {
  copiarAnotaciones,
  DESPLAZAMIENTO_MAX,
  FRACCION_RANGO,
  GROSOR_FLECHA_RANGO,
  idNuevo,
  MAX_ETIQUETAS,
  MAX_FLECHAS,
  MAX_TEXTOS,
  TAM_NOTA_BASE,
  TAM_NOTA_RANGO,
  type Anotaciones,
  type EstiloEje,
  type EstiloTexto,
  type NotaEtiqueta,
  type NotaFlecha,
  type NotaTexto,
  type TextoFijo
} from '../../../../../compartido/grafica/anotaciones'
import { FACTOR_PREFIJO, type AspectoGrafica, type AspectoTraza, type LadoEjeY, type PrefijoEje } from '../../../../../compartido/grafica/aspecto'
import { decimalesAjustados, ladoPorArrastre, posicionXPorArrastre, prefijoParaRango, rotuloDeEje } from '../../../../../compartido/grafica/ejes'
import { marcasLineales } from '../../../../../compartido/grafica/ticks'
import type { Rect } from './geometria'
import type { Adornos } from '../preajustes'
import type { RangoExportar } from '../rango'
import type { Seleccion } from './objetos'

/**
 * Todo lo que el editor de exportar puede cambiar de una figura, en un valor inmutable: el historial lo guarda entero y los dos diálogos comparten las operaciones.
 */
export interface EstadoEditor {
  anot: Anotaciones
  aspecto: AspectoGrafica
  /** Lo que cambió cada traza (o canal): eje vertical, tono, grosor y unidad de su eje. Por su clave. */
  trazas: Readonly<Record<string, Partial<AspectoTraza>>>
  /** Las trazas (o canales) que no salen en la figura. */
  ocultas: readonly string[]
  adornos: Adornos
  /** El tramo del eje horizontal que se exporta (null: todo lo que muestra la figura). */
  rango: RangoExportar | null
}

const acotar = (v: number, [a, b]: readonly [number, number]): number => Math.max(a, Math.min(b, v))
/** Una posición como fracción de la figura: acotada y a cuatro decimales (así se guarda, sin ruido de coma flotante). */
const frac = (v: number): number => Math.round(acotar(v, FRACCION_RANGO) * 10000) / 10000
const conAnot = (e: EstadoEditor, f: (a: Anotaciones) => void): EstadoEditor => {
  const anot = copiarAnotaciones(e.anot)
  f(anot)
  return { ...e, anot }
}

export type TipoNota = 'texto' | 'flecha' | 'etiqueta'
export const TOPE_DE: Readonly<Record<TipoNota, number>> = { texto: MAX_TEXTOS, flecha: MAX_FLECHAS, etiqueta: MAX_ETIQUETAS }
export const hayLugar = (e: EstadoEditor, t: TipoNota): boolean => (t === 'texto' ? e.anot.textos.length : t === 'flecha' ? e.anot.flechas.length : e.anot.etiquetas.length) < TOPE_DE[t]

export function agregarTexto(e: EstadoEditor, fx: number, fy: number, texto = 'Texto'): { estado: EstadoEditor; id: string } | null {
  if (!hayLugar(e, 'texto')) return null
  const id = idNuevo('t', e.anot.textos.map((t) => t.id))
  const nota: NotaTexto = { id, texto, fx: frac(fx), fy: frac(fy), tam: TAM_NOTA_BASE, negrita: false, tono: 'negro' }
  return { estado: conAnot(e, (a) => a.textos.push(nota)), id }
}

export function agregarFlecha(e: EstadoEditor, x1: number, y1: number, x2: number, y2: number): { estado: EstadoEditor; id: string } | null {
  if (!hayLugar(e, 'flecha')) return null
  const id = idNuevo('f', e.anot.flechas.map((f) => f.id))
  const f: NotaFlecha = { id, x1: frac(x1), y1: frac(y1), x2: frac(x2), y2: frac(y2), tono: 'negro', grosor: 2 }
  return { estado: conAnot(e, (a) => a.flechas.push(f)), id }
}

/** Una etiqueta de valor pegada a una traza en el valor `x` de su eje horizontal, con el globo a `dx`, `dy` px de su punto. */
export function agregarEtiqueta(e: EstadoEditor, traza: string, x: number, dx = 18, dy = -44): { estado: EstadoEditor; id: string } | null {
  if (!hayLugar(e, 'etiqueta') || !Number.isFinite(x)) return null
  const id = idNuevo('e', e.anot.etiquetas.map((q) => q.id))
  const n: NotaEtiqueta = { id, traza, x, dx: Math.round(acotar(dx, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX])), dy: Math.round(acotar(dy, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX])), tono: null }
  return { estado: conAnot(e, (a) => a.etiquetas.push(n)), id }
}

export function editarTexto(e: EstadoEditor, id: string, p: Partial<Omit<NotaTexto, 'id'>>): EstadoEditor {
  return conAnot(e, (a) => {
    const n = a.textos.find((t) => t.id === id)
    if (!n) return
    if (p.texto !== undefined) n.texto = p.texto.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) || n.texto
    if (p.fx !== undefined) n.fx = frac(p.fx)
    if (p.fy !== undefined) n.fy = frac(p.fy)
    if (p.tam !== undefined) n.tam = Math.round(acotar(p.tam, TAM_NOTA_RANGO))
    if (p.negrita !== undefined) n.negrita = p.negrita
    if (p.tono !== undefined) n.tono = p.tono
  })
}

export function editarFlecha(e: EstadoEditor, id: string, p: Partial<Omit<NotaFlecha, 'id'>>): EstadoEditor {
  return conAnot(e, (a) => {
    const f = a.flechas.find((q) => q.id === id)
    if (!f) return
    for (const k of ['x1', 'y1', 'x2', 'y2'] as const) if (p[k] !== undefined) f[k] = frac(p[k]!)
    if (p.grosor !== undefined) f.grosor = acotar(p.grosor, GROSOR_FLECHA_RANGO)
    if (p.tono !== undefined) f.tono = p.tono
  })
}

export function editarEtiqueta(e: EstadoEditor, id: string, p: Partial<Omit<NotaEtiqueta, 'id'>>): EstadoEditor {
  return conAnot(e, (a) => {
    const n = a.etiquetas.find((q) => q.id === id)
    if (!n) return
    if (p.x !== undefined && Number.isFinite(p.x)) n.x = p.x
    if (p.dx !== undefined) n.dx = Math.round(acotar(p.dx, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX]))
    if (p.dy !== undefined) n.dy = Math.round(acotar(p.dy, [-DESPLAZAMIENTO_MAX, DESPLAZAMIENTO_MAX]))
    if (p.tono !== undefined) n.tono = p.tono
    if (p.traza !== undefined) n.traza = p.traza
  })
}

/** Quita una nota (texto, flecha o etiqueta); lo demás no se borra. */
export function borrarNota(e: EstadoEditor, s: Seleccion): EstadoEditor {
  if (s.tipo !== 'texto' && s.tipo !== 'flecha' && s.tipo !== 'etiqueta') return e
  return conAnot(e, (a) => {
    if (s.tipo === 'texto') a.textos = a.textos.filter((t) => t.id !== s.id)
    else if (s.tipo === 'flecha') a.flechas = a.flechas.filter((f) => f.id !== s.id)
    else a.etiquetas = a.etiquetas.filter((q) => q.id !== s.id)
  })
}

/** El estilo de un título de la figura; un parche con `undefined` en un campo lo quita; sin campos, el estilo desaparece. */
export function estiloTitulo(e: EstadoEditor, k: TextoFijo, p: { [K in keyof EstiloTexto]?: EstiloTexto[K] | null }): EstadoEditor {
  return conAnot(e, (a) => {
    const nuevo: EstiloTexto = { ...(a.estilos[k] ?? {}) }
    for (const [c, v] of Object.entries(p) as [keyof EstiloTexto, unknown][]) {
      // El texto vacío se guarda (título en blanco); null lo devuelve al automático.
      if (v === null || v === undefined || (v === '' && c !== 'texto')) delete nuevo[c]
      else (nuevo as Record<string, unknown>)[c] = c === 'tam' ? Math.round(acotar(v as number, TAM_NOTA_RANGO)) : v
    }
    if (Object.keys(nuevo).length === 0) delete a.estilos[k]
    else a.estilos[k] = nuevo
  })
}

/** El estilo propio de un eje (`x` o la clave de una traza); lo vacío se quita. */
export function estiloEje(e: EstadoEditor, clave: string, p: { [K in keyof EstiloEje]?: EstiloEje[K] | null }): EstadoEditor {
  return conAnot(e, (a) => {
    const nuevo: EstiloEje = { ...(a.ejes[clave] ?? {}) }
    for (const [c, v] of Object.entries(p) as [keyof EstiloEje, unknown][]) {
      if (v === null || v === undefined || v === '') delete nuevo[c]
      else if (c === 'tam') nuevo.tam = Math.round(acotar(v as number, [9, 24]))
      else if (c === 'grosor') nuevo.grosor = acotar(v as number, [0.5, 4])
      else (nuevo as Record<string, unknown>)[c] = v
    }
    if (Object.keys(nuevo).length === 0) delete a.ejes[clave]
    else a.ejes[clave] = nuevo
  })
}

export const cambiarAspecto = (e: EstadoEditor, p: Partial<AspectoGrafica>): EstadoEditor => ({ ...e, aspecto: { ...e.aspecto, ...p } })
export const cambiarAdornos = (e: EstadoEditor, p: Partial<Adornos>): EstadoEditor => ({ ...e, adornos: { ...e.adornos, ...p } })
export const cambiarRango = (e: EstadoEditor, rango: RangoExportar | null): EstadoEditor => ({ ...e, rango })

/** El estado con que se dibuja la figura: al elegir un tramo se ve todo el eje, para poder ampliarlo y no solo achicarlo. */
export const estadoParaDibujar = (e: EstadoEditor, eligiendoTramo: boolean): EstadoEditor => (eligiendoTramo && e.rango ? cambiarRango(e, null) : e)

/**
 * Paso entre las cifras del eje horizontal para el tramo `dom`, en el prefijo con que se escriben (null sin marcas lineales). El osciloscopio usa diez divisiones; una gráfica, marcas bonitas.
 */
export function pasoDeEjeX(tipo: 'pantalla' | 'grafica', dom: { min: number; max: number }, unidad: string, prefijo: PrefijoEje | null): number | null {
  const mayor = Math.max(Math.abs(dom.min), Math.abs(dom.max))
  if (!(dom.max > dom.min) || !Number.isFinite(mayor)) return null
  if (tipo === 'pantalla') {
    const base = (dom.max - dom.min) / 10
    const fa = FACTOR_PREFIJO[prefijo ?? prefijoParaRango(Math.max(base, mayor), unidad)]
    return Number((base / fa).toPrecision(1))
  }
  const marcas = marcasLineales(dom.min, dom.max, 6)
  if (marcas.length < 2) return null
  return (marcas[1] - marcas[0]) / FACTOR_PREFIJO[rotuloDeEje(unidad, mayor, prefijo).prefijo]
}

/**
 * Lleva el selector de decimales del eje horizontal a los que pide el tramo actual: un número elegido sube solo cuando las marcas dejan de distinguirse, «auto» no cambia. `paso` está en el prefijo del eje.
 */
export function ajustarDecimalesX(e: EstadoEditor, paso: number | null, omision: number): EstadoEditor {
  if (paso === null) return e
  const nuevo = decimalesAjustados(paso, e.aspecto.decimalesX, omision)
  return nuevo === null ? e : cambiarAspecto(e, { decimalesX: nuevo })
}

/**
 * Eje arrastrado hasta (fx, fy) en px de la figura: el horizontal sube o baja, uno vertical se pega a izquierda, medio o derecha (mismas zonas que la ventana de gráficas).
 */
export function acomodarEje(e: EstadoEditor, id: string, area: Rect, fx: number, fy: number, clave: string | null, lado: LadoEjeY): EstadoEditor {
  if (id === 'eje:x') {
    const nuevo = posicionXPorArrastre((fy - area.y) / area.h, e.aspecto.ejeX)
    return nuevo === e.aspecto.ejeX ? e : cambiarAspecto(e, { ejeX: nuevo })
  }
  if (clave === null) return e
  const nuevo = ladoPorArrastre((fx - area.x) / area.w, lado)
  return nuevo === lado ? e : cambiarTraza(e, clave, { lado: nuevo })
}

export function cambiarTraza(e: EstadoEditor, clave: string, p: Partial<AspectoTraza>): EstadoEditor {
  return { ...e, trazas: { ...e.trazas, [clave]: { ...(e.trazas[clave] ?? {}), ...p } } }
}

/** Enciende o apaga una traza; la última encendida no se apaga (sin datos no hay figura). */
export function alternarTraza(e: EstadoEditor, clave: string, todas: readonly string[]): EstadoEditor {
  if (e.ocultas.includes(clave)) return { ...e, ocultas: e.ocultas.filter((c) => c !== clave) }
  if (todas.filter((c) => !e.ocultas.includes(c)).length <= 1) return e
  return { ...e, ocultas: [...e.ocultas, clave] }
}

/** Lo que se mueve al arrastrar una nota: su posición en la figura o el desplazamiento de su globo. */
export function moverNota(e: EstadoEditor, s: Seleccion, dx: number, dy: number, geo: { ancho: number; alto: number }): EstadoEditor {
  if (s.tipo === 'texto') {
    const n = e.anot.textos.find((t) => t.id === s.id)
    return n ? editarTexto(e, s.id, { fx: n.fx + dx / geo.ancho, fy: n.fy + dy / geo.alto }) : e
  }
  if (s.tipo === 'flecha') {
    const f = e.anot.flechas.find((q) => q.id === s.id)
    return f ? editarFlecha(e, s.id, { x1: f.x1 + dx / geo.ancho, x2: f.x2 + dx / geo.ancho, y1: f.y1 + dy / geo.alto, y2: f.y2 + dy / geo.alto }) : e
  }
  if (s.tipo === 'etiqueta') {
    const n = e.anot.etiquetas.find((q) => q.id === s.id)
    return n ? editarEtiqueta(e, s.id, { dx: n.dx + dx, dy: n.dy + dy }) : e
  }
  return e
}

export const TONOS_RAPIDOS: readonly TonoFigura[] = ['negro', 'gris', 'canal-a', 'canal-b', 'naranja']
