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
    ['temporizador-555', 'integrados', 'U', ['1@0,8', '2@-6,4', '3@6,-2', '4@2,-8', '5@6,4', '6@-6,0', '7@-6,-4', '8@-2,-8']],
    ['tl431', 'integrados', 'U', ['K@0,-6', 'A@0,6', 'REF@-6,0']],
    ['lm4040', 'integrados', 'U', ['K@0,-6', 'A@0,6']],
    ['ina128', 'integrados', 'U', ['IN-@-6,-2', 'IN+@-6,2', 'RG1@-2,-6', 'RG2@-2,6', 'REF@6,2', 'OUT@6,0', 'V+@2,-6', 'V-@2,6']],
    ['lm386', 'integrados', 'U', ['IN-@-6,-2', 'IN+@-6,2', 'GAIN1@-2,-6', 'GAIN8@-2,6', 'BYP@0,6', 'OUT@6,0', 'VS@2,-6', 'GND@2,6']],
    ['optoacoplador-4n25', 'integrados', 'U', ['A@-6,-2', 'K@-6,2', 'C@6,-2', 'E@6,2', 'B@2,-6']],
    ['optoacoplador-pc817', 'integrados', 'U', ['A@-6,-2', 'K@-6,2', 'C@6,-2', 'E@6,2']],
    ['l298', 'integrados', 'U', ['ENA@-8,-6', 'IN1@-8,-4', 'IN2@-8,-2', 'ENB@-8,2', 'IN3@-8,4', 'IN4@-8,6', 'OUT1@8,-6', 'OUT2@8,-4', 'SENSA@8,-2', 'SENSB@8,2', 'OUT3@8,4', 'OUT4@8,6', 'VS@-2,-10', 'VSS@2,-10', 'GND@0,10']]
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
    ['timer', 'temporizador-555'],
    ['tl431', 'tl431'],
    ['zener ajustable', 'tl431'],
    ['lm4040', 'lm4040'],
    ['referencia de voltaje', 'lm4040'],
    ['ina128', 'ina128'],
    ['instrumentación', 'ina128'],
    ['lm386', 'lm386'],
    ['amplificador de audio', 'lm386'],
    ['4n25', 'optoacoplador-4n25'],
    ['pc817', 'optoacoplador-pc817'],
    ['l298', 'l298'],
    ['puente h', 'l298'],
    ['driver de motor', 'l298']
  ] as const)('el buscador encuentra «%s» primero: %s', (q, id) => {
    expect(primero(q)).toBe(id)
  })

  it('el amplificador, el 555 y las piezas nuevas simulan', () => {
    const avisos = avisosDe(['amp-op', 'temporizador-555', 'tl431', 'lm4040', 'ina128', 'lm386', 'optoacoplador-4n25', 'optoacoplador-pc817', 'l298'])
    expect(avisos.some((t) => t.includes('modelo eléctrico'))).toBe(false)
  })

  it('los pines del 555 llevan su nombre y su número', () => {
    expect(lib.get('temporizador-555')!.pines.map((p) => p.nombre)).toEqual(['GND', 'disparo (TRIG)', 'salida (OUT)', 'reinicio (RESET)', 'control (CV)', 'umbral (THR)', 'descarga (DIS)', 'VCC'])
  })
})
