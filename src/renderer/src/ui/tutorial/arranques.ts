import { documentoVacio, type Documento, type Pieza, type Punto, type Rotacion } from '../../doc/tipos'

/* Circuitos de arranque de «Aprende Kirchi»: cada capítulo se puede hacer solo, así que parte de su propio circuito. Se escriben como documentos y `arranques.test.ts` comprueba que compilan. Tu primer circuito y Analizar y exportar trabajan en un documento nuevo. */
/* Geometría en unidades de 1.25 mm: fuente en (0, 0), resistencia en (16, -4), LED girado 90° en (32, 0) y tierra en (0, 12). */

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Rotacion = 0, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const cable = (d: Documento, id: string, ...pts: [number, number][]): void => {
  d.cables[id] = { id, puntos: pts.map(([x, y]): Punto => ({ x, y })) }
}

/** Fuente de 5 V, resistencia (ya cambiada a 1 kΩ), LED con el cátodo abajo y la tierra en el −. */
function circuitoBase(): Documento {
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

/** El documento con el que arranca un capítulo (el id de `CapituloDef`), o undefined si el capítulo parte de un lienzo vacío. */
export function arranqueDeCapitulo(id: string): Documento | undefined {
  switch (id) {
    // Conoce Kirchi y Medir parten del circuito de fuente, resistencia y LED ya armado.
    case 'conoce':
    case 'medir-senales':
      return circuitoBase()
    default:
      return undefined
  }
}
