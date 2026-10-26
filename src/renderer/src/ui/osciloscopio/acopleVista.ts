import { FRECUENCIA_AC, type AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { BANDERA_VACIA } from './dibujar'

/**
 * Aviso por cada canal encendido que no está en DC: en AC un escalón se ve como pico que vuelve a cero. En DC no dice nada.
 */
export function notasDeAcople(a: AjustesOsciloscopio): string[] {
  return a.canales.flatMap((c) => {
    if (!c.on || c.acople === 'DC') return []
    if (c.acople === 'AC') return [`${c.canal} en AC: no muestra la parte continua (pasa lo que cambia más rápido que ${FRECUENCIA_AC} Hz), y un escalón se ve como un pico que vuelve a 0 V.`]
    return [`${c.canal} en GND: la entrada va a tierra y la traza queda en 0 V.`]
  })
}

/** Algún canal tiene otro acoplamiento que el de `antes`. */
export const acoplesDistintos = (a: AjustesOsciloscopio, antes: AjustesOsciloscopio): boolean => a.canales.some((c, i) => c.acople !== antes.canales[i]?.acople)

/**
 * Acoplamiento nuevo sobre lo capturado, en pausa. De DC a AC se quita el promedio, a GND va a 0 V. De AC o GND a DC no se puede recuperar la parte continua, así que el canal no cambia. A − B no se toca.
 */
export function acoplarVista(p: PantallaSab, antes: AjustesOsciloscopio, ahora: AjustesOsciloscopio): PantallaSab {
  const cambia = ahora.canales.map((c, i) => antes.canales[i]?.acople === 'DC' && c.acople !== 'DC')
  if (!cambia.some(Boolean)) return p
  const columnas = p.columnas.slice()
  for (let c = 0; c < Math.min(CANALES_PANTALLA, cambia.length); c++) {
    if (!cambia[c]) continue
    const o = (i: number) => (c * p.ncol + i) * CIFRAS_COLUMNA
    const gnd = ahora.canales[c].acople === 'GND'
    let suma = 0
    let n = 0
    for (let i = 0; i < p.ncol; i++) {
      if (columnas[o(i) + 4] & BANDERA_VACIA) continue
      suma += 0.5 * (columnas[o(i) + 2] + columnas[o(i) + 3])
      n++
    }
    const media = gnd || n === 0 ? 0 : suma / n
    for (let i = 0; i < p.ncol; i++) {
      const q = o(i)
      if (columnas[q + 4] & BANDERA_VACIA) continue
      if (gnd) columnas.set([0, 0, 0, 0], q)
      else for (let k = 0; k < 4; k++) columnas[q + k] -= media
    }
  }
  return { ...p, columnas }
}
