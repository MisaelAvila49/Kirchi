// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from './conexiones'
import { armarReparto, type Puerto } from './corrientes'
import { paralelo } from '../prueba/paralelo'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'

const lib = libreriaDePrueba().piezas

describe('reparto de corrientes: tiempos', () => {
  it('con 984 resistencias en paralelo se arma en menos de 20 ms y reparte una lectura en menos de 2 ms', () => {
    const d = paralelo()
    const con = calcularConexiones(d, lib)
    const puertos: Puerto[] = []
    for (const id of Object.keys(d.piezas)) {
      for (const pin of ['1', '2']) puertos.push({ red: con.redDePin.get(clavePin(id, pin))!, pin: clavePin(id, pin) })
      puertos.push({ red: -1, pin: null })
    }
    const medias = puertos.map((_, j) => (j % 3 === 0 ? 1e-3 : j % 3 === 1 ? -1e-3 : 0))
    const absolutas = medias.map(Math.abs)
    const armado = medir(() => void armarReparto(d, lib, con, puertos))
    const r = armarReparto(d, lib, con, puertos)
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    const lectura = medir(() => r.repartir(medias, absolutas, m, a))
    console.log(`reparto de 984 resistencias en paralelo: armado ${armado.minimo.toFixed(2)} ms, lectura ${lectura.minimo.toFixed(3)} ms (mínimos), ${r.tramos.length} tramos`)
    expect(r.tramos.length).toBeGreaterThan(1900)
    expect(armado.minimo).toBeLessThan(20)
    expect(lectura.minimo).toBeLessThan(2)
  })
})
