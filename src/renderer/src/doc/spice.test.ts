// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { leerSpice, spiceDeTexto, textoDeSpice } from './spice'

describe('modelo Personalizado: el texto del campo', () => {
  it('lee «nombre = valor» con notación científica y de ingeniería, sin importar mayúsculas', () => {
    const r = spiceDeTexto('BF = 200\nis = 1.434e-14\ncje 10p', 'bjt')
    expect(r).toEqual({ ok: true, spice: { bf: 200, is: 1.434e-14, cje: 10e-12 } })
  })
  it('vacío quita el modelo propio', () => {
    expect(spiceDeTexto('  \n', 'bjt')).toEqual({ ok: true, spice: null })
  })
  it('dice el renglón de un nombre que el motor no lee, de un valor que no es número y de uno fuera de rango', () => {
    expect(spiceDeTexto('bf = 200\nBf = 5', 'bjt')).toMatchObject({ ok: false, error: 'Renglón 2: «bf» está repetido.' })
    expect(spiceDeTexto('xyz = 1', 'bjt')).toMatchObject({ ok: false, error: expect.stringContaining('Renglón 1 («xyz»): parámetro desconocido') })
    expect(spiceDeTexto('bf = mucho', 'bjt')).toEqual({ ok: false, error: 'Renglón 1: «mucho» no es un número.' })
    expect(spiceDeTexto('bf = -4', 'bjt')).toMatchObject({ ok: false, error: expect.stringContaining('Renglón 1 («bf»)') })
    expect(spiceDeTexto('bf', 'bjt')).toMatchObject({ ok: false, error: expect.stringContaining('Renglón 1') })
  })
  it('cada familia tiene sus nombres: vto es de un MOSFET y gbw de un amplificador', () => {
    expect(spiceDeTexto('vto = 3', 'mosfet')).toEqual({ ok: true, spice: { vto: 3 } })
    expect(spiceDeTexto('vto = 3', 'bjt').ok).toBe(false)
    expect(spiceDeTexto('gbw = 1M\nsr = 0.5e6', 'ampop')).toEqual({ ok: true, spice: { gbw: 1e6, sr: 0.5e6 } })
  })
  it('el texto de un juego sigue el orden de ngspice y vuelve a leerse igual', () => {
    const spice = { cje: 10e-12, bf: 200, is: 1e-14 }
    const t = textoDeSpice(spice, 'bjt')
    expect(t).toBe('is = 1e-14\nbf = 200\ncje = 1e-11')
    expect(spiceDeTexto(t, 'bjt')).toEqual({ ok: true, spice })
  })
})

describe('modelo Personalizado: lo que trae un .kir', () => {
  it('conserva los parámetros conocidos y descarta el resto contando lo descartado', () => {
    expect(leerSpice({ bf: 100, is: 1e-14, nada: 3, vto: 'x' }, 'bjt')).toEqual({ spice: { bf: 100, is: 1e-14 }, descartados: 2 })
  })
  it('algo que no es un objeto se descarta entero y un __proto__ no llega a ningún prototipo', () => {
    expect(leerSpice(5, 'bjt')).toEqual({ spice: null, descartados: -1 })
    expect(leerSpice([1], 'bjt')).toEqual({ spice: null, descartados: -1 })
    const r = leerSpice(JSON.parse('{"__proto__": 3, "bf": 80}'), 'bjt')
    expect(r.spice).toEqual({ bf: 80 })
    expect(Object.getPrototypeOf(r.spice)).toBe(Object.prototype)
  })
})
