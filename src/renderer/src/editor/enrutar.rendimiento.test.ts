// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { piezaCruzada } from './conflictos'
import { documentoDemo } from './demo'
import { enrutar } from './enrutar'
import { Indice } from './indice'

const lib = libreriaDePrueba().piezas

describe('enrutar: tiempos', () => {
  it('cruza un documento de 1,000 piezas en menos de 10 ms', () => {
    const d = documentoDemo(1000)
    const indice = new Indice()
    indice.reconstruir(d, lib)
    // De R1 (0, 0) a R1000 (140, 620): pin 1 de cada una; las dos L atraviesan filas de resistencias.
    const desde = { x: -4, y: 0 }, hasta = { x: 136, y: 620 }
    let r = enrutar(d, lib, desde, hasta, { indice })
    const { minimo: ms, mediana } = medir(() => {
      r = enrutar(d, lib, desde, hasta, { indice })
    })
    console.log(`enrutar a través de 1,000 piezas: ${ms.toFixed(2)} ms (mínimo; mediana ${mediana.toFixed(2)}), ${r.length - 2} codos`)
    expect(r[0]).toEqual(desde)
    expect(r[r.length - 1]).toEqual(hasta)
    expect(piezaCruzada(d, lib, r)).toBeNull()
    expect(ms).toBeLessThan(10)
  })
})
