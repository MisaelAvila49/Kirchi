// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cambiarProp, cambiarValor, nuevaEtiqueta, nuevaNota, nuevaPieza, nuevoCable, valorEditable } from './colocar'

const lib = libreriaDePrueba().piezas
const def = (id: string) => lib.get(id)!
const en = { x: 10, y: 0 }
const R1: Pieza = { id: 'a', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }

describe('colocar', () => {
  it('una pieza nueva lleva valores por omisión, referencia e identificador', () => {
    expect(nuevaPieza(documentoVacio(), def('resistencia'), en, 0, false, idSecuencial())).toEqual({
      id: 'p_0001', tipo: 'resistencia', ref: 'R1', x: 10, y: 0, rot: 0, espejo: false, props: { valor: '1k' }
    })
  })

  it('la referencia sigue a las del documento; LED y diodo comparten la D', () => {
    const d = documentoVacio()
    d.piezas.a = R1
    d.piezas.b = { ...R1, id: 'b', tipo: 'diodo', ref: 'D1' }
    expect(nuevaPieza(d, def('resistencia'), en, 0, false, idSecuencial()).ref).toBe('R2')
    expect(nuevaPieza(d, def('led'), en, 0, false, idSecuencial()).ref).toBe('D2')
  })

  it('el valor pedido reemplaza la primera propiedad numérica y se ignora si no hay', () => {
    expect(nuevaPieza(documentoVacio(), def('resistencia'), en, 90, true, idSecuencial(), '4k7')).toMatchObject({ rot: 90, espejo: true, props: { valor: '4k7' } })
    expect(nuevaPieza(documentoVacio(), def('led'), en, 0, false, idSecuencial(), '1k').props).toEqual({ color: 'rojo' })
  })

  it('la tierra se numera aunque su referencia no se muestre', () => {
    expect(nuevaPieza(documentoVacio(), def('tierra'), en, 0, false, idSecuencial())).toMatchObject({ ref: 'GND1', props: {} })
  })

  it('etiquetas, notas y cables nuevos', () => {
    const gen = idSecuencial()
    expect(nuevaEtiqueta('  VCC ', { x: 2, y: 4 }, gen)).toEqual({ id: 'e_0001', nombre: 'VCC', x: 2, y: 4, rot: 0 })
    expect(nuevaNota('hola', { x: 0, y: 0 }, gen)).toEqual({ id: 'n_0002', x: 0, y: 0, ancho: 8, texto: 'hola' })
    expect(nuevoCable([{ x: 0, y: 0 }, { x: 4, y: 0 }], gen).id).toBe('c_0003')
  })

  it('el valor editable es la primera propiedad numérica', () => {
    expect(valorEditable(R1, def('resistencia'))).toMatchObject({ texto: '1k', prop: { id: 'valor' } })
    expect(valorEditable({ ...R1, props: { valor: '330' } }, def('resistencia'))!.texto).toBe('330')
    expect(valorEditable({ ...R1, tipo: 'interruptor' }, def('interruptor'))).toBeNull()
  })

  it('cambiarValor valida, revisa la unidad y guarda el texto', () => {
    expect(cambiarValor(R1, def('resistencia'), '  4k7 ')).toEqual({ pieza: { ...R1, props: { valor: '4k7' } } })
    expect(cambiarValor(R1, def('resistencia'), 'abc')).toEqual({ error: '«abc» no es un valor válido.' })
    expect(cambiarValor(R1, def('resistencia'), '5 V')).toEqual({ error: 'Se esperaba un valor en Ω.' })
  })

  it('el aspecto del osciloscopio es un texto largo: admite hasta su tope y no más (N8b)', () => {
    const osc = lib.get('osciloscopio')
    expect(osc).toBeDefined()
    const P: Pieza = { id: 'o', tipo: 'osciloscopio', ref: 'XSC1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    const largo = 'tema=oscuro grosor=2.5 rejilla=no marcas=no tiempo=abajo texto=negro peso=negrita estilo=puntos lectura=no ux=m A=derecha/negro A.grosor=3 A.unidad=base'
    expect(largo.length).toBeGreaterThan(24)
    expect(cambiarProp(P, osc!, 'aspecto', largo)).toEqual({ pieza: { ...P, props: { aspecto: largo } } })
    expect(cambiarProp(P, osc!, 'aspecto', 'x'.repeat(401))).toEqual({ error: 'Aspecto de la pantalla admite 400 caracteres como máximo.' })
    // Los demás textos siguen en 24.
    expect(cambiarProp(P, osc!, 'medidas', 'x'.repeat(25))).toEqual({ error: 'Medidas a la vista admite 24 caracteres como máximo.' })
  })

  it('cambiarProp valida números con su unidad y listas cerradas con sus opciones', () => {
    const S1: Pieza = { ...R1, tipo: 'interruptor', ref: 'S1' }
    expect(cambiarProp(R1, def('resistencia'), 'valor', '330')).toEqual({ pieza: { ...R1, props: { valor: '330' } } })
    expect(cambiarProp(R1, def('resistencia'), 'valor', '2 F')).toEqual({ error: 'Se esperaba un valor en Ω.' })
    expect(cambiarProp(S1, def('interruptor'), 'estado', ' cerrado ')).toEqual({ pieza: { ...S1, props: { estado: 'cerrado' } } })
    expect(cambiarProp(S1, def('interruptor'), 'estado', 'medio')).toEqual({ error: 'Elige una opción: abierto, cerrado.' })
    expect(cambiarProp(R1, def('resistencia'), 'color', 'rojo')).toEqual({ error: 'R1 no tiene la propiedad «color».' })
  })
})
