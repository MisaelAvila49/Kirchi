import { describe, expect, it } from 'vitest'
import { aBase64, cargarFuentesDeTextos, carasNecesarias, crearTieneGlifo, cssDeCaras, cssDeFuentes, familiasDePila, leerRangoUnicode, type CaraFuente } from './fuentes'

const FUENTES = {
  interfaz: "'Mona Sans Variable', 'Source Serif 4 Variable', system-ui, sans-serif",
  cifras: "'Geist Mono Variable', 'Source Serif 4 Variable', ui-monospace, monospace",
  serif: "'Source Serif 4 Variable', Georgia, serif"
}
const cara = (familia: string, estilo: 'normal' | 'italic', rango: string, url: string): CaraFuente => ({
  familia, estilo, peso: '200 900', ancho: 'normal', rango, intervalos: leerRangoUnicode(rango), url
})
const CARAS = [
  cara('Mona Sans Variable', 'normal', 'U+0-FF, U+131', 'mona-latin'),
  cara('Mona Sans Variable', 'normal', 'U+100-2BA', 'mona-latin-ext'),
  cara('Mona Sans Variable', 'italic', 'U+0-FF', 'mona-latin-italic'),
  cara('Geist Mono Variable', 'normal', 'U+0-FF', 'geist-latin'),
  cara('Source Serif 4 Variable', 'normal', 'U+370-3FF', 'serif-greek'),
  cara('Source Serif 4 Variable', 'normal', 'U+0-FF', 'serif-latin')
]

describe('fuentes incrustadas', () => {
  it('lee unicode-range con intervalos, sueltos y comodines', () => {
    expect(leerRangoUnicode('U+0-FF, U+131, U+4??, basura, U+1F600-1F64F')).toEqual([[0, 255], [0x131, 0x131], [0x400, 0x4ff], [0x1f600, 0x1f64f]])
  })

  it('familiasDePila quita comillas simples y dobles', () => {
    expect(familiasDePila(`'Mona Sans Variable', "Source Serif 4 Variable", system-ui`)).toEqual(['Mona Sans Variable', 'Source Serif 4 Variable', 'system-ui'])
  })

  it('cada carácter pide la primera familia de la pila que lo tiene: el Ω sale de Source Serif', () => {
    const usadas = carasNecesarias([{ texto: 'R1 4.7 kΩ', fuente: 'interfaz' }], CARAS, FUENTES)
    expect(usadas.map((c) => c.url)).toEqual(['mona-latin', 'serif-greek'])
  })

  it('solo las caras que se usan: cifras, cursiva y latín extendido', () => {
    const usadas = carasNecesarias(
      [
        { texto: '10k', fuente: 'cifras' },
        { texto: 'Nota', fuente: 'interfaz', cursiva: true },
        { texto: 'ł', fuente: 'interfaz' }
      ],
      CARAS,
      FUENTES
    )
    expect(usadas.map((c) => c.url)).toEqual(['mona-latin-ext', 'mona-latin-italic', 'geist-latin'])
  })

  it('una letra que el rango abarca pero la familia no dibuja pasa a la siguiente de la pila (la µ de Mona Sans)', () => {
    const tiene = (familia: string, c: string) => !(familia === 'Mona Sans Variable' && c === 'µ')
    expect(carasNecesarias([{ texto: 'µ', fuente: 'interfaz' }], CARAS, FUENTES, tiene).map((c) => c.url)).toEqual(['serif-latin'])
  })

  it('una cursiva que la familia no trae usa su cara normal; lo que no tiene ninguna no pide nada', () => {
    expect(carasNecesarias([{ texto: 'x', fuente: 'cifras', cursiva: true }], CARAS, FUENTES).map((c) => c.url)).toEqual(['geist-latin'])
    expect(carasNecesarias([{ texto: '漢', fuente: 'interfaz' }], CARAS, FUENTES)).toEqual([])
  })

  it('el @font-face lleva el rango y el archivo en base64, y omite caras sin datos', () => {
    const css = cssDeCaras(CARAS.slice(0, 2), new Map([['mona-latin', 'QUJD']]))
    expect(css).toBe(
      "@font-face{font-family:'Mona Sans Variable';font-style:normal;font-weight:200 900;font-stretch:normal;unicode-range:U+0-FF, U+131;src:url(data:font/woff2;base64,QUJD) format('woff2')}"
    )
  })

  it('aBase64 con más de 32 KB', () => {
    const b = new Uint8Array(100_000).map((_, i) => i % 256)
    expect(Buffer.from(aBase64(b), 'base64')).toEqual(Buffer.from(b))
  })

  it('cssDeFuentes lee cada archivo una sola vez y sigue si uno falla', async () => {
    const leidos: string[] = []
    const leer = async (url: string) => {
      leidos.push(url)
      if (url === 'serif-greek') throw new Error('no')
      return new Uint8Array([65, 66, 67])
    }
    const textos = [{ texto: 'R1 Ω', fuente: 'interfaz' as const }]
    const css = await cssDeFuentes(textos, FUENTES, CARAS, leer, () => true)
    await cssDeFuentes(textos, FUENTES, CARAS, leer, () => true)
    expect(css).toContain('base64,QUJD')
    expect(css).not.toContain('serif')
    expect(leidos.filter((u) => u === 'mona-latin')).toHaveLength(1)
  })
})

describe('carga de fuentes antes de medir', () => {
  const texto = (t: string, fuente: 'interfaz' | 'cifras' | 'serif', extra: { cursiva?: boolean; negrita?: boolean } = {}) => ({ texto: t, fuente, cursiva: false, negrita: false, ...extra })

  it('pide cada combinación de pila, cursiva y negrita con los caracteres que usa, aunque estén fuera de pantalla', async () => {
    const pedidos: [string, string][] = []
    const fs = { load: async (f: string, t: string) => (pedidos.push([f, t]), []) }
    await cargarFuentesDeTextos([texto('Ω', 'serif', { cursiva: true }), texto('ab', 'interfaz'), texto('cd', 'interfaz'), texto('12', 'cifras', { negrita: true })], FUENTES, fs)
    expect(pedidos).toHaveLength(3)
    const serif = pedidos.find(([f]) => f.startsWith('italic ') && f.includes('Source Serif'))!
    expect(serif[1]).toBe('Ω')
    expect(pedidos.find(([f]) => f.includes('Mona Sans'))![1]).toBe('abcd')
    expect(pedidos.find(([f]) => f.startsWith('700 ') && f.includes('Geist'))![1]).toBe('12')
  })

  it('una fuente que no carga no impide exportar', async () => {
    await expect(cargarFuentesDeTextos([texto('a', 'serif')], FUENTES, { load: async () => Promise.reject(new Error('x')) })).resolves.toBeUndefined()
  })

  it('no guarda en caché la medida de una fuente que aún no cargó', () => {
    let cargada = false, medidas = 0
    const tiene = crearTieneGlifo((_f, _e, _c, respaldo) => (medidas++, respaldo === 'serif' ? 10 : 20), () => cargada)
    expect(tiene('Mona', 'Ω', 'normal')).toBe(false)
    expect(tiene('Mona', 'Ω', 'normal')).toBe(false)
    expect(medidas).toBe(4)
    cargada = true
    tiene('Mona', 'Ω', 'normal')
    tiene('Mona', 'Ω', 'normal')
    expect(medidas).toBe(6)
  })
})
