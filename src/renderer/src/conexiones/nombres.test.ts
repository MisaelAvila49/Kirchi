// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from './conexiones'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { claveDeNombre } from './nombres'

const lib = libreriaDePrueba().piezas
const terminal = (id: string, x: number, nombre: string): Pieza => ({ id, tipo: 'alimentacion', ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props: { nombre } })

describe('llave del nombre de una red', () => {
  it('el menos tipográfico (U+2212), la raya corta (U+2013) y el guion son el mismo signo', () => {
    expect(new Set(['−15V', '–15V', '-15V', ' -15V ']).size).toBe(4)
    expect(new Set(['−15V', '–15V', '-15V', ' -15V '].map(claveDeNombre)).size).toBe(1)
    expect(claveDeNombre('V−')).toBe(claveDeNombre('V-'))
  })

  it('un voltaje se escribe de una sola forma: «+15V», «15V», «+15 V» y «15v» son el mismo nombre', () => {
    expect(new Set(['+15V', '15V', '+15 V', '15v', '+15.0V'].map(claveDeNombre)).size).toBe(1)
    expect(claveDeNombre('+15V')).not.toBe(claveDeNombre('-15V'))
    expect(claveDeNombre('3.3V')).toBe(claveDeNombre('+3.3 v'))
  })

  it('lo demás se compara como siempre: sin espacios en los extremos y distinguiendo mayúsculas', () => {
    expect(claveDeNombre(' VCC ')).toBe('VCC')
    expect(claveDeNombre('vcc')).not.toBe(claveDeNombre('VCC'))
    expect(claveDeNombre('V CC')).not.toBe(claveDeNombre('VCC'))
  })
})

describe('redes por nombre', () => {
  it('«−15V» y «-15V» son la misma red, y «+15V» con «15 V» también; el texto que se ve es el que se escribió', () => {
    const d = documentoVacio()
    d.piezas.a = terminal('a', 0, '−15V')
    d.piezas.b = terminal('b', 20, '-15V')
    d.piezas.c = terminal('c', 40, '+15V')
    d.piezas.e = terminal('e', 60, '15 V')
    const con = calcularConexiones(d, lib)
    const red = (id: string) => con.redDePin.get(clavePin(id, '1'))
    expect(red('a')).toBe(red('b'))
    expect(red('c')).toBe(red('e'))
    expect(red('a')).not.toBe(red('c'))
    expect(['−15V', '-15V']).toContain(con.redes[red('a')!].nombre)
    expect(d.piezas.a.props.nombre).toBe('−15V')
  })

  it('una etiqueta de red «15V» se une al terminal «+15V»', () => {
    const d = documentoVacio()
    d.piezas.c = terminal('c', 0, '+15V')
    d.etiquetas.e = { id: 'e', nombre: '15V', x: 40, y: 0, rot: 0 }
    const con = calcularConexiones(d, lib)
    expect(con.redDeEtiqueta.get('e')).toBe(con.redDePin.get(clavePin('c', '1')))
  })
})
