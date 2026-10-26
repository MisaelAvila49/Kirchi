// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { avisosDelCircuito } from '../ui/proyecto'
import type { AbsolutosDePieza } from './absolutos'
import { VigiaDeAvisos, type LimitePieza } from './avisos'
import type { Lectura } from './lectura'

// Los máximos absolutos no deben encarecer ni los avisos estáticos ni cada lectura de la vista previa.

const lib = libreriaDePrueba().piezas

/** Cadena de `n` resistencias con `a` amplificadores (cada uno con sus alimentaciones sin conectar a una fuente). */
function circuito(n: number, a: number) {
  const d = documentoVacio()
  for (let i = 0; i < n; i++) {
    const p: Pieza = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x: i * 8, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas[p.id] = p
  }
  for (let i = 0; i < a; i++) {
    const p: Pieza = { id: `u${i}`, tipo: 'amp-op', ref: `U${i + 1}`, x: i * 40, y: 60, rot: 0, espejo: false, props: { modelo: 'TL081' } }
    d.piezas[p.id] = p
    d.piezas[`ga${i}`] = { id: `ga${i}`, tipo: 'tierra', ref: `GND${i + 1}`, x: i * 40 - 6, y: 62, rot: 0, espejo: false, props: {} }
  }
  d.piezas.g = { id: 'g', tipo: 'tierra', ref: 'GND0', x: 0, y: 40, rot: 0, espejo: false, props: {} }
  return { d, con: calcularConexiones(d, lib) }
}

describe('máximos absolutos: costo', () => {
  it('los avisos estáticos con 500 amplificadores entre 5,000 piezas cuestan poco más que sin ellos', () => {
    const sin = circuito(5000, 0)
    const con = circuito(5000, 500)
    const t0 = medir(() => avisosDelCircuito(sin.d, sin.con, lib))
    const t1 = medir(() => avisosDelCircuito(con.d, con.con, lib))
    console.log(`avisos estáticos: 5,000 piezas ${t0.minimo.toFixed(2)} ms, con 500 amplificadores ${t1.minimo.toFixed(2)} ms`)
    expect(t1.minimo).toBeLessThan(t0.minimo + 12)
  })

  it('revisar 2,000 piezas con máximos en cada lectura cuesta menos de 2 ms', () => {
    const lista: AbsolutosDePieza = {
      modelo: 'TL081',
      lista: [
        { nombre: 'alimentación (V+ a V−)', consejo: 'baja la alimentación.', unidad: 'V', de: [1], a: 2, abs: false, max: 36, escala: 36 },
        { nombre: 'entrada sobre V+', consejo: 'x', unidad: 'V', de: [3, 4], a: 1, abs: false, max: 0.3, escala: 10 },
        { nombre: 'entrada bajo V−', consejo: 'x', unidad: 'V', de: [3, 4], a: 2, abs: false, min: -0.3, escala: 10 },
        { nombre: 'voltaje entre las entradas', consejo: 'x', unidad: 'V', de: [3], a: 4, abs: true, max: 30, escala: 30 }
      ]
    }
    const limites = new Map<string, LimitePieza>()
    const redes = new Map<number, number>([[1, 15], [2, -15], [3, 0.1], [4, 0.1]])
    const piezas = new Map<string, { v: number; i: number; p: number }>()
    for (let i = 0; i < 2000; i++) {
      limites.set(`u${i}`, { tipo: 'absolutos', absolutos: lista })
      piezas.set(`u${i}`, { v: 0, i: 0, p: 0 })
    }
    const l = { t: 0, ratio: 1, redes, piezas } as unknown as Lectura
    const vigia = new VigiaDeAvisos()
    const potencias = new Map<string, number>()
    const t = medir(() => vigia.revisar(l, limites, potencias, 0, () => 'U', l))
    console.log(`revisar 2,000 piezas con máximos: ${t.minimo.toFixed(3)} ms (mediana ${t.mediana.toFixed(3)})`)
    expect(t.minimo).toBeLessThan(2)
  })
})
