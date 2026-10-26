// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza, type Punto } from '../doc/tipos'
import type { Efecto } from '../lienzo/animaciones'
import { libreriaDePrueba } from '../prueba/libreria'
import { violaciones } from './conflictos'
import { aplicar } from '../doc/comandos'
import { transformarSeleccion } from './acciones'
import { LIMITE_COORDENADA } from '../doc/limites'
import { seleccionDe, seleccionVacia } from './seleccion'
import { registrarAtajosDelEditor } from './atajosEditor'
import { Editor, type Ganchos, type Modificadores, type PedidoCampos, type PedidoTexto } from './Editor'
import { Atajos, type EventoTecla } from './teclado'

const lib = libreriaDePrueba().piezas
const R = (id: string, ref: string, x: number, y: number): Pieza => ({ id, tipo: 'resistencia', ref, x, y, rot: 0, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
/** R1 (a) en el origen con pines en (-4, 0) y (4, 0); R2 (b) en (20, 0) con pines en (16, 0) y (24, 0). */
function dosResistencias(...cables: Cable[]): Documento {
  const d = documentoVacio()
  d.piezas.a = R('a', 'R1', 0, 0)
  d.piezas.b = R('b', 'R2', 20, 0)
  for (const c of cables) d.cables[c.id] = c
  return d
}
function nuevo(doc: Documento = documentoVacio(), ganchos: Partial<Ganchos> = {}): Editor {
  const ed = new Editor(lib, doc, idSecuencial(), ganchos)
  ed.tolerancia = 0.5
  return ed
}
const clic = (ed: Editor, x: number, y: number, m: Modificadores = {}) => {
  ed.abajo({ x, y }, m)
  ed.arriba({ x, y }, m)
}
const cables = (ed: Editor) => Object.values(ed.doc.cables).map((c) => c.puntos)
const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

describe('Editor', () => {
  it('un clic coloca una sola pieza y vuelve a la herramienta de selección', () => {
    const ed = nuevo()
    ed.empezarColocar('resistencia', '4k7', { x: 10.3, y: 0.2 })
    expect(ed.herramienta).toBe('colocar')
    expect(ed.fantasma).toMatchObject({ x: 10, y: 0, tipo: 'resistencia' })
    clic(ed, 10.3, 0.2)
    expect(ed.doc.piezas.p_0001).toMatchObject({ ref: 'R1', x: 10, y: 0, rot: 0, props: { valor: '4k7' } })
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.fantasma).toBeNull()
    clic(ed, 30, 0)
    expect(Object.keys(ed.doc.piezas)).toEqual(['p_0001'])
    ed.deshacer()
    expect(ed.doc.piezas).toEqual({})
  })

  it('Shift+clic coloca y sigue colocando, gira el fantasma y Esc termina', () => {
    const ed = nuevo()
    ed.empezarColocar('resistencia', '4k7', { x: 10, y: 0 })
    clic(ed, 10, 0, { shift: true })
    expect(ed.herramienta).toBe('colocar')
    expect(ed.fantasma).not.toBeNull()
    ed.transformar('girar')
    expect(ed.fantasma!.rot).toBe(90)
    ed.mover({ x: 30, y: 0 })
    clic(ed, 30, 0, { shift: true })
    expect(ed.doc.piezas.p_0001).toMatchObject({ ref: 'R1', x: 10, y: 0, rot: 0, props: { valor: '4k7' } })
    expect(ed.doc.piezas.p_0002).toMatchObject({ ref: 'R2', x: 30, y: 0, rot: 90, props: { valor: '4k7' } })
    expect(ed.herramienta).toBe('colocar')
    ed.escape()
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.fantasma).toBeNull()
    ed.deshacer()
    ed.deshacer()
    expect(ed.doc.piezas).toEqual({})
  })

  describe('piezas sin encimarse', () => {
    it('el fantasma encima de otra pieza avisa con cuál, el clic no coloca y sacude el fantasma', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(dosResistencias(), { animar: (e) => efectos.push(e) })
      ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
      expect(ed.estado().choque).toBeNull()
      ed.mover({ x: 4, y: 0 })
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
      clic(ed, 4, 0)
      expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(ed.herramienta).toBe('colocar')
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: ['fantasma'] }])
      // A 8 unidades los pines se tocan y los cuerpos quedan a 3: se puede.
      ed.mover({ x: 8, y: 0 })
      expect(ed.estado().choque).toBeNull()
      clic(ed, 8, 0)
      expect(ed.doc.piezas.p_0001).toMatchObject({ x: 8, y: 0 })
    })

    it('girar el fantasma vuelve a revisar el lugar', () => {
      const ed = nuevo(dosResistencias())
      // Horizontal en (8, 0): cuerpo x 5.5..10.5; R1 llega a x 2.5 y R2 empieza en 17.5: libre.
      ed.empezarColocar('resistencia', undefined, { x: 8, y: 0 })
      expect(ed.estado().choque).toBeNull()
      ed.mover({ x: 4, y: 0 })
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
      // Vertical en (4, 0): cuerpo x 3..5, a 0.5 de R1: sigue encimada.
      ed.transformar('girar')
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
      ed.mover({ x: 6, y: 0 })
      // Vertical en (6, 0): cuerpo x 5..7, a 2.5 de R1.
      expect(ed.estado().choque).toBeNull()
      ed.transformar('girar')
      // Horizontal otra vez en (6, 0): cuerpo x 3.5..8.5, a 1 de R1.
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
    })

    it('tras Shift+clic el fantasma queda sobre la pieza recién puesta y se marca como encimado', () => {
      const ed = nuevo()
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      clic(ed, 0, 0, { shift: true })
      expect(ed.estado().choque).toEqual({ con: 'p_0001', ref: 'R1', col: 'piezas' })
    })

    it('soltar un arrastre encima de otra pieza lo revierte sin paso en el historial y sacude lo movido', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])), { animar: (e) => efectos.push(e) })
      ed.abajo({ x: 20, y: 0.3 })
      ed.mover({ x: 10, y: 0.3 })
      expect(ed.estado().choque).toBeNull()
      ed.mover({ x: 4, y: 0.3 })
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
      ed.arriba({ x: 4, y: 0.3 })
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0 })
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0]))
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(ed.estado().choque).toBeNull()
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: ['b'], cables: [] }])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    })

    it('un arrastre que termina libre sí se queda', () => {
      const ed = nuevo(dosResistencias())
      ed.abajo({ x: 20, y: 0.3 })
      ed.mover({ x: 4, y: 0.3 })
      ed.mover({ x: 8, y: 0.3 })
      ed.arriba({ x: 8, y: 0.3 })
      expect(ed.doc.piezas.b).toMatchObject({ x: 8, y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(true)
    })

    it('pegar encima de lo copiado avanza 2 unidades en diagonal hasta un hueco', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 0, 0.5)
      ed.copiar()
      ed.mover({ x: 0, y: 0 })
      ed.pegar()
      // (0, 0) y (2, 2) chocan con R1; en (4, 4) los cuerpos quedan a 2 unidades.
      expect(ed.doc.piezas.p_0001).toMatchObject({ ref: 'R3', x: 4, y: 4 })
    })

    it('si no hay hueco en 20 intentos pega en el último y sacude lo pegado', () => {
      const d = documentoVacio()
      for (let k = 0; k <= 22; k++) d.piezas[`r${k}`] = R(`r${k}`, `R${k + 1}`, 2 * k, 2 * k)
      const efectos: Efecto[] = []
      const ed = nuevo(d, { animar: (e) => efectos.push(e) })
      clic(ed, -3, 0.3)
      expect([...ed.seleccion.piezas]).toEqual(['r0'])
      ed.copiar()
      ed.mover({ x: 0, y: 0 })
      ed.pegar()
      expect(ed.doc.piezas.p_0001).toMatchObject({ x: 40, y: 40 })
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: ['p_0001'] }])
    })
  })

  describe('animaciones de confirmación', () => {
    it('colocar una pieza pide un pulso alrededor de su cuerpo', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(documentoVacio(), { animar: (e) => efectos.push(e) })
      ed.empezarColocar('resistencia', undefined, { x: 10, y: 0 })
      clic(ed, 10, 0)
      expect(efectos).toHaveLength(1)
      const e = efectos[0]
      expect(e.tipo).toBe('pulso')
      if (e.tipo !== 'pulso') return
      // Cuerpo x 7.5..12.5, y −1..1, con media unidad de aire.
      expect(e.caja.minX).toBeCloseTo(7, 9)
      expect(e.caja.maxX).toBeCloseTo(13, 9)
      expect(e.caja.minY).toBeCloseTo(-1.5, 9)
      expect(e.caja.maxY).toBeCloseTo(1.5, 9)
    })

    it('terminar un cable pide un brillo de los cables nuevos', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(dosResistencias(), { animar: (e) => efectos.push(e) })
      clic(ed, 4, 0)
      ed.mover({ x: 16, y: 0 })
      clic(ed, 16, 0)
      expect(efectos).toEqual([{ tipo: 'brillo', cables: Object.keys(ed.doc.cables) }])
      expect(Object.keys(ed.doc.cables)).toHaveLength(1)
    })
  })

  describe('clic derecho', () => {
    it('cancela el cable en curso completo', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 4, 0)
      ed.mover({ x: 10, y: 6 })
      clic(ed, 10, 6)
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.estado().cableEnCurso).toBeNull()
      expect(cables(ed)).toEqual([])
    })

    it('avisa al tutorial solo cuando cancela un cable a medio trazar', () => {
      let cancelados = 0
      const ed = nuevo(dosResistencias(), { alCancelarCable: () => cancelados++ })
      ed.clicDerecho()
      expect(cancelados).toBe(0)
      clic(ed, 4, 0)
      ed.mover({ x: 10, y: 6 })
      ed.clicDerecho()
      expect(cancelados).toBe(1)
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 30 })
      ed.clicDerecho()
      expect(cancelados).toBe(1)
    })

    it('cancela la colocación, sencilla o múltiple', () => {
      const ed = nuevo()
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.fantasma).toBeNull()
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      clic(ed, 0, 0, { shift: true })
      ed.mover({ x: 20, y: 0 })
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.fantasma).toBeNull()
      expect(ed.estado().choque).toBeNull()
      expect(Object.keys(ed.doc.piezas)).toEqual(['p_0001'])
    })

    it('cancela la etiqueta o la nota pendiente', () => {
      const pedidos: PedidoTexto[] = []
      const ed = nuevo(documentoVacio(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
      ed.colocarEtiqueta()
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      ed.colocarNota()
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.doc.etiquetas).toEqual({})
      expect(ed.doc.notas).toEqual({})
    })

    it('cancela el rectángulo de selección en curso sin cambiar la selección', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 20, 0.5)
      ed.abajo({ x: -6, y: -3 }, { shift: true })
      ed.mover({ x: 6, y: 3 })
      ed.clicDerecho()
      expect(ed.estado().rectangulo).toBeNull()
      ed.arriba({ x: 6, y: 3 })
      expect([...ed.seleccion.piezas]).toEqual(['b'])
    })

    it('en selección sin nada pendiente no hace nada', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 0, 0.5)
      let avisos = 0
      ed.suscribir(() => avisos++)
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      expect([...ed.seleccion.piezas]).toEqual(['a'])
      expect(avisos).toBe(0)
    })
  })

  it('cablea entre dos pines con dos clics', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 4.1, 0)
    expect(ed.herramienta).toBe('cablear')
    ed.mover({ x: 16, y: 0 })
    clic(ed, 16, 0.1)
    expect(ed.herramienta).toBe('seleccionar')
    expect(cables(ed)).toEqual([P([4, 0], [16, 0])])
    expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
  })

  it('un clic en el vacío fija una esquina y la L siguiente decide su orientación', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 4, 0)
    ed.mover({ x: 10, y: 6 })
    clic(ed, 10, 6)
    ed.mover({ x: 16, y: 0 })
    clic(ed, 16, 0)
    expect(cables(ed)).toEqual([P([4, 0], [10, 0], [10, 6], [16, 6], [16, 0])])
  })

  it('Retroceso quita una esquina y Esc cancela el cable', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 4, 0)
    ed.mover({ x: 10, y: 6 })
    clic(ed, 10, 6)
    ed.retroceso()
    expect(ed.herramienta).toBe('cablear')
    ed.escape()
    expect(ed.herramienta).toBe('seleccionar')
    expect(ed.estado().cableEnCurso).toBeNull()
    expect(cables(ed)).toEqual([])
  })

  it('terminar en la mitad de un cable crea una T', () => {
    const ed = nuevo(dosResistencias(C('t', [0, 10], [20, 10])))
    clic(ed, 4, 0)
    ed.mover({ x: 4, y: 10 })
    clic(ed, 4, 10.2)
    expect(ed.doc.cables.c_0001.puntos).toEqual(P([4, 0], [4, 10]))
    expect(ed.con.uniones).toContainEqual({ x: 4, y: 10 })
  })

  it('Alt+clic sobre un cable empieza una derivación', () => {
    const ed = nuevo(dosResistencias(C('t', [0, 10], [20, 10])))
    ed.abajo({ x: 10, y: 10.2 }, { alt: true })
    expect(ed.herramienta).toBe('cablear')
    expect(ed.estado().cableEnCurso).toEqual(P([10, 10]))
  })

  it('un cable que continúa a otro por su extremo se funde con él', () => {
    const ed = nuevo(dosResistencias(C('a1', [0, 10], [10, 10])))
    clic(ed, 10, 10.1, { alt: true })
    ed.mover({ x: 20, y: 10 })
    clic(ed, 20, 10)
    clic(ed, 20, 10)
    ed.dobleClic({ x: 20, y: 10 })
    expect(cables(ed)).toEqual([P([0, 10], [20, 10])])
    expect(ed.doc.cables.a1).toBeUndefined()
  })

  it('arrastrar una pieza estira su cable, recalcula al soltar y se deshace en un paso', () => {
    const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
    const antes = ed.con
    ed.abajo({ x: 20, y: 0.3 })
    ed.mover({ x: 20, y: 4.2 })
    ed.mover({ x: 20, y: 6.1 })
    expect(ed.con).toBe(antes)
    ed.arriba({ x: 20, y: 6.1 })
    expect(ed.con).not.toBe(antes)
    expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 6 })
    expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0], [16, 6]))
    expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    ed.deshacer()
    expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0 })
    expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0]))
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('durante un arrastre la escena no recibe puntos de unión y vuelven al soltar', () => {
    const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0]), C('d', [10, 0], [10, 10])))
    expect(ed.con.uniones).toContainEqual({ x: 10, y: 0 })
    expect(ed.estado().con.uniones).toContainEqual({ x: 10, y: 0 })
    ed.abajo({ x: 20, y: 0.3 })
    expect(ed.estado().con.uniones).toContainEqual({ x: 10, y: 0 })
    ed.mover({ x: 20, y: 4.2 })
    expect(ed.estado().con.uniones).toEqual([])
    expect(ed.estado().con.redes).toBe(ed.con.redes)
    ed.arriba({ x: 20, y: 4.2 })
    expect(ed.estado().con.uniones).toContainEqual({ x: 10, y: 0 })
    expect(ed.estado().con).toBe(ed.con)
  })

  describe('gestos seguros', () => {
    it('durante un arrastre se ignoran girar, borrar, pegar, duplicar, L, G y T', () => {
      const pedidos: PedidoTexto[] = []
      const ed = nuevo(dosResistencias(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
      clic(ed, 0, 0.5)
      ed.copiar()
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.transformar('girar')
      ed.borrar()
      ed.pegar()
      ed.duplicar()
      ed.colocarEtiqueta()
      ed.colocarNota()
      ed.colocarTierra()
      expect(ed.herramienta).toBe('seleccionar')
      expect(pedidos).toEqual([])
      expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
      expect(ed.doc.piezas.a).toMatchObject({ y: 6, rot: 0 })
      ed.arriba({ x: 0, y: 6 })
    })

    it('cancelarGesto revierte el arrastre y no deja paso en el historial', () => {
      const ed = nuevo(dosResistencias())
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.cancelarGesto()
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
      ed.mover({ x: 0, y: 10 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
    })

    it('cancelarGesto cierra el rectángulo, el cable y el texto pendiente', () => {
      const pedidos: PedidoTexto[] = []
      const ed = nuevo(dosResistencias(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
      ed.abajo({ x: -6, y: -3 })
      ed.mover({ x: 6, y: 3 })
      ed.cancelarGesto()
      expect(ed.estado().rectangulo).toBeNull()
      clic(ed, 4, 0)
      ed.cancelarGesto()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.estado().cableEnCurso).toBeNull()
      ed.colocarEtiqueta()
      expect(ed.herramienta).toBe('etiqueta')
      ed.cancelarGesto()
      expect(ed.herramienta).toBe('seleccionar')
    })

    it('cancelarGesto({ soloPuntero }) revierte el arrastre pero respeta el cable en curso', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 4, 0)
      ed.cancelarGesto({ soloPuntero: true })
      expect(ed.estado().cableEnCurso).not.toBeNull()
      expect(ed.herramienta).toBe('cablear')
      ed.escape()
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.cancelarGesto({ soloPuntero: true })
      expect(ed.doc.piezas.a).toMatchObject({ y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('soltar o cancelar un arrastre sube versionDoc para que la escena recupere las uniones', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      ed.abajo({ x: 20, y: 0.3 })
      ed.mover({ x: 20, y: 6 })
      const durante = ed.versionDoc
      ed.arriba({ x: 20, y: 6 })
      expect(ed.versionDoc).toBeGreaterThan(durante)
      ed.abajo({ x: 20, y: 6.3 })
      ed.mover({ x: 20, y: 12 })
      const v = ed.versionDoc
      ed.cancelarGesto()
      expect(ed.versionDoc).toBeGreaterThan(v)
    })

    it('un abajo con un gesto abierto lo cierra primero', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      const antes = ed.con
      ed.abajo({ x: 20, y: 0.3 })
      ed.mover({ x: 20, y: 6 })
      ed.abajo({ x: 0, y: 30 })
      expect(ed.con).not.toBe(antes)
      expect(ed.doc.piezas.b).toMatchObject({ y: 6 })
      ed.mover({ x: 20, y: 12 })
      expect(ed.doc.piezas.b).toMatchObject({ y: 6 })
      ed.arriba({ x: 0, y: 30 })
    })

    it('Esc durante un arrastre lo revierte, y Esc cancela etiqueta o nota pendiente', () => {
      const pedidos: PedidoTexto[] = []
      const ed = nuevo(dosResistencias(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.escape()
      expect(ed.doc.piezas.a).toMatchObject({ y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
      ed.colocarNota()
      ed.escape()
      expect(ed.herramienta).toBe('seleccionar')
    })

    it('un arrastre que vuelve al origen no deja paso ni borra lo que se podía rehacer', () => {
      const ed = nuevo(dosResistencias())
      ed.mover({ x: 10, y: 30 })
      ed.colocarEtiqueta()
      ed.escape()
      ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
      clic(ed, 40, 0)
      ed.escape()
      ed.deshacer()
      expect(ed.historial.puedeRehacer).toBe(true)
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.mover({ x: 0, y: 0.2 })
      ed.arriba({ x: 0, y: 0.2 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(ed.historial.puedeRehacer).toBe(true)
      ed.rehacer()
      expect(ed.doc.piezas.p_0001).toBeDefined()
    })

    it('deshacer o rehacer durante el cableado cancela el cable; G se ignora', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 4, 0)
      ed.colocarTierra()
      expect(ed.herramienta).toBe('cablear')
      expect(ed.fantasma).toBeNull()
      ed.deshacer()
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.estado().cableEnCurso).toBeNull()
      clic(ed, 4, 0)
      ed.rehacer()
      expect(ed.herramienta).toBe('seleccionar')
    })

    it('Retroceso fuera del cableado borra la selección', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 0, 0.5)
      ed.retroceso()
      expect(Object.keys(ed.doc.piezas)).toEqual(['b'])
    })

    it('un clic sin mover sobre un miembro de varios deja solo ese elemento', () => {
      const ed = nuevo(dosResistencias())
      ed.abajo({ x: -6, y: -3 })
      ed.mover({ x: 26, y: 3 })
      ed.arriba({ x: 26, y: 3 })
      expect(ed.seleccion.piezas.size).toBe(2)
      clic(ed, 0, 0.5)
      expect([...ed.seleccion.piezas]).toEqual(['a'])
    })

    it('arrastrar un miembro de varios mueve a todos y los conserva seleccionados', () => {
      const ed = nuevo(dosResistencias())
      ed.abajo({ x: -6, y: -3 })
      ed.mover({ x: 26, y: 3 })
      ed.arriba({ x: 26, y: 3 })
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: 6 })
      ed.arriba({ x: 0, y: 6 })
      expect(ed.seleccion.piezas.size).toBe(2)
      expect(ed.doc.piezas.b.y).toBe(6)
    })
  })

  describe('las ediciones no desconectan el circuito', () => {
    const ortogonal = (pts: Punto[]) => pts.every((q, i) => i === 0 || q.x === pts[i - 1].x || q.y === pts[i - 1].y)

    it('mover una pieza conserva la unión en T de su cable (los cables se parten en las uniones)', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.cables.m = C('m', [4, 0], [30, 0])
      d.cables.t = C('t', [10, 0], [10, 10])
      const ed = nuevo(d)
      expect(ed.con.uniones).toEqual([{ x: 10, y: 0 }])
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 0, y: -5.5 })
      ed.arriba({ x: 0, y: -5.5 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: -6 })
      const red = ed.con.redDePin.get('a:2')
      expect(red).toBeDefined()
      expect(Object.values(ed.doc.cables).every((c) => ed.con.redDeCable.get(c.id) === red)).toBe(true)
      expect(ed.con.uniones).toContainEqual({ x: 10, y: 0 })
      ed.deshacer()
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
      expect(ed.doc.cables.m.puntos).toEqual(P([4, 0], [30, 0]))
      expect(Object.keys(ed.doc.cables).sort()).toEqual(['m', 't'])
    })

    it('mover una pieza a lo largo de su cable más allá de una T se revierte: el otro trozo la atravesaría', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.cables.m = C('m', [4, 0], [30, 0])
      d.cables.t = C('t', [10, 0], [10, 10])
      const ed = nuevo(d)
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 12, y: 0.5 })
      expect(ed.estado().choque).not.toBeNull()
      ed.arriba({ x: 12, y: 0.5 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
      expect(ed.doc.cables.m.puntos).toEqual(P([4, 0], [30, 0]))
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('terminar un cable en una T parte el cable que atraviesa', () => {
      const ed = nuevo(dosResistencias(C('t', [0, 10], [20, 10])))
      clic(ed, 4, 0)
      ed.mover({ x: 4, y: 10 })
      clic(ed, 4, 10.2)
      expect(Object.values(ed.doc.cables).map((c) => c.puntos)).toEqual(expect.arrayContaining([P([0, 10], [4, 10]), P([4, 10], [20, 10]), P([4, 0], [4, 10])]))
      expect(Object.keys(ed.doc.cables)).toHaveLength(3)
    })

    it('arrastrar un cable solo estira sus extremos clavados en los pines', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      ed.abajo({ x: 10, y: 0.2 })
      ed.mover({ x: 10, y: 4.2 })
      ed.arriba({ x: 10, y: 4.2 })
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [4, 4], [16, 4], [16, 0]))
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    })

    it('arrastrar una etiqueta estira el cable que termina en ella', () => {
      const d = dosResistencias(C('c', [4, 0], [12, 0]))
      d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 12, y: 0, rot: 0 }
      const ed = nuevo(d)
      expect(ed.con.redes.some((r) => r.nombre === 'VCC')).toBe(true)
      ed.abajo({ x: 14, y: 0.2 })
      expect([...ed.seleccion.etiquetas]).toEqual(['e'])
      ed.mover({ x: 14, y: 6.2 })
      ed.arriba({ x: 14, y: 6.2 })
      expect(ed.doc.etiquetas.e).toMatchObject({ x: 12, y: 6 })
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [12, 0], [12, 6]))
      expect(ed.con.redes.find((r) => r.nombre === 'VCC')).toBeDefined()
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redes.find((r) => r.nombre === 'VCC')!.id)
    })

    it('girar una pieza con su cable pegado no los desconecta', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      clic(ed, 20, 0.5)
      ed.transformar('girar')
      expect(ed.doc.piezas.b.rot).toBe(90)
      expect(ortogonal(ed.doc.cables.c.puntos)).toBe(true)
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      ed.deshacer()
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0]))
    })

    it('Retroceso quita el clic completo del cable en curso', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 4, 0)
      ed.mover({ x: 10, y: 6 })
      clic(ed, 10, 6)
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [10, 0], [10, 6]))
      ed.retroceso()
      ed.mover({ x: 4, y: 8 })
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [4, 8]))
    })
  })

  it('clic selecciona, Shift+clic alterna y clic en el vacío deselecciona', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 0, 0.5)
    expect([...ed.seleccion.piezas]).toEqual(['a'])
    clic(ed, 20, 0.5, { shift: true })
    expect([...ed.seleccion.piezas]).toEqual(['a', 'b'])
    clic(ed, 0, 0.5, { shift: true })
    expect([...ed.seleccion.piezas]).toEqual(['b'])
    clic(ed, 10, 30)
    expect(ed.seleccion.piezas.size).toBe(0)
  })

  it('el rectángulo de izquierda a derecha selecciona lo que encierra', () => {
    const ed = nuevo(dosResistencias())
    ed.abajo({ x: -6, y: -3 })
    ed.mover({ x: 6, y: 3 })
    expect(ed.estado().rectangulo).toEqual({ a: { x: -6, y: -3 }, b: { x: 6, y: 3 } })
    ed.arriba({ x: 6, y: 3 })
    expect([...ed.seleccion.piezas]).toEqual(['a'])
    expect(ed.estado().rectangulo).toBeNull()
  })

  it('Supr borra la selección y deshacer la regresa', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 0, 0.5)
    ed.borrar()
    expect(Object.keys(ed.doc.piezas)).toEqual(['b'])
    ed.deshacer()
    expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
  })

  it('copia y pega en el cursor con referencia nueva', () => {
    const ed = nuevo(dosResistencias())
    clic(ed, 0, 0.5)
    ed.copiar()
    ed.mover({ x: 40, y: 0 })
    ed.pegar()
    expect(ed.doc.piezas.p_0001).toMatchObject({ ref: 'R3', x: 40, y: 0 })
    expect([...ed.seleccion.piezas]).toEqual(['p_0001'])
  })

  describe('duplicar en el cursor', () => {
    /** Redes del documento a las que pertenece cada pin de la pieza `id`. */
    const redesDe = (ed: Editor, id: string) => [`${id}:1`, `${id}:2`].map((k) => ed.con.redDePin.get(k))
    const pinesDeLaRed = (ed: Editor, red: number | undefined) => (red === undefined ? [] : ed.con.redes[red].pines)

    it('con el cursor lejos, la copia va exactamente al cursor y no se conecta con el original', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 0, 0.5)
      ed.mover({ x: 100, y: 50 })
      ed.duplicar()
      expect(ed.doc.piezas.p_0001).toMatchObject({ ref: 'R3', x: 100, y: 50 })
      expect([...ed.seleccion.piezas]).toEqual(['p_0001'])
      for (const red of redesDe(ed, 'p_0001')) {
        expect(red).toBeDefined()
        expect(pinesDeLaRed(ed, red).every((k) => k.startsWith('p_0001:'))).toBe(true)
      }
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0 })
    })

    it('con el cursor sobre el original, va al lugar libre más cercano y sigue sin conectarse', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 0, 0.5)
      ed.duplicar()
      const copia = ed.doc.piezas.p_0001
      expect(copia.ref).toBe('R3')
      expect(copia.x === 0 && copia.y === 0).toBe(false)
      expect(violaciones(ed.doc, lib)).toEqual([])
      for (const red of redesDe(ed, 'p_0001')) expect(pinesDeLaRed(ed, red).every((k) => k.startsWith('p_0001:'))).toBe(true)
    })

    it('no pisa el portapapeles y acepta un punto explícito', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 20, 0.5)
      ed.copiar()
      clic(ed, 0, 0.5)
      ed.mover({ x: 60, y: 0 })
      ed.duplicar({ x: 80, y: 20 })
      expect(ed.doc.piezas.p_0001).toMatchObject({ x: 80, y: 20 })
      ed.mover({ x: 40, y: 40 })
      ed.pegar()
      // Pega lo copiado (R2), no lo duplicado (R1): la referencia es nueva y la pieza copiada fue R2 (valor por omisión igual).
      expect(Object.keys(ed.doc.piezas)).toHaveLength(4)
      expect(ed.doc.piezas.p_0002).toMatchObject({ x: 40, y: 40 })
    })
  })

  it('doble clic abre el buscador en el vacío y edita el valor sobre una pieza', () => {
    const abiertos: Punto[] = []
    const pedidos: PedidoTexto[] = []
    const ed = nuevo(dosResistencias(), { abrirBuscador: (en) => abiertos.push(en), editarTexto: (p) => pedidos.push(p as PedidoTexto) })
    ed.dobleClic({ x: 10.3, y: 30 })
    expect(abiertos).toEqual([{ x: 10, y: 30 }])
    ed.dobleClic({ x: 0, y: 0.5 })
    // La referencia y el valor (editarNombre.test.ts).
    const p = pedidos[0] as unknown as PedidoCampos
    expect(p).toMatchObject({ tipo: 'pieza', foco: 1 })
    expect(p.campos.map((c) => c.inicial)).toEqual(['R1', '1k', '0.25 W'])
    expect(p.aceptar(['R1', 'abc'])).toEqual({ campo: 1, error: '«abc» no es un valor válido.' })
    expect(ed.doc.piezas.a.props).toEqual({})
    expect(p.aceptar(['R1', '4k7'])).toBeNull()
    expect(ed.doc.piezas.a.props).toEqual({ valor: '4k7' })
  })

  it('L crea una etiqueta y T una nota en el cursor', () => {
    const pedidos: PedidoTexto[] = []
    const ed = nuevo(documentoVacio(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
    ed.mover({ x: 30, y: 20 })
    ed.colocarEtiqueta()
    expect(ed.herramienta).toBe('etiqueta')
    expect(pedidos[0].aceptar('  ')).toBe('Escribe el nombre de la red.')
    expect(pedidos[0].aceptar('VCC')).toBeNull()
    expect(Object.values(ed.doc.etiquetas)).toMatchObject([{ nombre: 'VCC', x: 30, y: 20 }])
    expect(ed.herramienta).toBe('seleccionar')
    ed.colocarNota()
    expect(pedidos[1]).toMatchObject({ tipo: 'nota', multilinea: true })
    pedidos[1].aceptar('hola')
    expect(Object.values(ed.doc.notas)).toMatchObject([{ texto: 'hola', x: 30, y: 20, ancho: 8 }])
  })

  it('G empieza a colocar una tierra', () => {
    const ed = nuevo()
    ed.colocarTierra()
    expect(ed.herramienta).toBe('colocar')
    expect(ed.fantasma!.tipo).toBe('tierra')
  })

  it('al pasar sobre un pin lo nombra', () => {
    const ed = nuevo(dosResistencias())
    ed.mover({ x: 4.1, y: 0 })
    expect(ed.hover).toEqual({ tipo: 'pin', piezaId: 'a', pinId: '2', x: 4, y: 0 })
    expect(ed.nombrePin(ed.hover)).toBe('R1 · 2')
    ed.salir()
    expect(ed.hover).toBeNull()
  })

  it('los atajos por omisión no chocan y llegan al editor', () => {
    const ed = nuevo(dosResistencias())
    const a = new Atajos()
    let encuadres = 0
    registrarAtajosDelEditor(a, ed, { encuadrar: () => encuadres++ })
    expect(a.conflictos()).toEqual([])
    clic(ed, 0, 0.5)
    a.despachar(ev('r'))
    expect(ed.doc.piezas.a.rot).toBe(90)
    a.despachar(ev('z', { ctrlKey: true }))
    expect(ed.doc.piezas.a.rot).toBe(0)
    a.despachar(ev('f'))
    expect(encuadres).toBe(1)
  })

  describe('arrastrar desde un pin', () => {
    /** R1 (a) en el origen; R2 (b) en (20, 10), pines en (16, 10) y (24, 10). */
    function enEscalera(...cs: Cable[]): Documento {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 20, 10)
      for (const c of cs) d.cables[c.id] = c
      return d
    }

    it('soltar en otro pin crea el cable en L (primero horizontal) en un solo paso y lo hace brillar', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(enEscalera(), { animar: (e) => efectos.push(e) })
      ed.abajo({ x: 4, y: 0 })
      ed.mover({ x: 10, y: 1 })
      ed.mover({ x: 16, y: 10 })
      ed.arriba({ x: 16, y: 10.2 })
      expect(cables(ed)).toEqual([P([4, 0], [16, 0], [16, 10])])
      expect(ed.herramienta).toBe('seleccionar')
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      expect(efectos).toEqual([{ tipo: 'brillo', cables: Object.keys(ed.doc.cables) }])
      ed.deshacer()
      expect(cables(ed)).toEqual([])
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('el primer movimiento vertical hace la L primero vertical', () => {
      const ed = nuevo(enEscalera())
      ed.abajo({ x: 4, y: 0 })
      ed.mover({ x: 4.5, y: 6 })
      ed.mover({ x: 16, y: 10 })
      ed.arriba({ x: 16, y: 10 })
      expect(cables(ed)).toEqual([P([4, 0], [4, 10], [16, 10])])
    })

    it('soltar sobre un cable lo termina ahí con una T', () => {
      const ed = nuevo(enEscalera(C('t', [-10, 10], [10, 10])))
      ed.abajo({ x: 4, y: 0 })
      ed.mover({ x: 4.3, y: 5 })
      ed.arriba({ x: 4.3, y: 10.2 })
      expect(ed.herramienta).toBe('seleccionar')
      expect(cables(ed)).toContainEqual(P([4, 0], [4, 10]))
      expect(ed.con.uniones).toContainEqual({ x: 4, y: 10 })
    })

    it('soltar en el vacío fija una esquina y el cableado sigue por clics', () => {
      const ed = nuevo(enEscalera())
      ed.abajo({ x: 4, y: 0 })
      ed.mover({ x: 10, y: 1 })
      ed.mover({ x: 10, y: 6 })
      ed.arriba({ x: 10, y: 6 })
      expect(ed.herramienta).toBe('cablear')
      expect(cables(ed)).toEqual([])
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [10, 0], [10, 6]))
      ed.mover({ x: 16, y: 6.2 })
      ed.mover({ x: 16, y: 10 })
      clic(ed, 16, 10)
      expect(cables(ed)).toEqual([P([4, 0], [10, 0], [10, 6], [16, 6], [16, 10])])
    })

    it('un clic en un pin con un temblor menor a medio paso sigue siendo cableado por clics', () => {
      const ed = nuevo(enEscalera())
      ed.abajo({ x: 4, y: 0 })
      ed.mover({ x: 4.4, y: 0.3 })
      ed.arriba({ x: 4.4, y: 0.3 })
      expect(ed.herramienta).toBe('cablear')
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0]))
      expect(cables(ed)).toEqual([])
    })

    it('el clic derecho o Esc durante el arrastre cancelan y soltar después no crea nada', () => {
      for (const cancelar of [(ed: Editor) => ed.clicDerecho(), (ed: Editor) => ed.escape()]) {
        const ed = nuevo(enEscalera())
        ed.abajo({ x: 4, y: 0 })
        ed.mover({ x: 10, y: 1 })
        ed.mover({ x: 16, y: 10 })
        cancelar(ed)
        ed.arriba({ x: 16, y: 10 })
        expect(ed.herramienta).toBe('seleccionar')
        expect(cables(ed)).toEqual([])
        expect(ed.estado().cableEnCurso).toBeNull()
      }
    })
  })

  describe('doble clic derecho borra lo que está bajo el cursor', () => {
    it('una pieza, en un paso y sin tocar la selección', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 20, 0.5)
      ed.dobleClicDerecho({ x: 0, y: 0.5 })
      expect(Object.keys(ed.doc.piezas)).toEqual(['b'])
      expect([...ed.seleccion.piezas]).toEqual(['b'])
      ed.deshacer()
      expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
    })

    it('avisa al tutorial solo si borró algo', () => {
      let borrados = 0
      const ed = nuevo(dosResistencias(), { alBorrarConClicDerecho: () => borrados++ })
      ed.dobleClicDerecho({ x: 60, y: 60 })
      expect(borrados).toBe(0)
      ed.dobleClicDerecho({ x: 0, y: 0.5 })
      expect(borrados).toBe(1)
    })

    it('un pin cuenta como su pieza', () => {
      const ed = nuevo(dosResistencias())
      ed.dobleClicDerecho({ x: 4.1, y: 0 })
      expect(Object.keys(ed.doc.piezas)).toEqual(['b'])
    })

    it('un cable completo, una etiqueta y una nota', () => {
      const d = dosResistencias(C('c', [4, 0], [10, 0], [10, 10]))
      d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 30, y: 20, rot: 0 }
      d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
      const ed = nuevo(d)
      ed.dobleClicDerecho({ x: 10.2, y: 5 })
      expect(ed.doc.cables).toEqual({})
      ed.dobleClicDerecho({ x: 33, y: 20 })
      expect(ed.doc.etiquetas).toEqual({})
      ed.dobleClicDerecho({ x: -26, y: -28 })
      expect(ed.doc.notas).toEqual({})
      expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
    })

    it('en el vacío no hace nada', () => {
      const ed = nuevo(dosResistencias())
      ed.dobleClicDerecho({ x: 10, y: 30 })
      expect(Object.keys(ed.doc.piezas).sort()).toEqual(['a', 'b'])
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('cableando, el primer clic derecho cancela y el segundo borra lo que está bajo el cursor', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 4, 0)
      ed.mover({ x: 20, y: 0.5 })
      ed.clicDerecho()
      expect(ed.herramienta).toBe('seleccionar')
      ed.dobleClicDerecho({ x: 20, y: 0.5 })
      expect(Object.keys(ed.doc.piezas)).toEqual(['a'])
      expect(cables(ed)).toEqual([])
    })

    it('colocando, igual: cancela la colocación y borra la pieza de abajo', () => {
      const ed = nuevo(dosResistencias())
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      ed.clicDerecho()
      ed.dobleClicDerecho({ x: 0, y: 0.5 })
      expect(ed.herramienta).toBe('seleccionar')
      expect(Object.keys(ed.doc.piezas)).toEqual(['b'])
    })
  })

  describe('una pieza de dos pines sobre un cable queda en serie', () => {
    const conCable = () => {
      const d = documentoVacio()
      d.cables.w = C('w', [-20, 0], [20, 0])
      return d
    }

    it('al colocarla parte el cable en sus pines, sin uniones, y deshacer lo regresa en un paso', () => {
      const ed = nuevo(conCable())
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      clic(ed, 0, 0)
      expect(cables(ed)).toEqual([P([-20, 0], [-4, 0]), P([4, 0], [20, 0])])
      expect(ed.con.redDePin.get('p_0001:1')).toBeDefined()
      expect(ed.con.redDePin.get('p_0001:1')).not.toBe(ed.con.redDePin.get('p_0001:2'))
      expect(ed.con.uniones).toEqual([])
      ed.deshacer()
      expect(cables(ed)).toEqual([P([-20, 0], [20, 0])])
      expect(ed.doc.piezas).toEqual({})
    })

    it('al soltar un arrastre encima del cable también, en el mismo paso del arrastre', () => {
      const d = conCable()
      d.piezas.r = R('r', 'R1', 0, 20)
      const ed = nuevo(d)
      ed.abajo({ x: 0, y: 20.5 })
      ed.mover({ x: 0, y: 10.5 })
      ed.mover({ x: 0, y: 0.5 })
      ed.arriba({ x: 0, y: 0.5 })
      expect(ed.doc.piezas.r).toMatchObject({ x: 0, y: 0 })
      expect(cables(ed)).toEqual([P([-20, 0], [-4, 0]), P([4, 0], [20, 0])])
      expect(ed.con.redDePin.get('r:1')).not.toBe(ed.con.redDePin.get('r:2'))
      ed.deshacer()
      expect(ed.doc.piezas.r).toMatchObject({ x: 0, y: 20 })
      expect(cables(ed)).toEqual([P([-20, 0], [20, 0])])
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('girada sobre el cable no lo toca', () => {
      const ed = nuevo(conCable())
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      ed.transformar('girar')
      clic(ed, 0, 0)
      expect(cables(ed)).toEqual([P([-20, 0], [20, 0])])
    })
  })

  describe('cables que nunca atraviesan piezas', () => {
    const bateriaYBoton = () => {
      const d = documentoVacio()
      d.piezas.b = { id: 'b', tipo: 'bateria', ref: 'B1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
      d.piezas.s = { id: 's', tipo: 'boton', ref: 'S1', x: 10, y: -8, rot: 0, espejo: false, props: {} }
      return d
    }

    it('caso del usuario: del pin inferior de la batería al derecho del botón, aunque el mouse suba primero', () => {
      const ed = nuevo(bateriaYBoton())
      clic(ed, 0, 4)
      // El primer movimiento es vertical: la L pedida sube por la batería y el botón; el enrutador la evita.
      ed.mover({ x: 0.3, y: -6 })
      ed.mover({ x: 14, y: -8 })
      expect(ed.estado().choque).toBeNull()
      clic(ed, 14, -8)
      expect(Object.keys(ed.doc.cables)).toHaveLength(1)
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.con.redDePin.get('b:-')).toBe(ed.con.redDePin.get('s:2'))
    })

    it('la L pedida se respeta si está libre, y / la invierte', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 20, 10)
      const ed = nuevo(d)
      clic(ed, 4, 0)
      ed.mover({ x: 4.3, y: 6 })
      ed.mover({ x: 16, y: 10 })
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [4, 10], [16, 10]))
      ed.invertirL()
      expect(ed.estado().cableEnCurso).toEqual(P([4, 0], [16, 0], [16, 10]))
      clic(ed, 16, 10)
      expect(cables(ed)).toEqual([P([4, 0], [16, 0], [16, 10])])
    })

    it('una esquina dentro de una pieza no se fija: el cable sigue en curso, en rojo, y se sacude', () => {
      const efectos: Efecto[] = []
      const ed = nuevo(dosResistencias(), { animar: (e) => efectos.push(e) })
      clic(ed, 4, 0)
      ed.mover({ x: 20, y: 0.4 })
      expect(ed.estado().choque).toEqual({ con: 'b', ref: 'R2', col: 'piezas' })
      clic(ed, 20, 0.4)
      expect(ed.herramienta).toBe('cablear')
      expect(cables(ed)).toEqual([])
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: [], cables: ['en-curso'] }])
      ed.mover({ x: 10, y: 6 })
      expect(ed.estado().choque).toBeNull()
    })

    it('reproducción 1: girar una pieza con un cable en su pin ya no lo deja atravesándola', () => {
      // Antes: el cable (4, 0)-(16, 0) quedaba (4, 0)-(20, 0)-(20, −4) y su tramo y = 0 entraba en el cuerpo de R2.
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      clic(ed, 20, 0.5)
      ed.transformar('girar')
      expect(ed.doc.piezas.b.rot).toBe(90)
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.doc.cables.c.puntos.every((p) => Object.keys(p).sort().join() === 'x,y')).toBe(true)
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    })

    it('reproducción 2: arrastrar una pieza vertical a lo largo de su eje re-enruta el cable de su pin', () => {
      // Antes: el conector nuevo bajaba por x = 0 de y = −10 a −4, por dentro del cuerpo movido (y −8.5..−3.5).
      const d = documentoVacio()
      d.piezas.a = { ...R('a', 'R1', 0, 0), rot: 90 }
      d.piezas.b = R('b', 'R2', 20, -4)
      d.cables.c = C('c', [0, -4], [16, -4])
      const ed = nuevo(d)
      ed.abajo({ x: 0.5, y: 0 })
      ed.mover({ x: 0.5, y: -6 })
      ed.arriba({ x: 0.5, y: -6 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: -6 })
      expect(violaciones(ed.doc, lib)).toEqual([])
      // Girada 90°, el pin 1 de R1 es el de arriba.
      expect(ed.con.redDePin.get('a:1')).toBe(ed.con.redDePin.get('b:1'))
      ed.deshacer()
      expect(ed.doc.cables.c.puntos).toEqual(P([0, -4], [16, -4]))
    })

    it('al soltar, un cable estirado que quedó con una vuelta en U se re-enruta con menos codos', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 30, 0)
      // Chipote: sube, cruza y baja hasta R2.
      d.cables.c = C('c', [4, 0], [4, -8], [26, -8], [26, 0])
      const ed = nuevo(d)
      ed.abajo({ x: 30, y: 0.5 })
      ed.mover({ x: 30, y: 2.5 })
      ed.arriba({ x: 30, y: 2.5 })
      expect(ed.doc.piezas.b).toMatchObject({ y: 2 })
      expect(ed.doc.cables.c.puntos.length).toBeLessThan(5)
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    })

    it('una pieza girada sobre un cable se rechaza: «Se encima con un cable»', () => {
      const d = documentoVacio()
      d.cables.w = C('w', [-20, 0], [20, 0])
      const ed = nuevo(d)
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      ed.transformar('girar')
      expect(ed.estado().choque).toEqual({ con: 'w', ref: 'un cable', col: 'cables' })
      clic(ed, 0, 0)
      expect(ed.doc.piezas).toEqual({})
      ed.transformar('girar')
      expect(ed.estado().choque).toBeNull()
    })

    it('arrastrar una pieza de modo que un cable ajeno la atraviese se revierte', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.cables.w = C('w', [10, -20], [10, 20])
      const ed = nuevo(d)
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 10, y: 0.5 })
      expect(ed.estado().choque).toEqual({ con: 'w', ref: 'un cable', col: 'cables' })
      ed.arriba({ x: 10, y: 0.5 })
      expect(ed.doc.piezas.a).toMatchObject({ x: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('pegar no deja un cable del documento cruzando lo pegado', () => {
      const d = dosResistencias()
      d.cables.w = C('w', [-10, 4], [40, 4])
      const ed = nuevo(d)
      clic(ed, 0, 0.5)
      ed.copiar()
      ed.mover({ x: 10, y: 4 })
      ed.pegar()
      expect(Object.keys(ed.doc.piezas)).toHaveLength(3)
      expect(violaciones(ed.doc, lib)).toEqual([])
    })
  })

  describe('arrastrar un tramo de cable', () => {
    /** El chipote del usuario: (0, 0)→(0, −8)→(18, −8)→(18, 0)→(40, 0), con sus puntas en pines de R1 y R2. */
    function chipote(): Documento {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', -4, 0)
      d.piezas.b = R('b', 'R2', 44, 0)
      d.cables.w = C('w', [0, 0], [0, -8], [18, -8], [18, 0], [40, 0])
      return d
    }

    it('bajar el tramo y = −8 hasta y = 0 deja un solo cable recto de (0, 0) a (40, 0), en un paso', () => {
      const ed = nuevo(chipote())
      ed.abajo({ x: 9, y: -7.8 })
      ed.mover({ x: 9, y: -4 })
      ed.mover({ x: 9, y: 0.2 })
      ed.arriba({ x: 9, y: 0.2 })
      expect(cables(ed)).toEqual([P([0, 0], [40, 0])])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      ed.deshacer()
      expect(cables(ed)).toEqual([P([0, 0], [0, -8], [18, -8], [18, 0], [40, 0])])
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('el tramo solo se mueve en perpendicular a su dirección', () => {
      const ed = nuevo(chipote())
      ed.abajo({ x: 9, y: -7.8 })
      ed.mover({ x: 15, y: -4 })
      ed.arriba({ x: 15, y: -4 })
      expect(cables(ed)).toEqual([P([0, 0], [0, -4], [18, -4], [18, 0], [40, 0])])
    })

    it('el primer tramo, clavado en un pin, agrega un codo y la punta no se mueve', () => {
      const ed = nuevo(chipote())
      ed.abajo({ x: 0.2, y: -4 })
      ed.mover({ x: -3.8, y: -4 })
      ed.arriba({ x: -3.8, y: -4 })
      // Hacia R1 la caja del tramo nuevo entraría a su cuerpo: se prueba hacia la derecha.
      ed.abajo({ x: 0.2, y: -4 })
      ed.mover({ x: 6.2, y: -4 })
      ed.arriba({ x: 6.2, y: -4 })
      expect(cables(ed)).toEqual([P([0, 0], [6, 0], [6, -8], [18, -8], [18, 0], [40, 0])])
    })

    it('con varios elementos seleccionados el cable se mueve completo', () => {
      const d = documentoVacio()
      d.cables.u = C('u', [30, 10], [40, 10])
      d.cables.v = C('v', [30, 20], [40, 20])
      const ed = nuevo(d)
      ed.abajo({ x: 26, y: 6 })
      ed.mover({ x: 44, y: 24 })
      ed.arriba({ x: 44, y: 24 })
      expect(ed.seleccion.cables.size).toBe(2)
      ed.abajo({ x: 35, y: 10.2 })
      ed.mover({ x: 37, y: 14.2 })
      ed.arriba({ x: 37, y: 14.2 })
      expect(ed.doc.cables.u.puntos).toEqual(P([32, 14], [42, 14]))
      expect(ed.doc.cables.v.puntos).toEqual(P([32, 24], [42, 24]))
    })

    it('soltar un tramo dentro de una pieza se revierte sin paso en el historial', () => {
      const d = dosResistencias(C('f', [-10, 10], [10, 10]))
      const efectos: Efecto[] = []
      const ed = nuevo(d, { animar: (e) => efectos.push(e) })
      ed.abajo({ x: 0, y: 10.2 })
      ed.mover({ x: 0, y: 0.2 })
      expect(ed.estado().choque).toEqual({ con: 'a', ref: 'R1', col: 'piezas' })
      ed.arriba({ x: 0, y: 0.2 })
      expect(ed.doc.cables.f.puntos).toEqual(P([-10, 10], [10, 10]))
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: [], cables: ['f'] }])
    })
  })

  describe('R, X e Y solo transforman piezas, cada una en su lugar', () => {
    it('X dos veces y R cuatro veces regresan la pieza a como estaba', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 20, 0.5)
      ed.transformar('espejoX')
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0, rot: 0, espejo: true })
      ed.transformar('espejoX')
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0, rot: 0, espejo: false })
      for (let k = 0; k < 4; k++) ed.transformar('girar')
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0, rot: 0, espejo: false })
    })

    it('con un cable en el pin 2, R lo deja conectado y ortogonal y no mueve su otra punta', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      clic(ed, 0, 0.5)
      ed.transformar('girar')
      const pts = ed.doc.cables.c.puntos
      expect(pts[0]).toEqual({ x: 0, y: 4 })
      expect(pts[pts.length - 1]).toEqual({ x: 16, y: 0 })
      expect(pts.every((q, i) => i === 0 || q.x === pts[i - 1].x || q.y === pts[i - 1].y)).toBe(true)
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
    })

    it('X sobre una pieza con cables en los dos pines los cruza al otro lado sin atravesarla', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.l = R('l', 'R2', -20, 0)
      d.piezas.r = R('r', 'R3', 20, 0)
      d.cables.i = C('i', [-16, 0], [-4, 0])
      d.cables.o = C('o', [4, 0], [16, 0])
      const ed = nuevo(d)
      clic(ed, 0, 0.5)
      ed.transformar('espejoX')
      expect(ed.doc.piezas.a).toMatchObject({ x: 0, y: 0, espejo: true })
      expect(violaciones(ed.doc, lib)).toEqual([])
      // El pin 1 de R1 ahora está a la derecha: sigue unido a R2, y el 2 a R3.
      expect(ed.con.redDePin.get('a:1')).toBe(ed.con.redDePin.get('l:2'))
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('r:1'))
    })

    it('dos piezas conectadas y su cable seleccionados: giran juntas alrededor de su centro, en un solo paso', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      ed.seleccionarTodo()
      ed.transformar('girar')
      const a = ed.doc.piezas.a
      expect(a.rot).toBe(90)
      expect(ed.doc.piezas.b).toMatchObject({ x: a.x, y: a.y + 20, rot: 90 })
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      ed.deshacer()
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0]))
      expect(ed.doc.piezas.a.rot).toBe(0)
    })

    it('un cable seleccionado en el grupo conserva su forma girada y no se vuelve a enrutar', () => {
      const d = dosResistencias(C('c', [4, 0], [8, 0], [8, 6], [16, 6], [16, 0]))
      const ed = nuevo(d)
      ed.seleccionarTodo()
      // Lo que da la transformación pura del grupo, sin pasar por el enrutado de las puntas estiradas.
      const girado = aplicar(d, transformarSeleccion(d, ed.seleccion, 'girar', lib)).cables.c.puntos
      ed.transformar('girar')
      expect(ed.doc.cables.c.puntos).toEqual(girado)
    })

    it('con solo cables o notas seleccionados no pasa nada: sin paso en el historial y con una sacudida', () => {
      const efectos: Efecto[] = []
      const d = dosResistencias(C('c', [4, 0], [16, 0]))
      d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
      const ed = nuevo(d, { animar: (e) => efectos.push(e) })
      clic(ed, 10, 0.2)
      expect([...ed.seleccion.cables]).toEqual(['c'])
      ed.transformar('girar')
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0]))
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: [], cables: ['c'] }])
      clic(ed, -26, -28)
      ed.transformar('espejoY')
      expect(ed.doc.notas.n).toEqual(d.notas.n)
      expect(ed.historial.puedeDeshacer).toBe(false)
    })
  })

  describe('flechas', () => {
    const atajosDe = (ed: Editor, vista: [number, number][] = []) => {
      const a = new Atajos()
      registrarAtajosDelEditor(a, ed, { encuadrar: () => {}, desplazarVista: (fx, fy) => vista.push([fx, fy]) })
      return a
    }

    it('mueven la selección un paso de rejilla; con Shift, cinco', () => {
      const ed = nuevo(dosResistencias())
      const a = atajosDe(ed)
      expect(a.conflictos()).toEqual([])
      clic(ed, 20, 0.5)
      a.despachar(ev('ArrowRight'))
      expect(ed.doc.piezas.b).toMatchObject({ x: 22, y: 0 })
      a.despachar(ev('ArrowDown', { shiftKey: true }))
      expect(ed.doc.piezas.b).toMatchObject({ x: 22, y: 10 })
      a.despachar(ev('ArrowLeft'))
      a.despachar(ev('ArrowUp'))
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 8 })
    })

    it('pulsaciones seguidas en 800 ms son un solo paso de deshacer; después, otro', () => {
      const ed = nuevo(dosResistencias())
      let t = 1000
      ed.ahora = () => t
      clic(ed, 20, 0.5)
      ed.desplazar(2, 0)
      t += 300
      ed.desplazar(2, 0)
      t += 300
      ed.desplazar(2, 0)
      expect(ed.doc.piezas.b.x).toBe(26)
      t += 900
      ed.desplazar(0, 2)
      ed.deshacer()
      expect(ed.doc.piezas.b).toMatchObject({ x: 26, y: 0 })
      ed.deshacer()
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0 })
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('otra orden entre dos flechas corta el paso', () => {
      const ed = nuevo(dosResistencias())
      let t = 0
      ed.ahora = () => t
      clic(ed, 20, 0.5)
      ed.desplazar(2, 0)
      ed.transformar('girar')
      t += 100
      ed.desplazar(2, 0)
      ed.deshacer()
      expect(ed.doc.piezas.b).toMatchObject({ x: 22, rot: 90 })
    })

    it('estiran los cables pegados como un arrastre y no dejan encimar piezas', () => {
      const efectos: Efecto[] = []
      const d = dosResistencias(C('c', [4, 0], [16, 0]))
      const ed = nuevo(d, { animar: (e) => efectos.push(e) })
      clic(ed, 20, 0.5)
      ed.desplazar(0, 6)
      expect(ed.doc.cables.c.puntos).toEqual(P([4, 0], [16, 0], [16, 6]))
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      // R2 junto a R1 con los pines tocándose: un paso más a la izquierda la encimaría.
      const d2 = documentoVacio()
      d2.piezas.a = R('a', 'R1', 0, 0)
      d2.piezas.b = R('b', 'R2', 8, 0)
      const ed2 = nuevo(d2, { animar: (e) => efectos.push(e) })
      clic(ed2, 8, 0.5)
      ed2.desplazar(-2, 0)
      expect(ed2.doc.piezas.b.x).toBe(8)
      expect(ed2.historial.puedeDeshacer).toBe(false)
      expect(efectos.at(-1)).toEqual({ tipo: 'sacudida', piezas: ['b'], cables: [] })
    })

    it('sin selección mueven la vista un 10 %; colocando mueven el fantasma y arrastrando no hacen nada', () => {
      const vista: [number, number][] = []
      const ed = nuevo(dosResistencias())
      const a = atajosDe(ed, vista)
      a.despachar(ev('ArrowLeft'))
      a.despachar(ev('ArrowDown', { shiftKey: true }))
      expect(vista).toEqual([[-0.1, 0], [0, 0.1]])
      ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
      a.despachar(ev('ArrowLeft'))
      expect(vista).toHaveLength(2)
      expect(ed.fantasma).toMatchObject({ x: 38, y: 0 })
      ed.escape()
      ed.abajo({ x: 20, y: 0.5 })
      ed.mover({ x: 20, y: 4.5 })
      expect(ed.desplazar(2, 0)).toBe(true)
      ed.arriba({ x: 20, y: 4.5 })
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 4 })
    })
  })

  describe('colocar con el teclado', () => {
    const atajosDe = (ed: Editor) => {
      const a = new Atajos()
      registrarAtajosDelEditor(a, ed, { encuadrar: () => {} })
      return a
    }

    it('las flechas mueven el fantasma un paso de rejilla (Shift: cinco) y la vista se queda quieta', () => {
      const vista: [number, number][] = []
      const ed = nuevo()
      const a = new Atajos()
      registrarAtajosDelEditor(a, ed, { encuadrar: () => {}, desplazarVista: (fx, fy) => vista.push([fx, fy]) })
      ed.empezarColocar('resistencia', undefined, { x: 10, y: 0 })
      a.despachar(ev('ArrowRight'))
      expect(ed.fantasma).toMatchObject({ x: 12, y: 0 })
      a.despachar(ev('ArrowDown', { shiftKey: true }))
      expect(ed.fantasma).toMatchObject({ x: 12, y: 10 })
      expect(ed.cursor).toEqual({ x: 12, y: 10 })
      expect(vista).toEqual([])
    })

    it('nada sale del mundo que un .kir admite: una flecha junto al borde no mueve la pieza más allá', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', LIMITE_COORDENADA - 2, 0)
      const registro: string[] = []
      const efectos: Efecto[] = []
      const ed = nuevo(d, { registrar: (t) => registro.push(t), animar: (e) => efectos.push(e) })
      ed.seleccionar(seleccionDe('piezas', 'a'))
      const a = atajosDe(ed)
      a.despachar(ev('ArrowRight', { shiftKey: true }))
      expect(ed.doc.piezas.a.x).toBe(LIMITE_COORDENADA - 2)
      // Como cualquier otro rechazo: se sacude y el Registro dice por qué.
      expect(registro.at(-1)).toBe('No se pudo mover la selección: quedaría fuera del área de dibujo.')
      expect(efectos.at(-1)).toMatchObject({ tipo: 'sacudida', piezas: ['a'] })
      a.despachar(ev('ArrowRight'))
      expect(ed.doc.piezas.a.x).toBe(LIMITE_COORDENADA)
      a.despachar(ev('ArrowRight'))
      expect(ed.doc.piezas.a.x).toBe(LIMITE_COORDENADA)
      // Pegar fuera no pega.
      ed.copiar()
      ed.mover({ x: LIMITE_COORDENADA + 40, y: 0 })
      ed.pegar()
      expect(Object.keys(ed.doc.piezas)).toEqual(['a'])
      expect(registro.at(-1)).toBe('No se pegó: quedaría fuera del área de dibujo.')
      // Colocar fuera tampoco crea nada.
      ed.empezarColocar('resistencia', undefined, { x: LIMITE_COORDENADA + 10, y: 0 })
      clic(ed, LIMITE_COORDENADA + 10, 0)
      expect(Object.keys(ed.doc.piezas)).toEqual(['a'])
      expect(registro.at(-1)).toBe('No se colocó R2: quedaría fuera del área de dibujo.')
    })

    it('al cambiar la familia, una alimentación que la nueva no admite pasa a la más cercana, en el mismo paso y avisando', () => {
      const d = documentoVacio()
      d.piezas.u = { id: 'u', tipo: 'nand', ref: 'U1', x: 0, y: 0, rot: 0, espejo: false, props: { alimentacion: '3.3 V' } }
      const registro: string[] = []
      const ed = nuevo(d, { registrar: (t) => registro.push(t) })
      expect(ed.cambiarPropiedad('u', 'familia', '74LS')).toBeNull()
      expect(ed.doc.piezas.u.props).toMatchObject({ familia: '74LS', alimentacion: '5 V' })
      expect(registro.at(-1)).toBe('La alimentación de U1 pasó de 3.3 V a 5 V: 74LS admite de 5 V a 5 V.')
      ed.deshacer()
      expect(ed.doc.piezas.u.props).toEqual({ alimentacion: '3.3 V' })
      // Si la alimentación cabe en la familia nueva, no cambia.
      expect(ed.cambiarPropiedad('u', 'familia', 'CD4000B')).toBeNull()
      expect(ed.doc.piezas.u.props).toMatchObject({ familia: 'CD4000B', alimentacion: '3.3 V' })
    })

    it('un cable que saldría del área de dibujo se rechaza antes de cancelarlo, con su sacudida', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', LIMITE_COORDENADA - 10, 0)
      d.piezas.b = R('b', 'R2', LIMITE_COORDENADA - 10, 20)
      const registro: string[] = []
      const ed = nuevo(d, { registrar: (t) => registro.push(t) })
      // Del pin derecho de R1 (en LIMITE - 6) a una esquina más allá del borde, y de ahí al pin derecho de R2.
      clic(ed, LIMITE_COORDENADA - 6, 0)
      expect(ed.herramienta).toBe('cablear')
      ed.mover({ x: LIMITE_COORDENADA + 20, y: 0 })
      clic(ed, LIMITE_COORDENADA + 20, 0)
      ed.mover({ x: LIMITE_COORDENADA - 6, y: 20 })
      clic(ed, LIMITE_COORDENADA - 6, 20)
      expect(Object.keys(ed.doc.cables)).toEqual([])
      // Rechazado, no cancelado: el cable sigue en curso para corregirlo, como con un choque.
      expect(ed.herramienta).toBe('cablear')
      expect(registro).toContain('El cable no se trazó: quedaría fuera del área de dibujo.')
    })

    it('un fantasma encimado por una flecha se marca como choque', () => {
      const ed = nuevo(dosResistencias())
      ed.empezarColocar('resistencia', undefined, { x: 10, y: 0 })
      expect(ed.estado().choque).toBeNull()
      const a = atajosDe(ed)
      a.despachar(ev('ArrowRight'))
      a.despachar(ev('ArrowRight'))
      a.despachar(ev('ArrowRight'))
      expect(ed.estado().choque).not.toBeNull()
    })

    it('Enter coloca y vuelve a seleccionar; Shift+Enter coloca y sigue; Espacio es como Enter', () => {
      const registro: string[] = []
      const ed = nuevo(documentoVacio(), { registrar: (t) => registro.push(t) })
      const a = atajosDe(ed)
      ed.empezarColocar('resistencia', '4k7', { x: 10, y: 0 })
      a.despachar(ev('Enter'))
      expect(Object.values(ed.doc.piezas).map((p) => [p.x, p.y])).toEqual([[10, 0]])
      expect(ed.herramienta).toBe('seleccionar')
      expect(registro).toEqual(['Se colocó R1.'])
      ed.empezarColocar('resistencia', undefined, { x: 30, y: 0 })
      a.despachar(ev('Enter', { shiftKey: true }))
      expect(ed.herramienta).toBe('colocar')
      a.despachar(ev('ArrowRight', { shiftKey: true }))
      a.despachar(ev(' '))
      expect(Object.keys(ed.doc.piezas)).toHaveLength(3)
      expect(ed.herramienta).toBe('seleccionar')
      expect(registro).toEqual(['Se colocó R1.', 'Se colocó R2.', 'Se colocó R3.'])
    })

    it('Enter sobre un lugar ocupado no coloca, avisa por qué y el fantasma sigue; Esc cancela', () => {
      const registro: string[] = []
      const ed = nuevo(dosResistencias(), { registrar: (t) => registro.push(t) })
      const a = atajosDe(ed)
      ed.empezarColocar('resistencia', undefined, { x: 0, y: 0 })
      a.despachar(ev('Enter'))
      expect(Object.keys(ed.doc.piezas)).toHaveLength(2)
      expect(ed.herramienta).toBe('colocar')
      expect(registro[0]).toMatch(/No se colocó R3/)
      a.despachar(ev('Escape'))
      expect(ed.herramienta).toBe('seleccionar')
    })

    it('Enter y Espacio no hacen nada fuera de colocar (no se tragan la tecla de un botón)', () => {
      const ed = nuevo(dosResistencias())
      const a = atajosDe(ed)
      let evitado = false
      expect(a.despachar({ ...ev('Enter'), preventDefault: () => (evitado = true) })).toBe(false)
      expect(evitado).toBe(false)
      expect(Object.keys(ed.doc.piezas)).toHaveLength(2)
    })
  })

  describe('menú del clic derecho', () => {
    it('clicDerecho dice si canceló algo: entonces no se abre el menú', () => {
      const ed = nuevo(dosResistencias())
      expect(ed.clicDerecho()).toBe(false)
      clic(ed, 4, 0)
      expect(ed.herramienta).toBe('cablear')
      expect(ed.clicDerecho()).toBe(true)
      expect(ed.herramienta).toBe('seleccionar')
    })

    it('sobre una pieza (o su pin) la selecciona sola y deja el cursor en el punto', () => {
      const ed = nuevo(dosResistencias())
      clic(ed, 20, 0.5)
      expect(ed.objetivoMenu({ x: 0.3, y: 0.4 })).toEqual({ tipo: 'pieza', id: 'a', en: { x: 0.3, y: 0.4 } })
      expect([...ed.seleccion.piezas]).toEqual(['a'])
      expect(ed.cursor).toEqual({ x: 0, y: 0 })
      expect(ed.objetivoMenu({ x: 4, y: 0 })).toMatchObject({ tipo: 'pieza', id: 'a' })
    })

    it('sobre un miembro de una selección de varios la conserva', () => {
      const ed = nuevo(dosResistencias())
      ed.seleccionarTodo()
      ed.objetivoMenu({ x: 20, y: 0.5 })
      expect([...ed.seleccion.piezas].sort()).toEqual(['a', 'b'])
    })

    it('sobre un cable da el punto del tramo; en el vacío, el punto de rejilla', () => {
      const ed = nuevo(dosResistencias(C('w', [4, 0], [16, 0])))
      expect(ed.objetivoMenu({ x: 9.7, y: 0.2 })).toEqual({ tipo: 'cable', id: 'w', en: { x: 10, y: 0 } })
      expect([...ed.seleccion.cables]).toEqual(['w'])
      expect(ed.objetivoMenu({ x: 7.1, y: 9.2 })).toEqual({ tipo: 'vacio', en: { x: 8, y: 10 } })
      expect([...ed.seleccion.cables]).toEqual(['w'])
    })

    it('seleccionar su red: desde la pieza, la del pin más cercano al clic; desde el cable, la suya', () => {
      const d = dosResistencias(C('w', [4, 0], [16, 0]), C('v', [-4, 0], [-10, 0]))
      const ed = nuevo(d)
      ed.seleccionarRed(ed.objetivoMenu({ x: 2.5, y: 0.5 }))
      expect([...ed.seleccion.cables]).toEqual(['w'])
      expect(ed.seleccion.piezas.size).toBe(0)
      ed.seleccionarRed(ed.objetivoMenu({ x: -2.5, y: 0.5 }))
      expect([...ed.seleccion.cables]).toEqual(['v'])
      ed.seleccionarRed(ed.objetivoMenu({ x: 10, y: 0 }))
      expect([...ed.seleccion.cables]).toEqual(['w'])
    })

    it('una red sin cables no cambia la selección: avisa al registro y sacude', () => {
      const registro: string[] = []
      const efectos: Efecto[] = []
      const ed = nuevo(dosResistencias(), { registrar: (t) => registro.push(t), animar: (e) => efectos.push(e) })
      ed.seleccionarRed(ed.objetivoMenu({ x: 20, y: 0.5 }))
      expect([...ed.seleccion.piezas]).toEqual(['b'])
      expect(registro).toEqual(['La red del pin 1 de R2 no tiene cables.'])
      expect(efectos).toEqual([{ tipo: 'sacudida', piezas: ['b'], cables: [] }])
    })

    it('derivar desde aquí empieza un cable en el punto del tramo, como Alt+clic', () => {
      const ed = nuevo(dosResistencias(C('w', [4, 0], [16, 0])))
      const o = ed.objetivoMenu({ x: 9.7, y: 0.2 })
      ed.derivarDesde(o.en)
      expect(ed.herramienta).toBe('cablear')
      ed.mover({ x: 10, y: 8 })
      expect(ed.estado().cableEnCurso?.[0]).toEqual({ x: 10, y: 0 })
    })

    it('seleccionar desde un panel quita lo que ya no existe; puedePegar sigue al portapapeles', () => {
      const ed = nuevo(dosResistencias())
      const s = seleccionVacia()
      s.piezas.add('b')
      s.piezas.add('no-existe')
      ed.seleccionar(s)
      expect([...ed.seleccion.piezas]).toEqual(['b'])
      expect(ed.puedePegar).toBe(false)
      ed.copiar()
      expect(ed.puedePegar).toBe(true)
    })
  })

  describe('inspector: posición y propiedades', () => {
    it('un giro y reflejo absolutos siguen las reglas de R, X e Y y no dejan paso si ya están', () => {
      const ed = nuevo(dosResistencias(C('c', [4, 0], [16, 0])))
      clic(ed, 20, 0.5)
      ed.transformar({ rot: 90, espejo: false })
      expect(ed.doc.piezas.b).toMatchObject({ x: 20, y: 0, rot: 90, espejo: false })
      expect(violaciones(ed.doc, lib)).toEqual([])
      expect(ed.con.redDePin.get('a:2')).toBe(ed.con.redDePin.get('b:1'))
      ed.transformar({ rot: 90, espejo: false })
      ed.transformar({ rot: 90, espejo: true })
      expect(ed.doc.piezas.b).toMatchObject({ rot: 90, espejo: true })
      ed.deshacer()
      ed.deshacer()
      expect(ed.doc.piezas.b).toMatchObject({ rot: 0, espejo: false })
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('cambiarPropiedad valida en el campo y deja un paso por cambio', () => {
      const d = dosResistencias()
      d.piezas.s = { id: 's', tipo: 'interruptor', ref: 'S1', x: 0, y: 20, rot: 0, espejo: false, props: {} }
      const ed = nuevo(d)
      expect(ed.cambiarPropiedad('a', 'valor', 'abc')).toBe('«abc» no es un valor válido.')
      expect(ed.cambiarPropiedad('a', 'valor', '1k')).toBeNull()
      expect(ed.historial.puedeDeshacer).toBe(false)
      expect(ed.cambiarPropiedad('a', 'valor', '4k7')).toBeNull()
      expect(ed.doc.piezas.a.props.valor).toBe('4k7')
      expect(ed.cambiarPropiedad('s', 'estado', 'cerrado')).toBeNull()
      expect(ed.doc.piezas.s.props.estado).toBe('cerrado')
      ed.deshacer()
      ed.deshacer()
      expect(ed.doc.piezas.a.props).toEqual({})
      expect(ed.historial.puedeDeshacer).toBe(false)
    })

    it('cambiarPropiedad durante un arrastre devuelve un error y no cambia nada', () => {
      const ed = nuevo(dosResistencias())
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 5, y: 0.5 })
      expect(ed.cambiarPropiedad('a', 'valor', '4k7')).toMatch(/arrastre/i)
      expect(ed.doc.piezas.a.props).toEqual({})
      ed.arriba({ x: 5, y: 0.5 })
    })
  })

  describe('el Registro dice por qué se rechazó una operación', () => {
    const conRegistro = (d: Documento) => {
      const registro: string[] = []
      return { ed: nuevo(d, { registrar: (t) => registro.push(t) }), registro }
    }

    it('colocar encima de otra pieza', () => {
      const { ed, registro } = conRegistro(dosResistencias())
      ed.empezarColocar('resistencia', undefined, { x: 2, y: 0 })
      clic(ed, 2, 0)
      expect(registro).toEqual(['No se colocó R3: se encimaría con R1.'])
    })

    it('un cable que atravesaría una pieza', () => {
      const { ed, registro } = conRegistro(dosResistencias())
      clic(ed, 4, 0)
      ed.mover({ x: 20, y: 0.4 })
      clic(ed, 20, 0.4)
      expect(registro).toEqual(['La esquina no se fijó: atravesaría R2.'])
    })

    it('un arrastre que se revierte', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.cables.w = C('w', [10, -20], [10, 20])
      const { ed, registro } = conRegistro(d)
      ed.abajo({ x: 0, y: 0.5 })
      ed.mover({ x: 10, y: 0.5 })
      ed.arriba({ x: 10, y: 0.5 })
      expect(registro).toEqual(['El movimiento se deshizo: un cable atravesaría R1.'])
    })

    it('girar algo que no es pieza, o girar hacia otra pieza', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 0, 4)
      d.cables.w = C('w', [20, 0], [30, 0])
      const { ed, registro } = conRegistro(d)
      clic(ed, 25, 0)
      ed.transformar('girar')
      clic(ed, 0, 0.5)
      ed.transformar('girar')
      expect(ed.doc.piezas.a.rot).toBe(0)
      expect(registro).toEqual(['Girar solo cambia piezas y etiquetas de red.', 'R1 no se pudo girar: se encimaría con R2.'])
    })

    it('reflejar o cambiar la orientación de algo que no es pieza dice qué sí cambian', () => {
      const d = documentoVacio()
      d.cables.w = C('w', [20, 0], [30, 0])
      const { ed, registro } = conRegistro(d)
      clic(ed, 25, 0)
      ed.transformar('espejoX')
      ed.transformar({ rot: 90, espejo: false })
      expect(registro).toEqual(['Reflejar solo cambia piezas y etiquetas de red.', 'Cambiar la orientación solo afecta a piezas.'])
    })

    it('Shift+R gira a la izquierda con las reglas de R: el fantasma, la pieza y el rechazo con su motivo', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 0, -4)
      const efectos: Efecto[] = []
      const { ed, registro } = conRegistro(d)
      ed.ponerGanchos({ animar: (e) => efectos.push(e) })
      const a = new Atajos()
      registrarAtajosDelEditor(a, ed, { encuadrar: () => {} })
      clic(ed, 0, 0.5)
      a.despachar(ev('R', { shiftKey: true }))
      expect(ed.doc.piezas.a.rot).toBe(0)
      expect(registro).toEqual(['R1 no se pudo girar: se encimaría con R2.'])
      expect(efectos.at(-1)).toMatchObject({ tipo: 'sacudida', piezas: ['a'] })
      ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
      a.despachar(ev('R', { shiftKey: true }))
      expect(ed.fantasma!.rot).toBe(270)
      a.despachar(ev('r'))
      expect(ed.fantasma!.rot).toBe(0)
    })

    it('una etiqueta sí gira con R, así que no se registra nada', () => {
      const d = documentoVacio()
      d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 0, y: 0, rot: 0 }
      const { ed, registro } = conRegistro(d)
      clic(ed, 0, 0)
      ed.transformar('girar')
      expect(ed.doc.etiquetas.e.rot).toBe(90)
      expect(registro).toEqual([])
    })

    it('una orientación absoluta rechazada dice «cambiar la orientación» y nombra la pieza o a las piezas', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 0, 4)
      d.piezas.c = R('c', 'R3', 30, 0)
      const { ed, registro } = conRegistro(d)
      clic(ed, 0, 0.5)
      ed.transformar({ rot: 90, espejo: false })
      expect(registro).toEqual(['R1 no se pudo cambiar la orientación: se encimaría con R2.'])
      registro.length = 0
      ed.seleccion.piezas.add('c')
      ed.transformar({ rot: 90, espejo: false })
      expect(registro).toEqual(['Las piezas no se pudieron cambiar la orientación: se encimaría con R2.'])
    })

    it('seleccionar la red con otra herramienta activa no registra una causa inventada', () => {
      const { ed, registro } = conRegistro(dosResistencias(C('w', [4, 0], [16, 0])))
      ed.empezarColocar('resistencia', undefined, { x: 40, y: 0 })
      ed.seleccionarRed({ tipo: 'cable', id: 'w', en: { x: 10, y: 0 } })
      expect(registro).toEqual([])
    })

    it('mover con flechas sin nada que mover no inventa un motivo de cable', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      const { ed, registro } = conRegistro(d)
      clic(ed, 0, 0.5)
      ed.desplazar(0, 0)
      expect(registro).toEqual([])
    })

    it('pegar sin lugar por cables que estorban', () => {
      const d = documentoVacio()
      d.cables.orig = C('orig', [0, 0], [10, 0])
      for (let k = 1; k <= 22; k++) d.cables[`f${k}`] = C(`f${k}`, [-10, 2 * k], [200, 2 * k])
      const { ed, registro } = conRegistro(d)
      clic(ed, 5, 0)
      ed.duplicar()
      expect(registro).toEqual(['No se pegó: no hay lugar libre cerca del cursor.'])
      expect(Object.keys(ed.doc.cables)).toHaveLength(23)
    })

    it('pegar encimado cuando solo quedan piezas en el camino', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      for (let m = 1; m <= 22; m++) d.piezas[`f${m}`] = R(`f${m}`, `R${m + 1}`, 2 * m, 2 * m)
      const { ed, registro } = conRegistro(d)
      clic(ed, 0, 0.5)
      ed.duplicar()
      expect(registro).toEqual(['Se pegó encimado: no hubo lugar libre cerca del cursor.'])
    })

    it('mover con flechas hacia otra pieza', () => {
      const d = documentoVacio()
      d.piezas.a = R('a', 'R1', 0, 0)
      d.piezas.b = R('b', 'R2', 8, 0)
      const { ed, registro } = conRegistro(d)
      clic(ed, 8, 0.5)
      ed.desplazar(-2, 0)
      expect(registro).toEqual(['No se pudo mover la selección: se encimaría con R1.'])
    })
  })
})

describe('Editor (etiquetas)', () => {
  describe('etiquetas de red: girar y mover conservando su conexión', () => {
    const conEtiqueta = () => {
      const d = dosResistencias(C('c', [4, 0], [12, 0]))
      d.etiquetas.e = { id: 'e', nombre: 'VCC', x: 12, y: 0, rot: 0 }
      return nuevo(d)
    }
    const unida = (ed: Editor) => ed.con.redDePin.get('a:2') === ed.con.redes.find((r) => r.nombre === 'VCC')!.id

    it('R y Shift+R giran la etiqueta sobre su punto de conexión y la red sigue unida', () => {
      const ed = conEtiqueta()
      clic(ed, 14, 0.2)
      ed.transformar('girar')
      expect(ed.doc.etiquetas.e).toMatchObject({ x: 12, y: 0, rot: 90 })
      expect(unida(ed)).toBe(true)
      ed.transformar('girarIzq')
      ed.transformar('girarIzq')
      expect(ed.doc.etiquetas.e).toMatchObject({ x: 12, y: 0, rot: 270 })
      expect(unida(ed)).toBe(true)
      ed.deshacer()
      expect(ed.doc.etiquetas.e.rot).toBe(0)
    })

    it('arrastrarla mueve su punto y el cable lo sigue: la unión se conserva', () => {
      const ed = conEtiqueta()
      ed.abajo({ x: 14, y: 0.2 })
      ed.mover({ x: 14, y: -5.8 })
      ed.arriba({ x: 14, y: -5.8 })
      expect(ed.doc.etiquetas.e).toMatchObject({ x: 12, y: -6 })
      expect(unida(ed)).toBe(true)
    })
  })
})

describe('Editor (modelo a la vista en el doble clic)', () => {
  it('una pieza con modelo abre el editor con «Transistor NPN · 2N2222» y una sin modelo no lleva encabezado', () => {
    const pedidos: any[] = []
    const d = documentoVacio()
    d.piezas.q = { id: 'q', tipo: 'npn', ref: 'Q1', x: 0, y: 0, rot: 0, espejo: false, props: { modelo: 'BC547' } }
    d.piezas.a = R('a', 'R1', 30, 0)
    const ed = nuevo(d, { editarTexto: (p) => pedidos.push(p) })
    ed.editarValor('q')
    ed.editarValor('a')
    expect(pedidos[0].encabezado).toBe('Transistor NPN · BC547')
    expect(pedidos[1].encabezado).toBeUndefined()
  })
})
