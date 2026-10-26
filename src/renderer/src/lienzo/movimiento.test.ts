// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura, MedicionPieza } from '../sim/lectura'
import { FLOTANTES_TRAZO } from './buffers'
import { Movimiento, RECORRIDO_MS, vueltasPorSegundo } from './movimiento'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string): Pieza => ({ id, tipo, ref: id.toUpperCase(), x: 0, y: 0, rot: 0, espejo: false, props: {} })
const doc = (...ps: Pieza[]): Documento => {
  const d = documentoVacio()
  for (const p of ps) d.piezas[p.id] = p
  return d
}
const lectura = (piezas: Record<string, MedicionPieza['extra']>): Lectura => ({
  t: 0,
  ratio: 1,
  redes: new Map(),
  piezas: new Map(Object.entries(piezas).map(([id, extra]) => [id, { v: 0, i: 0, p: 0, extra }]))
})

describe('lo que se mueve por cuadro', () => {
  it('el rotor sigue al giro real por debajo de 2 vueltas por segundo de pantalla y en el sentido del signo', () => {
    // 6,000 rpm a 1× serían 100 vueltas por segundo: se dibujan 2. A 0.01×, una vuelta por segundo de verdad.
    expect(vueltasPorSegundo(6000, 1, 2)).toBe(2)
    expect(vueltasPorSegundo(6000, 0.01, 2)).toBeCloseTo(1, 12)
    expect(vueltasPorSegundo(-6000, 0.001, 2)).toBeCloseTo(-0.1, 12)
    expect(vueltasPorSegundo(0.5, 1, 2)).toBe(0)
    expect(vueltasPorSegundo(60, Number.POSITIVE_INFINITY, 2)).toBe(2)
  })

  it('el ángulo se acumula entre lecturas y en pausa de las animaciones no avanza', () => {
    const d = doc(pieza('m', 'motor-dc'))
    const m = new Movimiento()
    m.preparar(d, lib)
    m.actualizar(lib, lectura({ m: { tipo: 'motor', rpm: 6000 } }), 0.01, 0, false)
    expect(m.vps('m')).toBeCloseTo(1, 12)
    expect(m.angulo('m', 250, false)).toBeCloseTo(0.25, 9)
    // Llega otra lectura más lenta: sigue desde el cuarto de vuelta.
    m.actualizar(lib, lectura({ m: { tipo: 'motor', rpm: 3000 } }), 0.01, 250, false)
    expect(m.angulo('m', 250, false)).toBeCloseTo(0.25, 9)
    expect(m.angulo('m', 750, false)).toBeCloseTo(0.5, 9)
    expect(m.enMovimiento(750, false)).toBe(true)
    expect(m.enMovimiento(750, true)).toBe(false)
    // Dibuja sus tres marcas giradas.
    const c = m.construir(d, lib, PALETA_CLARA, 500, false)
    expect(c.nTrazos).toBe(3)
    const x0 = c.trazos[0], y0 = c.trazos[1]
    expect(Math.hypot(x0, y0)).toBeCloseTo(1.85, 6)
    expect(c.trazos.length).toBe(3 * FLOTANTES_TRAZO)
  })

  it('el relé recorre 60 ms de reloj hasta su estado nuevo; con las animaciones en pausa cambia de golpe', () => {
    const d = doc(pieza('k', 'rele'))
    const m = new Movimiento()
    m.preparar(d, lib)
    m.actualizar(lib, lectura({ k: { tipo: 'rele', operado: false } }), 1, 0, false)
    expect(m.enMovimiento(0, false)).toBe(false)
    m.actualizar(lib, lectura({ k: { tipo: 'rele', operado: true } }), 1, 100, false)
    expect(m.enMovimiento(130, false)).toBe(true)
    // A la mitad del recorrido la punta de la armadura va entre el normalmente cerrado (x = 0) y el abierto (x = 4).
    const medio = m.construir(d, lib, PALETA_CLARA, 100 + RECORRIDO_MS / 2, false)
    expect(medio.nTrazos).toBe(1)
    const xs = [medio.trazos[0], medio.trazos[2]]
    expect(Math.min(...xs)).toBeCloseTo(2, 6)
    expect(m.enMovimiento(100 + RECORRIDO_MS, false)).toBe(false)
    const fin = m.construir(d, lib, PALETA_CLARA, 100 + RECORRIDO_MS, false)
    expect([fin.trazos[0], fin.trazos[2]].sort()).toEqual([2, 4])
    // Pausadas: el estado nuevo de golpe.
    m.actualizar(lib, lectura({ k: { tipo: 'rele', operado: false } }), 1, 500, true)
    const quieto = m.construir(d, lib, PALETA_CLARA, 501, true)
    expect([quieto.trazos[0], quieto.trazos[2]].sort()).toEqual([0, 2])
  })

  it('un circuito sin motores ni relés no tiene nada que mover', () => {
    const m = new Movimiento()
    m.preparar(doc(pieza('r', 'resistencia')), lib)
    expect(m.vacio).toBe(true)
  })
})

describe('lo que se mueve: desde que arranca, fuera de la vista y en pausa', () => {
  it('el rotor y la armadura se dibujan en reposo desde que arranca, antes de la primera lectura', () => {
    const d = doc(pieza('m', 'motor-dc'), { ...pieza('k', 'rele'), x: 20 })
    const m = new Movimiento()
    m.preparar(d, lib)
    const c = m.construir(d, lib, PALETA_CLARA, 0, false)
    // El rotor (tres marcas) y la armadura del relé.
    expect(c.nTrazos).toBeGreaterThan(3)
    expect(m.enMovimiento(0, false)).toBe(false)
  })

  it('lo que queda fuera de la vista no se arma', () => {
    const d = doc(pieza('m', 'motor-dc'), { ...pieza('m2', 'motor-dc'), x: 500 })
    const m = new Movimiento()
    m.preparar(d, lib)
    const todo = m.construir(d, lib, PALETA_CLARA, 0, false).nTrazos
    const cerca = m.construir(d, lib, PALETA_CLARA, 0, false, { minX: -20, minY: -20, maxX: 20, maxY: 20 }).nTrazos
    expect(cerca).toBe(todo / 2)
  })

  it('con la vista previa en pausa (o las animaciones) el rotor no avanza ni pide cuadros', () => {
    const d = doc(pieza('m', 'motor-dc'))
    const m = new Movimiento()
    m.preparar(d, lib)
    m.actualizar(lib, lectura({ m: { tipo: 'motor', rpm: 6000 } }), 0.01, 0, true)
    expect(m.angulo('m', 500, true)).toBe(0)
    expect(m.enMovimiento(500, true)).toBe(false)
  })
})
