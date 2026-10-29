// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento, type Etiqueta, type Pieza } from '../doc/tipos'
import { cajaEtiqueta } from '../lienzo/medidas'
import { cajasSeCruzan } from '../lienzo/apartar'
import { libreriaDePrueba } from '../prueba/libreria'
import { cuerpoEnMundo } from './colision'
import { lugarParaPegar } from './conflictos'

const lib = libreriaDePrueba().piezas
const R: Pieza = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
const etiqueta = (id: string, x: number, y: number): Etiqueta => ({ id, nombre: 'VCC', x, y, rot: 90 })

function conResistencia(): Documento {
  const d = documentoVacio()
  d.piezas[R.id] = R
  return d
}

describe('lugar para pegar etiquetas', () => {
  it('una etiqueta sola no cae encima de una pieza', () => {
    const d = conResistencia()
    const copia = etiqueta('e', 0, 0)
    const l = lugarParaPegar(d, lib, [], [], { x: 0, y: 0 }, undefined, undefined, { etiquetas: [copia] })
    expect(l.libre).toBe(true)
    expect(l.en).not.toEqual({ x: 0, y: 0 })
    const caja = cajaEtiqueta({ ...copia, x: l.en.x, y: l.en.y })
    expect(cajasSeCruzan(caja, cuerpoEnMundo(R, lib.get(R.tipo)))).toBe(false)
  })

  it('una etiqueta no cae encima de otra etiqueta', () => {
    const d = documentoVacio()
    d.etiquetas.a = etiqueta('a', 20, 20)
    const l = lugarParaPegar(d, lib, [], [], { x: 20, y: 20 }, undefined, undefined, { etiquetas: [etiqueta('e', 0, 0)] })
    expect(l.libre).toBe(true)
    expect(cajasSeCruzan(cajaEtiqueta({ ...etiqueta('e', 0, 0), x: l.en.x, y: l.en.y }), cajaEtiqueta(d.etiquetas.a))).toBe(false)
  })

  it('en un lugar libre se queda donde se pidió', () => {
    const l = lugarParaPegar(documentoVacio(), lib, [], [], { x: 40, y: 40 }, undefined, undefined, { etiquetas: [etiqueta('e', 0, 0)] })
    expect(l).toMatchObject({ en: { x: 40, y: 40 }, libre: true })
  })
})
