// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { MotorSimulacion } from './client'
import { ControlSimulacion } from './control'
import { paraTexto } from './lectura'
import type { SimReading } from './protocol'

const lib = libreriaDePrueba().piezas

/** Un motor falso que da los voltajes del último paso y el promedio que se le pongan. */
class MotorFijo implements MotorSimulacion {
  voltajes = [0, 5, 2.5]
  promedio: number[] | null = null
  async load() {
    return { nodes: 3, elements: 3, digitales: 0, lazo: [] }
  }
  setValues() {
    return 1
  }
  reponer() {}
  paso() {}
  setSpeed() {}
  read(): SimReading {
    const v = Float64Array.from(this.voltajes)
    const vacio = new Float64Array(0)
    const i = new Float64Array(3)
    return {
      consistente: true, time: 1, ratio: 1, capacity: 2, seq: 1, voltages: v, currents: i, aux: new Float64Array(3), estado: new Float64Array(3), niveles: vacio, medidas: vacio,
      promedio: this.promedio ? { duracion: 0.1, voltages: Float64Array.from(this.promedio), currents: i } : null
    }
  }
  alError() {
    return () => {}
  }
  alRechazo() {
    return () => {}
  }
  alFundido() {
    return () => {}
  }
  configurarInstrumentos() {}
  columnasDePantalla() {}
  rearmar() {}
  forzarPantallas() {}
  capturaAmplia() {
    return Promise.resolve(null)
  }
  capturaFina() {
    return Promise.resolve(null)
  }
  leerInstrumentos() {
    return null
  }
  alRango() {
    return () => {}
  }
  retroceder() {
    return Promise.resolve({ t: Number.NaN, guardados: 0 })
  }
  alEstadosPerdidos() {
    return () => {}
  }
  versionDePantalla() {
    return 0
  }
  // Lo que el control pide del tiempo, la corriente animada y el quemado (este motor no avanza).
  async avanzar() {
    return { t: 1, dt: 0, interrumpida: false }
  }
  async avanzarHasta(t: number) {
    return { t, dt: 0, interrumpida: false }
  }
  interrumpir() {}
  activarCorrientes() {}
  quemar() {
    return 1
  }
  alCruces() {
    return () => {}
  }
  dispose() {}
}

function armar() {
  const d = divisor()
  const con = calcularConexiones(d, lib)
  const motor = new MotorFijo()
  const c = new ControlSimulacion({ crearMotor: () => motor, circuito: () => ({ doc: d, lib, con }), registrar: () => {}, fase: () => {} })
  const medio = con.redDePin.get(clavePin('p_r1', '2'))!
  const nodo = compilarNetlist(d, lib, con).nodoDeRed.get(medio)!
  return { c, motor, medio, nodo }
}

describe('lecturas estables', () => {
  it('con promedio, lo estable es el promedio con la histéresis; los cables siguen al último paso', async () => {
    const { c, motor, medio, nodo } = armar()
    await c.iniciar()
    const promedio = (v: number) => {
      const p = [0, 5, 2.5]
      p[nodo] = v
      return p
    }
    motor.promedio = promedio(2.5004)
    const l1 = c.leer()!
    expect(l1.redes.get(medio)).toBe(2.5)
    expect(l1.estable!.redes.get(medio)).toBe(2.5004)
    motor.promedio = promedio(2.5011)
    expect(c.leer()!.estable!.redes.get(medio)).toBe(2.5004)
    motor.promedio = promedio(2.512)
    const l3 = c.leer()!
    expect(l3.estable!.redes.get(medio)).toBe(2.512)
    expect(paraTexto(l3).redes.get(medio)).toBe(2.512)
  })

  it('sin promedio (en pausa, o tras un cambio en caliente), lo estable es el último paso', async () => {
    const { c, medio } = armar()
    await c.iniciar()
    const l = c.leer()!
    expect(l.estable!.redes.get(medio)).toBe(2.5)
    expect(paraTexto(l)).toMatchObject({ t: l.t })
  })

  it('al detener se olvida la cifra que se veía', async () => {
    const { c, motor, medio, nodo } = armar()
    await c.iniciar()
    const p = [0, 5, 2.5]
    p[nodo] = 2.5004
    motor.promedio = p
    c.leer()
    c.detener()
    await c.iniciar()
    p[nodo] = 2.5011
    expect(c.leer()!.estable!.redes.get(medio)).toBe(2.5011)
  })
})
