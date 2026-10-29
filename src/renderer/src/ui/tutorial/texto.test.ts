import { describe, expect, it } from 'vitest'
import { GESTOS, partirTexto, textoLlano } from './texto'

const teclas: Record<string, string> = { girar: 'R', simular: 'F5' }
const teclaDe = (id: string) => teclas[id]

describe('texto de un paso', () => {
  it('parte el texto y resuelve las teclas con las vigentes', () => {
    expect(partirTexto('Pulsa {tecla:girar} y luego {tecla:simular}.', teclaDe)).toEqual([
      { tipo: 'texto', texto: 'Pulsa ' }, { tipo: 'tecla', id: 'girar', tecla: 'R' },
      { tipo: 'texto', texto: ' y luego ' }, { tipo: 'tecla', id: 'simular', tecla: 'F5' }, { tipo: 'texto', texto: '.' }
    ])
  })

  it('un comando sin tecla queda con tecla nula y el texto llano usa su nombre', () => {
    expect(partirTexto('{tecla:nota}', teclaDe)).toEqual([{ tipo: 'tecla', id: 'nota', tecla: null }])
    expect(textoLlano('Usa {tecla:nota} o {tecla:girar}.', teclaDe, (id) => `«${id}»`)).toBe('Usa «nota» o R.')
  })

  it('un texto sin marcas es un solo trozo', () => {
    expect(partirTexto('Nada.', teclaDe)).toEqual([{ tipo: 'texto', texto: 'Nada.' }])
    expect(partirTexto('', teclaDe)).toEqual([])
  })

  it('los gestos son marcas {gesto:id} con su nombre en palabras, o el que se pida después de la barra', () => {
    expect(partirTexto('Haz {gesto:doble-clic} y {gesto:arrastrar|arrastra}.', teclaDe)).toEqual([
      { tipo: 'texto', texto: 'Haz ' }, { tipo: 'gesto', id: 'doble-clic', texto: 'doble clic' },
      { tipo: 'texto', texto: ' y ' }, { tipo: 'gesto', id: 'arrastrar', texto: 'arrastra' }, { tipo: 'texto', texto: '.' }
    ])
    expect(textoLlano('Haz {gesto:clic-derecho} y gira la {gesto:rueda}.', teclaDe, (id) => id)).toBe('Haz clic derecho y gira la rueda del ratón.')
  })

  it('hay siete gestos con nombre y ninguno repite el de otro', () => {
    expect(Object.keys(GESTOS)).toEqual(['clic', 'doble-clic', 'clic-derecho', 'doble-clic-derecho', 'arrastrar', 'mayus-clic', 'rueda'])
    expect(new Set(Object.values(GESTOS)).size).toBe(7)
  })

  it('un icono es una marca {icono:id|Nombre} con el nombre que se ve al lado; sin nombre queda solo el icono', () => {
    expect(partirTexto('Elige {icono:voltajes|Medir} o {icono:osciloscopio}.', teclaDe)).toEqual([
      { tipo: 'texto', texto: 'Elige ' }, { tipo: 'icono', id: 'voltajes', texto: 'Medir' },
      { tipo: 'texto', texto: ' o ' }, { tipo: 'icono', id: 'osciloscopio', texto: '' }, { tipo: 'texto', texto: '.' }
    ])
    // Para el lector de pantalla el icono no dice nada y su nombre queda en el texto.
    expect(textoLlano('Abre {icono:mediciones|Mediciones}.', teclaDe, (id) => id)).toBe('Abre Mediciones.')
  })

  it('una tecla fija que no está en la tabla de atajos se escribe con {kbd:tecla}', () => {
    expect(partirTexto('Pulsa {kbd:F11}.', teclaDe)).toEqual([{ tipo: 'texto', texto: 'Pulsa ' }, { tipo: 'tecla', id: 'F11', tecla: 'F11' }, { tipo: 'texto', texto: '.' }])
    expect(textoLlano('Pulsa {kbd:F11}.', teclaDe, (id) => id)).toBe('Pulsa F11.')
  })
})
