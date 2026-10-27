import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import type { DatosPieza, PiezaDef } from '../piezas/tipos'
import { TEXTO_DATOS_IMPLICITA, TEXTO_DATOS_SIN_FILA, TEXTO_DATOS_SIN_SIMULAR, TEXTO_DATOS_VIRTUAL, vistaDatos } from './vistaInspector'

const pin = (id: string, nombre = id) => ({ id, nombre, x: 0, y: 0 })
const def = (datos: DatosPieza | undefined, props: PiezaDef['props'] = [], pines = ['E', 'B', 'C']): PiezaDef => ({ id: 'x', nombre: { es: 'X', en: 'X' }, categoria: 'semiconductores', pines: pines.map((p) => pin(p)), props, ...(datos ? { datos } : {}) }) as unknown as PiezaDef
const pieza = (props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo: 'x', ref: 'Q1', x: 0, y: 0, rot: 0, espejo: false, props })
const modelo = { id: 'modelo', nombre: 'Modelo', opciones: ['2N3904', '2N2222'], defecto: '2N3904' } as unknown as PiezaDef['props'][number]

const npn: DatosPieza = {
  por: 'modelo',
  valores: {
    '2N3904': {
      fabricante: 'onsemi',
      parte: '2N3904BU',
      hoja: 'https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf',
      presentaciones: [{ encapsulado: 'TO-92', patillas: { C: '3', E: '1', B: '2' }, lcsc: { numero: 'C124482', sinVerificar: true } }]
    },
    '2N2222': { aproximada: 'El chip real tiene más ganancia que el modelo.', pendiente: { lcsc: 'depende del proveedor' }, presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '3' } }] }
  }
}

describe('vistaDatos', () => {
  it('una pieza sin datos no muestra la sección', () => {
    expect(vistaDatos(def(undefined), pieza())).toEqual({ tipo: 'ninguno' })
  })

  it('elige la fila por el modelo (el de omisión si falta) y ordena las patillas por número', () => {
    const v = vistaDatos(def(npn, [modelo]), pieza())
    if (v.tipo !== 'fisica') throw new Error(v.tipo)
    expect(v.encapsulado).toBe('TO-92')
    expect(v.montaje).toBe('orificio pasante')
    expect(v.parte).toBe('2N3904BU')
    expect(v.fabricante).toBe('onsemi')
    expect(v.patillas.map((p) => [p.numero, p.nombre])).toEqual([['1', 'E'], ['2', 'B'], ['3', 'C']])
    expect(v.hoja).toBe('https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf')
    expect(v.huella).toBeTruthy()
  })

  it('LCSC sin comprobar lleva la marca «sin verificar» y el comprobado lleva su fecha', () => {
    const sin = vistaDatos(def(npn, [modelo]), pieza())
    expect(sin.tipo === 'fisica' && sin.lcsc).toEqual({ numero: 'C124482', sinVerificar: true })
    const datos: DatosPieza = { valores: { '*': { presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '3' }, lcsc: { numero: 'C1', comprobado: '2026-10-28' } }] } } }
    const con = vistaDatos(def(datos), pieza())
    expect(con.tipo === 'fisica' && con.lcsc).toEqual({ numero: 'C1', fecha: 'comprobado el 28 oct 2026', sinVerificar: false })
  })

  it('«aproximada» y «pendiente» son una línea cada una', () => {
    const v = vistaDatos(def(npn, [modelo]), pieza({ modelo: '2N2222' }))
    expect(v.tipo === 'fisica' && v.avisos).toEqual(['El chip real tiene más ganancia que el modelo.', 'Sin dato de LCSC: depende del proveedor.'])
  })

  it('una fila virtual dice que no hay versión física', () => {
    const v = vistaDatos(def({ valores: { '*': { virtual: true } } }), pieza())
    expect(v).toEqual({ tipo: 'virtual' })
    expect(TEXTO_DATOS_VIRTUAL).toBe('Pieza ideal: no tiene una versión física.')
  })

  it('sin fila para la combinación elegida, lo dice', () => {
    const datos: DatosPieza = { por: 'modelo', valores: { '2N2222': { virtual: true } } }
    expect(vistaDatos(def(datos, [modelo]), pieza())).toEqual({ tipo: 'sinFila' })
    expect(TEXTO_DATOS_SIN_FILA).toBe('No hay un integrado comercial con esta combinación.')
  })

  it('la alimentación implícita y las patillas sin modelo van en gris, entre las demás y en orden de número', () => {
    const datos: DatosPieza = {
      valores: { '*': { presentaciones: [{ encapsulado: 'DIP-14', patillas: { A: '1', B: '2', Y: '3' }, alimentacion: { GND: '7', VCC: '14' }, sinModelo: { '10': 'NC' }, unidades: [{ nombre: 'A', patillas: { A: '1', B: '2', Y: '3' } }, { nombre: 'B', patillas: { A: '4', B: '5', Y: '6' } }] }] } }
    }
    const v = vistaDatos(def(datos, [], ['A', 'B', 'Y']), pieza())
    if (v.tipo !== 'fisica') throw new Error(v.tipo)
    expect(v.patillas.map((p) => p.numero)).toEqual(['1', '2', '3', '7', '10', '14'])
    expect(v.patillas.filter((p) => p.atenuada).map((p) => [p.numero, p.nombre, p.nota])).toEqual([['7', 'GND', TEXTO_DATOS_IMPLICITA], ['10', 'NC', TEXTO_DATOS_SIN_SIMULAR], ['14', 'VCC', TEXTO_DATOS_IMPLICITA]])
    expect(v.unidades).toBe('2 unidades en el encapsulado (A y B)')
  })

  it('un pin a varias patillas las junta', () => {
    const datos: DatosPieza = { valores: { '*': { presentaciones: [{ encapsulado: 'TO-92', patillas: { E: ['1', '4'], B: '2', C: '3' } }] } } }
    const v = vistaDatos(def(datos), pieza())
    expect(v.tipo === 'fisica' && v.patillas.find((p) => p.nombre === 'E')?.numero).toBe('1, 4')
  })

  it('la presentación típica se marca', () => {
    const datos: DatosPieza = { valores: { '*': { presentaciones: [{ encapsulado: 'TO-92', patillas: { E: '1', B: '2', C: '3' }, representativa: true }] } } }
    expect(vistaDatos(def(datos), pieza())).toMatchObject({ tipico: true })
  })
})

describe('vistaDatos de una unidad de un encapsulado', () => {
  const datos: DatosPieza = {
    valores: {
      '*': { presentaciones: [{ encapsulado: 'DIP-8', patillas: { A: '2', B: '3', Y: '1', P: '8' }, unidades: [{ nombre: 'A', patillas: { A: '2', B: '3', Y: '1' } }, { nombre: 'B', patillas: { A: '6', B: '5', Y: '7' } }] }] }
    }
  }
  const d = def(datos, [], ['A', 'B', 'Y', 'P'])
  const numeros = (props: Record<string, string>) => {
    const v = vistaDatos(d, pieza(props))
    return v.tipo === 'fisica' ? Object.fromEntries(v.patillas.map((p) => [p.nombre, p.numero])) : {}
  }

  it('sin unidad elegida muestra las patillas de la primera', () => {
    expect(numeros({})).toEqual({ A: '2', B: '3', Y: '1', P: '8' })
  })

  it('con la unidad B muestra sus patillas y la compartida', () => {
    expect(numeros({ paquete: 'U1', unidad: 'B' })).toEqual({ A: '6', B: '5', Y: '7', P: '8' })
  })

  it('una unidad que no existe vuelve a la primera', () => {
    expect(numeros({ paquete: 'U1', unidad: 'Z' })).toEqual({ A: '2', B: '3', Y: '1', P: '8' })
  })
})
