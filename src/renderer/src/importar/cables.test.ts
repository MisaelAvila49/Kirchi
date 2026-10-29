// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cablear } from './cables'

const lib = libreriaDePrueba().piezas

describe('cablear con una red enorme', () => {
  it('respeta el presupuesto de tiempo dentro de una sola red y nombra el resto con etiquetas', () => {
    const doc = documentoVacio()
    const pieza = (id: string, x: number, y: number): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot: 0, espejo: false, props: {} })
    const pines: { pieza: Pieza; pin: string }[] = []
    for (let i = 0; i < 1500; i++) {
      const p = pieza(`r${i}`, (i % 40) * 60, Math.floor(i / 40) * 40)
      doc.piezas[p.id] = p
      pines.push({ pieza: p, pin: '1' })
    }
    const t0 = performance.now()
    const res = cablear(doc, lib, [{ nombre: 'GRANDE', tierra: false, pines }], idSecuencial(), () => pieza('t', 0, 0), 150)
    expect(performance.now() - t0).toBeLessThan(4000)
    expect(res.avisos.some((a) => a.includes('Por el tamaño del esquema'))).toBe(true)
    expect(res.conEtiqueta).toHaveLength(1)
  })
})
