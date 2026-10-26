import { describe, expect, it } from 'vitest'
import type { ApiKirchi } from '../compartido/ajustes'
import { apiParaVentana } from './apiParaVentana'

const completa = {
  ajustes: {}, pruebas: false, guardarAjustes: async () => ({}), leerAjustes: async () => ({}), archivos: { abrir: () => 0 }, plantillas: {},
  ngspice: {}, graficas: {}, osciloscopio: {}, ventana: () => undefined, alTamañoInterfaz: () => () => undefined
} as unknown as ApiKirchi

describe('API que expone el preload según la ventana', () => {
  it('el editor recibe todo', () => {
    expect(apiParaVentana(false, completa)).toBe(completa)
  })

  it('las ventanas aparte no reciben archivos, plantillas, ngspice, ajustes ni órdenes de ventana', () => {
    const a = apiParaVentana(true, completa)
    expect(Object.keys(a).sort()).toEqual(['ajustes', 'alTamañoInterfaz', 'archivos', 'graficas', 'osciloscopio', 'pruebas'])
    expect(a.archivos).toEqual({})
    expect(a.guardarAjustes).toBeUndefined()
    expect(a.leerAjustes).toBeUndefined()
    expect(a.ventana).toBeUndefined()
  })
})
