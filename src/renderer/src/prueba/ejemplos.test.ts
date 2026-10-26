// @vitest-environment happy-dom
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { calcularConexiones } from '../conexiones/conexiones'
import { colisiona } from '../editor/colision'
import { conflictoDeTocados } from '../editor/conflictos'
import { compilarNetlist } from '../netlist/netlist'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito } from '../ui/proyecto'
import { amplificadorInversor } from './ejemplos'
import { libreriaDePrueba } from './libreria'

const lib = libreriaDePrueba().piezas
const VERSION = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../package.json'), 'utf8')).version as string

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

describe('ejemplo: amplificador inversor (OPAMP.kir)', () => {
  it('cumple las reglas del editor: ninguna pieza encimada, ningún cable por un cuerpo ni encima de otra red, ningún aviso', () => {
    const d = amplificadorInversor()
    for (const p of Object.values(d.piezas)) expect(colisiona(d, lib, p), p.ref).toBeNull()
    expect(conflictoDeTocados(d, lib, { piezas: Object.keys(d.piezas), cables: Object.keys(d.cables) })).toBeNull()
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib)).toEqual([])
    expect(Object.keys(d.figuras ?? {})).toHaveLength(5)
  })

  it('la salida es −5 V: ganancia −R2/R1 = −1 con 5 V a la entrada y ±15 V de alimentación', () => {
    const d = amplificadorInversor()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
    sim.advance_to(2e-3, 10000)
    const vout = sim.voltages()[r.nodoDeRed.get(con.redDeEtiqueta.get('e_vout')!)!]
    sim.free()
    expect(vout).toBeCloseTo(-5, 1)
  })

  it('se escribe con el serializador de la aplicación en formato 4 y vuelve idéntico; con KIRCHI_EJEMPLO se guarda ahí', () => {
    const d = amplificadorInversor()
    const bytes = escribirKir(d, VERSION)
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(4)
    const r = leerKir(bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(r.doc).toEqual(d)
    expect(escribirKir(r.doc, VERSION)).toEqual(bytes)
    const salida = process.env.KIRCHI_EJEMPLO
    if (salida) writeFileSync(salida, bytes)
  })
})
