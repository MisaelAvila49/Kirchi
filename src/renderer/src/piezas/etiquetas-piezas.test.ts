// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cuerpoEnMundo } from '../editor/colision'
import type { Pieza, Rotacion } from '../doc/tipos'
import { etiquetasDePieza } from '../lienzo/etiquetas'
import { anchoTexto } from '../lienzo/medidas'
import { libreriaDePrueba } from '../prueba/libreria'

/** Referencia y valor no solo se anclan fuera del cuerpo: el texto entero (su caja, medida como el lienzo con
 * `anchoTexto`) tampoco lo toca, en las 8 orientaciones. */
const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, rot: Rotacion, espejo: boolean, props: Record<string, string> = {}): Pieza => ({
  id: 'p', tipo, ref: 'X10', x: 0, y: 0, rot, espejo, props
})

describe('la caja de cada texto no toca el cuerpo de su pieza', () => {
  it.each(['npn', 'temporizador-555', 'amp-op', 'display-7seg', 'rele', 'potenciometro', 'zumbador'])('%s', (id) => {
    const def = lib.get(id)!
    for (const rot of [0, 90, 180, 270] as const)
      for (const espejo of [false, true]) {
        const p = pieza(id, rot, espejo)
        const c = cuerpoEnMundo(p, def)
        const textos = etiquetasDePieza(p, def)
        expect(textos.length, `${id}: debe tener al menos la referencia`).toBeGreaterThanOrEqual(1)
        for (const t of textos) {
          const w = t.ancho ?? anchoTexto(t.texto, t.tamaño)
          const x0 = t.alinear === 'izq' ? t.x : t.alinear === 'der' ? t.x - w : t.x - w / 2
          const caja = { minX: x0, maxX: x0 + w, minY: t.y - t.tamaño / 2, maxY: t.y + t.tamaño / 2 }
          const toca = caja.minX < c.maxX && caja.maxX > c.minX && caja.minY < c.maxY && caja.maxY > c.minY
          expect(toca, `${id} ${rot}° espejo=${espejo} «${t.texto}» caja ${JSON.stringify(caja)} vs cuerpo ${JSON.stringify(c)}`).toBe(false)
        }
      }
  })
})
