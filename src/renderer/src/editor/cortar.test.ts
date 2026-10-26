// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { Atajos, type EventoTecla } from './teclado'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { registrarAtajosDelEditor } from './atajosEditor'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'

const lib = libreriaDePrueba().piezas

function armar() {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  ed.cargar(divisor())
  return { ed, registro }
}

describe('cortar', () => {
  it('copia y borra la selección en un solo paso de deshacer, y pegar la trae de vuelta', () => {
    const { ed } = armar()
    const antes = ed.doc
    ed.seleccionar(seleccionDe('piezas', 'p_r1'))
    ed.cortar()
    expect(ed.doc.piezas.p_r1).toBeUndefined()
    expect(Object.keys(ed.doc.piezas)).toHaveLength(Object.keys(antes.piezas).length - 1)
    expect(ed.puedePegar).toBe(true)
    // Un solo paso: un deshacer devuelve el documento de antes.
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
    ed.cortar()
    ed.seleccionar(seleccionDe('piezas', 'p_r2'))
    ed.mover({ x: 60, y: 60 })
    ed.pegar()
    expect(Object.values(ed.doc.piezas).some((p) => p.tipo === 'resistencia' && p.x >= 60)).toBe(true)
  })

  it('corta cables, etiquetas y notas también', () => {
    const { ed } = armar()
    const d = divisor()
    d.etiquetas.e1 = { id: 'e1', nombre: 'VSAL', x: 30, y: 30, rot: 0 }
    d.notas.n1 = { id: 'n1', x: 50, y: 50, ancho: 20, texto: 'hola' }
    ed.cargar(d)
    for (const [col, id] of [['cables', 'c_a'], ['etiquetas', 'e1'], ['notas', 'n1']] as const) {
      ed.seleccionar(seleccionDe(col, id))
      ed.cortar()
      expect(ed.doc[col][id]).toBeUndefined()
      expect(ed.puedePegar).toBe(true)
    }
  })

  it('sin selección no hace nada; en solo lectura y simulando avisa, no copia y no borra', () => {
    const { ed, registro } = armar()
    ed.cortar()
    expect(ed.puedePegar).toBe(false)
    ed.seleccionar(seleccionDe('piezas', 'p_r1'))
    ed.ponerSimulando(true)
    const doc = ed.doc
    ed.cortar()
    expect(ed.doc).toBe(doc)
    expect(ed.puedePegar).toBe(false)
    expect(registro).toHaveLength(1)
    ed.ponerSimulando(false)
    ed.cargar(doc, { soloLectura: true })
    ed.seleccionar(seleccionDe('piezas', 'p_r1'))
    ed.cortar()
    expect(ed.doc).toBe(doc)
    expect(ed.puedePegar).toBe(false)
  })

  it('Ctrl+X está registrado y no choca con X (reflejar)', () => {
    const a = new Atajos()
    let cortado = 0
    registrarAtajosDelEditor(a, { cortar: () => cortado++, transformar: () => {} } as unknown as Editor, { encuadrar: () => {} })
    expect(a.conflictos()).toEqual([])
    const ev = (m: Partial<EventoTecla>): EventoTecla => ({ key: 'x', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })
    a.despachar(ev({ ctrlKey: true }))
    expect(cortado).toBe(1)
  })
})
