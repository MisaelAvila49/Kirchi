import { describe, expect, it } from 'vitest'
import type { FilaDatos, PiezaDef } from './tipos'
import { validarPieza } from './validar'
import { filaDe } from './validarDatos'

const LISTA = ['2N3904', 'BC547']
const fila3 = (extra: Partial<FilaDatos> = {}): FilaDatos => ({ presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '3' } }], ...extra })
const base = {
  id: 'npn',
  nombre: { es: 'NPN', en: 'NPN' },
  categoria: 'semiconductores',
  prefijo: 'Q',
  buscar: ['q'],
  pines: [
    { id: 'C', nombre: 'C', x: 2, y: -4 },
    { id: 'B', nombre: 'B', x: -4, y: 0 },
    { id: 'E', nombre: 'E', x: 2, y: 4 }
  ],
  props: [{ id: 'modelo', nombre: 'Modelo', defecto: '2N3904', opciones: LISTA }]
}
const con = (datos: unknown, extra: Record<string, unknown> = {}) => ({ ...base, ...extra, datos })
const errores = (o: unknown) => {
  const v = validarPieza(JSON.stringify(o), 'x/pieza.json')
  return v.ok ? [] : v.errores
}
const una = (datos: unknown, extra?: Record<string, unknown>) => errores(con(datos, extra))
const valida = { por: 'modelo', valores: { '2N3904': fila3(), BC547: fila3() } }
const pres0 = fila3().presentaciones![0]

describe('validarDatos', () => {
  it('acepta datos completos y los copia a la definición', () => {
    const v = validarPieza(JSON.stringify(con(valida)), 'x/pieza.json')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.def.datos).toEqual(valida)
  })

  it('una pieza sin datos sigue cargando', () => {
    expect(errores(base)).toEqual([])
  })

  it('rechaza un por que no es propiedad de lista', () => {
    expect(una({ por: 'inexistente', valores: { '2N3904': fila3() } })).toEqual(['x/pieza.json: datos.por debe ser una propiedad de lista de la pieza (o dos)'])
  })

  it('rechaza una clave de valores que no es opción', () => {
    expect(una({ por: 'modelo', valores: { BC999: fila3() } })).toEqual(['x/pieza.json: datos.valores.BC999 no es una opción de modelo'])
  })

  it('sin por, la única fila va en «*»', () => {
    expect(una({ valores: { '*': fila3() } })).toEqual([])
    expect(una({ valores: { '2N3904': fila3() } })).toEqual(['x/pieza.json: datos.valores.2N3904 sin «por», la única fila va en la llave «*»'])
  })

  it('una fila virtual no lleva presentaciones, parte ni hoja', () => {
    const e = una({ valores: { '*': { virtual: true, presentaciones: fila3().presentaciones, parte: 'X', hoja: 'https://a.com/x.pdf' } } })
    expect(e).toEqual([
      'x/pieza.json: datos.valores.*.presentaciones una pieza virtual no lo lleva',
      'x/pieza.json: datos.valores.*.parte una pieza virtual no lo lleva',
      'x/pieza.json: datos.valores.*.hoja una pieza virtual no lo lleva'
    ])
    expect(una({ valores: { '*': { virtual: true } } })).toEqual([])
  })

  it('una patilla física repetida se rechaza', () => {
    const f = fila3({ presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '1', C: '3' } }] })
    expect(una({ valores: { '*': f } })[0]).toBe('x/pieza.json: datos.valores.*.presentaciones[0] usa el pin 1 más de una vez')
  })

  it('un encapsulado numerado debe cubrir de 1 a N', () => {
    const pines = [1, 2, 3, 4, 6, 7].map((k) => ({ id: `P${k}`, nombre: `P${k}`, x: 0, y: 0 }))
    const f = { presentaciones: [{ encapsulado: 'DIP-8', patillas: Object.fromEntries(pines.map((p, i) => [p.id, ['1', '2', '3', '4', '6', '7'][i]])) }] }
    expect(una({ valores: { '*': f } }, { pines })).toEqual(['x/pieza.json: datos.valores.*.presentaciones[0] DIP-8 tiene 8 pines, faltan el 5 y el 8'])
  })

  it('una patilla fuera del rango del encapsulado se rechaza', () => {
    const f = fila3({ presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '4' } }] })
    expect(una({ valores: { '*': f } })[0]).toBe('x/pieza.json: datos.valores.*.presentaciones[0] TO-92 no tiene el pin 4 (va de 1 a 3)')
  })

  it('pendiente.patillas excusa los pines y las patillas sin cubrir', () => {
    const f = fila3({ presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1' } }], pendiente: { patillas: 'las hojas discrepan' } })
    expect(una({ valores: { '*': f } })).toEqual([])
  })

  it('un pin sin patilla o ajeno a la pieza se rechaza', () => {
    const f = fila3({ presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', X: '3' } }] })
    expect(una({ valores: { '*': f } })).toEqual([
      'x/pieza.json: datos.valores.* presentaciones[0].patillas.X no es un pin de la pieza',
      'x/pieza.json: datos.valores.* presentaciones[0].patillas no cubre el pin C'
    ])
  })

  it('las unidades mapean los mismos pines y la primera coincide con patillas', () => {
    const pines = ['O1', 'I1', 'V'].map((id) => ({ id, nombre: id, x: 0, y: 0 }))
    const unidades = [
      { nombre: 'A', patillas: { O1: '1', I1: '2' } },
      { nombre: 'B', patillas: { O1: '7', I1: '6' } }
    ]
    const dp = (u: unknown) => ({ valores: { '*': { presentaciones: [{ encapsulado: 'DIP-8', patillas: { O1: '1', I1: '2', V: '4' }, alimentacion: { VCC: '8' }, sinModelo: { '3': 'NC', '5': 'NC' }, unidades: u }] } } })
    expect(una(dp(unidades), { pines })).toEqual([])
    const desiguales = [unidades[0], { nombre: 'B', patillas: { O1: '7' } }]
    expect(una(dp(desiguales), { pines })).toContain('x/pieza.json: datos.valores.*.presentaciones[0].unidades[1].patillas debe mapear los mismos pines que la primera unidad')
    const distinta = [{ nombre: 'A', patillas: { O1: '3', I1: '2' } }, unidades[1]]
    expect(una(dp(distinta), { pines })).toContain('x/pieza.json: datos.valores.*.presentaciones[0].unidades[0].patillas.O1 la primera unidad debe coincidir con «patillas»')
  })

  it('la huella y el id de KiCad llevan la forma Biblioteca:Nombre', () => {
    expect(una({ valores: { '*': fila3({ presentaciones: [{ ...pres0, huella: 'TO-92' }] }) } })).toEqual(['x/pieza.json: datos.valores.*.presentaciones[0].huella debe ser un id de KiCad «Biblioteca:Nombre»'])
    expect(una({ equivalencias: { kicad: 'Device:Q_NPN_EBC' }, valores: { '*': fila3() } })).toEqual([])
    expect(una({ equivalencias: { kicad: 'Q_NPN' }, valores: { '*': fila3() } })).toEqual(['x/pieza.json: datos.equivalencias.kicad debe ser un id de KiCad «Biblioteca:Nombre»'])
  })

  it('la hoja debe ser https', () => {
    expect(una({ valores: { '*': fila3({ hoja: 'http://a.com/x.pdf' }) } })).toEqual(['x/pieza.json: datos.valores.*.hoja debe ser un enlace https del fabricante'])
    expect(una({ valores: { '*': fila3({ hoja: 'https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf' }) } })).toEqual([])
  })

  it('un LCSC lleva fecha o marca, no ninguna ni las dos', () => {
    const lcsc = (l: unknown) => una({ valores: { '*': fila3({ presentaciones: [{ ...pres0, lcsc: l as never }] }) } })
    expect(lcsc({ numero: 'C2150', comprobado: '2026-10-28' })).toEqual([])
    expect(lcsc({ numero: 'C2150', sinVerificar: true })).toEqual([])
    expect(lcsc({ numero: 'C2150' })).toEqual(['x/pieza.json: datos.valores.*.presentaciones[0].lcsc lleva exactamente uno de «comprobado» (fecha) o «sinVerificar»: true'])
    expect(lcsc({ numero: 'C2150', comprobado: '2026-10-28', sinVerificar: true })).toHaveLength(1)
    expect(lcsc({ numero: '2150', comprobado: '2026-10-28' })).toEqual(['x/pieza.json: datos.valores.*.presentaciones[0].lcsc.numero debe ser un número de LCSC como «C2150»'])
  })

  it('una equivalencia con formato desconocido sugiere el parecido', () => {
    expect(una({ equivalencias: { kicat: 'Device:R' }, valores: { '*': fila3() } })).toEqual(['x/pieza.json: datos.equivalencias.kicat clave desconocida en las equivalencias, ¿quisiste decir «kicad»?'])
  })

  it('una errata en la fila o en la presentación sugiere la clave', () => {
    expect(una({ valores: { '*': { ...fila3(), fabrcante: 'onsemi' } } })).toEqual(['x/pieza.json: datos.valores.*.fabrcante clave desconocida en una fila de datos, ¿quisiste decir «fabricante»?'])
    expect(una({ valores: { '*': fila3({ presentaciones: [{ ...pres0, encapsulad: 'TO-92' } as never] }) } })[0]).toMatch(/encapsulad clave desconocida en una presentación, ¿quisiste decir «encapsulado»\?/)
  })

  it('un encapsulado fuera del catálogo se rechaza con sugerencia', () => {
    expect(una({ valores: { '*': fila3({ presentaciones: [{ encapsulado: 'TO92', patillas: { E: '1', B: '2', C: '3' } }] }) } })[0]).toMatch(/«TO92» no está en componentes\/encapsulados.json, ¿quisiste decir «TO-92»\?/)
  })

  it('el arte de protoboard tiene la forma protoboard-nombre.svg', () => {
    const pb = (b: unknown) => una({ valores: { '*': fila3({ presentaciones: [{ ...pres0, protoboard: b as never }] }) } })
    expect(pb({ arte: 'protoboard-to92.svg', separacion: 3 })).toEqual([])
    expect(pb({ arte: 'to92.svg' })).toHaveLength(1)
  })
})

describe('filaDe', () => {
  const def = (datos: object, props: object[]) => ({ ...base, props, datos }) as unknown as PiezaDef
  const filaA = fila3({ parte: 'A' })
  const filaB = fila3({ parte: 'B' })

  it('elige la fila por una propiedad, con su valor por omisión si falta', () => {
    const d = def({ por: 'modelo', valores: { '2N3904': filaA, BC547: filaB } }, base.props)
    expect(filaDe(d, { modelo: 'BC547' })).toEqual({ clave: 'BC547', fila: filaB })
    expect(filaDe(d, {})!.clave).toBe('2N3904')
  })

  it('une dos propiedades con «|» y usa «*» sin por', () => {
    const props = [{ id: 'familia', nombre: 'F', defecto: '74HC', opciones: ['74HC'] }, { id: 'entradas', nombre: 'E', defecto: '3', opciones: ['2', '3'] }]
    expect(filaDe(def({ por: ['familia', 'entradas'], valores: { '74HC|3': filaA } }, props), {})!.clave).toBe('74HC|3')
    expect(filaDe(def({ valores: { '*': filaA } }, []), {})).toEqual({ clave: '*', fila: filaA })
  })

  it('devuelve null sin datos o sin fila para la combinación', () => {
    expect(filaDe({ ...base, datos: undefined } as unknown as PiezaDef, {})).toBeNull()
    expect(filaDe(def({ por: 'modelo', valores: { BC547: filaB } }, base.props), { modelo: '2N3904' })).toBeNull()
  })
})
