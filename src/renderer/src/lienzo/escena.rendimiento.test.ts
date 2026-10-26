// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { minimoDe, medir } from '../prueba/medir'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas

describe('construirEscena: tiempos', () => {
  it('arma 5,000 resistencias y 5,000 cables en menos de 50 ms', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 20, y = Math.floor(i / 100) * 20
      d.piezas[`r${i}`] = { id: `r${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: 0, espejo: false, props: {} }
      d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
    }
    const con = calcularConexiones(d, lib)
    let n = 0
    const { minimo: ms, mediana } = medir(() => {
      n = construirEscena(d, lib, con, PALETA_CLARA).nTrazos
    })
    console.log(`escena de 5000 resistencias + 5000 cables: ${ms.toFixed(1)} ms (mínimo; mediana ${mediana.toFixed(1)}), ${n} trazos`)
    expect(n).toBe(5000 * 10 + 5000 * 3)
    expect(ms).toBeLessThan(50)
  })

  it('arma 5,000 notas largas y 5,000 etiquetas con formato: en frío, en caliente y arrastrándolas', () => {
    const TEXTO = 'El divisor de voltaje reparte la tension de la fuente entre dos resistencias en serie; con 1 kOhm y 1 kOhm el punto medio queda en la mitad. Medir con el multimetro entre el nodo VSAL y tierra, sin cargar la salida, y anotar el valor.'
    const base = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 100, y = Math.floor(i / 100) * 60
      base.notas[`n${i}`] = {
        id: `n${i}`, x, y, ancho: 80, texto: `${i} ${TEXTO}`, anchoFijo: true,
        formato: { tam: 2.5, alinear: 'just', ...(i % 2 ? { fuente: 'serif' as const, cursiva: true as const } : {}) }
      }
      base.etiquetas[`e${i}`] = { id: `e${i}`, nombre: `NODO${i}`, x, y: y - 10, rot: i % 2 ? 0 : 90, formato: { tam: 3.5, negrita: true, tinta: 'azul', fuente: 'sans' } }
    }
    const con = calcularConexiones(base, lib)
    let t0 = performance.now()
    const n0 = construirEscena(base, lib, con, PALETA_CLARA).textos.length
    const frio = performance.now() - t0
    const caliente = minimoDe(() => construirEscena(base, lib, con, PALETA_CLARA))
    // Arrastrar: cada edición crea objetos nuevos con otra posición pero el mismo texto, ancho y formato.
    let k = 0
    const arrastre = minimoDe(() => {
      k++
      const d = documentoVacio()
      for (const [id, n] of Object.entries(base.notas)) d.notas[id] = { ...n, x: n.x + k }
      for (const [id, e] of Object.entries(base.etiquetas)) d.etiquetas[id] = { ...e, x: e.x + k }
      construirEscena(d, lib, con, PALETA_CLARA)
    })
    console.log(`escena de 5000 notas largas + 5000 etiquetas: ${n0} textos; en frio ${frio.toFixed(1)} ms, en caliente ${caliente.toFixed(1)} ms, arrastrando ${arrastre.toFixed(1)} ms`)
    expect(n0).toBeGreaterThan(5000 * 10)
    expect(frio).toBeLessThan(600)
    expect(caliente).toBeLessThan(200)
    expect(arrastre).toBeLessThan(250)
  }, 60_000)
})
