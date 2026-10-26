import { documentoVacio, type Documento } from '../doc/tipos'

/** n resistencias en cuadrícula con un cable en L cada una; la usa la sonda e2e para medir cuadros y memoria. */
export function documentoDemo(n: number): Documento {
  const d = documentoVacio()
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 20, y = Math.floor(i / cols) * 20
    d.piezas[`p${i}`] = { id: `p${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x, y, rot: 0, espejo: false, props: { valor: '1k' } }
    d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
  }
  return d
}
