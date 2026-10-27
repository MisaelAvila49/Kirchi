// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Pieza } from '../doc/tipos'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { construirCapaSim } from './capaSim'
import { resistenciaDeLdr, resistenciaDeTermistor } from './ajusteEnPieza'
import { textoDeValor } from './etiquetas'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const de = (tipo: string, props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props }) as Pieza
const valor = (tipo: string, props?: Record<string, string>) => textoDeValor(de(tipo, props), lib.get(tipo)!)

describe('ajuste junto al valor, con el documento', () => {
  it('cada pieza dice por omisión lo que pidió el usuario', () => {
    expect(valor('potenciometro')).toBe('10 kΩ · 50 %')
    expect(valor('reostato')).toBe('10 kΩ · 50 %')
    expect(valor('ntc')).toBe('25 °C · 10 kΩ')
    expect(valor('ptc')).toBe('25 °C · 2.21 kΩ')
    expect(valor('ldr', { luz: '100 lx' })).toMatch(/^100 lx · 3\.\d+ kΩ$/)
    expect(valor('lm35')).toBe('25 °C')
    expect(valor('tmp36')).toBe('25 °C')
  })

  it('cada opción de «Mostrar» escribe lo suyo', () => {
    expect(valor('ntc', { junto: 'Nada' })).toBeNull()
    expect(valor('ntc', { junto: 'Ajuste', temperatura: '85 °C' })).toBe('85 °C')
    expect(valor('ntc', { junto: 'Resistencia' })).toBe('10 kΩ')
    expect(valor('ntc', { junto: 'Ambos', temperatura: '85 °C' })).toBe('85 °C · 1.07 kΩ')
    expect(valor('potenciometro', { junto: 'Nada' })).toBe('10 kΩ')
    expect(valor('potenciometro', { junto: 'Resistencia', posicion: '25 %' })).toBe('10 kΩ · 2.5 kΩ | 7.5 kΩ')
    expect(valor('potenciometro', { junto: 'Ambos', posicion: '25 %' })).toBe('10 kΩ · 25 % · 2.5 kΩ | 7.5 kΩ')
    expect(valor('reostato', { junto: 'Resistencia', posicion: '25 %' })).toBe('10 kΩ · 2.5 kΩ')
    expect(valor('lm35', { junto: 'Nada' })).toBeNull()
  })

  it('las secciones del potenciómetro siguen su ley', () => {
    // 25 % del giro: lineal 25 %; logarítmica 0.3 · 0.25 = 7.5 %; antilogarítmica 1 − (0.15 + 1.7 · 0.25) = 42.5 %.
    const r = (ley: string) => valor('potenciometro', { junto: 'Resistencia', posicion: '25 %', ley })
    expect(r('lineal')).toBe('10 kΩ · 2.5 kΩ | 7.5 kΩ')
    expect(r('logarítmica')).toBe('10 kΩ · 750 Ω | 9.25 kΩ')
    expect(r('antilogarítmica')).toBe('10 kΩ · 4.25 kΩ | 5.75 kΩ')
    // En un extremo ningún tramo baja del mínimo del motor (10 Ω con 10 kΩ de total, como el netlist).
    expect(valor('potenciometro', { junto: 'Resistencia', posicion: '0 %' })).toBe('10 kΩ · 10 Ω | 10 kΩ')
  })

  it('una pieza sin la opción se dibuja como siempre', () => {
    expect(valor('resistencia')).toBe('1 kΩ')
    expect(valor('capacitor')).toBe(textoDeValor(de('capacitor'), lib.get('capacitor')!))
  })

  it('la resistencia de un termistor y de una fotorresistencia sale de su modelo', () => {
    const m = lib.get('ntc')!.modelo as Parameters<typeof resistenciaDeTermistor>[0]
    expect(resistenciaDeTermistor(m, '10 kΩ', 25)).toBeCloseTo(10000, 3)
    expect(resistenciaDeTermistor(m, 'Arranque 5 Ω', 25)).toBeCloseTo(5, 6)
    const l = lib.get('ldr')!.modelo as Parameters<typeof resistenciaDeLdr>[0]
    expect(resistenciaDeLdr(l, 'GL5528', 10)).toBeCloseTo(14142, 3)
    expect(resistenciaDeLdr(l, 'GL5528', 0)).toBeCloseTo(1e6, 0)
  })
})

describe('resistencia en vivo al simular', () => {
  const doc = conEtiquetas(lib, [{ tipo: 'ntc', ref: 'RT1', pines: { '1': 'a', '2': '0' } }])
  const id = Object.keys(doc.piezas).find((k) => doc.piezas[k].tipo === 'ntc')!
  const con = calcularConexiones(doc, lib)
  const lectura = (temperatura: number): Lectura => ({ t: 0, ratio: 1, redes: new Map(), piezas: new Map([[id, { i: 0, v: 0, p: 0, extra: { tipo: 'termistor', temperatura } }]]) })

  it('la escena deja lo fijo y la capa escribe la resistencia del motor tras él', () => {
    const quieta = construirEscena(doc, lib, con, PALETA_CLARA)
    expect(quieta.textos.some((t) => t.texto === '25 °C · 10 kΩ')).toBe(true)
    const esc = construirEscena(doc, lib, con, PALETA_CLARA, { simulando: true })
    const fijo = esc.textos.find((t) => t.vivo)!
    expect(fijo.texto).toBe('25 °C · ')
    expect(esc.textos.some((t) => t.texto === '25 °C · 10 kΩ')).toBe(false)
    const caliente = construirCapaSim(doc, lib, con, lectura(85), 5, PALETA_CLARA, undefined, null, esc.textos).textos.find((t) => t.texto.endsWith('Ω') && t.x > fijo.x)!
    expect(caliente.texto).toBe('1.07 kΩ')
    expect(caliente.x).toBeGreaterThan(fijo.x)
    expect(caliente.y).toBe(fijo.y)
    const fria = construirCapaSim(doc, lib, con, lectura(-10), 5, PALETA_CLARA, undefined, null, esc.textos).textos.find((t) => t.texto.endsWith('Ω') && t.x > fijo.x)!
    expect(fria.texto).toBe('55 kΩ')
  })
})
