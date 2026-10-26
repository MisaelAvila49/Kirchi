import { describe, expect, it } from 'vitest'
import { validarPieza } from './validar'

const base = {
  id: 'resistencia',
  nombre: { es: 'Resistencia', en: 'Resistor' },
  categoria: 'pasivos',
  prefijo: 'R',
  buscar: ['r'],
  pines: [
    { id: '1', nombre: '1', x: -4, y: 0 },
    { id: '2', nombre: '2', x: 4, y: 0 }
  ],
  props: [{ id: 'valor', nombre: 'Valor', unidad: 'Ω', defecto: '1k' }],
  modelo: { tipo: 'R', a: '1', b: '2', prop: 'valor' }
}
const txt = (o: unknown) => JSON.stringify(o, null, 2)
const errores = (o: unknown) => {
  const v = validarPieza(txt(o), 'x/pieza.json')
  return v.ok ? [] : v.errores
}

describe('validarPieza', () => {
  it('acepta una pieza válida y pone etiquetas por omisión', () => {
    const v = validarPieza(txt(base), 'x/pieza.json')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.def.etiquetas).toEqual({ ref: { x: 0, y: -3 }, valor: { x: 0, y: 3 } })
  })

  it('informa la línea de un error de sintaxis', () => {
    const v = validarPieza('{\n  "id": "r"\n  "x": 1\n}', 'x/pieza.json')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores[0]).toMatch(/línea 3/)
  })

  it('exige pines con coordenadas enteras y sin repetir', () => {
    expect(errores({ ...base, pines: [] })).toContain('x/pieza.json: pines debe tener al menos un pin')
    expect(errores({ ...base, pines: [{ id: '1', nombre: '1', x: 0.5, y: 0 }] })).toContain('x/pieza.json: pines[0].x debe ser un entero')
    expect(errores({ ...base, pines: [base.pines[0], base.pines[0]] })).toContain('x/pieza.json: pines[1].id repetido: 1')
  })

  it('valida los valores por omisión y las opciones', () => {
    expect(errores({ ...base, props: [{ id: 'valor', nombre: 'V', defecto: 'mucho' }] })).toContain('x/pieza.json: props[0].defecto no es un valor válido: «mucho»')
    expect(errores({ ...base, modelo: undefined, props: [{ id: 'e', nombre: 'E', defecto: 'x', opciones: ['a', 'b'] }] })).toContain('x/pieza.json: props[0].defecto debe ser una de las opciones')
  })

  it('valida que el modelo use pines y propiedades existentes', () => {
    expect(errores({ ...base, modelo: { tipo: 'R', a: '1', b: '9', prop: 'valor' } })).toContain('x/pieza.json: modelo.b no es un pin de la pieza')
    expect(errores({ ...base, modelo: { tipo: 'R', a: '1', b: '2', prop: 'otra' } })).toContain('x/pieza.json: modelo.prop no es una propiedad de la pieza')
    expect(errores({ ...base, modelo: { tipo: 'X' } })[0]).toMatch(/modelo.tipo debe ser uno de/)
  })

  it('valida los modelos de transistor, MOSFET y amplificador: pines distintos y parámetros por cada opción', () => {
    const npn = {
      ...base,
      id: 'npn',
      pines: [
        { id: 'B', nombre: 'base', x: -4, y: 0 },
        { id: 'C', nombre: 'colector', x: 2, y: -4 },
        { id: 'E', nombre: 'emisor', x: 2, y: 4 }
      ],
      props: [{ id: 'modelo', nombre: 'Modelo', defecto: 'A', opciones: ['A', 'B'] }],
      modelo: { tipo: 'bjt', c: 'C', b: 'B', e: 'E', pnp: false, prop: 'modelo', modelos: { A: { is: 1e-14, bf: 200 }, B: { is: 2e-14 } } }
    }
    expect(errores(npn)).toEqual([])
    expect(errores({ ...npn, modelo: { ...npn.modelo, e: 'C' } })).toContain('x/pieza.json: modelo cada terminal debe ser un pin distinto')
    expect(errores({ ...npn, modelo: { ...npn.modelo, modelos: { A: { is: 1e-14 } } } })).toContain('x/pieza.json: modelo.modelos.B falta: cada opción de la propiedad necesita sus parámetros')
    expect(errores({ ...npn, modelo: { ...npn.modelo, modelos: { ...npn.modelo.modelos, C: {} } } })).toContain('x/pieza.json: modelo.modelos.C no es una de las opciones de la propiedad')
    expect(errores({ ...npn, modelo: { ...npn.modelo, modelos: { A: { is: 'mucho' }, B: {} } } })).toContain('x/pieza.json: modelo.modelos.A.is debe ser un número')
    expect(errores({ ...npn, modelo: { ...npn.modelo, pnp: 'no' } })).toContain('x/pieza.json: modelo.pnp debe ser verdadero o falso')
  })

  it('rechaza los nombres de parámetro desconocidos (una errata) y los valores fuera de lo que admite el motor', () => {
    const npn = {
      ...base,
      id: 'npn',
      pines: [
        { id: 'B', nombre: 'base', x: -4, y: 0 },
        { id: 'C', nombre: 'colector', x: 2, y: -4 },
        { id: 'E', nombre: 'emisor', x: 2, y: 4 }
      ],
      props: [{ id: 'modelo', nombre: 'Modelo', defecto: 'A', opciones: ['A'] }],
      modelo: { tipo: 'bjt', c: 'C', b: 'B', e: 'E', pnp: false, prop: 'modelo', modelos: { A: { is: 1e-14, bf: 200 } } }
    }
    const con = (p: object) => errores({ ...npn, modelo: { ...npn.modelo, modelos: { A: p } } })
    expect(con({ Bf: 200 })).toContain('x/pieza.json: modelo.modelos.A.Bf parámetro desconocido, ¿quisiste decir «bf»?')
    expect(con({ 'vaf ': 74 })).toContain('x/pieza.json: modelo.modelos.A.vaf  parámetro desconocido, ¿quisiste decir «vaf»?')
    // Hasta dos letras de distancia se sugiere el nombre más parecido («vaff» por «vaf», «tua» por «tau»).
    expect(con({ vaff: 74 })).toContain('x/pieza.json: modelo.modelos.A.vaff parámetro desconocido, ¿quisiste decir «vaf»?')
    expect(con({ cjee: 1e-12 })).toContain('x/pieza.json: modelo.modelos.A.cjee parámetro desconocido, ¿quisiste decir «cje»?')
    expect(con({ beta: 100 })).toContain('x/pieza.json: modelo.modelos.A.beta parámetro desconocido (los de un transistor son is, bf, nf, vaf, ikf, ise, ne, br, nr, var, ikr, isc, nc, rb, irb, rbm, re, rc, cje, vje, mje, tf, xtf, vtf, itf, cjc, vjc, mjc, xcjc, tr y fc)')
    expect(con({ vaf: 0.5 })[0]).toMatch(/modelo.modelos.A.vaf vale 500 mV, fuera de lo que admite la vista previa/)
    expect(con({ is: 1 })[0]).toMatch(/modelo.modelos.A.is vale 1 A, fuera de lo que admite/)
    expect(con({ is: 14e-15, bf: 255.9, vaf: 74.03, var: 0 })).toEqual([])
    const mos = { ...npn, id: 'n', pines: [{ id: 'D', nombre: 'd', x: 2, y: -4 }, { id: 'G', nombre: 'g', x: -4, y: 0 }, { id: 'S', nombre: 's', x: 2, y: 4 }], modelo: { tipo: 'mosfet', d: 'D', g: 'G', s: 'S', pmos: false, prop: 'modelo', modelos: { A: { vto: 2, kp: 0.1 } } } }
    expect(errores({ ...mos, modelo: { ...mos.modelo, modelos: { A: { 'vto ': 2 } } } })).toContain('x/pieza.json: modelo.modelos.A.vto  parámetro desconocido, ¿quisiste decir «vto»?')
    expect(errores({ ...mos, modelo: { ...mos.modelo, modelos: { A: { kp: 1e20 } } } })[0]).toMatch(/modelo.modelos.A.kp vale/)
    const oa = { ...npn, id: 'oa', pines: ['+', '-', 'OUT', 'V+', 'V-'].map((id, k) => ({ id, nombre: id, x: -4, y: 2 * k })), modelo: { tipo: 'ampop', mas: '+', menos: '-', sal: 'OUT', vmas: 'V+', vmenos: 'V-', prop: 'modelo', modelos: { A: { a0: 2e5 } } } }
    expect(errores(oa)).toEqual([])
    expect(errores({ ...oa, modelo: { ...oa.modelo, modelos: { A: { A0: 2e5 } } } })).toContain('x/pieza.json: modelo.modelos.A.A0 parámetro desconocido, ¿quisiste decir «a0»?')
    expect(errores({ ...oa, modelo: { ...oa.modelo, modelos: { A: { a0: 0 } } } })[0]).toMatch(/modelo.modelos.A.a0 vale/)
  })

  it('rechaza una clave desconocida en el modelo (una errata como «tua» por «tau») y las llaves de la serie del zener que no son un voltaje simple', () => {
    const v = { id: 'voltaje', nombre: 'V', unidad: 'V', defecto: '5' }
    const foco = { tipo: 'foco', a: '1', b: '2', voltaje: 'voltaje', potencia: 'voltaje', k: 9, tau: 0.05 }
    expect(errores({ ...base, props: [v], modelo: foco })).toEqual([])
    expect(errores({ ...base, props: [v], modelo: { ...foco, tua: 0.05 } })).toContain('x/pieza.json: modelo.tua clave desconocida en un modelo «foco», ¿quisiste decir «tau»?')
    expect(errores({ ...base, props: [v], modelo: { ...foco, invento: 1 } })).toContain('x/pieza.json: modelo.invento clave desconocida en un modelo «foco»')
    const zener = { tipo: 'zener', a: '1', b: '2', prop: 'voltaje', is: 2.5e-15, n: 1, cjo: 1e-10, vj: 0.75, m: 0.33, serie: { '5.1': { izt: 0.049, zzt: 7 } } }
    expect(errores({ ...base, props: [v], modelo: zener })).toEqual([])
    expect(errores({ ...base, props: [v], modelo: { ...zener, serie: { '5V1': { izt: 0.049, zzt: 7 } } } })).toContain('x/pieza.json: modelo.serie.5V1 la llave debe ser un voltaje en volts como «5.1»')
  })

  it('valida los modelos del foco, el fusible, el motor, el relé, el zumbador, el zener y el inductor', () => {
    const conProps = (props: object[], modelo: object) => errores({ ...base, props, modelo })
    const v = (id: string) => ({ id, nombre: id, unidad: 'V', defecto: '5' })
    expect(conProps([v('voltaje'), { id: 'potencia', nombre: 'P', unidad: 'W', defecto: '5' }], { tipo: 'foco', a: '1', b: '2', voltaje: 'voltaje', potencia: 'potencia', k: 9, tau: 0.05 })).toEqual([])
    expect(conProps([v('voltaje')], { tipo: 'foco', a: '1', b: '2', voltaje: 'voltaje', potencia: 'otra', k: 9, tau: 0.05 })).toContain('x/pieza.json: modelo.potencia no es una propiedad de la pieza')
    const amperes = { id: 'corriente', nombre: 'I', unidad: 'A', defecto: '1' }
    expect(conProps([amperes], { tipo: 'fusible', a: '1', b: '2', prop: 'corriente', rPorA: 0.1, fusion: 2, tau: 0.125 })).toEqual([])
    expect(conProps([amperes], { tipo: 'fusible', a: '1', b: '2', prop: 'corriente', rPorA: 0.1, fusion: 1, tau: 0.125 })).toContain('x/pieza.json: modelo.fusion debe ser mayor que 1')
    const referencia = { v: 6, r: 3, l: 1.5e-3, ke: 6.05e-3, j: 2.4e-7, bm: 6.4e-7 }
    expect(conProps([v('voltaje')], { tipo: 'motor', a: '1', b: '2', voltaje: 'voltaje', referencia })).toEqual([])
    expect(conProps([v('voltaje')], { tipo: 'motor', a: '1', b: '2', voltaje: 'voltaje', referencia: { ...referencia, j: 0 } })).toContain('x/pieza.json: modelo.referencia.j debe ser positivo')
    expect(conProps([v('voltaje')], { tipo: 'zumbador', a: '1', b: '2', voltaje: 'voltaje', potencia: 0.15, umbral: 1.5 })).toContain('x/pieza.json: modelo.umbral debe estar entre 0 y 1')
    const zener = { tipo: 'zener', a: '1', b: '2', prop: 'voltaje', is: 2.5e-15, n: 1, cjo: 1e-10, vj: 0.75, m: 0.33, serie: { '5.1': { izt: 0.049, zzt: 7 } } }
    expect(conProps([v('voltaje')], zener)).toEqual([])
    expect(conProps([v('voltaje')], { ...zener, serie: { mucho: { izt: 0.049, zzt: 7 } } })).toContain('x/pieza.json: modelo.serie.mucho la llave debe ser un voltaje en volts como «5.1»')
    expect(conProps([{ id: 'valor', nombre: 'L', unidad: 'H', defecto: '10m' }], { tipo: 'L', a: '1', b: '2', prop: 'valor' })).toEqual([])
  })

  it('valida el relé: cinco pines distintos y la liberación por debajo de la operación', () => {
    const rele = {
      ...base,
      pines: ['A1', 'A2', 'NC', 'NA', 'COM'].map((id, i) => ({ id, nombre: id, x: 2 * i, y: 0 })),
      props: [{ id: 'voltaje', nombre: 'V', unidad: 'V', defecto: '5' }],
      modelo: { tipo: 'rele', a1: 'A1', a2: 'A2', com: 'COM', na: 'NA', nc: 'NC', voltaje: 'voltaje', potencia: 0.36, tau: 3e-3, operar: 0.75, liberar: 0.1 }
    }
    expect(errores(rele)).toEqual([])
    expect(errores({ ...rele, modelo: { ...rele.modelo, liberar: 0.8 } })).toContain('x/pieza.json: modelo.liberar debe estar entre 0 y modelo.operar')
    expect(errores({ ...rele, modelo: { ...rele.modelo, na: 'X' } })).toContain('x/pieza.json: modelo.na no es un pin de la pieza')
  })

  it('tolera BOM y rechaza un nivel superior que no es objeto', () => {
    expect(validarPieza('﻿' + txt(base), 'x/pieza.json').ok).toBe(true)
    expect(validarPieza('[]', 'x/pieza.json')).toEqual({ ok: false, errores: ['x/pieza.json: el archivo debe contener un objeto JSON'] })
    expect(validarPieza('null', 'x/pieza.json').ok).toBe(false)
  })

  it('no truena con entradas que no son objetos', () => {
    expect(errores({ ...base, pines: [null] })).toContain('x/pieza.json: pines[0] debe ser un objeto')
    expect(errores({ ...base, props: [3], modelo: undefined })).toContain('x/pieza.json: props[0] debe ser un objeto')
  })

  it('rechaza coordenadas de pin impares', () => {
    expect(errores({ ...base, pines: [{ id: '1', nombre: '1', x: 3, y: 0 }] })).toContain('x/pieza.json: pines[0].x debe ser par (rejilla de 2.5 mm)')
    expect(errores({ ...base, pines: [{ id: '1', nombre: '1', x: 0, y: -1 }] })).toContain('x/pieza.json: pines[0].y debe ser par (rejilla de 2.5 mm)')
  })

  describe('parámetros del diodo por opción', () => {
    const color = { id: 'color', nombre: 'Color', defecto: 'rojo', opciones: ['rojo', 'azul'] }
    const led = { ...base, props: [color], modelo: { tipo: 'D', a: '1', b: '2', is: 1.5e-17, n: 2, por: { prop: 'color', valores: { azul: { is: 2e-28, n: 2 } } } } }

    it('acepta valores para algunas opciones de una propiedad de lista', () => {
      expect(errores(led)).toEqual([])
    })

    it('rechaza una propiedad que no es de lista, una opción que no existe y parámetros no positivos', () => {
      const por = (p: unknown) => errores({ ...led, modelo: { ...led.modelo, por: p } })
      expect(por({ prop: 'otra', valores: {} })).toContain('x/pieza.json: modelo.por.prop no es una propiedad de la pieza')
      expect(errores({ ...led, props: [color, base.props[0]], modelo: { ...led.modelo, por: { prop: 'valor', valores: {} } } })).toContain('x/pieza.json: modelo.por.prop debe ser una propiedad de lista')
      expect(por({ prop: 'color', valores: [] })).toContain('x/pieza.json: modelo.por.valores debe ser un objeto')
      expect(por({ prop: 'color', valores: { verde: { is: 1e-20, n: 2 } } })).toContain('x/pieza.json: modelo.por.valores.verde no es una de las opciones de la propiedad')
      expect(por({ prop: 'color', valores: { azul: { is: 0, n: 2 } } })).toContain('x/pieza.json: modelo.por.valores.azul debe tener is y n positivos')
    })
  })

  describe('fuentes senoidal y de pulso', () => {
    const v = (id: string) => ({ id, nombre: id, unidad: 'V', defecto: '5' })
    const ciclo = { id: 'ciclo', nombre: 'Ciclo', defecto: '50 %', opciones: ['25 %', '50 %'] }
    const ac = { ...base, props: [v('amplitud'), { id: 'frecuencia', nombre: 'F', unidad: 'Hz', defecto: '60' }], modelo: { tipo: 'senoidal', a: '1', b: '2', amplitud: 'amplitud', frecuencia: 'frecuencia' } }
    const pulso = { ...base, props: [v('alto'), { id: 'frecuencia', nombre: 'F', unidad: 'Hz', defecto: '1k' }, ciclo], modelo: { tipo: 'pulso', a: '1', b: '2', alto: 'alto', frecuencia: 'frecuencia', ciclo: 'ciclo' } }

    it('aceptan sus propiedades', () => {
      expect(errores(ac)).toEqual([])
      expect(errores(pulso)).toEqual([])
    })

    it('rechazan una propiedad que falta, una lista donde va un número y un ciclo que no es porcentaje', () => {
      expect(errores({ ...ac, modelo: { ...ac.modelo, frecuencia: 'f' } })).toContain('x/pieza.json: modelo.frecuencia no es una propiedad de la pieza')
      expect(errores({ ...pulso, modelo: { ...pulso.modelo, alto: 'ciclo' } })).toContain('x/pieza.json: modelo.alto debe ser una propiedad numérica')
      expect(errores({ ...pulso, props: [pulso.props[0], pulso.props[1], { ...ciclo, defecto: 'a', opciones: ['a'] }] })).toContain('x/pieza.json: modelo.ciclo sus opciones deben ser porcentajes entre 0 y 100, como «50 %»')
      expect(errores({ ...pulso, modelo: { ...pulso.modelo, ciclo: 'alto' } })).toContain('x/pieza.json: modelo.ciclo debe ser una propiedad de lista')
    })
  })

  it('el interruptor momentáneo es verdadero o falso y su propiedad tiene dos opciones', () => {
    const sw = { id: 'p', nombre: 'P', defecto: 'no', opciones: ['no', 'sí'] }
    const m = { tipo: 'interruptor', a: '1', b: '2', prop: 'p', cerrado: 'sí' }
    expect(errores({ ...base, props: [sw], modelo: { ...m, momentaneo: true } })).toEqual([])
    expect(errores({ ...base, props: [sw], modelo: { ...m, momentaneo: 'si' } })).toContain('x/pieza.json: modelo.momentaneo debe ser verdadero o falso')
    expect(errores({ ...base, props: [{ ...sw, opciones: ['no', 'sí', 'tal vez'] }], modelo: m })).toContain('x/pieza.json: modelo.prop debe tener exactamente dos opciones (abierto y cerrado)')
  })

  it('el potenciómetro necesita un cursor distinto de los extremos y posiciones en porcentaje', () => {
    const sw = { id: 'valor', nombre: 'V', unidad: 'Ω', defecto: '10k' }
    const pines = [...base.pines, { id: '3', nombre: 'cursor', x: 0, y: -4 }]
    const pos = { id: 'posicion', nombre: 'Posición', defecto: '50 %', opciones: ['0 %', '50 %', '100 %'] }
    const pot = { ...base, pines, props: [sw, pos], modelo: { tipo: 'pot', a: '1', b: '2', c: '3', prop: 'valor', posicion: 'posicion' } }
    expect(errores(pot)).toEqual([])
    expect(errores({ ...pot, modelo: { ...pot.modelo, c: '1' } })).toContain('x/pieza.json: modelo.c debe ser un pin distinto de modelo.a y modelo.b')
    expect(errores({ ...pot, props: [sw, { ...pos, defecto: '50 %', opciones: ['50 %', 'tope'] }] })).toContain('x/pieza.json: modelo.posicion sus opciones deben ser porcentajes de 0 a 100, como «50 %»')
    expect(errores({ ...pot, modelo: { ...pot.modelo, posicion: 'valor' } })).toContain('x/pieza.json: modelo.posicion debe ser una propiedad de lista')
  })

  it('valida el modelo de interruptor y de R/C/V con más rigor', () => {
    const sw = { id: 'estado', nombre: 'E', defecto: 'abierto', opciones: ['abierto', 'cerrado'] }
    const m = { tipo: 'interruptor', a: '1', b: '2', prop: 'estado', cerrado: 'cerrado' }
    expect(errores({ ...base, props: [sw], modelo: m })).toEqual([])
    expect(errores({ ...base, props: [sw], modelo: { ...m, cerrado: 'cerado' } })).toContain('x/pieza.json: modelo.cerrado debe ser una de las opciones de la propiedad')
    expect(errores({ ...base, props: [sw], modelo: { tipo: 'R', a: '1', b: '2', prop: 'estado' } })).toContain('x/pieza.json: modelo.prop debe ser una propiedad numérica')
    expect(errores({ ...base, modelo: { tipo: 'R', a: '1', b: '1', prop: 'valor' } })).toContain('x/pieza.json: modelo.b no puede ser el mismo pin que modelo.a')
  })

  it('valida duplicados, comunes, opciones y buscar', () => {
    const v = { id: 'valor', nombre: 'V', defecto: '1k' }
    expect(errores({ ...base, props: [v, v] })).toContain('x/pieza.json: props[1].id repetido: valor')
    expect(errores({ ...base, props: [{ ...v, comunes: ['1k', 'zzz'] }] })).toContain('x/pieza.json: props[0].comunes contiene un valor no válido: «zzz»')
    expect(errores({ ...base, modelo: undefined, props: [{ ...v, defecto: 'a', opciones: [] }] })).toContain('x/pieza.json: props[0].opciones debe ser una lista de textos no vacía')
    expect(errores({ ...base, buscar: [] })).toContain('x/pieza.json: buscar debe ser una lista de textos con al menos uno')
    expect(errores({ ...base, pines: [{ nombre: 'a', x: 0, y: 0 }, { nombre: 'b', x: 2, y: 0 }] }).some((e) => e.includes('repetido'))).toBe(false)
  })

  it('valida serie y catálogo: solo en una propiedad numérica, con una serie que exista', () => {
    const v = { id: 'valor', nombre: 'V', defecto: '1k', comunes: ['1k', '2.2k'] }
    expect(errores({ ...base, props: [{ ...v, serie: 'elegida' }] })).toEqual([])
    expect(errores({ ...base, props: [{ ...v, serie: 'E6' }] })).toEqual([])
    expect(errores({ ...base, props: [{ ...v, catalogo: true }] })).toEqual([])
    expect(errores({ ...base, props: [{ ...v, serie: 'E99' }] })).toContain('x/pieza.json: props[0].serie debe ser «elegida», «E6», «E12» o «E24»')
    expect(errores({ ...base, props: [{ ...v, catalogo: 'sí' }] })).toContain('x/pieza.json: props[0].catalogo debe ser verdadero o falso')
    expect(errores({ ...base, props: [{ id: 'v', nombre: 'V', defecto: 'a', opciones: ['a', 'b'], serie: 'elegida' }] })).toContain('x/pieza.json: props[0].serie solo aplica a una propiedad numérica')
    expect(errores({ ...base, props: [{ id: 'v', nombre: 'V', defecto: '1k', catalogo: true }] })).toContain('x/pieza.json: props[0].catalogo necesita una lista de comunes')
    expect(errores({ ...base, props: [{ ...v, serie: 'E6', catalogo: true }] })).toContain('x/pieza.json: props[0].serie y catalogo no se combinan')
  })

  it('valida identificador y prefijo', () => {
    expect(errores({ ...base, id: 'Mi Pieza' })).toContain('x/pieza.json: id debe ser texto en minúsculas con guiones')
    expect(errores({ ...base, prefijo: 'r' })).toContain('x/pieza.json: prefijo debe ser de 1 a 4 mayúsculas')
  })

  describe('rótulos y valor visible', () => {
    it('completa los valores por omisión de un rótulo', () => {
      const v = validarPieza(txt({ ...base, rotulos: [{ texto: 'M', x: 0, y: 0.5 }] }), 'x/pieza.json')
      expect(v.ok).toBe(true)
      if (v.ok) expect(v.def.rotulos).toEqual([{ texto: 'M', x: 0, y: 0.5, tam: 1.25, alinear: 'centro', fuente: 'mono', tinta: 'pieza' }])
    })

    it('sin rótulos no agrega el campo', () => {
      const v = validarPieza(txt(base), 'x/pieza.json')
      expect(v.ok && v.def.rotulos).toBeFalsy()
    })

    it('rechaza rótulos mal formados con su ruta y campo', () => {
      expect(errores({ ...base, rotulos: 3 })).toContain('x/pieza.json: rotulos debe ser una lista')
      expect(errores({ ...base, rotulos: [7] })).toContain('x/pieza.json: rotulos[0] debe ser un objeto')
      expect(errores({ ...base, rotulos: [{ x: 0, y: 0 }] })).toContain('x/pieza.json: rotulos[0].texto es obligatorio')
      expect(errores({ ...base, rotulos: [{ texto: 'a', x: 'uno', y: 0 }] })).toContain('x/pieza.json: rotulos[0].x debe ser un número')
      expect(errores({ ...base, rotulos: [{ texto: 'a', x: 0, y: 0, tam: 0 }] })[0]).toMatch(/rotulos\[0\]\.tam debe ser un número positivo/)
      expect(errores({ ...base, rotulos: [{ texto: 'a', x: 0, y: 0, alinear: 'diagonal' }] })).toContain('x/pieza.json: rotulos[0].alinear debe ser izq, centro, der, arriba o abajo')
      expect(errores({ ...base, rotulos: [{ texto: 'a', x: 0, y: 0, fuente: 'serif' }] })).toContain('x/pieza.json: rotulos[0].fuente debe ser sans o mono')
      expect(errores({ ...base, rotulos: [{ texto: 'a', x: 0, y: 0, tinta: 'rojo' }] })).toContain('x/pieza.json: rotulos[0].tinta debe ser pieza o valor')
    })

    it('mostrar solo vale en listas cerradas y es booleano', () => {
      const lista = { id: 'm', nombre: 'M', defecto: 'a', opciones: ['a', 'b'] }
      expect(errores({ ...base, modelo: undefined, props: [{ ...lista, mostrar: true }] })).toEqual([])
      expect(errores({ ...base, modelo: undefined, props: [{ ...lista, mostrar: 'si' }] })).toContain('x/pieza.json: props[0].mostrar debe ser verdadero o falso')
      expect(errores({ ...base, props: [{ id: 'valor', nombre: 'V', defecto: '1k', mostrar: true }] })).toContain('x/pieza.json: props[0].mostrar solo aplica a una propiedad de lista (con opciones)')
    })
  })

  it('largoMax: solo en un texto, entero entre 25 y 6000, y el defecto cabe en él', () => {
    const conProp = (p: object) => errores({ ...base, props: [{ id: 'valor', nombre: 'Aspecto', unidad: undefined, defecto: 'normal', texto: true, ...p }] })
    expect(conProp({ largoMax: 400 })).toEqual([])
    expect(conProp({ largoMax: 24 }).join(' ')).toContain('largoMax')
    expect(conProp({ largoMax: 6001 }).join(' ')).toContain('largoMax')
    expect(conProp({ largoMax: 40.5 }).join(' ')).toContain('largoMax')
    expect(conProp({ largoMax: 60, defecto: 'x'.repeat(61) }).join(' ')).toContain('1 a 60')
    expect(errores({ ...base, props: [{ id: 'valor', nombre: 'Valor', unidad: 'Ω', defecto: '1k', largoMax: 100 }] }).join(' ')).toContain('largoMax')
  })
})
