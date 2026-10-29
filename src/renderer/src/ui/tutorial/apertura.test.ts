import { describe, expect, it } from 'vitest'
import { aperturaDelPaso } from './apertura'
import { CAPITULOS } from './capitulos'

const paso = (cap: string, id: string) => CAPITULOS.find((c) => c.id === cap)!.pasos.find((p) => p.id === id)!

describe('los pasos del tutorial abren el panel que señalan', () => {
  it('cada tipo de apertura', () => {
    expect(aperturaDelPaso({})).toBeNull()
    expect(aperturaDelPaso({ abre: 'libreria' })).toEqual({ parche: { panel: 'libreria', lateral: true }, franja: null })
    expect(aperturaDelPaso({ abre: 'inspector' })).toEqual({ parche: { inspector: true, panelDerecho: 'inspector' }, franja: null })
    expect(aperturaDelPaso({ abre: 'mediciones' })).toEqual({ parche: { inspector: true, panelDerecho: 'mediciones' }, franja: null })
    expect(aperturaDelPaso({ abre: 'proyecto' })).toEqual({ parche: { inspector: true, panelDerecho: 'proyecto' }, franja: null })
    expect(aperturaDelPaso({ abre: 'analisis' })).toEqual({ parche: { inspector: true, panelDerecho: 'analisis' }, franja: null })
    expect(aperturaDelPaso({ abre: 'osciloscopio' })).toEqual({ parche: {}, franja: 'osciloscopio' })
  })

  it('calculadoras, plantillas y la pestaña Gráficas también se abren', () => {
    expect(aperturaDelPaso({ abre: 'calculadoras' })).toEqual({ parche: { panel: 'calculadoras', lateral: true }, franja: null })
    expect(aperturaDelPaso({ abre: 'plantillas' })).toEqual({ parche: { panel: 'plantillas', lateral: true }, franja: null })
    expect(aperturaDelPaso({ abre: 'graficas' })).toEqual({ parche: {}, franja: 'graficas' })
  })

  it('capítulo 1: los pasos «Mira» abren el panel o la franja que enmarcan', () => {
    expect(paso('conoce', 'izquierdo').abre).toBe('libreria')
    expect(paso('conoce', 'derecho').abre).toBe('inspector')
    expect(paso('conoce', 'franja').abre).toBe('osciloscopio')
  })

  it('capítulo 2: arrastrar el LED abre la Librería', () => {
    expect(paso('circuito', 'led').abre).toBe('libreria')
  })

  it('capítulo 3: la lectura abre Mediciones, el generador el inspector y el osciloscopio la franja', () => {
    expect(paso('medir-senales', 'lectura').abre).toBe('mediciones')
    expect(paso('medir-senales', 'cuadrada').abre).toBe('inspector')
    for (const id of ['tiempo-div', 'disparo', 'cursores', 'medidas']) expect(paso('medir-senales', id).abre, id).toBe('osciloscopio')
  })

  it('capítulo 4: la calculadora, el análisis y las gráficas se abren solos', () => {
    expect(paso('analizar', 'filtros').abre).toBe('calculadoras')
    expect(paso('analizar', 'bode').abre).toBe('analisis')
    expect(paso('analizar', 'cursores-grafica').abre).toBe('graficas')
  })

  it('ningún paso del tutorial señala el inspector, la librería o la franja sin abrirlos', () => {
    for (const c of CAPITULOS)
      for (const p of c.pasos) {
        const texto = `${p.texto} ${p.resumen}`
        if (/inspector de la derecha|elígela en la librería/.test(texto)) expect(p.abre, `${c.id}/${p.id}`).toBeDefined()
      }
  })
})
