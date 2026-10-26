/** Convierte el SVG de un símbolo en polilíneas y triángulos (rejilla fina; trazo sí y relleno no, `currentColor` rellena).
 * Admite g, line, polyline, polygon, rect, circle, ellipse y path; no transform, style, arcos compactos ("011") ni agujeros.
 * `<g data-capa="nombre">` va aparte, en `capas`: lo dibuja la animación de la pieza. */
import earcut from 'earcut'
import type { Caja, Geometria } from './tipos'

const SEG_CIRCULO = 32
const SEG_CURVA = 12
const IGNORADOS = new Set(['title', 'desc', 'metadata', 'defs'])
const NS_SVG = 'http://www.w3.org/2000/svg'
const RE_ESTILO = /(^|[;\s])(fill|stroke)\s*:/i

interface Sub {
  pts: number[]
  cerrada: boolean
}

export function svgAGeometria(fuente: string): Geometria {
  const doc = new DOMParser().parseFromString(fuente, 'image/svg+xml')
  const raiz = doc.documentElement
  if (!raiz || raiz.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) throw new Error('SVG inválido')
  const base = { trazos: [] as number[][], rellenos: [] as number[] }
  const capas = new Map<string, { trazos: number[][]; rellenos: number[] }>()
  let trazos = base.trazos
  let rellenos = base.rellenos
  let enCapa: string | null = null
  const visitar = (el: Element) => {
    for (const hijo of Array.from(el.children)) {
      const tag = hijo.tagName
      if (IGNORADOS.has(tag) || tag.includes(':') || (hijo.namespaceURI && hijo.namespaceURI !== NS_SVG)) continue
      if (hijo.hasAttribute('transform')) throw new Error(`transform no está soportado en <${tag}>`)
      for (let e: Element | null = hijo; e; e = e.parentElement)
        if (RE_ESTILO.test(e.getAttribute('style') ?? '')) throw new Error(`usa los atributos fill y stroke, no style (en <${tag}>)`)
      if (tag !== 'g' && hijo.hasAttribute('data-capa')) throw new Error(`data-capa va solo en un <g> (está en <${tag}>)`)
      if (tag === 'g') {
        const capa = hijo.getAttribute('data-capa')
        if (capa === null) {
          visitar(hijo)
          continue
        }
        if (!/^[a-z]+(-[a-z]+)*$/.test(capa)) throw new Error(`el nombre de capa «${capa}» debe ir en minúsculas con guiones`)
        if (enCapa !== null) throw new Error(`la capa «${capa}» está dentro de la capa «${enCapa}»`)
        if (capas.has(capa)) throw new Error(`la capa «${capa}» está dos veces`)
        const c = { trazos: [] as number[][], rellenos: [] as number[] }
        capas.set(capa, c)
        ;[trazos, rellenos, enCapa] = [c.trazos, c.rellenos, capa]
        visitar(hijo)
        ;[trazos, rellenos, enCapa] = [base.trazos, base.rellenos, null]
        continue
      }
      const subs = subtrayectorias(hijo).map((s) => limpiar(s, tag))
      if (!esNada(heredado(hijo, 'stroke')))
        for (const s of subs) if (s.pts.length >= 4) trazos.push(s.cerrada ? [...s.pts, s.pts[0], s.pts[1]] : s.pts)
      if (!esNada(heredado(hijo, 'fill')))
        for (const s of subs) {
          if (s.pts.length < 6) continue
          for (const i of earcut(s.pts)) rellenos.push(s.pts[2 * i], s.pts[2 * i + 1])
        }
    }
  }
  visitar(raiz)
  const g: Geometria = { trazos: base.trazos, rellenos: base.rellenos, caja: cajaDe(base.trazos, base.rellenos) }
  if (capas.size) g.capas = Object.fromEntries([...capas].map(([n, c]) => [n, { trazos: c.trazos, rellenos: c.rellenos, caja: cajaDe(c.trazos, c.rellenos) }]))
  return g
}

const esNada = (v: string) => ['none', 'transparent', ''].includes(v.trim().toLowerCase())

/** Valida coordenadas y quita puntos repetidos seguidos (y el cierre duplicado del anillo). */
function limpiar(s: Sub, tag: string): Sub {
  if (s.pts.length % 2 !== 0 || s.pts.some((v) => !Number.isFinite(v))) throw new Error(`coordenada inválida en <${tag}>`)
  const pts: number[] = []
  for (let i = 0; i < s.pts.length; i += 2) {
    const n = pts.length
    if (n >= 2 && pts[n - 2] === s.pts[i] && pts[n - 1] === s.pts[i + 1]) continue
    pts.push(s.pts[i], s.pts[i + 1])
  }
  if (s.cerrada && pts.length > 2 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1]) pts.length -= 2
  return { pts, cerrada: s.cerrada }
}

function heredado(el: Element, attr: 'fill' | 'stroke'): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = e.getAttribute(attr)
    if (v !== null) return v
  }
  return attr === 'fill' ? 'none' : 'currentColor'
}

const num = (el: Element, a: string) => Number(el.getAttribute(a) ?? 0)

function lista(texto: string | null): number[] {
  return (texto ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
}

function elipse(cx: number, cy: number, rx: number, ry: number): Sub {
  const pts: number[] = []
  for (let k = 0; k < SEG_CIRCULO; k++) {
    const t = (2 * Math.PI * k) / SEG_CIRCULO
    pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
  return { pts, cerrada: true }
}

function subtrayectorias(el: Element): Sub[] {
  switch (el.tagName) {
    case 'line':
      return [{ pts: [num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2')], cerrada: false }]
    case 'polyline':
      return [{ pts: lista(el.getAttribute('points')), cerrada: false }]
    case 'polygon':
      return [{ pts: lista(el.getAttribute('points')), cerrada: true }]
    case 'rect': {
      const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height')
      return [{ pts: [x, y, x + w, y, x + w, y + h, x, y + h], cerrada: true }]
    }
    case 'circle':
      return [elipse(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r'))]
    case 'ellipse':
      return [elipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'))]
    case 'path':
      return trayectoria(el.getAttribute('d') ?? '')
    default:
      throw new Error(`elemento SVG no soportado: <${el.tagName}>`)
  }
}

const RE_TOKEN = /[MmLlHhVvCcQqAaZzSsTt]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

function trayectoria(d: string): Sub[] {
  const tk = d.match(RE_TOKEN) ?? []
  const subs: Sub[] = []
  let i = 0
  let cmd = ''
  let x = 0, y = 0, sx = 0, sy = 0
  let cur: number[] | null = null
  const n = () => {
    const v = Number(tk[i++])
    if (Number.isNaN(v)) throw new Error('trayectoria SVG inválida')
    return v
  }
  const empezar = (nx: number, ny: number) => {
    cur = [nx, ny]
    subs.push({ pts: cur, cerrada: false })
    sx = nx
    sy = ny
  }
  const linea = (nx: number, ny: number) => {
    if (!cur) empezar(x, y)
    cur!.push(nx, ny)
  }
  while (i < tk.length) {
    if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = n() + ox, ny = n() + oy
        empezar(nx, ny)
        x = nx
        y = ny
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        const nx = n() + ox, ny = n() + oy
        linea(nx, ny)
        x = nx
        y = ny
        break
      }
      case 'H': {
        const nx = n() + ox
        linea(nx, y)
        x = nx
        break
      }
      case 'V': {
        const ny = n() + oy
        linea(x, ny)
        y = ny
        break
      }
      case 'C': {
        const x1 = n() + ox, y1 = n() + oy, x2 = n() + ox, y2 = n() + oy, nx = n() + ox, ny = n() + oy
        for (let k = 1; k <= SEG_CURVA; k++) {
          const t = k / SEG_CURVA, u = 1 - t
          linea(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny)
        }
        cur!.splice(-2, 2, nx, ny)
        x = nx
        y = ny
        break
      }
      case 'Q': {
        const x1 = n() + ox, y1 = n() + oy, nx = n() + ox, ny = n() + oy
        for (let k = 1; k <= SEG_CURVA; k++) {
          const t = k / SEG_CURVA, u = 1 - t
          linea(u * u * x + 2 * u * t * x1 + t * t * nx, u * u * y + 2 * u * t * y1 + t * t * ny)
        }
        cur!.splice(-2, 2, nx, ny)
        x = nx
        y = ny
        break
      }
      case 'A': {
        const bandera = () => {
          if (tk[i] !== '0' && tk[i] !== '1') throw new Error('bandera de arco inválida: usa 0 o 1 separados por espacio')
          return Number(tk[i++])
        }
        const rx = n(), ry = n(), rot = n(), grande = bandera(), barrido = bandera(), nx = n() + ox, ny = n() + oy
        const pts = puntosArco(x, y, rx, ry, rot, grande !== 0, barrido !== 0, nx, ny)
        for (let k = 0; k < pts.length; k += 2) linea(pts[k], pts[k + 1])
        x = nx
        y = ny
        break
      }
      case 'Z': {
        if (cur) subs[subs.length - 1].cerrada = true
        x = sx
        y = sy
        cur = null
        if (i < tk.length && !/^[a-zA-Z]$/.test(tk[i])) throw new Error('trayectoria SVG inválida')
        break
      }
      default:
        throw new Error(`comando de trayectoria no soportado: ${cmd}`)
    }
  }
  return subs
}

/** Arco elíptico en notación de extremos (SVG 1.1, apéndice F.6.5) aplanado a puntos. */
function puntosArco(x1: number, y1: number, rx: number, ry: number, rotGrados: number, grande: boolean, barrido: boolean, x2: number, y2: number): number[] {
  if (rx === 0 || ry === 0) return [x2, y2]
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (rotGrados * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) {
    rx *= Math.sqrt(lam)
    ry *= Math.sqrt(lam)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let co = Math.sqrt(Math.max(0, num / den))
  if (grande === barrido) co = -co
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!barrido && dt > 0) dt -= 2 * Math.PI
  else if (barrido && dt < 0) dt += 2 * Math.PI
  const pasos = Math.max(2, Math.ceil((Math.abs(dt) / (2 * Math.PI)) * SEG_CIRCULO))
  const pts: number[] = []
  for (let k = 1; k <= pasos; k++) {
    const t = t1 + (dt * k) / pasos, ex = rx * Math.cos(t), ey = ry * Math.sin(t)
    pts.push(c * ex - s * ey + cx, s * ex + c * ey + cy)
  }
  pts[pts.length - 2] = x2
  pts[pts.length - 1] = y2
  return pts
}

function cajaDe(trazos: number[][], rellenos: number[]): Caja {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ver = (p: number[]) => {
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i])
      maxX = Math.max(maxX, p[i])
      minY = Math.min(minY, p[i + 1])
      maxY = Math.max(maxY, p[i + 1])
    }
  }
  trazos.forEach(ver)
  ver(rellenos)
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}
