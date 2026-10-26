import { describe, expect, it } from 'vitest'
import { GROSOR_RANGO, escribirAspecto, leerAspecto, ASPECTO_OSCILOSCOPIO } from '../../../../compartido/grafica/aspecto'
import { mismasClaves } from './claves'

describe('claves estables del panel de aspecto', () => {
  it('las mismas claves en el mismo orden son iguales aunque los objetos sean nuevos', () => {
    const antes = [{ clave: 'A' }, { clave: 'B' }].map((t) => t.clave)
    const despues = [{ clave: 'A' }, { clave: 'B' }].map((t) => t.clave)
    expect(mismasClaves(antes, despues)).toBe(true)
    expect(mismasClaves(['A', 'B'], ['B', 'A'])).toBe(false)
    expect(mismasClaves(['A'], ['A', 'B'])).toBe(false)
  })
  it('el grosor admite décimas (el deslizador avanza de a 0.1) y viaja por el texto del aspecto', () => {
    for (const g of [1, 1.1, 1.7, 2.3, GROSOR_RANGO[1]]) {
      const texto = escribirAspecto({ ...ASPECTO_OSCILOSCOPIO, grosor: g }, {}, ASPECTO_OSCILOSCOPIO)
      expect(leerAspecto(texto, ASPECTO_OSCILOSCOPIO).aspecto.grosor).toBe(g)
    }
  })
})
