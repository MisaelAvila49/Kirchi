// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../../conexiones/conexiones'
import { aplicarOk, documento, lib, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'
import { validarOrden } from '../ordenes'

const dosEnFila = () => documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 16, 0)])

describe('nombrar', () => {
  it('pone una etiqueta junto a la patilla y la red toma el nombre', () => {
    const n = nuevoNucleo(dosEnFila())
    aplicarOk(n, { orden: 'conectar', desde: 'R1.2', hasta: 'R2.1' })
    const r = n.aplicar({ orden: 'nombrar', punto: 'R2.2', nombre: 'SALIDA' })
    expect(r).toMatchObject({ ok: true })
    expect(Object.values(n.doc.etiquetas).map((e) => e.nombre)).toEqual(['SALIDA'])
    const con = calcularConexiones(n.doc, lib)
    expect(con.redes.find((x) => x.id === con.redDePin.get(clavePin('b', '2')))?.nombre).toBe('SALIDA')
    expect(sinViolaciones(n)).toEqual([])
  })

  it('es un solo paso de deshacer', () => {
    const n = nuevoNucleo(dosEnFila())
    const antes = texto(n)
    aplicarOk(n, { orden: 'nombrar', punto: 'R1.1', nombre: 'ENTRADA' })
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('nombrar de nuevo con el mismo nombre no cambia nada, con otro se rechaza', () => {
    const n = nuevoNucleo(dosEnFila())
    aplicarOk(n, { orden: 'nombrar', punto: 'R1.1', nombre: 'ENTRADA' })
    const unido = texto(n)
    expect(n.aplicar({ orden: 'nombrar', punto: 'R1.1', nombre: 'ENTRADA' })).toMatchObject({ ok: true, yaUnidas: true })
    expect(texto(n)).toBe(unido)
    expect(n.aplicar({ orden: 'nombrar', punto: 'R1.1', nombre: 'OTRO' })).toEqual({ ok: false, motivo: 'No se nombró R1.1: esa red ya se llama «ENTRADA».' })
  })

  it('no une dos redes: un nombre que ya es de otra se rechaza', () => {
    const n = nuevoNucleo(dosEnFila())
    aplicarOk(n, { orden: 'nombrar', punto: 'R1.1', nombre: 'ENTRADA' })
    const r = n.aplicar({ orden: 'nombrar', punto: 'R2.2', nombre: 'entrada' })
    expect(r.ok).toBe(true)
    // Las mayúsculas cuentan: «entrada» no es «ENTRADA».
    expect(new Set(Object.values(n.doc.etiquetas).map((e) => e.nombre))).toEqual(new Set(['ENTRADA', 'entrada']))
    expect(n.aplicar({ orden: 'nombrar', punto: 'R2.1', nombre: 'ENTRADA' })).toEqual({ ok: false, motivo: 'No se nombró R2.1: ya hay otra red llamada «ENTRADA»; para unirlas usa conectar.' })
  })

  it('rechaza una patilla que no existe y valida el nombre', () => {
    const n = nuevoNucleo(dosEnFila())
    expect(n.aplicar({ orden: 'nombrar', punto: 'R9.1', nombre: 'X' })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R9».' })
    expect(validarOrden({ orden: 'nombrar', punto: 'R1.1', nombre: '' })).toEqual({ ok: false, motivo: '«nombre» no puede estar vacío.' })
    expect(validarOrden({ orden: 'nombrar', punto: 'R1.1', nombre: 'x'.repeat(25) })).toMatchObject({ ok: false })
    expect(validarOrden({ orden: 'nombrar', punto: 'R1.1' })).toMatchObject({ ok: false })
  })

  it('va en un lote con claves y todo se deshace junto', () => {
    const n = nuevoNucleo()
    const antes = texto(n)
    aplicarOk(n, {
      orden: 'lote',
      ordenes: [
        { orden: 'colocar', tipo: 'resistencia', clave: 'r', en: { x: 0, y: 0 } },
        { orden: 'nombrar', punto: 'r.1', nombre: 'ENTRADA' }
      ]
    })
    expect(Object.values(n.doc.etiquetas).map((e) => e.nombre)).toEqual(['ENTRADA'])
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })
})
