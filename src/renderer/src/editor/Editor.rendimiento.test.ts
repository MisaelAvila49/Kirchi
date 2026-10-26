// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

const lib = libreriaDePrueba().piezas

function grande(): Documento {
  const d = documentoVacio()
  for (let k = 0; k < 5000; k++) {
    const x = (k % 100) * 20, y = Math.floor(k / 100) * 20
    d.piezas[`r${k}`] = { id: `r${k}`, tipo: 'resistencia', ref: `R${k + 1}`, x, y, rot: 0, espejo: false, props: {} }
    d.cables[`c${k}`] = { id: `c${k}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
  }
  return d
}

describe('Editor: tiempos con 5,000 piezas', () => {
  it('seleccionar todo y duplicar tarda menos de 1000 ms (objetivo 300 ms)', () => {
    const ed = new Editor(lib, grande(), idSecuencial())
    ed.seleccionarTodo()
    const t0 = performance.now()
    ed.duplicar()
    const ms = performance.now() - t0
    console.log(`duplicar 5000 piezas + 5000 cables: ${ms.toFixed(0)} ms`)
    expect(Object.keys(ed.doc.piezas)).toHaveLength(10000)
    expect(ms).toBeLessThan(1000)
  })

  it('cada paso de arrastrar una pieza cuesta menos de 10 ms (objetivo 4 ms)', () => {
    const ed = new Editor(lib, grande(), idSecuencial())
    ed.tolerancia = 0.5
    ed.abajo({ x: 1000, y: 400.4 })
    ed.mover({ x: 1000, y: 402.4 })
    // 14 pasos: pasa encima de R2151 (y = 420), así que también mide la revisión de choques,
    // y termina en y = 430, libre entre dos filas, para que el arrastre se quede.
    const pasos = 14
    const t0 = performance.now()
    for (let i = 1; i <= pasos; i++) ed.mover({ x: 1000, y: 402.4 + 2 * i })
    const ms = (performance.now() - t0) / pasos
    console.log(`arrastrar una pieza entre 5000: ${ms.toFixed(2)} ms por paso`)
    ed.arriba({ x: 1000, y: 402.4 + 2 * pasos })
    expect(ed.doc.piezas.r2050.y).toBe(400 + 2 + 2 * pasos)
    expect(ms).toBeLessThan(10)
  })
})
