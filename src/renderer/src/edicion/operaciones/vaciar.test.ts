// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { nuevoNucleo, texto } from '../../prueba/ayudaEdicion'
import { MOTIVO_YA_VACIO } from './vaciar'

describe('vaciar', () => {
  it('borra piezas, cables, etiquetas, sondas y análisis en un solo paso que se deshace entero', () => {
    const n = nuevoNucleo()
    expect(n.aplicar({ orden: 'fragmento', plantilla: 'Divisor de voltaje' })).toMatchObject({ ok: true })
    expect(n.aplicar({ orden: 'analisis', nombre: 'Operación', config: { tipo: 'op' } })).toMatchObject({ ok: true })
    expect(Object.keys(n.doc.etiquetas).length).toBeGreaterThan(0)
    const lleno = texto(n)
    expect(n.aplicar({ orden: 'vaciar' })).toEqual({ ok: true, creados: {}, avisos: [] })
    const d = n.doc
    expect([d.piezas, d.cables, d.etiquetas, d.notas, d.figuras ?? {}, d.sondas ?? {}, d.analisis ?? {}].map((c) => Object.keys(c).length)).toEqual([0, 0, 0, 0, 0, 0, 0])
    n.deshacer()
    expect(texto(n)).toBe(lleno)
  })

  it('un circuito vacío se rechaza sin dejar paso', () => {
    const n = nuevoNucleo()
    expect(n.aplicar({ orden: 'vaciar' })).toEqual({ ok: false, motivo: MOTIVO_YA_VACIO })
    expect(n.historial.puedeDeshacer).toBe(false)
  })
})
