// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { cuerpoLocal } from '../editor/colision'
import { libreriaDePrueba } from '../prueba/libreria'
import { CATEGORIAS } from '../ui/catalogo'

/** Reglas que cumple cada pieza de `componentes/`, también las futuras: una pieza nueva no necesita pruebas propias para
 * ellas, solo para lo que la distingue. */
const lib = libreriaDePrueba()
const piezas = [...lib.piezas.values()]
const dentro = (x: number, y: number, c: { minX: number; minY: number; maxX: number; maxY: number }) => x > c.minX && x < c.maxX && y > c.minY && y < c.maxY

describe('reglas de todas las piezas', () => {
  it('la librería carga sin errores', () => {
    expect(lib.errores).toEqual([])
  })

  it.each(piezas.map((d) => [d.id, d] as const))('%s: su categoría es una de la Librería', (_, def) => {
    expect(CATEGORIAS.map(([c]) => c)).toContain(def.categoria)
  })

  it.each(piezas.map((d) => [d.id, d] as const))('%s: ningún pin queda dentro del cuerpo', (_, def) => {
    const c = cuerpoLocal(def)
    for (const p of def.pines) expect(dentro(p.x, p.y, c), `pin ${p.id} en (${p.x}, ${p.y})`).toBe(false)
  })

  it.each(piezas.map((d) => [d.id, d] as const))('%s: la referencia y el valor se anclan fuera del cuerpo', (_, def) => {
    const c = cuerpoLocal(def)
    expect(dentro(def.etiquetas.ref.x, def.etiquetas.ref.y, c), 'referencia').toBe(false)
    expect(dentro(def.etiquetas.valor.x, def.etiquetas.valor.y, c), 'valor').toBe(false)
  })

  it.each(piezas.map((d) => [d.id, d] as const))('%s: el buscador la encuentra por su nombre y por cada término de «buscar»', (_, def) => {
    expect(buscar(def.nombre.es, lib.piezas)[0]?.def.id).toBe(def.id)
    for (const t of def.buscar) expect(buscar(t, lib.piezas).map((r) => r.def.id), t).toContain(def.id)
  })

  it.each(piezas.map((d) => [d.id, d] as const))('%s: sus propiedades numéricas usan unidades del SI', (_, def) => {
    for (const p of def.props) if (!p.opciones) expect(['Ω', 'F', 'H', 'V', 'A', 'W', 'Hz', 's', undefined], p.id).toContain(p.unidad)
  })
})
