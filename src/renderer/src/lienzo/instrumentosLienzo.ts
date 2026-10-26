import type { Documento, Id } from '../doc/tipos'
import { CANALES, type Canal } from '../instrumentos/ajustes'
import { cajaEnMundo, transformar } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { Lectura } from '../sim/lectura'
import { cifra } from '../ui/medicion'
import { valores } from './apartar'
import type { EscritorTrazos } from './buffers'
import type { Texto } from './etiquetas'
import type { Paleta, RGBA } from './paleta'

/** Lo que la capa de simulación necesita de los instrumentos (el control y el tema). */
export interface InstrumentosLienzo {
  /** La cifra de cada multímetro ya con su histéresis, y si su fusible está fundido. */
  multimetros: ReadonlyMap<Id, { texto: string; fundido: boolean }>
  /** Los canales encendidos de cada osciloscopio, A a D. */
  osciloscopios: ReadonlyMap<Id, readonly boolean[]>
  /** El color de cada canal en el tema vigente (`colorDeCanal`). */
  canales: Readonly<Record<Canal, RGBA>>
}

/** Alto de letra de las cifras de los instrumentos en el lienzo (mm). */
export const TAM_CIFRA_INSTRUMENTO = 1.6
/** Ancho del trazo de color sobre la entrada de un canal (unidades de rejilla fina). */
export const ANCHO_PESTAÑA_CANAL = 0.7

/** Lo que los instrumentos agregan al lienzo al simular: cifra del multímetro (en rojo «fusible fundido»), voltaje,
 * corriente y modo de la fuente variable, y un trazo del color del canal en cada entrada encendida del osciloscopio.
 * Devuelve los textos; los trazos van a `t`. */
export function textosDeInstrumentos(t: EscritorTrazos, doc: Documento, lib: Map<string, PiezaDef>, l: Lectura, inst: InstrumentosLienzo, _paleta: Paleta): Texto[] {
  const textos: Texto[] = []
  for (const p of valores(doc.piezas)) {
    const def = lib.get(p.tipo)
    const tipo = def?.modelo?.tipo
    if (!def || !tipo) continue
    if (tipo === 'multimetro') {
      const m = inst.multimetros.get(p.id)
      if (!m) continue
      const c = cajaEnMundo(p, def)
      textos.push({ texto: m.fundido ? 'fusible fundido' : m.texto, x: c.minX - 1, y: (c.minY + c.maxY) / 2, alinear: 'der', tamaño: TAM_CIFRA_INSTRUMENTO, color: m.fundido ? 'invalido' : 'pieza', fuente: 'cifras' })
    } else if (tipo === 'fuente-variable') {
      const m = l.piezas.get(p.id)
      if (m?.extra?.tipo !== 'fuente-variable') continue
      const c = cajaEnMundo(p, def)
      const modo = m.extra.modo === 'apagada' ? 'apagada' : m.extra.modo
      textos.push({ texto: `${cifra(m.v, 'V')} · ${cifra(m.i, 'A')} · ${modo}`, x: c.maxX + 2, y: (c.minY + c.maxY) / 2 + 5, alinear: 'izq', tamaño: TAM_CIFRA_INSTRUMENTO, color: 'valor', fuente: 'cifras' })
    } else if (tipo === 'osciloscopio') {
      const on = inst.osciloscopios.get(p.id)
      if (!on) continue
      CANALES.forEach((canal, k) => {
        const pin = def.pines.find((q) => q.id === canal)
        if (!on[k] || !pin) return
        const [ax, ay] = transformar(pin.x, pin.y, p.rot, p.espejo)
        const [bx, by] = transformar(pin.x + 2, pin.y, p.rot, p.espejo)
        t.segmento(p.x + ax, p.y + ay, p.x + bx, p.y + by, ANCHO_PESTAÑA_CANAL, inst.canales[canal])
      })
    }
  }
  return textos
}
