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

describe('compuertas lógicas', () => {
  it.each([
    ['and', 'digitales', 'U', ['A@-6,-2', 'B@-6,2', 'Y@6,0']],
    ['nand', 'digitales', 'U', ['A@-6,-2', 'B@-6,2', 'Y@6,0']],
    ['or', 'digitales', 'U', ['A@-6,-2', 'B@-6,2', 'Y@6,0']],
    ['nor', 'digitales', 'U', ['A@-6,-2', 'B@-6,2', 'Y@6,0']],
    ['xor', 'digitales', 'U', ['A@-6,-2', 'B@-6,2', 'Y@6,0']],
    ['not', 'digitales', 'U', ['A@-6,0', 'Y@6,0']]
  ] as const)('%s: categoría %s, prefijo %s y pines', (id, categoria, prefijo, esperados) => {
    const def = lib.get(id)
    expect(def, id).toBeDefined()
    expect(def).toMatchObject({ categoria, prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['and', 'and'],
    ['nand', 'nand'],
    ['or', 'or'],
    ['nor', 'nor'],
    ['xor', 'xor'],
    ['not', 'not'],
    ['inversor', 'not']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('simulan: ya no dicen «todavía no tiene modelo eléctrico»', () => {
    const avisos = avisosDe(['and', 'nand', 'or', 'nor', 'xor', 'not', 'biestable-d', 'biestable-jk', 'contador', 'decodificador-7seg', 'estado-logico'])
    expect(avisos.some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it.each([
    ['biestable-d', 'U', ['D@-6,-4', 'CLK@-6,2', 'PRE@0,-8', 'CLR@0,8', 'Q@6,-4', 'QN@6,2']],
    ['biestable-jk', 'U', ['J@-6,-4', 'CLK@-6,0', 'K@-6,4', 'PRE@0,-8', 'CLR@0,8', 'Q@6,-4', 'QN@6,4']],
    ['contador', 'U', ['CLK@-6,-4', 'RST@-6,2', 'Q0@6,-6', 'Q1@6,-4', 'Q2@6,-2', 'Q3@6,0', 'CO@6,4']],
    ['decodificador-7seg', 'U', ['A@-6,-6', 'B@-6,-4', 'C@-6,-2', 'D@-6,0', 'a@6,-8', 'b@6,-6', 'c@6,-4', 'd@6,-2', 'e@6,0', 'f@6,2', 'g@6,4']],
    ['estado-logico', 'E', ['S@4,0']]
  ] as const)('%s: prefijo %s y pines', (id, prefijo, esperados) => {
    expect(lib.get(id)).toMatchObject({ categoria: 'digitales', prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['flip flop', 'biestable-d'],
    ['jk', 'biestable-jk'],
    ['contador', 'contador'],
    ['4511', 'decodificador-7seg'],
    ['estado lógico', 'estado-logico']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('los nombres visibles usan flip-flop, con los mismos id, y el buscador acepta los nombres viejos', () => {
    expect(lib.get('biestable-d')!.nombre.es).toBe('Flip-flop D')
    expect(lib.get('biestable-jk')!.nombre.es).toBe('Flip-flop JK')
    for (const q of ['biestable d', 'biestable', 'báscula'] as const) expect(buscar(q, lib).map((r) => r.def.id)).toContain('biestable-d')
    expect(primero('biestable jk')).toBe('biestable-jk')
  })

  it('las piezas digitales llevan familia y alimentación, sin dibujarlas junto al símbolo', () => {
    for (const id of ['and', 'nand', 'or', 'nor', 'xor', 'not', 'biestable-d', 'biestable-jk', 'contador', 'decodificador-7seg', 'estado-logico']) {
      const def = lib.get(id)!
      expect(def.props.find((p) => p.id === 'familia')).toMatchObject({ defecto: '74HC', opciones: ['74HC', '74LS', 'CD4000B'] })
      expect(def.props.find((p) => p.id === 'alimentacion')).toMatchObject({ defecto: '5 V' })
      expect(def.props.some((p) => p.mostrar)).toBe(false)
    }
  })

  /** Trazos como listas de puntos [x, y]. */
  const trazos = (id: string) =>
    lib.get(id)!.geometria.trazos.map((t) => {
      const a = Array.from(t)
      return Array.from({ length: a.length / 2 }, (_, i) => [a[2 * i], a[2 * i + 1]] as [number, number])
    })
  const cerrado = (t: [number, number][]) => t.length > 2 && Math.abs(t[0][0] - t.at(-1)![0]) < 1e-4 && Math.abs(t[0][1] - t.at(-1)![1]) < 1e-4
  const caja = (t: [number, number][]) => ({
    minX: Math.min(...t.map((p) => p[0])), maxX: Math.max(...t.map((p) => p[0])),
    minY: Math.min(...t.map((p) => p[1])), maxY: Math.max(...t.map((p) => p[1]))
  })
  /** Trazos cerrados chicos (la burbuja): ancho de 1.5 o menos. */
  const burbujas = (id: string) => trazos(id).filter((t) => cerrado(t) && caja(t).maxX - caja(t).minX <= 1.5)

  it.each([['nand', 'and'], ['nor', 'or'], ['not', null]] as const)('%s: la burbuja es un trazo cerrado más que su compuerta simple, entre la punta del cuerpo y el pin Y', (id, simple) => {
    if (simple) expect(trazos(id).length, 'un trazo más').toBe(trazos(simple).length + 1)
    for (const s of ['and', 'or', 'xor']) expect(burbujas(s), s).toHaveLength(0)
    const b = burbujas(id)
    expect(b, 'una sola burbuja').toHaveLength(1)
    const cuerpo = trazos(id).filter((t) => cerrado(t) && !b.includes(t)).map(caja).sort((x, y) => y.maxX - y.minX - (x.maxX - x.minX))[0]
    const pinY = lib.get(id)!.pines.find((p) => p.id === 'Y')!
    const c = caja(b[0])
    const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2
    expect(cx).toBeGreaterThan(cuerpo.maxX)
    expect(cx).toBeLessThan(pinY.x)
    expect(c.minX, 'toca la punta del cuerpo').toBeCloseTo(cuerpo.maxX, 1)
    expect(cy).toBeCloseTo(pinY.y, 5)
  })
})
