// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { CAPITULO_4 } from './capitulo4'
import { aplicarEleccion, primerPasoPendiente, reanudar } from './reanudar'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const copia = (id: string): Documento => structuredClone(arranqueDeCapitulo(id)!)

describe('reanudar un capítulo según el documento', () => {
  it('desde el paso 0 siempre coincide: no hay nada que revisar antes', () => {
    expect(reanudar(CAPITULO_2, ctx(documentoVacio()), 0)).toEqual({ tipo: 'coincide', paso: 0 })
  })

  it('un capítulo de solo «Mira» y teclas sueltas se retoma donde quedó, con cualquier documento', () => {
    expect(CAPITULO_1.pasos.every((p) => p.transitorio)).toBe(true)
    expect(reanudar(CAPITULO_1, ctx(copia('conoce')), 8)).toEqual({ tipo: 'coincide', paso: 8 })
    expect(reanudar(CAPITULO_1, ctx(documentoVacio()), 8)).toEqual({ tipo: 'coincide', paso: 8 })
  })

  it('el circuito terminado coincide con el paso donde se retoma, y un lienzo vacío vuelve al primer paso pendiente', () => {
    // El circuito de arranque de Medir es el terminado de Tu primer circuito: retomar en «simular» (paso 6) no tiene nada pendiente antes.
    expect(reanudar(CAPITULO_2, ctx(copia('medir-senales')), 6)).toEqual({ tipo: 'coincide', paso: 6 })
    expect(reanudar(CAPITULO_2, ctx(documentoVacio()), 3)).toEqual({ tipo: 'distinto', paso: 0 })
  })

  it('los pasos «Mira» no cuentan como pendientes: no se leen del documento', () => {
    expect(CAPITULO_3.pasos.find((p) => p.id === 'lectura')!.transitorio).toBe(true)
    const mira = [...CAPITULO_3.pasos, ...CAPITULO_4.pasos].filter((p) => p.tipo === 'mira')
    expect(mira.length).toBeGreaterThan(10)
    for (const p of mira) expect(p.transitorio, p.id).toBe(true)
  })

  it('el generador cumplido, pero tras deshacer vuelve la fuente: se retoma en el generador', () => {
    const d = copia('medir-senales')
    // Medir arranca con la fuente puesta y sin multímetro: el primer paso pendiente es el multímetro (el medidor rápido no se conserva).
    expect(primerPasoPendiente(CAPITULO_3, ctx(d), 8)).toBe(1)
    const i = CAPITULO_3.pasos.findIndex((p) => p.id === 'generador')
    expect(reanudar(CAPITULO_3, ctx(d), i + 1)).toMatchObject({ tipo: 'distinto' })
  })

  it('un paso fuera de rango se acota a los pasos del capítulo', () => {
    expect(reanudar(CAPITULO_1, ctx(copia('conoce')), 99)).toMatchObject({ tipo: 'coincide' })
    expect(reanudar(CAPITULO_1, ctx(copia('conoce')), -3)).toEqual({ tipo: 'coincide', paso: 0 })
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
