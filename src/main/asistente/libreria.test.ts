import { describe, expect, it } from 'vitest'
import { libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { AnalizadorSvg } from './analizadorSvg'
import { libreriaSinVentana } from './libreria'

describe('lectura de piezas sin DOM', () => {
  it('da las mismas piezas y la misma geometría que el DOM de pruebas', () => {
    const propia = libreriaSinVentana()
    const dePrueba = libreriaSinDom()
    expect([...propia.keys()].sort()).toEqual([...dePrueba.keys()].sort())
    for (const [id, d] of dePrueba) expect(propia.get(id)!.geometria, id).toEqual(d.geometria)
  })

  it('no deja un DOMParser global', () => {
    libreriaSinVentana()
    expect((globalThis as { DOMParser?: unknown }).DOMParser).toBeUndefined()
  })

  it('un SVG mal formado da parsererror', () => {
    const a = new AnalizadorSvg()
    expect(a.parseFromString('<svg><g></svg>', 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(1)
    expect(a.parseFromString('texto', 'image/svg+xml').documentElement).toBeNull()
  })
})
