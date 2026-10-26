import { DIRECCION_LUGAR as DIRECCION, LIMITE_TEXTO_LIBRE, LUGARES_TEXTO, posicionManual } from '../doc/textos'
import type { LugarTexto, Pieza, Punto } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { destransformar, transformar } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { TextoDePieza, Texto } from './etiquetas'
import { anchoTexto, TAM_ETIQUETA } from './medidas'

/** Textos de pieza movidos a mano (`Pieza.textos`): uno de ocho lugares alrededor del cuerpo o libres con Alt, en el marco
 * del símbolo, así giran y se reflejan con la pieza y se leen derechos. Mandan sobre el reparto automático y son
 * obstáculo fijo para los demás. */

export { LIMITE_TEXTO_LIBRE, LUGARES_TEXTO, leerPosicion, posicionManual, tieneTextosManuales } from '../doc/textos'

/** Distancia del texto al cuerpo y entre dos renglones apilados en el mismo lugar, en unidades (las del bloque apilado). */
export const SEPARACION_TEXTO = 1
export const ENTRE_RENGLONES = 1.8

/** Texto en mundo con su centro en (cx, cy), centrado (una posición libre). */
function textoCentrado(t: TextoDePieza, cx: number, cy: number): Texto {
  return { texto: t.texto, x: cx, y: cy, alinear: 'centro', tamaño: TAM_ETIQUETA, color: t.color, fuente: 'cifras' }
}

/** Texto en el lugar `lugar` del cuerpo; `fila` de `filas` si varios comparten lugar (la referencia primero): arriba se
 * apilan hacia afuera con la referencia encima, abajo hacia afuera, de lado centrados. */
function textoEnLugar(p: Pieza, def: PiezaDef, t: Pick<TextoDePieza, 'texto' | 'color'>, lugar: LugarTexto, fila = 0, filas = 1): Texto {
  const c = cuerpoEnMundo(p, def)
  const [lx, ly] = DIRECCION[lugar]
  const [wx, wy] = transformar(lx, ly, p.rot, p.espejo).map((v) => Math.sign(v))
  const x = wx > 0 ? c.maxX + SEPARACION_TEXTO : wx < 0 ? c.minX - SEPARACION_TEXTO : (c.minX + c.maxX) / 2
  const medio = TAM_ETIQUETA / 2
  const y =
    wy < 0 ? c.minY - SEPARACION_TEXTO - medio - (filas - 1 - fila) * ENTRE_RENGLONES
      : wy > 0 ? c.maxY + SEPARACION_TEXTO + medio + fila * ENTRE_RENGLONES
        : (c.minY + c.maxY) / 2 + (fila - (filas - 1) / 2) * ENTRE_RENGLONES
  return { texto: t.texto, x, y, alinear: wx > 0 ? 'izq' : wx < 0 ? 'der' : 'centro', tamaño: TAM_ETIQUETA, color: t.color, fuente: 'cifras' }
}

/** Textos de la pieza movidos a mano, por su lugar en `locales` (los de `textosLocales`, en orden); los que comparten
 * lugar se apilan en ese orden. Los demás los coloca el reparto automático. */
export function textosManuales(p: Pieza, def: PiezaDef, locales: readonly TextoDePieza[]): Map<number, Texto> {
  const out = new Map<number, Texto>()
  if (!p.textos) return out
  const posiciones = locales.map((t) => posicionManual(p, t.cual))
  locales.forEach((t, i) => {
    const pos = posiciones[i]
    if (!pos) return
    if ('lugar' in pos) {
      const juntos = posiciones.map((q, k) => (q && 'lugar' in q && q.lugar === pos.lugar ? k : -1)).filter((k) => k >= 0)
      out.set(i, textoEnLugar(p, def, t, pos.lugar, juntos.indexOf(i), juntos.length))
    } else {
      const [x, y] = transformar(pos.x, pos.y, p.rot, p.espejo)
      out.set(i, textoCentrado(t, p.x + x, p.y + y))
    }
  })
  return out
}

/** Centro de la caja de un texto (con el ancho que le da el dibujo). */
export function centroDeTexto(t: Texto): Punto {
  const w = t.ancho ?? anchoTexto(t.texto, t.tamaño)
  const x = t.alinear === 'izq' ? t.x + w / 2 : t.alinear === 'der' ? t.x - w / 2 : t.x
  return { x: x + 0, y: t.y + 0 }
}

/** El lugar cuyo texto queda con el centro más cerca de `centro` (el del texto que se arrastra). */
export function lugarMasCercano(p: Pieza, def: PiezaDef, texto: string, centro: Punto): LugarTexto {
  let mejor: LugarTexto = 'arriba', d = Infinity
  for (const lugar of LUGARES_TEXTO) {
    const c = centroDeTexto(textoEnLugar(p, def, { texto, color: 'valor' }, lugar))
    const e = Math.hypot(c.x - centro.x, c.y - centro.y)
    if (e < d - 1e-9) {
      d = e
      mejor = lugar
    }
  }
  return mejor
}

const dosDecimales = (v: number) => Math.round(v * 100) / 100 + 0
const acotado = (v: number) => Math.max(-LIMITE_TEXTO_LIBRE, Math.min(LIMITE_TEXTO_LIBRE, v))

/** La posición libre (Alt) de un texto con su centro en `centro` del mundo: en el símbolo, con dos decimales y con tope. */
export function posicionLibre(p: Pieza, centro: Punto): { x: number; y: number } {
  const [x, y] = destransformar(centro.x - p.x, centro.y - p.y, p.rot, p.espejo)
  return { x: acotado(dosDecimales(x)), y: acotado(dosDecimales(y)) }
}
