// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import type { Documento } from '../../doc/tipos'
import { medirOhmios, T_PUNTO_DE_OPERACION } from '../../instrumentos/ohmetro'
import { compilarNetlist } from '../../netlist/netlist'
import { libreriaDePrueba } from '../../prueba/libreria'
import { pasoDeSimulacion } from '../../sim/lectura'
import init, { Simulator } from '../../sim/pkg/kirchi_engine.js'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_2 } from './capitulo2'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../../sim/pkg/kirchi_engine_bg.wasm')) })
})

function ohmios(d: Documento, id: string) {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const mm = r.instrumentos.multimetros.get(id)!
  return medirOhmios(r.netlist, mm.elemento, mm.rangoOhm, (json) => {
    const sim = new Simulator(json, pasoDeSimulacion(r.netlist!))
    sim.advance_to(T_PUNTO_DE_OPERACION, 1e6)
    return sim
  })
}

describe('capítulo 2: el paso de ohmios mide de verdad', () => {
  it('el multímetro de la sonda, en Ω con el circuito del capítulo, lee la resistencia de 1 kΩ', () => {
    const d = arranqueDeCapitulo('senales')!
    d.piezas.m1.props.modo = 'Ω'
    const l = ohmios(d, 'm1')
    expect(l.estado).toBe('ok')
    expect(Math.abs(l.valor - 1000)).toBeLessThan(1)
  })

  it('el que está en serie lee OL: el LED no conduce con la corriente de prueba (por eso el paso no lo usa)', () => {
    const d = arranqueDeCapitulo('senales')!
    d.piezas.m2.props.modo = 'Ω'
    expect(ohmios(d, 'm2').estado).toBe('OL')
  })

  it('el paso de ohmios pide Ω en el multímetro de la sonda, no en el de serie', () => {
    const paso = CAPITULO_2.pasos.find((p) => p.id === 'ohmios')!
    const base = arranqueDeCapitulo('senales')!
    const ctx = (modoSonda: string, modoSerie: string): CtxTutorial => {
      const doc = structuredClone(base)
      doc.piezas.m1.props.modo = modoSonda
      doc.piezas.m2.props.modo = modoSerie
      return { doc, con: calcularConexiones(doc, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 } }
    }
    expect(paso.hecho(ctx('Ω', 'A DC'))).toBe(true)
    expect(paso.hecho(ctx('V DC', 'Ω'))).toBe(false)
  })
})
