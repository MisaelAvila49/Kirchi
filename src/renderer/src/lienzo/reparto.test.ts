import { describe, expect, it } from 'vitest'
import { anchoEnEm, type EstiloLetra } from './metricas'
import { anchoNatural, colocarRenglon, palabraMasAncha, repartir } from './reparto'

const ESTILOS: EstiloLetra[] = (['sans', 'serif', 'mono'] as const).flatMap((fuente) => [
  { fuente, negrita: false, cursiva: false },
  { fuente, negrita: true, cursiva: true }
])
const MONO = ESTILOS[4]
const EM = 1.6
const LARGO =
  'El divisor de voltaje reparte la tensión de la fuente entre dos resistencias en serie; con 1 kΩ y 1 kΩ el punto medio queda en la mitad.\n' +
  'Medir con el multímetro entre el nodo VSAL y tierra.\n\nAnticonstitucionalmente es una palabra larguísima.'
const textos = (rs: { texto: string }[]) => rs.map((r) => r.texto)

describe('reparto de renglones', () => {
  it.each(ESTILOS.map((e) => [`${e.fuente}${e.negrita ? ' negrita cursiva' : ''}`, e] as const))('%s: ningún renglón pasa del ancho y no se pierde ni se inventa texto', (_, e) => {
    for (const max of [8, 15, 30, 60]) {
      const rs = repartir(LARGO, e, EM, max)
      for (const r of rs) {
        expect(r.ancho, `«${r.texto}» en ${max}`).toBeLessThanOrEqual(max + 1e-9)
        // El ancho del renglón es el de su texto medido entero: los cortes coinciden con lo que se dibuja.
        expect(r.ancho).toBeCloseTo(anchoEnEm(r.texto, e) * EM, 9)
      }
      // Quitando los espacios, el texto queda igual (los saltos escritos y los cortes no comen letras).
      expect(textos(rs).join('').replace(/ /g, '')).toBe(LARGO.replace(/[\n ]/g, ''))
    }
  })

  it('respeta los saltos escritos, también uno vacío, y marca el fin de cada párrafo', () => {
    const e = ESTILOS[0]
    const rs = repartir('uno\n\ndos tres', e, EM)
    expect(textos(rs)).toEqual(['uno', '', 'dos tres'])
    expect(rs.map((r) => r.finDeParrafo)).toEqual([true, true, true])
    const cortado = repartir('dos tres cuatro', e, EM, anchoEnEm('dos tres', e) * EM)
    expect(textos(cortado)).toEqual(['dos tres', 'cuatro'])
    expect(cortado.map((r) => r.finDeParrafo)).toEqual([false, true])
  })

  it('una palabra más larga que la caja se parte por caracteres', () => {
    const e = ESTILOS[0]
    const max = anchoEnEm('Anticons', e) * EM
    const rs = repartir('Anticonstitucionalmente', e, EM, max)
    expect(rs.length).toBeGreaterThan(2)
    expect(textos(rs).join('')).toBe('Anticonstitucionalmente')
    for (const r of rs) expect(r.ancho).toBeLessThanOrEqual(max + 1e-9)
    // Aunque no quepa ni una letra, cada renglón lleva al menos una.
    expect(textos(repartir('abc', e, EM, 0.01))).toEqual(['a', 'b', 'c'])
  })

  it('sin ancho solo cortan los saltos escritos; el natural es el renglón más ancho', () => {
    const e = MONO
    expect(textos(repartir('a b c\nde', e, EM))).toEqual(['a b c', 'de'])
    expect(anchoNatural('a b c\nde', e, EM)).toBeCloseTo(5 * 0.6 * EM, 9)
    expect(palabraMasAncha('a b c\nde', e, EM)).toBeCloseTo(2 * 0.6 * EM, 9)
  })

  it('los espacios al final de un renglón no cuentan y un renglón de continuación no empieza con espacio', () => {
    const e = MONO
    const max = anchoEnEm('uno dos', e) * EM
    const rs = repartir('uno dos   tres', e, EM, max)
    expect(textos(rs)).toEqual(['uno dos', 'tres'])
    expect(rs[0].ancho).toBeCloseTo(anchoEnEm('uno dos', e) * EM, 9)
    // Los espacios dobles dentro de un renglón se conservan, y el del principio de un párrafo también (sangría).
    expect(textos(repartir('a  b', e, EM))).toEqual(['a  b'])
    expect(textos(repartir('  a', e, EM))).toEqual(['  a'])
    const fin = repartir('ab   ', e, EM)
    expect(fin[0].texto).toBe('ab')
    expect(fin[0].ancho).toBeCloseTo(anchoEnEm('ab', e) * EM, 9)
    expect(colocarRenglon(fin[0], 'der', 20)[0].x).toBeCloseTo(20 - fin[0].ancho, 9)
    expect(colocarRenglon(fin[0], 'centro', 20)[0].x).toBeCloseTo((20 - fin[0].ancho) / 2, 9)
    // Solo espacios: renglón vacío.
    expect(repartir('   ', e, EM)[0]).toMatchObject({ texto: '', ancho: 0 })
    expect(anchoNatural('ab   \nc', e, EM)).toBeCloseTo(anchoEnEm('ab', e) * EM, 9)
  })

  it('normaliza el texto: cualquier salto de línea, NFC, tabuladores como espacios', () => {
    const e = MONO
    expect(textos(repartir('a' + String.fromCharCode(13, 10) + 'b' + String.fromCharCode(13) + 'c' + String.fromCharCode(10) + 'd', e, EM))).toEqual(['a', 'b', 'c', 'd'])
    // «e» más acento combinante se compone en «é»; el signo ohm en la omega.
    expect(textos(repartir('e' + String.fromCharCode(0x301), e, EM))).toEqual([String.fromCharCode(0xe9)])
    expect(textos(repartir(String.fromCharCode(0x2126), e, EM))).toEqual([String.fromCharCode(0x3a9)])
    expect(textos(repartir('a' + String.fromCharCode(9) + 'b', e, EM))).toEqual(['a b'])
    expect(anchoNatural('a' + String.fromCharCode(13, 10) + 'bbb', e, EM)).toBeCloseTo(3 * 0.6 * EM, 9)
    expect(palabraMasAncha('a' + String.fromCharCode(13, 10) + 'bbb', e, EM)).toBeCloseTo(3 * 0.6 * EM, 9)
  })

  it('una marca combinante que no se compone no avanza y una palabra larga se parte por grafemas', () => {
    const e = ESTILOS[0]
    const marca = String.fromCharCode(0x301)
    expect(anchoEnEm('q' + marca, e)).toBe(anchoEnEm('q', e))
    // Una «x» con acento no se compone en un solo carácter: no se corta entre la letra y su marca.
    const largo = ('x' + marca).repeat(6)
    const max = anchoEnEm('xxx', e) * EM
    const rs = repartir(largo, e, EM, max)
    expect(rs.length).toBeGreaterThan(1)
    for (const r of rs) expect(r.texto.startsWith(marca)).toBe(false)
    expect(textos(rs).join('')).toBe(largo)
    // Una familia de emoji (varios puntos de código unidos) es un solo carácter.
    const familia = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)
    const rf = repartir(familia.repeat(3), e, EM, 0.01)
    expect(textos(rf)).toEqual([familia, familia, familia])
  })

  it('alinear: izquierda, centro y derecha mueven el renglón; justificar reparte el espacio salvo en el último', () => {
    const e = MONO
    const area = 20
    const [r1, r2] = repartir('aa bb cc dd ee ff', e, EM, 12)
    expect(colocarRenglon(r1, 'izq', area)).toEqual([{ texto: r1.texto, x: 0, ancho: r1.ancho }])
    expect(colocarRenglon(r1, 'centro', area)[0].x).toBeCloseTo((area - r1.ancho) / 2, 9)
    expect(colocarRenglon(r1, 'der', area)[0].x).toBeCloseTo(area - r1.ancho, 9)
    const j = colocarRenglon(r1, 'just', area)
    expect(j.map((t) => t.texto)).toEqual(r1.texto.split(' '))
    expect(j[0].x).toBe(0)
    expect(j[j.length - 1].x + j[j.length - 1].ancho).toBeCloseTo(area, 9)
    // El último renglón del párrafo queda a la izquierda, como en cualquier procesador de texto.
    expect(r2.finDeParrafo).toBe(true)
    expect(colocarRenglon(r2, 'just', area)).toEqual([{ texto: r2.texto, x: 0, ancho: r2.ancho }])
    expect(colocarRenglon(repartir('', e, EM)[0], 'izq', area)).toEqual([])
  })
})
