import { describe, expect, it } from 'vitest'
import { FAMILIAS_FIGURA, FORMATOS_FIGURA, TONOS_FIGURA } from '../../../../compartido/ajustes'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { seriesDeCaptura } from '../osciloscopio/figura'
import { NOMBRE_FAMILIA_FIGURA, NOMBRE_FORMATO_FIGURA, NOMBRE_TONO_FIGURA, visiblesDe } from './modelo'

describe('el diálogo de exportar una figura', () => {
  it('qué opciones le tocan a cada formato: resolución solo al PNG y ninguna de aspecto al CSV', () => {
    expect(visiblesDe('png')).toEqual({ escala: true, letra: true, ejes: true, rejilla: true, colores: true })
    expect(visiblesDe('svg')).toEqual({ escala: false, letra: true, ejes: true, rejilla: true, colores: true })
    expect(visiblesDe('pdf').escala).toBe(false)
    expect(Object.values(visiblesDe('csv')).every((v) => v === false)).toBe(true)
  })

  it('cada formato, familia y tono de la lista tiene su nombre', () => {
    for (const f of FORMATOS_FIGURA) expect(NOMBRE_FORMATO_FIGURA[f]).toBeTruthy()
    for (const f of FAMILIAS_FIGURA) expect(NOMBRE_FAMILIA_FIGURA[f]).toBeTruthy()
    for (const t of TONOS_FIGURA) expect(NOMBRE_TONO_FIGURA[t]).toBeTruthy()
  })

  it('las series de la captura son los canales encendidos y A − B', () => {
    const a = (matematico: boolean): AjustesOsciloscopio => ({
      canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal !== 'C', vdiv: 1, pos: 0, acople: 'DC' as const })),
      matematico, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
    })
    expect(seriesDeCaptura(a(false))).toEqual([{ id: 'A', nombre: 'Canal A' }, { id: 'B', nombre: 'Canal B' }, { id: 'D', nombre: 'Canal D' }])
    expect(seriesDeCaptura(a(true)).at(-1)).toEqual({ id: 'M', nombre: 'A − B' })
  })
})
