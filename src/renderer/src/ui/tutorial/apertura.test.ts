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

  it('capítulo 1: la fuente se puede elegir en la librería', () => {
    expect(paso('primer-circuito', 'fuente').abre).toBe('libreria')
  })

  it('capítulo 2: las lecturas abren Mediciones y elegir la función abre el Inspector', () => {
    for (const id of ['lectura', 'lectura-corriente', 'lectura-ohmios']) expect(paso('medir', id).abre, id).toBe('mediciones')
    for (const id of ['corriente', 'ohmios']) expect(paso('medir', id).abre, id).toBe('inspector')
  })

  it('capítulo 3: el generador abre el inspector y los ajustes del osciloscopio abren su pestaña', () => {
    expect(paso('senales', 'cuadrada').abre).toBe('inspector')
    for (const id of ['tiempo', 'disparo', 'cursores']) expect(paso('senales', id).abre, id).toBe('osciloscopio')
  })

  it('ningún paso del tutorial señala el inspector, la librería o la franja sin abrirlos', () => {
    for (const c of CAPITULOS)
      for (const p of c.pasos) {
        const texto = `${p.texto} ${p.resumen}`
        if (/inspector de la derecha|elígela en la librería/.test(texto)) expect(p.abre, `${c.id}/${p.id}`).toBeDefined()
      }
  })
})
