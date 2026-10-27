// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { iniciarMotor } from '../prueba/pasoVista'
import { libreriaDePrueba } from '../prueba/libreria'
import { construir, DEFINICIONES } from '../prueba/plantillasIncluidas'
import { lecturaDelMotor } from '../sinVentana/lecturas'
import { memoriaDelMotor, Simulator } from '../sinVentana/motor'
import { leerResultados } from '../sim/lectura'
import { compilarNetlist } from './netlist'

beforeAll(iniciarMotor)
const lib = libreriaDePrueba().piezas
describe('plantilla del puente H discreto', () => {
  /** Velocidad del motor (rpm, con signo) y voltaje entre sus terminales con las entradas A y B en los voltajes dados. */
  const gira = (a: string, b: string) => {
    const d = construir(DEFINICIONES.find((x) => x.id === 'puente-h-discreto')!, lib)
    d.piezas.p_va.props.voltaje = a
    d.piezas.p_vb.props.voltaje = b
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
    try {
      sim.advance_to(0.4, 1e9)
      const l = leerResultados(r, lecturaDelMotor(sim, memoriaDelMotor(), sim.node_count(), sim.element_count(), sim.digital_count()))
      const m = l.piezas.get(Object.values(d.piezas).find((p) => p.ref === 'M1')!.id)!
      return { rpm: (m.extra as { rpm: number }).rpm, v: m.v }
    } finally {
      sim.free()
    }
  }

  it('gira en un sentido, en el otro y se detiene con las dos entradas iguales', () => {
    const uno = gira('6', '0')
    const otro = gira('0', '6')
    expect(uno.rpm).toBeGreaterThan(1000)
    expect(otro.rpm).toBeLessThan(-1000)
    expect(Math.abs(uno.rpm + otro.rpm) / uno.rpm).toBeLessThan(0.05)
    for (const par of [['0', '0'], ['6', '6']] as const) {
      const g = gira(par[0], par[1])
      expect(Math.abs(g.rpm), par.join()).toBeLessThan(1)
      expect(Math.abs(g.v), par.join()).toBeLessThan(0.05)
    }
  })
})
