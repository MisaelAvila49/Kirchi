import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import { seleccionDe, seleccionVacia, type Seleccion } from '../editor/seleccion'
import { cajaTocaArea, posicionBarraFormato, soloTextos, vistaFormato } from './vistaFormato'

const sel = (...pares: [keyof Seleccion, string][]) => {
  const s = seleccionVacia()
  for (const [c, id] of pares) s[c].add(id)
  return s
}
function doc() {
  const d = documentoVacio()
  d.notas.a = { id: 'a', x: 0, y: 0, ancho: 20, texto: 'a', formato: { negrita: true, tam: 3.5, alinear: 'centro' } }
  d.notas.b = { id: 'b', x: 0, y: 10, ancho: 20, texto: 'b', formato: { negrita: true, tam: 3.5, tinta: 'rojo' } }
  d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 40, y: 0, rot: 0 }
  d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
  return d
}

describe('estado de los controles de formato', () => {
  it('una figura en la selección quita la sección Texto: ya no son solo textos', () => {
    const s = seleccionDe('notas', 'n1')
    s.figuras.add('f1')
    expect(soloTextos(s)).toBe(false)
  })

  it('un texto: sus valores; los pasos de tamaño dicen a dónde llevan', () => {
    expect(vistaFormato(doc(), sel(['notas', 'a']))).toEqual({
      notas: 1, etiquetas: 0, fuente: 'sans', tam: 3.5, negrita: true, cursiva: false, subrayado: false, tinta: 'tinta', contorno: 'auto', alinear: 'centro', tamMayor: 5, tamMenor: 2.5
    })
  })

  it('varios distintos: «varios» en lo que difiere y negrita a medio activar', () => {
    const v = vistaFormato(doc(), sel(['notas', 'a'], ['notas', 'b'], ['etiquetas', 'e']))!
    expect(v).toMatchObject({ notas: 2, etiquetas: 1, fuente: 'varios', tam: 'varios', negrita: 'mixto', tinta: 'varios', alinear: 'varios' })
    // Las notas de 3.5 irían a 5 y la etiqueta de 2 a 2.5: no hay un solo destino.
    expect(v.tamMayor).toBeNull()
  })

  it('contorno mixto con varios textos: «varios» si difiere', () => {
    const d = doc()
    d.notas.a = { ...d.notas.a, formato: { ...d.notas.a.formato, contorno: 'rojo' } }
    expect(vistaFormato(d, sel(['notas', 'a']))!.contorno).toBe('rojo')
    expect(vistaFormato(d, sel(['notas', 'a'], ['notas', 'b']))!.contorno).toBe('varios')
    d.notas.b = { ...d.notas.b, formato: { ...d.notas.b.formato, contorno: 'rojo' } }
    expect(vistaFormato(d, sel(['notas', 'a'], ['notas', 'b']))!.contorno).toBe('rojo')
  })

  it('solo etiquetas: sin alineación; sin textos: null', () => {
    expect(vistaFormato(doc(), sel(['etiquetas', 'e']))!.alinear).toBeNull()
    expect(vistaFormato(doc(), sel(['piezas', 'r']))).toBeNull()
    expect(vistaFormato(doc(), seleccionVacia())).toBeNull()
  })

  it('en el tope de la serie el paso no lleva a ningún lado', () => {
    const d = doc()
    d.notas.a = { ...d.notas.a, formato: { tam: 10 } }
    expect(vistaFormato(d, sel(['notas', 'a']))).toMatchObject({ tamMayor: null, tamMenor: 7 })
  })

  it('la barra flotante va arriba del texto si cabe, si no abajo, centrada y dentro del lienzo', () => {
    const area = { minX: 0, minY: 0, maxX: 800, maxY: 600 }
    expect(posicionBarraFormato({ minX: 300, minY: 200, maxX: 400, maxY: 240 }, 200, 34, area)).toEqual({ left: 250, top: 158, abajo: false })
    expect(posicionBarraFormato({ minX: 300, minY: 20, maxX: 400, maxY: 60 }, 200, 34, area)).toEqual({ left: 250, top: 68, abajo: true })
    // Pegada al borde izquierdo o derecho del lienzo, nunca afuera.
    expect(posicionBarraFormato({ minX: -50, minY: 200, maxX: 10, maxY: 240 }, 200, 34, area).left).toBe(4)
    expect(posicionBarraFormato({ minX: 780, minY: 200, maxX: 900, maxY: 240 }, 200, 34, area).left).toBe(596)
  })

  it('la barra siempre queda dentro del lienzo, también con el texto fuera o más alto que él', () => {
    const area = { minX: 0, minY: 40, maxX: 800, maxY: 600 }
    for (const c of [
      { minX: 100, minY: 900, maxX: 200, maxY: 950 },
      { minX: 100, minY: -400, maxX: 200, maxY: -300 },
      { minX: 100, minY: -100, maxX: 200, maxY: 900 },
      { minX: 100, minY: 20, maxX: 200, maxY: 60 }
    ]) {
      const p = posicionBarraFormato(c, 300, 34, area)
      expect(p.top).toBeGreaterThanOrEqual(area.minY + 4)
      expect(p.top + 34).toBeLessThanOrEqual(area.maxY - 4)
      expect(p.left).toBeGreaterThanOrEqual(4)
    }
  })

  it('la barra se esconde si el texto seleccionado no toca el lienzo', () => {
    const area = { minX: 0, minY: 40, maxX: 800, maxY: 600 }
    expect(cajaTocaArea({ minX: 100, minY: 900, maxX: 200, maxY: 950 }, area)).toBe(false)
    expect(cajaTocaArea({ minX: 100, minY: -400, maxX: 200, maxY: -300 }, area)).toBe(false)
    expect(cajaTocaArea({ minX: 900, minY: 100, maxX: 950, maxY: 150 }, area)).toBe(false)
    expect(cajaTocaArea({ minX: 100, minY: 20, maxX: 200, maxY: 60 }, area)).toBe(true)
    expect(cajaTocaArea({ minX: -50, minY: 100, maxX: 10, maxY: 150 }, area)).toBe(true)
  })

  it('la barra flotante sale solo con notas o etiquetas y nada más', () => {
    expect(soloTextos(sel(['notas', 'a'], ['etiquetas', 'e']))).toBe(true)
    expect(soloTextos(sel(['notas', 'a'], ['piezas', 'r']))).toBe(false)
    expect(soloTextos(seleccionVacia())).toBe(false)
  })
})
