// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, divisor, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { pasoDeSimulacion } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { bytesSabInstrumentos } from '../sim/protocoloInstrumentos'
import { MEMORIA_SONDAS } from './memoria'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

describe('la memoria de las capturas (criterio 6 de la 2C)', () => {
  it('cuatro osciloscopios de cuatro canales y dieciséis multímetros reservan 16 MiB o menos; sin instrumentos, nada', () => {
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': '0' } },
      ...[1, 2, 3, 4].map((k): Parte => ({ tipo: 'osciloscopio', ref: `XSC${k}`, props: { c_on: 'encendido', d_on: 'encendido' }, pines: { A: 'a', B: 'a', C: 'a', D: 'a' } })),
      ...Array.from({ length: 16 }, (_, k): Parte => ({ tipo: 'multimetro', ref: `XMM${k + 1}`, props: { modo: 'V DC' }, pines: { '+': 'a', COM: '0' } }))
    ]
    const d = conEtiquetas(lib, partes)
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!))
    const bytes = sim.memoria_sondas()
    sim.free()
    console.log(`capturas de 4 osciloscopios y 16 multímetros: ${(bytes / 2 ** 20).toFixed(2)} MiB en el motor y ${(bytesSabInstrumentos(4, 16) / 2 ** 20).toFixed(2)} MiB de memoria compartida`)
    expect(bytes).toBeLessThanOrEqual(MEMORIA_SONDAS)
    expect(bytes).toBeGreaterThan(0)
    const sin = compilarNetlist(divisor(), lib, calcularConexiones(divisor(), lib))
    const s2 = new Simulator(JSON.stringify(sin.netlist), pasoDeSimulacion(sin.netlist!))
    expect(s2.memoria_sondas()).toBe(0)
    s2.free()
    expect(bytesSabInstrumentos(0, 0)).toBe(0)
  })
})
