import { describe, expect, it } from 'vitest'
import { comandoDentroDelMundo, LIMITE_COORDENADA } from './limites'
import { conEstilo, enOrden, OPACIDADES, ESTILO_POR_OMISION, estiloDe, leerFigura, normalizarCaja, ordenesAlFrente, siguienteOrden, tieneTamaño } from './figuras'
import { documentoVacio, type Figura } from './tipos'

const caja = (extra: Partial<Figura> = {}): Figura => ({ id: 'f1', tipo: 'rectangulo', x1: 0, y1: 0, x2: 16, y2: 10, orden: 0, ...extra })

describe('estilo de una figura', () => {
  it('sin campos es el de omisión aprobado: gris, 0.25 mm, continuo, sin relleno y punta llena', () => {
    expect(estiloDe(caja())).toEqual(ESTILO_POR_OMISION)
    expect(ESTILO_POR_OMISION).toEqual({ tinta: 'gris', grosor: 0.25, trazo: 'continuo', relleno: false, punta: 'llena', opacidad: 100 })
  })

  it('conEstilo guarda solo lo que difiere de lo de omisión y solo lo que admite el tipo', () => {
    expect(conEstilo(caja(), { tinta: 'azul', grosor: 0.35, relleno: true })).toEqual({ ...caja(), tinta: 'azul', grosor: 0.35, relleno: true })
    // Volver a lo de omisión quita el campo: el archivo queda como antes.
    expect(conEstilo(caja({ tinta: 'azul', relleno: true }), { tinta: 'gris', relleno: false })).toEqual(caja())
    // Una línea no tiene relleno ni punta; una flecha sí tiene punta.
    const linea: Figura = { id: 'l', tipo: 'linea', x1: 0, y1: 0, x2: 8, y2: 0, orden: 0 }
    expect(conEstilo(linea, { relleno: true, punta: 'dos' })).toEqual(linea)
    expect(conEstilo({ ...linea, tipo: 'flecha' }, { punta: 'dos' })).toEqual({ ...linea, tipo: 'flecha', punta: 'dos' })
    expect(conEstilo({ ...linea, tipo: 'flecha', punta: 'abierta' }, { punta: 'llena' })).toEqual({ ...linea, tipo: 'flecha' })
  })

  it('la opacidad se guarda solo si no es 100 %, en cualquier tipo', () => {
    expect(OPACIDADES).toEqual([100, 75, 50, 25])
    expect(conEstilo(caja(), { opacidad: 50 })).toEqual({ ...caja(), opacidad: 50 })
    expect(estiloDe(caja({ opacidad: 25 })).opacidad).toBe(25)
    expect(conEstilo(caja({ opacidad: 75 }), { opacidad: 100 })).toEqual(caja())
    const linea: Figura = { id: 'l', tipo: 'linea', x1: 0, y1: 0, x2: 8, y2: 0, orden: 0 }
    expect(conEstilo(linea, { opacidad: 75 })).toEqual({ ...linea, opacidad: 75 })
  })
})

describe('caja y tamaño', () => {
  it('normalizarCaja ordena las esquinas del rectángulo y la elipse y deja la línea y la flecha como están', () => {
    expect(normalizarCaja(caja({ x1: 16, y1: 10, x2: 0, y2: 0 }))).toEqual(caja())
    const f = caja()
    expect(normalizarCaja(f)).toBe(f)
    const flecha: Figura = { id: 'a', tipo: 'flecha', x1: 10, y1: 4, x2: 0, y2: 0, orden: 0 }
    expect(normalizarCaja(flecha)).toBe(flecha)
  })

  it('una caja sin ancho o sin alto, o una línea de un solo punto, no tiene tamaño', () => {
    expect(tieneTamaño(caja())).toBe(true)
    expect(tieneTamaño(caja({ x2: 0 }))).toBe(false)
    expect(tieneTamaño(caja({ y2: 0 }))).toBe(false)
    expect(tieneTamaño({ tipo: 'linea', x1: 3, y1: 3, x2: 3, y2: 3 })).toBe(false)
    expect(tieneTamaño({ tipo: 'linea', x1: 3, y1: 3, x2: 3, y2: 4 })).toBe(true)
  })
})

describe('orden de dibujo', () => {
  it('enOrden va de la del fondo a la del frente (a igual orden, por id) y siguienteOrden pone la nueva al frente', () => {
    const d = documentoVacio()
    expect(siguienteOrden(d)).toBe(0)
    expect(enOrden(d)).toEqual([])
    d.figuras = { b: caja({ id: 'b', orden: 2 }), a: caja({ id: 'a', orden: 2 }), c: caja({ id: 'c', orden: -1 }) }
    expect(enOrden(d).map((f) => f.id)).toEqual(['c', 'a', 'b'])
    expect(siguienteOrden(d)).toBe(3)
  })
})

describe('leerFigura (lo que trae un .kir)', () => {
  it('una figura válida se lee igual, con sus esquinas en orden y sin los campos de omisión escritos', () => {
    const r = leerFigura({ id: 'f1', tipo: 'rectangulo', x1: 16, y1: 10, x2: 0, y2: 0, orden: 0, tinta: 'gris', grosor: 0.25, trazo: 'continuo' })
    expect(r).toEqual({ figura: caja(), avisos: [] })
  })

  it.each([
    [{ tipo: 'estrella', x1: 0, y1: 0, x2: 1, y2: 1 }, 'tipo de figura desconocido'],
    [{ tipo: 'linea', x1: Number.NaN, y1: 0, x2: 1, y2: 1 }, 'posición no válida'],
    [{ tipo: 'linea', x1: 0, y1: 0, x2: LIMITE_COORDENADA + 1, y2: 1 }, 'posición fuera de rango'],
    [{ tipo: 'elipse', x1: 0, y1: 0, x2: 0, y2: 5 }, 'no tiene tamaño']
  ])('%j se descarta: %s', (datos, error) => {
    expect(leerFigura({ id: 'f1', orden: 0, ...datos })).toEqual({ error })
  })

  it('cada valor alterado se descarta con su aviso y la figura se queda', () => {
    const r = leerFigura({ id: 'f1', tipo: 'linea', x1: 0, y1: 0, x2: 8, y2: 0, orden: 1.5, tinta: '#ff0000', grosor: 1, trazo: 'ondas', relleno: true, punta: 'dos' })
    if ('error' in r) throw new Error(r.error)
    expect(r.figura).toEqual({ id: 'f1', tipo: 'linea', x1: 0, y1: 0, x2: 8, y2: 0, orden: 0 })
    expect(r.avisos).toEqual([
      'Se descartó «orden» de una figura: debe ser un entero.',
      'Se descartó «tinta» de una figura: debe ser una de las cinco tintas.',
      'Se descartó «grosor» de una figura: debe ser 0.25, 0.35, 0.5 o 0.7.',
      'Se descartó «trazo» de una figura: debe ser continuo, guiones o puntos.',
      'Se descartó «relleno» de una figura: solo admite true en un rectángulo o una elipse.',
      'Se descartó «punta» de una figura: solo va en una flecha.'
    ])
  })

  it('la opacidad se lee si es 25, 50 o 75; 100 es lo de omisión escrito y otra cosa se descarta con su aviso', () => {
    const base = { id: 'f1', tipo: 'rectangulo', x1: 0, y1: 0, x2: 16, y2: 10, orden: 0 }
    expect(leerFigura({ ...base, opacidad: 50 })).toEqual({ figura: caja({ opacidad: 50 }), avisos: [] })
    expect(leerFigura({ ...base, opacidad: 100 })).toEqual({ figura: caja(), avisos: [] })
    for (const malo of [0, 60, 0.5, -25, '50', null, 1e9, Number.NaN]) {
      const r = leerFigura({ ...base, opacidad: malo })
      expect(r).toEqual({ figura: caja(), avisos: ['Se descartó «opacidad» de una figura: debe ser 25, 50, 75 o 100.'] })
    }
  })

  it('las llaves de más no pasan y el orden que falta es 0', () => {
    const r = leerFigura({ id: 'f1', tipo: 'flecha', x1: 0, y1: 0, x2: 8, y2: 2, punta: 'abierta', color: '#000', __proto__: { x: 1 } })
    expect(r).toEqual({ figura: { id: 'f1', tipo: 'flecha', x1: 0, y1: 0, x2: 8, y2: 2, orden: 0, punta: 'abierta' }, avisos: [] })
  })

  it('algo que no es un objeto se descarta sin romper', () => {
    expect(leerFigura(null)).toEqual({ error: 'tipo de figura desconocido' })
    expect(leerFigura(7)).toEqual({ error: 'tipo de figura desconocido' })
  })
})

describe('el mundo del .kir', () => {
  it('un comando que deja un extremo de figura fuera del mundo no cabe', () => {
    const dentro = { nombre: 'mover', cambios: [{ col: 'figuras' as const, id: 'f1', despues: caja() }] }
    const fuera = { nombre: 'mover', cambios: [{ col: 'figuras' as const, id: 'f1', despues: caja({ x2: LIMITE_COORDENADA + 2 }) }] }
    expect(comandoDentroDelMundo(dentro)).toBe(true)
    expect(comandoDentroDelMundo(fuera)).toBe(false)
  })
})

describe('orden sin pasar del límite (lo que se guarda siempre se vuelve a abrir completo)', () => {
  it('lejos del límite, las nuevas van al frente sin tocar las demás', () => {
    const d = documentoVacio()
    d.figuras = { a: caja({ id: 'a', orden: 4 }) }
    expect(ordenesAlFrente(d, 2)).toEqual({ primero: 5, renumeradas: [] })
  })

  it('en el límite, las que hay se renumeran desde 0 en su orden y las nuevas siguen', () => {
    const d = documentoVacio()
    d.figuras = { a: caja({ id: 'a', orden: LIMITE_COORDENADA }), b: caja({ id: 'b', orden: -3 }), c: caja({ id: 'c', orden: 1 }) }
    const r = ordenesAlFrente(d, 1)
    expect(r.primero).toBe(3)
    expect(r.renumeradas).toEqual([caja({ id: 'b', orden: 0 }), caja({ id: 'a', orden: 2 })])
  })

  it('un entero fuera del rango se descarta con su motivo; relleno: false es lo de omisión y pasa sin aviso', () => {
    const r = leerFigura({ id: 'f1', tipo: 'rectangulo', x1: 0, y1: 0, x2: 16, y2: 10, orden: LIMITE_COORDENADA + 1 })
    if ('error' in r) throw new Error(r.error)
    expect(r.avisos).toEqual(['Se descartó «orden» de una figura: debe ser un entero de −1,048,576 a 1,048,576.'])
    expect(leerFigura({ id: 'f1', tipo: 'rectangulo', x1: 0, y1: 0, x2: 16, y2: 10, orden: 0, relleno: false })).toEqual({ figura: caja(), avisos: [] })
  })
})
