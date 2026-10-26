// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { copiar, type Fragmento } from './portapapeles'
import { todo } from './seleccion'

const lib = libreriaDePrueba().piezas

function armar() {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  ed.cargar(divisor())
  const f = copiar(divisor(), todo(divisor())) as Fragmento
  return { ed, registro, f }
}
const refs = (ed: Editor) => Object.values(ed.doc.piezas).map((p) => p.ref).sort()

describe('colocar una plantilla (fragmento)', () => {
  it('queda pegada al ratón, un clic la coloca con referencias nuevas y deshacer la quita de una vez', () => {
    const { ed, f } = armar()
    const antes = ed.doc
    expect(ed.empezarColocarFragmento(f, { x: 100, y: 100 })).toBe(true)
    expect(ed.herramienta).toBe('colocar')
    expect(ed.estado().fantasmaFragmento).toMatchObject({ en: { x: 100, y: 100 } })
    ed.mover({ x: 120, y: 100 })
    expect(ed.estado().fantasmaFragmento?.en).toEqual({ x: 120, y: 100 })
    ed.abajo({ x: 120, y: 100 })
    ed.arriba({ x: 120, y: 100 })
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.estado().fantasmaFragmento).toBeNull()
    expect(refs(ed)).toEqual(['GND1', 'GND2', 'R1', 'R2', 'R3', 'R4', 'V1', 'V2'].sort())
    expect(ed.seleccion.piezas.size).toBe(4)
    expect(ed.historial.puedeDeshacer).toBe(true)
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('colocar la misma plantilla dos veces renumera: nunca repite una referencia', () => {
    const { ed, f } = armar()
    for (const x of [100, 200]) {
      ed.empezarColocarFragmento(f, { x, y: 100 })
      ed.abajo({ x, y: 100 })
      ed.arriba({ x, y: 100 })
    }
    const r = refs(ed)
    expect(new Set(r).size).toBe(r.length)
    expect(r.filter((x) => x.startsWith('R'))).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
    expect(r.filter((x) => x.startsWith('V'))).toEqual(['V1', 'V2', 'V3'])
    // Cada colocación fue su propio paso: dos deshacer vuelven al inicio.
    ed.deshacer()
    ed.deshacer()
    expect(Object.keys(ed.doc.piezas)).toHaveLength(4)
  })

  it('no se encima: sobre el circuito el fantasma choca, el clic no coloca ni se corre solo', () => {
    const { ed, f, registro } = armar()
    ed.empezarColocarFragmento(f, { x: 0, y: 0 })
    expect(ed.estado().choque).not.toBeNull()
    ed.abajo({ x: 0, y: 0 })
    ed.arriba({ x: 0, y: 0 })
    expect(Object.keys(ed.doc.piezas)).toHaveLength(4)
    expect(ed.herramienta).toBe('colocar')
    expect(registro.at(-1)).toMatch(/No se colocó la plantilla/)
    ed.mover({ x: 200, y: 200 })
    expect(ed.estado().choque).toBeNull()
  })

  it('Shift sigue colocando; Esc y el clic derecho cancelan sin tocar el documento', () => {
    const { ed, f } = armar()
    ed.empezarColocarFragmento(f, { x: 100, y: 100 })
    ed.abajo({ x: 100, y: 100 }, { shift: true })
    ed.arriba({ x: 100, y: 100 }, { shift: true })
    expect(ed.herramienta).toBe('colocar')
    ed.mover({ x: 200, y: 100 })
    ed.abajo({ x: 200, y: 100 })
    ed.arriba({ x: 200, y: 100 })
    expect(Object.keys(ed.doc.piezas)).toHaveLength(12)
    ed.empezarColocarFragmento(f, { x: 300, y: 100 })
    ed.escape()
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.estado().fantasmaFragmento).toBeNull()
    expect(Object.keys(ed.doc.piezas)).toHaveLength(12)
  })

  it('las flechas y Enter mueven y colocan desde el teclado', () => {
    const { ed, f } = armar()
    ed.empezarColocarFragmento(f, { x: 100, y: 100 })
    expect(ed.desplazar(4, 0)).toBe(true)
    expect(ed.estado().fantasmaFragmento?.en).toEqual({ x: 104, y: 100 })
    ed.colocarConTeclado(false)
    expect(Object.keys(ed.doc.piezas)).toHaveLength(8)
  })

  it('no empieza en solo lectura ni simulando, ni con un fragmento vacío', () => {
    const { ed, f } = armar()
    ed.ponerSimulando(true)
    expect(ed.empezarColocarFragmento(f, { x: 100, y: 100 })).toBe(false)
    ed.ponerSimulando(false)
    expect(ed.empezarColocarFragmento({ ...f, piezas: [], cables: [], etiquetas: [], notas: [], figuras: [] })).toBe(false)
    expect(ed.herramienta).toBe('seleccionar')
  })
})
