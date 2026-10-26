import { describe, expect, it } from 'vitest'
import { TEMAS } from '../../../compartido/ajustes'
import { contraste, paletaDeTema } from './paleta'
import { colorDeVoltaje } from './voltajes'

describe('colorDeVoltaje', () => {
  const p = paletaDeTema('claro')

  it('0 V es gris, +vmax naranja y −vmax azul; lo que se pasa queda en el extremo', () => {
    expect(colorDeVoltaje(0, 5, p)).toEqual(p.voltajeCero)
    expect(colorDeVoltaje(5, 5, p)).toEqual(p.voltajeAlto)
    expect(colorDeVoltaje(-5, 5, p)).toEqual(p.voltajeNegativo)
    expect(colorDeVoltaje(12, 5, p)).toEqual(p.voltajeAlto)
    expect(colorDeVoltaje(-12, 5, p)).toEqual(p.voltajeNegativo)
  })

  it('sin escala o sin lectura, gris', () => {
    expect(colorDeVoltaje(3, 0, p)).toEqual(p.voltajeCero)
    expect(colorDeVoltaje(Number.NaN, 5, p)).toEqual(p.voltajeCero)
  })

  it('a mitad de la escala mezcla el gris con el extremo', () => {
    const m = colorDeVoltaje(2.5, 5, p)
    for (let k = 0; k < 3; k++) expect(m[k]).toBeCloseTo((p.voltajeAlto[k] + p.voltajeCero[k]) / 2, 9)
  })

  it.each(TEMAS)('%s: todo punto de la escala da 3:1 o más sobre el lienzo (es el trazo de un cable)', (t) => {
    const q = paletaDeTema(t)
    for (let i = -100; i <= 100; i++) expect(contraste(colorDeVoltaje(i / 100, 1, q), q.lienzo), `${i} %`).toBeGreaterThanOrEqual(3)
  })
})
