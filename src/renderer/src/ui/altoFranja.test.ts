import { describe, expect, it } from 'vitest'
import { acotarAltoFranja, ALTO_FRANJA_MIN, ALTO_FRANJA_OSCILOSCOPIO, altoAlAbrir, altoConTecla, altoFranjaMax } from './altoFranja'

describe('alto de la franja de instrumentos', () => {
  it('entre 150 px y el 60 % del alto de la ventana', () => {
    expect(ALTO_FRANJA_MIN).toBe(150)
    expect(altoFranjaMax(800)).toBe(480)
    expect(altoFranjaMax(200)).toBe(150)
    expect(acotarAltoFranja(100, 800)).toBe(150)
    expect(acotarAltoFranja(321.4, 800)).toBe(321)
    expect(acotarAltoFranja(900, 800)).toBe(480)
  })

  it('con el teclado: 10 px, 50 px con Shift, Inicio y Fin a los extremos; las demás teclas no son suyas', () => {
    expect(altoConTecla(200, { key: 'ArrowUp', shiftKey: false }, 800)).toBe(210)
    expect(altoConTecla(200, { key: 'ArrowDown', shiftKey: true }, 800)).toBe(150)
    expect(altoConTecla(470, { key: 'ArrowUp', shiftKey: true }, 800)).toBe(480)
    expect(altoConTecla(300, { key: 'Home', shiftKey: false }, 800)).toBe(150)
    expect(altoConTecla(300, { key: 'End', shiftKey: false }, 800)).toBe(480)
    expect(altoConTecla(300, { key: 'ArrowLeft', shiftKey: false }, 800)).toBeNull()
  })

  it('se abre con el alto guardado; sin alto guardado, 150 px o 320 px con el osciloscopio', () => {
    expect(altoAlAbrir(260, true)).toBe(260)
    expect(altoAlAbrir(null, false)).toBe(150)
    expect(altoAlAbrir(null, true)).toBe(ALTO_FRANJA_OSCILOSCOPIO)
    expect(ALTO_FRANJA_OSCILOSCOPIO).toBe(320)
  })
})
