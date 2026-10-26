// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, MENSAJE_SOLO_LECTURA, type PedidoTexto } from './Editor'

const lib = libreriaDePrueba().piezas

/** El divisor abierto en solo lectura, con el reloj quieto y lo que piden los ganchos anotado. */
function abierto() {
  const registro: string[] = []
  const pedidos: PedidoTexto[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t), editarTexto: (p) => pedidos.push(p as PedidoTexto) })
  ed.tolerancia = 0.5
  let t = 0
  ed.ahora = () => t
  ed.cargar(divisor(), { soloLectura: true })
  return { ed, registro, pedidos, avanzar: (ms: number) => (t += ms) }
}

describe('Editor en solo lectura', () => {
  it('ningún comando cambia el documento ni deja pasos de deshacer', () => {
    const { ed, pedidos } = abierto()
    const antes = ed.doc
    // Arrastrar R1 desde su cuerpo.
    ed.abajo({ x: 10, y: -8 })
    ed.mover({ x: 10, y: -2 })
    ed.arriba({ x: 10, y: -2 })
    ed.seleccionarTodo()
    ed.desplazar(2, 0)
    ed.transformar('girar')
    ed.transformar('espejoX')
    ed.copiar()
    ed.pegar()
    ed.duplicar()
    ed.cambiarFormato({ negrita: true })
    ed.borrar()
    ed.dobleClicDerecho({ x: 10, y: -8 })
    // Empezar un cable desde el pin izquierdo de R1 y terminarlo en el de R2.
    ed.abajo({ x: 6, y: -8 })
    ed.arriba({ x: 6, y: -8 })
    ed.mover({ x: 14, y: -8 })
    ed.abajo({ x: 14, y: -8 })
    ed.arriba({ x: 14, y: -8 })
    expect(ed.doc).toBe(antes)
    expect(ed.estado().puedeDeshacer).toBe(false)
    expect(ed.estado().sinGuardar).toBe(false)
    expect(ed.herramienta).toBe('seleccionar')
    expect(pedidos).toEqual([])
  })

  it('no abre el fantasma, ni las etiquetas o notas pendientes, ni el editor de valor', () => {
    const { ed, pedidos } = abierto()
    ed.empezarColocar('resistencia', '4k7', { x: 40, y: 0 })
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.fantasma).toBeNull()
    ed.colocarTierra()
    ed.colocarEtiqueta()
    ed.colocarNota()
    ed.editarValor('p_r1')
    expect(ed.herramienta).toBe('seleccionar')
    expect(pedidos).toEqual([])
    expect(ed.cambiarPropiedad('p_r1', 'valor', '2k2')).toBe(MENSAJE_SOLO_LECTURA)
    expect(ed.doc.piezas.p_r1.props.valor).toBe('1k')
  })

  it('el Registro lo dice como mucho una vez por segundo', () => {
    const { ed, registro, avanzar } = abierto()
    ed.seleccionarTodo()
    for (let i = 0; i < 5; i++) ed.desplazar(2, 0)
    expect(registro).toEqual([MENSAJE_SOLO_LECTURA])
    avanzar(1000)
    ed.borrar()
    expect(registro).toEqual([MENSAJE_SOLO_LECTURA, MENSAJE_SOLO_LECTURA])
  })

  it.each([
    ['pegar', (ed: Editor) => ed.pegar()],
    ['duplicar', (ed: Editor) => ed.duplicar()],
    ['cortar', (ed: Editor) => ed.cortar()],
    ['borrar', (ed: Editor) => ed.borrar()],
    ['transformar', (ed: Editor) => ed.transformar('girar')],
    ['desplazar', (ed: Editor) => void ed.desplazar(2, 0)],
    ['cambiarFormato', (ed: Editor) => void ed.cambiarFormato({ negrita: true })]
  ])('%s avisa que es solo lectura, sin tocar la selección ni dar otro mensaje', (_n, orden) => {
    const { ed, registro, avanzar } = abierto()
    ed.seleccionarTodo()
    ed.copiar()
    const antes = ed.seleccion
    avanzar(1000)
    registro.length = 0
    orden(ed)
    expect(registro).toEqual([MENSAJE_SOLO_LECTURA])
    expect(ed.seleccion).toBe(antes)
  })

  it('pegar y duplicar no cambian la selección aunque haya portapapeles', () => {
    const { ed, registro, avanzar } = abierto()
    ed.mover({ x: 40, y: 40 })
    ed.seleccionarTodo()
    ed.copiar()
    ed.abajo({ x: 200, y: 200 })
    ed.arriba({ x: 200, y: 200 })
    const antes = ed.seleccion
    avanzar(1000)
    ed.pegar()
    avanzar(1000)
    ed.duplicar()
    expect(ed.seleccion).toBe(antes)
    expect(registro.some((m) => m.includes('Se pegó'))).toBe(false)
  })

  it('cargar otro documento sin la marca lo vuelve editable', () => {
    const { ed } = abierto()
    ed.cargar(divisor())
    expect(ed.soloLectura).toBe(false)
    ed.seleccionarTodo()
    ed.borrar()
    expect(Object.keys(ed.doc.piezas)).toEqual([])
  })
})
