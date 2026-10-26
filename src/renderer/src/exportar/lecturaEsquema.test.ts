import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { crearLectura, conNotasEnSvg, editarNota } from '../ui/exportar/marco/notasEsquema'
import { contextoDeLecturaFija, objetivoLectura, textoDeLectura, TEXTO_SIN_LECTURA, TEXTO_SIN_CORRIENTE } from './lecturaEsquema'

const lib = libreriaDePrueba().piezas

describe('qué se lee bajo un clic de la vista previa', () => {
  it('cerca de un extremo de cable es una red (voltaje) pegada al extremo', () => {
    const o = objetivoLectura(divisor(), lib, 5.8, -7.8, 1.5)
    expect(o).toMatchObject({ clase: 'red' })
    expect(o).toMatchObject({ x: 6, y: -8, cable: 'c_a' })
  })

  it('en el interior de un tramo es un cable, con el voltaje en el punto del clic', () => {
    const o = objetivoLectura(divisor(), lib, 3.1, -7.6, 1.5)
    expect(o).toMatchObject({ clase: 'cable', cable: 'c_a', pin: null })
    expect(o!.y).toBeCloseTo(-8, 5)
    expect(o!.x).toBeCloseTo(3.1, 5)
  })

  it('para corriente solo cuenta el interior de un tramo y se redondea a la rejilla fina', () => {
    const d = divisor()
    expect(objetivoLectura(d, lib, 0.2, -7.9, 1.5, 'corriente')).toMatchObject({ x: 1, y: -8 })
    expect(objetivoLectura(d, lib, 3.2, -7.7, 1.5, 'corriente')).toEqual({ clase: 'cable', x: 3, y: -8, cable: 'c_a', pin: null })
  })

  it('lejos de todo no hay nada', () => {
    expect(objetivoLectura(divisor(), lib, 40, 40, 1.5)).toBeNull()
  })
})

describe('el texto de una etiqueta de lectura', () => {
  const d = divisor()
  const con = calcularConexiones(d, lib)
  const red = con.redDeCable.get('c_a')!
  const lectura: Lectura = {
    t: 0,
    ratio: 1,
    redes: new Map([[red, 3.3333]]),
    piezas: new Map(),
    corrientes: { tramos: [{ cable: 'c_a', segmento: 1, x0: 0, y0: -8, x1: 6, y1: -8, largo: 6, red }], media: Float64Array.from([0.00123456]), absoluta: Float64Array.from([0.00123456]), sinFlechas: new Map() }
  }

  it('sin la vista previa dice «sin lectura»', () => {
    expect(textoDeLectura(con, null, { x: 3.75, y: -10, magnitud: 'voltaje', cable: 'c_a', pin: null })).toBe(TEXTO_SIN_LECTURA)
  })
  it('el voltaje sale con cuatro cifras significativas y su unidad', () => {
    expect(textoDeLectura(con, lectura, { x: 3.75, y: -10, magnitud: 'voltaje', cable: 'c_a', pin: null })).toBe('3.333 V')
  })
  it('la corriente de un tramo sale con prefijo SI', () => {
    expect(textoDeLectura(con, lectura, { x: 3 * 1.25, y: -8 * 1.25, magnitud: 'corriente', cable: 'c_a', pin: null })).toBe('1.235 mA')
  })
  it('un cable sin red en la lectura da «sin lectura»', () => {
    expect(textoDeLectura(con, { ...lectura, redes: new Map() }, { x: 3.75, y: -10, magnitud: 'voltaje', cable: 'c_a', pin: null })).toBe(TEXTO_SIN_LECTURA)
  })
})

describe('el archivo exportado con una lectura congelada', () => {
  const d = divisor()
  const con = calcularConexiones(d, lib)
  const red = con.redDeCable.get('c_a')!
  const lectura: Lectura = { t: 0, ratio: 1, redes: new Map([[red, 3.3333]]), piezas: new Map() }
  const notas = crearLectura([], { x: 3.75, y: -10, magnitud: 'voltaje', cable: 'c_a', pin: null })!.notas
  const lamina = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

  it('lleva el valor y la nota, no «sin lectura» ni «Simula para medir»', () => {
    const svg = conNotasEnSvg(lamina, notas, { tema: 'claro', ctx: contextoDeLecturaFija(con, lectura, true) })
    expect(svg).toContain('3.333 V')
    expect(svg).toContain('punto de operación')
    expect(svg).not.toContain(TEXTO_SIN_LECTURA)
    expect(svg).not.toContain(TEXTO_SIN_CORRIENTE)
  })

  it('en pausa, con corrientes en la lectura, el archivo lleva voltaje y corriente con el instante', () => {
    const pausada: Lectura = {
      ...lectura,
      t: 0.002,
      corrientes: { tramos: [{ cable: 'c_a', segmento: 1, x0: 0, y0: -8, x1: 6, y1: -8, largo: 6, red }], media: Float64Array.from([0.00123456]), absoluta: Float64Array.from([0.00123456]), sinFlechas: new Map() }
    }
    const dos = [
      ...notas,
      ...crearLectura(notas, { x: 3.75, y: -10, magnitud: 'corriente', cable: 'c_a', pin: null })!.notas.slice(notas.length)
    ]
    const svg = conNotasEnSvg(lamina, dos, { tema: 'claro', ctx: contextoDeLecturaFija(con, pausada, false) })
    expect(svg).toContain('3.333 V')
    expect(svg).toContain('1.235 mA')
    expect(svg).toContain('t = 2 ms')
    expect(svg).not.toContain(TEXTO_SIN_CORRIENTE)
  })
  it('con «Mostrar texto» apagado sale la cifra sola, sin la nota', () => {
    const sola = editarNota(notas, notas[0].id, { mostrarTexto: false })
    const svg = conNotasEnSvg(lamina, sola, { tema: 'claro', ctx: contextoDeLecturaFija(con, lectura, true) })
    expect(svg).toContain('3.333 V')
    expect(svg).not.toContain('punto de operación')
  })
})
