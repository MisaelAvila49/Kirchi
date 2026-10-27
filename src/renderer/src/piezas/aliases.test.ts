// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { libreriaDePrueba } from '../prueba/libreria'

const lib = libreriaDePrueba().piezas
const ids = (q: string) => buscar(q, lib).map((r) => r.def.id)

describe('alias del buscador', () => {
  it('«bocina» ya no lleva al zumbador (una bocina es un altavoz)', () => {
    expect(ids('bocina')).not.toContain('zumbador')
  })

  it('«regulador» solo se encuentra como «regulador zener», nunca como alias suelto de otra cosa', () => {
    expect(lib.get('zener')!.buscar).not.toContain('regulador')
    expect(lib.get('zener')!.buscar).toContain('regulador zener')
    expect(ids('regulador zener')[0]).toBe('zener')
  })

  it('«u» (la letra de referencia) devuelve las compuertas, los biestables, el contador, el decodificador y los circuitos integrados, y nada más', () => {
    const r = ids('u')
    // El UJT entra por su id y el motor unipolar por su nombre, que empiezan con u (sus letras de referencia son Q y M).
    expect(new Set(r)).toEqual(
      new Set(['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'not-schmitt', 'buffer-3-estados', 'biestable-d', 'biestable-jk', 'contador', 'decodificador-7seg', 'amp-op', 'ina128', 'lm386', 'lm4040', 'tl431', 'comparador', 'regulador-ajustable', 'regulador-negativo', 'regulador-positivo', 'temporizador-555', 'uln2003', 'decodificador-138', 'decodificador-139', 'decodificador-7447', 'decodificador-4028', 'multiplexor-151', 'multiplexor-153', 'multiplexor-157', 'codificador-148', 'sumador-283', 'comparador-magnitud-85', 'bufer-244', 'transceptor-245', 'contador-161', 'contador-163', 'contador-190', 'contador-193', 'contador-4017', 'ujt', 'motor-pasos-unipolar'])
    )
  })

  it('«v 5» pone las fuentes de voltaje antes que el potenciómetro', () => {
    const r = ids('v 5')
    // El terminal de alimentación (vcc) también empieza con «v» y puede colarse entre las fuentes.
    expect(r.slice(0, 3).sort()).toEqual(['alimentacion', 'fuente-ac', 'fuente-dc'])
    if (r.includes('potenciometro')) expect(r.indexOf('potenciometro')).toBeGreaterThan(r.indexOf('fuente-ac'))
  })

  it('«resistencia variable» sigue encontrando el potenciómetro', () => {
    expect(ids('resistencia variable')[0]).toBe('potenciometro')
  })
})
