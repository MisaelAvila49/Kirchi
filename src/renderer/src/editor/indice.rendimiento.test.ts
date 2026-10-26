// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { Indice } from './indice'

const lib = libreriaDePrueba().piezas

describe('Indice: tiempos', () => {
  it('se reconstruye con 5,000 piezas y 5,000 cables en menos de 50 ms', () => {
    const d = documentoVacio()
    for (let k = 0; k < 5000; k++) {
      const x = (k % 100) * 20, y = Math.floor(k / 100) * 20
      d.piezas[`r${k}`] = { id: `r${k}`, tipo: 'resistencia', ref: `R${k + 1}`, x, y, rot: 0, espejo: false, props: {} }
      d.cables[`c${k}`] = { id: `c${k}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
    }
    const i = new Indice()
    const { minimo: ms, mediana } = medir(() => i.reconstruir(d, lib))
    console.log(`índice de 5000 resistencias + 5000 cables: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)})`)
    expect(ms).toBeLessThan(50)
  })
})
