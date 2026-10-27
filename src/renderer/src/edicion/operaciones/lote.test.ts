// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../../conexiones/conexiones'
import { documento, lib, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'
import type { Orden } from '../ordenes'

const rc = (): Orden[] => [
  { orden: 'colocar', tipo: 'fuente-dc', clave: 'v', en: { x: 0, y: 0 } },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r', en: { x: 25, y: -5 } },
  { orden: 'colocar', tipo: 'capacitor', clave: 'c', en: { x: 50, y: 0 } },
  { orden: 'colocar', tipo: 'tierra', clave: 'g', en: { x: 50, y: 15 } },
  { orden: 'conectar', desde: 'v.+', hasta: 'r.1' },
  { orden: 'conectar', desde: 'r.2', hasta: 'c.1' },
  { orden: 'conectar', desde: 'c.2', hasta: 'g.1' },
  { orden: 'conectar', desde: 'v.-', hasta: 'g.1' },
  { orden: 'propiedad', ref: 'r', prop: 'valor', valor: '10k' },
  { orden: 'propiedad', ref: 'c', prop: 'valor', valor: '100n' }
]

describe('lote', () => {
  it('arma un RC con claves en un solo paso de deshacer', () => {
    const n = nuevoNucleo()
    const antes = texto(n)
    const r = n.aplicar({ orden: 'lote', ordenes: rc() }, { nombre: 'Asistente: armar circuito' })
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(Object.keys(r.creados).sort()).toEqual(['C1', 'GND1', 'R1', 'V1'])
    const por = (ref: string) => Object.values(n.doc.piezas).find((p) => p.ref === ref)!
    expect(por('R1').props.valor).toBe('10k')
    expect(por('C1').props.valor).toBe('100n')
    const con = calcularConexiones(n.doc, lib)
    expect(con.redDePin.get(clavePin(por('V1').id, '-'))).toBe(con.redDePin.get(clavePin(por('GND1').id, '1')))
    expect(con.redDePin.get(clavePin(por('R1').id, '2'))).toBe(con.redDePin.get(clavePin(por('C1').id, '1')))
    expect(sinViolaciones(n)).toEqual([])
    expect(n.deshacer()).toBe(true)
    expect(texto(n)).toBe(antes)
    expect(n.deshacer()).toBe(false)
  })

  it('una orden que falla no deja nada y da su posición', () => {
    const n = nuevoNucleo()
    const ordenes = rc()
    ordenes[6] = { orden: 'colocar', tipo: 'flux' }
    const antes = texto(n)
    expect(n.aplicar({ orden: 'lote', ordenes })).toEqual({ ok: false, motivo: 'Orden 7: No existe el tipo de pieza «flux».', indice: 6 })
    expect(texto(n)).toBe(antes)
    expect(n.deshacer()).toBe(false)
  })

  it('rechaza una clave repetida y un lote dentro de un lote', () => {
    const n = nuevoNucleo()
    expect(n.aplicar({ orden: 'lote', ordenes: [{ orden: 'colocar', tipo: 'resistencia', clave: 'r' }, { orden: 'colocar', tipo: 'resistencia', clave: 'r' }] })).toMatchObject({ ok: false, indice: 1 })
    expect(n.aplicar({ orden: 'lote', ordenes: [{ orden: 'lote', ordenes: [] }] })).toMatchObject({ ok: false, indice: 0 })
  })

  it('respeta el tope de 1,024 piezas', () => {
    const piezas = Array.from({ length: 1022 }, (_, i) => pieza(`p${i}`, 'resistencia', `R${i + 1}`, (i % 40) * 12, Math.floor(i / 40) * 8))
    const n = nuevoNucleo(documento(piezas))
    const tres: Orden[] = [1, 2, 3].map(() => ({ orden: 'colocar', tipo: 'tierra' }))
    const r = n.aplicar({ orden: 'lote', ordenes: tres })
    expect(r).toEqual({ ok: false, motivo: 'El lote dejaría más de 1,024 piezas.', indice: 2 })
    expect(Object.keys(n.doc.piezas).length).toBe(1022)
  })
})
