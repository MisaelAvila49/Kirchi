import { describe, expect, it } from 'vitest'
import { documentoVacio, type Figura } from '../doc/tipos'
import { seleccionDe, seleccionVacia } from '../editor/seleccion'
import { soloFiguras, vistaFigura } from './vistaFigura'

const marco: Figura = { id: 'a', tipo: 'rectangulo', x1: 0, y1: 0, x2: 16, y2: 36, orden: 0, tinta: 'azul', grosor: 0.35, relleno: true, opacidad: 50 }
const flecha: Figura = { id: 'b', tipo: 'flecha', x1: 0, y1: 0, x2: 30, y2: 40, orden: 1, tinta: 'azul' }
const doc = () => ({ ...documentoVacio(), figuras: { a: marco, b: flecha } })

describe('vistaFigura', () => {
  it('una: su estilo y su tamaño en mm (ancho y alto de la caja)', () => {
    expect(vistaFigura(doc(), seleccionDe('figuras', 'a'))).toEqual({
      total: 1, tipo: 'rectangulo', tinta: 'azul', grosor: 0.35, trazo: 'continuo', relleno: true, punta: null, opacidad: 50, medidas: { ancho: 20, alto: 45 }, alFondo: false
    })
  })

  it('«Al fondo» solo se puede si alguna otra figura queda detrás', () => {
    expect(vistaFigura(doc(), seleccionDe('figuras', 'a'))?.alFondo).toBe(false)
    expect(vistaFigura(doc(), seleccionDe('figuras', 'b'))?.alFondo).toBe(true)
  })

  it('la flecha da su largo y su punta; no admite relleno', () => {
    expect(vistaFigura(doc(), seleccionDe('figuras', 'b'))).toMatchObject({ tipo: 'flecha', relleno: null, punta: 'llena', medidas: { largo: 62.5 } })
  })

  it('varias: lo común se muestra y lo distinto queda «varios»; sin medidas', () => {
    const s = seleccionDe('figuras', 'a')
    s.figuras.add('b')
    expect(vistaFigura(doc(), s)).toEqual({ total: 2, tipo: 'varios', tinta: 'azul', grosor: 'varios', trazo: 'continuo', relleno: true, punta: 'llena', opacidad: 'varias', medidas: null, alFondo: false })
  })

  it('sin figuras seleccionadas no hay vista; soloFiguras pide que no haya nada más', () => {
    expect(vistaFigura(doc(), seleccionVacia())).toBeNull()
    const s = seleccionDe('figuras', 'a')
    expect(soloFiguras(s)).toBe(true)
    s.notas.add('n')
    expect(soloFiguras(s)).toBe(false)
  })
})
