// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas
const op: AnalisisDoc = { id: 'a1', nombre: 'Punto de operación 1', config: { tipo: 'op' } }

function abierto(soloLectura = false) {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.cargar(divisor(), { soloLectura })
  return { ed, registro }
}

describe('análisis en el documento', () => {
  it('guardar crea el análisis y es un solo paso de deshacer', () => {
    const { ed } = abierto()
    expect(ed.guardarAnalisis(op)).toBeNull()
    expect(ed.doc.analisis?.a1).toEqual(op)
    ed.deshacer()
    expect(ed.doc.analisis?.a1).toBeUndefined()
    ed.rehacer()
    expect(ed.doc.analisis?.a1).toEqual(op)
  })

  it('cambiar un análisis guardado deja un paso por cambio y lo mismo no deja ninguno', () => {
    const { ed } = abierto()
    ed.guardarAnalisis({ id: 'a1', nombre: 'T', config: { tipo: 'tran', fin: 0.01 } })
    ed.guardarAnalisis({ id: 'a1', nombre: 'T', config: { tipo: 'tran', fin: 0.01 } })
    ed.guardarAnalisis({ id: 'a1', nombre: 'T', config: { tipo: 'tran', fin: 0.02 } })
    ed.guardarAnalisis({ id: 'a1', nombre: 'T2', config: { tipo: 'tran', fin: 0.02 } })
    expect(ed.doc.analisis?.a1.nombre).toBe('T2')
    ed.deshacer()
    expect(ed.doc.analisis?.a1.nombre).toBe('T')
    ed.deshacer()
    expect((ed.doc.analisis?.a1.config as { fin: number }).fin).toBe(0.01)
    ed.deshacer()
    expect(ed.doc.analisis?.a1).toBeUndefined()
  })

  it('avisa a la interfaz con cada cambio y con deshacer, pero no cuando no cambia nada', () => {
    const { ed } = abierto()
    let avisos = 0
    ed.suscribir(() => avisos++)
    ed.guardarAnalisis(op)
    expect(avisos).toBe(1)
    ed.guardarAnalisis(op)
    expect(avisos).toBe(1)
    ed.borrarAnalisis('a1')
    expect(avisos).toBe(2)
    ed.deshacer()
    expect(avisos).toBeGreaterThanOrEqual(3)
  })

  it('rechaza lo inválido con el mensaje del modelo y no toca el documento', () => {
    const { ed } = abierto()
    const e = ed.guardarAnalisis({ id: 'a1', nombre: 'T', config: { tipo: 'tran', fin: -1 } })
    expect(e).toMatch(/mayor que cero/)
    expect(ed.doc.analisis).toBeUndefined()
  })

  it('borrar quita el análisis y se deshace', () => {
    const { ed } = abierto()
    ed.guardarAnalisis(op)
    expect(ed.borrarAnalisis('a1')).toBeNull()
    expect(ed.doc.analisis?.a1).toBeUndefined()
    ed.deshacer()
    expect(ed.doc.analisis?.a1).toEqual(op)
  })

  it('en solo lectura y con la vista previa activa no cambia nada', () => {
    const lectura = abierto(true)
    expect(lectura.ed.guardarAnalisis(op)).toMatch(/solo lectura|Solo lectura|lectura/)
    expect(lectura.ed.doc.analisis).toBeUndefined()
    const { ed } = abierto()
    ed.ponerSimulando(true)
    expect(ed.guardarAnalisis(op)).not.toBeNull()
    expect(ed.doc.analisis).toBeUndefined()
  })

  it('un análisis no saca el documento del formato anterior hasta que se guarda', async () => {
    const { ed } = abierto()
    const { formatoDe } = await import('../archivo/kir')
    expect(formatoDe(ed.doc)).toBeLessThan(7)
    ed.guardarAnalisis(op)
    expect(formatoDe(ed.doc)).toBe(7)
  })
})
