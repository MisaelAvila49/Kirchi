import { describe, expect, it } from 'vitest'
import { esMedidor, haySondas, haySondasDeCorriente, leerSonda, nombreDeSonda, sondaDeEntrada, sondasDe, sondasDeInstrumento } from './sondas'
import type { Documento, Sonda } from './tipos'

describe('lectura de una sonda', () => {
  it('acepta las cuatro formas y deja solo los campos de su tipo', () => {
    expect(leerSonda({ id: 'v', tipo: 'voltaje', x: 1, y: 2, instrumento: 'o', entrada: 'A', sentido: 'arriba' })).toEqual({ valor: { id: 'v', tipo: 'voltaje', x: 1, y: 2 } })
    expect(leerSonda({ id: 'i', tipo: 'corriente', x: 1, y: 2, sentido: 'abajo', instrumento: 'o' })).toEqual({ valor: { id: 'i', tipo: 'corriente', x: 1, y: 2, sentido: 'abajo' } })
    expect(leerSonda({ id: 'a', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'p_osc', entrada: 'D', sentido: 'arriba' })).toEqual({
      valor: { id: 'a', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'p_osc', entrada: 'D' }
    })
    expect(leerSonda({ id: 'm', tipo: 'multimetro', x: -3, y: 4, instrumento: 'mm', entrada: 'COM' })).toEqual({ valor: { id: 'm', tipo: 'multimetro', x: -3, y: 4, instrumento: 'mm', entrada: 'COM' } })
  })

  it('rechaza lo que no vale con su razón', () => {
    expect(leerSonda({ id: 'x', tipo: 'logica', x: 0, y: 0 })).toEqual({ error: 'tipo de sonda desconocido' })
    expect(leerSonda({ id: 'x', tipo: 'voltaje', x: 0.5, y: 0 })).toEqual({ error: 'posición no entera' })
    expect(leerSonda({ id: 'x', tipo: 'voltaje', x: 2 ** 21, y: 0 })).toEqual({ error: 'posición fuera de rango' })
    expect(leerSonda({ id: 'x', tipo: 'corriente', x: 0, y: 0, sentido: 'diagonal' })).toEqual({ error: 'sentido inválido' })
    expect(leerSonda({ id: 'x', tipo: 'osciloscopio', x: 0, y: 0, entrada: 'A' })).toEqual({ error: 'sin instrumento' })
    expect(leerSonda({ id: 'x', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'a:b', entrada: 'A' })).toEqual({ error: 'sin instrumento' })
    expect(leerSonda({ id: 'x', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'E' })).toEqual({ error: 'entrada inválida' })
    expect(leerSonda({ id: 'x', tipo: 'multimetro', x: 0, y: 0, instrumento: 'o', entrada: 'A' })).toEqual({ error: 'entrada inválida' })
    expect(leerSonda(null)).toEqual({ error: 'tipo de sonda desconocido' })
    // Llaves que tocan el prototipo de un objeto común no son ids de pieza.
    for (const id of ['__proto__', 'constructor', 'prototype']) expect(leerSonda({ id: 'x', tipo: 'osciloscopio', x: 0, y: 0, instrumento: id, entrada: 'A' })).toEqual({ error: 'sin instrumento' })
  })
})

describe('consultas de sondas', () => {
  const sondas: Record<string, Sonda> = {
    a: { id: 'a', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'A' },
    b: { id: 'b', tipo: 'osciloscopio', x: 2, y: 0, instrumento: 'o', entrada: 'B' },
    m: { id: 'm', tipo: 'multimetro', x: 4, y: 0, instrumento: 'mm', entrada: '+' },
    v: { id: 'v', tipo: 'voltaje', x: 6, y: 0 }
  }
  const doc = { sondas } as Pick<Documento, 'sondas'>
  it('encuentra las de un instrumento y la de una entrada', () => {
    expect(sondasDeInstrumento(doc, 'o').map((s) => s.id)).toEqual(['a', 'b'])
    expect(sondaDeEntrada(doc, 'o', 'B')?.id).toBe('b')
    expect(sondaDeEntrada(doc, 'o', 'C')).toBeUndefined()
  })
  it('sabe si hay sondas y si alguna es de corriente', () => {
    expect(haySondas(doc)).toBe(true)
    expect(haySondas({})).toBe(false)
    expect(haySondas({ sondas: {} })).toBe(false)
    expect(sondasDe({})).toEqual({})
    expect(haySondasDeCorriente(doc)).toBe(false)
    expect(haySondasDeCorriente({ sondas: { i: { id: 'i', tipo: 'corriente', x: 0, y: 0, sentido: 'derecha' } } })).toBe(true)
  })
  it('nombra la sonda en los avisos', () => {
    expect(nombreDeSonda(sondas.a, 'XSC1')).toBe('la sonda A de XSC1')
    expect(nombreDeSonda(sondas.v)).toBe('una sonda de voltaje')
    expect(nombreDeSonda({ tipo: 'corriente' })).toBe('una sonda de corriente')
    expect(nombreDeSonda({ tipo: 'osciloscopio', entrada: 'B' })).toBe('una sonda')
  })
})

describe('el medidor rápido como sonda', () => {
  const m = { id: 'm1', tipo: 'medidor', x: 3, y: 4, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 2, dy: -3 }, ref: 'M1' }
  it('conserva sus campos y descarta los ajenos', () => {
    expect(leerSonda({ ...m, sentido: 'arriba', instrumento: 'o', entrada: 'A', otro: 1 })).toEqual({ valor: m })
    expect(leerSonda({ ...m, magnitud: 'corriente', modo: 'ac' })).toEqual({ valor: { ...m, magnitud: 'corriente', modo: 'ac' } })
    expect(esMedidor(m as any)).toBe(true)
    expect(esMedidor({ id: 'v', tipo: 'voltaje', x: 0, y: 0 })).toBe(false)
  })
  it('rechaza magnitud, modo, pantalla y referencia inválidos', () => {
    expect(leerSonda({ ...m, magnitud: 'resistencia' })).toEqual({ error: 'magnitud inválida' })
    expect(leerSonda({ ...m, modo: 'rms' })).toEqual({ error: 'modo inválido' })
    expect(leerSonda({ ...m, pantalla: { dx: Number.NaN, dy: 0 } })).toEqual({ error: 'pantalla inválida' })
    expect(leerSonda({ ...m, pantalla: undefined })).toEqual({ error: 'pantalla inválida' })
    expect(leerSonda({ ...m, pantalla: { dx: 1, dy: 'a' } })).toEqual({ error: 'pantalla inválida' })
    for (const ref of ['M', 'R1', 'M12345', 'm1', undefined, 'M1 ']) expect(leerSonda({ ...m, ref })).toEqual({ error: 'referencia inválida' })
  })
  it('acepta una pantalla fuera de la rejilla, a centésimas, y la recorta a 8', () => {
    expect(leerSonda({ ...m, pantalla: { dx: 1.234, dy: -2.5 } })).toEqual({ valor: { ...m, pantalla: { dx: 1.23, dy: -2.5 } } })
    expect(leerSonda({ ...m, pantalla: { dx: 8.4, dy: 0 } }, [])).toEqual({ valor: { ...m, pantalla: { dx: 8, dy: 0 } } })
  })

  it('recorta la pantalla a 8 unidades y lo avisa', () => {
    const avisos: string[] = []
    expect(leerSonda({ ...m, pantalla: { dx: 20, dy: -9 } }, avisos)).toEqual({ valor: { ...m, pantalla: { dx: 8, dy: -8 } } })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('M1')
    expect(leerSonda({ ...m, pantalla: { dx: 8, dy: -8 } }, avisos)).toEqual({ valor: { ...m, pantalla: { dx: 8, dy: -8 } } })
    expect(avisos).toHaveLength(1)
  })
  it('nombra el medidor en los avisos', () => {
    expect(nombreDeSonda(m as any)).toBe('el medidor M1')
    expect(nombreDeSonda({ tipo: 'medidor' })).toBe('un medidor')
  })
})
