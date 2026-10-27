// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../../conexiones/conexiones'
import { documento, lib, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'
import type { Documento } from '../../doc/tipos'

const conectar = (n: ReturnType<typeof nuevoNucleo>, desde: string, hasta: string, via?: 'auto' | 'cable' | 'etiqueta') => n.aplicar({ orden: 'conectar', desde, hasta, ...(via ? { via } : {}) })
const mismaRed = (n: ReturnType<typeof nuevoNucleo>, a: [string, string], b: [string, string]) => {
  const c = calcularConexiones(n.doc, lib)
  return c.redDePin.get(clavePin(...a)) === c.redDePin.get(clavePin(...b))
}
const dosEnFila = (): Documento => documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 16, 0)])

describe('conectar', () => {
  it('une dos resistencias en fila con un cable recto', () => {
    const n = nuevoNucleo(dosEnFila())
    const r = conectar(n, 'R1.2', 'R2.1')
    expect(r).toMatchObject({ ok: true, via: 'cable' })
    expect(Object.values(n.doc.cables).map((c) => c.puntos)).toEqual([[{ x: 4, y: 0 }, { x: 12, y: 0 }]])
    expect(mismaRed(n, ['a', '2'], ['b', '1'])).toBe(true)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('rodea una pieza que estorba con un cable en vez de atravesarla', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('m', 'resistencia', 'R2', 16, 0), pieza('b', 'resistencia', 'R3', 32, 0)]))
    expect(conectar(n, 'R1.2', 'R3.1')).toMatchObject({ ok: true, via: 'cable' })
    expect(mismaRed(n, ['a', '2'], ['b', '1'])).toBe(true)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('conectar dos veces lo mismo da yaUnidas y no agrega un paso de deshacer', () => {
    const n = nuevoNucleo(dosEnFila())
    const antes = texto(n)
    conectar(n, 'R1.2', 'R2.1')
    const unido = texto(n)
    expect(conectar(n, 'R1.2', 'R2.1')).toEqual({ ok: true, creados: {}, avisos: [], yaUnidas: true })
    expect(texto(n)).toBe(unido)
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('rechaza una patilla inexistente y una pieza que no está', () => {
    const n = nuevoNucleo(dosEnFila())
    expect(conectar(n, 'R1.9', 'R2.1')).toEqual({ ok: false, motivo: 'R1 no tiene la patilla «9».' })
    expect(conectar(n, 'R7.1', 'R2.1')).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R7».' })
    expect(conectar(n, 'R1.1', 'GND')).toEqual({ ok: false, motivo: 'No hay ninguna red llamada «GND».' })
  })

  /** R1.2 queda en un callejón: dos amplificadores arriba y abajo y otro a la derecha cierran todo paso. */
  const encerrada = (): Documento =>
    documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('arr', 'amp-op', 'U1', 4, -5), pieza('aba', 'amp-op', 'U2', 4, 5), pieza('der', 'amp-op', 'U3', 10, 0), pieza('o', 'resistencia', 'R2', -30, 0)])

  it('sin ruta limpia une por etiquetas y dice por qué', () => {
    const n = nuevoNucleo(encerrada())
    const r = conectar(n, 'R2.2', 'R1.2')
    expect(r).toMatchObject({ ok: true, via: 'etiquetas' })
    if (r.ok) expect(r.avisos[0]).toMatch(/^Se unieron por etiquetas «N1»: un cable (atravesaría|correría)/)
    expect(Object.values(n.doc.etiquetas).map((e) => e.nombre)).toEqual(['N1', 'N1'])
    expect(mismaRed(n, ['o', '2'], ['a', '2'])).toBe(true)
    n.deshacer()
    expect(Object.keys(n.doc.etiquetas)).toEqual([])
  })

  it('con via cable no hay respaldo y se rechaza con el motivo', () => {
    const n = nuevoNucleo(encerrada())
    const antes = texto(n)
    const r = conectar(n, 'R2.2', 'R1.2', 'cable')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/^No se conectó R2\.2 con R1\.2: un cable (atravesaría|correría)/)
    expect(texto(n)).toBe(antes)
  })

  it('con via etiqueta usa etiquetas aunque un cable cupiera, y las patillas quedan en la misma red', () => {
    const n = nuevoNucleo(dosEnFila())
    expect(conectar(n, 'R1.2', 'R2.1', 'etiqueta')).toMatchObject({ ok: true, via: 'etiquetas' })
    expect(Object.keys(n.doc.cables).length).toBeGreaterThan(0)
    expect(mismaRed(n, ['a', '2'], ['b', '1'])).toBe(true)
    expect(sinViolaciones(n)).toEqual([])
  })

  const conRedes = (): Documento => {
    const d = documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 40, 0), pieza('c', 'resistencia', 'R3', 80, 0)])
    d.etiquetas.e1 = { id: 'e1', nombre: 'VCC', x: 36, y: 0, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: 'SALIDA', x: 84, y: 0, rot: 0 }
    return d
  }

  it('conectar a una red con nombre empalma en su punto más cercano', () => {
    const n = nuevoNucleo(conRedes())
    expect(conectar(n, 'R1.2', 'VCC')).toMatchObject({ ok: true, via: 'cable' })
    const c = Object.values(n.doc.cables)[0]
    expect(c.puntos[0]).toEqual({ x: 4, y: 0 })
    expect(c.puntos[c.puntos.length - 1]).toEqual({ x: 36, y: 0 })
    expect(mismaRed(n, ['a', '2'], ['b', '1'])).toBe(true)
  })

  it('unir dos redes con nombres distintos se rechaza', () => {
    const n = nuevoNucleo(conRedes())
    const r = conectar(n, 'VCC', 'SALIDA')
    expect(r).toEqual({ ok: false, motivo: 'No se conectó VCC con SALIDA: las redes «VCC» y «SALIDA» quedarían unidas y tienen nombres distintos.' })
  })
})
