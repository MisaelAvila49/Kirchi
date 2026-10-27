// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validarOrden } from './ordenes'
import { enRejilla, mmAUnidades, puntoAUnidades, unidadesAMm } from './unidades'

const motivo = (x: unknown): string => {
  const r = validarOrden(x)
  return r.ok ? '' : r.motivo
}

describe('validarOrden', () => {
  it('acepta cada orden válida de la tabla', () => {
    const validas: unknown[] = [
      { orden: 'colocar', tipo: 'resistencia', ref: 'R1', valor: '4.7k', en: { x: 7.5, y: 0 }, rot: 90, espejo: true },
      { orden: 'colocar', tipo: 'led', props: { color: 'verde' } },
      { orden: 'cablear', puntos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { orden: 'conectar', desde: 'R1.2', hasta: 'Q1.B', via: 'auto' },
      { orden: 'mover', ref: 'R1', desplazar: { x: 5, y: -5 } },
      { orden: 'mover', refs: ['R1', 'R2'], a: { x: 0, y: 0 } },
      { orden: 'borrar', refs: ['R1'], cables: ['VCC'], etiquetas: ['SALIDA'] },
      { orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '10k' },
      { orden: 'propiedad', ref: 'U1', prop: 'entradas', valor: 3 },
      { orden: 'transformar', refs: ['R1'], op: 'girarIzq' },
      { orden: 'instrumento', tipo: 'multimetro', medir: { punto: 'SALIDA', terminal: '+' } },
      { orden: 'sonda', tipo: 'voltaje', punto: 'R1.2' },
      { orden: 'fragmento', plantilla: 'divisor', en: { x: 0, y: 0 } },
      { orden: 'lote', ordenes: [{ orden: 'colocar', tipo: 'resistencia', clave: 'rc' }, { orden: 'deshacer' }] },
      { orden: 'deshacer' },
      { orden: 'rehacer' }
    ]
    for (const o of validas) expect(validarOrden(o), JSON.stringify(o)).toMatchObject({ ok: true })
  })

  it('normaliza ref a refs y un valor numérico a texto', () => {
    expect(validarOrden({ orden: 'borrar', ref: 'R1' })).toEqual({ ok: true, orden: { orden: 'borrar', refs: ['R1'] } })
    expect(validarOrden({ orden: 'propiedad', ref: 'U1', prop: 'entradas', valor: 3 })).toMatchObject({ orden: { valor: '3' } })
  })

  it('rechaza tipos ajenos y campos de más con un motivo en español', () => {
    expect(motivo({ orden: 'volar' })).toBe('La orden «volar» no existe.')
    expect(motivo({ orden: 'colocar', tipo: 'resistencia', color: 'rojo' })).toBe('La orden no admite el campo «color».')
    expect(motivo({ orden: 'colocar', tipo: 7 })).toBe('«tipo» debe ser un texto.')
    expect(motivo('colocar')).toBe('Una orden debe ser un objeto.')
    expect(motivo({})).toBe('Falta el campo «orden».')
  })

  it('rechaza textos largos, listas enormes y números no finitos', () => {
    expect(motivo({ orden: 'colocar', tipo: 'x'.repeat(201) })).toMatch(/200 caracteres/)
    expect(motivo({ orden: 'borrar', refs: Array.from({ length: 2001 }, () => 'R1') })).toMatch(/2000 elementos/)
    expect(motivo({ orden: 'colocar', tipo: 'resistencia', en: { x: NaN, y: 0 } })).toMatch(/número finito/)
    expect(motivo({ orden: 'colocar', tipo: 'resistencia', en: { x: Infinity, y: 0 } })).toMatch(/número finito/)
    expect(motivo({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: NaN })).toMatch(/número finito/)
  })

  it('7.5 mm pasa y 3 mm se rechaza fuera de la rejilla', () => {
    expect(validarOrden({ orden: 'colocar', tipo: 'resistencia', en: { x: 7.5, y: -12.5 } })).toMatchObject({ ok: true })
    expect(motivo({ orden: 'colocar', tipo: 'resistencia', en: { x: 3, y: 0 } })).toBe('La posición va en múltiplos de 2.5 mm.')
    expect(motivo({ orden: 'cablear', puntos: [{ x: 0, y: 0 }, { x: 2, y: 0 }] })).toBe('La posición va en múltiplos de 2.5 mm.')
  })

  it('solo admite rotaciones de 0, 90, 180 y 270', () => {
    for (const rot of [45, 360, -90, '90', 91]) expect(motivo({ orden: 'colocar', tipo: 'resistencia', rot })).toBe('La rotación es 0, 90, 180 o 270.')
  })

  it('un lote no anida otro lote y no pasa de 2000 órdenes', () => {
    expect(motivo({ orden: 'lote', ordenes: [{ orden: 'lote', ordenes: [{ orden: 'deshacer' }] }] })).toBe('Un lote no puede llevar otro lote.')
    expect(motivo({ orden: 'lote', ordenes: Array.from({ length: 2001 }, () => ({ orden: 'deshacer' })) })).toMatch(/2000 órdenes/)
  })

  it('mover pide a o desplazar, uno solo', () => {
    expect(motivo({ orden: 'mover', ref: 'R1' })).toMatch(/«a» o «desplazar»/)
    expect(motivo({ orden: 'mover', ref: 'R1', a: { x: 0, y: 0 }, desplazar: { x: 0, y: 0 } })).toMatch(/«a» o «desplazar»/)
  })

  it('nunca lanza con mil objetos al azar', () => {
    let semilla = 12345
    const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const valores = (): unknown[] => [null, undefined, 0, -1, 3, 7.5, NaN, Infinity, '', 'colocar', 'x'.repeat(300), true, [], {}, [{}], { x: 1 }, { x: 'a', y: 2 }]
    const claves = ['orden', 'tipo', 'ref', 'refs', 'valor', 'props', 'en', 'rot', 'espejo', 'puntos', 'desde', 'hasta', 'via', 'a', 'desplazar', 'cables', 'etiquetas', 'prop', 'op', 'ordenes', 'medir', 'clave', '__proto__', 'constructor']
    const ordenes = ['colocar', 'cablear', 'conectar', 'mover', 'borrar', 'propiedad', 'transformar', 'instrumento', 'sonda', 'fragmento', 'lote', 'deshacer', 'rehacer', 'zzz']
    for (let i = 0; i < 1000; i++) {
      const o: Record<string, unknown> = { orden: ordenes[Math.floor(azar() * ordenes.length)] }
      const n = Math.floor(azar() * 6)
      for (let k = 0; k < n; k++) {
        const v = valores()
        const prof = azar() < 0.2 ? [{ orden: 'deshacer' }, v[Math.floor(azar() * v.length)]] : v[Math.floor(azar() * v.length)]
        Object.defineProperty(o, claves[Math.floor(azar() * claves.length)], { value: prof, enumerable: true, configurable: true, writable: true })
      }
      expect(() => validarOrden(o)).not.toThrow()
      expect(typeof validarOrden(o).ok).toBe('boolean')
    }
    for (const x of [null, undefined, 1, 'a', [], () => 1, Symbol('x')]) expect(() => validarOrden(x)).not.toThrow()
  })
})

describe('unidades', () => {
  it('convierte mm a unidades de rejilla y de vuelta', () => {
    expect(mmAUnidades(2.5)).toBe(2)
    expect(mmAUnidades(-7.5)).toBe(-6)
    expect(mmAUnidades(3)).toBeNull()
    expect(unidadesAMm(6)).toBe(7.5)
    expect(puntoAUnidades({ x: 5, y: 0 })).toEqual({ x: 4, y: 0 })
    expect(puntoAUnidades({ x: 5, y: 1 })).toBeNull()
    expect(enRejilla(0.1 + 2.4)).toBe(true)
  })
})
