import type { Pieza, Punto, Rotacion } from '../doc/tipos'
import type { Parte } from '../plantillas/armar'

/** Acomodo de los circuitos de calculadoras y plantillas incluidas, sacado de `Calculadora.kir`. Los cables van tal cual y
 * no se enrutan: el A* daría otro camino y otro reparto de textos.
 * `disposicion.test.ts` lo compara con `disposicion.fixture.json`. */

export type Sitio = readonly [x: number, y: number, rot: Rotacion, textos?: Pieza['textos']]
export interface Disposicion {
  sitios: Record<string, Sitio>
  /** Tramos de cada cable en unidades de rejilla fina, con el origen de los sitios. */
  cables: readonly (readonly (readonly [number, number])[])[]
}
export type IdDisposicion =
  | 'divisor' | 'led' | 'bajas' | 'altas' | 'astable' | 'monoestable' | 'inversor' | 'noinversor'
  | 'pasabanda' | 'rechazabanda' | 'notch' | 'emisor' | 'puente'

export const DISPOSICION: Record<IdDisposicion, Disposicion> = {
  divisor: {
    sitios: {
      v1: [0, 0, 0, { ref: { x: 3.96, y: -1 }, valor: { x: 4.92, y: 1 } }],
      r1: [6, -6, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      r2: [12, 0, 90, { ref: { x: -0.9, y: -2.96 }, valor: { x: 0.9, y: -4.88 } }],
      g1: [6, 6, 0],
    },
    cables: [
      [[10, -6], [12, -6], [12, -4]],
      [[0, 4], [0, 6], [6, 6]],
      [[0, -4], [0, -6], [2, -6]],
      [[12, 4], [12, 6], [6, 6]],
    ]
  },
  led: {
    sitios: {
      v1: [0, 0, 0, { ref: { x: 3.96, y: -1 }, valor: { x: 4.44, y: 1 } }],
      r1: [6, -6, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      d1: [12, 0, 90, { ref: { x: 0, y: -4.96 } }],
      g1: [6, 6, 0],
    },
    cables: [
      [[12, -4], [12, -6], [10, -6]],
      [[12, 4], [12, 6], [6, 6]],
      [[0, 4], [0, 6], [6, 6]],
      [[0, -4], [0, -6], [2, -6]],
    ]
  },
  bajas: {
    sitios: {
      g1: [0, 0, 0, { ref: { x: 5.92, y: -2 }, valor: { x: 7.36, y: 2 } }],
      r1: [8, -8, 0, { valor: { lugar: 'arriba' }, ref: { x: 0, y: -5 } }],
      c1: [16, 0, 90, { ref: { lugar: 'arriba-izquierda' }, valor: { lugar: 'arriba' } }],
      t1: [8, 8, 0],
    },
    cables: [
      [[0, -6], [0, -8], [4, -8]],
      [[12, -8], [16, -8], [16, -4]],
      [[0, 6], [0, 8], [16, 8], [16, 4]],
    ]
  },
  altas: {
    sitios: {
      g1: [0, 0, 0, { ref: { x: 5.92, y: -2 }, valor: { x: 7.36, y: 2 } }],
      c1: [8, -8, 0, { ref: { x: 0, y: -3 }, valor: { x: 4.4, y: 3 } }],
      r1: [16, 0, 90, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      t1: [8, 8, 0],
    },
    cables: [
      [[0, 6], [0, 8], [8, 8]],
      [[12, -8], [16, -8], [16, -4]],
      [[16, 4], [16, 8], [8, 8]],
      [[0, -6], [0, -8], [4, -8]],
    ]
  },
  astable: {
    sitios: {
      u1: [0, 0, 0, { ref: { lugar: 'arriba-derecha' }, valor: { x: -3.13, y: 7.61 } }],
      p1: [-2, -12, 0],
      p2: [-14, -18, 0],
      r1: [-14, -12, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      r2: [-14, 0, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      c1: [-14, 12, 90, { ref: { lugar: 'abajo-izquierda' }, valor: { x: 0, y: 5.88 } }],
      c2: [8, 10, 90, { ref: { x: -0.9, y: -3.56 }, valor: { x: 0.9, y: -5 } }],
      r3: [12, -2, 0, { ref: { x: 0, y: -3 }, valor: { x: 0, y: 3 } }],
      d1: [18, 4, 90, { ref: { x: 0, y: -4.96 } }],
      g1: [18, 10, 0],
      g2: [8, 16, 0],
      g3: [0, 10, 0],
      g4: [-14, 18, 0],
    },
    cables: [
      [[18, 8], [18, 10]],
      [[0, 8], [0, 10]],
      [[-14, 16], [-14, 18]],
      [[-8, 4], [-10, 4], [-10, 6], [-14, 6]],
      [[-14, -6], [-14, -4]],
      [[-14, -8], [-14, -6]],
      [[-14, 6], [-14, 8]],
      [[-2, -12], [-2, -10]],
      [[6, -2], [8, -2]],
      [[2, -8], [2, -10], [-2, -10]],
      [[6, 4], [8, 4], [8, 6]],
      [[-2, -10], [-2, -8]],
      [[-14, 4], [-14, 6]],
      [[8, 16], [8, 14]],
      [[-6, 4], [-8, 4]],
      [[-6, -4], [-10, -4], [-10, -6], [-14, -6]],
      [[-14, -18], [-14, -16]],
      [[-6, 0], [-8, 0], [-8, 4]],
      [[16, -2], [18, -2], [18, 0]],
    ]
  },
  monoestable: {
    sitios: {
      u1: [0, 0, 0, { ref: { lugar: 'arriba-derecha' }, valor: { x: 3.98, y: 7.38 } }],
      p1: [-14, -16, 0],
      p2: [-2, -12, 0],
      r1: [-14, -10, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      c1: [-14, 6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      v2: [-8, 10, 0, { ref: { lugar: 'derecha' }, valor: { lugar: 'derecha' } }],
      c2: [8, 10, 90, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r3: [12, -2, 0, { valor: { lugar: 'arriba' }, ref: { x: 0, y: -5 } }],
      d1: [18, 4, 90, { ref: { x: 0, y: -4.96 } }],
      g1: [-14, 12, 0],
      g2: [18, 10, 0],
      g3: [-8, 16, 0],
      g4: [8, 16, 0],
      g5: [0, 10, 0],
    },
    cables: [
      [[2, -8], [2, -10], [-2, -10]],
      [[-14, -6], [-14, -4], [-10, -4]],
      [[-2, -12], [-2, -10]],
      [[-10, 0], [-6, 0]],
      [[-2, -10], [-2, -8]],
      [[-6, 4], [-8, 4], [-8, 6]],
      [[-10, -4], [-10, 0]],
      [[18, 8], [18, 10]],
      [[-14, 2], [-14, 0], [-10, 0]],
      [[0, 8], [0, 10]],
      [[8, 14], [8, 16]],
      [[6, -2], [8, -2]],
      [[-14, 10], [-14, 12]],
      [[-6, -4], [-10, -4]],
      [[-8, 14], [-8, 16]],
      [[16, -2], [18, -2], [18, 0]],
      [[6, 4], [8, 4], [8, 6]],
      [[-14, -16], [-14, -14]],
    ]
  },
  inversor: {
    sitios: {
      u1: [0, 0, 0, { ref: { x: 2.96, y: -5 }, valor: { x: 4.4, y: 5 } }],
      p1: [0, -6, 0],
      p2: [0, 6, 180],
      r1: [-14, -2, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      r2: [0, -14, 0, { valor: { lugar: 'arriba' }, ref: { x: 0, y: -5 } }],
      v1: [-20, 4, 0, { ref: { x: 3.96, y: -1 }, valor: { x: 5.88, y: 1 } }],
      rl: [10, 6, 90, { ref: { x: -0.9, y: -3.44 }, valor: { x: 0.9, y: -4.4 } }],
      g1: [-20, 10, 0],
      g2: [-8, 4, 0],
      g3: [10, 12, 0],
    },
    cables: [
      [[-6, 2], [-8, 2], [-8, 4]],
      [[10, 10], [10, 12]],
      [[4, -14], [8, -14], [8, 0]],
      [[0, 6], [0, 4]],
      [[-8, -2], [-6, -2]],
      [[8, 0], [10, 0], [10, 2]],
      [[6, 0], [8, 0]],
      [[-20, 0], [-20, -2], [-18, -2]],
      [[-4, -14], [-8, -14], [-8, -2]],
      [[-20, 8], [-20, 10]],
      [[-10, -2], [-8, -2]],
      [[0, -6], [0, -4]],
    ]
  },
  noinversor: {
    sitios: {
      u1: [0, 0, 0, { ref: { x: 2.96, y: -5 }, valor: { x: 4.4, y: 5 } }],
      p1: [0, -6, 0],
      p2: [0, 6, 180],
      r1: [-14, -2, 0, { valor: { lugar: 'arriba' }, ref: { x: 0, y: -5 } }],
      r2: [0, -14, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      v1: [-8, 8, 0, { ref: { x: -3.76, y: -0.9 }, valor: { x: -5.68, y: 0.9 } }],
      rl: [10, 6, 90, { ref: { x: -0.9, y: -3.44 }, valor: { x: 0.9, y: -4.4 } }],
      g1: [-20, 0, 0],
      g2: [-8, 14, 0],
      g3: [10, 12, 0],
    },
    cables: [
      [[-8, -2], [-6, -2]],
      [[4, -14], [8, -14], [8, 0]],
      [[10, 10], [10, 12]],
      [[-10, -2], [-8, -2]],
      [[8, 0], [10, 0], [10, 2]],
      [[-8, 4], [-8, 2], [-6, 2]],
      [[-4, -14], [-8, -14], [-8, -2]],
      [[6, 0], [8, 0]],
      [[0, -6], [0, -4]],
      [[0, 6], [0, 4]],
      [[-20, 0], [-20, -2], [-18, -2]],
      [[-8, 12], [-8, 14]],
    ]
  },
  pasabanda: {
    sitios: {
      g1: [0, 0, 0, { ref: { x: -5.92, y: -2 }, valor: { x: -7.84, y: -0.2 } }],
      c1: [6, -8, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r1: [12, -2, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      r2: [18, -8, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      c2: [24, -2, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo-derecha' } }],
      t1: [12, 4, 0],
      t2: [0, 8, 0],
      t3: [24, 4, 0],
    },
    cables: [
      [[12, -8], [14, -8]],
      [[0, -6], [0, -8], [2, -8]],
      [[22, -8], [24, -8], [24, -6]],
      [[10, -8], [12, -8]],
      [[0, 6], [0, 8]],
      [[12, -6], [12, -8]],
      [[12, 2], [12, 4]],
      [[24, 2], [24, 4]],
    ]
  },
  rechazabanda: {
    sitios: {
      g1: [0, 0, 0, { ref: { x: -5.92, y: -2 }, valor: { x: -7.84, y: -0.2 } }],
      r1: [8, -10, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      c1: [14, -6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo-derecha' } }],
      c2: [8, 8, 0, { ref: { x: 0, y: -5.2 }, valor: { x: 0, y: -3.4 } }],
      r2: [14, 12, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      r3: [20, -10, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r4: [20, 8, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r5: [36, -16, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      u1: [36, -2, 0, { ref: { x: 2.96, y: -5 }, valor: { x: 4.4, y: 5 } }],
      p1: [36, -8, 0],
      p2: [36, 4, 180],
      t1: [0, 8, 0],
      t2: [14, 0, 0],
      t3: [14, 18, 0],
      t4: [28, 2, 0],
    },
    cables: [
      [[16, -10], [14, -10]],
      [[0, -6], [0, -8]],
      [[32, -16], [28, -16], [28, -4]],
      [[14, 16], [14, 18]],
      [[24, 8], [26, 8], [26, -2], [28, -2], [28, -4]],
      [[12, 8], [14, 8]],
      [[24, -10], [26, -10], [26, -4], [28, -4]],
      [[0, -8], [0, -10], [4, -10]],
      [[12, -10], [14, -10]],
      [[4, 8], [4, -8], [0, -8]],
      [[30, 0], [28, 0], [28, 2]],
      [[0, 6], [0, 8]],
      [[36, -8], [36, -6]],
      [[14, 8], [16, 8]],
      [[14, -2], [14, 0]],
      [[36, 4], [36, 2]],
      [[40, -16], [44, -16], [44, -2], [42, -2]],
      [[28, -4], [30, -4]],
    ]
  },
  notch: {
    sitios: {
      g1: [0, 0, 0, { ref: { lugar: 'izquierda' }, valor: { lugar: 'izquierda' } }],
      r1: [16, -18, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r2: [40, -18, 0, { ref: { x: 0, y: -4.6 }, valor: { x: 0, y: -2.8 } }],
      c3: [34, -12, 90, { ref: { lugar: 'abajo-izquierda' }, valor: { lugar: 'abajo' } }],
      c4: [22, -12, 90, { ref: { lugar: 'abajo-izquierda' }, valor: { lugar: 'abajo' } }],
      c1: [16, 0, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      c2: [40, 0, 0, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      r3: [22, 6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      r4: [34, 6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      t1: [0, 8, 0],
      t2: [28, -6, 0],
      t3: [28, 12, 0],
    },
    cables: [
      [[22, -18], [24, -18]],
      [[22, 0], [24, 0]],
      [[20, -18], [22, -18]],
      [[24, 0], [34, 0]],
      [[0, 6], [0, 8]],
      [[34, 10], [34, 12], [28, 12]],
      [[0, -6], [0, -8]],
      [[22, -16], [22, -18]],
      [[36, -18], [34, -18]],
      [[34, -8], [34, -6], [28, -6]],
      [[22, 2], [22, 0]],
      [[0, -8], [0, -18], [12, -18]],
      [[44, -18], [46, -18], [46, 0], [44, 0]],
      [[20, 0], [22, 0]],
      [[34, 2], [34, 0]],
      [[22, -8], [22, -6], [28, -6]],
      [[34, -18], [24, -18]],
      [[12, 0], [6, 0], [6, -8], [0, -8]],
      [[34, -16], [34, -18]],
      [[22, 10], [22, 12], [28, 12]],
      [[34, 0], [36, 0]],
    ]
  },
  emisor: {
    sitios: {
      q1: [0, 0, 0, { ref: { x: 4.96, y: -1 }, valor: { x: 6.88, y: 1 } }],
      p1: [-8, -12, 0],
      p2: [4, -18, 0],
      r1: [-8, -6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      r2: [-8, 6, 90, { ref: { lugar: 'abajo' }, valor: { x: 2, y: 5.4 } }],
      rc: [4, -12, 90, { ref: { lugar: 'abajo' }, valor: { x: 2, y: 5.88 } }],
      re: [2, 12, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      ce: [10, 12, 90, { ref: { lugar: 'arriba' }, valor: { lugar: 'arriba' } }],
      c1: [-16, 0, 0, { ref: { lugar: 'arriba-izquierda' }, valor: { lugar: 'arriba-izquierda' } }],
      g1: [-24, 8, 0, { ref: { lugar: 'izquierda' }, valor: { lugar: 'izquierda' } }],
      c2: [10, -6, 0, { ref: { x: 0, y: -5.2 }, valor: { x: 0, y: -3.4 } }],
      rl: [16, 0, 90, { ref: { x: -0.9, y: -3.44 }, valor: { x: 0.9, y: -4.4 } }],
      t1: [-8, 12, 0],
      t2: [2, 20, 0],
      t3: [16, 6, 0],
      t4: [-24, 16, 0],
    },
    cables: [
      [[10, 8], [10, 6], [2, 6]],
      [[2, -4], [2, -6], [4, -6]],
      [[2, 6], [2, 8]],
      [[16, 4], [16, 6]],
      [[-12, 0], [-8, 0]],
      [[-24, 2], [-24, 0], [-20, 0]],
      [[2, 16], [2, 18]],
      [[-8, -2], [-8, 0]],
      [[-8, 2], [-8, 0]],
      [[2, 18], [2, 20]],
      [[-24, 14], [-24, 16]],
      [[2, 4], [2, 6]],
      [[10, 16], [10, 18], [2, 18]],
      [[4, -8], [4, -6]],
      [[-4, 0], [-8, 0]],
      [[4, -6], [6, -6]],
      [[-8, -12], [-8, -10]],
      [[4, -18], [4, -16]],
      [[14, -6], [16, -6], [16, -4]],
      [[-8, 10], [-8, 12]],
    ]
  },
  puente: {
    sitios: {
      v1: [0, 0, 270, { ref: { lugar: 'derecha' }, valor: { lugar: 'izquierda' } }],
      d1: [-6, -6, 270, { ref: { lugar: 'arriba' } }],
      d3: [-6, 6, 270, { ref: { lugar: 'arriba' } }],
      d2: [6, -6, 270, { ref: { lugar: 'arriba' } }],
      d4: [6, 6, 270, { ref: { lugar: 'arriba' } }],
      c1: [18, -6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      rl: [30, -6, 90, { ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } }],
      g1: [24, 0, 0],
      g2: [0, 12, 0],
    },
    cables: [
      [[-6, -2], [-6, 0]],
      [[18, -12], [18, -10]],
      [[6, 0], [6, -2]],
      [[6, -12], [6, -10]],
      [[30, -2], [30, 0], [24, 0]],
      [[-6, 10], [-6, 12], [0, 12]],
      [[-6, 0], [-6, 2]],
      [[30, -10], [30, -12], [18, -12]],
      [[4, 0], [6, 0]],
      [[6, 2], [6, 0]],
      [[-4, 0], [-6, 0]],
      [[-6, -10], [-6, -12], [6, -12]],
      [[18, -2], [18, 0], [24, 0]],
      [[6, -12], [18, -12]],
      [[6, 10], [6, 12], [0, 12]],
    ]
  },
}

/** Una pieza del circuito `id` en su sitio, con sus propiedades. */
export function parte(id: IdDisposicion, clave: string, tipo: string, props?: Record<string, string>): Parte {
  const s = DISPOSICION[id].sitios[clave]
  if (!s) throw new Error(`disposición ${id}: no hay sitio para ${clave}`)
  return [clave, tipo, s[0], s[1], s[2], props, s[3]]
}

/** Los cables del circuito `id` como puntos. */
export const cablesDe = (id: IdDisposicion): Punto[][] => DISPOSICION[id].cables.map((c) => c.map(([x, y]) => ({ x, y })))

/** Una etiqueta de red del acomodo: su nombre, el punto de un cable donde se une (un vértice o una punta) y hacia dónde apunta. */
export type EtiquetaSitio = readonly [nombre: string, x: number, y: number, rot: Rotacion]

/** Las redes de entrada y salida se llaman «Entrada» y «Salida» (el análisis de CA grafica las redes con nombre). Cada
 * etiqueta va sobre un vértice de cable, hacia fuera, sin mover nada. */
export const ETIQUETAS: Partial<Record<IdDisposicion, readonly EtiquetaSitio[]>> = {
  divisor: [['Entrada', 0, -6, 180], ['Salida', 12, -6, 0]],
  bajas: [['Entrada', 0, -8, 180], ['Salida', 16, -8, 0]],
  altas: [['Entrada', 0, -8, 180], ['Salida', 16, -8, 0]],
  inversor: [['Entrada', -20, -2, 180], ['Salida', 10, 0, 0]],
  noinversor: [['Entrada', -8, 2, 180], ['Salida', 10, 0, 0]],
  pasabanda: [['Entrada', 0, -8, 180], ['Salida', 24, -8, 0]],
  rechazabanda: [['Entrada', 0, -8, 180], ['Salida', 44, -2, 0]],
  notch: [['Entrada', 0, -8, 180], ['Salida', 46, 0, 0]],
  emisor: [['Entrada', -24, 0, 180], ['Salida', 16, -6, 0]]
}

/** Las etiquetas de red del circuito `id` (ninguna si no tiene entrada ni salida). */
export const etiquetasDe = (id: IdDisposicion): { nombre: string; x: number; y: number; rot: Rotacion }[] =>
  (ETIQUETAS[id] ?? []).map(([nombre, x, y, rot]) => ({ nombre, x, y, rot }))
