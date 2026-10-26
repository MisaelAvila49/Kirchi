import { describe, expect, it } from 'vitest'
import type { Texto } from './etiquetas'
import { ajustarLienzoTexto, textosVisibles } from './texto'

const t = (texto: string, x: number, y: number, alinear: Texto['alinear'] = 'centro'): Texto => ({ texto, x, y, alinear, tamaño: 1.6, color: 'trazo', fuente: 'cifras' })
// Cámara en el origen a 10 px por unidad sobre 100 × 100 px: se ve el mundo de 0 a 10.
const cam = { x: 0, y: 0, zoom: 10 }

describe('textosVisibles', () => {
  it('deja los textos dentro de la vista', () => {
    expect(textosVisibles([t('R1', 5, 5)], cam, 100, 100)).toHaveLength(1)
  })

  it('quita los que caen fuera', () => {
    expect(textosVisibles([t('R1', 50, 5), t('R2', 5, -20)], cam, 100, 100)).toEqual([])
  })

  it('oculta los textos de menos de 6 px', () => {
    // 1.6 unidades × 3 px por unidad = 4.8 px.
    expect(textosVisibles([t('R1', 5, 5)], { ...cam, zoom: 3 }, 100, 100)).toEqual([])
  })

  it('usa el ancho estimado y la alineación para decidir', () => {
    // «ABC» mide 3 × 1.6 × 0.6 = 2.88 unidades.
    expect(textosVisibles([t('ABC', 0.5, 5, 'der')], cam, 100, 100)).toHaveLength(1)
    expect(textosVisibles([t('AB', -3, 5, 'izq')], cam, 100, 100)).toEqual([])
  })
})

describe('ajustarLienzoTexto', () => {
  it('sin textos deja el respaldo en 1×1 y no pide dibujar', () => {
    const c = { width: 2560, height: 1417 }
    expect(ajustarLienzoTexto(c, false, 2560, 1417)).toBe(false)
    expect(c).toEqual({ width: 1, height: 1 })
  })

  it('con textos lo devuelve al tamaño de la vista y pide dibujar', () => {
    const c = { width: 1, height: 1 }
    expect(ajustarLienzoTexto(c, true, 2560, 1417)).toBe(true)
    expect(c).toEqual({ width: 2560, height: 1417 })
  })

  it('con textos y el tamaño correcto no lo toca (cambiar el tamaño borra el lienzo)', () => {
    const escrituras: string[] = []
    const c = {
      get width() { return 800 },
      set width(_v: number) { escrituras.push('w') },
      get height() { return 600 },
      set height(_v: number) { escrituras.push('h') }
    }
    expect(ajustarLienzoTexto(c, true, 800, 600)).toBe(true)
    expect(escrituras).toEqual([])
  })

  it('ida y vuelta sin textos no vuelve a escribir el tamaño', () => {
    const c = { width: 1, height: 1 }
    expect(ajustarLienzoTexto(c, false, 800, 600)).toBe(false)
    expect(c).toEqual({ width: 1, height: 1 })
  })
})
