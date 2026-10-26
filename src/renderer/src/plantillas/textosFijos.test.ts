// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { Editor } from '../editor/Editor'
import { copiar } from '../editor/portapapeles'
import { seleccionVacia } from '../editor/seleccion'
import { etiquetasSinChoques } from '../lienzo/apartar'
import { centroDeTexto } from '../lienzo/textosManuales'
import { libreriaDePrueba } from '../prueba/libreria'
import { conTextosFijos, copiarConTextosFijos } from './textosFijos'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Pieza['rot'], props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props })

/** Una resistencia con vecinos que le quitan los lugares de siempre: su referencia y su valor quedan donde el reparto los pueda poner. */
function dibujoApretado(rot: Pieza['rot']): Documento {
  const d = documentoVacio()
  d.piezas.p_r = pieza('p_r', 'resistencia', 'R1', 0, 0, rot, { valor: '4.7k' })
  // Los vecinos van a los lados donde caerían los textos: arriba y abajo si está acostada, a los lados si está parada.
  const [dx, dy] = rot === 0 || rot === 180 ? [0, 5] : [5, 0]
  d.piezas.p_a = pieza('p_a', 'resistencia', 'R2', -dx, -dy, rot, { valor: '1k' })
  d.piezas.p_b = pieza('p_b', 'resistencia', 'R3', dx, dy, rot, { valor: '2k2' })
  return d
}

/** Dónde dibuja la escena la referencia y el valor de la pieza, relativos a su origen. */
function relativos(d: Documento, id: string): { x: number; y: number }[] {
  const ts = etiquetasSinChoques(d, lib).get(id) ?? []
  const p = d.piezas[id]
  return ts.map((t) => {
    const c = centroDeTexto(t)
    return { x: c.x - p.x, y: c.y - p.y }
  })
}

function colocar(d: Documento, f: ReturnType<typeof copiar>, en: { x: number; y: number }): Editor {
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
  ed.tolerancia = 0.5
  ed.cargar(d)
  expect(ed.empezarColocarFragmento(f!, en)).toBe(true)
  ed.abajo(en)
  ed.arriba(en)
  return ed
}

/** Un dibujo de destino con nueve resistencias: la copia se renumera a R10 y el texto es más ancho. */
function destino(): Documento {
  const d = documentoVacio()
  for (let i = 1; i <= 9; i++) d.piezas[`p_x${i}`] = pieza(`p_x${i}`, 'resistencia', `R${i}`, 200 + (i - 1) * 24, 200, 0, { valor: '1k' })
  return d
}

describe('plantilla: los textos quedan donde se veían', () => {
  for (const rot of [0, 90, 180, 270] as const) {
    it(`giro ${rot}°: lo movido a mano viaja, y lo automático se fija donde se veía (la copia sin fijar cambia de lugar)`, () => {
      const origen = dibujoApretado(rot)
      const vistos = relativos(origen, 'p_r')
      expect(vistos).toHaveLength(2)
      const sel = { ...seleccionVacia(), piezas: new Set(['p_r']) }
      // Sin fijar: el reparto automático decide de nuevo con otros vecinos y otro número de referencia.
      const sinFijar = colocar(destino(), copiar(origen, sel, lib), { x: 100, y: 100 })
      const nueva = Object.values(sinFijar.doc.piezas).find((p) => p.props.valor === '4.7k')!
      const cambio = relativos(sinFijar.doc, nueva.id).some((q, i) => Math.hypot(q.x - vistos[i].x, q.y - vistos[i].y) > 0.5)
      expect(cambio, 'sin fijar, el texto se mueve').toBe(true)
      // Fijado: cada texto queda a menos de 0.05 unidades de donde estaba.
      const fijo = colocar(destino(), copiarConTextosFijos(origen, sel, lib), { x: 100, y: 100 })
      const colocada = Object.values(fijo.doc.piezas).find((p) => p.props.valor === '4.7k')!
      relativos(fijo.doc, colocada.id).forEach((q, i) => {
        expect(Math.abs(q.x - vistos[i].x), `x del texto ${i}`).toBeLessThan(0.05)
        expect(Math.abs(q.y - vistos[i].y), `y del texto ${i}`).toBeLessThan(0.05)
      })
      expect(colocada.ref).toBe('R10')
    })
  }

  it('lo que el usuario movió a mano manda: no se reemplaza al fijar', () => {
    const origen = dibujoApretado(0)
    origen.piezas.p_r.textos = { ref: { lugar: 'abajo' } }
    const sel = { ...seleccionVacia(), piezas: new Set(['p_r']) }
    const f = copiarConTextosFijos(origen, sel, lib)!
    expect(f.piezas[0].textos!.ref).toEqual({ lugar: 'abajo' })
    expect(f.piezas[0].textos!.valor).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
  })

  it('la pieza original del dibujo no se toca y una pieza sin textos automáticos (tierra) no gana ninguno', () => {
    const origen = dibujoApretado(0)
    origen.piezas.p_g = pieza('p_g', 'tierra', 'GND1', 40, 0, 0)
    const antes = JSON.stringify(origen)
    const sel = { ...seleccionVacia(), piezas: new Set(['p_r', 'p_g']) }
    const f = copiarConTextosFijos(origen, sel, lib)!
    expect(JSON.stringify(origen)).toBe(antes)
    expect(f.piezas.find((p) => p.tipo === 'tierra')!.textos).toBeUndefined()
  })

  it('un circuito armado por código fija todos sus textos y se ve igual', () => {
    const d = dibujoApretado(90)
    const fijo = conTextosFijos(d, lib)
    for (const id of ['p_r', 'p_a', 'p_b']) {
      expect(Object.keys(fijo.piezas[id].textos!).sort()).toEqual(['ref', 'valor'])
      relativos(fijo, id).forEach((q, i) => {
        expect(Math.abs(q.x - relativos(d, id)[i].x)).toBeLessThan(0.05)
        expect(Math.abs(q.y - relativos(d, id)[i].y)).toBeLessThan(0.05)
      })
    }
    expect(d.piezas.p_r.textos).toBeUndefined()
  })
})
