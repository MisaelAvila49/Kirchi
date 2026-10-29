// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza, PinPropio } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { libreriaDePrueba } from '../prueba/libreria'
import { anchoEnEm } from '../lienzo/metricas'
import { defDe, disenarCaja, pinesDe } from './sinEquivalencia'
import { pinesEnMundo } from './transformar'

const lib = libreriaDePrueba().piezas
const base = lib.get('sin-equivalencia')!

const seis: PinPropio[] = [
  { id: 'a', nombre: 'VCC', numero: '8', lado: 'der' },
  { id: 'b', nombre: 'IN', numero: '1', lado: 'izq' },
  { id: 'c', nombre: 'OUT', numero: '2', lado: 'izq' },
  { id: 'd', nombre: 'GND', numero: '4', lado: 'izq' },
  { id: 'e', nombre: 'CTRL', numero: '5', lado: 'der' },
  { id: 'f', nombre: 'NC', lado: 'der' }
]
const caja = (extra: Partial<Pieza> = {}): Pieza => ({ id: 'u', tipo: 'sin-equivalencia', ref: 'U1', x: 20, y: 10, rot: 0, espejo: false, props: { nombre: 'XYZ123' }, pines: seis, ...extra })

describe('pieza sin equivalencia', () => {
  it('la librería la carga, oculta y sin errores', () => {
    expect(libreriaDePrueba().errores).toEqual([])
    expect(base).toBeDefined()
    expect(base.oculta).toBe(true)
    expect(base.modelo).toBeUndefined()
  })

  it('los pines de la instancia salen de su lista, en columnas pares y a cada lado', () => {
    const pines = pinesDe(caja(), base)
    expect(pines.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    for (const p of pines) {
      expect(Math.abs(p.x % 2)).toBe(0)
      expect(Math.abs(p.y % 2)).toBe(0)
    }
    const b = pines.find((p) => p.id === 'b')!, c = pines.find((p) => p.id === 'c')!, a = pines.find((p) => p.id === 'a')!
    expect(b.x).toBeLessThan(0)
    expect(a.x).toBeGreaterThan(0)
    expect(c.y - b.y).toBe(2)
  })

  it('sin pines propios o en otra pieza, la definición manda', () => {
    expect(pinesDe(caja({ pines: undefined }), base)).toBe(base.pines)
    const r = lib.get('resistencia')!
    expect(defDe({ ...caja(), tipo: 'resistencia' }, r)).toBe(r)
  })

  it('la misma lista da la misma definición y otro nombre, otra', () => {
    const p = caja()
    expect(defDe(p, base)).toBe(defDe({ ...p }, base))
    expect(defDe({ ...p, props: { nombre: 'OTRO' } }, base)).not.toBe(defDe(p, base))
  })

  it('girada 90 y reflejada, sus pines caen donde la transformación los lleva', () => {
    const p = caja({ rot: 90, espejo: true })
    const d = defDe(p, base)
    const b = d.pines.find((q) => q.id === 'b')!
    const mundo = pinesEnMundo(p, base).find((q) => q.id === 'b')!
    // Espejo en x y giro horario de 90: (x, y) pasa a (-y, -x).
    expect(mundo).toEqual({ id: 'b', x: p.x - b.y, y: p.y - b.x })
    expect(b.x).toBeLessThan(0)
  })

  it('el cuerpo mide lo que piden los pines', () => {
    const chica = caja({ pines: seis.slice(0, 2) })
    const grande = caja({ pines: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, nombre: `P${i}`, lado: i % 2 ? 'izq' : 'der' }) as PinPropio) })
    const a = cuerpoEnMundo(chica, defDe(chica, base))
    const b = cuerpoEnMundo(grande, defDe(grande, base))
    expect(b.maxY - b.minY).toBeGreaterThan(a.maxY - a.minY)
    // Diez pines por lado: 2n + 4 = 24 unidades de alto.
    expect(b.maxY - b.minY).toBe(24)
  })

  it('el dibujo lleva el rótulo del nombre y el de cada pin con su número', () => {
    const d = disenarCaja(seis, 'XYZ123')
    const textos = d.rotulos.map((r) => r.texto)
    expect(textos).toContain('XYZ123')
    expect(textos).toEqual(expect.arrayContaining(['VCC', 'IN', 'OUT', 'GND', 'CTRL', 'NC', '8', '1']))
  })

  it('con pines numéricos cada número sale una sola vez, afuera', () => {
    const num: PinPropio[] = [
      { id: 'a', nombre: '1', numero: '1', lado: 'izq' },
      { id: 'b', nombre: '2', numero: '2', lado: 'der' },
      { id: 'c', nombre: '', numero: '3', lado: 'izq' }
    ]
    const textos = disenarCaja(num, 'LM13700').rotulos.map((r) => r.texto)
    for (const n of ['1', '2', '3']) expect(textos.filter((t) => t === n)).toHaveLength(1)
  })

  it('un nombre que aporta algo se escribe adentro junto a su número', () => {
    const textos = disenarCaja([{ id: 'a', nombre: '+IN', numero: '3', lado: 'izq' }], 'X').rotulos.map((r) => r.texto)
    expect(textos).toEqual(expect.arrayContaining(['+IN', '3']))
  })

  it('el contorno contiene el nombre, aun largo, y los nombres de pin de ambos lados', () => {
    const pines: PinPropio[] = [
      { id: 'a', nombre: 'IABC_LARGO', numero: '1', lado: 'izq' },
      { id: 'b', nombre: 'SALIDA_LARGA', numero: '2', lado: 'der' }
    ]
    const d = disenarCaja(pines, 'TLC555CDRQ1-ABCDEFG')
    const [x0, , x1] = d.geometria.trazos[0]
    const ancho = (t: string, tam: number) => (anchoEnEm(t, { fuente: 'sans', negrita: false, cursiva: false }) * tam) / 1.25
    const titulo = d.rotulos.find((r) => r.texto === 'TLC555CDRQ1-ABCDEFG')!
    expect(titulo.x - ancho(titulo.texto, titulo.tam) / 2).toBeGreaterThanOrEqual(x0)
    expect(titulo.x + ancho(titulo.texto, titulo.tam) / 2).toBeLessThanOrEqual(x1)
    // Los dos nombres de pin no se cruzan dentro de la caja.
    expect(ancho('IABC_LARGO', 1.4) + ancho('SALIDA_LARGA', 1.4)).toBeLessThan(x1 - x0)
  })
})
