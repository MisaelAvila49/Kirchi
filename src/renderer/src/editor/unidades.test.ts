// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Id, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { seleccionVacia } from './seleccion'

const lib = libreriaDePrueba().piezas

function abrir(doc: Documento = documentoVacio()) {
  const registro: string[] = []
  const ed = new Editor(lib, doc, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  return { ed, registro }
}
const refs = (ed: Editor) => Object.values(ed.doc.piezas).map((p) => p.ref).sort()
const porRef = (ed: Editor, ref: string): Pieza => Object.values(ed.doc.piezas).find((p) => p.ref === ref)!
/** Coloca `n` piezas del tipo en una fila, de 40 en 40 mm, por la orden del núcleo (la misma de la ventana). */
function colocar(ed: Editor, tipo: string, n: number, fila = 0, props?: Record<string, string>) {
  for (let i = 0; i < n; i++) {
    const r = ed.aplicarDelAsistente({ orden: 'colocar', tipo, en: { x: i * 40, y: fila * 40 }, ...(props ? { props } : {}) })
    expect(r.ok).toBe(true)
  }
}
const elegir = (ed: Editor, ...ids: Id[]) => {
  const s = seleccionVacia()
  ids.forEach((i) => s.piezas.add(i))
  ed.seleccionar(s)
}
const copia = (d: Documento) => JSON.parse(JSON.stringify(d)) as Documento

describe('colocar piezas con unidades', () => {
  it('cuatro NAND llenan U1A a U1D y la quinta abre U2A', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 5)
    expect(refs(ed)).toEqual(['U1A', 'U1B', 'U1C', 'U1D', 'U2A'])
    expect(porRef(ed, 'U1C').props).toMatchObject({ paquete: 'U1', unidad: 'C' })
  })

  it('una NOR no comparte paquete con las NAND y un 74LS abre el suyo', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    colocar(ed, 'nor', 1, 1)
    colocar(ed, 'nand', 1, 2, { familia: '74LS' })
    expect(refs(ed)).toEqual(['U1A', 'U2A', 'U3A'])
  })

  it('una pieza suelta de un archivo viejo no se agrupa: la nueva abre el paquete siguiente', () => {
    const d = documentoVacio()
    d.piezas.v = { id: 'v', tipo: 'nand', ref: 'U1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    const { ed } = abrir(d)
    ed.aplicarDelAsistente({ orden: 'colocar', tipo: 'nand', en: { x: 80, y: 0 } })
    expect(refs(ed)).toEqual(['U1', 'U2A'])
    expect(porRef(ed, 'U1').props.paquete).toBeUndefined()
  })

  it('una resistencia sigue con R1 y sin unidad', () => {
    const { ed } = abrir()
    colocar(ed, 'resistencia', 2)
    expect(refs(ed)).toEqual(['R1', 'R2'])
  })

  it('el fantasma muestra la unidad que tomará', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    ed.empezarColocar('nand')
    expect(ed.estado().fantasma?.ref).toBe('U1B')
  })
})

describe('cambiar la unidad', () => {
  it('pasa a una unidad libre, en un paso, y deshacer deja el documento igual', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 2)
    const antes = copia(ed.doc)
    const b = porRef(ed, 'U1B')
    expect(ed.cambiarUnidad(b.id, 'D')).toBeNull()
    expect(refs(ed)).toEqual(['U1A', 'U1D'])
    expect(ed.doc.piezas[b.id].props.unidad).toBe('D')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
    ed.rehacer()
    expect(porRef(ed, 'U1D').id).toBe(b.id)
  })

  it('una unidad ocupada se rechaza con su texto y no deja paso', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 2)
    const antes = ed.doc
    const msg = ed.cambiarUnidad(porRef(ed, 'U1B').id, 'A')
    expect(msg).toContain('en uso por U1A')
    expect(ed.doc).toBe(antes)
  })

  it('una unidad que el chip no tiene, o una pieza sin paquete, se rechazan', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    colocar(ed, 'resistencia', 1, 1)
    expect(ed.cambiarUnidad(porRef(ed, 'U1A').id, 'E')).toContain('no tiene la unidad')
    expect(ed.cambiarUnidad(porRef(ed, 'R1').id, 'B')).toContain('no forma parte de un encapsulado')
  })

  it('en solo lectura y simulando no cambia', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    const id = porRef(ed, 'U1A').id
    ed.ponerSimulando(true)
    expect(ed.cambiarUnidad(id, 'B')).toBeTruthy()
    expect(porRef(ed, 'U1A').props.unidad).toBe('A')
    ed.ponerSimulando(false)
    ed.cargar(copia(ed.doc), { soloLectura: true })
    expect(ed.cambiarUnidad(id, 'B')).toBeTruthy()
    expect(porRef(ed, 'U1A').props.unidad).toBe('A')
  })
})

describe('renombrar el paquete', () => {
  it('cambia la referencia de todas sus unidades en un solo paso', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 3)
    colocar(ed, 'resistencia', 1, 1)
    const antes = copia(ed.doc)
    expect(ed.renombrarPaquete(porRef(ed, 'U1B').id, 'IC7')).toBeNull()
    expect(refs(ed)).toEqual(['IC7A', 'IC7B', 'IC7C', 'R1'])
    expect(porRef(ed, 'IC7B').props.paquete).toBe('IC7')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('escribir la referencia de la pieza o el mismo paquete no cambia nada', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 2)
    const antes = ed.doc
    expect(ed.cambiarReferencia(porRef(ed, 'U1A').id, 'U1')).toBeNull()
    expect(ed.cambiarReferencia(porRef(ed, 'U1A').id, 'U1A')).toBeNull()
    expect(ed.doc).toBe(antes)
  })

  it('no admite un paquete que ya existe, una resistencia con ese nombre ni texto vacío', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    colocar(ed, 'nor', 1, 1)
    colocar(ed, 'resistencia', 1, 2)
    const id = porRef(ed, 'U1A').id
    expect(ed.renombrarPaquete(id, 'U2')).toContain('Ya hay otra pieza')
    expect(ed.renombrarPaquete(id, 'R1')).toContain('Ya hay otra pieza')
    expect(ed.renombrarPaquete(id, 'a b')).toContain('espacios')
    expect(ed.renombrarPaquete(id, '')).toBeTruthy()
    expect(refs(ed)).toEqual(['R1', 'U1A', 'U2A'])
  })

  it('una pieza sin paquete no se renombra como paquete', () => {
    const { ed } = abrir()
    colocar(ed, 'resistencia', 1)
    expect(ed.renombrarPaquete(porRef(ed, 'R1').id, 'R9')).toContain('no forma parte')
  })

  it('una pieza nueva no reutiliza el número de un paquete renombrado', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 4)
    ed.renombrarPaquete(porRef(ed, 'U1A').id, 'U7')
    colocar(ed, 'nand', 1, 1)
    expect(refs(ed)).toContain('U8A')
  })

  it('simulando se rechaza', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 1)
    ed.ponerSimulando(true)
    expect(ed.renombrarPaquete(porRef(ed, 'U1A').id, 'U5')).toBeTruthy()
    expect(refs(ed)).toEqual(['U1A'])
  })
})

describe('lo que comparten las unidades', () => {
  it('cambiar la familia de una unidad la cambia en todas, en un paso', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 3)
    const antes = copia(ed.doc)
    expect(ed.cambiarPropiedad(porRef(ed, 'U1B').id, 'familia', '74LS')).toBeNull()
    for (const r of ['U1A', 'U1B', 'U1C']) expect(porRef(ed, r).props.familia).toBe('74LS')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('más entradas cambian todas las unidades y las que el chip no tiene pasan a un paquete nuevo', () => {
    const { ed, registro } = abrir()
    colocar(ed, 'nand', 4)
    const antes = copia(ed.doc)
    expect(ed.cambiarPropiedad(porRef(ed, 'U1A').id, 'entradas', '3')).toBeNull()
    expect(Object.values(ed.doc.piezas).every((p) => p.tipo === 'nand-3')).toBe(true)
    expect(refs(ed)).toEqual(['U1A', 'U1B', 'U1C', 'U2A'])
    expect(registro.join(' ')).toContain('U1D pasó a U2A')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('un modelo sin unidades devuelve las piezas a referencias sueltas', () => {
    const { ed, registro } = abrir()
    colocar(ed, 'amp-op', 2, 0, { modelo: 'LM358' })
    expect(refs(ed)).toEqual(['U1A', 'U1B'])
    const antes = copia(ed.doc)
    expect(ed.cambiarPropiedad(porRef(ed, 'U1A').id, 'modelo', 'LM741')).toBeNull()
    expect(refs(ed)).toEqual(['U1', 'U2'])
    expect(Object.values(ed.doc.piezas).every((p) => p.props.paquete === undefined && p.props.unidad === undefined)).toBe(true)
    expect(registro.join(' ')).toContain('no tiene unidades')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('el doble clic de una unidad edita el paquete y la familia de todas', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 2)
    let pedido: { campos: { id: string; inicial: string }[]; aceptar(v: string[]): unknown } | null = null
    ed.ponerGanchos({ editarTexto: (p) => (pedido = p as never) })
    ed.editarValor(porRef(ed, 'U1B').id)
    expect(pedido!.campos[0].inicial).toBe('U1')
    const i = pedido!.campos.findIndex((c) => c.id === 'prop:familia')
    const vals = pedido!.campos.map((c) => c.inicial)
    vals[0] = 'U9'
    vals[i] = '74LS'
    expect(pedido!.aceptar(vals)).toBeNull()
    expect(refs(ed)).toEqual(['U9A', 'U9B'])
    expect(porRef(ed, 'U9A').props.familia).toBe('74LS')
  })
})

describe('copiar y pegar unidades', () => {
  it('las unidades pegadas de un paquete van a un paquete nuevo y conservan sus letras', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 4)
    elegir(ed, porRef(ed, 'U1B').id, porRef(ed, 'U1D').id)
    ed.copiar()
    ed.pegar()
    expect(refs(ed)).toEqual(['U1A', 'U1B', 'U1C', 'U1D', 'U2B', 'U2D'])
    expect(porRef(ed, 'U2D').props).toMatchObject({ paquete: 'U2', unidad: 'D' })
  })

  it('pegar dos veces da paquetes distintos y deshacer quita lo pegado', () => {
    const { ed } = abrir()
    colocar(ed, 'nand', 2)
    elegir(ed, porRef(ed, 'U1A').id, porRef(ed, 'U1B').id)
    ed.copiar()
    const antes = copia(ed.doc)
    ed.pegar()
    ed.pegar()
    expect(refs(ed)).toEqual(['U1A', 'U1B', 'U2A', 'U2B', 'U3A', 'U3B'])
    ed.deshacer()
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('duplicar una resistencia sigue numerando R2', () => {
    const { ed } = abrir()
    colocar(ed, 'resistencia', 1)
    elegir(ed, porRef(ed, 'R1').id)
    ed.duplicar()
    expect(refs(ed)).toEqual(['R1', 'R2'])
  })
})

describe('Agrupar en encapsulados', () => {
  /** Cinco NAND sueltas de un archivo de antes, con ids en desorden respecto a su lugar. */
  function viejo(): Documento {
    const d = documentoVacio()
    const pos: [string, string, number, number][] = [['e', 'U14', 0, 80], ['b', 'U11', 80, 0], ['a', 'U10', 0, 0], ['d', 'U13', 120, 0], ['c', 'U12', 40, 0]]
    for (const [id, ref, x, y] of pos) d.piezas[id] = { id, tipo: 'nand', ref, x, y, rot: 0, espejo: false, props: {} }
    d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 200, y: 0, rot: 0, espejo: false, props: {} }
    return d
  }

  it('reparte las sueltas en orden de lectura, en un paso, y deshacer deja el documento igual', () => {
    const { ed } = abrir(viejo())
    const antes = copia(ed.doc)
    expect(ed.agruparEncapsulados()).toBe(5)
    const por = (id: string) => ed.doc.piezas[id].ref
    expect([por('a'), por('c'), por('b'), por('d'), por('e')]).toEqual(['U1A', 'U1B', 'U1C', 'U1D', 'U2A'])
    expect(ed.doc.piezas.r.ref).toBe('R1')
    ed.deshacer()
    expect(ed.doc).toEqual(antes)
  })

  it('sin piezas sueltas no hace nada y lo dice', () => {
    const { ed, registro } = abrir()
    colocar(ed, 'nand', 2)
    const antes = ed.doc
    expect(ed.agruparEncapsulados()).toBe(0)
    expect(ed.doc).toBe(antes)
    expect(registro.join(' ')).toContain('No hay piezas sueltas')
  })

  it('en solo lectura y simulando no agrupa', () => {
    const { ed } = abrir(viejo())
    ed.ponerSimulando(true)
    expect(ed.agruparEncapsulados()).toBe(0)
    ed.ponerSimulando(false)
    ed.cargar(viejo(), { soloLectura: true })
    expect(ed.agruparEncapsulados()).toBe(0)
    expect(ed.doc.piezas.a.ref).toBe('U10')
  })
})
