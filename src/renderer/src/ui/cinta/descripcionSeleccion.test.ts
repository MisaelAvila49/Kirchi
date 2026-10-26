import { describe, expect, it } from 'vitest'
import { describirSeleccion, type EntradaSeleccion } from './descripcionSeleccion'
import { grupoDeSeleccion, idsDeColumna, TIPOS_SELECCION } from './modelo'
import { COMANDOS } from './comandos'

const vacia = (): EntradaSeleccion => ({ piezas: [], cables: 0, etiquetas: [], notas: 0, figuras: 0, sondas: 0 })

describe('qué hay seleccionado (K2)', () => {
  it('nada: tipo nada y sin título', () => {
    expect(describirSeleccion(vacia())).toEqual({ tipo: 'nada', titulo: '' })
  })

  it('una pieza lleva su nombre y su referencia; el osciloscopio y el multímetro, el suyo', () => {
    expect(describirSeleccion({ ...vacia(), piezas: [{ ref: 'R1', nombre: 'Resistencia', modelo: 'resistor' }] })).toEqual({ tipo: 'pieza', titulo: 'Resistencia R1' })
    expect(describirSeleccion({ ...vacia(), piezas: [{ ref: 'XSC1', nombre: 'Osciloscopio de cuatro canales', modelo: 'osciloscopio' }] })).toEqual({ tipo: 'osciloscopio', titulo: 'Osciloscopio XSC1' })
    expect(describirSeleccion({ ...vacia(), piezas: [{ ref: 'M1', nombre: 'Multímetro', modelo: 'multimetro' }] })).toEqual({ tipo: 'multimetro', titulo: 'Multímetro M1' })
  })

  it('un cable, una etiqueta, una nota, una figura y una sonda', () => {
    expect(describirSeleccion({ ...vacia(), cables: 1 })).toEqual({ tipo: 'cable', titulo: 'Cable' })
    expect(describirSeleccion({ ...vacia(), etiquetas: [{ nombre: 'Salida' }] })).toEqual({ tipo: 'etiqueta', titulo: 'Etiqueta Salida' })
    expect(describirSeleccion({ ...vacia(), notas: 1 })).toEqual({ tipo: 'nota', titulo: 'Nota' })
    expect(describirSeleccion({ ...vacia(), figuras: 1 })).toEqual({ tipo: 'figura', titulo: 'Figura' })
    expect(describirSeleccion({ ...vacia(), sondas: 1 })).toEqual({ tipo: 'sonda', titulo: 'Sonda' })
  })

  it('dos o más elementos, de lo que sea: varios, con la cuenta', () => {
    expect(describirSeleccion({ ...vacia(), cables: 2 })).toEqual({ tipo: 'varios', titulo: '2 elementos' })
    expect(describirSeleccion({ ...vacia(), piezas: [{ ref: 'R1', nombre: 'Resistencia', modelo: 'resistor' }, { ref: 'C1', nombre: 'Capacitor', modelo: 'capacitor' }], cables: 3 })).toEqual({ tipo: 'varios', titulo: '5 elementos' })
  })
})

describe('el último grupo de Inicio según la selección', () => {
  it('su id no cambia y su título es el de la selección (sin ella, «Selección»)', () => {
    for (const t of TIPOS_SELECCION) expect(grupoDeSeleccion(t, '').id).toBe('seleccion')
    expect(grupoDeSeleccion('pieza', 'Resistencia R1').nombre).toBe('Resistencia R1')
    expect(grupoDeSeleccion('nada', '').nombre).toBe('Selección')
  })

  it('sin selección solo dice qué hacer; con una pieza trae girar, reflejar, inspector y plantilla', () => {
    expect(grupoDeSeleccion('nada', '').columnas).toEqual([{ tipo: 'texto', texto: 'Elige algo en el lienzo.' }])
    const ids = grupoDeSeleccion('pieza', 'R1').columnas.flatMap(idsDeColumna)
    expect(ids).toEqual(['girar-izq', 'girar', 'espejo-x', 'espejo-y', 'panel-inspector', 'guardar-plantilla'])
  })

  it('el osciloscopio trae Osciloscopio, Mediciones y Registro; el multímetro, Mediciones e Inspector', () => {
    expect(grupoDeSeleccion('osciloscopio', 'Osciloscopio XSC1').columnas.flatMap(idsDeColumna)).toEqual(['franja-osciloscopio', 'panel-mediciones', 'franja-registro'])
    expect(grupoDeSeleccion('multimetro', 'Multímetro M1').columnas.flatMap(idsDeColumna)).toEqual(['panel-mediciones', 'panel-inspector'])
  })

  it('varios elementos: girar y reflejar el grupo y guardarlo como plantilla', () => {
    expect(grupoDeSeleccion('varios', '3 elementos').columnas.flatMap(idsDeColumna)).toEqual(['girar-izq', 'girar', 'espejo-x', 'espejo-y', 'guardar-plantilla'])
  })

  it('es el último en plegarse (prioridad 0) y todo lo que trae es un comando de la tabla', () => {
    for (const t of TIPOS_SELECCION) {
      const g = grupoDeSeleccion(t, 'x')
      expect(g.prioridad).toBe(0)
      for (const id of g.columnas.flatMap(idsDeColumna)) expect(COMANDOS[id], id).toBeDefined()
    }
  })
})
