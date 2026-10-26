// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio } from '../doc/tipos'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas
const nuevo = () => {
  const ed = new Editor(lib, documentoVacio(), idSecuencial())
  ed.tolerancia = 0.5
  return ed
}
const colocar = (ed: Editor, x: number) => {
  ed.empezarColocar('resistencia', undefined, { x, y: 0 })
  ed.abajo({ x, y: 0 })
  ed.arriba({ x, y: 0 })
}

describe('Editor: marca de guardado', () => {
  it('«sin guardar» sigue al historial: colocar ensucia y deshacer limpia', () => {
    const ed = nuevo()
    expect(ed.estado().sinGuardar).toBe(false)
    colocar(ed, 0)
    expect(ed.estado().sinGuardar).toBe(true)
    ed.deshacer()
    expect(ed.estado().sinGuardar).toBe(false)
  })

  it('marcarGuardado limpia y avisa a la interfaz', () => {
    const ed = nuevo()
    colocar(ed, 0)
    let avisos = 0
    ed.suscribir(() => avisos++)
    ed.marcarGuardado()
    expect(ed.estado().sinGuardar).toBe(false)
    expect(avisos).toBe(1)
  })

  it('flechas seguidas después de guardar son otro paso: deshacerlas vuelve a lo guardado', () => {
    let t = 0
    const ed = nuevo()
    ed.ahora = () => t
    colocar(ed, 0)
    ed.seleccionarTodo()
    ed.desplazar(2, 0)
    ed.marcarGuardado()
    t += 100
    ed.desplazar(2, 0)
    expect(ed.estado().sinGuardar).toBe(true)
    ed.deshacer()
    expect(ed.estado().sinGuardar).toBe(false)
    expect(ed.doc.piezas.p_0001.x).toBe(2)
  })

  it('marca() cierra el paso abierto: una flecha mientras se guarda es otro paso y deshacerla vuelve a lo guardado', () => {
    let t = 0
    const ed = nuevo()
    ed.ahora = () => t
    colocar(ed, 0)
    ed.seleccionarTodo()
    ed.desplazar(2, 0)
    const marca = ed.marca()
    t += 100
    ed.desplazar(2, 0)
    ed.marcarGuardado(marca)
    expect(ed.estado().sinGuardar).toBe(true)
    ed.deshacer()
    expect(ed.estado().sinGuardar).toBe(false)
    expect(ed.doc.piezas.p_0001.x).toBe(2)
  })

  it('marca() no cierra el paso de un arrastre con el botón apretado', () => {
    const ed = nuevo()
    colocar(ed, 0)
    ed.abajo({ x: 0, y: 0.5 })
    ed.mover({ x: 4, y: 0.5 })
    const grupo = ed.historial.grupoEnCurso
    expect(grupo).toBeDefined()
    ed.marca()
    expect(ed.historial.grupoEnCurso).toBe(grupo)
  })

  it('cargar deja el documento guardado; con sucio, queda sin guardar', () => {
    const ed = nuevo()
    ed.cargar(divisor())
    expect(ed.estado().sinGuardar).toBe(false)
    ed.cargar(divisor(), { sucio: true })
    expect(ed.estado().sinGuardar).toBe(true)
  })
})
