import { describe, expect, it } from 'vitest'
import { asasDe, crearLectura, crearLlamada, crearTexto, fantasmaDe, moverAsa, notaEn, svgDeNotas, type ContextoNotas, type Notas } from './notasEsquema'

const ctx: ContextoNotas = { texto: () => '2.500 V', nota: () => 'punto de operación' }
const lectura = (l: Notas) => crearLectura(l, { x: 50, y: 50, magnitud: 'voltaje', cable: 'c1', pin: null })!

describe('elegir llamadas y etiquetas de lectura', () => {
  it('una llamada se elige por su círculo y una etiqueta por su globo o su punto', () => {
    const l = crearLlamada([], 20, 20)!
    expect(notaEn(l.notas, 20.5, 20.5, 1)).toBe(l.id)
    expect(notaEn(l.notas, 60, 60, 1)).toBeNull()
    const e = lectura(l.notas)
    const g = e.notas[1] as { x: number; y: number; dx: number; dy: number }
    expect(notaEn(e.notas, g.x + g.dx + 1, g.y + g.dy + 1, 1, ctx)).toBe(e.id)
    expect(notaEn(e.notas, 50, 50, 1, ctx)).toBe(e.id)
  })
  it('la etiqueta tiene un asa en su punto medido y moverla lo lleva', () => {
    const e = lectura([])
    expect(asasDe(e.notas[0]).map((a) => a.id)).toEqual(['punto'])
    const m = moverAsa(e.notas, e.id, 'punto', 55, 44)
    expect(m[0]).toMatchObject({ x: 55, y: 44 })
  })
})

describe('el fantasma de cada herramienta', () => {
  const pos = { x: 30, y: 40 }
  it('sin puntero o en seleccionar no hay fantasma', () => {
    expect(fantasmaDe({ herramienta: 'texto', lista: [], pos: null })).toBeNull()
    expect(fantasmaDe({ herramienta: 'seleccionar', lista: [], pos })).toBeNull()
  })
  it('texto: el marcador «Texto» en el puntero', () => {
    expect(fantasmaDe({ herramienta: 'texto', lista: [], pos })).toMatchObject({ tipo: 'texto', texto: 'Texto', x: 30, y: 40, id: 'fantasma' })
  })
  it('flecha: sin pulsar no hay fantasma; al arrastrar va del punto de pulsación al puntero', () => {
    expect(fantasmaDe({ herramienta: 'flecha', lista: [], pos })).toBeNull()
    const b = fantasmaDe({ herramienta: 'flecha', lista: [], pos, inicio: { x: 10, y: 10 } })!
    expect(b).toMatchObject({ x1: 10, y1: 10, x2: 30, y2: 40 })
  })
  it('resalte: sin pulsar no hay fantasma; al arrastrar va del inicio al puntero', () => {
    expect(fantasmaDe({ herramienta: 'resalte', lista: [], pos })).toBeNull()
    const b = fantasmaDe({ herramienta: 'resalte', lista: [], pos, inicio: { x: 40, y: 10 } })!
    expect(b).toMatchObject({ x: 30, y: 10, ancho: 10, alto: 30 })
  })
  it('llamada: lleva el número que sigue', () => {
    const l = crearLlamada([], 5, 5)!.notas
    const f = fantasmaDe({ herramienta: 'llamada', lista: l, pos })!
    const svg = svgDeNotas([...l, f], { tema: 'claro', solo: 'fantasma' })
    expect(svg).toMatch(/>2<\/text>/)
    expect(svg).not.toMatch(/>1<\/text>/)
  })
  it('lectura: solo existe sobre un cable o un pin', () => {
    const f = fantasmaDe({ herramienta: 'lectura', lista: [], pos, magnitud: 'corriente', objetivo: { x: 31, y: 40, cable: 'c1', pin: null } })!
    expect(f).toMatchObject({ tipo: 'lectura', magnitud: 'corriente', cable: 'c1', x: 31 })
    expect(fantasmaDe({ herramienta: 'lectura', lista: [], pos, magnitud: 'voltaje', objetivo: null })).toBeNull()
  })
  it('dibujar solo el fantasma no pinta las notas ya puestas, y el globo trae la nota', () => {
    const t = crearTexto([], 1, 1, 'Hola')!
    const e = lectura(t.notas)
    const svg = svgDeNotas(e.notas, { tema: 'claro', ctx })
    expect(svg).toContain('punto de operación')
    expect(svgDeNotas(e.notas, { tema: 'claro', ctx, solo: e.id })).not.toContain('Hola')
  })
})
