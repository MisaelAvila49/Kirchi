// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, MENSAJE_SIMULANDO } from './Editor'
import { seleccionDe } from './seleccion'
import { MENSAJE_SOLO_EN_CALIENTE } from './enCaliente'

const lib = libreriaDePrueba().piezas
const pot = (id: string, x: number, props: Record<string, string> = {}): Pieza => ({ id, tipo: 'potenciometro', ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props })
const res = (id: string, x: number): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props: {} })
function doc(): Documento {
  const d = documentoVacio()
  d.piezas.rv = pot('rv', 0, { valor: '10k', posicion: '50 %' })
  d.piezas.r1 = res('r1', 40)
  return d
}
function editor(simulando = true, soloLectura = false) {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  let t = 0
  ed.ahora = () => t
  ed.cargar(doc(), { soloLectura })
  if (simulando) ed.ponerSimulando(true)
  return { ed, registro, avanzar: (ms: number) => (t += ms) }
}
const pos = (ed: Editor, id = 'rv') => ed.doc.piezas[id].props.posicion

describe('potenciómetro durante la vista previa', () => {
  it('cambia la posición del documento aunque se esté simulando, con un paso de deshacer y «sin guardar»', () => {
    const { ed } = editor()
    const v0 = ed.versionDoc
    expect(ed.cambiarPosicionPot('rv', 75)).toBe(true)
    expect(pos(ed)).toBe('75 %')
    expect(ed.versionDoc).toBeGreaterThan(v0)
    expect(ed.historial.puedeDeshacer).toBe(true)
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(pos(ed)).toBe('50 %')
  })

  it('el estado dice que el último cambio del documento fue solo la posición de un potenciómetro, para que la vista previa siga', () => {
    const { ed } = editor()
    ed.cambiarPosicionPot('rv', 60)
    expect(ed.estado().versionCaliente).toBe(ed.estado().versionDoc)
    ed.ponerSimulando(false)
    ed.cambiarPropiedad('rv', 'valor', '5k')
    expect(ed.estado().versionCaliente).not.toBe(ed.estado().versionDoc)
    ed.deshacer()
    expect(ed.estado().versionCaliente).not.toBe(ed.estado().versionDoc)
  })

  it('el valor de una resistencia o de una fuente cambia simulando, con su propio paso de deshacer; lo demás no', () => {
    const { ed } = editor()
    expect(ed.cambiarPropiedad('rv', 'valor', '20k')).toBeNull()
    expect(ed.doc.piezas.rv.props.valor).toBe('20k')
    expect(ed.estado().versionCaliente).toBe(ed.estado().versionDoc)
    expect(ed.cambiarPropiedad('rv', 'valor', '30k')).toBeNull()
    // Lo que no es un valor de fuente ni de resistencia no cambia mientras corre.
    expect(ed.cambiarPropiedad('rv', 'posicion', '10 %')).toBe(MENSAJE_SOLO_EN_CALIENTE)
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(ed.doc.piezas.rv.props.valor).toBe('20k')
  })

  it('un gesto (arrastre o control deslizante) es un solo paso aunque pase por muchos valores', () => {
    const { ed, avanzar } = editor()
    for (const v of [52, 55, 61, 70, 66]) {
      avanzar(300)
      ed.cambiarPosicionPot('rv', v, 'g1')
    }
    expect(pos(ed)).toBe('66 %')
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(pos(ed)).toBe('50 %')
    expect(ed.historial.puedeDeshacer).toBe(false)
    ed.rehacer()
    expect(pos(ed)).toBe('66 %')
  })

  it('las muescas de la rueda seguidas (menos de 800 ms entre sí) son un paso; una pausa larga abre otro', () => {
    const { ed, avanzar } = editor()
    ed.cambiarPosicionPot('rv', 55)
    avanzar(500)
    ed.cambiarPosicionPot('rv', 60)
    avanzar(700)
    ed.cambiarPosicionPot('rv', 65)
    avanzar(1000)
    ed.cambiarPosicionPot('rv', 70)
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(pos(ed)).toBe('65 %')
    ed.deshacer()
    expect(pos(ed)).toBe('50 %')
  })

  it('acota a 0-100, redondea y no deja paso si no cambia', () => {
    const { ed } = editor()
    ed.cambiarPosicionPot('rv', 140)
    expect(pos(ed)).toBe('100 %')
    ed.cambiarPosicionPot('rv', -3)
    expect(pos(ed)).toBe('0 %')
    ed.cambiarPosicionPot('rv', 33.4)
    expect(pos(ed)).toBe('33 %')
    const v = ed.versionDoc
    expect(ed.cambiarPosicionPot('rv', 33)).toBe(true)
    expect(ed.versionDoc).toBe(v)
  })

  it('con los valores de fuentes y resistencias es lo único que se edita: lo que no es un potenciómetro no cambia', () => {
    const { ed } = editor()
    expect(ed.cambiarPropiedad('rv', 'otra', '5k')).toBe(MENSAJE_SOLO_EN_CALIENTE)
    expect(ed.cambiarPosicionPot('r1', 30)).toBe(false)
    expect(ed.cambiarPosicionPot('no-existe', 30)).toBe(false)
    expect(ed.doc.piezas.r1.props).toEqual({})
    expect(ed.doc.piezas.rv.props.valor).toBe('10k')
  })

  it('en un archivo de solo lectura no cambia', () => {
    const { ed, registro } = editor(true, true)
    expect(ed.cambiarPosicionPot('rv', 80)).toBe(false)
    expect(pos(ed)).toBe('50 %')
    expect(registro.length).toBeGreaterThan(0)
  })

  it('sin simular también cambia (el inspector usa el mismo control)', () => {
    const { ed } = editor(false)
    expect(ed.cambiarPosicionPot('rv', 10)).toBe(true)
    expect(pos(ed)).toBe('10 %')
  })

  it('un potenciómetro sin posición guardada parte de 50 % del modelo', () => {
    const { ed } = editor()
    ed.cargar((() => { const d = documentoVacio(); d.piezas.rv = pot('rv', 0); return d })())
    ed.ponerSimulando(true)
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    ed.pasoPotenciometro(1, false)
    expect(pos(ed)).toBe('55 %')
  })
})

describe('potenciómetro bajo el puntero', () => {
  it('potEn da el potenciómetro cuya pieza o pin está bajo el punto, y nada más', () => {
    const { ed } = editor()
    expect(ed.potEn({ x: 0, y: 0 })).toBe('rv')
    expect(ed.potEn({ x: 4, y: 0.2 })).toBe('rv')
    expect(ed.potEn({ x: 0, y: -4 })).toBe('rv')
    expect(ed.potEn({ x: 40, y: 0 })).toBeNull()
    expect(ed.potEn({ x: 100, y: 100 })).toBeNull()
  })
})

describe('potenciómetro seleccionado: teclado', () => {
  it('potSeleccionado solo es el potenciómetro cuando es lo único seleccionado', () => {
    const { ed } = editor()
    expect(ed.potSeleccionado()).toBeNull()
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    expect(ed.potSeleccionado()).toBe('rv')
    ed.seleccionar(seleccionDe('piezas', 'r1'))
    expect(ed.potSeleccionado()).toBeNull()
    ed.seleccionarTodo()
    expect(ed.potSeleccionado()).toBeNull()
  })

  it('las flechas izquierda y derecha mueven el cursor 5 % y con Shift 1 % mientras se simula', () => {
    const { ed, avanzar } = editor()
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    expect(ed.desplazar(2, 0)).toBe(true)
    expect(pos(ed)).toBe('55 %')
    avanzar(100)
    ed.desplazar(-2, 0)
    ed.desplazar(-2, 0)
    expect(pos(ed)).toBe('45 %')
    // Shift+flecha manda cinco pasos de rejilla (10 unidades).
    ed.desplazar(10, 0)
    expect(pos(ed)).toBe('46 %')
    ed.desplazar(-10, 0)
    expect(pos(ed)).toBe('45 %')
    // Las flechas seguidas son un solo paso de deshacer.
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(pos(ed)).toBe('50 %')
  })

  it('las flechas verticales no hacen nada con el potenciómetro y no mueven la pieza', () => {
    const { ed } = editor()
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    expect(ed.desplazar(0, 2)).toBe(true)
    expect(pos(ed)).toBe('50 %')
    expect(ed.doc.piezas.rv.y).toBe(0)
  })

  it('pasoPotenciometro (+ y −) mueve 5 %, o 1 % en fino, solo con un potenciómetro seleccionado', () => {
    const { ed } = editor()
    ed.pasoPotenciometro(1, false)
    expect(pos(ed)).toBe('50 %')
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    ed.pasoPotenciometro(-1, false)
    expect(pos(ed)).toBe('45 %')
    ed.pasoPotenciometro(1, true)
    expect(pos(ed)).toBe('46 %')
  })

  it('sin simular, las flechas mueven la pieza como siempre', () => {
    const { ed } = editor(false)
    ed.seleccionar(seleccionDe('piezas', 'rv'))
    ed.desplazar(2, 0)
    expect(ed.doc.piezas.rv.x).toBe(2)
    expect(pos(ed)).toBe('50 %')
  })
})
