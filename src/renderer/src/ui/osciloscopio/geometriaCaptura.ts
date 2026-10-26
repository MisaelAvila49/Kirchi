import { DIVISIONES_H, DIVISIONES_V, type AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { TONO_CANAL } from '../colores'
import type { TonoFigura } from '../../../../compartido/ajustes'
import { trazaLimpia, type GeometriaFigura, type ObjetoGeom, type TrazaGeom } from '../exportar/editor/geometria'
import { trazas as trazasDe } from './dibujar'
import type { Marco } from './marco'
import { type AspectoGrafica, type AspectoTraza } from '../../../../compartido/grafica/aspecto'
import { decimalesPorOmision, formatoConDecimales, prefijoParaRango } from '../../../../compartido/grafica/ejes'

/** La bandera de una columna sin dato en la pantalla del osciloscopio (el mismo valor que usa el barrido). */
const BANDERA_VACIA = 8

export interface EntradaGeometriaCaptura {
  /** Los ajustes y la pantalla ya recortados al tramo que se exporta. */
  a: AjustesOsciloscopio
  p: PantallaSab
  /** El instante que el eje del tiempo llama 0 (el disparo o el principio de lo capturado). */
  referencia: number
  marco: Marco
  /** Dónde cae el origen de la pantalla dentro de la figura. */
  ox: number
  oy: number
  /** Tono de cada canal en la figura (el elegido o el de siempre). */
  tonos: Readonly<Record<string, TonoFigura>>
  ancho: number
  alto: number
  /** El aspecto elegido (prefijo y decimales de cada eje) para escribir con él los valores de una etiqueta. */
  aspecto?: Pick<AspectoGrafica, 'prefijoX' | 'decimalesX' | 'decimalesEtiquetas'>
  canales?: Readonly<Record<string, Pick<AspectoTraza, 'prefijo' | 'decimales'>>>
  /** Los dos renglones de arriba (título y subtítulo), si la figura los lleva. */
  titulos?: { titulo?: { x: number; y: number; w: number; h: number }; subtitulo?: { x: number; y: number; w: number; h: number } }
}

/**
 * Dónde cae cada cosa de la captura en la figura: retícula, un punto por columna de cada canal y bandas de ejes y títulos. Mismo reparto que `dibujarPantalla`.
 */
export function geometriaDeCaptura(e: EntradaGeometriaCaptura): GeometriaFigura {
  const { a, p, marco: m } = e
  const W = m.w
  const H = m.h
  const area = { x: e.ox + m.x, y: e.oy + m.y, w: W, h: H }
  const trazas: TrazaGeom[] = []
  if (p.ncol > 0 && Number.isFinite(p.t0)) {
    const span = DIVISIONES_H * a.base
    const sx = p.dt > 0 && Number.isFinite(p.dt) ? (p.dt / span) * W : W / p.ncol
    const div = H / DIVISIONES_V
    const mayorT = Math.max(a.base, Math.abs(p.t0 - e.referencia), Math.abs(p.t0 - e.referencia + span))
    const formatoTiempo = { prefijo: e.aspecto?.prefijoX ?? prefijoParaRango(mayorT, 's'), ...(e.aspecto?.decimalesX !== undefined ? { decimales: e.aspecto.decimalesX } : {}), omision: decimalesPorOmision('s') }
    for (const t of trazasDe(a)) {
      const n = p.ncol
      const px = new Float64Array(n).fill(Number.NaN)
      const py = new Float64Array(n).fill(Number.NaN)
      const x = new Float64Array(n).fill(Number.NaN)
      const y = new Float64Array(n).fill(Number.NaN)
      const base = t.i * n * CIFRAS_COLUMNA
      for (let j = 0; j < n; j++) {
        const q = base + j * CIFRAS_COLUMNA
        if (p.columnas[q + 4] & BANDERA_VACIA) continue
        const v = p.columnas[q + 2]
        const vy = Math.max(-H, Math.min(2 * H, H / 2 - (v / t.vdiv + t.pos) * div))
        const xi = j * sx
        // Solo lo que cae dentro de la retícula: lo demás está recortado y no se puede elegir.
        if (xi > W + 0.5) break
        px[j] = area.x + xi
        py[j] = area.y + vy
        x[j] = p.t0 + j * p.dt - e.referencia
        y[j] = v
      }
      trazas.push(trazaLimpia({ id: t.id, etiqueta: t.id === 'M' ? 'A − B' : `Canal ${t.id}`, tono: e.tonos[t.id] ?? TONO_CANAL.A, unidadX: 's', unidadY: 'V', formatoX: formatoConDecimales(formatoTiempo, e.aspecto?.decimalesEtiquetas), formatoY: formatoConDecimales({ prefijo: e.canales?.[t.id]?.prefijo ?? prefijoParaRango((DIVISIONES_V / 2 + Math.abs(t.pos)) * t.vdiv, 'V'), ...(e.canales?.[t.id]?.decimales !== undefined ? { decimales: e.canales[t.id].decimales } : {}), omision: decimalesPorOmision('V') }, e.aspecto?.decimalesEtiquetas) }, px, py, x, y))
    }
  }
  const objetos: ObjetoGeom[] = []
  if (e.titulos?.titulo) objetos.push({ id: 'titulo', tipo: 'fijo', etiqueta: 'Título', rect: e.titulos.titulo })
  if (e.titulos?.subtitulo) objetos.push({ id: 'subtitulo', tipo: 'fijo', etiqueta: 'Subtítulo', rect: e.titulos.subtitulo })
  // El eje del tiempo: su banda (arriba o abajo) o, en medio, la banda de los rótulos y la franja de las cifras bajo su línea.
  const banda = { x: area.x, y: e.oy + m.eje.y0, w: W, h: Math.max(14, m.eje.y1 - m.eje.y0) }
  objetos.push({ id: 'eje:x', tipo: 'eje', etiqueta: 'Eje del tiempo', rect: m.ejePos === 'centro' ? { x: area.x, y: e.oy + m.lineaEje - 6, w: W, h: 24 } : banda })
  for (const c of m.columnas) {
    objetos.push({
      id: `eje:${c.canal}`,
      tipo: 'eje',
      etiqueta: `Eje del canal ${c.canal}`,
      rect: { x: e.ox + c.x0, y: area.y - 20, w: c.x1 - c.x0, h: H + 20 }
    })
  }
  return { ancho: e.ancho, alto: e.alto, area, trazas, objetos }
}
