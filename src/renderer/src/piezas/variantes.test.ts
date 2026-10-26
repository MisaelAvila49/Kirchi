// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { rotulosDePieza } from '../lienzo/etiquetas'
import { geometriaDeVariante } from '../lienzo/escena'
import type { Pieza } from '../doc/tipos'
import { cargarLibreria } from './libreria'

const SVG = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><path d="${d}"/></svg>`
const pieza = {
  id: 'gen',
  nombre: { es: 'Generador', en: 'Generator' },
  categoria: 'instrumentos',
  prefijo: 'XFG',
  buscar: ['generador'],
  pines: [{ id: '1', nombre: '1', x: 0, y: -4 }],
  props: [{ id: 'forma', nombre: 'Forma', defecto: 'Senoidal', opciones: ['Senoidal', 'Cuadrada'] }],
  variantes: { prop: 'forma', simbolos: { Senoidal: 'simbolo-seno.svg', Cuadrada: 'simbolo-cuadrada.svg' } },
  rotulos: [{ prop: 'forma', valores: { Senoidal: '~', Cuadrada: '⊓' }, x: 0, y: 2, tam: 1 }]
}
const archivos = (extra: Record<string, string> = {}) => ({
  'c/gen/pieza.json': JSON.stringify(pieza),
  'c/gen/simbolo.svg': SVG('M0 -4 V-2'),
  'c/gen/simbolo-seno.svg': SVG('M-1 0 L1 0'),
  'c/gen/simbolo-cuadrada.svg': SVG('M-1 1 V-1 H1'),
  ...extra
})
const p = (forma?: string): Pieza => ({ id: 'p', tipo: 'gen', ref: 'XFG1', x: 0, y: 0, rot: 0, espejo: false, props: forma ? { forma } : {} })

describe('variantes de símbolo y rótulos que siguen a una lista', () => {
  it('la librería carga una geometría por opción y el lienzo dibuja la de la opción vigente', () => {
    const lib = cargarLibreria(archivos())
    expect(lib.errores).toEqual([])
    const def = lib.piezas.get('gen')!
    expect(Object.keys(def.variantes!.geometrias)).toEqual(['Senoidal', 'Cuadrada'])
    expect(geometriaDeVariante(def, p())?.trazos).toEqual([[-1, 0, 1, 0]])
    expect(geometriaDeVariante(def, p('Cuadrada'))?.trazos).toEqual([[-1, 1, -1, -1, 1, -1]])
    // Una opción guardada que ya no es de la lista usa la de omisión.
    expect(geometriaDeVariante(def, p('Triangular'))?.trazos).toEqual([[-1, 0, 1, 0]])
  })

  it('falta un archivo de variante: la pieza no carga y el error lo nombra', () => {
    const a = archivos()
    delete (a as Record<string, string>)['c/gen/simbolo-cuadrada.svg']
    expect(cargarLibreria(a).errores).toEqual(['c/gen: falta simbolo-cuadrada.svg (variante «Cuadrada» de forma)'])
  })

  it('el rótulo escribe el texto de la opción', () => {
    const def = cargarLibreria(archivos()).piezas.get('gen')!
    expect(rotulosDePieza(p(), def)[0].texto).toBe('~')
    expect(rotulosDePieza(p('Cuadrada'), def)[0].texto).toBe('⊓')
  })
})
