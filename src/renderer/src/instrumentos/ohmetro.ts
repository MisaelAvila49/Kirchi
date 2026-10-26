import type { EstadoMultimetro } from '../sim/protocoloInstrumentos'
import type { ElementoMotor, NetlistMotor } from '../netlist/netlist'
import { RANGOS_OHM } from './ajustes'
import { ohmsDeVoltaje, rangoParaVoltaje } from './multimetro'

/** Un capacitor en continua (circuito abierto) y un inductor (corto), como resistencias. */
const R_ABIERTO = 1e12
const R_CORTO = 1e-6
/** Lo que se avanza el motor para asentar el punto de operación (el motor no lo resuelve al crearse). */
export const T_PUNTO_DE_OPERACION = 1e-4

/** Óhmetro con la simulación detenida: netlist con fuentes independientes apagadas (voltaje en corto, corriente abierta) y
 * el multímetro `objetivo` en su rango. Los demás no ponen su fuente de prueba.
 * Resistencias, diodos, transistores y lógica quedan como están: sin alimentación no conducen. */
export function netlistSinFuentes(n: NetlistMotor, objetivo: number, rango: number): NetlistMotor {
  const elements = n.elements.map((e, k): ElementoMotor => {
    switch (e.type) {
      case 'V':
        return { ...e, wave: { kind: 'dc', v: 0 } }
      case 'I':
        return { ...e, amps: 0 }
      case 'PSU':
        return { ...e, v: 0 }
      // En continua un capacitor es un circuito abierto y un inductor un corto: así el óhmetro mide el punto de operación y
      // no la carga de un capacitor (los índices de la netlist no cambian).
      case 'C':
        return { type: 'R', a: e.a, b: e.b, ohms: R_ABIERTO }
      case 'L':
        return { type: 'R', a: e.a, b: e.b, ohms: R_CORTO }
      case 'FUSE':
        return k === objetivo ? { ...e, ohms: rango } : { ...e, v: 0 }
      default:
        return e
    }
  })
  return { ...n, elements }
}

/** Lo que el motor da de un punto de operación: el voltaje de cada nodo (el 0 es la tierra). */
export interface PuntoDeOperacion {
  voltages(): ArrayLike<number>
  free(): void
}

export interface LecturaOhmios {
  valor: number
  estado: EstadoMultimetro
  /** El rango en que quedó el óhmetro automático. */
  rango: number
}

/** Mide la resistencia entre terminales del multímetro `objetivo` (elemento FUSE) con un punto de operación por rango (con
 * `fijo`, el de continuidad, uno solo): parte de `rangoInicial` y sube o baja una década hasta que el voltaje de prueba
 * cae entre 9 % y 91 %, como el automático de la vista previa. */
export function medirOhmios(n: NetlistMotor, objetivo: number, rangoInicial: number, resolver: (netlist: string) => PuntoDeOperacion, fijo = false): LecturaOhmios {
  const el = n.elements[objetivo]
  if (el?.type !== 'FUSE') return { valor: Number.NaN, estado: 'sin-medida', rango: rangoInicial }
  let rango = fijo ? rangoInicial : RANGOS_OHM.includes(rangoInicial) ? rangoInicial : RANGOS_OHM[2]
  const vistos = new Set<number>()
  for (;;) {
    vistos.add(rango)
    const punto = resolver(JSON.stringify(netlistSinFuentes(n, objetivo, rango)))
    let u: number
    try {
      const v = punto.voltages()
      u = v[el.a] - v[el.b]
    } finally {
      punto.free()
    }
    const siguiente = fijo ? rango : rangoParaVoltaje(rango, u)
    // Sin cambio de rango, o si volvería a uno ya probado (oscilaría entre dos), esta es la lectura.
    if (siguiente === rango || vistos.has(siguiente)) return { ...ohmsDeVoltaje(u, rango), rango }
    rango = siguiente
  }
}
