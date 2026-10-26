// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { svgAGeometria } from '../piezas/svg'
import { libreriaDePrueba } from '../prueba/libreria'
import { FLOTANTES_TRAZO } from './buffers'
import { desplazamientoCursor, rellenosConCodo, trazoConCodo } from './capas'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props })
const doc = (p: Pieza): Documento => {
  const d = documentoVacio()
  d.piezas[p.id] = p
  return d
}
/** Los segmentos de la escena de una pieza, redondeados y ordenados (el orden de los trazos no se ve). */
const segmentos = (p: Pieza, simulando = false): string[] => {
  const d = doc(p)
  const e = construirEscena(d, lib, calcularConexiones(d, lib), PALETA_CLARA, { simulando })
  const out: string[] = []
  for (let i = 0; i < e.nTrazos; i++) {
    const s = Array.from(e.trazos.subarray(i * FLOTANTES_TRAZO, i * FLOTANTES_TRAZO + 4)).map((v) => v.toFixed(4))
    // Un segmento es el mismo en los dos sentidos.
    out.push(s[0] + s[1] < s[2] + s[3] ? s.join(',') : [s[2], s[3], s[0], s[1]].join(','))
  }
  return out.sort()
}
const deGeometria = (svg: string): string[] =>
  svgAGeometria(svg)
    .trazos.flatMap((l) => l.slice(0, -2).map((_, i) => (i % 2 ? null : [l[i], l[i + 1], l[i + 2], l[i + 3]])).filter((x): x is number[] => x !== null))
    .map((s) => s.map((v) => v.toFixed(4)))
    .map((s) => (s[0] + s[1] < s[2] + s[3] ? s.join(',') : [s[2], s[3], s[0], s[1]].join(',')))
    .sort()

/** El símbolo del potenciómetro de antes, sin capas: al 50 % la escena debe dar los mismos segmentos. */
const POT_DE_ANTES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 10 10" fill="none" stroke="currentColor">
  <path d="M-4 0 H-2.5 l0.4 -1 l0.7 2 l0.7 -2 l0.7 2 l0.7 -2 l0.7 2 l0.7 -2 l0.4 1 H4 M0 -4 V-1.9"/><polygon fill="currentColor" points="-0.5,-1.9 0.5,-1.9 0,-1.1"/>
</svg>`

describe('capas de los símbolos en la escena', () => {
  it('la flecha del potenciómetro se corre con su posición: 0 % a la izquierda (el extremo de la netlist), 100 % a la derecha', () => {
    const def = lib.get('potenciometro')!
    expect(desplazamientoCursor(def, pieza('potenciometro'))).toBe(0)
    expect(desplazamientoCursor(def, pieza('potenciometro', { posicion: '0 %' }))).toBe(-2.5)
    expect(desplazamientoCursor(def, pieza('potenciometro', { posicion: '100 %' }))).toBe(2.5)
    expect(desplazamientoCursor(def, pieza('potenciometro', { posicion: '25 %' }))).toBe(-1.25)
  })

  it('al 50 % el potenciómetro se dibuja con los mismos segmentos de antes de las capas', () => {
    // Los segmentos del cuerpo, sin la flecha rellena (los triángulos van aparte).
    expect(segmentos(pieza('potenciometro'))).toEqual(deGeometria(POT_DE_ANTES))
  })

  it('el codo: lo de arriba no se mueve, la línea cruza el cuerpo en horizontal y baja a la flecha corrida', () => {
    expect(trazoConCodo([0, -4, 0, -1.9], -3, -1.25)).toEqual([0, -4, 0, -3, -1.25, -3, -1.25, -1.9])
    expect(trazoConCodo([0, -4, 0, -1.9], -3, 0)).toEqual([0, -4, 0, -1.9])
    expect(rellenosConCodo([-0.5, -1.9, 0.5, -1.9, 0, -1.1], -3, 2)).toEqual([1.5, -1.9, 2.5, -1.9, 2, -1.1])
    // Al 25 % la escena trae el tramo horizontal del codo.
    expect(segmentos(pieza('potenciometro', { posicion: '25 %' }))).toContain('-1.2500,-3.0000,0.0000,-3.0000')
  })

  it('al simular, el rotor del motor y la armadura del relé salen de la escena (los dibuja la capa de movimiento); al editar, en reposo', () => {
    const motor = segmentos(pieza('motor-dc'))
    const motorSim = segmentos(pieza('motor-dc'), true)
    expect(motor.length - motorSim.length).toBe(3)
    const rele = segmentos(pieza('rele'))
    expect(rele).toContain('0.0000,-1.2000,2.0000,1.0000')
    expect(segmentos(pieza('rele'), true)).not.toContain('0.0000,-1.2000,2.0000,1.0000')
    // El potenciómetro conserva su flecha al simular.
    expect(segmentos(pieza('potenciometro'), true)).toEqual(segmentos(pieza('potenciometro')))
  })

  it('la caja del cuerpo y el símbolo de la Librería siguen siendo los de siempre (con las capas en reposo)', () => {
    const def = lib.get('potenciometro')!
    expect(def.geometria.fija).toBeDefined()
    const cursor = def.geometria.capas!.cursor
    expect(cursor.trazos.length).toBe(2)
    expect(def.geometria.trazos.length).toBe(def.geometria.fija!.trazos.length + cursor.trazos.length)
    expect(def.geometria.rellenos.length).toBe(def.geometria.fija!.rellenos.length + 6)
  })
})
