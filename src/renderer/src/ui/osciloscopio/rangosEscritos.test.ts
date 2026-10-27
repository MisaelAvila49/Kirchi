import { describe, expect, it } from 'vitest'
import { ASPECTO_OSCILOSCOPIO } from '../../../../compartido/grafica/aspecto'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { conRangosEscritos } from './figura'
import { rotulosHorizontal, rotulosVoltaje } from './marco'

const a = (o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false, ...o
})
const canal = (x: AjustesOsciloscopio, c: string) => x.canales.find((k) => k.canal === c)!

describe('Desde y Hasta de los canales al exportar', () => {
  it('un rango simétrico deja el 0 V al centro y los voltios por división que lo reparten', () => {
    const r = conRangosEscritos(a(), { aspecto: ASPECTO_OSCILOSCOPIO, canales: { A: { lado: 'izquierda', color: null, rango: { min: -5, max: 5 } } } })
    expect(canal(r, 'A').vdiv).toBeCloseTo(1.25, 12)
    expect(canal(r, 'A').pos).toBeCloseTo(0, 12)
    expect(canal(r, 'B')).toEqual(canal(a(), 'B'))
  })

  it('la columna del canal empieza en el Hasta y termina en el Desde', () => {
    const r = conRangosEscritos(a(), { aspecto: ASPECTO_OSCILOSCOPIO, canales: { B: { lado: 'izquierda', color: null, rango: { min: 0, max: 8 } } } })
    const v = rotulosVoltaje(canal(r, 'B')).valores
    expect(Number(v[0])).toBeCloseTo(8, 6)
    expect(Number(v[v.length - 1])).toBeCloseTo(0, 6)
  })

  it('en X-Y el canal horizontal usa el rango del eje horizontal y el vertical el suyo', () => {
    const r = conRangosEscritos(a({ modoXY: 'ba' }), {
      aspecto: { ...ASPECTO_OSCILOSCOPIO, rangoX: { min: -2, max: 3 } },
      canales: { B: { lado: 'izquierda', color: null, rango: { min: -1, max: 1 } } }
    })
    expect(canal(r, 'A').vdiv).toBeCloseTo(0.5, 12)
    expect(canal(r, 'A').pos).toBeCloseTo(-1, 12)
    const h = rotulosHorizontal(canal(r, 'A'), 'A').valores
    expect(Number(h[0].replace('−', '-'))).toBeCloseTo(-2, 6)
    expect(Number(h[h.length - 1])).toBeCloseTo(3, 6)
    expect(canal(r, 'B').vdiv).toBeCloseTo(0.25, 12)
  })

  it('sin rangos escritos devuelve los mismos ajustes', () => {
    const x = a()
    expect(conRangosEscritos(x, { aspecto: ASPECTO_OSCILOSCOPIO, canales: {} })).toBe(x)
    expect(conRangosEscritos(x)).toBe(x)
  })
})
