import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import type { Lectura } from '../sim/lectura'
import { medir } from '../prueba/medir'
import { PALETA_CLARA } from '../lienzo/paleta'
import { MAX_FILAS } from './proyecto'
import { colorDeRed, fichasDe, vistaMediciones } from './mediciones'

describe('Mediciones: tiempos', () => {
  it('con 1,024 redes y 1,000 piezas, una lectura (vista y colores y fichas de las filas pintadas) cuesta menos de 4 ms', () => {
    const d = documentoVacio()
    const nombres = new Map<number, string>()
    const redes = new Map<number, number>()
    const piezas = new Map<string, { v: number; i: number; p: number }>()
    for (let i = 0; i < 1024; i++) {
      nombres.set(i, `red ${i}`)
      redes.set(i, (i % 21) - 10)
    }
    for (let i = 0; i < 1000; i++) {
      d.piezas[`p${i}`] = { id: `p${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x: i * 8, y: 0, rot: 0, espejo: false, props: {} }
      piezas.set(`p${i}`, { v: i * 1e-3, i: 1e-3, p: i * 1e-6 })
    }
    const l: Lectura = { t: 1, ratio: 1, redes, piezas }
    const t = medir(() => {
      const v = vistaMediciones(d, nombres, l)!
      for (const r of v.redes.slice(0, MAX_FILAS)) colorDeRed(r.red, l, 10, PALETA_CLARA)
      for (const p of v.piezas.slice(0, MAX_FILAS)) fichasDe(p)
    })
    expect(t.minimo).toBeLessThan(4)
  })
})
