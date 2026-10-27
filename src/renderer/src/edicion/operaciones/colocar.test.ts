// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, cable, documento, lib, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'
import { cuerpoEnMundo } from '../../editor/colision'

const colocar = (n: ReturnType<typeof nuevoNucleo>, o: Record<string, unknown>) => n.aplicar({ orden: 'colocar', tipo: 'resistencia', ...o } as never)

describe('colocar', () => {
  it('pone la pieza en la posición pedida con su valor y deja un paso de deshacer', () => {
    const n = nuevoNucleo()
    const r = aplicarOk(n, { orden: 'colocar', tipo: 'resistencia', valor: '4.7k', en: { x: 7.5, y: -5 }, rot: 90 })
    expect(r.creados).toEqual({ R1: 'p_0001' })
    expect(n.doc.piezas.p_0001).toMatchObject({ tipo: 'resistencia', ref: 'R1', x: 6, y: -4, rot: 90, props: { valor: '4.7k' } })
    n.deshacer()
    expect(Object.keys(n.doc.piezas)).toEqual([])
    expect(sinViolaciones(n)).toEqual([])
  })

  it('usa la referencia pedida y rechaza la repetida sin distinguir mayúsculas', () => {
    const n = nuevoNucleo()
    aplicarOk(n, { orden: 'colocar', tipo: 'resistencia', ref: 'Rcarga' })
    expect(n.doc.piezas.p_0001.ref).toBe('Rcarga')
    expect(colocar(n, { ref: 'RCARGA' })).toEqual({ ok: false, motivo: 'Ya hay otra pieza con la referencia Rcarga.' })
  })

  it('rechaza un tipo inexistente, un valor inválido y una propiedad que la pieza no tiene', () => {
    const n = nuevoNucleo()
    expect(colocar(n, { tipo: 'flux' })).toEqual({ ok: false, motivo: 'No existe el tipo de pieza «flux».' })
    expect(colocar(n, { valor: 'abc' })).toEqual({ ok: false, motivo: '«abc» no es un valor válido.' })
    expect(colocar(n, { props: { color: 'azul' } })).toEqual({ ok: false, motivo: 'R1 no tiene la propiedad «color».' })
    expect(colocar(n, { tipo: 'interruptor', valor: '5' })).toMatchObject({ ok: false })
    expect(Object.keys(n.doc.piezas)).toEqual([])
  })

  it('rechaza una posición fuera de la rejilla aunque la orden no haya pasado por validarOrden', () => {
    expect(colocar(nuevoNucleo(), { en: { x: 3, y: 0 } })).toEqual({ ok: false, motivo: 'La posición va en múltiplos de 2.5 mm.' })
  })

  it('rechaza lo que se encimaría con la frase del Registro', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(colocar(n, { en: { x: 2.5, y: 0 } })).toEqual({ ok: false, motivo: 'No se colocó R2: se encimaría con R1.' })
  })

  it('rechaza lo que quedaría fuera del área de dibujo', () => {
    expect(colocar(nuevoNucleo(), { en: { x: 2 ** 21 * 1.25, y: 0 } })).toEqual({ ok: false, motivo: 'No se colocó R1: quedaría fuera del área de dibujo.' })
  })

  it('sin posición la deja a la derecha de lo que hay y sin encimarse', () => {
    const n = nuevoNucleo()
    for (let i = 0; i < 4; i++) aplicarOk(n, { orden: 'colocar', tipo: 'resistencia' })
    const cajas = Object.values(n.doc.piezas).map((p) => cuerpoEnMundo(p, lib.get(p.tipo)))
    for (let i = 1; i < cajas.length; i++) expect(cajas[i].minX).toBeGreaterThan(cajas[i - 1].maxX)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('una resistencia sobre un cable recto queda en serie en un solo paso', () => {
    const n = nuevoNucleo(documento([], [cable('w', [-20, 0], [20, 0])]))
    const antes = texto(n)
    aplicarOk(n, { orden: 'colocar', tipo: 'resistencia', en: { x: 0, y: 0 } })
    const trozos = Object.values(n.doc.cables).map((c) => c.puntos)
    expect(trozos).toHaveLength(2)
    expect(trozos).toContainEqual([{ x: -20, y: 0 }, { x: -4, y: 0 }])
    expect(trozos).toContainEqual([{ x: 4, y: 0 }, { x: 20, y: 0 }])
    expect(sinViolaciones(n)).toEqual([])
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('rechaza una pieza que un cable atravesaría sin poder quedar en serie', () => {
    const n = nuevoNucleo(documento([], [cable('w', [0, -10], [0, 10])]))
    expect(colocar(n, { en: { x: 0, y: 0 } })).toEqual({ ok: false, motivo: 'No se colocó R1: un cable atravesaría R1.' })
  })

  it('la cantidad de entradas de una compuerta elige la pieza de su familia', () => {
    const n = nuevoNucleo()
    aplicarOk(n, { orden: 'colocar', tipo: 'and', props: { entradas: '3' } })
    expect(n.doc.piezas.p_0001.tipo).toBe('and-3')
    expect(colocar(n, { tipo: 'and', props: { entradas: '9' } })).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Las entradas van de 2 a/) })
  })
})
