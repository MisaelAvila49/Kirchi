import { afterEach, describe, expect, it, vi } from 'vitest'
import { medir, minimoDe } from './medir'

/** Reloj de pruebas: cada llamada de la función medida avanza el reloj lo que diga `duraciones` (en ciclo), para probar
 * las estadísticas de `medir` con números exactos. El tiempo real solo lo miden las pruebas de rendimiento
 * (`vitest.rendimiento.config.ts`). */
function relojFalso(duraciones: number[]) {
  let t = 0
  let k = 0
  return {
    ahora: () => t,
    fn: () => {
      t += duraciones[k++ % duraciones.length]
    },
    llamadas: () => k
  }
}

describe('medir', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calienta por tiempo: con llamadas de 10 ms y 300 ms de calentamiento hace 30 antes de las muestras', () => {
    const r = relojFalso([10])
    medir(r.fn, { muestras: 1, ahora: r.ahora })
    expect(r.llamadas()).toBe(30 + 1)
  })

  it('calienta al menos 20 llamadas aunque cada una tarde más que todo el calentamiento por tiempo', () => {
    const r = relojFalso([40])
    medir(r.fn, { muestras: 1, calentarMs: 0, ahora: r.ahora })
    expect(r.llamadas()).toBe(20 + 1)
  })

  it('llama al recolector una sola vez, tras calentar, si está expuesto (por muestra duplica el tiempo medido)', () => {
    const gc = vi.fn()
    vi.stubGlobal('gc', gc)
    const r = relojFalso([1])
    medir(r.fn, { muestras: 7, calentarMs: 0, minLlamadas: 0, ahora: r.ahora })
    expect(gc).toHaveBeenCalledTimes(1)
  })

  it('devuelve la mediana y el mínimo exactos de las muestras, con un número impar y par de ellas', () => {
    const impar = relojFalso([5, 1, 9, 3, 7])
    expect(medir(impar.fn, { muestras: 5, calentarMs: 0, minLlamadas: 0, ahora: impar.ahora })).toEqual({ mediana: 5, minimo: 1, muestras: 5 })
    const par = relojFalso([5, 1, 9, 3])
    expect(medir(par.fn, { muestras: 4, calentarMs: 0, minLlamadas: 0, ahora: par.ahora })).toEqual({ mediana: 4, minimo: 1, muestras: 4 })
  })

  it('las muestras empiezan después del calentamiento: sus llamadas no cuentan', () => {
    // 20 llamadas de calentamiento de 100 ms y luego muestras de 2 ms.
    const r = relojFalso([...Array(20).fill(100), 2, 2, 2])
    expect(medir(r.fn, { muestras: 3, calentarMs: 0, ahora: r.ahora })).toEqual({ mediana: 2, minimo: 2, muestras: 3 })
  })

  it('minimoDe da solo el mínimo', () => {
    const r = relojFalso([4, 2, 6])
    expect(minimoDe(r.fn, { muestras: 3, calentarMs: 0, minLlamadas: 0, ahora: r.ahora })).toBe(2)
  })
})
