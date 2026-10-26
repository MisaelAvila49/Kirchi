// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas
function doc(): Documento {
  const d = documentoVacio()
  d.piezas.xsc = { id: 'xsc', tipo: 'osciloscopio', ref: 'XSC1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
  d.piezas.r1 = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 40, y: 0, rot: 0, espejo: false, props: {} }
  return d
}
function editor(simulando = false) {
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
  let t = 0
  ed.ahora = () => t
  ed.cargar(doc())
  if (simulando) ed.ponerSimulando(true)
  return { ed, avanzar: (ms: number) => (t += ms) }
}
const prop = (ed: Editor, id: string) => ed.doc.piezas.xsc.props[id]

describe('ajustes de instrumento', () => {
  it('los cambios seguidos de una misma perilla son un paso de deshacer; una pausa larga abre otro', () => {
    const { ed, avanzar } = editor()
    expect(ed.cambiarAjusteInstrumento('xsc', 'a_vdiv', '2')).toBeNull()
    avanzar(300)
    expect(ed.cambiarAjusteInstrumento('xsc', 'a_vdiv', '5')).toBeNull()
    avanzar(900)
    expect(ed.cambiarAjusteInstrumento('xsc', 'a_vdiv', '10')).toBeNull()
    expect(prop(ed, 'a_vdiv')).toBe('10')
    ed.deshacer()
    expect(prop(ed, 'a_vdiv')).toBe('5')
    ed.deshacer()
    expect(prop(ed, 'a_vdiv')).toBeUndefined()
  })

  it('otra perilla abre otro paso aunque sea enseguida', () => {
    const { ed, avanzar } = editor()
    ed.cambiarAjusteInstrumento('xsc', 'a_vdiv', '2')
    avanzar(100)
    ed.cambiarAjusteInstrumento('xsc', 'base', '2m')
    ed.deshacer()
    expect(prop(ed, 'base')).toBeUndefined()
    expect(prop(ed, 'a_vdiv')).toBe('2')
  })

  it('un gesto (arrastre de una perilla) es un solo paso', () => {
    const { ed, avanzar } = editor()
    for (const v of ['0.5', '1', '1.5', '2']) {
      ed.cambiarAjusteInstrumento('xsc', 'disp_nivel', v, 'g1')
      avanzar(2000)
    }
    ed.deshacer()
    expect(prop(ed, 'disp_nivel')).toBeUndefined()
  })

  it('simulando también cambia, y la vista previa lo toma en caliente', () => {
    const { ed } = editor(true)
    const v = ed.estado().versionCaliente
    expect(ed.cambiarAjusteInstrumento('xsc', 'base', '2m')).toBeNull()
    expect(prop(ed, 'base')).toBe('2m')
    expect(ed.estado().versionCaliente).toBeGreaterThan(v)
  })

  it('un valor que no vale se dice y no cambia nada; una pieza que no es instrumento no cambia', () => {
    const { ed } = editor()
    expect(ed.cambiarAjusteInstrumento('xsc', 'a_vdiv', 'abc')).toEqual(expect.any(String))
    expect(prop(ed, 'a_vdiv')).toBeUndefined()
    expect(ed.cambiarAjusteInstrumento('r1', 'valor', '2k')).toBeNull()
    expect(ed.doc.piezas.r1.props.valor).toBeUndefined()
  })
})
