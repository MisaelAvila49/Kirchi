// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { errorDeReferencia } from '../doc/referencias'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, MENSAJE_SIMULANDO, MOTIVO_REFERENCIA_SIMULANDO, type PedidoCampos, type PedidoTexto } from './Editor'
import { unionesDeNombre } from './uniones'

/** Doble clic sobre una pieza o terminal edita también el nombre. Una referencia repetida se rechaza con su motivo; un
 * nombre de terminal o etiqueta repetido se permite y el campo dice con qué se une. */

const lib = libreriaDePrueba().piezas
const P = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })

function circuito(): Documento {
  const d = documentoVacio()
  for (const p of [
    P('r1', 'resistencia', 'R1', 0, 0, { valor: '1k' }),
    P('r2', 'resistencia', 'R2', 0, 20),
    P('q1', 'npn', 'Q1', 20, 20),
    P('c1', 'capacitor', 'C1', 20, 0),
    P('vcc', 'alimentacion', 'PWR1', 40, 0, { nombre: 'VCC' }),
    P('vcc2', 'alimentacion', 'PWR2', 60, 0, { nombre: 'VCC' }),
    P('g', 'tierra', 'GND1', 0, 40)
  ])
    d.piezas[p.id] = p
  d.etiquetas.e1 = { id: 'e1', nombre: 'SALIDA', x: 80, y: 0, rot: 0 }
  d.alimentaciones = { a1: { id: 'a1', nombre: 'VCC', voltaje: '15' } }
  return d
}

function abrir(doc = circuito()) {
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const registro: string[] = []
  const ed = new Editor(lib, doc, idSecuencial(), { editarTexto: (p) => pedidos.push(p), registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  return { ed, pedidos, registro }
}
const campos = (p: PedidoTexto | PedidoCampos | undefined): PedidoCampos => {
  expect(p?.tipo).toBe('pieza')
  return p as PedidoCampos
}

describe('doble clic en una pieza: referencia y valor', () => {
  it('abre Referencia, Valor y la lista de la potencia nominal, con el foco en el valor', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 0.3 })
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => [c.id, c.titulo, c.inicial])).toEqual([['ref', 'Referencia', 'R1'], ['valor', 'Valor', '1k'], ['prop:potencia', 'Potencia nominal', '0.25 W']])
    expect(p.foco).toBe(1)
  })

  it('cambia la referencia y el valor en un solo paso de deshacer', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 0.3 })
    expect(campos(pedidos[0]).aceptar(['R5', '4k7'])).toBeNull()
    expect(ed.doc.piezas.r1).toMatchObject({ ref: 'R5', props: { valor: '4k7' } })
    ed.deshacer()
    expect(ed.doc.piezas.r1).toMatchObject({ ref: 'R1', props: { valor: '1k' } })
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('sin cambios no deja paso en el historial', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 0.3 })
    expect(campos(pedidos[0]).aceptar(['R1', '1k'])).toBeNull()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('una referencia repetida se rechaza en su campo con el motivo, sin importar mayúsculas, y el documento no cambia', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 0.3 })
    const p = campos(pedidos[0])
    expect(p.aceptar(['r2', '4k7'])).toEqual({ campo: 0, error: 'Ya hay otra pieza con la referencia R2.' })
    // También la de una pieza que no la muestra (la tierra y los terminales).
    expect(p.aceptar(['GND1', '1k'])).toEqual({ campo: 0, error: 'Ya hay otra pieza con la referencia GND1.' })
    expect(ed.doc.piezas.r1).toMatchObject({ ref: 'R1', props: { valor: '1k' } })
    // Mientras se escribe, el campo ya lo dice.
    expect(p.revisar(['R2', '1k'])[0]).toEqual({ error: 'Ya hay otra pieza con la referencia R2.' })
    expect(p.revisar(['R9', '1k'])[0]).toEqual({})
  })

  it('una referencia vacía, con espacios o demasiado larga se rechaza; el valor malo se rechaza en el suyo', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 0.3 })
    const p = campos(pedidos[0])
    expect(p.aceptar(['  ', '1k'])).toEqual({ campo: 0, error: 'Escribe la referencia.' })
    expect(p.aceptar(['R 1', '1k'])).toEqual({ campo: 0, error: 'La referencia no lleva espacios.' })
    expect(p.aceptar(['R'.repeat(25), '1k'])).toEqual({ campo: 0, error: 'La referencia admite 24 caracteres como máximo.' })
    expect(p.aceptar(['R7', 'abc'])).toEqual({ campo: 1, error: '«abc» no es un valor válido.' })
    expect(ed.doc.piezas.r1.ref).toBe('R1')
  })

  it('una pieza sin valor numérico abre la referencia y sus listas (el modelo de un transistor), con el foco en la referencia', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 20, y: 20 })
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => c.id)).toEqual(['ref', 'prop:modelo', 'spice'])
    expect(p.campos[1]).toMatchObject({ titulo: 'Modelo', inicial: '2N2222' })
    expect(p.campos[1].opciones).toContain('2N3904')
    expect(p.foco).toBe(0)
    expect(p.aceptar(['Q7', '2N2222', ''])).toBeNull()
    expect(ed.doc.piezas.q1.ref).toBe('Q7')
    expect(ed.doc.piezas.q1.props.modelo).toBeUndefined()
  })

  it('el color de un LED se elige en el editor del doble clic, con su muestra, en un paso de deshacer', () => {
    const d = circuito()
    d.piezas.d1 = P('d1', 'led', 'D1', 40, 40)
    const { ed, pedidos } = abrir(d)
    ed.editarValor('d1')
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => c.id)).toEqual(['ref', 'prop:color'])
    expect(p.campos[1]).toMatchObject({ titulo: 'Color', inicial: 'rojo', opciones: ['rojo', 'verde', 'azul', 'amarillo', 'blanco'] })
    expect(p.campos[1].muestras).toEqual({ rojo: 'led-rojo', verde: 'led-verde', azul: 'led-azul', amarillo: 'led-amarillo', blanco: 'led-blanco' })
    expect(p.aceptar(['D1', 'morado'])).toEqual({ campo: 1, error: expect.any(String) })
    expect(p.aceptar(['D1', 'verde'])).toBeNull()
    expect(ed.doc.piezas.d1.props.color).toBe('verde')
    ed.deshacer()
    expect(ed.doc.piezas.d1.props.color).toBeUndefined()
  })

  it('una compuerta ofrece su familia y las alimentaciones de su familia; el potenciómetro no ofrece la posición (tiene su control)', () => {
    const d = circuito()
    d.piezas.u1 = P('u1', 'not', 'U1', 40, 40, { familia: '74LS', alimentacion: '5 V' })
    d.piezas.p1 = P('p1', 'potenciometro', 'RV1', 60, 40)
    const { ed, pedidos } = abrir(d)
    ed.editarValor('u1')
    const u = campos(pedidos[0])
    expect(u.campos.map((c) => c.id)).toEqual(['ref', 'prop:familia', 'prop:alimentacion'])
    expect(u.campos[2].opciones).toEqual(['5 V'])
    expect(u.campos[1].muestras).toBeUndefined()
    ed.editarValor('p1')
    expect(campos(pedidos[1]).campos.map((c) => c.id)).toEqual(['ref', 'valor', 'prop:ley'])
  })

  it('la tierra no rotula su referencia: el doble clic no abre nada', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 0, y: 40.5 })
    expect(pedidos).toEqual([])
  })

  it('errorDeReferencia: la propia referencia no cuenta como repetida', () => {
    expect(errorDeReferencia(circuito(), 'r1', 'R1')).toBeNull()
    expect(errorDeReferencia(circuito(), 'r1', 'c1')).toBe('Ya hay otra pieza con la referencia C1.')
  })
})

describe('doble clic en un terminal de alimentación: nombre y voltaje', () => {
  it('abre Nombre y Voltaje, con el foco en el voltaje, y el nombre dice con qué se une', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => [c.id, c.titulo, c.inicial])).toEqual([['nombre', 'Nombre', 'VCC'], ['voltaje', 'Voltaje', '15']])
    expect(p.foco).toBe(1)
    expect(p.revisar(['VCC', '15'])[0]).toEqual({ nota: 'Se une con VCC de PWR2.' })
    // Repetir el nombre de una etiqueta también se permite: se une con ella.
    expect(p.revisar(['SALIDA', '15'])[0]).toEqual({ nota: 'Se une con la etiqueta de red SALIDA.' })
    expect(p.revisar(['VDD', '15'])[0]).toEqual({})
  })

  it('el voltaje sigue al riel del nombre que se escribe, y queda fijo si el nombre ya es un voltaje', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    const p = campos(pedidos[0])
    expect(p.revisar(['VEE', '15'])[1]).toEqual({ sigue: '-5' })
    expect(p.revisar(['+12V', '15'])[1]).toEqual({ fijo: { texto: '12 V', motivo: 'El voltaje sale del nombre.' } })
  })

  it('renombrar con el voltaje que propone el riel nuevo solo cambia el nombre, en un paso', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    expect(campos(pedidos[0]).aceptar(['VEE', '-5'])).toBeNull()
    expect(ed.doc.piezas.vcc.props.nombre).toBe('VEE')
    expect(Object.values(ed.doc.alimentaciones ?? {}).map((a) => [a.nombre, a.voltaje])).toEqual([['VCC', '15']])
    ed.deshacer()
    expect(ed.doc.piezas.vcc.props.nombre).toBe('VCC')
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('nombre y voltaje nuevos: se renombra y el riel nuevo toma el voltaje, en un solo paso de deshacer', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    expect(campos(pedidos[0]).aceptar(['VIN', '12'])).toBeNull()
    expect(ed.doc.piezas.vcc.props.nombre).toBe('VIN')
    expect(Object.values(ed.doc.alimentaciones ?? {}).map((a) => [a.nombre, a.voltaje]).sort()).toEqual([['VCC', '15'], ['VIN', '12']])
    ed.deshacer()
    expect(ed.doc.piezas.vcc.props.nombre).toBe('VCC')
    expect(Object.values(ed.doc.alimentaciones ?? {})).toHaveLength(1)
  })

  it('un nombre vacío o un voltaje que no se lee se rechazan en su campo', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    const p = campos(pedidos[0])
    expect(p.aceptar([' ', '15'])).toEqual({ campo: 0, error: 'Nombre no puede quedar vacío.' })
    expect(p.aceptar(['VIN', 'mucho'])).toEqual({ campo: 1, error: '«mucho» no es un valor válido.' })
    expect(ed.doc.piezas.vcc.props.nombre).toBe('VCC')
  })

  it('con un nombre que ya es un voltaje, el campo del voltaje no se toma en cuenta', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 40, y: -1.5 })
    expect(campos(pedidos[0]).aceptar(['+12V', 'lo que sea'])).toBeNull()
    expect(ed.doc.piezas.vcc.props.nombre).toBe('+12V')
  })
})

describe('doble clic en una etiqueta de red: el nombre dice con qué se une', () => {
  it('repetir el nombre de un terminal o de otra etiqueta se permite y el campo lo dice', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic({ x: 80.5, y: 0 })
    const p = pedidos[0] as PedidoTexto
    expect(p.tipo).toBe('etiqueta')
    expect(p.revisar?.('VCC')).toBe('Se une con VCC de PWR1 y VCC de PWR2.')
    expect(p.revisar?.('OTRA')).toBeNull()
    expect(p.aceptar('VCC')).toBeNull()
    expect(ed.doc.etiquetas.e1.nombre).toBe('VCC')
  })
})

describe('unionesDeNombre', () => {
  it('por la llave del nombre («+15V» y «15 V» son la misma red), sin contarse a sí mismo, con tope de nombres', () => {
    const d = documentoVacio()
    for (let i = 1; i <= 5; i++) d.piezas[`t${i}`] = P(`t${i}`, 'alimentacion', `PWR${i}`, 10 * i, 0, { nombre: i === 1 ? '+15V' : '15 V' })
    d.etiquetas.e1 = { id: 'e1', nombre: '15V', x: 0, y: 30, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: '+15 V', x: 0, y: 40, rot: 0 }
    expect(unionesDeNombre(d, lib, '+15V', { pieza: 't1' })).toBe('Se une con 15 V de PWR2, 15 V de PWR3, 15 V de PWR4, 1 terminal más y 2 etiquetas de red.')
    expect(unionesDeNombre(d, lib, 'X', {})).toBeNull()
  })
})

describe('doble clic mientras corre la vista previa', () => {
  it('en una resistencia: el valor cambia en caliente y la referencia queda fija con el motivo', () => {
    const { ed, pedidos } = abrir()
    ed.ponerSimulando(true)
    ed.dobleClic({ x: 0, y: 0.3 })
    const p = campos(pedidos[0])
    expect(p.revisar(['R1', '1k'])[0]).toEqual({ fijo: { texto: 'R1', motivo: 'Detén la vista previa para cambiar la referencia.' } })
    expect(p.aceptar(['R1', '2k2'])).toBeNull()
    expect(ed.doc.piezas.r1).toMatchObject({ ref: 'R1', props: { valor: '2k2' } })
    expect(ed.estado().versionCaliente).toBe(ed.versionDoc)
  })

  it('en una fuente de pulsos: el ciclo de trabajo (una lista) también cambia en caliente; una lista que no, queda fija', () => {
    const d = circuito()
    d.piezas.v1 = P('v1', 'fuente-pulso', 'V1', 40, 40)
    const { ed, pedidos } = abrir(d)
    ed.ponerSimulando(true)
    ed.editarValor('v1')
    const p = campos(pedidos[0])
    expect(p.campos.map((c) => c.id)).toEqual(['ref', 'valor', 'num:frecuencia', 'prop:ciclo', 'num:periodo', 'num:ancho', 'num:subida', 'num:bajada', 'num:retardo'])
    const vals = (ciclo: string) => ['V1', '5', '1k', ciclo, '0.001', '0', '0', '0', '0']
    expect(p.revisar(vals('50 %'))[3]).toEqual({})
    expect(p.aceptar(vals('25 %'))).toBeNull()
    expect(ed.doc.piezas.v1.props.ciclo).toBe('25 %')
  })

  it('en un terminal: el voltaje del riel cambia en caliente y el nombre queda fijo', () => {
    const { ed, pedidos } = abrir()
    ed.ponerSimulando(true)
    ed.dobleClic({ x: 40, y: -1.5 })
    const p = campos(pedidos[0])
    expect(p.revisar(['VCC', '15'])[0]).toEqual({ fijo: { texto: 'VCC', motivo: 'Detén la vista previa para cambiar el nombre.' } })
    expect(p.aceptar(['VCC', '12'])).toBeNull()
    expect(Object.values(ed.doc.alimentaciones ?? {}).map((a) => a.voltaje)).toEqual(['12'])
  })

  it('en una pieza sin valor que cambie en caliente no abre nada y el Registro dice por qué', () => {
    const { ed, pedidos, registro } = abrir()
    ed.ponerSimulando(true)
    ed.dobleClic({ x: 20, y: 0.3 })
    expect(pedidos).toEqual([])
    expect(registro).toEqual([MENSAJE_SIMULANDO])
  })
})

describe('la referencia desde el inspector', () => {
  it('la cambia en un paso de deshacer y no deja paso si no cambió', () => {
    const { ed } = abrir()
    expect(ed.cambiarReferencia('r1', 'R1')).toBeNull()
    expect(ed.historial.puedeDeshacer).toBe(false)
    expect(ed.cambiarReferencia('r1', ' R9 ')).toBeNull()
    expect(ed.doc.piezas.r1.ref).toBe('R9')
    ed.deshacer()
    expect(ed.doc.piezas.r1.ref).toBe('R1')
  })

  it('rechaza una referencia repetida, vacía o con espacios con el mismo motivo del doble clic', () => {
    const { ed } = abrir()
    expect(ed.cambiarReferencia('r1', 'r2')).toBe(errorDeReferencia(ed.doc, 'r1', 'r2'))
    expect(ed.cambiarReferencia('r1', 'r2')).toBe('Ya hay otra pieza con la referencia R2.')
    expect(ed.cambiarReferencia('r1', '')).toBe('Escribe la referencia.')
    expect(ed.cambiarReferencia('r1', 'R 7')).toBe('La referencia no lleva espacios.')
    expect(ed.doc.piezas.r1.ref).toBe('R1')
  })

  it('con la vista previa corriendo queda fija y dice por qué', () => {
    const { ed } = abrir()
    ed.ponerSimulando(true)
    expect(ed.cambiarReferencia('r1', 'R9')).toBe(MOTIVO_REFERENCIA_SIMULANDO)
    expect(ed.doc.piezas.r1.ref).toBe('R1')
  })
})
