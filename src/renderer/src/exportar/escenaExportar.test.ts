// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { exportarPorOmision, type OpcionesExportar } from '../../../compartido/ajustes'
import { calcularConexiones } from '../conexiones/conexiones'
import { MM_POR_UNIDAD } from '../doc/tipos'
import { PALETA_CLARA } from '../lienzo/paleta'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaDeExportar, documentoAExportar, escenaDeExportar, type FuenteEscena } from './escenaExportar'
import { svgDeEscena } from './svg'

const lib = libreriaDePrueba().piezas
const op = (extra: Partial<OpcionesExportar> = {}): OpcionesExportar => ({ ...exportarPorOmision(), ...extra })

function fuente(extra: Partial<FuenteEscena> = {}): FuenteEscena {
  const doc = divisor()
  doc.piezas.osc = { id: 'osc', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
  return { doc, con: calcularConexiones(doc, lib), lib, seleccion: null, area: null, vivo: null, ...extra }
}

describe('escenaDeExportar', () => {
  it('instrumentos apagado equivale a quitar los instrumentos', () => {
    const f = fuente()
    expect(Object.keys(documentoAExportar(f, 'todo', op({ instrumentos: false }))!.piezas)).not.toContain('osc')
    expect(Object.keys(documentoAExportar(f, 'todo', op())!.piezas)).toContain('osc')
  })

  it('el margen cambia la lámina: 0 mm es más chica que 5 mm, que es más chica que 30 mm', () => {
    const f = fuente()
    const ancho = (m: number) => svgDeEscena(escenaDeExportar(f, 'todo', op({ margenMm: m }), PALETA_CLARA), { paleta: PALETA_CLARA, fondo: null, rejilla: false, fuentes: { interfaz: 'a', cifras: 'b', serif: 'c' }, margen: m / MM_POR_UNIDAD })!.anchoMm
    expect(ancho(0)).toBeLessThan(ancho(5))
    expect(ancho(5)).toBeLessThan(ancho(30))
    expect(ancho(30) - ancho(0)).toBeCloseTo(60, 0)
  })

  it('un área ciñe la lámina a ella más el margen y deja fuera lo que no cruza', () => {
    const area = { x: 5 * 1.25, y: -10 * 1.25, ancho: 12 * 1.25, alto: 20 * 1.25 }
    const f = fuente({ area })
    const sub = documentoAExportar(f, 'area', op())!
    expect(Object.keys(sub.piezas)).toContain('p_r1')
    expect(Object.keys(sub.piezas)).not.toContain('osc')
    const caja = cajaDeExportar('area', area)!
    const l = svgDeEscena(escenaDeExportar(f, 'area', op(), PALETA_CLARA), { paleta: PALETA_CLARA, fondo: null, rejilla: false, fuentes: { interfaz: 'a', cifras: 'b', serif: 'c' }, caja, margen: 4 })!
    expect(l.anchoMm).toBeCloseTo(12 * 1.25 + 10, 0)
    expect(cajaDeExportar('todo', area)).toBeNull()
    expect(cajaDeExportar('area', null)).toBeNull()
  })

  it('un área sin nada da una escena vacía (no exporta el dibujo completo)', () => {
    const f = fuente({ area: { x: 900, y: 900, ancho: 10, alto: 10 } })
    expect(escenaDeExportar(f, 'area', op(), PALETA_CLARA).caja).toBeNull()
  })

  it('los números de patilla salen en el archivo solo si están visibles', () => {
    const f = fuente()
    f.doc.piezas.u1 = { id: 'u1', tipo: 'nand', ref: 'U1', x: 0, y: 40, rot: 0, espejo: false, props: {} }
    f.con = calcularConexiones(f.doc, lib)
    const textos = (v: boolean) => escenaDeExportar({ ...f, numerosPatilla: v }, 'todo', op(), PALETA_CLARA).textos.map((t) => t.texto)
    expect(textos(false)).not.toContain('3')
    expect(textos(true)).toEqual(expect.arrayContaining(['1', '2', '3']))
  })
})
