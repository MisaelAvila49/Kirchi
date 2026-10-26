// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Sonda } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { minimoDe } from '../prueba/medir'
import { Editor } from './Editor'
import { mantenerSondas } from './sondas'
import { pasoArrastre, planArrastre } from './arrastre'
import { seleccionDe } from './seleccion'

const lib = libreriaDePrueba().piezas

/** 5,000 resistencias con su cable, y 64 sondas de voltaje sobre cables repartidos. */
function grande(conSondas: boolean): Documento {
  const d = documentoVacio()
  for (let k = 0; k < 5000; k++) {
    const x = (k % 100) * 20, y = Math.floor(k / 100) * 20
    d.piezas[`r${k}`] = { id: `r${k}`, tipo: 'resistencia', ref: `R${k + 1}`, x, y, rot: 0, espejo: false, props: {} }
    d.cables[`c${k}`] = { id: `c${k}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
  }
  if (conSondas) {
    const sondas: Record<string, Sonda> = {}
    for (let i = 0; i < 64; i++) {
      const k = i * 78
      const x = (k % 100) * 20, y = Math.floor(k / 100) * 20
      sondas[`s${i}`] = { id: `s${i}`, tipo: 'voltaje', x: x + 8, y: y + 4 }
    }
    d.sondas = sondas
  }
  return d
}

describe('las sondas no encarecen la edición', () => {
  it('mantener 64 sondas en un paso de arrastre de 5,000 piezas cuesta menos de 3 ms', () => {
    const d = grande(true)
    const con = calcularConexiones(d, lib)
    const sel = seleccionDe('piezas', 'r0')
    for (const id of Object.keys(d.piezas)) sel.piezas.add(id)
    const plan = planArrastre(d, lib, sel)
    const cmd = pasoArrastre(plan, 2, 0, 'g')
    const ms = minimoDe(() => mantenerSondas(d, d, lib, con, cmd.cambios))
    console.log(`mantener 64 sondas con 5,000 piezas movidas: ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(3)
  })

  it('arrastrar una pieza entre 5,000 con 64 sondas cuesta casi lo mismo que sin ellas', () => {
    const paso = (conSondas: boolean) => {
      const ed = new Editor(lib, grande(conSondas), idSecuencial())
      ed.tolerancia = 0.5
      ed.abajo({ x: 1000, y: 400.4 })
      ed.mover({ x: 1000, y: 402.4 })
      const pasos = 14
      const t0 = performance.now()
      for (let i = 1; i <= pasos; i++) ed.mover({ x: 1000, y: 402.4 + 2 * i })
      const ms = (performance.now() - t0) / pasos
      ed.arriba({ x: 1000, y: 402.4 + 2 * pasos })
      return ms
    }
    paso(false)
    const sin = Math.min(paso(false), paso(false))
    const con = Math.min(paso(true), paso(true))
    console.log(`un paso de arrastre: ${sin.toFixed(2)} ms sin sondas y ${con.toFixed(2)} ms con 64`)
    expect(con - sin).toBeLessThan(1)
  })
})
