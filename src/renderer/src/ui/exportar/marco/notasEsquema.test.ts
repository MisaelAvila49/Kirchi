import { describe, expect, it } from 'vitest'
import { COLORES_CLAROS, COLORES_OSCUROS } from '../../colores'
import {
  asasDe,
  borrarNota,
  cajaDeNota,
  cajaDeNotas,
  conNotasEnSvg,
  crearFlecha,
  crearLectura,
  crearLlamada,
  crearResalte,
  crearTexto,
  editarNota,
  fueraDelAreaNota,
  MAX_NOTAS,
  moverAsa,
  moverNota,
  notaEn,
  numeroDe,
  svgDeNotas,
  type NotaEsquema,
  type Notas
} from './notasEsquema'

type Paso = (l: Notas) => { notas: Notas; id: string } | null
const una = (s: { notas: Notas; id: string } | null) => s!
const con = (...f: Paso[]): Notas => f.reduce<Notas>((l, g) => una(g(l)).notas, [])

describe('el modelo de anotaciones del esquema', () => {
  it('crea una nota de cada tipo con nombre propio y valores de omisión', () => {
    const l = con(
      (l) => crearTexto(l, 10, 10),
      (l) => crearFlecha(l, 0, 0, 20, 10),
      (l) => crearResalte(l, 5, 5, 30, 20),
      (l) => crearLlamada(l, 40, 40),
      (l) => crearLectura(l, { x: 12, y: 12, magnitud: 'voltaje', cable: 'c1', pin: null })
    )
    expect(l.map((n) => n.tipo)).toEqual(['texto', 'flecha', 'resalte', 'llamada', 'lectura'])
    expect(new Set(l.map((n) => n.id)).size).toBe(5)
    expect(l[0]).toMatchObject({ texto: 'Texto', tam: 16, negrita: false, tono: 'negro' })
    expect(l[1]).toMatchObject({ grosor: 2, punta: 'cerrada' })
    expect(l[2]).toMatchObject({ forma: 'rectangulo', relleno: false })
  })

  it('no pasa del tope de notas', () => {
    let l: Notas = []
    for (let i = 0; i < MAX_NOTAS; i++) l = una(crearTexto(l, i, i)).notas
    expect(crearTexto(l, 1, 1)).toBeNull()
  })

  it('mueve una nota entera, y una etiqueta de lectura mueve su globo y no su punto', () => {
    const l = con(
      (l) => crearFlecha(l, 0, 0, 10, 10),
      (l) => crearLectura(l, { x: 5, y: 5, magnitud: 'voltaje', cable: null, pin: 'p:1' })
    )
    const f = moverNota(l, l[0].id, 3, 4)[0]
    expect(f).toMatchObject({ x1: 3, y1: 4, x2: 13, y2: 14 })
    const e = l[1] as Extract<NotaEsquema, { tipo: 'lectura' }>
    const m = moverNota(l, e.id, 2, 2)[1] as typeof e
    expect([m.x, m.y]).toEqual([5, 5])
    expect([m.dx, m.dy]).toEqual([e.dx + 2, e.dy + 2])
  })

  it('redimensiona un resalte por una esquina con la contraria fija y respeta el lado mínimo', () => {
    const l = con((l) => crearResalte(l, 10, 10, 20, 10))
    expect(moverAsa(l, l[0].id, 'se', 50, 40)[0]).toMatchObject({ x: 10, y: 10, ancho: 40, alto: 30 })
    expect(moverAsa(l, l[0].id, 'nw', 0, 0)[0]).toMatchObject({ x: 0, y: 0, ancho: 30, alto: 20 })
    const c = moverAsa(l, l[0].id, 'se', 10, 10)[0] as { ancho: number; alto: number }
    expect(c.ancho).toBeGreaterThan(0)
    expect(c.alto).toBeGreaterThan(0)
    expect(asasDe(l[0]).map((s) => s.id)).toEqual(['nw', 'ne', 'sw', 'se'])
  })

  it('estira los extremos de una flecha', () => {
    const l = con((l) => crearFlecha(l, 0, 0, 10, 10))
    expect(moverAsa(l, l[0].id, 'p2', 30, 5)[0]).toMatchObject({ x1: 0, y1: 0, x2: 30, y2: 5 })
    expect(moverAsa(l, l[0].id, 'p1', 2, 2)[0]).toMatchObject({ x1: 2, y1: 2, x2: 10, y2: 10 })
  })

  it('acota tamaños y grosores y no deja un texto vacío', () => {
    const l = con(
      (l) => crearTexto(l, 0, 0),
      (l) => crearFlecha(l, 0, 0, 9, 9)
    )
    expect(editarNota(l, l[0].id, { tam: 200 })[0]).toMatchObject({ tam: 48 })
    expect(editarNota(l, l[0].id, { tam: 1 })[0]).toMatchObject({ tam: 8 })
    expect(editarNota(l, l[0].id, { texto: '   ' })[0]).toMatchObject({ texto: 'Texto' })
    // Mientras se escribe, el espacio del final se conserva (la palabra que sigue va después).
    expect(editarNota(l, l[0].id, { texto: 'Divisor ' })[0]).toMatchObject({ texto: 'Divisor ' })
    expect(editarNota(l, l[1].id, { grosor: 99 })[1]).toMatchObject({ grosor: 8 })
    expect(editarNota(l, l[0].id, { tono: 'inexistente' as never })[0]).toMatchObject({ tono: 'negro' })
  })

  it('borra una nota y las llamadas se renumeran', () => {
    const l = con(
      (l) => crearLlamada(l, 0, 0),
      (l) => crearLlamada(l, 10, 0),
      (l) => crearLlamada(l, 20, 0)
    )
    expect(l.map((n) => numeroDe(l, n.id))).toEqual([1, 2, 3])
    const m = borrarNota(l, l[0].id)
    expect(m.map((n) => numeroDe(m, n.id))).toEqual([1, 2])
    expect(svgDeNotas(m, { tema: 'claro' })).toMatch(/>2<\/text>/)
    expect(svgDeNotas(m, { tema: 'claro' })).not.toMatch(/>3<\/text>/)
    // Una llamada nueva toma el número que sigue y un nombre que no repite ninguno vivo.
    const n = una(crearLlamada(m, 0, 0))
    expect(new Set(n.notas.map((q) => q.id)).size).toBe(3)
    expect(numeroDe(n.notas, n.id)).toBe(3)
  })

  it('el nombre de una nota nueva reutiliza el de una borrada', () => {
    const l = con(
      (l) => crearTexto(l, 0, 0),
      (l) => crearTexto(l, 0, 0)
    )
    expect(una(crearTexto(borrarNota(l, 't1'), 0, 0)).id).toBe('t1')
  })
})

describe('qué hay bajo el puntero', () => {
  const l = con(
    (l) => crearResalte(l, 10, 10, 40, 20),
    (l) => crearTexto(l, 12, 14),
    (l) => crearFlecha(l, 60, 60, 90, 60),
    (l) => crearLlamada(l, 100, 100)
  )
  it('toma el texto, la flecha, la llamada y el borde de un resalte', () => {
    expect(notaEn(l, 14, 14, 1.5)).toBe('t1')
    expect(notaEn(l, 75, 60.5, 1.5)).toBe('f1')
    expect(notaEn(l, 100, 100, 1.5)).toBe('l1')
    expect(notaEn(l, 10, 25, 1.5)).toBe('r1')
  })
  it('el interior de un resalte vacío no se toma, el de uno con relleno sí', () => {
    expect(notaEn(l, 45, 28, 1.5)).toBeNull()
    expect(notaEn(editarNota(l, 'r1', { relleno: true }), 45, 28, 1.5)).toBe('r1')
  })
  it('lo de arriba gana sobre lo de abajo', () => {
    const m = con(
      (q) => crearResalte(q, 0, 0, 40, 40),
      (q) => crearTexto(q, 1, 1)
    )
    expect(notaEn(editarNota(m, 'r1', { relleno: true }), 3, 1, 1.5)).toBe('t1')
  })
  it('un resalte elíptico se toma por su contorno', () => {
    const e = con((q) => crearResalte(q, 0, 0, 40, 20, 'elipse'))
    expect(notaEn(e, 20, 0, 1)).toBe('r1')
    expect(notaEn(e, 20, 10, 1)).toBeNull()
  })
  it('la etiqueta de lectura se toma por su globo y por su punto', () => {
    const q = con((s) => crearLectura(s, { x: 50, y: 50, magnitud: 'voltaje', cable: 'c1', pin: null }))
    const caja = cajaDeNota(q[0])
    expect(notaEn(q, caja.x + 1, caja.y + 1, 1.5)).toBe('e1')
    expect(notaEn(q, 50, 50, 1.5)).toBe('e1')
    expect(notaEn(q, 200, 200, 1.5)).toBeNull()
  })
})

describe('anotaciones fuera del área', () => {
  const area = { x: 0, y: 0, w: 50, h: 50 }
  it('una nota entera fuera no sale; una que cruza el borde sí', () => {
    const l = con(
      (q) => crearLlamada(q, 200, 200),
      (q) => crearResalte(q, 40, 40, 30, 30)
    )
    expect(fueraDelAreaNota(l[0], area)).toBe(true)
    expect(fueraDelAreaNota(l[1], area)).toBe(false)
  })
  it('una etiqueta de lectura cuyo punto está dentro sale aunque su globo quede fuera', () => {
    const l = editarNota(
      con((q) => crearLectura(q, { x: 45, y: 45, magnitud: 'voltaje', cable: null, pin: 'a:1' })),
      'e1',
      { dx: 100, dy: 100 }
    )
    expect(fueraDelAreaNota(l[0], area)).toBe(false)
  })
})

describe('el SVG de las anotaciones', () => {
  const todo = con(
    (l) => crearTexto(l, 10, 10, 'Entrada <A>'),
    (l) => crearFlecha(l, 0, 0, 20, 10),
    (l) => crearResalte(l, 5, 5, 30, 20),
    (l) => crearResalte(l, 5, 5, 30, 20, 'elipse'),
    (l) => crearLlamada(l, 40, 40),
    (l) => crearLectura(l, { x: 12, y: 12, magnitud: 'voltaje', cable: 'c1', pin: null })
  )
  const ctx = { texto: () => '3.333 V' }

  it('lleva cada tipo y el texto escapado', () => {
    const s = svgDeNotas(todo, { tema: 'claro', ctx })
    expect(s).toContain('Entrada &lt;A&gt;')
    expect(s).toMatch(/<line [^>]*data-nota="f1"/)
    expect(s).toMatch(/<polygon [^>]*fill=/)
    expect(s).toMatch(/<rect [^>]*data-nota="r1"/)
    expect(s).toMatch(/<ellipse [^>]*data-nota="r2"/)
    expect(s).toMatch(/<circle [^>]*data-nota="l1"/)
    expect(s).toContain('>3.333 V</text>')
    expect(s).toContain('scale(0.8)')
  })

  it('sin lectura de la vista previa el globo lo dice', () => {
    expect(svgDeNotas(todo, { tema: 'claro' })).toContain('>sin lectura</text>')
  })

  it('los colores salen de la tabla de colores del tema de la lámina', () => {
    const claro = svgDeNotas(todo, { tema: 'claro', ctx })
    const oscuro = svgDeNotas(todo, { tema: 'oscuro', ctx })
    expect(claro).toContain(COLORES_CLAROS.negro)
    expect(claro).toContain(COLORES_CLAROS.naranja)
    expect(oscuro).toContain(COLORES_OSCUROS.negro)
    expect(oscuro).toContain(COLORES_OSCUROS.naranja)
    expect(claro).not.toContain(COLORES_OSCUROS.negro)
  })

  it('el relleno claro del resalte es opcional y la punta de la flecha se elige', () => {
    expect(svgDeNotas(todo, { tema: 'claro' })).not.toContain('fill-opacity')
    expect(svgDeNotas(editarNota(todo, 'r1', { relleno: true }), { tema: 'claro' })).toContain('fill-opacity')
    expect(svgDeNotas(editarNota(todo, 'f1', { punta: 'abierta' }), { tema: 'claro' })).toContain('<polyline')
    const sinPunta = svgDeNotas(editarNota(todo, 'f1', { punta: 'ninguna' }), { tema: 'claro' })
    expect(sinPunta).not.toContain('<polyline')
    expect(sinPunta.match(/<polygon/g)?.length).toBe(1) // solo el rombo de la lectura
  })

  it('se pone antes del cierre de la lámina y sin notas no la toca', () => {
    const lamina = '<svg><rect/></svg>\n'
    const s = conNotasEnSvg(lamina, todo, { tema: 'claro', ctx })
    expect(s.endsWith('</svg>\n')).toBe(true)
    expect(s.indexOf('id="anotaciones"')).toBeGreaterThan(s.indexOf('<rect/>'))
    expect(conNotasEnSvg(lamina, [], { tema: 'claro' })).toBe(lamina)
  })
})

describe('la etiqueta de lectura: tamaño, negrita y caja', () => {
  const etiqueta = (): NotaEsquema => una(crearLectura([], { x: 10, y: 10, magnitud: 'voltaje', cable: 'c1', pin: null })).notas[0]
  it('nace chica, cambia de tamaño y de negrita, y el globo y la letra la siguen', () => {
    const e = etiqueta() as Extract<NotaEsquema, { tipo: 'lectura' }>
    expect(e.tam).toBe(11)
    expect(e.negrita).toBe(false)
    const g = editarNota([e], e.id, { tam: 24, negrita: true })[0] as typeof e
    expect(g.tam).toBe(24)
    expect(cajaDeNota(g).w).toBeGreaterThan(cajaDeNota(e).w * 2)
    const svg = svgDeNotas([g], { tema: 'claro' })
    expect(svg).toContain('font-weight="700"')
    expect(editarNota([e], e.id, { tam: 200 })[0]).toMatchObject({ tam: 48 })
  })
  it('la caja de las anotaciones une el globo con su hilo y su punto, y una etiqueta lejos del dibujo cuenta solo si su punto toca el área', () => {
    const l = una(crearLectura([], { x: 10, y: 10, magnitud: 'voltaje', cable: 'c1', pin: null })).notas
    const todo = cajaDeNotas(l)!
    expect(todo.minY).toBeLessThan(0)
    const area = { minX: 0, minY: 0, maxX: 20, maxY: 20 }
    expect(cajaDeNotas(l, undefined, area)).toEqual(todo)
    const lejos = una(crearTexto([], 500, 500)).notas
    expect(cajaDeNotas(lejos, undefined, area)).toBeNull()
    expect(cajaDeNotas(lejos)).not.toBeNull()
  })
})
