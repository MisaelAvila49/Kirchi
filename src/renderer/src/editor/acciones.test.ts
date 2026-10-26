// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar, invertir } from '../doc/comandos'
import { documentoVacio, type Documento, type Pieza, type Rotacion } from '../doc/tipos'
import { calcularConexiones } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { transformar } from '../piezas/transformar'
import { borrarSeleccion, orientar, transformarSeleccion, type Transformacion } from './acciones'
import { seleccionVacia, type Seleccion } from './seleccion'

const R = (id: string, x: number, y: number, rot: Rotacion = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const doc = (...piezas: Pieza[]): Documento => {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  return d
}
const sel = (col: keyof Seleccion, ...ids: string[]) => {
  const s = seleccionVacia()
  ids.forEach((id) => s[col].add(id))
  return s
}
const opPunto = (op: Transformacion, x: number, y: number): [number, number] =>
  op === 'girar' ? [-y + 0, x + 0] : op === 'girarIzq' ? [y + 0, -x + 0] : op === 'espejoX' ? [-x + 0, y] : [x, -y + 0]

describe('orientar', () => {
  it.each([
    [0, false, 'girar', 90, false],
    [270, false, 'girar', 0, false],
    [0, false, 'girarIzq', 270, false],
    [90, true, 'girarIzq', 0, true],
    [90, false, 'espejoX', 270, true],
    [0, false, 'espejoY', 180, true],
    [180, true, 'espejoY', 0, false]
  ] as const)('%d° espejo=%s %s → %d° espejo=%s', (rot, espejo, op, rot2, espejo2) => {
    expect(orientar(rot, espejo, op)).toEqual({ rot: rot2, espejo: espejo2 })
  })

  it('equivale a aplicar la operación al dibujo ya transformado, en las 32 combinaciones', () => {
    for (const rot of [0, 90, 180, 270] as const)
      for (const espejo of [false, true])
        for (const op of ['girar', 'girarIzq', 'espejoX', 'espejoY'] as const) {
          const o = orientar(rot, espejo, op)
          const [x, y] = transformar(3, -1, rot, espejo)
          expect(transformar(3, -1, o.rot, o.espejo), `${rot} ${espejo} ${op}`).toEqual(opPunto(op, x, y))
        }
  })
})

describe('transformarSeleccion: cada pieza en su lugar, los cables no giran', () => {
  it('una sola pieza gira en su lugar', () => {
    const d = aplicar(doc(R('a', 10, 0)), transformarSeleccion(doc(R('a', 10, 0)), sel('piezas', 'a'), 'girar'))
    expect(d.piezas.a).toMatchObject({ x: 10, y: 0, rot: 90 })
  })

  it('un cable seleccionado no gira ni se refleja', () => {
    const d0 = documentoVacio()
    d0.cables.c = { id: 'c', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
    for (const op of ['girar', 'girarIzq', 'espejoX', 'espejoY'] as const) expect(transformarSeleccion(d0, sel('cables', 'c'), op).cambios).toEqual([])
  })

  it('reflejar en X voltea la pieza en su lugar; dos veces la deja como estaba', () => {
    const d0 = doc(R('a', 0, 0))
    const s = sel('piezas', 'a')
    const d = aplicar(d0, transformarSeleccion(d0, s, 'espejoX'))
    expect(d.piezas.a).toMatchObject({ x: 0, y: 0, rot: 0, espejo: true })
    expect(aplicar(d, transformarSeleccion(d, s, 'espejoX')).piezas).toEqual(d0.piezas)
  })

  it('R cuatro veces y Y dos veces regresan la pieza a su estado', () => {
    let d = doc(R('a', 6, 4, 90))
    const s = sel('piezas', 'a')
    for (let k = 0; k < 4; k++) d = aplicar(d, transformarSeleccion(d, s, 'girar'))
    expect(d.piezas.a).toMatchObject({ x: 6, y: 4, rot: 90, espejo: false })
    for (let k = 0; k < 2; k++) d = aplicar(d, transformarSeleccion(d, s, 'espejoY'))
    expect(d.piezas.a).toMatchObject({ x: 6, y: 4, rot: 90, espejo: false })
  })

  it('R gira una etiqueta en su lugar; X e Y la reflejan sobre su punta; las notas no cambian', () => {
    const d0 = documentoVacio()
    d0.etiquetas.e = { id: 'e', nombre: 'VCC', x: 12, y: 8, rot: 0 }
    d0.notas.n = { id: 'n', x: 0, y: 20, ancho: 8, texto: 'x' }
    const s = sel('etiquetas', 'e')
    expect(aplicar(d0, transformarSeleccion(d0, s, 'girar')).etiquetas.e).toMatchObject({ x: 12, y: 8, rot: 90 })
    expect(aplicar(d0, transformarSeleccion(d0, s, 'espejoX')).etiquetas.e).toMatchObject({ x: 12, y: 8, rot: 180 })
    expect(aplicar(d0, transformarSeleccion(d0, s, 'espejoY')).etiquetas.e).toMatchObject({ x: 12, y: 8, rot: 0 })
    expect(transformarSeleccion(d0, sel('notas', 'n'), 'girar').cambios).toEqual([])
  })

  it('Shift+R gira a la izquierda: una pieza y una etiqueta en su lugar, y deshace a R', () => {
    const d0 = doc(R('a', 6, 4))
    d0.etiquetas.e = { id: 'e', nombre: 'VCC', x: 12, y: 8, rot: 0 }
    const s = sel('piezas', 'a')
    const d = aplicar(d0, transformarSeleccion(d0, s, 'girarIzq'))
    expect(d.piezas.a).toMatchObject({ x: 6, y: 4, rot: 270 })
    expect(aplicar(d, transformarSeleccion(d, s, 'girar')).piezas).toEqual(d0.piezas)
    const e = sel('etiquetas', 'e')
    expect(aplicar(d0, transformarSeleccion(d0, e, 'girarIzq')).etiquetas.e).toMatchObject({ x: 12, y: 8, rot: 270 })
  })
})

describe('orientaciones de una etiqueta de red', () => {
  it('X e Y recorren las cuatro orientaciones y cada una se deshace con la misma tecla', () => {
    const e = (rot: Rotacion) => ({ id: 'e', nombre: 'V', x: 12, y: 8, rot })
    const casos: [Rotacion, Transformacion, Rotacion][] = [
      [0, 'espejoX', 180], [180, 'espejoX', 0], [90, 'espejoX', 90], [270, 'espejoX', 270],
      [0, 'espejoY', 0], [180, 'espejoY', 180], [90, 'espejoY', 270], [270, 'espejoY', 90]
    ]
    for (const [rot, op, esperado] of casos) {
      const d0 = documentoVacio()
      d0.etiquetas.e = e(rot)
      const d = aplicar(d0, transformarSeleccion(d0, sel('etiquetas', 'e'), op))
      expect(d.etiquetas.e, `${rot} ${op}`).toMatchObject({ x: 12, y: 8, rot: esperado })
      expect(aplicar(d, transformarSeleccion(d, sel('etiquetas', 'e'), op)).etiquetas.e.rot).toBe(rot)
    }
  })

  it('reflejar una etiqueta sola es un solo paso de deshacer', () => {
    const d0 = documentoVacio()
    d0.etiquetas.e = { id: 'e', nombre: 'V', x: 12, y: 8, rot: 0 }
    const c = transformarSeleccion(d0, sel('etiquetas', 'e'), 'espejoX')
    expect(c.cambios).toHaveLength(1)
    expect(aplicar(aplicar(d0, c), invertir(c))).toEqual(d0)
  })
})

describe('transformarSeleccion: grupo de dos o más elementos', () => {
  const lib = libreriaDePrueba().piezas
  const base = () => {
    const d = doc(R('a', 0, 0), R('b', 20, 0))
    d.cables.c = { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 16, y: 0 }] }
    d.etiquetas.e = { id: 'e', nombre: 'X', x: 10, y: 0, rot: 0 }
    d.figuras = { f: { id: 'f', tipo: 'rectangulo', x1: 0, y1: 4, x2: 20, y2: 8, orden: 0 } }
    d.sondas = { s: { id: 's', tipo: 'corriente', x: 10, y: 0, sentido: 'derecha' } }
    return d
  }
  const todo = () => {
    const s = sel('piezas', 'a', 'b')
    s.cables.add('c')
    s.etiquetas.add('e')
    s.figuras.add('f')
    s.sondas.add('s')
    return s
  }

  it('R gira todo alrededor del centro de la caja: piezas, cables, etiqueta, figura y sonda', () => {
    const d0 = base()
    const d = aplicar(d0, transformarSeleccion(d0, todo(), 'girar', lib))
    // a y b estaban separadas 20 en x: ahora 20 en y, con el mismo orden, y todo gira con la misma regla.
    const a = d.piezas.a, b = d.piezas.b
    expect(a).toMatchObject({ rot: 90 })
    expect(b).toMatchObject({ rot: 90, x: a.x, y: a.y + 20 })
    expect(d.cables.c.puntos).toEqual([{ x: a.x, y: a.y + 4 }, { x: a.x, y: a.y + 16 }])
    expect(d.etiquetas.e).toMatchObject({ x: a.x, y: a.y + 10, rot: 90 })
    expect(d.sondas!.s).toMatchObject({ x: a.x, y: a.y + 10, sentido: 'abajo' })
    // La figura (20 × 4) queda de 4 × 20 con la misma esquina relativa a las piezas.
    const f = d.figuras!
    expect(f.f.x2 - f.f.x1).toBe(4)
    expect(f.f.y2 - f.f.y1).toBe(20)
    expect(f.f.x1).toBe(a.x - 8)
    expect(f.f.y1).toBe(a.y)
  })

  it('un solo paso de deshacer', () => {
    const d0 = base()
    const c = transformarSeleccion(d0, todo(), 'girar', lib)
    expect(invertir(c) && aplicar(aplicar(d0, c), invertir(c))).toEqual(d0)
  })

  it.each(['girar', 'girarIzq', 'espejoX', 'espejoY'] as const)('%s: se conecta igual y todo queda en la rejilla de 2', (op) => {
    const d0 = base()
    const d = aplicar(d0, transformarSeleccion(d0, todo(), op, lib))
    const con = calcularConexiones(d, lib)
    expect(con.redDePin.get('a:2')).toBe(con.redDePin.get('b:1'))
    for (const p of Object.values(d.piezas)) expect(p.x % 2 === 0 && p.y % 2 === 0).toBe(true)
  })

  it.each(['girar', 'girarIzq', 'espejoX', 'espejoY'] as const)('%s dos veces seguidas con su inversa regresa al inicio', (op) => {
    const d0 = base()
    const inv = { girar: 'girarIzq', girarIzq: 'girar', espejoX: 'espejoX', espejoY: 'espejoY' }[op] as Transformacion
    const d1 = aplicar(d0, transformarSeleccion(d0, todo(), op, lib))
    expect(aplicar(d1, transformarSeleccion(d1, todo(), inv, lib))).toEqual(d0)
  })

  it('refleja una etiqueta: X voltea 0 a 180 y Y deja 0', () => {
    const d0 = base()
    const s = sel('piezas', 'a')
    s.etiquetas.add('e')
    expect(aplicar(d0, transformarSeleccion(d0, s, 'espejoX', lib)).etiquetas.e.rot).toBe(180)
    expect(aplicar(d0, transformarSeleccion(d0, s, 'espejoY', lib)).etiquetas.e.rot).toBe(0)
  })

  it('la punta de una etiqueta del grupo arrastra la punta del cable que no se eligió', () => {
    const d0 = doc(R('a', 0, 0), R('b', 20, 0))
    d0.etiquetas.e = { id: 'e', nombre: 'X', x: 10, y: 0, rot: 0 }
    d0.cables.c = { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 10, y: 0 }] }
    const s = sel('piezas', 'a')
    s.etiquetas.add('e')
    const d = aplicar(d0, transformarSeleccion(d0, s, 'espejoX', lib))
    const e = d.etiquetas.e
    expect(d.cables.c.puntos[d.cables.c.puntos.length - 1]).toEqual({ x: e.x, y: e.y })
    expect(e.rot).toBe(180)
  })

  it('un cable no elegido en un pin del grupo se estira hasta el pin nuevo', () => {
    const d0 = base()
    const s = sel('piezas', 'a')
    s.piezas.add('b')
    const d = aplicar(d0, transformarSeleccion(d0, s, 'girar', lib))
    const con = calcularConexiones(d, lib)
    expect(con.redDePin.get('a:2')).toBe(con.redDePin.get('b:1'))
  })
})

describe('transformarSeleccion con cables pegados', () => {
  const lib = libreriaDePrueba().piezas
  const dosConCable = () => {
    const d = doc(R('a', 0, 0), R('b', 20, 0))
    d.cables.c = { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 16, y: 0 }] }
    return d
  }
  const unidos = (d: Documento) => {
    const con = calcularConexiones(d, lib)
    return con.redDePin.get('a:2') !== undefined && con.redDePin.get('a:2') === con.redDePin.get('b:1')
  }
  const ortogonal = (pts: { x: number; y: number }[]) => pts.every((q, i) => i === 0 || q.x === pts[i - 1].x || q.y === pts[i - 1].y)

  it.each(['girar', 'girarIzq', 'espejoX', 'espejoY'] as const)('%s una pieza estira la punta de su cable hasta el pin nuevo y deja la otra', (op) => {
    const d0 = dosConCable()
    const d = aplicar(d0, transformarSeleccion(d0, sel('piezas', 'b'), op, lib))
    expect(unidos(d)).toBe(true)
    expect(ortogonal(d.cables.c.puntos)).toBe(true)
    expect(d.cables.c.puntos[0]).toEqual({ x: 4, y: 0 })
  })

  it('con piezas y cable seleccionados (grupo), el cable gira con ellas y sigue unido', () => {
    const d0 = dosConCable()
    const s = sel('piezas', 'a', 'b')
    s.cables.add('c')
    const d = aplicar(d0, transformarSeleccion(d0, s, 'girar', lib))
    const pts = d.cables.c.puntos
    expect(ortogonal(pts)).toBe(true)
    expect(unidos(d)).toBe(true)
    expect(pts.every((p) => Object.keys(p).sort().join() === 'x,y')).toBe(true)
  })

  describe('orientación absoluta (botones del inspector)', () => {
    it('deja cada pieza con ese giro y reflejo y estira las puntas de sus cables', () => {
      const d0 = dosConCable()
      const d = aplicar(d0, transformarSeleccion(d0, sel('piezas', 'b'), { rot: 180, espejo: true }, lib))
      expect(d.piezas.b).toMatchObject({ x: 20, y: 0, rot: 180, espejo: true })
      expect(unidos(d)).toBe(true)
    })

    it('una pieza que ya tiene ese giro no cambia y las etiquetas no se tocan', () => {
      const d0 = dosConCable()
      d0.etiquetas.e = { id: 'e', nombre: 'VCC', x: 40, y: 0, rot: 0 }
      const s = sel('piezas', 'a')
      s.etiquetas.add('e')
      expect(transformarSeleccion(d0, s, { rot: 0, espejo: false }, lib).cambios).toEqual([])
      expect(orientar(90, true, { rot: 270, espejo: false })).toEqual({ rot: 270, espejo: false })
    })
  })
})

describe('borrarSeleccion', () => {
  it('borra lo seleccionado y se deshace', () => {
    const d0 = divisor()
    const s = sel('piezas', 'p_r1')
    s.cables.add('c_a')
    const cmd = borrarSeleccion(d0, s)
    const d = aplicar(d0, cmd)
    expect(d.piezas.p_r1).toBeUndefined()
    expect(d.cables.c_a).toBeUndefined()
    expect(d.piezas.p_r2).toBeDefined()
    expect(aplicar(d, invertir(cmd))).toEqual(d0)
  })
})
