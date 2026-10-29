// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, cable, documento, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

/** R1 en el origen con un cable de su pin 2 a (40,0), y R2 al final. */
function circuito() {
  const d = documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 44, 0)], [cable('w', [4, 0], [40, 0])])
  d.etiquetas = { e: { id: 'e', nombre: 'SALIDA', x: 20, y: 0, rot: 0 } }
  return d
}

describe('borrar', () => {
  it('quita una pieza por su referencia en un paso y deshacer la devuelve', () => {
    const n = nuevoNucleo(circuito())
    const antes = texto(n)
    aplicarOk(n, { orden: 'borrar', refs: ['r1'] })
    expect(Object.keys(n.doc.piezas)).toEqual(['b'])
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('quita las etiquetas por nombre y los cables por patilla o por red', () => {
    const n = nuevoNucleo(circuito())
    aplicarOk(n, { orden: 'borrar', etiquetas: ['SALIDA'] })
    expect(n.doc.etiquetas).toEqual({})
    aplicarOk(n, { orden: 'borrar', cables: ['R2.1'] })
    expect(n.doc.cables).toEqual({})
    expect(sinViolaciones(n)).toEqual([])
  })

  it('quita todos los cables de una red nombrada', () => {
    const n = nuevoNucleo(circuito())
    aplicarOk(n, { orden: 'borrar', cables: ['SALIDA'] })
    expect(n.doc.cables).toEqual({})
  })

  it('rechaza referencias, etiquetas y redes que no existen y las listas que no borran nada', () => {
    const n = nuevoNucleo(circuito())
    expect(n.aplicar({ orden: 'borrar', refs: ['R9'] })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R9».' })
    expect(n.aplicar({ orden: 'borrar', etiquetas: ['NADA'] })).toEqual({ ok: false, motivo: 'No hay etiquetas con el nombre «NADA».' })
    expect(n.aplicar({ orden: 'borrar', cables: ['R9.1'] })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R9».' })
    expect(n.aplicar({ orden: 'borrar', cables: ['R1.7'] })).toEqual({ ok: false, motivo: 'R1 no tiene el pin «7».' })
    expect(n.aplicar({ orden: 'borrar' })).toEqual({ ok: false, motivo: 'No hay nada que borrar.' })
    expect(n.historial.puedeDeshacer).toBe(false)
  })
})
