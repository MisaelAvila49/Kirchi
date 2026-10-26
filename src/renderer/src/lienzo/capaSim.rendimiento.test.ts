// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import type { Lectura, LecturaDigital } from '../sim/lectura'
import { construirCapaSim } from './capaSim'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas

describe('construirCapaSim: tiempos', () => {
  it('rehace la capa de 5,000 resistencias y 5,000 cables simulados en menos de 25 ms', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      d.piezas[`r${i}`] = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: 0, espejo: false, props: {} }
      d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
    }
    const con = calcularConexiones(d, lib)
    const redes = new Map<number, number>()
    for (const r of con.redes) redes.set(r.id, (r.id % 11) - 5)
    const l: Lectura = { t: 0, ratio: 1, redes, piezas: new Map() }
    let n = 0
    const { minimo: ms, mediana } = medir(() => {
      n = construirCapaSim(d, lib, con, l, 5, PALETA_CLARA).nTrazos
    })
    console.log(`capa de simulacion de 5000 resistencias + 5000 cables: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)}), ${n} trazos`)
    expect(n).toBeGreaterThan(5000)
    expect(ms).toBeLessThan(25)
  })

  it('rehace la capa de 1,000 compuertas con sus redes en X o conmutando en menos de 25 ms (los patrones)', () => {
    const d = documentoVacio()
    // Una cadena de 1,000 inversores en filas de 50, cada salida a la entrada del siguiente con un cable de 8 unidades.
    for (let i = 0; i < 1000; i++) {
      const x = (i % 50) * 20, y = Math.floor(i / 50) * 20
      d.piezas[`u${i}`] = { id: `u${i}`, tipo: 'not', ref: `U${i + 1}`, x, y, rot: 0, espejo: false, props: {} }
      if (i % 50 !== 49) d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 6, y }, { x: x + 14, y }] }
    }
    const con = calcularConexiones(d, lib)
    const digitales = new Map<number, LecturaDigital>()
    for (const r of con.redes) {
      const x = r.id % 2 === 0
      digitales.set(r.id, { nivel: x ? 'X' : '1', nominal: x ? null : 5, f: x ? 0 : 1000, ciclo: 0.5, vcc: 5, cambios: 100, conmuta: !x })
    }
    const l: Lectura = { t: 0, ratio: 1, redes: new Map(), piezas: new Map(), digitales }
    let n = 0
    const { minimo: ms, mediana } = medir(() => {
      n = construirCapaSim(d, lib, con, l, 5, PALETA_CLARA).nTrazos
    })
    console.log(`capa de simulacion de 1000 compuertas en X o conmutando: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)}), ${n} trazos`)
    expect(n).toBeGreaterThan(2000)
    expect(ms).toBeLessThan(25)
  })
})
