// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import type { PiezaDef, PropDef } from '../piezas/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { editableEnCaliente } from './enCaliente'
import { PASO_REJILLA } from './rutas'
import { seleccionDe } from './seleccion'

const base = libreriaDePrueba().piezas
const temperatura: PropDef = { id: 'temperatura', nombre: 'Temperatura', unidad: '°C', defecto: '25 °C', enVivo: { magnitud: 'temperatura', min: -40, max: 150, paso: 1, pasoFino: 0.1 } }
const luz: PropDef = { id: 'luz', nombre: 'Iluminancia', unidad: 'lx', defecto: '300 lx', enVivo: { magnitud: 'luz', min: 1, max: 100000, paso: 1, pasoFino: 1, escala: 'log' } }
const sensor: PiezaDef = { ...base.get('resistencia')!, id: 'sensor-de-prueba', props: [...base.get('resistencia')!.props, temperatura, luz] }
const lib = new Map(base)
lib.set(sensor.id, sensor)
const pieza = (id: string): Pieza => ({ id, tipo: sensor.id, ref: id.toUpperCase(), x: 0, y: 0, rot: 0, espejo: false, props: {} })

function editor(simulando = true, soloLectura = false) {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  let t = 0
  ed.ahora = () => t
  const d = documentoVacio()
  d.piezas.s1 = pieza('s1')
  d.piezas.s2 = pieza('s2')
  ed.cargar(d, { soloLectura })
  if (simulando) ed.ponerSimulando(true)
  return { ed, registro, avanzar: (ms: number) => (t += ms) }
}
const temp = (ed: Editor, id = 's1') => ed.doc.piezas[id].props.temperatura

describe('editableEnCaliente con enVivo', () => {
  it('una propiedad enVivo se cambia simulando; las demás de la misma pieza siguen según su modelo', () => {
    expect(editableEnCaliente(sensor, 'temperatura')).toBe(true)
    expect(editableEnCaliente(sensor, 'luz')).toBe(true)
    expect(editableEnCaliente(sensor, 'otra')).toBe(false)
  })
})

describe('Editor.cambiarPerilla', () => {
  it('cambia la propiedad simulando, con un paso de deshacer y el documento sin guardar', () => {
    const { ed } = editor()
    const v0 = ed.versionDoc
    expect(ed.cambiarPerilla('s1', 'temperatura', '85 °C')).toBe(true)
    expect(temp(ed)).toBe('85 °C')
    expect(ed.versionDoc).toBeGreaterThan(v0)
    expect(ed.estado().versionCaliente).toBe(ed.estado().versionDoc)
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
  })

  it('un gesto es un solo paso aunque pase por muchos valores', () => {
    const { ed, avanzar } = editor()
    for (const v of ['30', '40', '55', '70']) {
      avanzar(300)
      ed.cambiarPerilla('s1', 'temperatura', `${v} °C`, 'g1')
    }
    expect(temp(ed)).toBe('70 °C')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('las muescas seguidas (menos de 800 ms) son un paso; una pausa larga abre otro', () => {
    const { ed, avanzar } = editor()
    ed.cambiarPerilla('s1', 'temperatura', '26 °C')
    avanzar(500)
    ed.cambiarPerilla('s1', 'temperatura', '27 °C')
    avanzar(1000)
    ed.cambiarPerilla('s1', 'temperatura', '28 °C')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBe('27 °C')
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
  })

  it('la perilla de otra pieza o de otra propiedad no se junta con la anterior', () => {
    const { ed, avanzar } = editor()
    ed.cambiarPerilla('s1', 'temperatura', '30 °C')
    avanzar(100)
    ed.cambiarPerilla('s2', 'temperatura', '40 °C')
    avanzar(100)
    ed.cambiarPerilla('s2', 'luz', '500 lx')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(ed.doc.piezas.s2.props.luz).toBeUndefined()
    ed.deshacer()
    expect(temp(ed, 's2')).toBeUndefined()
    expect(temp(ed)).toBe('30 °C')
  })

  it('rechaza texto ilegible, otra unidad, fuera de rango, lo que no es perilla y piezas inexistentes', () => {
    const { ed } = editor()
    expect(ed.cambiarPerilla('s1', 'temperatura', 'caliente')).toBe(false)
    expect(ed.cambiarPerilla('s1', 'temperatura', '5 V')).toBe(false)
    expect(ed.cambiarPerilla('s1', 'temperatura', '151 °C')).toBe(false)
    expect(ed.cambiarPerilla('s1', 'temperatura', '-41 °C')).toBe(false)
    expect(ed.cambiarPerilla('s1', 'luz', '0 lx')).toBe(false)
    expect(ed.cambiarPerilla('s1', 'valor', '5k')).toBe(false)
    expect(ed.cambiarPerilla('no-existe', 'temperatura', '30 °C')).toBe(false)
    expect(ed.doc.piezas.s1.props).toEqual({})
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('en un archivo de solo lectura no cambia y lo dice en el Registro', () => {
    const { ed, registro } = editor(true, true)
    expect(ed.cambiarPerilla('s1', 'temperatura', '60 °C')).toBe(false)
    expect(temp(ed)).toBeUndefined()
    expect(registro.length).toBeGreaterThan(0)
  })

  it('un texto igual al guardado devuelve true sin dejar paso', () => {
    const { ed } = editor()
    const v = ed.versionDoc
    expect(ed.cambiarPerilla('s1', 'temperatura', '25 °C')).toBe(true)
    expect(ed.versionDoc).toBe(v)
  })
})

describe('Editor.revertirEnCaliente', () => {
  it('vuelve al valor anterior sin dejar rastro en deshacer ni en «sin guardar»', () => {
    const { ed } = editor()
    ed.cambiarPerilla('s1', 'temperatura', '90 °C')
    ed.revertirEnCaliente('s1', 'temperatura', '25 °C')
    expect(ed.doc.piezas.s1.props).toEqual({})
    expect(ed.historial.puedeDeshacer).toBe(false)
    expect(ed.historial.sinGuardar).toBe(false)
  })

  it('dentro de un gesto solo quita lo rechazado: lo aceptado antes se queda como un paso', () => {
    const { ed, avanzar } = editor()
    avanzar(100)
    ed.cambiarPerilla('s1', 'temperatura', '40 °C', 'g')
    avanzar(100)
    ed.cambiarPerilla('s1', 'temperatura', '140 °C', 'g')
    ed.revertirEnCaliente('s1', 'temperatura', '40 °C')
    expect(temp(ed)).toBe('40 °C')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('tras revertir el primer paso de un gesto, el siguiente valor aceptado no se pega a un paso ajeno', () => {
    const { ed, avanzar } = editor()
    ed.cambiarPropiedad('s1', 'valor', '2k')
    avanzar(100)
    ed.cambiarPerilla('s1', 'temperatura', '140 °C', 'g')
    ed.revertirEnCaliente('s1', 'temperatura', '25 °C')
    avanzar(100)
    ed.cambiarPerilla('s1', 'temperatura', '50 °C', 'g')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
    expect(ed.doc.piezas.s1.props.valor).toBe('2k')
  })

  it('no hace nada si llegó otro cambio del mismo elemento', () => {
    const { ed, avanzar } = editor()
    ed.cambiarPerilla('s1', 'temperatura', '90 °C')
    avanzar(100)
    ed.cambiarPropiedad('s1', 'valor', '2k')
    ed.revertirEnCaliente('s1', 'temperatura', '25 °C')
    expect(temp(ed)).toBe('90 °C')
    expect(ed.doc.piezas.s1.props.valor).toBe('2k')
  })

  it('no hace nada si se deshizo antes de que llegara el rechazo', () => {
    const { ed } = editor()
    ed.cambiarPerilla('s1', 'temperatura', '90 °C')
    ed.ponerSimulando(false)
    ed.deshacer()
    ed.revertirEnCaliente('s1', 'temperatura', '33 °C')
    expect(temp(ed)).toBeUndefined()
  })
})

describe('perilla sobre la pieza: rueda, teclas y selección', () => {
  const seleccionar = (ed: Editor, id: string) => ed.seleccionar(seleccionDe('piezas', id))

  it('perillaSeleccionada solo existe con una pieza con propiedad enVivo como única selección', () => {
    const { ed } = editor()
    expect(ed.perillaSeleccionada()).toBeNull()
    seleccionar(ed, 's1')
    expect(ed.perillaSeleccionada()).toEqual({ id: 's1', propId: 'temperatura' })
    expect(ed.valorPerilla('s1', 'temperatura')).toBe(25)
  })

  it('la rueda mueve 5 % del rango por muesca y 1 % con Shift, acotado al rango', () => {
    const { ed } = editor()
    expect(ed.pasoPerilla('s1', 'temperatura', 1, false)).toBe(true)
    expect(temp(ed)).toBe('34.5 °C')
    ed.pasoPerilla('s1', 'temperatura', -2, true)
    expect(temp(ed)).toBe('30.7 °C')
    ed.pasoPerilla('s1', 'temperatura', 100, false)
    expect(temp(ed)).toBe('150 °C')
  })

  it('en escala logarítmica cada muesca multiplica', () => {
    const { ed } = editor()
    ed.pasoPerilla('s1', 'luz', 1, false)
    expect(ed.valorPerilla('s1', 'luz')).toBeCloseTo(3000, 0)
  })

  it('varias muescas seguidas de la rueda son un solo paso de deshacer', () => {
    const { ed, avanzar } = editor()
    for (let i = 0; i < 4; i++) {
      avanzar(100)
      ed.pasoPerilla('s1', 'temperatura', 1, false)
    }
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(temp(ed)).toBeUndefined()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('+, − y las flechas izquierda y derecha mueven la perilla seleccionada simulando; Shift es fino', () => {
    const { ed, avanzar } = editor()
    seleccionar(ed, 's1')
    ed.pasoPerillaSeleccionada(1, false)
    expect(temp(ed)).toBe('34.5 °C')
    avanzar(1000)
    ed.desplazar(-PASO_REJILLA, 0)
    expect(temp(ed)).toBe('25 °C')
    avanzar(1000)
    ed.desplazar(5 * PASO_REJILLA, 0)
    expect(temp(ed)).toBe('26.9 °C')
    expect(ed.desplazar(0, PASO_REJILLA)).toBe(true)
    expect(ed.doc.piezas.s1.y).toBe(0)
  })

  it('en solo lectura no cambia nada', () => {
    const { ed } = editor(true, true)
    expect(ed.pasoPerilla('s1', 'temperatura', 1, false)).toBe(false)
    expect(temp(ed)).toBeUndefined()
  })
})
