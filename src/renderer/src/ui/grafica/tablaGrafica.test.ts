import { describe, expect, it } from 'vitest'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'
import { indicesRepartidos, resumenDeModelo, tablaDeModelo, valorTexto } from './tablaGrafica'

const n = 4001
const x = Float64Array.from({ length: n }, (_, i) => i * 1e-6)
const modelo: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 4e-3 } },
  paneles: [{ titulo: '' }],
  trazas: [{ clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x, y: Float64Array.from(x, (t) => Math.sin(t * 1e3)), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
}

describe('la gráfica como tabla', () => {
  it('reparte los índices parejo y con los dos extremos', () => {
    expect(indicesRepartidos(5, 10)).toEqual([0, 1, 2, 3, 4])
    const i = indicesRepartidos(4001, 100)
    expect(i).toHaveLength(100)
    expect(i[0]).toBe(0)
    expect(i[99]).toBe(4000)
  })
  it('una traza larga sale reducida y la nota lo dice', () => {
    const [b] = tablaDeModelo(modelo, VISTA_COMPLETA)
    expect(b.filas).toHaveLength(100)
    expect(b.columnas).toEqual(['Tiempo (s)', 'V(a) (V)'])
    expect(b.filas[0][0]).toBe('0')
    expect(b.nota).toMatch(/100 de 4001/)
  })
  it('con la vista acercada trae solo ese tramo', () => {
    const [b] = tablaDeModelo(modelo, { ...VISTA_COMPLETA, x: { min: 1e-3, max: 1.01e-3 } })
    expect(b.filas).toHaveLength(11)
    expect(b.nota).toBeNull()
  })
  it('las trazas apagadas no entran', () => {
    expect(tablaDeModelo(modelo, { ...VISTA_COMPLETA, ocultas: new Set(['V(a)']) })).toEqual([])
  })
  it('las barras llevan armónico, frecuencia y la unidad de cada serie', () => {
    const barras: ModeloGrafica = {
      tipo: 'barras',
      ejeX: { nombre: 'Armónico', unidad: '', escala: 'lin', datos: { min: 0, max: 2 } },
      paneles: [{ titulo: '' }],
      trazas: [],
      barras: { categorias: ['1', '2'], unidad: 'V', frecuencias: Float64Array.from([1000, 2000]), nota: '', series: [{ clave: 'a', etiqueta: 'V(a)', tono: 'canal-a', unidad: 'V', valores: Float64Array.from([1, 0.5]) }] }
    }
    const [b] = tablaDeModelo(barras, VISTA_COMPLETA)
    expect(b.columnas).toEqual(['Armónico', 'Frecuencia', 'V(a) (V)'])
    expect(b.filas[1]).toEqual(['2', '2 kHz', '500 mV'])
  })
  it('los dB y los grados no llevan prefijo SI', () => {
    expect(valorTexto(-0.0004343, 'dB')).toBe('−0.0004343 dB')
    expect(valorTexto(-45, '°')).toBe('−45°')
    expect(valorTexto(0.0005, 'V')).toBe('500 µV')
  })
  it('el resumen nombra el tramo y el intervalo de cada traza', () => {
    const r = resumenDeModelo(modelo, VISTA_COMPLETA)
    expect(r).toContain('Tiempo de 0 a 4 ms')
    expect(r).toMatch(/V\(a\) va de .* a /)
  })
})
