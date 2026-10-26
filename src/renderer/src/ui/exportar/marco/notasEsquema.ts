import { TONOS_FIGURA, type Tema, type TonoFigura } from '../../../../../compartido/ajustes'
import { TEXTO_SIN_LECTURA } from '../../../exportar/lecturaEsquema'
import { escaparXml, num } from '../../../exportar/svg'
import { MM_POR_UNIDAD } from '../../../doc/tipos'
import { coloresDeTema } from '../../colores'
import { dentro, distanciaASegmento, type Rect } from '../editor/geometria'

/**
 * Anotaciones del esquema exportado. Solo viven en la imagen, nunca en el `.kir`. Van en mm del mundo (no se mueven al cambiar margen, alcance u hoja) y las letras en px de la figura. El color es un nombre de la tabla de colores.
 */
export const PX_POR_MM = 96 / 25.4
export const MAX_NOTAS = 40
export const TAM_TEXTO_RANGO = [8, 48] as const
export const TAM_LLAMADA_RANGO = [16, 48] as const
export const GROSOR_RANGO = [1, 8] as const
export const TAM_GLOBO = 13
/** Tamaño de letra de una etiqueta de lectura nueva. */
export const TAM_LECTURA = 11
const LARGO_TEXTO = 120
const MIN_LADO_MM = 2

export type HerramientaEsquema = 'seleccionar' | 'texto' | 'flecha' | 'resalte' | 'llamada' | 'lectura'
export type PuntaFlecha = 'cerrada' | 'abierta' | 'ninguna'
export type FormaResalte = 'rectangulo' | 'elipse'
export type MagnitudLectura = 'voltaje' | 'corriente'

interface Base {
  id: string
  tono: TonoFigura
}
export interface NotaTexto extends Base {
  tipo: 'texto'
  /** Esquina izquierda y centro vertical del texto, en mm del mundo. */
  x: number
  y: number
  texto: string
  tam: number
  negrita: boolean
}
export interface NotaFlecha extends Base {
  tipo: 'flecha'
  x1: number
  y1: number
  x2: number
  y2: number
  grosor: number
  punta: PuntaFlecha
}
export interface NotaResalte extends Base {
  tipo: 'resalte'
  x: number
  y: number
  ancho: number
  alto: number
  forma: FormaResalte
  grosor: number
  /** Relleno claro del mismo tono. */
  relleno: boolean
}
export interface NotaLlamada extends Base {
  tipo: 'llamada'
  /** El centro del círculo. El número sale de su lugar entre las llamadas: borrar una renumera las demás. */
  x: number
  y: number
  tam: number
}
export interface NotaLectura extends Base {
  tipo: 'lectura'
  /** El punto medido (mm del mundo) y lo que hay ahí: el cable o el pin (clave «pieza:pin») cuya red o corriente se lee. */
  x: number
  y: number
  magnitud: MagnitudLectura
  cable: string | null
  pin: string | null
  /** Dónde queda la esquina del globo respecto de su punto, en mm. */
  dx: number
  dy: number
  /** Tamaño de la letra de la cifra, en px de la figura; la nota de abajo y el globo siguen su proporción. */
  tam: number
  negrita: boolean
  /** Con `false` la etiqueta lleva solo la cifra, sin la nota de abajo («punto de operación», «t = …»). Ausente vale `true`. */
  mostrarTexto?: boolean
}
export type NotaEsquema = NotaTexto | NotaFlecha | NotaResalte | NotaLlamada | NotaLectura
export type TipoNota = NotaEsquema['tipo']
export type Notas = readonly NotaEsquema[]

/** Lo que el dibujo necesita de fuera: el texto de una etiqueta de lectura en este momento. */
export interface ContextoNotas {
  texto(n: NotaLectura): string
  /** Lo que se dice bajo la cifra de una etiqueta: «punto de operación» o «t = 1.23 ms». */
  nota?(n: NotaLectura): string | undefined
}
export const CONTEXTO_VACIO: ContextoNotas = { texto: () => TEXTO_SIN_LECTURA }

const mm = (px: number): number => px / PX_POR_MM
const acotar = (v: number, [a, b]: readonly [number, number]): number => Math.max(a, Math.min(b, v))
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const esTono = (t: unknown): t is TonoFigura => typeof t === 'string' && (TONOS_FIGURA as readonly string[]).includes(t)

const PREFIJO: Record<TipoNota, string> = { texto: 't', flecha: 'f', resalte: 'r', llamada: 'l', lectura: 'e' }
function idNuevo(lista: Notas, tipo: TipoNota): string {
  const usados = new Set(lista.map((n) => n.id))
  for (let k = 1; ; k++) {
    const id = `${PREFIJO[tipo]}${k}`
    if (!usados.has(id)) return id
  }
}
export const hayLugar = (lista: Notas): boolean => lista.length < MAX_NOTAS

type Salida = { notas: Notas; id: string } | null
type Sin<T> = T extends unknown ? Omit<T, 'id'> : never
function agregar(lista: Notas, n: Sin<NotaEsquema>): Salida {
  if (!hayLugar(lista)) return null
  const id = idNuevo(lista, n.tipo)
  return { notas: [...lista, { ...n, id } as NotaEsquema], id }
}

export const crearTexto = (l: Notas, x: number, y: number, texto = 'Texto'): Salida => agregar(l, { tipo: 'texto', x: r3(x), y: r3(y), texto, tam: 16, negrita: false, tono: 'negro' })
export const crearFlecha = (l: Notas, x1: number, y1: number, x2: number, y2: number): Salida =>
  agregar(l, { tipo: 'flecha', x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2), grosor: 2, punta: 'cerrada', tono: 'negro' })
export const crearResalte = (l: Notas, x: number, y: number, ancho: number, alto: number, forma: FormaResalte = 'rectangulo'): Salida =>
  agregar(l, { tipo: 'resalte', x: r3(x), y: r3(y), ancho: r3(Math.max(MIN_LADO_MM, ancho)), alto: r3(Math.max(MIN_LADO_MM, alto)), forma, grosor: 2, relleno: false, tono: 'naranja' })
export const crearLlamada = (l: Notas, x: number, y: number): Salida => agregar(l, { tipo: 'llamada', x: r3(x), y: r3(y), tam: 24, tono: 'canal-b' })
export const crearLectura = (l: Notas, o: { x: number; y: number; magnitud: MagnitudLectura; cable: string | null; pin: string | null }): Salida =>
  agregar(l, { tipo: 'lectura', x: r3(o.x), y: r3(o.y), magnitud: o.magnitud, cable: o.cable, pin: o.pin, dx: r3(mm(18)), dy: r3(-mm(44)), tam: TAM_LECTURA, negrita: false, tono: 'naranja' })

/** El número de una llamada: su lugar entre las llamadas (1, 2, 3…); 0 si no es una llamada. */
export function numeroDe(lista: Notas, id: string): number {
  let k = 0
  for (const n of lista) {
    if (n.tipo !== 'llamada') continue
    k++
    if (n.id === id) return k
  }
  return 0
}

export type Parche = Partial<Omit<NotaTexto, 'id' | 'tipo'> & Omit<NotaFlecha, 'id' | 'tipo'> & Omit<NotaResalte, 'id' | 'tipo'> & Omit<NotaLlamada, 'id' | 'tipo'> & Omit<NotaLectura, 'id' | 'tipo'>>

/** Cambia lo que se pueda de una nota (lo que no le corresponde o sale de rango se ignora o se acota). */
export function editarNota(lista: Notas, id: string, p: Parche): Notas {
  return lista.map((n) => {
    if (n.id !== id) return n
    const c: Record<string, unknown> = { ...n }
    const numero = (k: string) => {
      const v = (p as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v) && k in n) c[k] = r3(v)
    }
    for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy']) numero(k)
    if (p.tono !== undefined && esTono(p.tono)) c.tono = p.tono
    if (n.tipo === 'texto') {
      if (typeof p.texto === 'string') c.texto = p.texto.trim() === '' ? n.texto : p.texto.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, LARGO_TEXTO)
      if (typeof p.tam === 'number') c.tam = Math.round(acotar(p.tam, TAM_TEXTO_RANGO))
      if (typeof p.negrita === 'boolean') c.negrita = p.negrita
    } else if (n.tipo === 'llamada') {
      if (typeof p.tam === 'number') c.tam = Math.round(acotar(p.tam, TAM_LLAMADA_RANGO))
    } else if (n.tipo === 'flecha') {
      if (typeof p.grosor === 'number') c.grosor = acotar(p.grosor, GROSOR_RANGO)
      if (p.punta === 'cerrada' || p.punta === 'abierta' || p.punta === 'ninguna') c.punta = p.punta
    } else if (n.tipo === 'resalte') {
      if (typeof p.grosor === 'number') c.grosor = acotar(p.grosor, GROSOR_RANGO)
      if (p.forma === 'rectangulo' || p.forma === 'elipse') c.forma = p.forma
      if (typeof p.relleno === 'boolean') c.relleno = p.relleno
      if (typeof p.ancho === 'number') c.ancho = Math.max(MIN_LADO_MM, r3(p.ancho))
      if (typeof p.alto === 'number') c.alto = Math.max(MIN_LADO_MM, r3(p.alto))
    } else if (n.tipo === 'lectura') {
      if (p.magnitud === 'voltaje' || p.magnitud === 'corriente') c.magnitud = p.magnitud
      if ('cable' in p) c.cable = typeof p.cable === 'string' ? p.cable : null
      if ('pin' in p) c.pin = typeof p.pin === 'string' ? p.pin : null
      if (typeof p.tam === 'number') c.tam = Math.round(acotar(p.tam, TAM_TEXTO_RANGO))
      if (typeof p.negrita === 'boolean') c.negrita = p.negrita
      if (typeof p.mostrarTexto === 'boolean') c.mostrarTexto = p.mostrarTexto
    }
    return c as unknown as NotaEsquema
  })
}

export const borrarNota = (lista: Notas, id: string): Notas => (lista.some((n) => n.id === id) ? lista.filter((n) => n.id !== id) : lista)

/** Mueve una nota `dx`, `dy` mm. Una etiqueta de lectura mueve su globo y deja el punto donde está. */
export function moverNota(lista: Notas, id: string, dx: number, dy: number): Notas {
  const n = lista.find((q) => q.id === id)
  if (!n) return lista
  if (n.tipo === 'flecha') return editarNota(lista, id, { x1: n.x1 + dx, y1: n.y1 + dy, x2: n.x2 + dx, y2: n.y2 + dy })
  if (n.tipo === 'lectura') return editarNota(lista, id, { dx: n.dx + dx, dy: n.dy + dy })
  return editarNota(lista, id, { x: n.x + dx, y: n.y + dy })
}

// ---------- Fantasma ----------

export const ID_FANTASMA = 'fantasma'

export interface PedidoFantasma {
  herramienta: HerramientaEsquema
  lista: Notas
  /** El puntero en mm del mundo; null si está fuera de la imagen. */
  pos: { x: number; y: number } | null
  /** Dónde se pulsó, mientras se arrastra una flecha o un resalte. */
  inicio?: { x: number; y: number } | null
  magnitud?: MagnitudLectura
  /** Lo medible bajo el puntero, para la etiqueta de lectura. */
  objetivo?: { x: number; y: number; cable: string | null; pin: string | null } | null
}

/**
 * Lo que la herramienta activa pondría con un clic, para verlo siguiendo al puntero. Es una nota con id `fantasma`. null sin puntero o con Seleccionar.
 */
export function fantasmaDe(p: PedidoFantasma): NotaEsquema | null {
  if (!p.pos || p.herramienta === 'seleccionar') return null
  const { x, y } = p.pos
  const i = p.inicio
  let r: Salida = null
  switch (p.herramienta) {
    case 'texto':
      r = crearTexto([], x, y)
      break
    case 'flecha':
      r = i ? crearFlecha([], i.x, i.y, x, y) : null
      break
    case 'resalte':
      r = i ? crearResalte([], Math.min(i.x, x), Math.min(i.y, y), Math.abs(x - i.x), Math.abs(y - i.y)) : null
      break
    case 'llamada':
      r = crearLlamada([], x, y)
      break
    case 'lectura': {
      const o = p.objetivo
      if (!o) break
      r = crearLectura([], { x: o.x, y: o.y, magnitud: p.magnitud ?? 'voltaje', cable: o.cable, pin: o.pin })
      break
    }
  }
  return r ? { ...r.notas[0], id: ID_FANTASMA } : null
}

// ---------- Geometría ----------

/** Alto y ancho del globo de una etiqueta de lectura, en mm. */
export function medidaGlobo(texto: string, nota?: string, tam = TAM_GLOBO, negrita = false): { w: number; h: number } {
  const k = tam / TAM_GLOBO
  const w = Math.max(texto.length * tam * (negrita ? 0.66 : 0.62), nota ? nota.length * TAM_NOTA * k * 0.6 : 0)
  return { w: mm(w + 14 * k), h: mm(tam + 12 * k + (nota ? (TAM_NOTA + 4) * k : 0)) }
}
export const TAM_NOTA = 10
/** La nota que va bajo la cifra de una etiqueta de lectura: ninguna si la etiqueta oculta su texto. */
const notaVisible = (n: NotaLectura, ctx: ContextoNotas): string | undefined => (n.mostrarTexto === false ? undefined : ctx.nota?.(n))

export function cajaDeNota(n: NotaEsquema, ctx: ContextoNotas = CONTEXTO_VACIO): Rect {
  switch (n.tipo) {
    case 'texto': {
      const w = mm(n.texto.length * n.tam * (n.negrita ? 0.58 : 0.54))
      const h = mm(n.tam * 1.3)
      return { x: n.x, y: n.y - h / 2, w, h }
    }
    case 'flecha':
      return { x: Math.min(n.x1, n.x2), y: Math.min(n.y1, n.y2), w: Math.abs(n.x2 - n.x1), h: Math.abs(n.y2 - n.y1) }
    case 'resalte':
      return { x: n.x, y: n.y, w: n.ancho, h: n.alto }
    case 'llamada': {
      const r = mm(n.tam) / 2
      return { x: n.x - r, y: n.y - r, w: 2 * r, h: 2 * r }
    }
    case 'lectura': {
      const g = medidaGlobo(ctx.texto(n), notaVisible(n, ctx), n.tam ?? TAM_LECTURA, !!n.negrita)
      return { x: n.x + n.dx, y: n.y + n.dy, w: g.w, h: g.h }
    }
  }
}

/** La nota bajo el puntero (mm del mundo), de la de arriba a la de abajo; `tol` en mm. */
export function notaEn(lista: Notas, x: number, y: number, tol: number, ctx: ContextoNotas = CONTEXTO_VACIO): string | null {
  for (const n of [...lista].reverse()) {
    if (n.tipo === 'texto' && dentro(cajaDeNota(n), x, y, tol / 2)) return n.id
    if (n.tipo === 'flecha' && distanciaASegmento(x, y, n.x1, n.y1, n.x2, n.y2) <= Math.max(tol, mm(n.grosor) / 2 + tol / 2)) return n.id
    if (n.tipo === 'llamada' && Math.hypot(x - n.x, y - n.y) <= mm(n.tam) / 2 + tol / 3) return n.id
    if (n.tipo === 'lectura' && (dentro(cajaDeNota(n, ctx), x, y, tol / 3) || Math.hypot(x - n.x, y - n.y) <= tol)) return n.id
    if (n.tipo === 'resalte') {
      if (n.relleno && dentro(cajaDeNota(n), x, y)) return n.id
      if (distanciaAlBorde(n, x, y) <= Math.max(tol, mm(n.grosor) / 2 + tol / 2)) return n.id
    }
  }
  return null
}

/** Distancia (mm) de un punto al contorno de un resalte. */
function distanciaAlBorde(n: NotaResalte, x: number, y: number): number {
  const { x: x0, y: y0, ancho: w, alto: h } = n
  if (n.forma === 'rectangulo') {
    const lados: [number, number, number, number][] = [
      [x0, y0, x0 + w, y0],
      [x0 + w, y0, x0 + w, y0 + h],
      [x0 + w, y0 + h, x0, y0 + h],
      [x0, y0 + h, x0, y0]
    ]
    return Math.min(...lados.map(([a, b, c, d]) => distanciaASegmento(x, y, a, b, c, d)))
  }
  // Elipse: la distancia al contorno se aproxima por (1 - ρ) escalado por el semieje menor.
  const a = w / 2
  const b = h / 2
  const rho = Math.hypot((x - (x0 + a)) / a, (y - (y0 + b)) / b)
  return Math.abs(1 - rho) * Math.min(a, b)
}

export interface Asa {
  id: string
  x: number
  y: number
}
/** Las asas con que se estira una nota: los dos extremos de una flecha y las cuatro esquinas de un resalte. */
export function asasDe(n: NotaEsquema): Asa[] {
  if (n.tipo === 'flecha')
    return [
      { id: 'p1', x: n.x1, y: n.y1 },
      { id: 'p2', x: n.x2, y: n.y2 }
    ]
  if (n.tipo === 'lectura') return [{ id: 'punto', x: n.x, y: n.y }]
  if (n.tipo === 'resalte')
    return [
      { id: 'nw', x: n.x, y: n.y },
      { id: 'ne', x: n.x + n.ancho, y: n.y },
      { id: 'sw', x: n.x, y: n.y + n.alto },
      { id: 'se', x: n.x + n.ancho, y: n.y + n.alto }
    ]
  return []
}

/** Lleva un asa a (x, y): en un resalte la esquina contraria queda fija y el lado mínimo se respeta. */
export function moverAsa(lista: Notas, id: string, asa: string, x: number, y: number): Notas {
  const n = lista.find((q) => q.id === id)
  if (!n) return lista
  if (n.tipo === 'flecha') return asa === 'p1' ? editarNota(lista, id, { x1: x, y1: y }) : asa === 'p2' ? editarNota(lista, id, { x2: x, y2: y }) : lista
  if (n.tipo === 'lectura') return asa === 'punto' ? editarNota(lista, id, { x, y }) : lista
  if (n.tipo !== 'resalte') return lista
  const fijoX = asa === 'nw' || asa === 'sw' ? n.x + n.ancho : n.x
  const fijoY = asa === 'nw' || asa === 'ne' ? n.y + n.alto : n.y
  return editarNota(lista, id, { x: Math.min(fijoX, x), y: Math.min(fijoY, y), ancho: Math.abs(x - fijoX), alto: Math.abs(y - fijoY) })
}

/** Si la nota queda entera fuera del área (nada de ella saldría en la imagen). */
export function fueraDelAreaNota(n: NotaEsquema, area: Rect, ctx: ContextoNotas = CONTEXTO_VACIO): boolean {
  const c = cajaDeNota(n, ctx)
  const incluyePunto = n.tipo === 'lectura' ? dentro(area, n.x, n.y) : false
  return !incluyePunto && (c.x + c.w < area.x || c.x > area.x + area.w || c.y + c.h < area.y || c.y > area.y + area.h)
}

// ---------- Dibujo ----------

export interface OpcionesDibujo {
  tema: Tema
  ctx?: ContextoNotas
  /** Dibuja solo la nota con este id (el fantasma de una herramienta), sin las demás. */
  solo?: string
}

const FUENTE = "'Mona Sans', 'Segoe UI', system-ui, sans-serif"
const FUENTE_CIFRAS = "'Geist Mono', ui-monospace, Consolas, monospace"
const n3 = (v: number) => num(v)

function puntaSvg(f: NotaFlecha, color: string): { corte: number; marca: string } {
  const largo = mm(8 + 2 * f.grosor)
  const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1)
  const abre = 0.45
  const a = [f.x2 - largo * Math.cos(ang - abre), f.y2 - largo * Math.sin(ang - abre)]
  const b = [f.x2 - largo * Math.cos(ang + abre), f.y2 - largo * Math.sin(ang + abre)]
  if (f.punta === 'cerrada') return { corte: mm(6 + 2 * f.grosor), marca: `<polygon points="${n3(f.x2)},${n3(f.y2)} ${n3(a[0])},${n3(a[1])} ${n3(b[0])},${n3(b[1])}" fill="${color}"/>` }
  if (f.punta === 'abierta') return { corte: 0, marca: `<polyline points="${n3(a[0])},${n3(a[1])} ${n3(f.x2)},${n3(f.y2)} ${n3(b[0])},${n3(b[1])}" fill="none" stroke="${color}" stroke-width="${n3(mm(f.grosor))}" stroke-linecap="round" stroke-linejoin="round"/>` }
  return { corte: 0, marca: '' }
}

/**
 * Anotaciones como grupo SVG en mm del mundo, dentro de `<g transform="scale(1/1.25)">` para caer sobre la lámina. Lo usan la vista previa y el archivo.
 */
export function svgDeNotas(lista: Notas, o: OpcionesDibujo): string {
  if (lista.length === 0) return ''
  const col = coloresDeTema(o.tema)
  const ctx = o.ctx ?? CONTEXTO_VACIO
  const c = (t: TonoFigura) => col[t] ?? col.negro
  const partes: string[] = []
  for (const n of lista) {
    if (o.solo !== undefined && n.id !== o.solo) continue
    const color = c(n.tono)
    if (n.tipo === 'resalte') {
      const forma =
        n.forma === 'elipse'
          ? `<ellipse cx="${n3(n.x + n.ancho / 2)}" cy="${n3(n.y + n.alto / 2)}" rx="${n3(n.ancho / 2)}" ry="${n3(n.alto / 2)}"`
          : `<rect x="${n3(n.x)}" y="${n3(n.y)}" width="${n3(n.ancho)}" height="${n3(n.alto)}" rx="${n3(mm(3))}"`
      partes.push(`${forma} fill="${n.relleno ? color : 'none'}"${n.relleno ? ' fill-opacity="0.14"' : ''} stroke="${color}" stroke-width="${n3(mm(n.grosor))}" data-nota="${n.id}"/>`)
    } else if (n.tipo === 'flecha') {
      const largo = Math.hypot(n.x2 - n.x1, n.y2 - n.y1)
      const p = puntaSvg(n, color)
      const ang = Math.atan2(n.y2 - n.y1, n.x2 - n.x1)
      const k = Math.min(p.corte, largo)
      partes.push(`<line x1="${n3(n.x1)}" y1="${n3(n.y1)}" x2="${n3(n.x2 - Math.cos(ang) * k)}" y2="${n3(n.y2 - Math.sin(ang) * k)}" stroke="${color}" stroke-width="${n3(mm(n.grosor))}" stroke-linecap="round" data-nota="${n.id}"/>`)
      if (largo > 0) partes.push(p.marca)
    } else if (n.tipo === 'texto') {
      partes.push(`<text x="${n3(n.x)}" y="${n3(n.y)}" dominant-baseline="central" font-family="${FUENTE}" font-size="${n3(mm(n.tam))}" font-weight="${n.negrita ? 650 : 400}" fill="${color}" data-nota="${n.id}">${escaparXml(n.texto)}</text>`)
    } else if (n.tipo === 'llamada') {
      const numero = numeroDe(lista, n.id)
      partes.push(
        `<circle cx="${n3(n.x)}" cy="${n3(n.y)}" r="${n3(mm(n.tam) / 2)}" fill="${color}" data-nota="${n.id}"/>`,
        `<text x="${n3(n.x)}" y="${n3(n.y)}" text-anchor="middle" dominant-baseline="central" font-family="${FUENTE}" font-size="${n3(mm(n.tam) * 0.58)}" font-weight="700" fill="${col['ic-contra']}">${numero}</text>`
      )
    } else {
      const texto = ctx.texto(n)
      const nota = notaVisible(n, ctx)
      const g = cajaDeNota(n, ctx)
      // El hilo del punto al borde más cercano del globo.
      const ex = Math.max(g.x, Math.min(g.x + g.w, n.x))
      const ey = Math.max(g.y, Math.min(g.y + g.h, n.y))
      const r = mm(4.5)
      const tam = n.tam ?? TAM_LECTURA
      const k = tam / TAM_GLOBO
      partes.push(
        `<line x1="${n3(n.x)}" y1="${n3(n.y)}" x2="${n3(ex)}" y2="${n3(ey)}" stroke="${color}" stroke-width="${n3(mm(1))}" data-nota="${n.id}"/>`,
        `<rect x="${n3(g.x)}" y="${n3(g.y)}" width="${n3(g.w)}" height="${n3(g.h)}" rx="${n3(mm(4))}" fill="${col['ic-contra']}" stroke="${color}" stroke-width="${n3(mm(1.2))}"/>`,
        `<polygon points="${n3(n.x)},${n3(n.y - r)} ${n3(n.x + r)},${n3(n.y)} ${n3(n.x)},${n3(n.y + r)} ${n3(n.x - r)},${n3(n.y)}" fill="${color}" stroke="${col['ic-contra']}" stroke-width="${n3(mm(1.5))}"/>`,
        `<text x="${n3(g.x + mm(7 * k))}" y="${n3(nota ? g.y + mm((6 + tam / 2) * k) : g.y + g.h / 2)}" dominant-baseline="central" font-family="${FUENTE_CIFRAS}" font-size="${n3(mm(tam))}"${n.negrita ? ' font-weight="700"' : ''} fill="${col.negro}">${escaparXml(texto)}</text>`
      )
      if (nota) partes.push(`<text x="${n3(g.x + mm(7 * k))}" y="${n3(g.y + g.h - mm((6 + TAM_NOTA / 2) * k))}" dominant-baseline="central" font-family="${FUENTE}" font-size="${n3(mm(TAM_NOTA * k))}" fill="${col.negro}" fill-opacity="0.7">${escaparXml(nota)}</text>`)
    }
  }
  return `<g id="anotaciones" transform="scale(${n3(1 / MM_POR_UNIDAD)})">\n${partes.join('\n')}\n</g>`
}

/** Pone el grupo de anotaciones antes del cierre de una lámina SVG. */
export function conNotasEnSvg(svg: string, notas: Notas, o: OpcionesDibujo): string {
  const g = svgDeNotas(notas, o)
  if (!g) return svg
  const i = svg.lastIndexOf('</svg>')
  return i < 0 ? svg : `${svg.slice(0, i)}${g}\n${svg.slice(i)}`
}

// ---------- Caja de las anotaciones ----------

/** Una caja en unidades de mundo, como la de la lámina (`Caja` de la escena). */
export interface CajaMundo {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Todo lo que pinta una nota, en mm del mundo: su caja, más el hilo y el punto de una etiqueta, y el grosor del trazo. */
export function cajaVisibleDeNota(n: NotaEsquema, ctx: ContextoNotas = CONTEXTO_VACIO): Rect {
  const c = cajaDeNota(n, ctx)
  let x0 = c.x
  let y0 = c.y
  let x1 = c.x + c.w
  let y1 = c.y + c.h
  if (n.tipo === 'lectura') {
    const r = mm(6)
    x0 = Math.min(x0, n.x - r)
    y0 = Math.min(y0, n.y - r)
    x1 = Math.max(x1, n.x + r)
    y1 = Math.max(y1, n.y + r)
  } else if (n.tipo === 'flecha' || n.tipo === 'resalte') {
    const g = mm(n.grosor + (n.tipo === 'flecha' ? 8 : 0))
    x0 -= g
    y0 -= g
    x1 += g
    y1 += g
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Caja (unidades de mundo) que cubren las anotaciones. Con `dibujo` solo cuentan las que tocan algo de ahí. Null si no hay ninguna.
 */
export function cajaDeNotas(lista: Notas, ctx: ContextoNotas = CONTEXTO_VACIO, dibujo: CajaMundo | null = null): CajaMundo | null {
  const area: Rect | null = dibujo ? { x: dibujo.minX * MM_POR_UNIDAD, y: dibujo.minY * MM_POR_UNIDAD, w: (dibujo.maxX - dibujo.minX) * MM_POR_UNIDAD, h: (dibujo.maxY - dibujo.minY) * MM_POR_UNIDAD } : null
  let caja: CajaMundo | null = null
  for (const n of lista) {
    if (area && fueraDelAreaNota(n, area, ctx)) continue
    const r = cajaVisibleDeNota(n, ctx)
    const c = { minX: r.x / MM_POR_UNIDAD, minY: r.y / MM_POR_UNIDAD, maxX: (r.x + r.w) / MM_POR_UNIDAD, maxY: (r.y + r.h) / MM_POR_UNIDAD }
    caja = caja ? unirCajas(caja, c) : c
  }
  return caja
}

export const unirCajas = (a: CajaMundo, b: CajaMundo): CajaMundo => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) })
