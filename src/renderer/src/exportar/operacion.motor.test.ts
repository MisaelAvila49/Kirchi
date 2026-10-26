// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { notaDeLectura, textoDeLectura, TEXTO_SIN_CORRIENTE } from './lecturaEsquema'
import { lecturaDeOperacion, pedidoOperacion, resolverOperacion, tamañosDe } from './operacion'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

describe('el punto de operación sin vista previa', () => {
  it('el divisor da 2.5 V en la salida y 2.5 mA en un tramo, y lo dice', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const p = pedidoOperacion(r)!
    const crudo = resolverOperacion(new Simulator(JSON.stringify(p.netlist), p.h), memoria, tamañosDe(p.netlist))
    const l = lecturaDeOperacion(d, lib, con, r, crudo)
    const salida = { x: 0, y: 0, cable: null, pin: clavePin('p_r1', '2') }
    expect(textoDeLectura(con, l, { ...salida, magnitud: 'voltaje' })).toBe('2.5 V')
    expect(notaDeLectura(l, true)).toBe('punto de operación')
    expect(notaDeLectura({ ...l, t: 1.234e-3 }, false)).toBe('t = 1.23 ms')
    const t = l.corrientes!.tramos.find((q) => q.largo >= 2)!
    const x = Math.round((t.x0 + t.x1) / 2)
    const y = Math.round((t.y0 + t.y1) / 2)
    const txt = textoDeLectura(con, l, { x: x * 1.25, y: y * 1.25, magnitud: 'corriente', cable: t.cable, pin: null })
    expect(txt).toMatch(/^[-−]?2\.5\d* mA$/)
  })

  it('sin lectura la corriente pide simular', () => {
    const con = calcularConexiones(divisor(), lib)
    expect(textoDeLectura(con, null, { x: 0, y: 0, magnitud: 'corriente', cable: 'c_a', pin: null })).toBe(TEXTO_SIN_CORRIENTE)
  })
})
