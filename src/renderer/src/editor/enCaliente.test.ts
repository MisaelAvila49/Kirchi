// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { editableEnCaliente } from './enCaliente'

const lib = libreriaDePrueba().piezas

describe('editableEnCaliente', () => {
  it('el valor de una resistencia, de un potenciómetro y de cada fuente se cambia sin detener la vista previa', () => {
    expect(editableEnCaliente(lib.get('resistencia'), 'valor')).toBe(true)
    expect(editableEnCaliente(lib.get('potenciometro'), 'valor')).toBe(true)
    expect(editableEnCaliente(lib.get('fuente-dc'), 'voltaje')).toBe(true)
    expect(editableEnCaliente(lib.get('bateria'), 'voltaje')).toBe(true)
    expect(editableEnCaliente(lib.get('fuente-corriente'), 'corriente')).toBe(true)
    for (const p of ['amplitud', 'frecuencia']) expect(editableEnCaliente(lib.get('fuente-ac'), p)).toBe(true)
    for (const p of ['alto', 'frecuencia', 'ciclo', 'periodo', 'ancho', 'subida', 'bajada', 'retardo']) expect(editableEnCaliente(lib.get('fuente-pulso'), p)).toBe(true)
    expect(editableEnCaliente(lib.get('alimentacion'), 'voltaje')).toBe(true)
  })

  it('lo demás no: la posición del cursor (tiene su control), capacitores, nombres, modelos, familias y alimentaciones', () => {
    expect(editableEnCaliente(lib.get('nand'), 'familia')).toBe(false)
    expect(editableEnCaliente(lib.get('nand'), 'alimentacion')).toBe(false)
    expect(editableEnCaliente(lib.get('potenciometro'), 'posicion')).toBe(false)
    expect(editableEnCaliente(lib.get('capacitor'), 'valor')).toBe(false)
    expect(editableEnCaliente(lib.get('alimentacion'), 'nombre')).toBe(false)
    expect(editableEnCaliente(lib.get('npn'), 'modelo')).toBe(false)
    expect(editableEnCaliente(lib.get('temporizador-555'), 'modelo')).toBe(false)
    expect(editableEnCaliente(undefined, 'valor')).toBe(false)
  })
})
