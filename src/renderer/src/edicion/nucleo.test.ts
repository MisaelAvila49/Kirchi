// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { borrar, crear, modificar } from '../doc/comandos'
import { MOTIVO_FUERA_DEL_MUNDO } from '../doc/limites'
import { aplicarOk, cable, documento, nuevoNucleo, pieza, sinViolaciones, texto } from '../prueba/ayudaEdicion'
import { MENSAJE_SIMULANDO, MENSAJE_SOLO_LECTURA } from './nucleo'

const R1 = pieza('r', 'resistencia', 'R1', 0, 0)

describe('NucleoEdicion.ejecutar', () => {
  it('rechaza un cable que cruza una pieza con el id del choque y deja el historial igual', () => {
    const n = nuevoNucleo(documento([R1]))
    const antes = texto(n)
    const r = n.ejecutar(crear('cablear', 'cables', cable('w', [-20, 0], [20, 0])))
    expect(r).toMatchObject({ ok: false, motivo: 'un cable atravesaría R1', con: { con: 'r', col: 'piezas' } })
    expect(n.historial.puedeDeshacer).toBe(false)
    expect(texto(n)).toBe(antes)
  })

  it('rechaza lo que quedaría fuera del mundo', () => {
    const n = nuevoNucleo(documento([R1]))
    const r = n.ejecutar(modificar('mover', 'piezas', R1, { ...R1, x: 2 ** 21 }))
    expect(r).toEqual({ ok: false, motivo: MOTIVO_FUERA_DEL_MUNDO })
    expect(n.doc.piezas.r.x).toBe(0)
  })

  it('acepta un cable limpio, parte las uniones en T y devuelve lo creado', () => {
    const n = nuevoNucleo(documento([], [cable('a', [0, 20], [40, 20])]))
    const r = n.ejecutar(crear('cablear', 'cables', cable('b', [20, 20], [20, 40])))
    expect(r.ok).toBe(true)
    // El cable horizontal queda partido en la unión.
    expect(Object.keys(n.doc.cables)).toHaveLength(3)
    expect(r.ok && r.creados.cables).toContain('b')
    expect(sinViolaciones(n)).toEqual([])
  })

  it('sin normalizar ni verificar se comporta como el camino simple del editor', () => {
    const n = nuevoNucleo(documento([R1]))
    const r = n.ejecutar(crear('cablear', 'cables', cable('w', [-20, 0], [20, 0])), { verificar: false, normalizar: false })
    expect(r.ok).toBe(true)
  })

  it('muda la sonda en el mismo paso que el cambio que la deja sin cable', () => {
    const d = documento([R1], [cable('c', [4, 0], [40, 0])])
    d.sondas = { v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } }
    const n = nuevoNucleo(d)
    const antes = texto(n)
    expect(n.ejecutar(borrar('borrar', 'cables', d.cables.c)).ok).toBe(true)
    // Sin cable, la sonda se muda al pin de su red en el mismo paso.
    expect(n.doc.sondas?.v).toMatchObject({ x: 4, y: 0 })
    n.deshacer()
    expect(texto(n)).toBe(antes)
    expect(n.historial.puedeDeshacer).toBe(false)
  })

  it('deshacer y rehacer vuelven al documento exacto', () => {
    const n = nuevoNucleo(documento([R1]))
    const inicio = texto(n)
    aplicarOk(n, { orden: 'colocar', tipo: 'resistencia', en: { x: 25, y: 0 } })
    aplicarOk(n, { orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '4k7' })
    const final = texto(n)
    expect(n.deshacer()).toBe(true)
    expect(n.deshacer()).toBe(true)
    expect(texto(n)).toBe(inicio)
    expect(n.rehacer()).toBe(true)
    expect(n.rehacer()).toBe(true)
    expect(texto(n)).toBe(final)
    expect(sinViolaciones(n)).toEqual([])
  })
})

describe('NucleoEdicion.editable', () => {
  it('dice el motivo del editor al simular y en solo lectura', () => {
    const n = nuevoNucleo(documento([R1]))
    expect(n.editable()).toBeNull()
    n.simulando = true
    expect(n.editable()).toBe(MENSAJE_SIMULANDO)
    expect(n.ejecutar(borrar('borrar', 'piezas', R1))).toEqual({ ok: false, motivo: MENSAJE_SIMULANDO })
    expect(n.aplicar({ orden: 'borrar', refs: ['R1'] })).toEqual({ ok: false, motivo: MENSAJE_SIMULANDO })
    n.simulando = false
    n.cargar(documento([R1]), { soloLectura: true })
    expect(n.editable()).toBe(MENSAJE_SOLO_LECTURA)
    expect(n.aplicar({ orden: 'deshacer' })).toEqual({ ok: false, motivo: MENSAJE_SOLO_LECTURA })
    expect(n.doc.piezas.r).toBeDefined()
  })

  it('recalcula las redes y el índice tras cada cambio', () => {
    const n = nuevoNucleo()
    aplicarOk(n, { orden: 'colocar', tipo: 'resistencia', en: { x: 0, y: 0 } })
    expect(n.con.redes.length).toBeGreaterThan(0)
    expect(n.indice.buscar({ minX: -10, minY: -10, maxX: 10, maxY: 10 }).length).toBe(1)
  })
})
