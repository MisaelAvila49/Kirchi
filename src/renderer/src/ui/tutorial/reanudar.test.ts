// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { aplicarEleccion, primerPasoPendiente, reanudar } from './reanudar'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const copia = (id: string): Documento => structuredClone(arranqueDeCapitulo(id)!)

describe('reanudar un capítulo según el documento', () => {
  it('desde el paso 0 siempre coincide: no hay nada que revisar antes', () => {
    expect(reanudar(CAPITULO_1, ctx(documentoVacio()), 0)).toEqual({ tipo: 'coincide', paso: 0 })
  })

  it('el circuito que deja el capítulo anterior coincide con el paso donde se retoma', () => {
    // El arranque del capítulo 2 es el circuito terminado del 1: retomar en «simular» (paso 6) no tiene nada pendiente antes.
    expect(reanudar(CAPITULO_1, ctx(copia('medir')), 6)).toEqual({ tipo: 'coincide', paso: 6 })
  })

  it('con el documento vacío, retomar en el paso 3 vuelve al primer paso pendiente', () => {
    expect(reanudar(CAPITULO_1, ctx(documentoVacio()), 3)).toEqual({ tipo: 'distinto', paso: 0 })
  })

  it('el generador cumplido, pero tras deshacer vuelve la fuente: se retoma en el generador', () => {
    const d = copia('archivo')
    d.piezas.v = { id: 'v', tipo: 'fuente-dc', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    expect(reanudar(CAPITULO_3, ctx(d), 1)).toEqual({ tipo: 'distinto', paso: 0 })
    expect(primerPasoPendiente(CAPITULO_3, ctx(d), 3)).toBe(0)
  })

  it('el circuito completo de un capítulo coincide hasta el final de sus pasos de documento', () => {
    expect(reanudar(CAPITULO_3, ctx(copia('archivo')), 6)).toEqual({ tipo: 'coincide', paso: 6 })
  })

  it('los pasos transitorios (simular, detener, la franja) no cuentan como pendientes', () => {
    // En el capítulo 2, tras «medir-voltaje» vienen pasos de simulación: con el documento terminado y la simulación detenida
    // retomar en «serie» (paso 4) coincide aunque «simular» y «lectura» miren la fase.
    expect(reanudar(CAPITULO_2, ctx(copia('senales')), 4)).toEqual({ tipo: 'coincide', paso: 4 })
    expect(CAPITULO_2.pasos.filter((p) => p.transitorio).map((p) => p.id)).toEqual(['simular', 'lectura', 'detener', 'lectura-corriente', 'ohmios', 'lectura-ohmios'])
  })

  it('un capítulo con el multímetro de voltaje borrado se retoma en medir-voltaje', () => {
    const d = copia('senales')
    delete d.piezas.m1
    delete d.sondas!.s1
    expect(reanudar(CAPITULO_2, ctx(d), 4)).toEqual({ tipo: 'distinto', paso: 0 })
  })

  it('un paso fuera de rango se acota a los pasos del capítulo', () => {
    expect(reanudar(CAPITULO_1, ctx(copia('medir')), 99)).toMatchObject({ tipo: 'coincide' })
    expect(reanudar(CAPITULO_1, ctx(copia('medir')), -3)).toEqual({ tipo: 'coincide', paso: 0 })
  })
})

describe('la elección del diálogo de retomar', () => {
  it('«Empezar con el circuito del capítulo» carga el arranque y va al paso 0', () => {
    expect(aplicarEleccion('circuito-del-capitulo', 4)).toEqual({ cargarArranque: true, paso: 0 })
  })
  it('«Seguir con mi circuito» no toca el documento y sigue en el primer paso no cumplido', () => {
    expect(aplicarEleccion('mi-circuito', 4)).toEqual({ cargarArranque: false, paso: 4 })
    expect(aplicarEleccion('mi-circuito', -1)).toEqual({ cargarArranque: false, paso: 0 })
  })
})
