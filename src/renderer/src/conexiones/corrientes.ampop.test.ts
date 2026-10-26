// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { tipoDeTramo, SIN_FLECHA } from '../lienzo/flechas'
import { compilarNetlist } from '../netlist/netlist'
import { libreriaDePrueba } from '../prueba/libreria'
import { construir, DEFINICIONES } from '../prueba/plantillasIncluidas'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { calcularConexiones } from './conexiones'
import { armarReparto } from './corrientes'

// Caso: «la corriente parece salir de las tierras y del riel de −15 V y entrar al amp-op por su entrada». Se mide
// con el amplificador inversor incluido (±15 V, 0.5 V, 1 kΩ, 10 kΩ y carga de 10 kΩ) la corriente por cada terminal del motor y
// su reparto por los cables: lo que se ve es la física del circuito, no un error de signo.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

function medir() {
  const d = construir(DEFINICIONES.find((x) => x.id === 'amplificador-inversor')!, lib)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
  sim.activar_terminales(true)
  sim.advance_to(2e-3, 1_000_000)
  sim.reiniciar_promedios()
  sim.advance_to(3e-3, 1_000_000)
  const n = sim.casillas_terminales()
  const datos = new Float64Array(memoria.buffer, sim.terminales_ptr(), 1 + 2 * n).slice()
  sim.free()
  const medias = datos.subarray(1, 1 + n), absolutas = datos.subarray(1 + n)
  const porPin = (pin: string) => medias[r.puertos.findIndex((p) => p.pin === pin)]
  const rep = armarReparto(d, lib, con, r.puertos)
  const m = new Float64Array(rep.tramos.length), a = new Float64Array(rep.tramos.length)
  rep.repartir(medias, absolutas, m, a)
  /** Corriente del tramo del cable que empieza en (x, y) y va hacia (x1, y1), positiva si va en ese sentido. */
  const tramo = (cable: string, x0: number, y0: number, x1: number, y1: number) => {
    const k = rep.tramos.findIndex((t) => t.cable === cable && t.x0 === x0 && t.y0 === y0 && t.x1 === x1 && t.y1 === y1)
    expect(k, `${cable} ${x0},${y0}`).toBeGreaterThanOrEqual(0)
    return { i: m[k], tipo: tipoDeTramo(m[k], a[k]) }
  }
  return { porPin, rep, medias, tramo }
}

describe('amplificador inversor con ±15 V: corrientes por terminal y por cable', () => {
  it('las entradas llevan casi cero, la salida entrega lo que piden Rf y la carga y esa corriente vuelve por los rieles', () => {
    const { porPin, medias } = medir()
    // La entrada ideal no toma corriente (el modelo no lleva corriente de polarización): 1e-11 A son 10 pA, un millón de veces menos que la mínima que se anima.
    expect(Math.abs(porPin('p_u1:+'))).toBeLessThan(1e-9)
    expect(Math.abs(porPin('p_u1:-'))).toBeLessThan(1e-9)
    // Vsal = −5 V: por Rf (10 kΩ) llegan 0.5 mA desde el nodo de suma y por la carga (10 kΩ) otros 0.5 mA desde tierra.
    expect(porPin('p_u1:OUT')).toBeCloseTo(1e-3, 6)
    // V+ toma su consumo en reposo (30 V / 17.6 kΩ = 1.70 mA) y V− lo devuelve más la corriente de la salida (2.70 mA hacia el riel).
    expect(porPin('p_u1:V+')).toBeCloseTo(30 / 17.6e3, 5)
    expect(porPin('p_u1:V-')).toBeCloseTo(-(30 / 17.6e3 + 1e-3), 5)
    // Ley de corrientes del amplificador: lo que entra por sus cinco terminales suma cero.
    const suma = porPin('p_u1:+') + porPin('p_u1:-') + porPin('p_u1:OUT') + porPin('p_u1:V+') + porPin('p_u1:V-')
    expect(Math.abs(suma)).toBeLessThan(1e-9)
    expect(medias.length).toBeGreaterThan(20)
  })

  it('en los cables: sin flechas en la tierra de la entrada +, el riel de −15 V recibe corriente del amplificador y la tierra la entrega a la carga y a la fuente', () => {
    const { tramo, rep, medias } = medir()
    // Cable de la entrada + a tierra, del pin (−6, 2) hacia (−8, 2): 10 pA, sin flechas.
    expect(tramo('c_1', -6, 2, -8, 2).tipo).toBe(SIN_FLECHA)
    // Riel de −15 V: el cable va de la terminal (0, 6) al pin V− (0, 4); la corriente negativa va del pin V− a la terminal: sale del amplificador.
    expect(tramo('c_4', 0, 6, 0, 4).i).toBeLessThan(-2.6e-3)
    // Riel de +15 V: de la terminal (0, −6) al pin V+ (0, −4), hacia el amplificador.
    expect(tramo('c_12', 0, -6, 0, -4).i).toBeGreaterThan(1.6e-3)
    // Tierra de la carga: el cable va del pin (10, 10) al símbolo de tierra (10, 12) y la corriente (negativa) va de la tierra hacia la carga.
    expect(tramo('c_2', 10, 10, 10, 12).i).toBeLessThan(-4.9e-4)
    // Tierra de la fuente: la corriente sale de la tierra hacia el pin − de la fuente y sube por ella.
    expect(tramo('c_10', -20, 8, -20, 10).i).toBeLessThan(-4.9e-4)
    // El nodo de suma: llegan 0.5 mA por R1 y se van 0.5 mA por R2. La corriente solo pasa por el punto del pin −, no entra al amplificador.
    expect(tramo('c_11', -10, -2, -8, -2).i).toBeCloseTo(5e-4, 7)
    expect(tramo('c_9', -8, -14, -8, -2).i).toBeCloseTo(-5e-4, 7)
    // En cada punto de los cables entra lo que sale.
    expect(rep.residuo(medias)).toBeLessThan(1e-12)
  })
})
