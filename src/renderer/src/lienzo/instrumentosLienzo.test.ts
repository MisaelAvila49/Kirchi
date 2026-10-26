// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { EscritorTrazos } from './buffers'
import { textosDeInstrumentos, type InstrumentosLienzo } from './instrumentosLienzo'
import { paletaDeTema } from './paleta'

const lib = libreriaDePrueba().piezas

describe('los instrumentos en el lienzo al simular', () => {
  const d = conEtiquetas(lib, [
    { tipo: 'multimetro', ref: 'XMM1', props: {}, pines: { '+': 'a', COM: '0' } },
    { tipo: 'fuente-variable', ref: 'XPS1', props: {}, pines: { '+': 'a', '-': '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: {}, pines: { A: 'a', B: 'a', C: '0', D: '0' } }
  ])
  const l: Lectura = { t: 1, ratio: 1, redes: new Map(), piezas: new Map([['p_1', { v: 5, i: 0.012, p: -0.06, extra: { tipo: 'fuente-variable', modo: 'CV' } }]]) }
  const inst: InstrumentosLienzo = {
    multimetros: new Map([['p_0', { texto: '2.381 V', fundido: false }]]),
    osciloscopios: new Map([['p_2', [true, true, false, false]]]),
    canales: { A: [0, 0.5, 0.4, 1], B: [0.2, 0.4, 0.7, 1], C: [0.6, 0.4, 0.1, 1], D: [0.5, 0.3, 0.5, 1] }
  }

  it('la cifra del multímetro a la izquierda de su símbolo; la fuente con V, I y su modo', () => {
    const t = new EscritorTrazos()
    const textos = textosDeInstrumentos(t, d, lib, l, inst, paletaDeTema('claro', 'verde'))
    const mm = textos.find((x) => x.texto === '2.381 V')!
    expect(mm.alinear).toBe('der')
    expect(mm.fuente).toBe('cifras')
    expect(mm.x).toBeLessThan(d.piezas.p_0.x - 3)
    expect(textos.some((x) => x.texto === '5.00 V · 12.0 mA · CV')).toBe(true)
  })

  it('un trazo en el color de cada canal encendido del osciloscopio', () => {
    const t = new EscritorTrazos()
    textosDeInstrumentos(t, d, lib, l, inst, paletaDeTema('claro', 'verde'))
    expect(t.cuenta).toBe(2)
  })

  it('un multímetro fundido dice «fundido» en rojo', () => {
    const t = new EscritorTrazos()
    const f = { ...inst, multimetros: new Map([['p_0', { texto: '0.000 A', fundido: true }]]) }
    const textos = textosDeInstrumentos(t, d, lib, l, f, paletaDeTema('claro', 'verde'))
    expect(textos.find((x) => x.texto === 'fusible fundido')?.color).toBe('invalido')
  })
})
