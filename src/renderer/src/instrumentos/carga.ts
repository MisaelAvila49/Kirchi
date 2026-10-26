import type { Id } from '../doc/tipos'
import type { NetlistMotor, ResultadoNetlist } from '../netlist/netlist'
import { formatearValor } from '../valores/valores'
import { CANALES, CARGAS, type Canal } from './ajustes'

/** Se dice cuánto carga un instrumento cuando su lectura queda 1 % o más abajo de la de uno ideal. */
export const UMBRAL_CARGA = 0.01
/** Hasta cuántos nodos se estima (la eliminación es densa): más allá, no se dice nada. */
export const MAX_NODOS_CARGA = 400
/** Conductancia de una fuente de voltaje (en corto en la estimación) y la mínima a tierra de cada nodo. */
const G_CORTO = 1e6
const G_MIN = 1e-12

/** Resistencia que el circuito presenta entre `p` y `n`, estimada en continua: resistencias, fusibles e inductores como
 * tales, fuentes de voltaje en corto, capacitores y fuentes de corriente abiertos, semiconductores y lógica fuera.
 * `excluir`: elementos del propio instrumento. null si es muy grande. */
export function resistenciaVista(net: NetlistMotor, p: number, n: number, excluir: ReadonlySet<number>): number | null {
  const N = net.nodes
  if (N > MAX_NODOS_CARGA || p === n) return null
  // Matriz de conductancias sin el nodo 0 (tierra).
  const G = Array.from({ length: N - 1 }, () => new Float64Array(N - 1))
  const sumar = (a: number, b: number, g: number) => {
    if (a > 0) G[a - 1][a - 1] += g
    if (b > 0) G[b - 1][b - 1] += g
    if (a > 0 && b > 0) {
      G[a - 1][b - 1] -= g
      G[b - 1][a - 1] -= g
    }
  }
  net.elements.forEach((e, k) => {
    if (excluir.has(k)) return
    switch (e.type) {
      case 'R':
        return sumar(e.a, e.b, 1 / Math.max(e.ohms, 1e-9))
      case 'FUSE':
        return sumar(e.a, e.b, 1 / Math.max(e.ohms, 1e-9))
      case 'L':
      case 'V':
      case 'PSU':
        return sumar(e.a, e.b, G_CORTO)
    }
  })
  for (let i = 0; i < N - 1; i++) G[i][i] += G_MIN
  // G·x = e_p − e_n, por eliminación de Gauss con pivote parcial.
  const x = new Float64Array(N - 1)
  if (p > 0) x[p - 1] += 1
  if (n > 0) x[n - 1] -= 1
  const m = N - 1
  for (let c = 0; c < m; c++) {
    let piv = c
    for (let f = c + 1; f < m; f++) if (Math.abs(G[f][c]) > Math.abs(G[piv][c])) piv = f
    if (Math.abs(G[piv][c]) < 1e-300) return null
    if (piv !== c) {
      ;[G[c], G[piv]] = [G[piv], G[c]]
      ;[x[c], x[piv]] = [x[piv], x[c]]
    }
    for (let f = c + 1; f < m; f++) {
      const k = G[f][c] / G[c][c]
      if (k === 0) continue
      for (let j = c; j < m; j++) G[f][j] -= k * G[c][j]
      x[f] -= k * x[c]
    }
  }
  for (let c = m - 1; c >= 0; c--) {
    let s = x[c]
    for (let j = c + 1; j < m; j++) s -= G[c][j] * x[j]
    x[c] = s / G[c][c]
  }
  const vp = p > 0 ? x[p - 1] : 0
  const vn = n > 0 ? x[n - 1] : 0
  return vp - vn
}

/** «Carga el circuito: …» o «El canal A carga el circuito: …». */
const texto = (sujeto: string, fraccion: number, que: string, ohms: number) =>
  `${sujeto === 'Carga' ? 'Carga' : `${sujeto} carga`} el circuito: lee ${(fraccion * 100).toFixed(1)} % menos que un instrumento ideal, por su ${que} de ${formatearValor(ohms, 'Ω')} (estimado en continua).`

/** La línea de carga de un multímetro de la netlist, o null (ideal, en Ω, por debajo de 1 % o sin estimación). */
export function cargaDeMultimetro(r: ResultadoNetlist, id: Id): string | null {
  const mm = r.instrumentos.multimetros.get(id)
  const el = r.netlist?.elements
  if (!mm || !el || mm.ajustes.ideal) return null
  const modo = mm.ajustes.modo
  if (modo === 'Ω' || modo === 'Continuidad') return null
  const F = el[mm.elemento]
  if (F?.type !== 'FUSE') return null
  const rth = resistenciaVista(r.netlist!, F.a, F.b, new Set([mm.elemento]))
  if (rth === null || !Number.isFinite(rth)) return null
  const voltimetro = modo === 'V DC' || modo === 'V AC'
  // La caída del amperímetro incluye su fusible: los 0.1 Ω son de toda la cadena.
  const rm = voltimetro ? CARGAS.voltimetro : CARGAS.amperimetro
  const fraccion = voltimetro ? rth / (rth + rm) : rm / (rth + rm)
  return fraccion >= UMBRAL_CARGA ? texto('Carga', fraccion, voltimetro ? 'entrada' : 'resistencia', rm) : null
}

/** La línea de carga de un canal del osciloscopio, o null. */
export function cargaDeCanal(r: ResultadoNetlist, id: Id, canal: Canal): string | null {
  const o = r.instrumentos.osciloscopios.get(id)
  const el = r.netlist?.elements
  const c = o?.canales[CANALES.indexOf(canal)]
  if (!o || !el || !c || o.ajustes.ideal || c.resistencia < 0) return null
  const R = el[c.resistencia]
  if (R?.type !== 'R') return null
  const rth = resistenciaVista(r.netlist!, R.a, R.b, new Set([c.resistencia]))
  if (rth === null || !Number.isFinite(rth)) return null
  const fraccion = rth / (rth + CARGAS.osciloscopio)
  return fraccion >= UMBRAL_CARGA ? texto(`El canal ${canal}`, fraccion, 'entrada', CARGAS.osciloscopio) : null
}
