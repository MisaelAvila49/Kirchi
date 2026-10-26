// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { anclaDeSonda } from '../conexiones/anclas'
import { aplicar } from '../doc/comandos'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza, type Sonda } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'
import { mantenerSondas } from './sondas'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** R1 (pines en −4,0 y 4,0), un cable de R1:2 a (40,0) y el osciloscopio XSC1 (A en 72,−6). */
function circuito(sondas: Record<string, Sonda> = {}, extra: Partial<Documento> = {}): Documento {
  const d = documentoVacio()
  d.piezas.r = pieza('r', 'resistencia', 'R1', 0, 0)
  d.piezas.o = pieza('o', 'osciloscopio', 'XSC1', 80, 0)
  d.cables.c = C('c', [4, 0], [40, 0])
  d.sondas = sondas
  return { ...d, ...extra }
}

describe('lo que toca una sonda', () => {
  it('prefiere un pin, luego una etiqueta y luego el cable de menor id', () => {
    const d = circuito({}, { etiquetas: { e: { id: 'e', nombre: 'X', x: 20, y: 0, rot: 0 } }, cables: { c: C('c', [4, 0], [40, 0]), b: C('b', [10, -10], [10, 10]) } })
    expect(anclaDeSonda(d, lib, 4, 0)).toEqual({ tipo: 'pin', clave: 'r:2' })
    expect(anclaDeSonda(d, lib, 20, 0)).toEqual({ tipo: 'etiqueta', id: 'e' })
    expect(anclaDeSonda(d, lib, 10, 0)).toEqual({ tipo: 'cable', id: 'b' })
    expect(anclaDeSonda(d, lib, 30, 0)).toEqual({ tipo: 'cable', id: 'c' })
    expect(anclaDeSonda(d, lib, 40, 0)).toEqual({ tipo: 'cable', id: 'c' })
    expect(anclaDeSonda(d, lib, 30, 2)).toBeNull()
    // Un cable de un solo punto no existe para las conexiones: tampoco ancla.
    expect(anclaDeSonda({ ...d, cables: { u: C('u', [50, 50], [50, 50]) } }, lib, 50, 50)).toBeNull()
  })
})

describe('mantener las sondas tras un cambio', () => {
  it('sin sondas no hace nada', () => {
    const d = circuito()
    expect(mantenerSondas(d, d, lib, calcularConexiones(d, lib)).cmd).toBeNull()
  })

  it('una sonda que sigue tocando su cable no se mueve', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } })
    const despues = { ...d, cables: { c: C('c', [4, 0], [36, 0]) } }
    expect(mantenerSondas(d, despues, lib, calcularConexiones(d, lib)).cmd).toBeNull()
  })

  it('el cable movido se lleva la sonda al punto más cercano', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } })
    const despues = { ...d, cables: { c: C('c', [4, 0], [4, 4], [40, 4]) } }
    const cmd = mantenerSondas(d, despues, lib, calcularConexiones(d, lib)).cmd!
    expect(aplicar(despues, cmd).sondas!.v).toEqual({ id: 'v', tipo: 'voltaje', x: 30, y: 4 })
  })

  it('sin cable, la sonda se va al pin de su red; sin nada de su red, se borra', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } })
    const sinCable = { ...d, cables: {} }
    expect(aplicar(sinCable, mantenerSondas(d, sinCable, lib, calcularConexiones(d, lib)).cmd!).sondas!.v).toMatchObject({ x: 4, y: 0 })
    const sinNada = { ...d, cables: {}, piezas: { o: d.piezas.o } }
    expect(aplicar(sinNada, mantenerSondas(d, sinNada, lib, calcularConexiones(d, lib)).cmd!).sondas!.v).toBeUndefined()
  })

  it('una sonda de osciloscopio no se muda a la entrada de su propio instrumento', () => {
    // El cable une el pin A de XSC1 con (40,−6); la sonda de A está sobre el cable. Sin el cable solo queda el pin A.
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 50, y: -6, instrumento: 'o', entrada: 'A' } }, { cables: { c: C('c', [40, -6], [72, -6]) } })
    const sin = { ...d, cables: {} }
    expect(aplicar(sin, mantenerSondas(d, sin, lib, calcularConexiones(d, lib)).cmd!).sondas!.s).toBeUndefined()
  })

  it('una sonda de corriente queda en el interior de un tramo y toma su orientación', () => {
    const d = circuito({ i: { id: 'i', tipo: 'corriente', x: 30, y: 0, sentido: 'izquierda' } })
    const vertical = { ...d, cables: { c: C('c', [4, 0], [4, 30]) } }
    const s = aplicar(vertical, mantenerSondas(d, vertical, lib, calcularConexiones(d, lib)).cmd!).sondas!.i
    expect(s).toMatchObject({ x: 4, sentido: 'abajo' })
    expect(s.y).toBeGreaterThan(0)
    expect(s.y).toBeLessThan(30)
    // Un tramo horizontal conserva el sentido elegido.
    const corrido = { ...d, cables: { c: C('c', [4, 0], [4, 2], [40, 2]) } }
    expect(aplicar(corrido, mantenerSondas(d, corrido, lib, calcularConexiones(d, lib)).cmd!).sondas!.i).toMatchObject({ x: 30, y: 2, sentido: 'izquierda' })
  })
})

describe('una sonda no cambia de red sin avisar', () => {
  it('un cable de otra red que se cruza en su punto la aparta del cruce, sobre su red', () => {
    // La sonda está en (30,0) sobre `c`; el cable `a` (otra red, id menor) pasa ahora en vertical por (30,0) sin unión.
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } }, { cables: { c: C('c', [4, 0], [40, 0]), a: C('a', [30, -20], [30, -10]) } })
    const despues = { ...d, cables: { ...d.cables, a: C('a', [30, -20], [30, 20]) } }
    const r = mantenerSondas(d, despues, lib, calcularConexiones(d, lib))
    const v = aplicar(despues, r.cmd!).sondas!.v
    expect(v.y).toBe(0)
    expect(Math.abs(v.x - 30)).toBe(2)
  })

  it('al mudarse no cae en un cruce con otra red', () => {
    // `c` se baja a y = 4; el punto más cercano a (30,0) sería (30,4), donde pasa `a` (otra red).
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 0 } }, { cables: { c: C('c', [4, 0], [40, 0]), a: C('a', [30, 2], [30, 20]) } })
    const despues = { ...d, cables: { ...d.cables, c: C('c', [4, 0], [4, 4], [40, 4]) } }
    const v = aplicar(despues, mantenerSondas(d, despues, lib, calcularConexiones(d, lib)).cmd!).sondas!.v
    expect(v.y).toBe(4)
    expect(v.x).not.toBe(30)
  })
})

describe('la entrada con sonda no se cablea', () => {
  it('un cable que llega a la entrada con sonda quita la sonda en el mismo paso y lo dice', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 30, y: 0, instrumento: 'o', entrada: 'A' } })
    const despues = { ...d, cables: { ...d.cables, d: C('d', [60, -6], [72, -6]) } }
    const r = mantenerSondas(d, despues, lib, calcularConexiones(d, lib), [{ col: 'cables', id: 'd', despues: despues.cables.d }])
    expect(aplicar(despues, r.cmd!).sondas!.s).toBeUndefined()
    expect(r.avisos).toEqual(['Se quitó la sonda A de XSC1: su entrada ya tiene un cable.'])
  })

  it('solo revisa las sondas que toca el cambio', () => {
    // La sonda v quedó en el aire en un documento alterado; un cambio lejano no la toca.
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 30, y: 50 } })
    const despues = { ...d, notas: { n: { id: 'n', x: 0, y: 0, ancho: 8, texto: 'x' } } }
    expect(mantenerSondas(d, despues, lib, calcularConexiones(d, lib), [{ col: 'notas', id: 'n', despues: despues.notas.n }]).cmd).toBeNull()
  })
})

describe('las sondas en el editor', () => {
  it('borrar el osciloscopio borra sus sondas en un solo paso de deshacer', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 30, y: 0, instrumento: 'o', entrada: 'A' }, v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } })
    const ed = new Editor(lib, d, idSecuencial())
    ed.seleccionar(seleccionDe('piezas', 'o'))
    ed.borrar()
    expect(ed.doc.piezas.o).toBeUndefined()
    expect(Object.keys(ed.doc.sondas ?? {})).toEqual(['v'])
    ed.deshacer()
    expect(Object.keys(ed.doc.sondas ?? {}).sort()).toEqual(['s', 'v'])
  })

  it('una sonda seleccionada se borra con Supr; Ctrl+A las selecciona', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } })
    const ed = new Editor(lib, d, idSecuencial())
    ed.seleccionarTodo()
    expect([...ed.seleccion.sondas]).toEqual(['v'])
    ed.seleccionar(seleccionDe('sondas', 'v'))
    ed.borrar()
    expect(ed.doc.sondas?.v).toBeUndefined()
  })

  it('borrar el cable bajo una sonda la borra con él, y deshacer devuelve las dos cosas', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }, { piezas: {} })
    const ed = new Editor(lib, d, idSecuencial())
    ed.seleccionar(seleccionDe('cables', 'c'))
    ed.borrar()
    expect(ed.doc.cables.c).toBeUndefined()
    expect(ed.doc.sondas?.v).toBeUndefined()
    ed.deshacer()
    expect(ed.doc.cables.c).toBeDefined()
    expect(ed.doc.sondas?.v).toBeDefined()
  })

  it('copiar y pegar el osciloscopio con su cable lleva la sonda al instrumento nuevo, y deshacer quita todo', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 30, y: 0, instrumento: 'o', entrada: 'A' } })
    const ed = new Editor(lib, d, idSecuencial())
    const sel = seleccionDe('piezas', 'o')
    sel.cables.add('c')
    sel.piezas.add('r')
    ed.seleccionar(sel)
    ed.copiar()
    ed.cursor = { x: 120, y: 60 }
    ed.pegar()
    const nuevas = Object.values(ed.doc.sondas ?? {}).filter((s) => s.id !== 's')
    expect(nuevas).toHaveLength(1)
    const osc = Object.values(ed.doc.piezas).find((p) => p.tipo === 'osciloscopio' && p.id !== 'o')!
    expect(nuevas[0]).toMatchObject({ instrumento: osc.id, entrada: 'A' })
    // La sonda nueva sigue sobre el cable nuevo (el mantenimiento de sondas no la movió ni la borró) y es de la red de su instrumento.
    expect(ed.con.redDeSonda.get(nuevas[0].id)).toBeDefined()
    expect([...ed.seleccion.sondas]).toEqual([nuevas[0].id])
    ed.deshacer()
    expect(Object.keys(ed.doc.sondas ?? {})).toEqual(['s'])
  })

  it('copiar y pegar un osciloscopio con sondas pega solo el osciloscopio', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 30, y: 0, instrumento: 'o', entrada: 'A' } })
    const ed = new Editor(lib, d, idSecuencial())
    ed.seleccionar(seleccionDe('piezas', 'o'))
    ed.copiar()
    ed.cursor = { x: 120, y: 40 }
    ed.pegar()
    expect(Object.values(ed.doc.piezas).filter((p) => p.tipo === 'osciloscopio')).toHaveLength(2)
    expect(Object.keys(ed.doc.sondas ?? {})).toEqual(['s'])
  })
})

describe('tomar una sonda con el ratón', () => {
  const centro = (ed: Editor, id: string) => {
    const c = ed.banderas().get(id)!.caja
    return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 }
  }
  /** Dónde está el puntero cuando la sonda `id`, tomada por el centro de su bandera en `q`, debe quedar en (x, y). La
   * bandera flota fuera del cable, así que el puntero nunca está sobre el punto. */
  const llevar = (ed: Editor, id: string, q: { x: number; y: number }, x: number, y: number) => {
    const s = ed.doc.sondas![id]
    return { x: x + q.x - s.x, y: y + q.y - s.y }
  }
  const nuevoEd = (d: Documento, registro: string[] = []) => {
    const ed = new Editor(lib, d, idSecuencial(), { registrar: (t) => registro.push(t) })
    ed.tolerancia = 0.5
    return ed
  }
  it('el ratón sobre la bandera la resalta y un clic la selecciona', () => {
    const ed = nuevoEd(circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }))
    const q = centro(ed, 'v')
    ed.mover(q)
    expect(ed.estado().hover).toEqual({ tipo: 'sonda', id: 'v' })
    ed.abajo(q)
    ed.arriba(q)
    expect([...ed.seleccion.sondas]).toEqual(['v'])
    expect(ed.doc.sondas!.v).toMatchObject({ x: 20, y: 0 })
  })

  it('arrastrarla la lleva a otro punto del cable en un solo paso de deshacer', () => {
    const ed = nuevoEd(circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }))
    const q = centro(ed, 'v')
    ed.abajo(q)
    ed.mover({ x: q.x + 6, y: q.y })
    ed.mover(llevar(ed, 'v', q, 30.3, 0.2))
    expect(ed.estado().sondaArrastrada).toMatchObject({ id: 'v', x: 30, y: 0, valida: true })
    ed.arriba(llevar(ed, 'v', q, 30.3, 0.2))
    expect(ed.doc.sondas!.v).toMatchObject({ x: 30, y: 0 })
    expect(ed.estado().sondaArrastrada).toBeNull()
    ed.deshacer()
    expect(ed.doc.sondas!.v).toMatchObject({ x: 20, y: 0 })
  })

  it('tomada por su bandera (fuera del cable) y llevada con el mismo gesto, la sonda sigue al puntero por el cable', () => {
    const ed = nuevoEd(circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }))
    const q = centro(ed, 'v')
    // La bandera no está sobre el cable: el puntero que la sostiene queda a más de una celda de él.
    expect(Math.hypot(q.x - 20, q.y - 0)).toBeGreaterThan(1.5)
    ed.abajo(q)
    // Un gesto real: muchos movimientos pequeños, todos con el desfase del agarre, hasta 8 unidades a la derecha.
    for (let i = 1; i <= 16; i++) ed.mover({ x: q.x + i * 0.5, y: q.y })
    expect(ed.estado().sondaArrastrada).toMatchObject({ id: 'v', x: 28, y: 0, valida: true })
    ed.arriba({ x: q.x + 8, y: q.y })
    expect(ed.doc.sondas!.v).toMatchObject({ x: 28, y: 0 })
    ed.deshacer()
    expect(ed.doc.sondas!.v).toMatchObject({ x: 20, y: 0 })
  })

  it('soltarla en el aire no la mueve y el Registro dice por qué', () => {
    const registro: string[] = []
    const ed = nuevoEd(circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }), registro)
    const q = centro(ed, 'v')
    ed.abajo(q)
    ed.mover({ x: 20, y: 30 })
    expect(ed.estado().sondaArrastrada).toMatchObject({ valida: false })
    ed.arriba({ x: 20, y: 30 })
    expect(ed.doc.sondas!.v).toMatchObject({ x: 20, y: 0 })
    expect(registro).toContain('La sonda tiene que quedar sobre un cable o un pin.')
  })

  it('una de corriente solo se suelta en un tramo y toma su orientación', () => {
    const d = circuito({ i: { id: 'i', tipo: 'corriente', x: 20, y: 0, sentido: 'izquierda' } }, { cables: { c: C('c', [4, 0], [40, 0]), b: C('b', [40, 0], [40, 20]) } })
    const ed = nuevoEd(d)
    const q = centro(ed, 'i')
    ed.abajo(q)
    ed.mover(llevar(ed, 'i', q, 40.2, 10))
    ed.arriba(llevar(ed, 'i', q, 40.2, 10))
    expect(ed.doc.sondas!.i).toMatchObject({ x: 40, y: 10, sentido: 'abajo' })
  })

  it('se suelta en cualquier punto de los cables de su red, aunque otra red pase más cerca', () => {
    // La sonda en el cable c (y = 0, de 4 a 40); un cable de otra red corre paralelo a 1 unidad (y = 1).
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 10, y: 0 } }, { cables: { c: C('c', [4, 0], [40, 0]), x: C('x', [14, 1], [26, 1]) } })
    const ed = nuevoEd(d)
    ed.tolerancia = 1
    expect(ed.con.redDeCable.get('x')).not.toBe(ed.con.redDeCable.get('c'))
    const q = centro(ed, 'v')
    ed.abajo(q)
    ed.mover({ x: q.x + 4, y: q.y })
    // El puntero está a 0.4 del cable ajeno y a 0.6 del propio: gana el de su red.
    ed.mover(llevar(ed, 'v', q, 20, 0.6))
    expect(ed.estado().sondaArrastrada).toMatchObject({ id: 'v', x: 20, y: 0, valida: true })
    ed.arriba(llevar(ed, 'v', q, 20, 0.6))
    expect(ed.doc.sondas!.v).toMatchObject({ x: 20, y: 0, tipo: 'voltaje' })
    // Un paso de deshacer.
    ed.deshacer()
    expect(ed.doc.sondas!.v).toMatchObject({ x: 10, y: 0 })
  })

  it('soltarla en un cable de otra red no la mueve y el Registro dice por qué', () => {
    const registro: string[] = []
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 10, y: 0 } }, { cables: { c: C('c', [4, 0], [40, 0]), x: C('x', [20, 10], [20, 20]) } })
    const ed = nuevoEd(d, registro)
    const q = centro(ed, 'v')
    ed.abajo(q)
    ed.mover(llevar(ed, 'v', q, 20, 14))
    expect(ed.estado().sondaArrastrada).toMatchObject({ valida: false })
    ed.arriba(llevar(ed, 'v', q, 20, 14))
    expect(ed.doc.sondas!.v).toMatchObject({ x: 10, y: 0 })
    expect(registro).toContain('La sonda solo se mueve por los cables de su red.')
  })

  it('con la bandera seleccionada, las flechas la llevan por su red en un paso de deshacer', () => {
    const registro: string[] = []
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 10, y: 0 } })
    const ed = nuevoEd(d, registro)
    ed.seleccionar(seleccionDe('sondas', 'v'))
    expect(ed.desplazar(2, 0)).toBe(true)
    expect(ed.doc.sondas!.v).toMatchObject({ x: 12, y: 0 })
    ed.desplazar(2, 0)
    ed.desplazar(-2, 0)
    ed.desplazar(-2, 0)
    ed.desplazar(-2, 0)
    expect(ed.doc.sondas!.v).toMatchObject({ x: 8, y: 0 })
    // Todo seguido es un solo paso de deshacer.
    ed.deshacer()
    expect(ed.doc.sondas!.v).toMatchObject({ x: 10, y: 0 })
    // Hacia arriba no hay cable de su red: se queda y el Registro lo dice.
    ed.desplazar(0, -2)
    expect(ed.doc.sondas!.v).toMatchObject({ x: 10, y: 0 })
    expect(registro).toContain('La sonda no tiene más cable de su red en esa dirección.')
    // El extremo del cable es el límite hacia la derecha: se detiene en el último punto de su red.
    for (let i = 0; i < 30; i++) ed.desplazar(2, 0)
    expect(ed.doc.sondas!.v).toMatchObject({ x: 40, y: 0, tipo: 'voltaje' })
  })

  it('una sonda de osciloscopio conserva su instrumento y su entrada al moverse con las flechas', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 20, y: 0, instrumento: 'o', entrada: 'A' } })
    const ed = nuevoEd(d)
    ed.seleccionar(seleccionDe('sondas', 's'))
    ed.desplazar(2, 0)
    expect(ed.doc.sondas!.s).toMatchObject({ x: 22, y: 0, tipo: 'osciloscopio', instrumento: 'o', entrada: 'A' })
  })

  it('el clic derecho sobre la bandera da el menú de la sonda', () => {
    const ed = nuevoEd(circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } }))
    expect(ed.objetivoMenu(centro(ed, 'v'))).toMatchObject({ tipo: 'sonda', id: 'v' })
  })
})

describe('mover una selección con sondas', () => {
  it('las sondas seleccionadas se mueven con lo demás', () => {
    const d = circuito({ v: { id: 'v', tipo: 'voltaje', x: 20, y: 0 } })
    const ed = new Editor(lib, d, idSecuencial())
    ed.tolerancia = 0.5
    const s = seleccionDe('cables', 'c')
    s.sondas.add('v')
    ed.seleccionar(s)
    ed.abajo({ x: 30, y: 0 })
    ed.mover({ x: 36, y: 4 })
    ed.arriba({ x: 36, y: 4 })
    expect(ed.doc.sondas!.v).toMatchObject({ x: 26, y: 4 })
  })
})

describe('un cable termina en el punto de una etiqueta (B1)', () => {
  it('arrastrando desde un pin hasta cerca del punto de la etiqueta, el cable se pega ahí y queda en su red', () => {
    const d = documentoVacio()
    d.piezas.r = pieza('r', 'resistencia', 'R1', 0, 0)
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 20, y: 0, rot: 0 }
    const ed = new Editor(lib, d, idSecuencial())
    ed.tolerancia = 0.5
    ed.abajo({ x: 4, y: 0 })
    ed.mover({ x: 12, y: 0 })
    // A menos del radio del imán (sin zoom, el de la tolerancia).
    ed.mover({ x: 20.2, y: 0.2 })
    ed.arriba({ x: 20.2, y: 0.2 })
    const [c] = Object.values(ed.doc.cables)
    expect(c.puntos.at(-1)).toEqual({ x: 20, y: 0 })
    expect(ed.con.redDeEtiqueta.get('e')).toBe(ed.con.redDePin.get('r:2'))
    expect(ed.con.etiquetaConectada.has('e')).toBe(true)
  })
})
