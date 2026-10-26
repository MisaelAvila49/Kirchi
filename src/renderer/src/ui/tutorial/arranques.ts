import { documentoVacio, type Documento, type Nota, type Pieza, type Punto, type Rotacion, type Sonda } from '../../doc/tipos'

/* Circuitos de arranque de «Aprende Kirchi»: cada capítulo del 2 al 5 empieza con el circuito que deja el anterior. Se escriben como documentos y `arranques.test.ts` comprueba que compilan. El capítulo 1 trabaja en un documento nuevo. */
/* Geometría en unidades de 1.25 mm: fuente en (0, 0), resistencia en (16, -4), LED girado 90° en (32, 0) y tierra en (0, 12). */

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Rotacion = 0, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const cable = (d: Documento, id: string, ...pts: [number, number][]): void => {
  d.cables[id] = { id, puntos: pts.map(([x, y]): Punto => ({ x, y })) }
}
const sonda = (d: Documento, s: Sonda): void => {
  d.sondas = { ...(d.sondas ?? {}), [s.id]: s }
}

/** Lo que deja el capítulo 1: fuente de 5 V, resistencia (ya cambiada a 1 kΩ), LED con el cátodo abajo y la tierra en el −. */
function circuitoDelCapitulo1(): Documento {
  const d = documentoVacio()
  for (const p of [
    pieza('v', 'fuente-dc', 'V1', 0, 0),
    pieza('r', 'resistencia', 'R1', 16, -4, 0, { valor: '1k' }),
    pieza('d', 'led', 'D1', 32, 0, 90, { color: 'rojo' }),
    pieza('g', 'tierra', 'GND1', 0, 12)
  ])
    d.piezas[p.id] = p
  cable(d, 'c1', [0, -4], [12, -4])
  cable(d, 'c2', [20, -4], [32, -4])
  cable(d, 'c3', [32, 4], [0, 4])
  cable(d, 'c4', [0, 4], [0, 12])
  return d
}

/**
 * Lo que deja el capítulo 2: el circuito con un multímetro en V DC entre resistencia y LED y otro en serie en A DC.
 */
function circuitoDelCapitulo2(): Documento {
  const d = circuitoDelCapitulo1()
  // En serie, partiendo el cable de abajo (de 32 unidades): el + hacia el LED y el COM hacia la fuente.
  d.piezas.m2 = pieza('m2', 'multimetro', 'XMM2', 16, 4, 90, { modo: 'A DC' })
  d.cables.c3 = { id: 'c3', puntos: [{ x: 32, y: 4 }, { x: 22, y: 4 }] }
  cable(d, 'c6', [10, 4], [0, 4])
  // El de voltaje, a la derecha del LED, con la tierra bajo su COM y la sonda sobre el cable entre la resistencia y el LED.
  d.piezas.m1 = pieza('m1', 'multimetro', 'XMM1', 52, 0, 0, { modo: 'V DC' })
  d.piezas.g2 = pieza('g2', 'tierra', 'GND2', 52, 12)
  cable(d, 'c5', [52, 6], [52, 12])
  sonda(d, { id: 's1', tipo: 'multimetro', x: 26, y: -4, instrumento: 'm1', entrada: '+' })
  return d
}

/**
 * Lo que deja el capítulo 3: generador cuadrado de 1 Hz, capacitor de 100 µF y osciloscopio con el canal A en el generador y el B en el capacitor.
 */
function circuitoDelCapitulo3(): Documento {
  const d = circuitoDelCapitulo2()
  delete d.piezas.v
  // Arriba de donde estaba la fuente y girado 180°: su salida toca el extremo del cable de la resistencia y el COM, que queda
  // arriba, baja a la tierra por la izquierda.
  d.piezas.xfg = pieza('xfg', 'generador', 'XFG1', 0, -10, 180, { forma: 'Cuadrada', frecuencia: '1' })
  cable(d, 'w2', [0, -16], [-6, -16], [-6, 12], [0, 12])
  d.piezas.c = pieza('c', 'capacitor', 'C1', 40, 0, 90, { valor: '100u' })
  cable(d, 'k1', [32, -4], [40, -4])
  cable(d, 'k2', [40, 4], [40, 12], [0, 12])
  d.piezas.xsc = pieza('xsc', 'osciloscopio', 'XSC1', 28, 24)
  sonda(d, { id: 'sa', tipo: 'osciloscopio', x: 6, y: -4, instrumento: 'xsc', entrada: 'A' })
  sonda(d, { id: 'sb', tipo: 'osciloscopio', x: 40, y: -4, instrumento: 'xsc', entrada: 'B' })
  return d
}

const nota = (id: string, x: number, y: number, ancho: number, texto: string): Nota => ({ id, x, y, ancho, texto })

/** El capítulo 4 no cambia el circuito; el 5 trae además una nota para mover con Alt. */
function circuitoDelCapitulo4(): Documento {
  return circuitoDelCapitulo3()
}
function circuitoDelCapitulo5(): Documento {
  const d = circuitoDelCapitulo4()
  d.notas.n1 = nota('n1', 0, -22, 24, 'Muévela con Alt')
  return d
}

/** El documento con el que arranca un capítulo (el id de `CapituloDef`), o undefined si el capítulo no tiene arranque. */
export function arranqueDeCapitulo(id: string): Documento | undefined {
  switch (id) {
    case 'medir':
      return circuitoDelCapitulo1()
    case 'senales':
      return circuitoDelCapitulo2()
    case 'archivo':
      return circuitoDelCapitulo3()
    case 'trucos':
      return circuitoDelCapitulo5()
    default:
      return undefined
  }
}
