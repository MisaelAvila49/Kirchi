// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { documentoVacio } from '../doc/tipos'
import { calcularConexiones } from '../conexiones/conexiones'
import { textoDeValor, rotulosDePieza } from '../lienzo/etiquetas'
import { libreriaDePrueba } from '../prueba/libreria'
import { catalogo } from '../ui/catalogo'

const lib = libreriaDePrueba().piezas
const pines = (id: string) => lib.get(id)!.pines.map((p) => `${p.id}@${p.x},${p.y}`)
const primero = (q: string) => buscar(q, lib)[0]?.def.id
const pieza = (tipo: string, props: Record<string, string> = {}) => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0 as const, espejo: false, props })

describe('instrumentos', () => {
  it.each([
    ['multimetro', 'XMM', ['+@0,-6', 'COM@0,6']],
    ['osciloscopio', 'XSC', ['A@-8,-6', 'B@-8,-2', 'C@-8,2', 'D@-8,6']],
    ['generador', 'XFG', ['+@0,-6', 'COM@0,6']],
    ['fuente-variable', 'XPS', ['+@0,-6', '-@0,6']],
    ['punta-logica', 'LP', ['PUNTA@-6,0', '+@0,-6', '-@0,6']]
  ] as const)('%s: categoría instrumentos, prefijo %s y pines', (id, prefijo, esperados) => {
    expect(lib.get(id)).toMatchObject({ categoria: 'instrumentos', prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it('la categoría «Instrumentos» va al final de la Librería con el noveno tono', () => {
    const cats = catalogo(lib)
    expect(cats.at(-1)).toMatchObject({ id: 'instrumentos', nombre: 'Instrumentos', tono: 'ciruela' })
    expect(cats.at(-1)!.piezas.map((e) => e.def.id).sort()).toEqual(['fuente-variable', 'generador', 'multimetro', 'osciloscopio', 'punta-logica'])
  })

  it.each([
    ['multímetro', 'multimetro'],
    ['voltímetro', 'multimetro'],
    ['amperímetro', 'multimetro'],
    ['óhmetro', 'multimetro'],
    ['osciloscopio', 'osciloscopio'],
    ['scope', 'osciloscopio'],
    ['generador', 'generador'],
    ['función', 'generador'],
    ['fuente variable', 'fuente-variable'],
    ['fuente de laboratorio', 'fuente-variable'],
    ['punta lógica', 'punta-logica'],
    ['logic probe', 'punta-logica']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('el buscador acepta valores: «gen 1k» y «fuente 12»', () => {
    expect(buscar('gen 1k', lib)[0]).toMatchObject({ def: { id: 'generador' }, valor: '1k' })
    expect(buscar('fuente variable 12', lib)[0]).toMatchObject({ def: { id: 'fuente-variable' }, valor: '12' })
  })

  it('el multímetro escribe la letra de su modo y el generador su frecuencia como valor; el osciloscopio no tiene valor', () => {
    const mm = lib.get('multimetro')!
    expect(rotulosDePieza(pieza('multimetro'), mm)[0].texto).toBe('V')
    expect(rotulosDePieza(pieza('multimetro', { modo: 'A AC' }), mm)[0].texto).toBe('A~')
    expect(rotulosDePieza(pieza('multimetro', { modo: 'Ω' }), mm)[0].texto).toBe('Ω')
    expect(textoDeValor(pieza('generador'), lib.get('generador')!)).toBe('1 kHz')
    expect(textoDeValor(pieza('fuente-variable'), lib.get('fuente-variable')!)).toBe('5 V')
    expect(textoDeValor(pieza('osciloscopio'), lib.get('osciloscopio')!)).toBeNull()
  })

  it('el osciloscopio mide 17 unidades de ancho (6.25 mm más que en la 2C) para «A ← R1:2»; los pines no se mueven', () => {
    const o = lib.get('osciloscopio')!
    expect(o.geometria.caja.maxX).toBeCloseTo(11, 6)
    expect(o.geometria.caja.minX).toBeCloseTo(-8, 6)
    expect(o.etiquetas.ref).toMatchObject({ x: 2, y: -10 })
  })

  it('el generador trae una variante de símbolo por forma', () => {
    expect(Object.keys(lib.get('generador')!.variantes!.geometrias).sort()).toEqual(['Cuadrada', 'Diente de sierra', 'Escalera', 'Escalón', 'Pulso', 'Senoidal', 'Triangular'])
  })

  it('un instrumento sin conectar no rompe el cálculo de conexiones', () => {
    const d = documentoVacio()
    d.piezas.p = pieza('osciloscopio')
    expect(() => calcularConexiones(d, lib)).not.toThrow()
  })
})
