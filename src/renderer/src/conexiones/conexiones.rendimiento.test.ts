// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { calcularConexiones } from './conexiones'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot: 0, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const docCon = (piezas: Pieza[], cables: Cable[] = []): Documento => {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}

describe('calcularConexiones: tiempos', () => {
  it('rinde con 5,000 resistencias y 5,000 cables', () => {
    const piezas: Pieza[] = []
    const cables: Cable[] = []
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      piezas.push(R(`r${i}`, x, y))
      cables.push(C(`c${i}`, [x + 4, y], [x + 8, y], [x + 8, y + 8], [x + 12, y + 8]))
    }
    const d = docCon(piezas, cables)
    const { minimo: ms, mediana } = medir(() => calcularConexiones(d, lib))
    console.log(`5000 resistencias + 5000 cables: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)})`)
    expect(ms).toBeLessThan(50)
  })

  it('rinde con 2,500 piezas y 5,000 cables largos', () => {
    const piezas: Pieza[] = []
    const cables: Cable[] = []
    for (let i = 0; i < 2500; i++) piezas.push(R(`r${i}`, (i % 50) * 20, Math.floor(i / 50) * 20))
    for (let i = 0; i < 5000; i++) {
      const y = i * 3
      cables.push(C(`c${i}`, [-1000, y], [-1000 + 400, y]))
    }
    const d = docCon(piezas, cables)
    const { minimo: ms, mediana } = medir(() => calcularConexiones(d, lib))
    console.log(`2500 piezas + 5000 cables de largo 400: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)})`)
    expect(ms).toBeLessThan(50)
  })
})
