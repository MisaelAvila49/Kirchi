// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Nota } from '../doc/tipos'
import { cajaNota } from '../lienzo/medidas'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'

const lib = libreriaDePrueba().piezas
const LARGO = 'una nota con varias palabras para repartir'

function armar(n: Partial<Nota> & { ancho: number }, texto = LARGO) {
  const d = documentoVacio()
  d.notas.v = { id: 'v', x: 0, y: 0, texto, ...n }
  const ed = new Editor(lib, d, idSecuencial())
  ed.tolerancia = 0.5
  ed.seleccionar(seleccionDe('notas', 'v'))
  return ed
}
const enteros = (n: Nota) => [n.x, n.y, n.ancho].every(Number.isInteger)

describe('asas: valores enteros y umbral', () => {
  it('el asa izquierda de una nota sin ancho fijado guarda enteros y el archivo se relee', () => {
    const ed = armar({ ancho: 10 }, 'MEDIR CON EL MULTIMETRO')
    const c = cajaNota(ed.doc.notas.v)
    ed.abajo({ x: c.minX, y: c.minY })
    ed.mover({ x: c.minX + 2, y: 0 })
    ed.mover({ x: c.minX + 3, y: 0 })
    ed.arriba({ x: 3, y: 0 })
    const n = ed.doc.notas.v
    expect(enteros(n)).toBe(true)
    expect(n.anchoFijo).toBe(true)
    const l = leerKir(escribirKir(ed.doc, 't'))
    if (!l.ok) throw new Error(l.error)
    expect(l.avisos).toEqual([])
    expect(l.doc.notas.v).toEqual(n)
  })

  it('el asa derecha también guarda enteros con una caja de ancho fraccionario', () => {
    const ed = armar({ ancho: 10 }, 'MEDIR CON EL MULTIMETRO')
    const c = cajaNota(ed.doc.notas.v)
    ed.abajo({ x: c.maxX, y: c.minY })
    ed.mover({ x: c.maxX - 4.4, y: 0 })
    ed.arriba({ x: 0, y: 0 })
    expect(enteros(ed.doc.notas.v)).toBe(true)
  })

  it('un clic con temblor en un asa no cambia nada: ni paso de deshacer ni ancho fijo', () => {
    const ed = armar({ ancho: 40 }, 'hola mundo')
    const antes = ed.doc.notas.v
    const c = cajaNota(antes)
    ed.abajo({ x: c.maxX, y: c.minY })
    ed.mover({ x: c.maxX + 0.05, y: c.minY })
    ed.arriba({ x: c.maxX, y: c.minY })
    expect(ed.doc.notas.v).toBe(antes)
    expect(ed.estado().puedeDeshacer).toBe(false)
  })
})

describe('asas: otros gestos a medias', () => {
  const medio = () => {
    const ed = armar({ ancho: 40, anchoFijo: true })
    const antes = ed.doc.notas.v
    const c = cajaNota(antes)
    ed.abajo({ x: c.maxX, y: c.minY })
    ed.mover({ x: c.maxX - 10, y: 0 })
    expect(ed.doc.notas.v.ancho).toBe(30)
    return { ed, antes }
  }

  it('el clic derecho revierte el gesto y no abre el menú', () => {
    const { ed, antes } = medio()
    expect(ed.clicDerecho()).toBe(true)
    expect(ed.doc.notas.v).toEqual(antes)
    expect(ed.estado().asa).toBeNull()
    expect(ed.estado().puedeDeshacer).toBe(false)
  })

  it('el doble clic derecho revierte el gesto y no borra nada', () => {
    const { ed, antes } = medio()
    ed.dobleClicDerecho({ x: 5, y: 1 })
    expect(ed.doc.notas.v).toEqual(antes)
    expect(ed.estado().puedeDeshacer).toBe(false)
  })

  it('las flechas, borrar, formato, duplicar y pegar no actúan a medio gesto', () => {
    const { ed } = medio()
    const doc = ed.doc
    expect(ed.desplazar(2, 0)).toBe(true)
    ed.borrar()
    expect(ed.cambiarFormato({ negrita: true })).toBe(false)
    ed.duplicar()
    ed.pegar()
    ed.transformar('girar')
    expect(ed.doc).toBe(doc)
  })

  it('deshacer a medio gesto cierra el gesto y lo deshace entero; el resto del gesto no vuelve a cambiar la nota', () => {
    const { ed, antes } = medio()
    ed.deshacer()
    expect(ed.doc.notas.v).toEqual(antes)
    ed.mover({ x: 20, y: 0 })
    ed.arriba({ x: 20, y: 0 })
    expect(ed.doc.notas.v).toEqual(antes)
  })

  it('un nuevo apretón con un gesto de asa abierto lo cierra antes de empezar otro', () => {
    const { ed } = medio()
    const c = cajaNota(ed.doc.notas.v)
    ed.abajo({ x: c.maxX, y: c.minY })
    ed.mover({ x: c.maxX - 5, y: 0 })
    ed.arriba({ x: 0, y: 0 })
    ed.deshacer()
    // El primer gesto quedó cerrado como un paso, y el segundo como otro.
    expect(ed.doc.notas.v.ancho).toBe(30)
  })
})
