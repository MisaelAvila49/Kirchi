import type { Documento } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { transformar } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { posicionDeProp, textoPosicion } from '../sim/potenciometro'
import { pideAjuste } from './ajusteEnPieza'
import { AIRE_TEXTO, cajaTexto, valores } from './apartar'
import { Cubetas } from './cubetas'
import type { Texto } from './etiquetas'
import { alineacionPorX, ANCHO_CABLE } from './medidas'

/** Alto de la letra del porcentaje, en unidades (un poco menor que una referencia, como un chip). */
export const TAM_PORCENTAJE = 1.4
const CELDA = 10

/** Lugares que se prueban para el porcentaje, en unidades del símbolo desde el pin del cursor hacia afuera (el cursor está
 * en -y local): primero a los lados del pin y luego más lejos. Un cable sale del pin por el centro, así que el primer
 * paso de lado ya queda libre. */
const LUGARES: readonly (readonly [number, number])[] = [[1.4, -0.4], [-1.4, -0.4], [1.4, -1.8], [-1.4, -1.8], [0, -2.2], [1.4, 1.6], [-1.4, 1.6], [3.4, -0.4], [-3.4, -0.4], [0, -4], [3.4, -2.2], [-3.4, -2.2]]

/** Porcentaje del cursor de cada potenciómetro simulado cuyo «Mostrar» pide el ajuste, en tinta de pieza y negrita, junto al pin del cursor y en el
 * primer lugar de `LUGARES` sin encimarse con cuerpos, cables, textos, chips ni otro porcentaje. Si todos están ocupados,
 * el primero. Piezas por id. */
export function porcentajesDePot(doc: Documento, lib: Map<string, PiezaDef>, simulados: ReadonlySet<string>, textos: readonly Texto[], chips: readonly Texto[]): Texto[] {
  const pots = valores(doc.piezas).filter((p) => simulados.has(p.id) && lib.get(p.tipo)?.modelo?.tipo === 'pot' && pideAjuste(p, lib.get(p.tipo)!)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (pots.length === 0) return []
  const piezas = valores(doc.piezas), cables = valores(doc.cables)
  let n = textos.length + chips.length + piezas.length + pots.length
  for (const c of cables) n += Math.max(0, c.puntos.length - 1)
  const fijos = new Cubetas(n, CELDA, 0)
  const m = ANCHO_CABLE / 2
  for (const t of textos) {
    const b = cajaTexto(t)
    fijos.agregar(b.minX, b.minY, b.maxX, b.maxY)
  }
  for (const t of chips) {
    const b = cajaTexto(t)
    fijos.agregar(b.minX - t.tamaño * 0.35, b.minY, b.maxX + t.tamaño * 0.35, b.maxY)
  }
  for (const p of piezas) {
    const c = cuerpoEnMundo(p, lib.get(p.tipo))
    fijos.agregar(c.minX, c.minY, c.maxX, c.maxY)
  }
  for (const c of cables)
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      fijos.agregar(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m)
    }
  fijos.indexar()
  const puestos = new Cubetas(pots.length, CELDA, 0)
  puestos.indexar()

  const out: Texto[] = []
  for (const p of pots) {
    const def = lib.get(p.tipo)!
    const modelo = def.modelo
    if (modelo?.tipo !== 'pot') continue
    const pin = def.pines.find((q) => q.id === modelo.c)
    if (!pin) continue
    const texto = textoPosicion(posicionDeProp(p.props[modelo.posicion] ?? def.props.find((d) => d.id === modelo.posicion)?.defecto))
    let elegido: Texto | null = null, primero: Texto | null = null
    for (const [dx, dy] of LUGARES) {
      // Los lugares se miden en el símbolo (el cursor de la definición está arriba) y se giran y reflejan con la pieza;
      // el texto queda horizontal y crece hacia el lado en que cayó respecto del pin.
      const [ox, oy] = transformar(dx, dy, p.rot, p.espejo)
      const [px, py] = transformar(pin.x, pin.y, p.rot, p.espejo)
      const t: Texto = { texto, x: p.x + px + ox, y: p.y + py + oy, alinear: alineacionPorX(ox), tamaño: TAM_PORCENTAJE, color: 'trazo', fuente: 'cifras', negrita: true }
      primero ??= t
      const b = cajaTexto(t, AIRE_TEXTO)
      if (!fijos.choca(b) && !puestos.choca(b)) {
        elegido = t
        break
      }
    }
    const t = elegido ?? primero!
    const b = cajaTexto(t, AIRE_TEXTO)
    puestos.agregar(b.minX, b.minY, b.maxX, b.maxY)
    out.push(t)
  }
  return out
}
