// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio } from '../doc/tipos'
import { altoNota, anchoNotaMinimo, asasDeNota, cajaNota, cursorDeAsa, disposicionNota, RADIO_ASA } from '../lienzo/medidas'
import { construirSuperposicion } from '../lienzo/superposicion'
import { PALETA_CLARA } from '../lienzo/paleta'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'

const lib = libreriaDePrueba().piezas
const TEXTO = 'Una nota con varias palabras para repartir'

function armar(ancho = 40) {
  const d = documentoVacio()
  d.notas.n = { id: 'n', x: 10, y: 0, ancho, texto: TEXTO }
  d.notas.m = { id: 'm', x: 10, y: 40, ancho: 20, texto: 'otra' }
  const ed = new Editor(lib, d, idSecuencial())
  ed.tolerancia = 0.5
  ed.seleccionar(seleccionDe('notas', 'n'))
  return ed
}
const arrastrar = (ed: Editor, de: { x: number; y: number }, a: { x: number; y: number }) => {
  ed.abajo(de)
  ed.mover({ x: (de.x + a.x) / 2, y: (de.y + a.y) / 2 })
  ed.mover(a)
  ed.arriba(a)
}

describe('asas de ancho de una nota', () => {
  it('el asa derecha cambia solo el ancho, en pasos de 1.25 mm, y el texto se reparte en más renglones', () => {
    const ed = armar()
    const antes = ed.doc.notas.n
    const renglones = disposicionNota(antes).renglones.length
    const c = cajaNota(antes)
    arrastrar(ed, { x: c.maxX, y: (c.minY + c.maxY) / 2 }, { x: 34.4, y: 3 })
    expect(ed.doc.notas.n).toMatchObject({ x: 10, ancho: 24, texto: TEXTO, anchoFijo: true })
    expect(ed.doc.notas.n.formato).toBeUndefined()
    expect(disposicionNota(ed.doc.notas.n).renglones.length).toBeGreaterThan(renglones)
    expect(altoNota(ed.doc.notas.n)).toBeGreaterThan(altoNota(antes))
    ed.deshacer()
    expect(ed.doc.notas.n).toEqual(antes)
  })

  it('el asa izquierda mueve el borde izquierdo y deja fijo el derecho', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: c.minX, y: (c.minY + c.maxY) / 2 }, { x: 21.6, y: 9 })
    expect(ed.doc.notas.n).toMatchObject({ x: 22, ancho: 28, y: 0 })
    expect(ed.doc.notas.n.alto).toBeUndefined()
  })

  it('las esquinas cambian el ancho y el alto: la de arriba mueve el borde de arriba y deja fijo el de abajo', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    const fondo = Math.ceil(c.maxY - 1e-9)
    arrastrar(ed, { x: c.minX, y: c.minY }, { x: 21.6, y: -5 })
    expect(ed.doc.notas.n).toMatchObject({ x: 22, ancho: 28, y: -5, anchoFijo: true })
    expect(Number.isInteger(ed.doc.notas.n.alto)).toBe(true)
    expect(ed.doc.notas.n.y + ed.doc.notas.n.alto!).toBe(fondo)
    expect(cajaNota(ed.doc.notas.n).maxY).toBe(fondo)
    // La de abajo a la derecha mueve el borde de abajo, siempre en pasos enteros.
    const c2 = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: c2.maxX, y: c2.maxY }, { x: 60, y: c2.maxY + 7.4 })
    expect(ed.doc.notas.n).toMatchObject({ x: 22, ancho: 38, y: -5 })
    expect(cajaNota(ed.doc.notas.n).maxY).toBe(fondo + 7)
    expect(Number.isInteger(ed.doc.notas.n.alto)).toBe(true)
  })

  it('el asa de abajo cambia solo el alto: el texto queda arriba y el alto no baja del que pide el texto', () => {
    const ed = armar()
    const antes = ed.doc.notas.n
    const c = cajaNota(antes)
    const mx = (c.minX + c.maxX) / 2
    expect(ed.asaEn({ x: mx, y: c.maxY })).toEqual({ nota: 'n', lado: null, vert: 'abajo' })
    arrastrar(ed, { x: mx, y: c.maxY }, { x: mx + 9, y: c.maxY + 10 })
    const n = ed.doc.notas.n
    expect(n).toMatchObject({ x: 10, y: 0, ancho: 40 })
    expect(n.anchoFijo).toBeUndefined()
    expect(Number.isInteger(n.alto)).toBe(true)
    expect(altoNota(n)).toBe(n.alto)
    expect(altoNota(n)).toBeGreaterThan(altoNota(antes))
    // El texto no se mueve: sus renglones son los mismos.
    expect(disposicionNota(n).renglones.length).toBe(disposicionNota(antes).renglones.length)
    ed.deshacer()
    expect(ed.doc.notas.n).toEqual(antes)
    // Hacia arriba no baja de lo que pide el texto: la nota vuelve a medir lo de su texto y pierde el campo.
    arrastrar(ed, { x: mx, y: c.maxY }, { x: mx, y: c.maxY + 6 })
    const c3 = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: mx, y: c3.maxY }, { x: mx, y: -50 })
    expect(ed.doc.notas.n.alto).toBeUndefined()
    expect(altoNota(ed.doc.notas.n)).toBe(altoNota(antes))
    expect('alto' in ed.doc.notas.n).toBe(false)
  })

  it('el cursor de cada asa sigue los bordes que mueve', () => {
    expect(cursorDeAsa({ lado: 'der', vert: null })).toBe('ew-resize')
    expect(cursorDeAsa({ lado: null, vert: 'abajo' })).toBe('ns-resize')
    expect(cursorDeAsa({ lado: 'izq', vert: 'arriba' })).toBe('nwse-resize')
    expect(cursorDeAsa({ lado: 'der', vert: 'abajo' })).toBe('nwse-resize')
    expect(cursorDeAsa({ lado: 'der', vert: 'arriba' })).toBe('nesw-resize')
    expect(cursorDeAsa({ lado: 'izq', vert: 'abajo' })).toBe('nesw-resize')
  })

  it('el alto no pasa de 400 mm', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    const mx = (c.minX + c.maxX) / 2
    arrastrar(ed, { x: mx, y: c.maxY }, { x: mx, y: 5000 })
    expect(ed.doc.notas.n.alto).toBe(320)
  })

  it('el gesto del alto es un solo paso de deshacer, Esc lo revierte, cancelarGesto lo cancela y un clic con temblor no cambia nada', () => {
    const ed = armar()
    const antes = ed.doc.notas.n
    const c = cajaNota(antes)
    const mx = (c.minX + c.maxX) / 2
    ed.abajo({ x: mx, y: c.maxY })
    ed.mover({ x: mx, y: c.maxY + 3 })
    ed.mover({ x: mx, y: c.maxY + 6 })
    ed.mover({ x: mx, y: c.maxY + 9 })
    ed.arriba({ x: mx, y: c.maxY + 9 })
    expect(ed.doc.notas.n.alto).toBeDefined()
    ed.deshacer()
    expect(ed.doc.notas.n).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
    ed.abajo({ x: mx, y: c.maxY })
    ed.mover({ x: mx, y: c.maxY + 8 })
    ed.escape()
    expect(ed.doc.notas.n).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
    ed.abajo({ x: mx, y: c.maxY })
    ed.mover({ x: mx, y: c.maxY + 8 })
    ed.cancelarGesto()
    expect(ed.doc.notas.n).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
    ed.abajo({ x: mx, y: c.maxY })
    ed.mover({ x: mx + 0.1, y: c.maxY + 0.2 })
    ed.arriba({ x: mx, y: c.maxY })
    expect(ed.doc.notas.n).toBe(antes)
    expect(ed.estado().puedeDeshacer).toBe(false)
  })

  it('una esquina de arriba arrastrada solo de lado no toca el alto ni la posición vertical', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: c.maxX, y: c.minY }, { x: c.maxX - 4, y: c.minY })
    expect(ed.doc.notas.n.y).toBe(0)
    expect(ed.doc.notas.n.alto).toBeUndefined()
  })

  it('con el alto fijado, la caja mide el mayor entre ese alto y el del texto', () => {
    const d = documentoVacio()
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 40, texto: 'hola', anchoFijo: true, alto: 20 }
    expect(altoNota(d.notas.n)).toBe(20)
    expect(cajaNota(d.notas.n).maxY).toBe(20)
    expect(altoNota({ ...d.notas.n, texto: 'palabra '.repeat(200), alto: 4 })).toBeGreaterThan(20)
  })

  it('una nota sin ancho fijado se agarra por la caja que se ve, no por el ancho guardado', () => {
    const d = documentoVacio()
    // El ancho guardado (10) es menor que el del texto: la caja dibujada es más ancha.
    d.notas.v = { id: 'v', x: 0, y: 0, ancho: 10, texto: 'MEDIR CON EL MULTIMETRO' }
    const ed = new Editor(lib, d, idSecuencial())
    ed.tolerancia = 0.5
    ed.seleccionar(seleccionDe('notas', 'v'))
    const c = cajaNota(d.notas.v)
    expect(c.maxX).toBeGreaterThan(10)
    arrastrar(ed, { x: c.maxX, y: c.minY }, { x: c.maxX - 5, y: 0 })
    expect(ed.doc.notas.v.anchoFijo).toBe(true)
    expect(ed.doc.notas.v.ancho).toBe(Math.round(c.maxX) - 5)
    expect(disposicionNota(ed.doc.notas.v).renglones.length).toBeGreaterThan(1)
  })

  it('no baja de la palabra más larga (ni de 5 mm) ni pasa de 400 mm', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: c.maxX, y: c.minY }, { x: -100, y: 0 })
    expect(ed.doc.notas.n.ancho).toBe(anchoNotaMinimo(ed.doc.notas.n))
    expect(ed.doc.notas.n.ancho).toBeGreaterThanOrEqual(4)
    const c2 = cajaNota(ed.doc.notas.n)
    arrastrar(ed, { x: c2.maxX, y: c2.minY }, { x: 1000, y: 0 })
    expect(ed.doc.notas.n.ancho).toBe(320)
  })

  it('cada gesto es un paso de deshacer y Esc a medio gesto lo revierte sin dejar paso', () => {
    const ed = armar()
    const antes = ed.doc.notas.n
    const c = cajaNota(antes)
    ed.abajo({ x: c.maxX, y: c.minY })
    ed.mover({ x: 30, y: 0 })
    ed.mover({ x: 26, y: 0 })
    expect(ed.estado()).toMatchObject({ asa: { nota: 'n', lado: 'der', vert: 'arriba' }, arrastrando: true })
    ed.escape()
    expect(ed.doc.notas.n).toEqual(antes)
    expect(ed.historial.puedeDeshacer).toBe(false)
    arrastrar(ed, { x: c.maxX, y: c.minY }, { x: 30, y: 0 })
    ed.deshacer()
    expect(ed.doc.notas.n).toEqual(antes)
  })

  it('solo hay asas con una sola nota seleccionada; el cursor sobre una la marca', () => {
    const ed = armar()
    const c = cajaNota(ed.doc.notas.n)
    ed.mover({ x: c.maxX, y: c.maxY })
    expect(ed.estado().asa).toEqual({ nota: 'n', lado: 'der', vert: 'abajo' })
    expect(asasDeNota(ed.doc.notas.n)).toHaveLength(7)
    const s = seleccionDe('notas', 'n')
    s.notas.add('m')
    ed.seleccionar(s)
    expect(ed.asaEn({ x: c.maxX, y: c.maxY })).toBeNull()
    // Sin asa, apretar el borde de la caja empieza el arrastre normal de la nota.
    ed.seleccionar(seleccionDe('notas', 'm'))
    expect(ed.asaEn({ x: c.maxX, y: c.maxY })).toBeNull()
  })

  it('el cuadrito del asa mide lo mismo en pantalla a cualquier zoom: nunca menos de 4 px de radio', () => {
    const ed = armar()
    const radio = (zoom?: number) => {
      const sup = construirSuperposicion(ed.doc, lib, { ...ed.estado(), zoom }, PALETA_CLARA)
      const xs = Array.from({ length: 3 }, (_, k) => sup.triangulos[k * 6])
      return (Math.max(...xs) - Math.min(...xs)) / 2
    }
    expect(radio(undefined)).toBeCloseTo(RADIO_ASA, 5)
    // Con poco zoom (2 px por unidad) 4 px son 2 unidades; con mucho zoom manda el mínimo en unidades.
    expect(radio(2)).toBeCloseTo(2, 5)
    expect(radio(100)).toBeCloseTo(RADIO_ASA, 5)
    expect(construirSuperposicion(ed.doc, lib, { ...ed.estado(), zoom: 2 }, PALETA_CLARA).conAsas).toBe(true)
  })

  it('la superposición dibuja siete cuadritos (dos triángulos cada uno) para la nota seleccionada', () => {
    const ed = armar()
    const sup = construirSuperposicion(ed.doc, lib, ed.estado(), PALETA_CLARA)
    expect(sup.nTriangulos).toBe(14)
    ed.seleccionar(seleccionDe('notas', 'm'))
    const s = ed.estado().seleccion
    s.notas.add('n')
    expect(construirSuperposicion(ed.doc, lib, { ...ed.estado(), seleccion: s }, PALETA_CLARA).nTriangulos).toBe(0)
  })
})
