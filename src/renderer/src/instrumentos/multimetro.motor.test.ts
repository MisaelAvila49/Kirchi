// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { pasoDeSimulacion } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { Histeresis } from '../ui/histeresis'
import { lecturaMultimetro, rangoSiguiente, textoMultimetro } from './multimetro'
import { CIFRAS_VENTANA } from './medidas'
import type { ModoMultimetro } from './ajustes'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Compila el circuito, lo simula `t` segundos y lee el multímetro `id` sobre los últimos `ventana` segundos. */
function medir(d: Documento, id: Id, t: number, ventana: number, rangos?: Map<Id, number>) {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib), { rangosOhm: rangos })
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist))
  sim.advance_to(t, 1e9)
  const mm = r.instrumentos.multimetros.get(id)!
  const w = (k: number) => new Float64Array(memoria.buffer, sim.sonda_ventana(k, t - ventana, t), CIFRAS_VENTANA).slice()
  const [wv, wi] = [w(mm.sondaV), w(mm.sondaI)]
  const fundido = new Float64Array(memoria.buffer, sim.estado_ptr(), sim.element_count()).slice()[mm.elemento] > 0
  sim.free()
  return { l: lecturaMultimetro(mm.ajustes.modo, wv, wi, mm.rangoOhm), wv, fundido }
}
const multimetro = (modo: ModoMultimetro, mas: string, com: string, props: Record<string, string> = {}): Parte => ({ tipo: 'multimetro', ref: 'XMM1', props: { modo, ...props }, pines: { '+': mas, COM: com } })
const cerca = (x: number, y: number, rel: number) => Math.abs(x - y) <= rel * Math.abs(y)

describe('criterio 2: lecturas del multímetro con el motor', () => {
  it('el voltímetro de 10 MΩ sobre 1 MΩ y 1 MΩ a 5 V lee 2.381 V, y 2.500 V ideal', () => {
    const divisor = (ideal: string) =>
      conEtiquetas(lib, [
        { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
        { tipo: 'resistencia', ref: 'R1', props: { valor: '1M' }, pines: { '1': 'vcc', '2': 'm' } },
        { tipo: 'resistencia', ref: 'R2', props: { valor: '1M' }, pines: { '1': 'm', '2': '0' } },
        multimetro('V DC', 'm', '0', { ideal })
      ])
    const banco = medir(divisor('no'), 'p_3', 0.01, 0.005).l
    expect(cerca(banco.valor, 5 / 2.1, 1e-3)).toBe(true)
    expect(textoMultimetro('V DC', banco)).toBe('2.381 V')
    // El voltímetro ideal es solo su sonda: no pone resistencia y lee los 2.500 V del divisor.
    const ideal = medir(divisor('sí'), 'p_3', 0.01, 0.005).l
    expect(cerca(ideal.valor, 2.5, 1e-9)).toBe(true)
    expect(textoMultimetro('V DC', ideal)).toBe('2.500 V')
  })

  it.each([
    ['Senoidal', Math.SQRT1_2],
    ['Cuadrada', 1],
    ['Triangular', 1 / Math.sqrt(3)]
  ] as const)('V AC de la %s del generador dentro de 0.5 %% de 50 Hz a 10 kHz', (forma, factor) => {
    for (const f of ['50', '1k', '10k']) {
      const d = conEtiquetas(lib, [
        { tipo: 'generador', ref: 'XFG1', props: { forma, frecuencia: f, amplitud: '2', desplazamiento: '1' }, pines: { '+': 's', COM: '0' } },
        { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
        multimetro('V AC', 's', '0')
      ])
      // Los 50 Ω del generador con 1 kΩ y los 10 MΩ del voltímetro en paralelo.
      const carga = 1 / (1 / 1000 + 1 / 10e6)
      const esperado = factor * (carga / (carga + 50))
      const periodo = 1 / Number(f === '1k' ? 1e3 : f === '10k' ? 1e4 : 50)
      const { l } = medir(d, 'p_2', 5 * periodo + 0.02, Math.max(4 * periodo, 0.005))
      expect(cerca(l.valor, esperado, 5e-3), `${forma} a ${f} Hz: ${l.valor} contra ${esperado}`).toBe(true)
    }
  })

  it('Ω dentro de 1 % de 10 Ω a 10 MΩ con el rango automático, y OL con 100 MΩ', () => {
    for (const valor of ['10', '100', '1k', '10k', '100k', '1M', '10M', '100M']) {
      const d = conEtiquetas(lib, [
        { tipo: 'resistencia', ref: 'R1', props: { valor }, pines: { '1': 'x', '2': '0' } },
        multimetro('Ω', 'x', '0')
      ])
      let rango = 1e4
      let l = medir(d, 'p_1', 2e-3, 1e-3, new Map([['p_1', rango]]))
      for (let k = 0; k < 6; k++) {
        const nuevo = rangoSiguiente(rango, l.wv)
        if (nuevo === rango) break
        rango = nuevo
        l = medir(d, 'p_1', 2e-3, 1e-3, new Map([['p_1', rango]]))
      }
      const x = Number(valor.replace('k', 'e3').replace('M', 'e6'))
      if (x > 40e6) expect(l.l.estado, valor).toBe('OL')
      else expect(cerca(l.l.valor, x, 1e-2), `${valor}: ${l.l.valor} en el rango ${rango}`).toBe(true)
    }
  })

  it('continuidad: hay paso con 20 Ω y no con 100 Ω; «apaga las fuentes» sobre un circuito alimentado', () => {
    const con = (valor: string) => conEtiquetas(lib, [{ tipo: 'resistencia', ref: 'R1', props: { valor }, pines: { '1': 'x', '2': '0' } }, multimetro('Continuidad', 'x', '0')])
    expect(textoMultimetro('Continuidad', medir(con('20'), 'p_1', 2e-3, 1e-3).l)).toMatch(/hay paso$/)
    expect(textoMultimetro('Continuidad', medir(con('100'), 'p_1', 2e-3, 1e-3).l)).not.toMatch(/hay paso/)
    const vivo = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'x', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'x', '2': '0' } },
      multimetro('Ω', 'x', '0')
    ])
    expect(medir(vivo, 'p_2', 2e-3, 1e-3).l.estado).toBe('voltaje')
  })

  it('en modo de corriente en paralelo con una batería, el fusible se funde', () => {
    const d = conEtiquetas(lib, [{ tipo: 'bateria', ref: 'B1', props: { voltaje: '9' }, pines: { '+': 'x', '-': '0' } }, multimetro('A DC', 'x', '0')])
    expect(medir(d, 'p_1', 0.2, 0.01).fundido).toBe(true)
  })

  it('con un circuito que conmuta (mosfet_conmutacion), la última cifra no cambia en veinte lecturas', () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'fuente-pulso', ref: 'V2', props: { alto: '5', frecuencia: '10k', ciclo: '50 %' }, pines: { '+': 'p', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'p', '2': 'g' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '100' }, pines: { '1': 'vcc', '2': 'dr' } },
      { tipo: 'mosfet-n', ref: 'Q1', pines: { D: 'dr', G: 'g', S: '0' } },
      multimetro('V DC', 'dr', '0')
    ])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!))
    const mm = r.instrumentos.multimetros.get('p_5')!
    const h = new Histeresis(4)
    const vistas = new Set<string>()
    let t = 0.01
    sim.advance_to(t, 1e9)
    for (let k = 0; k < 20; k++) {
      // Lecturas de 12.3 ms simulados: no caben periodos enteros, como pasa con el reloj real.
      sim.advance_to(t + 12.3e-3, 1e9)
      const wv = new Float64Array(memoria.buffer, sim.sonda_ventana(mm.sondaV, t, t + 12.3e-3), CIFRAS_VENTANA).slice()
      t += 12.3e-3
      const l = lecturaMultimetro('V DC', wv, wv, 1e4)
      vistas.add(textoMultimetro('V DC', { ...l, valor: h.valor('v', l.valor) }))
    }
    sim.free()
    expect([...vistas]).toHaveLength(1)
  })
})
