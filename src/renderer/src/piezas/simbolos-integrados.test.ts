// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { avisosDelCircuito } from '../ui/proyecto'

const lib = libreriaDePrueba().piezas
/** «id@x,y» de cada pin, en orden. */
const pines = (id: string) => lib.get(id)!.pines.map((p) => `${p.id}@${p.x},${p.y}`)
const primero = (q: string) => buscar(q, lib)[0]?.def.id
/** Avisos de un esquema con una pieza de cada tipo, separadas 30 unidades. */
function avisosDe(tipos: string[]): string[] {
  const d = documentoVacio()
  tipos.forEach((tipo, i) => (d.piezas[`p${i}`] = { id: `p${i}`, tipo, ref: `X${i + 1}`, x: i * 30, y: 0, rot: 0, espejo: false, props: {} }))
  return avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)
}

describe('circuitos integrados', () => {
  it.each([
    ['amp-op', 'integrados', 'U', ['-@-6,-2', '+@-6,2', 'OUT@6,0', 'V+@0,-4', 'V-@0,4']],
    ['temporizador-555', 'integrados', 'U', ['1@0,8', '2@-6,4', '3@6,-2', '4@2,-8', '5@6,4', '6@-6,0', '7@-6,-4', '8@-2,-8']]
  ] as const)('%s: categoría %s, prefijo %s y pines', (id, categoria, prefijo, esperados) => {
    const def = lib.get(id)
    expect(def, id).toBeDefined()
    expect(def).toMatchObject({ categoria, prefijo })
    expect(pines(id)).toEqual(esperados)
  })

  it.each([
    ['op', 'amp-op'],
    ['opamp', 'amp-op'],
    ['741', 'amp-op'],
    ['555', 'temporizador-555'],
    ['ne555', 'temporizador-555'],
    ['timer', 'temporizador-555']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('el amplificador y el 555 simulan', () => {
    const avisos = avisosDe(['amp-op', 'temporizador-555'])
    expect(avisos.some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('los pines del 555 llevan su nombre y su número', () => {
    expect(lib.get('temporizador-555')!.pines.map((p) => p.nombre)).toEqual(['GND', 'disparo (TRIG)', 'salida (OUT)', 'reinicio (RESET)', 'control (CV)', 'umbral (THR)', 'descarga (DIS)', 'VCC'])
  })
})
