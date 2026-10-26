import { documentoVacio, type Documento, type Rotacion } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'

/** Generador congruencial con semilla fija: la misma semilla da siempre la misma serie en [0, 1). */
export function azarConSemilla(semilla: number): () => number {
  let s = semilla >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

/** Tipos que se sortean, en orden fijo: una pieza nueva en `componentes/` no cambia los circuitos de una semilla.
 * «no-existe» prueba la pieza desconocida. */
const TIPOS = [
  'and', 'nand', 'nor', 'not', 'or', 'xor', 'motor-dc', 'rele', 'alimentacion', 'bateria', 'fuente-ac', 'fuente-corriente', 'fuente-dc',
  'fuente-pulso', 'tierra', 'display-7seg', 'foco', 'zumbador', 'amp-op', 'temporizador-555', 'boton', 'interruptor', 'capacitor',
  'fusible', 'inductor', 'potenciometro', 'resistencia', 'diodo', 'led', 'mosfet-n', 'mosfet-p', 'npn', 'pnp', 'zener', 'no-existe'
]
const ROTACIONES: Rotacion[] = [0, 90, 180, 270]
const LIM = 2 ** 20

/** Circuito de prueba sorteado con semilla: piezas de todos los tipos, giradas, reflejadas y a veces encimadas, con cables
 * en L, etiquetas y notas; algunas semillas agregan cables de punta a punta (±2^20) o una pieza muy lejos. Compara dos
 * versiones de una función en casos apretados. */
export function circuitoAlAzar(semilla: number, lib: Map<string, PiezaDef>): Documento {
  const azar = azarConSemilla(semilla)
  const entero = (n: number) => Math.floor(azar() * n)
  const elegir = <T>(xs: readonly T[]): T => xs[entero(xs.length)]
  const d = documentoVacio()
  const n = 5 + entero(70)
  // Lado del área en pasos de 2 unidades: de muy apretado a holgado.
  const lado = Math.max(4, Math.ceil(Math.sqrt(n) * (2 + entero(6))))
  const punto = () => ({ x: 2 * entero(lado), y: 2 * entero(lado) })
  for (let i = 0; i < n; i++) {
    const tipo = elegir(TIPOS)
    const def = lib.get(tipo)
    const props: Record<string, string> = {}
    for (const pr of def?.props ?? []) {
      if (azar() < 0.4) continue
      if (pr.opciones) props[pr.id] = elegir(pr.opciones)
      else if (pr.texto) props[pr.id] = elegir(['VCC', '+5V', '', '   ', 'NOMBRE_MUY_LARGO_DE_ALIMENTACION_1'])
      else props[pr.id] = elegir([...(pr.comunes ?? []), pr.defecto, '4k7', '2.2u', '100n', '1M', 'abc', '', '-3.3'])
    }
    const ref = azar() < 0.06 ? '' : azar() < 0.1 ? `${def?.prefijo ?? 'X'}_LARGA_${i}` : `${def?.prefijo ?? 'X'}${i + 1}`
    const lejos = semilla % 13 === 0 && i === 0
    const { x, y } = lejos ? { x: LIM / 2, y: -LIM / 2 } : punto()
    d.piezas[`p${String(i).padStart(3, '0')}`] = { id: `p${String(i).padStart(3, '0')}`, tipo, ref, x, y, rot: elegir(ROTACIONES), espejo: azar() < 0.3, props }
  }
  const nCables = entero(n + 5)
  for (let i = 0; i < nCables; i++) {
    let { x, y } = punto()
    const puntos = [{ x, y }]
    const tramos = 1 + entero(4)
    for (let k = 0; k < tramos; k++) {
      const paso = 2 * (1 + entero(8)) * (azar() < 0.5 ? -1 : 1)
      if (k % 2 === 0) x += paso
      else y += paso
      puntos.push({ x, y })
    }
    d.cables[`c${i}`] = { id: `c${i}`, puntos }
  }
  if (semilla % 7 === 0) d.cables.largo = { id: 'largo', puntos: [{ x: -LIM, y: 2 * entero(lado) + 1 }, { x: LIM, y: 2 * entero(lado) + 1 }] }
  if (semilla % 11 === 0) d.cables.diagonal = { id: 'diagonal', puntos: [{ x: -LIM, y: -LIM }, { x: LIM, y: LIM }] }
  const nEtiquetas = entero(8)
  for (let i = 0; i < nEtiquetas; i++) {
    const { x, y } = punto()
    d.etiquetas[`e${i}`] = {
      id: `e${i}`, nombre: elegir(['VSAL', 'N1', '', 'RED_LARGA_123', 'Ω']), x, y, rot: elegir(ROTACIONES),
      ...(azar() < 0.4 ? { formato: { tam: elegir([1, 2, 3.5, 6]) } } : {})
    }
  }
  const nNotas = entero(4)
  for (let i = 0; i < nNotas; i++) {
    const { x, y } = punto()
    d.notas[`n${i}`] = { id: `n${i}`, x, y, ancho: 8 + entero(30), texto: elegir(['Nota', 'Medir entre VSAL y tierra sin carga.', '']) }
  }
  return d
}
