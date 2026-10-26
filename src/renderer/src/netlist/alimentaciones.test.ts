// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar } from '../doc/comandos'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { idSecuencial } from '../doc/ids'
import { libreriaDePrueba } from '../prueba/libreria'
import { cambioDeRiel, rielDeTerminal, rielesUsados, voltajeDeNombre, voltajeDeRiel } from './alimentaciones'

const lib = libreriaDePrueba().piezas
const def = lib.get('alimentacion')!
const terminal = (id: string, nombre?: string): Pieza => ({ id, tipo: 'alimentacion', ref: id.toUpperCase(), x: 0, y: 0, rot: 0, espejo: false, props: nombre === undefined ? {} : { nombre } })
const con = (...ps: Pieza[]): Documento => {
  const d = documentoVacio()
  for (const p of ps) d.piezas[p.id] = p
  return d
}

describe('voltaje en el nombre', () => {
  it('lee «+15V», «-15V», «−15V», «+5V», «3.3V», «12V», con signo opcional, punto decimal y menos ASCII o U+2212', () => {
    expect(voltajeDeNombre('+15V')).toBe(15)
    expect(voltajeDeNombre('-15V')).toBe(-15)
    expect(voltajeDeNombre('−15V')).toBe(-15)
    expect(voltajeDeNombre('+5V')).toBe(5)
    expect(voltajeDeNombre('3.3V')).toBe(3.3)
    expect(voltajeDeNombre('12V')).toBe(12)
    expect(voltajeDeNombre(' +12 V ')).toBe(12)
    expect(voltajeDeNombre('0V')).toBe(0)
    expect(Object.is(voltajeDeNombre('-0V'), 0)).toBe(true)
  })

  it('un número que no cabe en un voltaje finito no es un voltaje', () => {
    expect(voltajeDeNombre('1'.repeat(310) + 'V')).toBeNull()
    expect(voltajeDeNombre('-' + '9'.repeat(320) + 'V')).toBeNull()
  })

  it('un nombre de riel no es un voltaje', () => {
    for (const n of ['VCC', 'VDD', 'VEE', 'V+', '5', '+15', 'V5', '15VCC', '3V3', '1.2.3V', '', 'kV', '+-5V']) expect(voltajeDeNombre(n), n).toBeNull()
  })
})

describe('voltaje de un riel', () => {
  it('por omisión VCC y VDD dan 5 V, VEE −5 V y cualquier otro nombre 5 V', () => {
    const d = documentoVacio()
    expect(voltajeDeRiel(d, 'VCC')).toMatchObject({ texto: '5', valor: 5, deNombre: false, guardado: false })
    expect(voltajeDeRiel(d, 'VDD')).toMatchObject({ texto: '5', valor: 5 })
    expect(voltajeDeRiel(d, 'VEE')).toMatchObject({ texto: '-5', valor: -5 })
    expect(voltajeDeRiel(d, 'V+')).toMatchObject({ texto: '5', valor: 5 })
  })

  it('el nombre con voltaje manda y no se guarda', () => {
    expect(voltajeDeRiel(documentoVacio(), '−15V')).toMatchObject({ valor: -15, deNombre: true, guardado: false })
  })

  it('la tabla del documento cambia el de omisión', () => {
    const d = documentoVacio()
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '15' } }
    expect(voltajeDeRiel(d, 'VCC')).toMatchObject({ texto: '15', valor: 15, guardado: true })
    expect(voltajeDeRiel(d, 'VDD')).toMatchObject({ valor: 5, guardado: false })
  })

  it('el riel de un terminal sale de su nombre (VCC si no tiene)', () => {
    const d = con(terminal('t1'), terminal('t2', '+12V'), terminal('t3', 'VEE'))
    expect(rielDeTerminal(d, d.piezas.t1, def)).toMatchObject({ nombre: 'VCC', valor: 5 })
    expect(rielDeTerminal(d, d.piezas.t2, def)).toMatchObject({ nombre: '+12V', valor: 12, deNombre: true })
    expect(rielDeTerminal(d, d.piezas.t3, def)).toMatchObject({ nombre: 'VEE', valor: -5 })
    expect(rielDeTerminal(d, { ...d.piezas.t1, tipo: 'resistencia' }, lib.get('resistencia')!)).toBeNull()
  })
})

describe('cambiar un riel', () => {
  const gen = idSecuencial()
  it('un voltaje distinto del de omisión se guarda en la tabla; volver al de omisión lo quita', () => {
    let d = con(terminal('t1', 'VCC'), terminal('t2', 'VCC'))
    const c = cambioDeRiel(d, 'VCC', '15', gen)
    if (!c || 'error' in c) throw new Error(JSON.stringify(c))
    d = aplicar(d, c)
    expect(Object.values(d.alimentaciones!)).toEqual([{ id: expect.any(String), nombre: 'VCC', voltaje: '15' }])
    expect(voltajeDeRiel(d, 'VCC').valor).toBe(15)
    const c2 = cambioDeRiel(d, 'VCC', '12 V', gen)
    if (!c2 || 'error' in c2) throw new Error(JSON.stringify(c2))
    d = aplicar(d, c2)
    expect(Object.values(d.alimentaciones!).map((a) => a.voltaje)).toEqual(['12 V'])
    const c3 = cambioDeRiel(d, 'VCC', '5', gen)
    if (!c3 || 'error' in c3) throw new Error(JSON.stringify(c3))
    d = aplicar(d, c3)
    expect(d.alimentaciones).toEqual({})
  })

  it('el mismo voltaje no deja paso, y se valida como cualquier valor en V', () => {
    const d = documentoVacio()
    expect(cambioDeRiel(d, 'VCC', '5', gen)).toBeNull()
    expect(cambioDeRiel(d, 'VEE', '−5', gen)).toBeNull()
    expect(cambioDeRiel(d, 'VCC', 'mucho', gen)).toEqual({ error: '«mucho» no es un valor válido.' })
    expect(cambioDeRiel(d, 'VCC', '5 A', gen)).toEqual({ error: 'Se esperaba un valor en V.' })
    expect(cambioDeRiel(d, '+15V', '12', gen)).toEqual({ error: 'El voltaje sale del nombre.' })
  })

  it('un voltaje escrito que no es finito no es válido, y uno de la tabla que no lo es no se lee', () => {
    const enorme = '1' + '0'.repeat(400)
    expect(cambioDeRiel(documentoVacio(), 'VCC', enorme, gen)).toEqual({ error: `«${enorme}» no es un valor válido.` })
    const d = documentoVacio()
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: enorme } }
    expect(voltajeDeRiel(d, 'VCC').valor).toBeNull()
  })

  it('acepta el menos U+2212 y lo guarda como guion', () => {
    const c = cambioDeRiel(documentoVacio(), 'VCC', '−12', gen)
    if (!c || 'error' in c) throw new Error(JSON.stringify(c))
    expect(c.cambios[0].despues).toMatchObject({ nombre: 'VCC', voltaje: '-12' })
  })
})

describe('rieles por la llave del nombre', () => {
  it('«V−» y «V-» son el mismo riel: comparten el voltaje de la tabla y una fila', () => {
    const d = con(terminal('t1', 'V−'), terminal('t2', 'V-'), terminal('t3', '+15V'), terminal('t4', '15 V'))
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'V-', voltaje: '-9' } }
    expect(voltajeDeRiel(d, 'V−').valor).toBe(-9)
    expect(rielesUsados(d, lib).map((r) => [r.nombre, r.terminales.length])).toEqual([['V−', 2], ['+15V', 2]])
    const gen = idSecuencial()
    const c = cambioDeRiel(d, 'V−', '-12', gen)
    if (!c || 'error' in c) throw new Error(JSON.stringify(c))
    expect(c.cambios).toEqual([{ col: 'alimentaciones', id: 'a_1', antes: d.alimentaciones.a_1, despues: { id: 'a_1', nombre: 'V-', voltaje: '-12' } }])
  })
})

describe('rieles usados', () => {
  it('cada nombre con su voltaje y cuántos terminales lo usan; primero los rieles, luego los nombres con voltaje de mayor a menor', () => {
    const d = con(terminal('t1', 'VEE'), terminal('t2', 'VCC'), terminal('t3', '+15V'), terminal('t4', 'VCC'), terminal('t5', '-15V'), terminal('t6', 'AVCC'))
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '12' }, a_2: { id: 'a_2', nombre: 'SIN', voltaje: '9' } }
    expect(rielesUsados(d, lib).map((r) => [r.nombre, r.texto, r.deNombre, r.terminales.length])).toEqual([
      ['AVCC', '5', false, 1],
      ['VCC', '12', false, 2],
      ['VEE', '-5', false, 1],
      ['+15V', '15', true, 1],
      ['-15V', '-15', true, 1]
    ])
  })
})
