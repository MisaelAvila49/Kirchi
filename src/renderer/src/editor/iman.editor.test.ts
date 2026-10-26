// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza, type Punto } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { violaciones } from './conflictos'
import { Editor, type Ganchos } from './Editor'
import { radioIman } from './iman'

const lib = libreriaDePrueba().piezas
const R = (id: string, ref: string, x: number, y: number): Pieza => ({ id, tipo: 'resistencia', ref, x, y, rot: 0, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
/** R1 (a) en el origen, pines en (-4, 0) y (4, 0); R2 (b) en (20, 10), pines en (16, 10) y (24, 10). */
function escalera(...cs: Cable[]): Documento {
  const d = documentoVacio()
  d.piezas.a = R('a', 'R1', 0, 0)
  d.piezas.b = R('b', 'R2', 20, 10)
  for (const c of cs) d.cables[c.id] = c
  return d
}
/** `radio`: el del imán (a 100 % de zoom, 12 px son 2.54 unidades, pero el imán no pasa de media celda: 1 unidad). */
function nuevo(doc: Documento, radio = radioIman(4.72), ganchos: Partial<Ganchos> = {}): Editor {
  const ed = new Editor(lib, doc, idSecuencial(), ganchos)
  ed.tolerancia = 6 / 4.72
  ed.radioIman = radio
  return ed
}
const cables = (ed: Editor) => Object.values(ed.doc.cables).map((c) => c.puntos)

describe('imán al cablear: arrastrar de pin a pin', () => {
  it('soltar a menos de media celda del pin lo conecta, con el cable llegando a la posición exacta del pin', () => {
    const ed = nuevo(escalera())
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 10, y: 1 })
    ed.mover({ x: 15.4, y: 10.6 })
    // El pin destino se resalta antes de soltar.
    expect(ed.hover).toEqual({ tipo: 'pin', piezaId: 'b', pinId: '1', x: 16, y: 10 })
    ed.arriba({ x: 15.4, y: 10.6 })
    expect(cables(ed)).toEqual([P([4, 0], [16, 0], [16, 10])])
    expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
  })

  it('sin imán (radio como la tolerancia), el mismo gesto deja una esquina en el vacío', () => {
    const ed = nuevo(escalera(), 0)
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 10, y: 1 })
    ed.mover({ x: 14.6, y: 11.2 })
    ed.arriba({ x: 14.6, y: 11.2 })
    expect(cables(ed)).toEqual([])
    expect(ed.herramienta).toBe('cablear')
  })

  it('mientras se arrastra, el cable en curso termina en el pin imantado y no en el cursor', () => {
    const ed = nuevo(escalera())
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 10, y: 1 })
    ed.mover({ x: 15.5, y: 9.4 })
    expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [16, 0], [16, 10]))
  })

  it('soltar cerca de un cable lo termina ahí con una T y resalta el cable', () => {
    const ed = nuevo(escalera(C('t', [-10, 10], [10, 10])))
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 4.3, y: 5 })
    ed.mover({ x: 4.4, y: 10.7 })
    expect(ed.hover).toEqual({ tipo: 'cable', id: 't', tramo: 0 })
    ed.arriba({ x: 4.4, y: 10.7 })
    expect(cables(ed)).toContainEqual(P([4, 0], [4, 10]))
    expect(ed.con.uniones).toContainEqual({ x: 4, y: 10 })
  })

  it('un pin cercano gana a un cable más cercano al cursor', () => {
    const ed = nuevo(escalera(C('t', [-10, 8], [10, 8], [10, 11], [18, 11])))
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 10, y: 1 })
    // El cable (y = 11) está a 0.3 del cursor; el pin (16, 10) a 0.8.
    ed.mover({ x: 15.6, y: 10.7 })
    expect(ed.hover).toMatchObject({ tipo: 'pin', piezaId: 'b', pinId: '1' })
  })

  it('el cable imantado rodea una pieza en su camino y no rompe el invariante', () => {
    const d = documentoVacio()
    d.piezas.a = R('a', 'R1', 0, 0)
    d.piezas.c = R('c', 'R3', 10, 0)
    d.piezas.b = R('b', 'R2', 20, 0)
    const ed = nuevo(d)
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 4.4, y: 4 })
    // Más cerca del pin 1 de R2 (16, 0) que de cualquier otro: la ruta recta cruzaría el cuerpo de R3.
    ed.mover({ x: 16.6, y: 0.7 })
    expect(ed.hover).toMatchObject({ tipo: 'pin', piezaId: 'b', pinId: '1' })
    ed.arriba({ x: 16.6, y: 0.7 })
    expect(cables(ed)).toHaveLength(1)
    expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    expect(violaciones(ed.doc, lib)).toEqual([])
  })

  it('con un cable de otra red en el camino, lo que queda en el documento respeta el invariante', () => {
    const d = escalera(C('t', [10, -3], [10, 3]))
    d.piezas.b = R('b', 'R2', 20, 0)
    // Un cable de otra red corta el paso recto: el cable imantado se enruta por fuera o se rechaza, nunca queda encima.
    const ed = nuevo(d)
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 4.4, y: 4 })
    ed.mover({ x: 16.6, y: 0.7 })
    ed.arriba({ x: 16.6, y: 0.7 })
    expect(violaciones(ed.doc, lib)).toEqual([])
  })
})

describe('imán al cablear: clic a clic', () => {
  it('con el cable en curso, un clic a menos de media celda de un pin lo termina ahí', () => {
    const ed = nuevo(escalera())
    ed.abajo({ x: 4, y: 0 })
    ed.arriba({ x: 4, y: 0 })
    expect(ed.herramienta).toBe('cablear')
    ed.mover({ x: 15.3, y: 9.5 })
    ed.abajo({ x: 15.3, y: 9.5 })
    ed.arriba({ x: 15.3, y: 9.5 })
    expect(cables(ed)).toEqual([P([4, 0], [16, 0], [16, 10])])
    expect(ed.herramienta).toBe('seleccionar')
  })

  it('un clic cerca de un cable lo termina en su punto de rejilla (T)', () => {
    const ed = nuevo(escalera(C('t', [-10, 10], [10, 10])))
    ed.abajo({ x: 4, y: 0 })
    ed.arriba({ x: 4, y: 0 })
    ed.mover({ x: 4.2, y: 10.8 })
    ed.abajo({ x: 4.2, y: 10.8 })
    ed.arriba({ x: 4.2, y: 10.8 })
    expect(ed.con.uniones).toContainEqual({ x: 4, y: 10 })
  })
})

describe('imán al cablear: empezar cerca de un pin', () => {
  it('apretar a menos de media celda de un pin, fuera del cuerpo, empieza un cable desde ese pin', () => {
    const ed = nuevo(escalera())
    // El cuerpo de la resistencia llega a ~2.5; el pin está en 4.
    ed.abajo({ x: 4.7, y: 0.6 })
    expect(ed.herramienta).toBe('cablear')
    expect(ed.estado().cableEnCurso).toEqual(P([4, 0]))
  })

  it('apretar sobre el cuerpo de la pieza sigue arrastrando la pieza, aunque haya un pin a menos del radio', () => {
    const ed = nuevo(escalera())
    ed.abajo({ x: 2.4, y: 0.5 })
    expect(ed.herramienta).toBe('seleccionar')
    expect([...ed.seleccion.piezas]).toEqual(['a'])
    ed.mover({ x: 6.4, y: 0.5 })
    ed.arriba({ x: 6.4, y: 0.5 })
    expect(ed.doc.piezas.a.x).toBe(4)
  })

  it('apretar lejos de todo pin, en el vacío, sigue siendo un rectángulo de selección', () => {
    const ed = nuevo(escalera())
    ed.abajo({ x: 40, y: 40 })
    expect(ed.herramienta).toBe('seleccionar')
    ed.mover({ x: 45, y: 45 })
    expect(ed.estado().rectangulo).not.toBeNull()
  })

  it('al pasar el cursor cerca de un pin (sin cablear) el pin se resalta', () => {
    const ed = nuevo(escalera())
    ed.mover({ x: 4.7, y: 0.6 })
    expect(ed.hover).toMatchObject({ tipo: 'pin', piezaId: 'a', pinId: '2' })
    ed.mover({ x: 40, y: 40 })
    expect(ed.hover).toBeNull()
  })
})

describe('imán al cablear: una figura no le gana al pin', () => {
  // Un marco de sección con su borde izquierdo a una unidad del pin derecho de R1 (4, 0): sobre el borde, pero a menos de media
  // celda del pin, que gana.
  const conMarco = () => {
    const d = escalera()
    d.figuras = { m: { id: 'm', tipo: 'rectangulo', x1: 5, y1: -10, x2: 30, y2: 20, orden: 0 } }
    return d
  }

  it('apretar sobre el borde del marco cerca del pin empieza un cable desde el pin', () => {
    const ed = nuevo(conMarco())
    ed.mover({ x: 4.8, y: 0.5 })
    expect(ed.hover).toEqual({ tipo: 'pin', piezaId: 'a', pinId: '2', x: 4, y: 0 })
    ed.abajo({ x: 4.8, y: 0.5 })
    expect(ed.herramienta).toBe('cablear')
    expect(ed.seleccion.figuras.size).toBe(0)
  })

  it('lejos de cualquier pin el borde del marco sigue tomando la figura', () => {
    const ed = nuevo(conMarco())
    ed.mover({ x: 5, y: -8 })
    expect(ed.hover).toMatchObject({ tipo: 'figura', id: 'm' })
    ed.abajo({ x: 5, y: -8 })
    ed.arriba({ x: 5, y: -8 })
    expect([...ed.seleccion.figuras]).toEqual(['m'])
  })
})
