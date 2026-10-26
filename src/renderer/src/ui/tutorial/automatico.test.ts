import { describe, expect, it } from 'vitest'
import { avanzaSolo, reservaBarra, type CondicionAvance } from './automatico'

const base: CondicionAvance = { cumplido: true, ultimo: false, avanzarSolo: true, movimientoReducido: false, retenido: false }

describe('avanzaSolo', () => {
  it('avanza un paso cumplido que no es el último', () => expect(avanzaSolo(base)).toBe(true))
  it.each([
    { cumplido: false },
    { ultimo: true },
    { avanzarSolo: false },
    { movimientoReducido: true },
    { retenido: true }
  ])('no avanza con %o', (cambio) => expect(avanzaSolo({ ...base, ...cambio })).toBe(false))
})

describe('reservaBarra', () => {
  // Falla: la barra aparecía y desaparecía con el ratón encima, el globo cambiaba 14 px de alto, el ratón en su borde
  // inferior salía y entraba y el globo parpadeaba. El espacio de la barra no puede depender de `retenido`.
  it('reserva el espacio de un paso que avanzará solo', () => expect(reservaBarra(base)).toBe(true))
  it('no cambia al retener el globo con el ratón o el foco', () => expect(reservaBarra({ ...base, retenido: true })).toBe(reservaBarra(base)))
  it.each([{ cumplido: false }, { ultimo: true }, { avanzarSolo: false }, { movimientoReducido: true }])('no reserva con %o', (cambio) =>
    expect(reservaBarra({ ...base, ...cambio })).toBe(false))
})
