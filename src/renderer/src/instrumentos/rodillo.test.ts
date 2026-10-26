import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from './ajustes'
import { Barrido, esRodillo, RODILLO_DESDE, type FuenteBarrido } from './barrido'

describe('el rodillo por tiempo de reloj', () => {
  it('pasa a rodillo cuando una pantalla tarda 0.5 s de reloj o más con la velocidad vigente', () => {
    // A 1× son los 50 ms/div.
    expect(esRodillo(RODILLO_DESDE, 1)).toBe(true)
    expect(esRodillo(20e-3, 1)).toBe(false)
    // A 0.001×, 1 ms/div tarda 10 s por pantalla y 20 µs/div, 0.2 s.
    expect(esRodillo(1e-3, 0.001)).toBe(true)
    expect(esRodillo(20e-6, 0.001)).toBe(false)
    expect(esRodillo(50e-6, 0.001)).toBe(true)
    // Sin límite de tiempo real (y los avances) nunca van en rodillo.
    expect(esRodillo(10, Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('al pausar se conserva la velocidad de antes: la pantalla de rodillo que se queda a la vista no empieza de nuevo', () => {
    const a: AjustesOsciloscopio = {
      canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 1, vdiv: 1, pos: 0, acople: 'DC' as const })),
      matematico: false, base: RODILLO_DESDE, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
    }
    const b = new Barrido(a)
    const sin: FuenteBarrido = { hasta: 2, disparo: () => Number.NaN }
    expect(b.siguiente(sin, 1e-4)?.estado).toBe('rodillo')
    // La pausa manda la velocidad 0 (la del tiempo detenido): sigue la misma pantalla de rodillo, sin otra.
    b.ponerVelocidad(0)
    expect(b.siguiente(sin, 1e-4)).toBeNull()
    // Un avance (velocidad infinita) sí deja el rodillo.
    b.ponerVelocidad(Number.POSITIVE_INFINITY)
    expect(b.siguiente(sin, 1e-4)?.estado).not.toBe('rodillo')
  })
})
