import { beforeEach, describe, expect, it } from 'vitest'
import { huellaDeModelo, olvidarTodo, recordarEstado, recuperarEstado } from './memoria'
import type { EstadoEditor } from './edicion'
import type { ModeloGrafica } from '../../grafica/modelo'

const est = (n: number) => ({ marca: n }) as unknown as EstadoEditor

describe('memoria del editor de exportar', () => {
  beforeEach(olvidarTodo)
  it('reabrir con la misma fuente devuelve lo ajustado', () => {
    recordarEstado('grafica', 'a', est(1))
    expect(recuperarEstado('grafica', 'a')).toEqual(est(1))
  })
  it('otra fuente de datos, u otro tipo de diálogo, empieza limpio', () => {
    recordarEstado('pantalla', 'cap-1', est(1))
    expect(recuperarEstado('pantalla', 'cap-2')).toBeNull()
    expect(recuperarEstado('grafica', 'cap-1')).toBeNull()
  })
  it('sin identidad no se recuerda nada', () => {
    recordarEstado('grafica', undefined, est(1))
    expect(recuperarEstado('grafica', undefined)).toBeNull()
  })
})

describe('huella de una gráfica', () => {
  const modelo = (y: number[]): ModeloGrafica => ({ tipo: 'lineas', ejeX: { nombre: 'F', unidad: 'Hz', escala: 'log', datos: { min: 1, max: 3 } }, paneles: [{ titulo: '' }], trazas: [{ clave: 'a', etiqueta: 'a', unidad: 'V', x: Float64Array.from([1, 2, 3]), y: Float64Array.from(y), panel: 0, tono: 'canal-a', lado: 'izquierda' }] })
  it('es igual para los mismos datos y cambia con otros', () => {
    expect(huellaDeModelo('t', modelo([1, 2, 3]))).toBe(huellaDeModelo('t', modelo([1, 2, 3])))
    expect(huellaDeModelo('t', modelo([1, 2, 3]))).not.toBe(huellaDeModelo('t', modelo([1, 2, 4])))
    expect(huellaDeModelo('t', modelo([1, 2, 3]))).not.toBe(huellaDeModelo('u', modelo([1, 2, 3])))
  })
})
