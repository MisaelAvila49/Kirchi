// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar, invertir } from '../doc/comandos'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { moverSeleccion, moverTramo } from './arrastre'
import { seleccionVacia, type Seleccion } from './seleccion'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const P = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }))
function doc(piezas: Pieza[], cables: Cable[]): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}
const sel = (piezas: string[], cables: string[] = []): Seleccion => {
  const s = seleccionVacia()
  piezas.forEach((id) => s.piezas.add(id))
  cables.forEach((id) => s.cables.add(id))
  return s
}
const mover = (d: Documento, s: Seleccion, dx: number, dy: number) => aplicar(d, moverSeleccion(d, lib, s, dx, dy))

// R1 en el origen: pines (-4, 0) y (4, 0).
describe('moverSeleccion', () => {
  it('mover en el eje del tramo solo lo estira', () => {
    expect(mover(doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])]), sel(['r1']), 2, 0).cables.c1.puntos).toEqual(P([6, 0], [12, 0]))
  })

  it('mover en vertical agrega un quiebre que conserva el horizontal', () => {
    expect(mover(doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])]), sel(['r1']), 0, 2).cables.c1.puntos).toEqual(P([4, 2], [4, 0], [12, 0]))
  })

  it('mover en diagonal pone la esquina sobre la nueva x', () => {
    const d = mover(doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])]), sel(['r1']), 2, 2)
    expect(d.piezas.r1).toMatchObject({ x: 2, y: 2 })
    expect(d.cables.c1.puntos).toEqual(P([6, 2], [6, 0], [12, 0]))
  })

  it('un tramo vertical conserva su vertical', () => {
    // R1 a 90°: pines (0, -4) y (0, 4).
    expect(mover(doc([R('r1', 0, 0, 90)], [C('c2', [0, 4], [0, 10])]), sel(['r1']), 2, 0).cables.c2.puntos).toEqual(P([2, 4], [0, 4], [0, 10]))
  })

  it('el extremo final también se estira, sin invertir el cable', () => {
    expect(mover(doc([R('r1', 0, 0)], [C('c3', [12, 0], [4, 0])]), sel(['r1']), 0, 2).cables.c3.puntos).toEqual(P([12, 0], [4, 0], [4, 2]))
  })

  it('un cable entre dos piezas movidas se traslada entero', () => {
    const d = mover(doc([R('r1', 0, 0), R('r2', 16, 0)], [C('c1', [4, 0], [12, 0])]), sel(['r1', 'r2']), 2, 0)
    expect(d.cables.c1.puntos).toEqual(P([6, 0], [14, 0]))
  })

  it('mueve cables, etiquetas y notas seleccionados', () => {
    const d0 = doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])])
    d0.etiquetas.e1 = { id: 'e1', nombre: 'A', x: 12, y: 0, rot: 0 }
    d0.notas.n1 = { id: 'n1', x: 0, y: 10, ancho: 8, texto: 'x' }
    const s = sel([], ['c1'])
    s.etiquetas.add('e1')
    s.notas.add('n1')
    const d = mover(d0, s, 2, 2)
    // El extremo (4, 0) está sobre el pin de R1, que no se mueve: queda clavado ahí.
    expect(d.cables.c1.puntos).toEqual(P([4, 0], [4, 2], [14, 2]))
    expect(d.etiquetas.e1).toMatchObject({ x: 14, y: 2 })
    expect(d.notas.n1).toMatchObject({ x: 2, y: 12 })
    expect(d.piezas.r1).toBe(d0.piezas.r1)
  })

  it('un cable seleccionado solo se mueve sin soltar los pines donde termina', () => {
    const d = mover(doc([R('r1', 0, 0), R('r2', 20, 0)], [C('c', [4, 0], [16, 0])]), sel([], ['c']), 0, 4)
    expect(d.cables.c.puntos).toEqual(P([4, 0], [4, 4], [16, 4], [16, 0]))
  })

  it('un cable seleccionado también queda clavado a un extremo de cable que no se mueve', () => {
    const d = mover(doc([], [C('s', [0, 0], [10, 0]), C('w', [10, 0], [10, 8])]), sel([], ['s']), 0, 4)
    expect(d.cables.s.puntos).toEqual(P([0, 4], [10, 4], [10, 0]))
    expect(d.cables.w.puntos).toEqual(P([10, 0], [10, 8]))
  })

  it('mover un cable con los dos extremos clavados sobre su propio eje no lo cambia', () => {
    const d0 = doc([R('r1', 0, 0), R('r2', 20, 0)], [C('c', [4, 0], [16, 0])])
    expect(mover(d0, sel([], ['c']), 4, 0).cables.c.puntos).toEqual(P([4, 0], [16, 0]))
  })

  it('una etiqueta movida estira los cables que terminan en ella', () => {
    const d0 = doc([R('r1', 0, 0)], [C('c', [4, 0], [12, 0])])
    d0.etiquetas.e = { id: 'e', nombre: 'VCC', x: 12, y: 0, rot: 0 }
    const s = seleccionVacia()
    s.etiquetas.add('e')
    const d = mover(d0, s, 0, 6)
    expect(d.etiquetas.e).toMatchObject({ x: 12, y: 6 })
    expect(d.cables.c.puntos).toEqual(P([4, 0], [12, 0], [12, 6]))
  })

  it('invertir el comando devuelve el documento', () => {
    const d0 = doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])])
    const cmd = moverSeleccion(d0, lib, sel(['r1']), 2, 2)
    expect(aplicar(aplicar(d0, cmd), invertir(cmd))).toEqual(d0)
  })

  it('un extremo sobre el interior de un cable movido no se estira', () => {
    const d = mover(doc([], [C('s', [0, 10], [10, 10]), C('w', [5, 10], [5, 20])]), sel([], ['s']), 0, 2)
    expect(d.cables.w.puntos).toEqual(P([5, 10], [5, 20]))
    expect(d.cables.s.puntos).toEqual(P([0, 12], [10, 12]))
  })

  it('con desplazamiento cero el documento queda igual pero el comando nombra a los afectados', () => {
    const d0 = doc([R('r1', 0, 0)], [C('c1', [4, 0], [12, 0])])
    const cmd = moverSeleccion(d0, lib, sel(['r1']), 0, 0)
    expect(cmd.cambios.map((c) => c.id).sort()).toEqual(['c1', 'r1'])
    expect(aplicar(d0, cmd)).toEqual(d0)
  })
})

describe('moverTramo', () => {
  const libre = { ini: false, fin: false }

  it('un tramo horizontal solo se mueve en vertical y estira a sus vecinos', () => {
    expect(moverTramo(P([0, 0], [0, -8], [18, -8], [18, 0], [40, 0]), 1, 4, libre)).toEqual(P([0, 0], [0, -4], [18, -4], [18, 0], [40, 0]))
  })

  it('el chipote del usuario: bajar el tramo y = −8 hasta y = 0 deja un solo tramo recto', () => {
    const clavado = { ini: true, fin: true }
    expect(moverTramo(P([0, 0], [0, -8], [18, -8], [18, 0], [40, 0]), 1, 8, clavado)).toEqual(P([0, 0], [40, 0]))
  })

  it('un tramo vertical solo se mueve en horizontal', () => {
    expect(moverTramo(P([0, 0], [10, 0], [10, 10], [20, 10]), 1, -4, libre)).toEqual(P([0, 0], [6, 0], [6, 10], [20, 10]))
  })

  it('el primer o último tramo clavado en un pin agrega un codo para que la punta no se mueva', () => {
    expect(moverTramo(P([4, 0], [16, 0]), 0, 4, { ini: true, fin: true })).toEqual(P([4, 0], [4, 4], [16, 4], [16, 0]))
    expect(moverTramo(P([4, 0], [16, 0], [16, 10]), 0, -2, { ini: true, fin: true })).toEqual(P([4, 0], [4, -2], [16, -2], [16, 10]))
  })

  it('una punta suelta se mueve con su tramo', () => {
    expect(moverTramo(P([4, 0], [16, 0], [16, 10]), 0, 6, libre)).toEqual(P([4, 6], [16, 6], [16, 10]))
    expect(moverTramo(P([4, 0], [16, 0]), 0, 6, { ini: true, fin: false })).toEqual(P([4, 0], [4, 6], [16, 6]))
  })
})
