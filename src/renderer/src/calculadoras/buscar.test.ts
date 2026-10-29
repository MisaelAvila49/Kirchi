import { describe, expect, it } from 'vitest'
import { buscarCalculadoras } from './buscar'
import { elegirCalculadora, calculadoraActiva, estadoDeCalculadora, ponerCampo } from './estado'

describe('Ctrl+K encuentra las calculadoras', () => {
  it('«calculadora» da el panel y las calculadoras, y cada una responde a sus palabras', () => {
    const todas = buscarCalculadoras('calculadora', 10)
    expect(todas.map((h) => h.id)).toEqual([null, 'divisor', 'led', 'filtro', 'astable', 'monoestable', 'amplificador'])
    expect(buscarCalculadoras('calculadora divisor')[0]).toEqual({ id: 'divisor', texto: 'Calculadora de divisor de voltaje' })
    expect(buscarCalculadoras('filtro')[0].id).toBe('filtro')
    expect(buscarCalculadoras('astable')[0].id).toBe('astable')
    expect(buscarCalculadoras('inversor')[0].id).toBe('amplificador')
    for (const palabra of ['integrador', 'derivador', 'instrumentacion', 'sumador']) expect(buscarCalculadoras(palabra)[0].id, palabra).toBe('amplificador')
    expect(buscarCalculadoras('pasa banda')[0].id).toBe('filtro')
    expect(buscarCalculadoras('rechaza banda')[0].id).toBe('filtro')
    expect(buscarCalculadoras('doble')[0].id).toBe('filtro')
    expect(buscarCalculadoras('notch')[0].id).toBe('filtro')
    expect(buscarCalculadoras('Calculadoras')[0]).toEqual({ id: null, texto: 'Calculadoras' })
  })
  it('sin acentos ni mayúsculas, y con una palabra de menos de 3 letras no sale nada', () => {
    expect(buscarCalculadoras('CALCULADORA 555').map((h) => h.id)).toEqual(['astable', 'monoestable'])
    expect(buscarCalculadoras('r')).toEqual([])
    expect(buscarCalculadoras('calculadora r')).toEqual([])
    expect(buscarCalculadoras('')).toEqual([])
    expect(buscarCalculadoras('zzzz')).toEqual([])
  })
  it('respeta el máximo de resultados', () => {
    expect(buscarCalculadoras('calculadora', 3)).toHaveLength(3)
  })
})

describe('lo escrito en una calculadora se conserva', () => {
  it('elegir otra y volver deja los campos como estaban', () => {
    elegirCalculadora('divisor')
    ponerCampo('divisor', 'vin', '12')
    elegirCalculadora('led')
    expect(calculadoraActiva()).toBe('led')
    elegirCalculadora('divisor')
    expect(estadoDeCalculadora('divisor').vin).toBe('12')
  })
  it('un id desconocido no cambia la calculadora abierta', () => {
    elegirCalculadora('led')
    elegirCalculadora('nada')
    expect(calculadoraActiva()).toBe('led')
  })
})
