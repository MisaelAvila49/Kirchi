// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, documento, nuevoNucleo, pieza, texto } from '../../prueba/ayudaEdicion'
import { validarOrden } from '../ordenes'

const circuito = () => {
  const n = nuevoNucleo(documento([pieza('v', 'fuente-dc', 'V1', 0, 0), pieza('a', 'resistencia', 'R1', 16, 0), pieza('g', 'tierra', 'GND1', 16, 20)]))
  aplicarOk(n, { orden: 'conectar', desde: 'V1.+', hasta: 'R1.1' })
  aplicarOk(n, { orden: 'conectar', desde: 'R1.2', hasta: 'GND1.1' })
  aplicarOk(n, { orden: 'conectar', desde: 'V1.-', hasta: 'GND1.1' })
  return n
}
const DC = { tipo: 'dc', fuente: 'V1', desde: 0, hasta: 5, paso: 1 }

describe('analisis', () => {
  it('guarda el análisis con la fuente por su id y las trazas como el panel las guarda', () => {
    const n = circuito()
    const r = n.aplicar({ orden: 'analisis', nombre: 'Barrido', config: DC, trazas: ['R1.1'], corrientes: ['R1'] })
    expect(r).toMatchObject({ ok: true })
    const a = Object.values(n.doc.analisis ?? {})
    expect(a).toHaveLength(1)
    expect(a[0].nombre).toBe('Barrido')
    expect(a[0].config).toMatchObject({ tipo: 'dc', fuente: 'v', hasta: 5 })
    expect(a[0].trazas).toEqual({ redes: [expect.stringMatching(/^red [0-9]+$/)], piezas: ['a'] })
  })

  it('con el mismo nombre reemplaza, y lo idéntico no agrega un paso', () => {
    const n = circuito()
    aplicarOk(n, { orden: 'analisis', nombre: 'Barrido', config: DC })
    const id = Object.keys(n.doc.analisis ?? {})[0]
    aplicarOk(n, { orden: 'analisis', nombre: 'barrido', config: { ...DC, hasta: 8 } })
    expect(Object.keys(n.doc.analisis ?? {})).toEqual([id])
    expect(n.doc.analisis![id].config).toMatchObject({ hasta: 8 })
    const antes = texto(n)
    expect(n.aplicar({ orden: 'analisis', nombre: 'barrido', config: { ...DC, hasta: 8 } })).toMatchObject({ ok: true, yaUnidas: true })
    expect(texto(n)).toBe(antes)
    n.deshacer()
    expect(n.doc.analisis![id].config).toMatchObject({ hasta: 5 })
  })

  it('rechaza lo que el panel rechazaría y dice por qué', () => {
    const n = circuito()
    expect(n.aplicar({ orden: 'analisis', nombre: 'X', config: { ...DC, fuente: 'V9' } })).toEqual({ ok: false, motivo: 'No se guardó el análisis «X»: No hay ninguna pieza con la referencia «V9».' })
    expect(n.aplicar({ orden: 'analisis', nombre: 'X', config: DC, trazas: ['R1.2'] })).toMatchObject({ ok: false, motivo: expect.stringContaining('tierra') })
    expect(n.aplicar({ orden: 'analisis', nombre: 'X', config: { tipo: 'nada' } })).toMatchObject({ ok: false })
    expect(n.aplicar({ orden: 'analisis', nombre: 'X', config: DC, corrientes: ['R7'] })).toMatchObject({ ok: false })
    expect(n.doc.analisis).toBeUndefined()
  })

  it('valida la forma de la orden', () => {
    expect(validarOrden({ orden: 'analisis', nombre: 'A', config: 'dc' })).toMatchObject({ ok: false })
    expect(validarOrden({ orden: 'analisis', nombre: 'A', config: DC, trazas: 'R1.1' })).toMatchObject({ ok: false })
    expect(validarOrden({ orden: 'analisis', nombre: 'A', config: DC, extra: 1 })).toMatchObject({ ok: false })
    expect(validarOrden({ orden: 'analisis', nombre: 'A', config: DC, trazas: ['R1.1'] })).toMatchObject({ ok: true })
  })
})
