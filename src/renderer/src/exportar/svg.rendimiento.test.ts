// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { construirEscena } from '../lienzo/escena'
import { hexARgba, PALETA_CLARA } from '../lienzo/paleta'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { svgDeEscena } from './svg'

const lib = libreriaDePrueba().piezas

describe('svgDeEscena: tiempos', () => {
  it('arma el SVG de 5,000 resistencias y 5,000 cables en menos de 2 s', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      d.piezas[`r${i}`] = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: 0, espejo: false, props: {} }
      d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
    }
    const esc = construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA)
    const fuentes = { interfaz: 'a', cifras: 'b', serif: 'c' }
    const generar = () => svgDeEscena(esc, { paleta: PALETA_CLARA, fondo: hexARgba('#F7F6F2'), rejilla: true, fuentes, base: () => 0.27 })!
    let l = generar()
    const { minimo: ms, mediana } = medir(() => {
      l = generar()
    }, { muestras: 15 })
    console.log(`SVG de 5000 resistencias + 5000 cables: ${ms.toFixed(0)} ms (mínimo; mediana ${mediana.toFixed(0)}), ${(l.svg.length / 2 ** 20).toFixed(1)} MB`)
    expect(l.svg.length).toBeGreaterThan(100_000)
    expect(ms).toBeLessThan(2000)
  })
})
