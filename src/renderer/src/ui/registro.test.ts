// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Atajos } from '../editor/teclado'
import { agregarAlRegistro, instalarTeclasDelRegistro, NIVELES_REGISTRO, nivelDelRegistro, teclaDelRegistro, textoDelRegistro, type EntradaRegistro } from './registro'

const a = new Date(2026, 9, 14, 9, 5, 7)
const b = new Date(2026, 9, 14, 9, 6, 0)

describe('Registro: copiar', () => {
  it('«Copiar todo» da un renglón por mensaje en el orden en que se ven (el más nuevo arriba), con hora y repeticiones', () => {
    let l: EntradaRegistro[] = []
    l = agregarAlRegistro(l, 'El circuito está vacío: no hay nada que simular.', 'aviso', a)
    l = agregarAlRegistro(l, 'D1 no encontró un punto de trabajo.', 'error', b)
    l = agregarAlRegistro(l, 'D1 no encontró un punto de trabajo.', 'error', b)
    expect(textoDelRegistro(l)).toBe('09:06:00 D1 no encontró un punto de trabajo. (×2)\n09:05:07 El circuito está vacío: no hay nada que simular.')
  })

  it('sin mensajes no hay texto', () => {
    expect(textoDelRegistro([])).toBe('')
  })
})

describe('Registro: niveles', () => {
  it('tres niveles, del más grave al más leve, cada uno con su palabra y el tono de su icono (no solo el color)', () => {
    expect(NIVELES_REGISTRO.map((n) => [n.id, n.nombre, n.tono])).toEqual([
      ['error', 'Error', 'rojo'],
      ['aviso', 'Aviso', 'ambar'],
      ['info', 'Información', 'gris']
    ])
  })

  it('el contador sigue al nivel más grave que hay: error, si no aviso, si no información; sin mensajes, ninguno', () => {
    let l: EntradaRegistro[] = []
    expect(nivelDelRegistro(l)).toBeNull()
    l = agregarAlRegistro(l, 'Se exportó circuito.svg.', 'info', a)
    expect(nivelDelRegistro(l)).toBe('info')
    l = agregarAlRegistro(l, 'No se pegó: no hay lugar libre cerca del cursor.', 'aviso', a)
    expect(nivelDelRegistro(l)).toBe('aviso')
    l = agregarAlRegistro(l, 'D1 no encontró un punto de trabajo.', 'error', b)
    l = agregarAlRegistro(l, 'Se exportó circuito.png.', 'info', b)
    expect(nivelDelRegistro(l)).toBe('error')
  })

  it('el mismo texto con otro nivel es otra entrada', () => {
    let l = agregarAlRegistro([], 'R1 repuesto.', 'info', a)
    l = agregarAlRegistro(l, 'R1 repuesto.', 'aviso', a)
    expect(l.map((e) => [e.tipo, e.veces])).toEqual([['info', 1], ['aviso', 1]])
  })
})

describe('Registro: teclas con el foco en él', () => {
  it('Ctrl+C copia el texto seleccionado (no las piezas) y Ctrl+A selecciona solo los mensajes', () => {
    expect(teclaDelRegistro('Ctrl+C')).toBe('copiar')
    expect(teclaDelRegistro('Ctrl+A')).toBe('seleccionar')
  })

  it('las de edición del lienzo (cortar, pegar, deshacer, rehacer, borrar) son del Registro y no hacen nada; las demás siguen su camino', () => {
    for (const t of ['Ctrl+X', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Supr', 'Retroceso']) expect(teclaDelRegistro(t), t).toBe('propia')
    for (const t of ['C', 'F5', 'Shift+F5', 'Tab', 'Esc']) expect(teclaDelRegistro(t), t).toBeNull()
  })
})

describe('Registro: teclas de verdad con el foco en su panel', () => {
  /** Los atajos del lienzo en la ventana, como en la aplicación, y el panel del Registro con sus mensajes. */
  function armar(activo = true) {
    const hechos: string[] = []
    const atajos = new Atajos()
    for (const [id, teclas] of [['copiar', ['Ctrl+C']], ['seleccionar-todo', ['Ctrl+A']], ['cortar', ['Ctrl+X']], ['pegar', ['Ctrl+V']], ['deshacer', ['Ctrl+Z']], ['rehacer', ['Ctrl+Y', 'Ctrl+Shift+Z']], ['borrar', ['Supr']], ['retroceso', ['Retroceso']], ['simular', ['F5']]] as const)
      atajos.registrar({ id, nombre: id, teclas: [...teclas], ejecutar: () => hechos.push(id) })
    const quitarAtajos = atajos.instalar(window)
    const panel = document.createElement('div')
    panel.tabIndex = 0
    const ol = document.createElement('ol')
    ol.innerHTML = '<li>09:00:00 Falta una tierra.</li>'
    panel.append(ol)
    document.body.append(panel)
    const quitar = instalarTeclasDelRegistro(panel, () => activo, () => ol)
    const tecla = (key: string, o: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o })
      ol.firstElementChild!.dispatchEvent(e)
      return e
    }
    const limpiar = () => {
      quitar()
      quitarAtajos()
      panel.remove()
    }
    return { hechos, tecla, limpiar, ol }
  }

  it('Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Supr y Retroceso no llegan al lienzo; F5 sí', () => {
    const { hechos, tecla, limpiar } = armar()
    for (const [k, o] of [['c', { ctrlKey: true }], ['x', { ctrlKey: true }], ['v', { ctrlKey: true }], ['z', { ctrlKey: true }], ['y', { ctrlKey: true }], ['Z', { ctrlKey: true, shiftKey: true }], ['Delete', {}], ['Backspace', {}]] as const) {
      const e = tecla(k, o)
      // Ctrl+C no se cancela: el navegador copia el texto seleccionado.
      if (k === 'c') expect(e.defaultPrevented).toBe(false)
    }
    expect(hechos).toEqual([])
    tecla('F5')
    expect(hechos).toEqual(['simular'])
    limpiar()
  })

  it('Ctrl+A selecciona solo los mensajes y no la selección del lienzo', () => {
    const { hechos, tecla, limpiar, ol } = armar()
    const e = tecla('a', { ctrlKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(hechos).toEqual([])
    expect(String(getSelection())).toContain('Falta una tierra.')
    expect(ol.contains(getSelection()!.anchorNode)).toBe(true)
    limpiar()
  })

  it('con otra pestaña en el panel, las teclas siguen al lienzo', () => {
    const { hechos, tecla, limpiar } = armar(false)
    tecla('z', { ctrlKey: true })
    tecla('Delete')
    expect(hechos).toEqual(['deshacer', 'borrar'])
    limpiar()
  })
})
