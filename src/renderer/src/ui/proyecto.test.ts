// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, type Conexiones, type Red } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { CATEGORIAS, catalogo, nombreCategoria, recientesDeLibreria } from './catalogo'
import { agruparPiezas, avisosDelCircuito, enumerar, ordenRef, piezasVisibles, plural, recortar, reutilizar, vistaProyecto } from './proyecto'
import { nombresDeRedes, redesVisibles } from './redes'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props: {} })
function doc(...piezas: Pieza[]): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  return d
}
const avisos = (d: Documento) => avisosDelCircuito(d, calcularConexiones(d, lib), lib)

describe('redes', () => {
  const red = (id: number, extra: Partial<Red> = {}): Red => ({ id, tierra: false, pines: [], cables: [], ...extra })

  it('nombres: el de su etiqueta, GND para la tierra y «red N» sin huecos para las demás visibles', () => {
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 6, y: -8, rot: 0 }
    const con = calcularConexiones(d, lib)
    const nombres = nombresDeRedes(d, con)
    expect([...nombres.values()]).toEqual(['GND', 'VSAL', 'red 1'])
    // Un pin suelto no es una red y no gasta número.
    expect(nombres.size).toBe(3)
  })

  it('«red N» se numera por el menor pin en orden natural de referencias, no por posición en la lista', () => {
    // R10 se crea antes (id menor) pero R2 va primero en orden natural.
    const d = doc(pieza('a', 'resistencia', 'R10', 0, 0), pieza('b', 'resistencia', 'R2', 20, 0))
    d.cables.w1 = { id: 'w1', puntos: [{ x: -4, y: 0 }, { x: -4, y: 4 }] }
    d.cables.w2 = { id: 'w2', puntos: [{ x: 16, y: 0 }, { x: 16, y: 4 }] }
    const con = calcularConexiones(d, lib)
    const nombres = nombresDeRedes(d, con)
    expect(nombres.get(con.redDePin.get('b:1')!)).toBe('red 1')
    expect(nombres.get(con.redDePin.get('a:1')!)).toBe('red 2')
  })

  it('agregar una pieza suelta que no ordena antes no renumera', () => {
    const d = divisor()
    const antes = nombresDeRedes(d, calcularConexiones(d, lib))
    d.piezas.z = pieza('z', 'resistencia', 'R9', 100, 100)
    const con = calcularConexiones(d, lib)
    const despues = nombresDeRedes(d, con)
    for (const [id, n] of antes) expect(despues.get(id)).toBe(n)
    expect(despues.size).toBe(antes.size)
  })

  it('un pin suelto no es una red; la tierra va primero y luego las que tienen nombre', () => {
    const con: Conexiones = {
      redes: [red(0, { pines: ['a:1'] }), red(1, { pines: ['a:2', 'b:1'] }), red(2, { nombre: 'VCC', pines: ['c:1'] }), red(3, { tierra: true, pines: ['g:1'] }), red(4, { cables: ['w'] })],
      redDePin: new Map(),
      redDeCable: new Map(),
      redDeEtiqueta: new Map(),
      redDeSonda: new Map(),
      sondasSinUnir: [],
      etiquetaConectada: new Set(),
      uniones: []
    }
    expect(redesVisibles(con).map((r) => r.id)).toEqual([3, 2, 1, 4])
  })
})

describe('panel Proyecto', () => {
  it('el divisor: piezas en orden natural con su valor, redes con sus conexiones y sin avisos', () => {
    const d = divisor()
    const v = vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)))
    expect(v.piezas.map((p) => [p.ref, p.valor])).toEqual([['GND1', 'Tierra'], ['R1', '1 kΩ'], ['R2', '1 kΩ'], ['V1', '5 V']])
    // GND une la tierra, el − de V1 y el pin 2 de R2; las otras dos, dos pines cada una.
    expect(v.redes.map((r) => [r.nombre, r.conexiones])).toEqual([['GND', 3], ['red 1', 2], ['red 2', 2]])
    expect(v.total).toEqual({ piezas: 4, redes: 3 })
  })

  it('cada pieza trae su tipo (para su símbolo) y el tono de su categoría; una pieza desconocida, sin tono', () => {
    const d = divisor()
    d.piezas.x = { id: 'x', tipo: 'misterio', ref: 'X1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
    const v = vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)))
    expect(v.piezas.find((p) => p.ref === 'R1')).toMatchObject({ tipo: 'resistencia', tono: 'azul' })
    expect(v.piezas.find((p) => p.ref === 'V1')).toMatchObject({ tipo: 'fuente-dc', tono: 'ocre' })
    expect(v.piezas.find((p) => p.ref === 'X1')?.tono).toBeUndefined()
  })

  it('el filtro acota piezas y redes, sin acentos, y no cambia los totales', () => {
    const d = divisor()
    const v = vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)), 'RESIST')
    expect(v.piezas.map((p) => p.ref)).toEqual(['R1', 'R2'])
    expect(v.redes).toEqual([])
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)), 'gnd').redes.map((r) => r.nombre)).toEqual(['GND'])
    expect(v.total).toEqual({ piezas: 4, redes: 3 })
  })

  it('la primera opción o el nombre cuando la pieza no tiene valor numérico', () => {
    const d = doc(pieza('s', 'interruptor', 'S1', 0, 0), pieza('d', 'led', 'D1', 20, 0))
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib))).piezas.map((p) => p.valor)).toEqual(['rojo', 'abierto'])
  })

  it('orden natural de referencias', () => {
    expect(['R10', 'R2', 'C1', 'R1'].sort(ordenRef)).toEqual(['C1', 'R1', 'R2', 'R10'])
  })

  it('el orden de referencias es transitivo aunque lleven sufijo o no tengan número', () => {
    expect(['R10', 'R1a', 'R2', 'R1', 'GND', 'R1b', 'GND1'].sort(ordenRef)).toEqual(['GND', 'GND1', 'R1', 'R1a', 'R1b', 'R2', 'R10'])
    expect(['R1b', 'GND1', 'R10', 'R1', 'R2', 'GND', 'R1a'].sort(ordenRef)).toEqual(['GND', 'GND1', 'R1', 'R1a', 'R1b', 'R2', 'R10'])
  })

  it('nombreCategoria: la conocida, o el id con mayúscula inicial', () => {
    expect(nombreCategoria('pasivos')).toBe('Pasivos')
    expect(nombreCategoria('analogicos')).toBe('Analogicos')
  })

  it('plural con separador de miles', () => {
    expect(plural(1, 'red', 'redes')).toBe('1 red')
    expect(plural(5000, 'pieza', 'piezas')).toBe('5,000 piezas')
  })
})

describe('avisos', () => {
  it('un esquema vacío no tiene avisos; sin tierra, lo dice', () => {
    expect(avisos(documentoVacio())).toEqual([])
    expect(avisos(doc(pieza('a', 'resistencia', 'R1', 0, 0)))).toEqual([
      { texto: 'Falta una tierra.', piezas: [] },
      { texto: 'El pin 1 de R1 no está conectado a nada.', piezas: ['a'] },
      { texto: 'El pin 2 de R1 no está conectado a nada.', piezas: ['a'] }
    ])
  })

  it('pines sueltos e islas sin tierra, con las piezas que mencionan', () => {
    // R1 y R2 unidas pin con pin; sus otros pines, sueltos; la tierra está lejos.
    const d = doc(pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 8, 0), pieza('g', 'tierra', 'GND1', 40, 0))
    expect(avisos(d)).toEqual([
      { texto: 'El pin 1 de R1 no está conectado a nada.', piezas: ['a'] },
      { texto: 'El pin 2 de R2 no está conectado a nada.', piezas: ['b'] },
      { texto: 'R1 y R2 no tienen camino a tierra.', piezas: ['a', 'b'] }
    ])
  })

  it('una isla larga lista solo las tres primeras referencias en orden natural y cuenta el resto', () => {
    // Doce resistencias pin con pin, creadas en desorden; la tierra, aparte.
    const ids = [7, 3, 11, 1, 9, 5, 12, 2, 10, 4, 8, 6]
    const ps = ids.map((n) => pieza(`p${n}`, 'resistencia', `R${n}`, n * 8, 0))
    const isla = avisos(doc(...ps, pieza('g', 'tierra', 'GND1', 0, 40))).find((a) => a.piezas.length === 12)!
    expect(isla.texto).toBe('R1, R2, R3 y 9 más no tienen camino a tierra.')
    // Con una más que el tope se listan todas.
    const cuatro = avisos(doc(...ps.filter((p) => ['R1', 'R2', 'R3', 'R4'].includes(p.ref)), pieza('g', 'tierra', 'GND1', 0, 40))).find((a) => a.piezas.length === 4)!
    expect(cuatro.texto).toBe('R1, R2, R3 y R4 no tienen camino a tierra.')
  })

  it('enumerar', () => {
    expect(enumerar([])).toBe('')
    expect(enumerar(['a'])).toBe('a')
    expect(enumerar(['a', 'b'])).toBe('a y b')
    expect(enumerar(['a', 'b', 'c'])).toBe('a, b y c')
  })

  it('una pieza sin modelo eléctrico', () => {
    expect(avisos(doc(pieza('x', 'misterio', 'X1', 0, 0)))).toEqual([
      { texto: 'X1 todavía no tiene modelo eléctrico.', piezas: ['x'] },
      { texto: 'Falta una tierra.', piezas: [] }
    ])
  })

  it('un LED directo sobre la batería da el aviso con las dos piezas; con resistencia no', () => {
    const d = ledConBateria()
    expect(avisos(d)).toEqual([])
    delete d.piezas.p_r1
    d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 14, y: -8 }] }
    expect(avisos(d)).toEqual([{ texto: 'D1 está conectado directo a B1, sin resistencia: agrega una en serie.', piezas: ['p_d1', 'p_b1'] }])
  })

  it('los avisos son independientes: sin modelo, sin tierra y pines sueltos a la vez', () => {
    const d = doc(pieza('x', 'misterio', 'X1', 0, 0), pieza('a', 'resistencia', 'R1', 40, 0))
    expect(avisos(d)).toEqual([
      { texto: 'X1 todavía no tiene modelo eléctrico.', piezas: ['x'] },
      { texto: 'Falta una tierra.', piezas: [] },
      { texto: 'El pin 1 de R1 no está conectado a nada.', piezas: ['a'] },
      { texto: 'El pin 2 de R1 no está conectado a nada.', piezas: ['a'] }
    ])
  })

  it('valores inválidos, con la referencia y sin sacar nada de dentro del valor', () => {
    const conValor = (id: string, ref: string, x: number, valor: string) => ({ ...pieza(id, 'resistencia', ref, x, 0), props: { valor } })
    const d = doc(conValor('a', 'R1', 0, 'abc'), conValor('b', 'R2', 20, '5V'), conValor('c', 'R3', 40, '-5'), conValor('d', 'R4', 60, '4k7x'), pieza('g', 'tierra', 'GND1', 80, 0))
    const textos = avisos(d).map((a) => a.texto).filter((t) => !t.includes('conectado') && !t.includes('camino'))
    expect(textos).toEqual([
      'El valor «abc» de R1 no es válido.',
      'La unidad «5V» de R2 no es compatible: se esperaba Ω.',
      'El valor de R3 debe ser positivo.',
      'El valor «4k7x» de R4 no es válido.'
    ])
    expect(avisos(d).find((a) => a.texto.includes('R4'))?.piezas).toEqual(['d'])
  })

  it('Alimentaciones: cada riel y nombre con voltaje que usa el documento, su voltaje leído y cuántos terminales tiene', () => {
    const t = (id: string, nombre: string): Pieza => ({ ...pieza(id, 'alimentacion', id.toUpperCase(), 0, 0), props: { nombre } })
    const d = doc(t('t1', 'VCC'), t('t2', 'VCC'), t('t3', '-15V'))
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '12' } }
    const con = calcularConexiones(d, lib)
    expect(vistaProyecto(d, lib, con, nombresDeRedes(d, con)).alimentaciones).toEqual([
      { nombre: 'VCC', texto: '12', lectura: '12 V', deNombre: false, terminales: 2 },
      { nombre: '-15V', texto: '-15', lectura: '-15 V', deNombre: true, terminales: 1 }
    ])
    expect(vistaProyecto(divisor(), lib, calcularConexiones(divisor(), lib), new Map()).alimentaciones).toEqual([])
  })

  it('el panel no calcula los avisos: la vista no los trae', () => {
    const d = divisor()
    expect('avisos' in vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)))).toBe(false)
  })
})

describe('catálogo de la Librería', () => {
  it('las categorías salen en el orden de la Librería y cada una en orden alfabético', () => {
    const cats = catalogo(lib)
    const orden = CATEGORIAS.map(([, n]) => n)
    expect(cats.map((c) => c.nombre)).toEqual(orden.filter((n) => cats.some((c) => c.nombre === n)))
    for (const c of cats) {
      const nombres = c.piezas.map((p) => p.def.nombre.es)
      expect(nombres, c.nombre).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')))
    }
    expect(cats.find((c) => c.nombre === 'Pasivos')!.piezas.map((p) => p.def.id)).toEqual(expect.arrayContaining(['capacitor', 'inductor', 'resistencia']))
    expect(cats.reduce((n, c) => n + c.piezas.length, 0)).toBe([...lib.values()].filter((d) => !d.oculta).length)
  })

  it('el filtro usa el buscador: acepta valor y oculta las categorías vacías', () => {
    // La resistencia va primero con su valor; otras piezas que empiezan con «r» pueden seguirla en su categoría.
    const r = catalogo(lib, 'r 4k7')
    expect(r[0].nombre).toBe('Pasivos')
    expect(r[0].piezas[0]).toMatchObject({ def: { id: 'resistencia' }, valor: '4k7' })
    expect(r.every((c) => c.piezas.length > 0)).toBe(true)
    expect(catalogo(lib, 'xyz')).toEqual([])
  })

  it('las recientes que ya no existen se ignoran', () => {
    expect(recientesDeLibreria(lib, ['led', 'borrada', 'resistencia']).map((d) => d.id)).toEqual(['led', 'resistencia'])
  })
})

describe('listas del panel Proyecto', () => {
  it('recortar deja las primeras filas y cuenta el resto', () => {
    const l = Array.from({ length: 5 }, (_, i) => i)
    expect(recortar(l, 3)).toEqual({ filas: [0, 1, 2], resto: 2 })
    expect(recortar(l, 5)).toEqual({ filas: l, resto: 0 })
    expect(recortar(Array.from({ length: 450 }, (_, i) => i)).filas).toHaveLength(200)
  })

  it('reutilizar conserva el mismo objeto si la fila no cambió y toma el nuevo si cambió', () => {
    const previas = new Map<string, { id: string; v: string }>()
    const a = { id: 'a', v: '1k' }, b = { id: 'b', v: '2k' }
    const p1 = reutilizar(previas, [a, b], (t) => t.id, (x, y) => x.v === y.v)
    expect(p1).toEqual([a, b])
    const p2 = reutilizar(previas, [{ id: 'a', v: '1k' }, { id: 'b', v: '3k' }], (t) => t.id, (x, y) => x.v === y.v)
    expect(p2[0]).toBe(a)
    expect(p2[1]).not.toBe(b)
    expect(p2[1].v).toBe('3k')
    const p3 = reutilizar(previas, [{ id: 'b', v: '3k' }], (t) => t.id, (x, y) => x.v === y.v)
    expect(p3[0]).toBe(p2[1])
    expect(previas.size).toBe(1)
  })
})

describe('avisos de las sondas', () => {
  it('una sonda que no toca nada y una cuya entrada ya tiene cable avisan sin impedir simular', () => {
    const d = divisor()
    d.piezas.o = pieza('o', 'osciloscopio', 'XSC1', 80, 0)
    d.sondas = {
      a: { id: 'a', tipo: 'osciloscopio', x: 500, y: 500, instrumento: 'o', entrada: 'A' },
      v: { id: 'v', tipo: 'voltaje', x: 400, y: 400 },
      b: { id: 'b', tipo: 'osciloscopio', x: 0, y: -6, instrumento: 'o', entrada: 'B' }
    }
    d.cables.x = { id: 'x', puntos: [{ x: 72, y: -2 }, { x: 60, y: -2 }] }
    const a = avisos(d).filter((x) => /sonda/i.test(x.texto))
    expect(a).toEqual([
      { texto: 'La sonda A de XSC1 no toca ningún cable ni pin: no mide nada.', piezas: ['o'], leve: true },
      { texto: 'La sonda B de XSC1 no mide: su entrada también tiene un cable.', piezas: ['o'], leve: true },
      { texto: 'Una sonda de voltaje no toca ningún cable ni pin: no mide nada.', piezas: [], leve: true }
    ])
  })
})

describe('lista de piezas plegable', () => {
  it('plegada se oculta, salvo que haya un filtro escrito', () => {
    expect(piezasVisibles(false, '')).toBe(true)
    expect(piezasVisibles(true, '')).toBe(false)
    expect(piezasVisibles(true, '   ')).toBe(false)
    expect(piezasVisibles(true, 'R1')).toBe(true)
  })
})

describe('piezas agrupadas por categoría de la Librería', () => {
  const vista = (d: Documento, filtro = '') => vistaProyecto(d, lib, calcularConexiones(d, lib), nombresDeRedes(d, calcularConexiones(d, lib)), filtro)

  it('cada pieza lleva el id de su categoría y el panel las agrupa en el orden de la Librería, con su nombre, tono y cuenta', () => {
    const d = doc(pieza('r', 'resistencia', 'R1', 0, 0), pieza('v', 'fuente-dc', 'V1', 20, 0), pieza('r2', 'resistencia', 'R2', 40, 0), pieza('d', 'led', 'D1', 60, 0))
    const v = vista(d)
    expect(v.piezas.find((p) => p.ref === 'V1')?.categoria).toBe('fuentes')
    const g = agruparPiezas(v.piezas, v.piezas)
    expect(g.map((x) => [x.id, x.nombre, x.total, x.piezas.map((p) => p.ref)])).toEqual([
      ['pasivos', 'Pasivos', 2, ['R1', 'R2']],
      ['fuentes', 'Fuentes', 1, ['V1']],
      ['semiconductores', 'Semiconductores', 1, ['D1']]
    ])
    expect(g[1].tono).toBeDefined()
  })

  it('con las filas recortadas, la cuenta sigue siendo la de todas las que coinciden', () => {
    const d = doc(pieza('r', 'resistencia', 'R1', 0, 0), pieza('r2', 'resistencia', 'R2', 40, 0))
    const v = vista(d)
    const g = agruparPiezas(v.piezas.slice(0, 1), v.piezas)
    expect(g).toHaveLength(1)
    expect(g[0].total).toBe(2)
    expect(g[0].piezas.map((p) => p.ref)).toEqual(['R1'])
  })

  it('una pieza de tipo desconocido cae en «Otras» al final; el filtro quita los grupos que no coinciden', () => {
    const d = doc(pieza('r', 'resistencia', 'R1', 0, 0), pieza('x', 'misterio', 'X1', 20, 0))
    const g = agruparPiezas(vista(d).piezas, vista(d).piezas)
    expect(g.map((x) => x.nombre)).toEqual(['Pasivos', 'Otras'])
    const f = vista(d, 'R1')
    expect(agruparPiezas(f.piezas, f.piezas).map((x) => x.nombre)).toEqual(['Pasivos'])
  })
})

describe('encapsulados en el panel Proyecto', () => {
  const nand = (id: string, unidad: string): Pieza => ({ id, tipo: 'nand', ref: `U1${unidad}`, x: 0, y: 0, rot: 0, espejo: false, props: { paquete: 'U1', unidad } })

  it('lista cada paquete con sus unidades usadas y libres', () => {
    const d = doc(nand('a', 'A'), nand('b', 'B'), nand('d', 'D'), pieza('r', 'resistencia', 'R1', 0, 0))
    const v = vistaProyecto(d, lib, calcularConexiones(d, lib), new Map())
    expect(v.paquetes).toHaveLength(1)
    expect(v.paquetes[0]).toMatchObject({ paquete: 'U1', unidades: 'A, B y D; C libre' })
    expect(v.paquetes[0].chip).toMatch(/74HC00|NAND/i)
  })

  it('un paquete lleno no dice libres y el filtro lo acota', () => {
    const d = doc(...['A', 'B', 'C', 'D'].map((u) => nand(u, u)))
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), new Map()).paquetes[0].unidades).toBe('A, B, C y D')
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), new Map(), 'zzz').paquetes).toHaveLength(0)
  })

  it('sin piezas agrupadas no hay paquetes', () => {
    const d = divisor()
    expect(vistaProyecto(d, lib, calcularConexiones(d, lib), new Map()).paquetes).toEqual([])
  })
})
