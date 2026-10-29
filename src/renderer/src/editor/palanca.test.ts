// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref: id.toUpperCase(), x: 0, y: 0, rot: 0, espejo: false, props })

function editor(simulando = true, soloLectura = false, inicial?: string) {
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
  const d = documentoVacio()
  d.piezas.dip = pieza('dip', 'interruptor-dip-8', inicial === undefined ? {} : { estado: inicial })
  d.piezas.kp = pieza('kp', 'teclado-4x4')
  d.piezas.r1 = pieza('r1', 'resistencia')
  ed.cargar(d, { soloLectura })
  if (simulando) ed.ponerSimulando(true)
  return ed
}
const estado = (ed: Editor) => ed.doc.piezas.dip.props.estado

describe('palancas de un interruptor DIP', () => {
  it('cada clic reescribe la cadena de 0 y 1 y es un paso de deshacer, también con la vista previa corriendo', () => {
    const ed = editor()
    expect(ed.cambiarPalanca('dip', 2, true)).toBe(true)
    expect(estado(ed)).toBe('00100000')
    expect(ed.cambiarPalanca('dip', 7, true)).toBe(true)
    expect(estado(ed)).toBe('00100001')
    expect(ed.cambiarPalanca('dip', 2, false)).toBe(true)
    expect(estado(ed)).toBe('00000001')
    ed.historial.deshacer()
    expect(estado(ed)).toBe('00100001')
    ed.historial.deshacer()
    expect(estado(ed)).toBe('00100000')
    ed.historial.deshacer()
    expect(ed.doc.piezas.dip.props.estado ?? '00000000').toBe('00000000')
  })

  it('pedir el estado que ya tiene no cambia el documento, y lo que no es un DIP o no existe se rechaza', () => {
    const ed = editor()
    const antes = JSON.stringify(ed.doc.piezas.dip)
    expect(ed.cambiarPalanca('dip', 0, false)).toBe(true)
    expect(JSON.stringify(ed.doc.piezas.dip)).toBe(antes)
    expect(ed.cambiarPalanca('dip', 8, true)).toBe(false)
    expect(ed.cambiarPalanca('dip', -1, true)).toBe(false)
    expect(ed.cambiarPalanca('kp', 0, true)).toBe(false)
    expect(ed.cambiarPalanca('r1', 0, true)).toBe(false)
    expect(ed.cambiarPalanca('no-existe', 0, true)).toBe(false)
  })

  it('un archivo de solo lectura no cambia', () => {
    const ed = editor(false, true)
    ed.cambiarPalanca('dip', 1, true)
    expect(ed.doc.piezas.dip.props.estado).toBeUndefined()
  })

  it('la cadena guardada se completa con ceros si trae menos posiciones', () => {
    const ed = editor(true, false, '1')
    ed.cambiarPalanca('dip', 3, true)
    expect(estado(ed)).toBe('10010000')
  })
})
