// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { fragmentoDeDocumento } from '../../plantillas/plantilla'
import { divisor } from '../../prueba/circuitos'
import { nuevoNucleo, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

describe('fragmento', () => {
  it('inserta dos veces el divisor incluido, renumera y renombra redes como Ctrl+V', () => {
    const n = nuevoNucleo()
    const a = n.aplicar({ orden: 'fragmento', plantilla: 'Divisor de voltaje' })
    expect(a).toMatchObject({ ok: true })
    const nombres1 = new Set(Object.values(n.doc.etiquetas).map((e) => e.nombre))
    const b = n.aplicar({ orden: 'fragmento', plantilla: 'divisor-de-voltaje' })
    expect(b).toMatchObject({ ok: true })
    if (a.ok && b.ok) expect(Object.keys(a.creados).filter((r) => Object.keys(b.creados).includes(r))).toEqual([])
    const refs = Object.values(n.doc.piezas).map((p) => p.ref)
    expect(new Set(refs).size).toBe(refs.length)
    const nombres = Object.values(n.doc.etiquetas).map((e) => e.nombre)
    expect(new Set(nombres).size).toBeGreaterThan(nombres.length / 2)
    expect(nombres.length).toBeGreaterThan(nombres1.size)
    if (b.ok) expect(b.avisos.join(' ')).toMatch(/Se renombraron redes/)
    expect(sinViolaciones(n)).toEqual([])
    n.deshacer()
    expect(Object.keys(n.doc.piezas).length).toBe(Object.keys(a.ok ? a.creados : {}).length)
  })

  it('rechaza una plantilla que no existe y un archivo sin lector', () => {
    const n = nuevoNucleo()
    expect(n.aplicar({ orden: 'fragmento', plantilla: 'flux' })).toEqual({ ok: false, motivo: 'No hay ninguna plantilla incluida llamada «flux».' })
    expect(n.aplicar({ orden: 'fragmento', archivo: 'a.kir' })).toEqual({ ok: false, motivo: 'Aquí no se pueden leer archivos.' })
  })

  it('un archivo leído se pega en el lugar pedido y se rechaza si ahí no hay lugar', () => {
    const n = nuevoNucleo()
    const f = fragmentoDeDocumento(divisor())!
    n.lectorDeArchivos = (nombre) => (nombre === 'div.kir' ? f : { motivo: `No hay ningún archivo «${nombre}».` })
    expect(n.aplicar({ orden: 'fragmento', archivo: 'otro.kir' })).toEqual({ ok: false, motivo: 'No hay ningún archivo «otro.kir».' })
    expect(n.aplicar({ orden: 'fragmento', archivo: 'div.kir', en: { x: 0, y: 0 } })).toMatchObject({ ok: true })
    const antes = texto(n)
    expect(n.aplicar({ orden: 'fragmento', archivo: 'div.kir', en: { x: 0, y: 0 } })).toEqual({ ok: false, motivo: 'No se colocó el fragmento: no hay lugar libre ahí.' })
    expect(texto(n)).toBe(antes)
    expect(n.aplicar({ orden: 'fragmento', archivo: 'div.kir', en: { x: 3, y: 0 } })).toEqual({ ok: false, motivo: 'La posición va en múltiplos de 2.5 mm.' })
    expect(n.aplicar({ orden: 'fragmento', archivo: 'div.kir' })).toMatchObject({ ok: true })
    expect(sinViolaciones(n)).toEqual([])
  })
})
