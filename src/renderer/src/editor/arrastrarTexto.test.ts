// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { cajaTexto, etiquetasSinChoques } from '../lienzo/apartar'
import { centroDeTexto } from '../lienzo/textosManuales'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'
import { seleccionDe } from './seleccion'

/** Referencia, valor y voltaje de un terminal se arrastran como piezas: sin Alt caen en uno de ocho lugares, con Alt
 * libres. Lo movido manda sobre el reparto automático. */

const lib = libreriaDePrueba().piezas
const P = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })

function circuito(): Documento {
  const d = documentoVacio()
  d.piezas.r1 = P('r1', 'resistencia', 'R1', 0, 0, { valor: '1k' })
  d.piezas.t1 = P('t1', 'alimentacion', 'PWR1', 40, 0, { nombre: 'VEE' })
  return d
}
function abrir(doc = circuito()) {
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const registro: string[] = []
  const ed = new Editor(lib, doc, idSecuencial(), { editarTexto: (p) => pedidos.push(p), registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  return { ed, pedidos, registro }
}
/** Centro del texto `i` de la pieza `id`, como lo dibuja la escena. */
const centro = (ed: Editor, id: string, i: number) => centroDeTexto(etiquetasSinChoques(ed.doc, lib).get(id)![i])

describe('arrastrar un texto de pieza', () => {
  it('a uno de los ocho lugares, en un solo paso de deshacer, y la pieza queda seleccionada', () => {
    const { ed } = abrir()
    const c = centro(ed, 'r1', 0)
    ed.abajo(c)
    expect([...ed.seleccion.piezas]).toEqual(['r1'])
    ed.mover({ x: c.x, y: c.y + 4 })
    ed.mover({ x: c.x + 0.2, y: c.y + 9 })
    ed.arriba({ x: c.x + 0.2, y: c.y + 9 })
    expect(ed.doc.piezas.r1.textos).toEqual({ ref: { lugar: 'abajo' } })
    expect(ed.doc.piezas.r1).toMatchObject({ x: 0, y: 0 })
    ed.deshacer()
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('con Alt queda libre: el centro del texto en el símbolo, siguiendo al puntero desde donde se agarró', () => {
    const { ed } = abrir()
    const c = centro(ed, 'r1', 1)
    ed.abajo({ x: c.x + 0.3, y: c.y })
    ed.mover({ x: c.x + 0.3 + 5, y: c.y + 2 }, { alt: true })
    ed.arriba({ x: c.x + 0.3 + 5, y: c.y + 2 })
    expect(ed.doc.piezas.r1.textos).toEqual({ valor: { x: c.x + 5, y: c.y + 2 } })
    expect(centro(ed, 'r1', 1)).toEqual({ x: c.x + 5, y: c.y + 2 })
  })

  it('un temblor menor que la tolerancia no lo vuelve manual ni deja paso; volver al mismo lugar tampoco', () => {
    const { ed } = abrir()
    const c = centro(ed, 'r1', 0)
    ed.abajo(c)
    ed.mover({ x: c.x + 0.2, y: c.y })
    ed.arriba({ x: c.x + 0.2, y: c.y })
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
    expect(ed.historial.puedeDeshacer).toBe(false)
    // Con un lugar ya elegido, arrastrar y volver a él no deja paso.
    ed.cargar({ ...circuito(), piezas: { ...circuito().piezas, r1: { ...circuito().piezas.r1, textos: { ref: { lugar: 'arriba' } } } } })
    const a = centro(ed, 'r1', 0)
    ed.abajo(a)
    ed.mover({ x: a.x, y: a.y + 12 })
    ed.mover({ x: a.x, y: a.y })
    ed.arriba({ x: a.x, y: a.y })
    expect(ed.doc.piezas.r1.textos).toEqual({ ref: { lugar: 'arriba' } })
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('el voltaje de un terminal también se arrastra', () => {
    const { ed } = abrir()
    const c = centro(ed, 't1', 0)
    ed.abajo(c)
    // Empieza a la derecha del nombre: bajo el terminal (x = 40) cae abajo, y abajo a la derecha si se baja derecho.
    ed.mover({ x: 40, y: c.y + 14 })
    ed.arriba({ x: 40, y: c.y + 14 })
    expect(ed.doc.piezas.t1.textos).toEqual({ valor: { lugar: 'abajo' } })
  })

  it('el cuerpo sigue arrastrando la pieza, un pin sigue empezando un cable y Esc revierte el arrastre del texto', () => {
    const { ed } = abrir()
    ed.abajo({ x: 0, y: 0.3 })
    ed.mover({ x: 0, y: 6.3 })
    ed.arriba({ x: 0, y: 6.3 })
    expect(ed.doc.piezas.r1).toMatchObject({ y: 6 })
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
    ed.abajo({ x: 4, y: 6 })
    expect(ed.herramienta).toBe('cablear')
    ed.escape()
    const c = centro(ed, 'r1', 0)
    ed.abajo(c)
    ed.mover({ x: c.x, y: c.y + 12 })
    ed.cancelarGesto()
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
  })

  it('el dibujo de otra pieza gana a un texto que le queda encima', () => {
    // El valor de R1, movido a mano sobre la pata izquierda de R2 (fuera de su cuerpo): el clic en la pata es de R2.
    const d = documentoVacio()
    d.piezas.r1 = { ...P('r1', 'resistencia', 'R1', 0, 0, { valor: '1k' }), textos: { valor: { x: 1.5, y: 3 } } }
    d.piezas.r2 = P('r2', 'resistencia', 'R2', 5, 3)
    const { ed } = abrir(d)
    ed.tolerancia = 0.3
    const pata = { x: 1.6, y: 3 }
    expect(ed.textoEn(pata)?.pieza).toBe('r1')
    expect(ed.indice.golpe(pata, ed.tolerancia)).toEqual({ tipo: 'pieza', id: 'r2' })
    ed.abajo(pata)
    expect([...ed.seleccion.piezas]).toEqual(['r2'])
    expect(ed.estado().texto).toBeNull()
    ed.arriba(pata)
  })

  it('mientras corre la vista previa no se mueve (el clic sigue su camino de siempre)', () => {
    const { ed } = abrir()
    ed.ponerSimulando(true)
    const c = centro(ed, 'r1', 0)
    ed.abajo(c)
    ed.mover({ x: c.x, y: c.y + 12 })
    ed.arriba({ x: c.x, y: c.y + 12 })
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
  })
})

describe('lo movido a mano sigue a la pieza', () => {
  const movido = () => {
    const d = circuito()
    d.piezas.r1 = { ...d.piezas.r1, textos: { ref: { lugar: 'abajo-derecha' }, valor: { x: 2, y: -5 } } }
    return d
  }
  it('al girar, reflejar, copiar, pegar y duplicar', () => {
    const { ed } = abrir(movido())
    ed.seleccionar(seleccionDe('piezas', 'r1'))
    ed.transformar('girar')
    ed.transformar('espejoX')
    expect(ed.doc.piezas.r1.textos).toEqual({ ref: { lugar: 'abajo-derecha' }, valor: { x: 2, y: -5 } })
    ed.duplicar({ x: 100, y: 60 })
    const copia = Object.values(ed.doc.piezas).find((p) => p.ref === 'R2')!
    expect(copia.textos).toEqual({ ref: { lugar: 'abajo-derecha' }, valor: { x: 2, y: -5 } })
  })

  it('«Restablecer posición de los textos» los devuelve al reparto automático en un paso', () => {
    const { ed } = abrir(movido())
    ed.seleccionar(seleccionDe('piezas', 'r1'))
    expect(ed.puedeRestablecerTextos()).toBe(true)
    ed.restablecerTextos()
    expect(ed.doc.piezas.r1).not.toHaveProperty('textos')
    expect(ed.puedeRestablecerTextos()).toBe(false)
    ed.deshacer()
    expect(ed.doc.piezas.r1.textos).toBeDefined()
  })
})

describe('un texto de pieza bajo el puntero', () => {
  it('el doble clic sobre él abre el editor de la pieza con el foco en ese campo', () => {
    const { ed, pedidos } = abrir()
    ed.dobleClic(centro(ed, 'r1', 0))
    expect((pedidos[0] as PedidoCampos).foco).toBe(0)
    ed.dobleClic(centro(ed, 'r1', 1))
    expect((pedidos[1] as PedidoCampos).foco).toBe(1)
  })

  it('el clic derecho sobre él abre el menú de su pieza', () => {
    const { ed } = abrir()
    expect(ed.objetivoMenu(centro(ed, 'r1', 1))).toMatchObject({ tipo: 'pieza', id: 'r1' })
  })

  it('el estado dice qué texto está bajo el puntero (para el cursor y el resalte)', () => {
    const { ed } = abrir()
    ed.mover(centro(ed, 'r1', 1))
    expect(ed.estado().texto).toEqual({ pieza: 'r1', cual: 'valor' })
    // La caja que resalta la superposición: la del texto tal como lo dibuja la escena; al arrastrarlo, la de su lugar nuevo.
    const t = etiquetasSinChoques(ed.doc, lib).get('r1')![1]
    expect(ed.textoResaltado()).toEqual({ caja: cajaTexto(t), arrastrando: false })
    const c = centro(ed, 'r1', 1)
    ed.abajo(c)
    ed.mover({ x: c.x, y: c.y - 12 })
    const r = ed.textoResaltado()!
    expect(r.arrastrando).toBe(true)
    expect(r.caja).toEqual(cajaTexto(etiquetasSinChoques(ed.doc, lib).get('r1')![1]))
    ed.arriba({ x: c.x, y: c.y - 12 })
    ed.mover({ x: 20, y: 30 })
    expect(ed.estado().texto).toBeNull()
  })
})
