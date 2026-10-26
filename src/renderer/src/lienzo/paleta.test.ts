import { describe, expect, it } from 'vitest'
import { COLORES_DE_CABLE, TEMAS } from '../../../compartido/ajustes'
import {
  COLOR_CABLE, conAlfa, contraste, cssRgba, hexARgba, interfazDeTema, mezclar, PALETA_CLARA, PALETA_OSCURA, paletaDeTema, TOKEN_DE_TINTA, tokensDeTema, TOKENS_CLAROS,
  TOKENS_OSCUROS, variableCss
} from './paleta'
import { TINTAS } from '../doc/formato'

describe('paleta', () => {
  it('convierte hexadecimal a RGBA de 0 a 1', () => {
    expect(hexARgba('#FF0000')).toEqual([1, 0, 0, 1])
    const c = hexARgba('#0E7C66', 0.5)
    expect(c[0]).toBeCloseTo(14 / 255, 9)
    expect(c[1]).toBeCloseTo(124 / 255, 9)
    expect(c[2]).toBeCloseTo(102 / 255, 9)
    expect(c[3]).toBe(0.5)
  })

  it('rechaza colores mal escritos', () => {
    expect(() => hexARgba('#FFF')).toThrow('color inválido')
    expect(() => hexARgba('0E7C66')).toThrow('color inválido')
  })

  it('escribe RGBA para Canvas2D', () => {
    expect(cssRgba(hexARgba('#2457D6'))).toBe('rgba(36, 87, 214, 1)')
    expect(cssRgba(conAlfa(hexARgba('#000000'), 0.25))).toBe('rgba(0, 0, 0, 0.25)')
  })

  it('las dos paletas tienen los mismos 39 tokens, opacos', () => {
    expect(Object.keys(TOKENS_CLAROS).sort()).toEqual(Object.keys(TOKENS_OSCUROS).sort())
    expect(Object.keys(PALETA_CLARA)).toHaveLength(39)
    for (const p of [PALETA_CLARA, PALETA_OSCURA]) for (const c of Object.values(p)) expect(c[3]).toBe(1)
  })

  it('las banderas de las sondas usan el color de texto de su canal: 4.5:1 contra el lienzo y contra su letra', () => {
    for (const [p, t] of [[PALETA_CLARA, 'claro'], [PALETA_OSCURA, 'oscuro']] as const)
      for (const k of ['sondaA', 'sondaB', 'sondaC', 'sondaD'] as const) expect(contraste(p[k], p.lienzo), `${t} ${k}`).toBeGreaterThanOrEqual(4.5)
    expect(TOKENS_CLAROS.sondaA).toBe('#027763')
    expect(TOKENS_OSCUROS.sondaD).toBe('#C797C3')
  })

  it('el lienzo claro es #F7F6F2', () => {
    const [r, g, b] = PALETA_CLARA.lienzo
    expect([r, g, b].map((v) => Math.round(v * 255))).toEqual([247, 246, 242])
  })

  it('nombra las variables CSS en kebab-case', () => {
    expect(variableCss('textoSecundario')).toBe('--texto-secundario')
    expect(variableCss('lienzo')).toBe('--lienzo')
    expect(variableCss('rejillaMayor')).toBe('--rejilla-mayor')
  })

  it('mezclar da un color opaco entre el fondo y el color', () => {
    const m = mezclar([1, 0, 0.5, 0.3], [0, 1, 0.5, 1], 0.25)
    expect(m[0]).toBeCloseTo(0.25, 9)
    expect(m[1]).toBeCloseTo(0.75, 9)
    expect(m[2]).toBeCloseTo(0.5, 9)
    expect(m[3]).toBe(1)
    expect(mezclar([1, 0, 0, 1], [0, 0, 0, 1], 1)).toEqual([1, 0, 0, 1])
    expect(mezclar([1, 0, 0, 1], [0, 0, 1, 1], 0)).toEqual([0, 0, 1, 1])
  })

  it('contraste según WCAG: blanco sobre negro 21:1, mismo color 1:1', () => {
    expect(contraste(hexARgba('#FFFFFF'), hexARgba('#000000'))).toBeCloseTo(21, 6)
    expect(contraste(hexARgba('#777777'), hexARgba('#777777'))).toBeCloseTo(1, 9)
  })

  it('«inválido» es un rojo apagado opaco con al menos 3:1 sobre el lienzo en los dos temas', () => {
    expect(TOKENS_CLAROS.invalido).toBe('#B42318')
    expect(TOKENS_OSCUROS.invalido).toBe('#F97066')
    for (const p of [PALETA_CLARA, PALETA_OSCURA]) {
      expect(p.invalido[3]).toBe(1)
      expect(p.invalido[0]).toBeGreaterThan(p.invalido[1])
      expect(contraste(p.invalido, p.lienzo)).toBeGreaterThanOrEqual(3)
    }
    // Medido: 6.1:1 en claro y 6.4:1 en oscuro.
    expect(contraste(PALETA_CLARA.invalido, PALETA_CLARA.lienzo)).toBeCloseTo(6.1, 1)
    expect(contraste(PALETA_OSCURA.invalido, PALETA_OSCURA.lienzo)).toBeCloseTo(6.4, 1)
  })
})

describe('contraste medido de cada tema (especificación 1C-1, sección 3)', () => {
  const c = (a: string, b: string) => contraste(hexARgba(a), hexARgba(b))

  it.each(TEMAS)('%s: la rejilla menor y la mayor quedan entre 1.3 y 2 sobre el lienzo', (t) => {
    const k = tokensDeTema(t)
    for (const g of [k.rejillaMenor, k.rejillaMayor]) {
      expect(c(g, k.lienzo), g).toBeGreaterThanOrEqual(1.3)
      expect(c(g, k.lienzo), g).toBeLessThanOrEqual(2)
    }
  })

  it.each(TEMAS)('%s: el borde de campos y chips da 3:1 o más sobre todos sus fondos', (t) => {
    const k = tokensDeTema(t), i = interfazDeTema(t)
    for (const fondo of [k.lienzo, k.paneles, i.barra, i.chip]) expect(c(i.bordeCampo, fondo), fondo).toBeGreaterThanOrEqual(3)
  })

  it.each(TEMAS)('%s: el texto da 4.5:1 o más sobre todos los fondos de la interfaz', (t) => {
    const k = tokensDeTema(t), i = interfazDeTema(t)
    for (const texto of [k.trazo, k.textoSecundario])
      for (const fondo of [k.lienzo, k.paneles, i.barra, i.chip, i.resalte, i.seleccionFondo]) expect(c(texto, fondo), `${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5)
    expect(c(k.seleccion, i.seleccionFondo)).toBeGreaterThanOrEqual(4.5)
    expect(c(k.seleccion, k.paneles)).toBeGreaterThanOrEqual(4.5)
    expect(c(i.sobreSeleccion, k.seleccion)).toBeGreaterThanOrEqual(4.5)
    for (const fondo of [k.paneles, i.resalte]) expect(c(k.invalido, fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TEMAS)('%s: cada color de cable da 3:1 o más sobre el lienzo', (t) => {
    for (const cables of COLORES_DE_CABLE) expect(c(COLOR_CABLE[cables][t], tokensDeTema(t).lienzo), cables).toBeGreaterThanOrEqual(3)
  })

  it.each(TEMAS)('%s: el circuito del lienzo tiene contraste medido sobre el lienzo', (t) => {
    const k = tokensDeTema(t)
    expect(c(k.pieza, k.lienzo), 'piezas y referencias').toBeGreaterThanOrEqual(4.5)
    expect(c(k.valor, k.lienzo), 'texto de valor').toBeGreaterThanOrEqual(4.5)
    expect(c(k.cable, k.lienzo), 'cable').toBeGreaterThanOrEqual(3)
    expect(c(k.seleccion, k.lienzo), 'selección').toBeGreaterThanOrEqual(3)
  })

  it.each(TEMAS)('%s: las flechas de la corriente, el aviso y la luz del foco miden 3:1 o más sobre el lienzo', (t) => {
    const k = tokensDeTema(t)
    expect(k.flechaCorriente, 'las flechas van en la tinta de las piezas').toBe(k.pieza)
    for (const token of ['flechaCorriente', 'aviso', 'focoTibio', 'focoPleno'] as const) expect(c(k[token], k.lienzo), token).toBeGreaterThanOrEqual(3)
    // Las flechas se distinguen de los tres colores de la escala de voltaje que pintan el cable debajo.
    for (const v of [k.voltajeAlto, k.voltajeCero, k.voltajeNegativo]) expect(c(k.flechaCorriente, v), v).toBeGreaterThanOrEqual(1.5)
  })

  it('el tema oscuro pinta el circuito con la paleta «Apagada» y deja la interfaz como estaba', () => {
    expect(TOKENS_OSCUROS).toMatchObject({ pieza: '#C9CCD1', valor: '#9CA1A9', cable: '#58A897', seleccion: '#86A6EE', trazo: '#E8E6E1', textoSecundario: '#A3A7AE' })
    expect(COLOR_CABLE.verde.oscuro).toBe('#58A897')
    expect(COLOR_CABLE.tinta.oscuro).toBe('#C9CCD1')
    expect(c(TOKENS_OSCUROS.pieza, TOKENS_OSCUROS.lienzo)).toBeCloseTo(11.0, 0)
    expect(c(TOKENS_OSCUROS.cable, TOKENS_OSCUROS.lienzo)).toBeCloseTo(6.3, 0)
    expect(c(TOKENS_OSCUROS.seleccion, TOKENS_OSCUROS.lienzo)).toBeCloseTo(7.4, 0)
  })

  it('en el tema claro el circuito conserva los colores de siempre', () => {
    expect(TOKENS_CLAROS).toMatchObject({ pieza: TOKENS_CLAROS.trazo, valor: TOKENS_CLAROS.textoSecundario })
  })

  it('paletaDeTema cambia solo el cable y devuelve el mismo objeto para la misma combinación', () => {
    expect(paletaDeTema('claro')).toEqual(PALETA_CLARA)
    expect(paletaDeTema('oscuro', 'verde')).toEqual(PALETA_OSCURA)
    const azul = paletaDeTema('oscuro', 'azul')
    expect(azul).toBe(paletaDeTema('oscuro', 'azul'))
    expect(azul.cable).toEqual(hexARgba('#5B9BD5'))
    expect({ ...azul, cable: PALETA_OSCURA.cable }).toEqual(PALETA_OSCURA)
  })

  it.each(TEMAS)('%s: las cinco tintas de notas y etiquetas dan 4.5:1 o más sobre el lienzo', (t) => {
    const k = tokensDeTema(t)
    for (const tinta of TINTAS) expect(c(k[TOKEN_DE_TINTA[tinta]], k.lienzo), tinta).toBeGreaterThanOrEqual(4.5)
  })

  it('las tintas tienen los tonos de la especificación y el tema oscuro sigue la paleta «Apagada»', () => {
    expect(TINTAS.map((t) => TOKENS_CLAROS[TOKEN_DE_TINTA[t]])).toEqual(['#1E2430', '#5D6470', '#B42318', '#1D4F91', '#0E7C66'])
    expect(TINTAS.map((t) => TOKENS_OSCUROS[TOKEN_DE_TINTA[t]])).toEqual(['#C9CCD1', '#9CA1A9', '#F97066', '#86A6EE', '#58A897'])
    expect(TOKENS_OSCUROS.textoTinta).toBe(TOKENS_OSCUROS.pieza)
    expect(TOKENS_OSCUROS.textoGris).toBe(TOKENS_OSCUROS.valor)
  })

  it('rejilla mayor medida: 1.94:1 en los dos temas', () => {
    expect(c(TOKENS_CLAROS.rejillaMayor, TOKENS_CLAROS.lienzo)).toBeCloseTo(1.94, 2)
    expect(c(TOKENS_OSCUROS.rejillaMayor, TOKENS_OSCUROS.lienzo)).toBeCloseTo(1.94, 2)
  })
})

/** CIEDE2000 entre dos colores sRGB (0 a 1): la diferencia que ve una persona, no la de los canales. */
function deltaE2000(a: readonly number[], b: readonly number[]): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lab = ([r, g, bl]: readonly number[]): [number, number, number] => {
    const [R, G, B] = [r, g, bl].map(lin)
    const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
  }
  const [L1, a1, b1] = lab(a), [L2, a2, b2] = lab(b)
  const rad = (d: number) => (d * Math.PI) / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2)
  const ang = (y: number, x: number) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  const hp1 = Cp1 === 0 ? 0 : ang(b1, ap1), hp2 = Cp2 === 0 ? 0 : ang(b2, ap2)
  let dh = hp2 - hp1
  if (Cp1 * Cp2 === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dh / 2))
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2
  let hb = hp1 + hp2
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hb += hp1 + hp2 < 360 ? 360 : -360
    hb /= 2
  }
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63))
  const Rt = -Math.sin(rad(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)))) * 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}

describe('luz de los LED', () => {
  const COLORES = ['ledRojo', 'ledVerde', 'ledAzul', 'ledAmarillo', 'ledBlanco'] as const
  // El disco de luz se pinta con la opacidad de ALFA_LUZ sobre el lienzo: eso es lo que se compara.
  const ALFA = 0.45
  it.each([['claro', PALETA_CLARA], ['oscuro', PALETA_OSCURA]] as const)('en el tema %s los cinco colores se distinguen entre sí (CIEDE2000 de 14 o más) y del lienzo', (_t, p) => {
    const vistos = COLORES.map((k) => [k, mezclar(p[k], p.lienzo, ALFA)] as const)
    for (let i = 0; i < vistos.length; i++) {
      expect(deltaE2000(vistos[i][1], p.lienzo), `${vistos[i][0]} contra el lienzo`).toBeGreaterThanOrEqual(10)
      for (let j = i + 1; j < vistos.length; j++) expect(deltaE2000(vistos[i][1], vistos[j][1]), `${vistos[i][0]} contra ${vistos[j][0]}`).toBeGreaterThanOrEqual(14)
    }
  })
  it('el LED blanco en claro ya no se parece al amarillo (antes 4.7)', () => {
    const v = (k: 'ledAmarillo' | 'ledBlanco') => mezclar(PALETA_CLARA[k], PALETA_CLARA.lienzo, ALFA)
    expect(deltaE2000(v('ledAmarillo'), v('ledBlanco'))).toBeGreaterThan(20)
  })
})
