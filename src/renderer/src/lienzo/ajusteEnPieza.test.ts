// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Pieza } from '../doc/tipos'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { construirCapaSim } from './capaSim'
import { ponerTextoAjuste, resistenciaDeLdr, resistenciaDeTermistor } from './ajusteEnPieza'
import { textoDeValor, textosLocales } from './etiquetas'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const de = (tipo: string, props: Record<string, string> = {}): Pieza => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props }) as Pieza
const valor = (tipo: string, props?: Record<string, string>) => textoDeValor(de(tipo, props), lib.get(tipo)!)
/** Lo que dice el recuadro del ajuste, aparte del valor. */
const ajuste = (tipo: string, props?: Record<string, string>) => textosLocales(de(tipo, props), lib.get(tipo)!).find((t) => t.cual === 'ajuste')?.texto ?? null

afterEach(() => ponerTextoAjuste('Valores'))

describe('el valor y el ajuste son dos recuadros', () => {
  it('el valor conserva su recuadro de siempre y el ajuste dice por omisión los valores', () => {
    expect(valor('potenciometro')).toBe('10 kΩ')
    expect(ajuste('potenciometro')).toBe('5 kΩ | 5 kΩ')
    expect(valor('reostato')).toBe('10 kΩ')
    expect(ajuste('reostato')).toBe('5 kΩ')
    expect(valor('ntc')).toBe('10 kΩ')
    expect(valor('ptc')).toBe('B59339A1202P020')
    expect(valor('ldr')).toBe('GL5528')
    expect(ajuste('ntc')).toBe('10 kΩ')
    expect(ajuste('ptc')).toBe('2.21 kΩ')
    expect(ajuste('ldr', { luz: '100 lx' })).toMatch(/^3\.\d+ kΩ$/)
    // El LM35 y el TMP36 no tienen resistencia que ver: su ajuste es la temperatura.
    expect(valor('lm35')).toBe('LM35DZ')
    expect(ajuste('lm35')).toBe('25 °C')
    expect(ajuste('tmp36')).toBe('25 °C')
  })

  it('el recuadro del valor de un termistor y de la fotorresistencia lleva su modelo, nunca vacío', () => {
    expect(valor('ntc', { modelo: '100 kΩ' })).toBe('100 kΩ')
    expect(valor('ldr', { modelo: 'GL5539' })).toBe('GL5539')
    for (const tipo of ['ntc', 'ptc', 'ldr', 'lm35', 'tmp36']) for (const junto of ['Nada', 'Ajuste', 'Valores', 'Ambos']) expect(valor(tipo, { junto }), `${tipo} ${junto}`).toBeTruthy()
  })

  it('el recuadro del valor no cambia con el ajuste', () => {
    for (const junto of ['Nada', 'Ajuste', 'Valores', 'Ambos']) expect(valor('potenciometro', { junto, posicion: '25 %' })).toBe('10 kΩ')
    expect(valor('lm35', { junto: 'Nada' })).toBe('LM35DZ')
  })

  it('cada opción de «Mostrar» escribe lo suyo en el recuadro del ajuste', () => {
    expect(ajuste('ntc', { junto: 'Nada' })).toBeNull()
    expect(ajuste('ntc', { junto: 'Ajuste', temperatura: '85 °C' })).toBe('85 °C')
    expect(ajuste('ntc', { junto: 'Valores' })).toBe('10 kΩ')
    expect(ajuste('ntc', { junto: 'Ambos', temperatura: '85 °C' })).toBe('85 °C · 1.07 kΩ')
    expect(ajuste('potenciometro', { junto: 'Nada' })).toBeNull()
    expect(ajuste('potenciometro', { junto: 'Ajuste', posicion: '25 %' })).toBe('25 %')
    expect(ajuste('potenciometro', { junto: 'Valores', posicion: '25 %' })).toBe('2.5 kΩ | 7.5 kΩ')
    expect(ajuste('potenciometro', { junto: 'Ambos', posicion: '25 %' })).toBe('25 % · 2.5 kΩ | 7.5 kΩ')
    expect(ajuste('reostato', { junto: 'Valores', posicion: '25 %' })).toBe('2.5 kΩ')
    expect(ajuste('lm35', { junto: 'Nada' })).toBeNull()
    expect(ajuste('lm35', { junto: 'Ajuste', temperatura: '40 °C' })).toBe('40 °C')
  })

  it('un archivo de la 2.0 con la opción «Resistencia» se lee como «Valores»', () => {
    expect(ajuste('potenciometro', { junto: 'Resistencia', posicion: '25 %' })).toBe('2.5 kΩ | 7.5 kΩ')
  })

  it('Configuración manda mientras la pieza diga «Como en Configuración» y la opción de la pieza manda sobre ella', () => {
    const pot = { posicion: '25 %' }
    ponerTextoAjuste('Ajuste')
    expect(ajuste('potenciometro', pot)).toBe('25 %')
    expect(ajuste('ntc', { temperatura: '85 °C' })).toBe('85 °C')
    expect(ajuste('lm35')).toBe('25 °C')
    ponerTextoAjuste('Ambos')
    expect(ajuste('potenciometro', pot)).toBe('25 % · 2.5 kΩ | 7.5 kΩ')
    expect(ajuste('lm35')).toBe('25 °C')
    ponerTextoAjuste('Nada')
    expect(ajuste('potenciometro', pot)).toBeNull()
    expect(ajuste('lm35')).toBeNull()
    // La pieza que pide otra cosa no sigue a Configuración.
    expect(ajuste('potenciometro', { ...pot, junto: 'Ajuste' })).toBe('25 %')
    ponerTextoAjuste('Ajuste')
    expect(ajuste('potenciometro', { ...pot, junto: 'Valores' })).toBe('2.5 kΩ | 7.5 kΩ')
    expect(ajuste('potenciometro', { ...pot, junto: 'Nada' })).toBeNull()
  })

  it('las secciones del potenciómetro siguen su ley', () => {
    // 25 % del giro: lineal 25 %; logarítmica 0.3 · 0.25 = 7.5 %; antilogarítmica 1 − (0.15 + 1.7 · 0.25) = 42.5 %.
    const r = (ley: string) => ajuste('potenciometro', { junto: 'Valores', posicion: '25 %', ley })
    expect(r('lineal')).toBe('2.5 kΩ | 7.5 kΩ')
    expect(r('logarítmica')).toBe('750 Ω | 9.25 kΩ')
    expect(r('antilogarítmica')).toBe('4.25 kΩ | 5.75 kΩ')
    // En un extremo ningún tramo baja del mínimo del motor (10 Ω con 10 kΩ de total, como el netlist).
    expect(ajuste('potenciometro', { junto: 'Valores', posicion: '0 %' })).toBe('10 Ω | 10 kΩ')
  })

  it('el ajuste va después de la referencia y del valor, y sin ajuste la pieza queda como antes', () => {
    const cuales = (tipo: string, props?: Record<string, string>) => textosLocales(de(tipo, props), lib.get(tipo)!).map((t) => t.cual)
    expect(cuales('potenciometro')).toEqual(['ref', 'valor', 'ajuste'])
    expect(cuales('potenciometro', { junto: 'Nada' })).toEqual(['ref', 'valor'])
    expect(cuales('resistencia')).toEqual(['ref', 'valor'])
  })

  it('una pieza sin la opción se dibuja como siempre', () => {
    expect(valor('resistencia')).toBe('1 kΩ')
    expect(ajuste('resistencia')).toBeNull()
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
    ponerTextoAjuste('Ambos')
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

  it('con «Valores» (lo de siempre) la resistencia del motor es todo el recuadro del ajuste', () => {
    const esc = construirEscena(doc, lib, con, PALETA_CLARA, { simulando: true })
    const fijo = esc.textos.find((t) => t.vivo)!
    expect(fijo.texto).toBe('')
    const viva = construirCapaSim(doc, lib, con, lectura(85), 5, PALETA_CLARA, undefined, null, esc.textos).textos.find((t) => t.texto === '1.07 kΩ')!
    expect(viva.x).toBe(fijo.x)
  })
})
