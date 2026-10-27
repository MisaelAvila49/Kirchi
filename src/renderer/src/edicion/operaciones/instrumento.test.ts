// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../../conexiones/conexiones'
import { MOTIVO_SONDA_DE_CORRIENTE } from '../../editor/sondas'
import { divisor } from '../../prueba/circuitos'
import { lib, nuevoNucleo, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

const sondas = (n: ReturnType<typeof nuevoNucleo>) => Object.values(n.doc.sondas ?? {})

describe('instrumento', () => {
  it('medir la salida del divisor con un multímetro nuevo deja la pieza, la sonda en + y la tierra en COM', () => {
    const n = nuevoNucleo(divisor())
    const r = n.aplicar({ orden: 'instrumento', tipo: 'multimetro', medir: { punto: 'R1.2' } })
    expect(r).toMatchObject({ ok: true })
    const mm = Object.values(n.doc.piezas).find((p) => p.tipo === 'multimetro')!
    const [s] = sondas(n)
    expect(s).toMatchObject({ tipo: 'multimetro', instrumento: mm.id, entrada: '+' })
    const con = calcularConexiones(n.doc, lib)
    expect(con.redDeSonda.get(s.id)).toBe(con.redDePin.get(clavePin('p_r1', '2')))
    expect(con.redes.find((r) => r.id === con.redDePin.get(clavePin(mm.id, 'COM')))?.tierra).toBe(true)
    const tierras = Object.values(n.doc.piezas).filter((p) => p.tipo === 'tierra')
    expect(tierras.length).toBe(2)
    expect(sinViolaciones(n)).toEqual([])
    n.deshacer()
    expect(Object.values(n.doc.piezas).some((p) => p.tipo === 'multimetro')).toBe(false)
  })

  it('aplica los ajustes al instrumento nuevo en el mismo paso', () => {
    const n = nuevoNucleo(divisor())
    expect(n.aplicar({ orden: 'instrumento', tipo: 'multimetro', ajustes: { modo: 'V AC' }, medir: { punto: 'R1.2' } })).toMatchObject({ ok: true })
    expect(Object.values(n.doc.piezas).find((p) => p.tipo === 'multimetro')!.props.modo).toBe('V AC')
    expect(n.aplicar({ orden: 'instrumento', tipo: 'multimetro', ajustes: { modo: 'xx' }, medir: { punto: 'R2.1' } })).toMatchObject({ ok: false })
  })

  it('el osciloscopio toma el canal A y un canal que ya mide otra red se rechaza', () => {
    const n = nuevoNucleo(divisor())
    expect(n.aplicar({ orden: 'instrumento', tipo: 'osciloscopio', medir: { punto: 'R1.2' } })).toMatchObject({ ok: true })
    const osc = Object.values(n.doc.piezas).find((p) => p.tipo === 'osciloscopio')!
    expect(sondas(n)[0]).toMatchObject({ entrada: 'A', instrumento: osc.id })
    const antes = texto(n)
    const r = n.aplicar({ orden: 'instrumento', tipo: 'osciloscopio', ref: osc.ref, medir: { punto: 'V1.+', canal: 'A' } })
    expect(r).toEqual({ ok: false, motivo: `No se puso la sonda: la entrada A de ${osc.ref} ya mide otra red.` })
    expect(texto(n)).toBe(antes)
    expect(n.aplicar({ orden: 'instrumento', tipo: 'osciloscopio', ref: osc.ref, medir: { punto: 'V1.+', canal: 'B' } })).toMatchObject({ ok: true })
    expect(sondas(n).map((s) => s.entrada).sort()).toEqual(['A', 'B'])
  })

  it('sin medir coloca el instrumento como una pieza', () => {
    const n = nuevoNucleo()
    expect(n.aplicar({ orden: 'instrumento', tipo: 'osciloscopio', ref: 'OSC1' })).toMatchObject({ ok: true, creados: { OSC1: expect.any(String) } })
    expect(n.aplicar({ orden: 'instrumento', tipo: 'medidor' })).toEqual({ ok: false, motivo: 'Un medidor rápido se pone sobre algo: falta «medir».' })
  })

  it('el medidor rápido toma su referencia y la magnitud pedida', () => {
    const n = nuevoNucleo(divisor())
    const r = n.aplicar({ orden: 'instrumento', tipo: 'medidor', medir: { punto: 'R1.2' } })
    expect(r).toMatchObject({ ok: true, creados: { M1: expect.any(String) } })
    expect(sondas(n)[0]).toMatchObject({ tipo: 'medidor', magnitud: 'voltaje', modo: 'dc' })
  })
})

describe('sonda', () => {
  it('pone una sonda de voltaje en una patilla y no repite en el mismo punto', () => {
    const n = nuevoNucleo(divisor())
    expect(n.aplicar({ orden: 'sonda', tipo: 'voltaje', punto: 'R1.2' })).toMatchObject({ ok: true })
    expect(sondas(n)[0]).toMatchObject({ tipo: 'voltaje', x: 14, y: -8 })
    expect(n.aplicar({ orden: 'sonda', tipo: 'voltaje', punto: 'R1.2' })).toEqual({ ok: false, motivo: 'No se puso la sonda: Ya hay una sonda de voltaje en ese punto.' })
  })

  it('la sonda de corriente va en un tramo recto de cable y no en una patilla suelta', () => {
    const n = nuevoNucleo(divisor())
    expect(n.aplicar({ orden: 'sonda', tipo: 'corriente', punto: 'V1.+' })).toMatchObject({ ok: true })
    expect(sondas(n)[0].tipo).toBe('corriente')
    const vacio = nuevoNucleo(divisor())
    vacio.aplicar({ orden: 'colocar', tipo: 'resistencia', en: { x: 200, y: 200 } })
    expect(vacio.aplicar({ orden: 'sonda', tipo: 'corriente', punto: 'R3.1' })).toEqual({ ok: false, motivo: `No se puso la sonda: ${MOTIVO_SONDA_DE_CORRIENTE}` })
  })

  it('la terminal COM de un multímetro que ya está recibe su sonda', () => {
    const n = nuevoNucleo(divisor())
    n.aplicar({ orden: 'instrumento', tipo: 'multimetro', medir: { punto: 'R1.2' } })
    const mm = Object.values(n.doc.piezas).find((p) => p.tipo === 'multimetro')!
    expect(n.aplicar({ orden: 'sonda', tipo: 'multimetro', punto: 'R1.2', instrumento: mm.ref, entrada: 'COM' })).toMatchObject({ ok: false })
    expect(n.aplicar({ orden: 'sonda', tipo: 'multimetro', punto: 'R1.1', instrumento: 'XMM9' })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «XMM9».' })
  })
})
