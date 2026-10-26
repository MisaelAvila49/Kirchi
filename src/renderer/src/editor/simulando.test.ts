// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, MENSAJE_SIMULANDO, type PedidoCampos, type PedidoTexto } from './Editor'
import { MENSAJE_SOLO_EN_CALIENTE } from './enCaliente'

const lib = libreriaDePrueba().piezas

/** El divisor con un paso en el historial, con el reloj quieto y lo que piden los ganchos anotado. */
function editor() {
  const registro: string[] = []
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t), editarTexto: (p) => pedidos.push(p) })
  ed.tolerancia = 0.5
  let t = 0
  ed.ahora = () => t
  ed.cargar(divisor())
  ed.cambiarPropiedad('p_r1', 'valor', '2k2')
  return { ed, registro, pedidos, avanzar: (ms: number) => (t += ms) }
}

describe('Editor mientras corre la vista previa', () => {
  it('ningún comando cambia el documento, ni deshacer ni rehacer', () => {
    const { ed, pedidos } = editor()
    ed.ponerSimulando(true)
    const antes = ed.doc
    ed.abajo({ x: 10, y: -8 })
    ed.mover({ x: 10, y: -2 })
    ed.arriba({ x: 10, y: -2 })
    ed.seleccionarTodo()
    ed.desplazar(2, 0)
    ed.transformar('girar')
    ed.pegar()
    ed.duplicar()
    ed.cortar()
    ed.borrar()
    ed.deshacer()
    ed.rehacer()
    ed.dobleClicDerecho({ x: 10, y: -8 })
    ed.empezarColocar('resistencia', '4k7', { x: 40, y: 0 })
    ed.colocarTierra()
    ed.editarValor('p_r1')
    // El valor de la resistencia sí cambiaría (en caliente); una propiedad que no es un valor de fuente ni de resistencia, no.
    expect(ed.cambiarPropiedad('p_r1', 'otra', '1k')).toBe(MENSAJE_SOLO_EN_CALIENTE)
    expect(ed.doc).toBe(antes)
    expect(ed.doc.piezas.p_r1.props.valor).toBe('2k2')
    expect(ed.herramienta).toBe('seleccionar')
    // El doble clic sobre R1 abre su editor con la referencia fija y el valor en caliente (editarNombre.test.ts); no cambia nada aún.
    expect(pedidos.map((p) => p.tipo)).toEqual(['pieza'])
  })

  it('un valor que el motor no admitiría (fuera de rango, cero o negativo) se rechaza en el campo y el documento no cambia', () => {
    const { ed } = editor()
    ed.ponerSimulando(true)
    const antes = ed.doc
    expect(ed.cambiarPropiedad('p_r1', 'valor', '1p')).toBe('R1: su resistencia vale 1 pΩ, fuera de lo que admite la vista previa (de 1 µΩ a 1 TΩ).')
    expect(ed.cambiarPropiedad('p_r1', 'valor', '0')).toMatch(/R1/)
    expect(ed.cambiarPropiedad('p_r1', 'valor', '-5k')).toMatch(/R1/)
    expect(ed.cambiarPropiedad('p_r1', 'valor', 'mucho')).toMatch(/mucho/)
    expect(ed.doc).toBe(antes)
    expect(ed.doc.piezas.p_r1.props.valor).toBe('2k2')
    // Uno razonable sí pasa, en caliente.
    expect(ed.cambiarPropiedad('p_r1', 'valor', '3k3')).toBeNull()
    expect(ed.doc.piezas.p_r1.props.valor).toBe('3k3')
  })

  it('se sigue seleccionando: la selección no es parte del documento', () => {
    const { ed } = editor()
    ed.ponerSimulando(true)
    ed.seleccionarTodo()
    expect(ed.seleccion.piezas.size).toBe(4)
    ed.escape()
    expect(ed.seleccion.piezas.size).toBe(0)
  })

  it('al entrar cancela lo que estaba a medias y al salir se vuelve a editar', () => {
    const { ed } = editor()
    ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
    expect(ed.herramienta).toBe('colocar')
    let avisos = 0
    ed.suscribir(() => avisos++)
    ed.ponerSimulando(true)
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.fantasma).toBeNull()
    expect(avisos).toBeGreaterThan(0)
    ed.ponerSimulando(false)
    ed.deshacer()
    expect(ed.doc.piezas.p_r1.props.valor).toBe('1k')
  })

  it('el Registro lo dice como mucho una vez por segundo', () => {
    const { ed, registro, avanzar } = editor()
    ed.ponerSimulando(true)
    ed.seleccionarTodo()
    for (let i = 0; i < 5; i++) ed.desplazar(2, 0)
    expect(registro).toEqual([MENSAJE_SIMULANDO])
    avanzar(1000)
    ed.deshacer()
    expect(registro).toEqual([MENSAJE_SIMULANDO, MENSAJE_SIMULANDO])
  })
})
