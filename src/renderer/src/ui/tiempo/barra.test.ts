// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { restoDeTiempo, textoTiempo } from '../BarraEstado'
import { LO_MAS_RAPIDO } from './velocidades'

describe('la barra de estado de la 2D', () => {
  it('la barra dice el tiempo, la velocidad y cómo va contra ella', () => {
    expect(textoTiempo(0.012351, 0.01, 1)).toBe('t = 12.35 ms · 0.01× · al 100 %')
    expect(textoTiempo(0.012351, 0.01, null)).toBe('t = 12.35 ms · 0.01×')
    expect(restoDeTiempo(10, 0.43, true)).toBe(' · al 43 % de 10×')
    expect(restoDeTiempo(LO_MAS_RAPIDO, 1, false, 14.2)).toBe(' · 14× el tiempo real')
  })
})
