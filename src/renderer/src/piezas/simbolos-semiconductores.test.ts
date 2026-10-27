// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { avisosDelCircuito } from '../ui/proyecto'

const lib = libreriaDePrueba().piezas
/** «id@x,y» de cada pin, en orden. */
const pines = (id: string) => lib.get(id)!.pines.map((p) => `${p.id}@${p.x},${p.y}`)
const primero = (q: string) => buscar(q, lib)[0]?.def.id
/** Avisos de un esquema con una pieza de cada tipo, separadas 30 unidades. */
function avisosDe(tipos: string[]): string[] {
  const d = documentoVacio()
  tipos.forEach((tipo, i) => (d.piezas[`p${i}`] = { id: `p${i}`, tipo, ref: `X${i + 1}`, x: i * 30, y: 0, rot: 0, espejo: false, props: {} }))
  return avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)
}

describe('semiconductores nuevos', () => {
  it.each([
    ['zener', 'semiconductores', 'D', ['A@-4,0', 'K@4,0']],
    ['npn', 'semiconductores', 'Q', ['B@-4,0', 'C@2,-4', 'E@2,4']],
    ['pnp', 'semiconductores', 'Q', ['B@-4,0', 'E@2,-4', 'C@2,4']],
    ['mosfet-n', 'semiconductores', 'Q', ['G@-4,0', 'D@2,-4', 'S@2,4']],
    ['mosfet-p', 'semiconductores', 'Q', ['G@-4,0', 'S@2,-4', 'D@2,4']],
    ['jfet-n', 'semiconductores', 'J', ['G@-4,0', 'D@2,-4', 'S@2,4']],
    ['jfet-p', 'semiconductores', 'J', ['G@-4,0', 'S@2,-4', 'D@2,4']],
    ['igbt', 'semiconductores', 'Q', ['G@-4,0', 'C@2,-4', 'E@2,4']],
    ['ujt', 'semiconductores', 'Q', ['E@-4,0', 'B2@2,-4', 'B1@2,4']]
  ] as const)('%s: categoría %s, prefijo %s y pines', (id, categoria, prefijo, esperados) => {
    const def = lib.get(id)
    expect(def, id).toBeDefined()
    expect(def).toMatchObject({ categoria, prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['npn', 'npn'],
    ['q 2n2222', 'npn'],
    ['pnp', 'pnp'],
    ['zener', 'zener'],
    ['mosfet canal n', 'mosfet-n'],
    ['pmos', 'mosfet-p'],
    ['jfet canal n', 'jfet-n'],
    ['jfet canal p', 'jfet-p'],
    ['igbt', 'igbt'],
    ['ujt', 'ujt'],
    ['unijuntura', 'ujt']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('todos simulan: ninguno tiene el aviso de modelo', () => {
    const avisos = avisosDe(['zener', 'npn', 'pnp', 'mosfet-n', 'mosfet-p'])
    expect(avisos.some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('los transistores traen su modelo en una lista y la flecha rellena', () => {
    for (const id of ['npn', 'pnp', 'mosfet-n', 'mosfet-p']) {
      expect(lib.get(id)!.props[0], id).toMatchObject({ id: 'modelo', opciones: expect.any(Array) })
      expect(lib.get(id)!.geometria.rellenos.length, id).toBeGreaterThan(0)
    }
  })

  /** Vértice del triángulo relleno donde se juntan los dos lados iguales, y el punto medio del lado opuesto. */
  function flecha(id: string) {
    const a = Array.from(lib.get(id)!.geometria.rellenos)
    const v = [0, 1, 2].map((i) => [a[2 * i], a[2 * i + 1]] as [number, number])
    const d = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1])
    const apice = [0, 1, 2].map((i) => ({ i, dif: Math.abs(d(v[i], v[(i + 1) % 3]) - d(v[i], v[(i + 2) % 3])) })).sort((x, y) => x.dif - y.dif)[0].i
    const [o1, o2] = v.filter((_, i) => i !== apice)
    return { punta: v[apice], base: [(o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2] as [number, number] }
  }
  const pin = (id: string, p: string) => lib.get(id)!.pines.find((x) => x.id === p)!
  const dist = (a: readonly [number, number], b: { x: number; y: number }) => Math.hypot(a[0] - b.x, a[1] - b.y)

  it('la flecha del NPN sale: su punta queda más cerca del emisor que su base', () => {
    const f = flecha('npn')
    expect(dist(f.punta, pin('npn', 'E'))).toBeLessThan(dist(f.base, pin('npn', 'E')))
  })

  it('la flecha del PNP entra: su punta queda más cerca de la base (B) que su propia base', () => {
    const f = flecha('pnp')
    expect(dist(f.punta, pin('pnp', 'B'))).toBeLessThan(dist(f.base, pin('pnp', 'B')))
    // Y está del lado del emisor, arriba.
    expect(f.punta[1]).toBeLessThan(0)
  })

  it('la flecha del MOSFET-N apunta hacia el canal y la del MOSFET-P se aleja de él', () => {
    // El canal es la raya de tres tramos en x = -0.4.
    const canal = { x: -0.4, y: 0 }
    const n = flecha('mosfet-n'), p = flecha('mosfet-p')
    expect(dist(n.punta, canal), 'N: hacia dentro').toBeLessThan(dist(n.base, canal))
    expect(dist(p.punta, canal), 'P: hacia fuera').toBeGreaterThan(dist(p.base, canal))
  })

  it('la flecha del JFET-N apunta hacia el canal y la del JFET-P se aleja de él', () => {
    const canal = { x: -0.4, y: 0 }
    const n = flecha('jfet-n'), p = flecha('jfet-p')
    expect(dist(n.punta, canal), 'N: hacia dentro').toBeLessThan(dist(n.base, canal))
    expect(dist(p.punta, canal), 'P: hacia fuera').toBeGreaterThan(dist(p.base, canal))
  })
})
