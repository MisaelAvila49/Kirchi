// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { avisosDelCircuito } from './proyecto'

const lib = libreriaDePrueba().piezas

/** Cadena de `n` resistencias (una sola isla) y una tierra sin conectar. */
function cadena(n: number) {
  const d = documentoVacio()
  // Pines a ±4 mm: una resistencia cada 8 mm toca a la siguiente, así que forman una sola isla.
  for (let i = 0; i < n; i++) {
    const p: Pieza = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x: i * 8, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas[p.id] = p
  }
  d.piezas.g = { id: 'g', tipo: 'tierra', ref: 'GND1', x: 0, y: 40, rot: 0, espejo: false, props: {} }
  return { d, con: calcularConexiones(d, lib) }
}

describe('avisosDelCircuito: tiempos', () => {
  it('el costo crece en línea recta: con 4 veces las piezas, a lo más 5 veces el tiempo', () => {
    // Un recorrido que rehace trabajo por pieza (un arreglo nuevo, una búsqueda en la isla) se nota aquí aunque el
    // tiempo absoluto de una máquina rápida pase el límite de la prueba de abajo.
    const chica = cadena(1250)
    const grande = cadena(5000)
    const t1 = medir(() => avisosDelCircuito(chica.d, chica.con, lib))
    const t4 = medir(() => avisosDelCircuito(grande.d, grande.con, lib))
    console.log(`avisos: 1,250 piezas ${t1.minimo.toFixed(2)} ms, 5,000 piezas ${t4.minimo.toFixed(2)} ms, razón ${(t4.minimo / t1.minimo).toFixed(2)}`)
    expect(t4.minimo / t1.minimo).toBeLessThanOrEqual(5)
  })

  it('rinde con una cadena de 5,000 resistencias y una tierra sin conectar', () => {
    const { d, con } = cadena(5000)
    const avisos = avisosDelCircuito(d, con, lib)
    expect(avisos.some((a) => a.piezas.length === 5000)).toBe(true)
    const { minimo: ms, mediana } = medir(() => avisosDelCircuito(d, con, lib))
    console.log(`avisos con 5000 resistencias en cadena: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)})`)
    expect(ms).toBeLessThan(10)
  })
})
