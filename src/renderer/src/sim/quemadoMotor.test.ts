// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { limitesDelCircuito } from './avisos'
import init, { Simulator } from './pkg/kirchi_engine.js'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

describe('un motor quemado deja de conducir en el motor de simulación', () => {
  it('el elemento que se abre es el de la pieza y la corriente baja a cero; al reponerla vuelve', () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '13' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'motor-dc', ref: 'M1', props: { voltaje: '6' }, pines: { '+': 'a', '-': '0' } }
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const k = limitesDelCircuito(d, lib, r).get('p_1')!.quema!.elemento
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
    sim.advance_to(0.05, 1e9)
    expect(Math.abs(sim.currents()[k])).toBeGreaterThan(0.1)
    sim.quemar(k, true)
    sim.advance_to(0.1, 1e9)
    expect(Math.abs(sim.currents()[k])).toBeLessThan(1e-6)
    sim.quemar(k, false)
    sim.advance_to(0.15, 1e9)
    expect(Math.abs(sim.currents()[k])).toBeGreaterThan(0.1)
    sim.free()
  })
})
