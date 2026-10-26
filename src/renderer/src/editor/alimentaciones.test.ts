// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { MENSAJE_VOLTAJE_DEL_NOMBRE, voltajeDeRiel } from '../netlist/alimentaciones'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas
const terminal = (id: string, x: number, nombre: string): Pieza => ({ id, tipo: 'alimentacion', ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props: { nombre } })
function doc(): Documento {
  const d = documentoVacio()
  d.piezas.t1 = terminal('t1', 0, 'VCC')
  d.piezas.t2 = terminal('t2', 20, 'VCC')
  d.piezas.t3 = terminal('t3', 40, '+15V')
  return d
}
function editor(simulando = false) {
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
  ed.cargar(doc())
  if (simulando) ed.ponerSimulando(true)
  return ed
}

describe('editar el voltaje de un terminal edita su riel', () => {
  it('cambiar el voltaje de un VCC cambia el de todos los VCC en un paso de deshacer', () => {
    const ed = editor()
    expect(ed.cambiarPropiedad('t1', 'voltaje', '15')).toBeNull()
    expect(voltajeDeRiel(ed.doc, 'VCC').valor).toBe(15)
    expect(Object.values(ed.doc.alimentaciones!)).toEqual([{ id: expect.any(String), nombre: 'VCC', voltaje: '15' }])
    // Las piezas no cambian: el voltaje vive en la tabla del documento.
    expect(ed.doc.piezas.t1.props).toEqual({ nombre: 'VCC' })
    ed.deshacer()
    expect(voltajeDeRiel(ed.doc, 'VCC').valor).toBe(5)
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('un terminal cuyo nombre es un voltaje no lo cambia y dice por qué', () => {
    const ed = editor()
    expect(ed.cambiarPropiedad('t3', 'voltaje', '12')).toBe(MENSAJE_VOLTAJE_DEL_NOMBRE)
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('valida como cualquier valor en V y el mismo voltaje no deja paso', () => {
    const ed = editor()
    expect(ed.cambiarPropiedad('t1', 'voltaje', 'mucho')).toBe('«mucho» no es un valor válido.')
    expect(ed.cambiarPropiedad('t1', 'voltaje', '5')).toBeNull()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('el riel se cambia por su nombre (panel Proyecto) con el mismo paso de deshacer', () => {
    const ed = editor()
    expect(ed.cambiarRiel('VEE', '-12')).toBeNull()
    expect(voltajeDeRiel(ed.doc, 'VEE').valor).toBe(-12)
    expect(ed.cambiarRiel('+15V', '3')).toBe(MENSAJE_VOLTAJE_DEL_NOMBRE)
  })

  it('simulando, el voltaje de un riel cambia sin detener la vista previa', () => {
    const ed = editor(true)
    expect(ed.cambiarPropiedad('t1', 'voltaje', '9')).toBeNull()
    expect(voltajeDeRiel(ed.doc, 'VCC').valor).toBe(9)
    expect(ed.estado().versionCaliente).toBe(ed.estado().versionDoc)
  })
})
