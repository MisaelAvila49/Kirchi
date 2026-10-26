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
import { medirOhmios, netlistSinFuentes, T_PUNTO_DE_OPERACION } from './ohmetro'
import { textoMultimetro } from './multimetro'
import { RANGO_CONTINUIDAD } from './ajustes'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** Mide con la simulación detenida el multímetro `id` del documento `d`. */
function ohmiosDetenido(d: Documento, id: Id) {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const mm = r.instrumentos.multimetros.get(id)!
  return medirOhmios(r.netlist, mm.elemento, mm.rangoOhm, (json) => {
    const sim = new Simulator(json, pasoDeSimulacion(r.netlist!))
    sim.advance_to(T_PUNTO_DE_OPERACION, 1e6)
    return sim
  })
}
const ohmetro = (mas: string, com: string): Parte => ({ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'Ω' }, pines: { '+': mas, COM: com } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const cerca = (x: number, y: number, rel: number) => Math.abs(x - y) <= rel * Math.abs(y)

describe('óhmetro con la simulación detenida', () => {
  it('1 kΩ suelto lee 1.000 kΩ', () => {
    const l = ohmiosDetenido(conEtiquetas(lib, [R('R1', '1k', 'x', '0'), ohmetro('x', '0')]), 'p_1')
    expect(l.estado).toBe('ok')
    expect(cerca(l.valor, 1000, 1e-3)).toBe(true)
    expect(textoMultimetro('Ω', { valor: l.valor, estado: l.estado, frecuencia: Number.NaN, ventana: 0, periodos: 0 })).toBe('1.000 kΩ')
  })

  it('dos de 1 kΩ en paralelo leen 500 Ω', () => {
    const l = ohmiosDetenido(conEtiquetas(lib, [R('R1', '1k', 'x', '0'), R('R2', '1k', 'x', '0'), ohmetro('x', '0')]), 'p_2')
    expect(cerca(l.valor, 500, 1e-3)).toBe(true)
  })

  it('con una fuente en el circuito la apaga: el voltaje en corto, 5 V sobre 1 kΩ + 1 kΩ lee los 2 kΩ que ve desde la unión', () => {
    // La unión «m» ve R1 hacia la fuente (en corto) y R2 hacia tierra: 1 kΩ en paralelo con 1 kΩ.
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      R('R1', '1k', 'vcc', 'm'),
      R('R2', '1k', 'm', '0'),
      ohmetro('m', '0')
    ])
    expect(cerca(ohmiosDetenido(d, 'p_3').valor, 500, 1e-3)).toBe(true)
  })

  it('una fuente de corriente se abre', () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-corriente', ref: 'I1', props: { corriente: '1m' }, pines: { entrada: 'm', salida: '0' } },
      R('R1', '2k', 'm', '0'),
      ohmetro('m', '0')
    ])
    expect(cerca(ohmiosDetenido(d, 'p_2').valor, 2000, 1e-3)).toBe(true)
  })

  it('100 MΩ lee OL, y cambia de rango solo entre 10 Ω y 10 MΩ', () => {
    expect(ohmiosDetenido(conEtiquetas(lib, [R('R1', '100M', 'x', '0'), ohmetro('x', '0')]), 'p_1').estado).toBe('OL')
    for (const valor of ['10', '100', '10k', '1M', '10M']) {
      const l = ohmiosDetenido(conEtiquetas(lib, [R('R1', valor, 'x', '0'), ohmetro('x', '0')]), 'p_1')
      expect(cerca(l.valor, Number({ '10': 10, '100': 100, '10k': 1e4, '1M': 1e6, '10M': 1e7 }[valor]), 1e-2), valor).toBe(true)
    }
  })

  it('un capacitor es un circuito abierto y un inductor un corto: no se mide su carga', () => {
    const cap = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
    const conCapacitor = conEtiquetas(lib, [R('R1', '1k', 'x', '0'), cap('C1', '10u', 'x', '0'), ohmetro('x', '0')])
    expect(cerca(ohmiosDetenido(conCapacitor, 'p_2').valor, 1000, 1e-3)).toBe(true)
    const bobina: Parte = { tipo: 'inductor', ref: 'L1', props: { valor: '1' }, pines: { '1': 'x', '2': '0' } }
    expect(ohmiosDetenido(conEtiquetas(lib, [R('R1', '1k', 'x', '0'), bobina, ohmetro('x', '0')]), 'p_2').valor).toBeLessThan(1e-3)
  })

  it('continuidad con la simulación detenida: rango fijo de 100 Ω, hay paso por debajo de 50 Ω', () => {
    const medirModo = (valor: string) => {
      const d = conEtiquetas(lib, [R('R1', valor, 'x', '0'), { ...ohmetro('x', '0'), props: { modo: 'Continuidad' } }])
      const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
      const mm = r.instrumentos.multimetros.get('p_1')!
      return medirOhmios(r.netlist!, mm.elemento, RANGO_CONTINUIDAD, (json) => {
        const sim = new Simulator(json, pasoDeSimulacion(r.netlist!))
        sim.advance_to(T_PUNTO_DE_OPERACION, 1e6)
        return sim
      }, true)
    }
    const corto = medirModo('10')
    expect(corto.rango).toBe(RANGO_CONTINUIDAD)
    expect(cerca(corto.valor, 10, 1e-2)).toBe(true)
    expect(textoMultimetro('Continuidad', { ...corto, frecuencia: Number.NaN, ventana: 0, periodos: 0 })).toMatch(/hay paso$/)
    const largo = medirModo('1k')
    expect(largo.rango).toBe(RANGO_CONTINUIDAD)
    expect(textoMultimetro('Continuidad', { ...largo, frecuencia: Number.NaN, ventana: 0, periodos: 0 })).not.toMatch(/hay paso/)
  })

  it('netlistSinFuentes deja solo la prueba del multímetro objetivo', () => {
    const d = conEtiquetas(lib, [{ tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } }, R('R1', '1k', 'vcc', '0'), ohmetro('vcc', '0')])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    const mm = r.instrumentos.multimetros.get('p_2')!
    const n = netlistSinFuentes(r.netlist!, mm.elemento, 1e4)
    expect(n.elements.find((e) => e.type === 'V')).toMatchObject({ wave: { kind: 'dc', v: 0 } })
    expect(n.elements[mm.elemento]).toMatchObject({ type: 'FUSE', v: 1, ohms: 1e4 })
  })
})
