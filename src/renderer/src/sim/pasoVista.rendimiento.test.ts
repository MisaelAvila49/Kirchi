// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import { medir } from '../prueba/medir'
import { PASO_MAX, pasoDeVistaPrevia } from './lectura'
import { correr, iniciarMotor, muestrear, netlistDeArchivo } from '../prueba/pasoVista'

beforeAll(iniciarMotor)

describe('el paso adaptativo de la vista previa con compuanalogica.kir', () => {
  const net = netlistDeArchivo('CompuAnalogica.kir')
  const h = pasoDeVistaPrevia(net)

  it('la salida a 50 s difiere menos de 1 mV de la corrida con 20 µs en todos los nodos', () => {
    const nuevo = muestrear(net, h, 50, 0.5)
    const viejo = muestrear(net, PASO_MAX, 50, 0.5)
    let d = 0
    for (let i = 0; i < nuevo.v.length; i++) for (let j = 0; j < nuevo.v[i].length; j++) d = Math.max(d, Math.abs(nuevo.v[i][j] - viejo.v[i][j]))
    console.info(`50 s: ${nuevo.pasos} pasos en ${nuevo.ms.toFixed(0)} ms contra ${viejo.pasos} pasos en ${viejo.ms.toFixed(0)} ms; diferencia máxima ${(d * 1e6).toFixed(1)} µV`)
    expect(d).toBeLessThan(1e-3)
  }, 300_000)

  it('corre al menos 10 veces más rápido que con 20 µs (mínimo de las muestras)', () => {
    const t = (paso: number) => medir(() => void muestrear(net, paso, 5, 1), { muestras: 3, calentarMs: 0, minLlamadas: 1 }).minimo
    const viejo = t(PASO_MAX)
    const nuevo = t(h)
    console.info(`5 s simulados: ${nuevo.toFixed(0)} ms con ${h * 1e6} µs contra ${viejo.toFixed(0)} ms con 20 µs (${(viejo / nuevo).toFixed(1)} veces)`)
    expect(viejo / nuevo).toBeGreaterThanOrEqual(10)
  }, 300_000)

  it('«Avanzar hasta» 20 s tarda menos de 2 s con tramos como los del worker', () => {
    const r = correr(net, h, 20, 20, 0.05)
    console.info(`20 s en ${r.ms.toFixed(0)} ms, ${r.pasos} pasos`)
    expect(r.error).toBeUndefined()
    expect(r.ms).toBeLessThan(2000)
  }, 60_000)
})
