// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Figura } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas

describe('figuras: tiempos', () => {
  it('1,000 figuras (marcos de guiones con relleno, elipses de puntos, flechas) entran a la escena en menos de 15 ms', () => {
    const d = documentoVacio()
    const tipos = ['rectangulo', 'elipse', 'flecha', 'linea'] as const
    const figuras: Record<string, Figura> = {}
    for (let i = 0; i < 1000; i++) {
      const tipo = tipos[i % 4], x = (i % 40) * 30, y = Math.floor(i / 40) * 20
      figuras[`f${i}`] = { id: `f${i}`, tipo, x1: x, y1: y, x2: x + 24, y2: y + 14, orden: i, trazo: i % 3 === 0 ? 'guiones' : i % 3 === 1 ? 'puntos' : 'continuo', ...(tipo === 'rectangulo' ? { relleno: true as const } : {}) }
    }
    d.figuras = figuras
    const con = calcularConexiones(d, lib)
    const t = medir(() => construirEscena(d, lib, con, PALETA_CLARA))
    console.log(`escena con 1,000 figuras: mínimo ${t.minimo.toFixed(2)} ms, mediana ${t.mediana.toFixed(2)} ms`)
    expect(t.minimo).toBeLessThan(15)
  })
})
