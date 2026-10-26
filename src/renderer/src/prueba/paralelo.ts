import { documentoVacio, type Documento } from '../doc/tipos'

/** 984 resistencias verticales en paralelo entre dos rieles, cada pin colgado de su riel por un cable corto. */
export function paralelo(n = 984): Documento {
  const d = documentoVacio()
  for (let k = 0; k < n; k++) {
    const x = 4 * k
    d.piezas[`r${k}`] = { id: `r${k}`, tipo: 'resistencia', ref: `R${k + 1}`, x, y: 8, rot: 90, espejo: false, props: { valor: '1k' } }
  }
  d.cables.arriba = { id: 'arriba', puntos: [{ x: 0, y: 4 }, { x: 4 * (n - 1), y: 4 }] }
  d.cables.abajo = { id: 'abajo', puntos: [{ x: 0, y: 12 }, { x: 4 * (n - 1), y: 12 }] }
  return d
}
