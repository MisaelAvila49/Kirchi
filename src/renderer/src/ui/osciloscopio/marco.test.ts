import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { MARCO, marcaEn, marcasDeCero, marcoDePantalla, posicionDeY, rotulosTiempo, rotulosVoltaje, yDeCero, zonaEn } from './marco'

const canal = (c: 'A' | 'B' | 'C' | 'D', on: boolean, vdiv = 1, pos = 0) => ({ canal: c, on, vdiv, pos, acople: 'DC' as const })
const ajustes = (o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: [canal('A', true, 2, -3), canal('B', true, 5, 1), canal('C', false), canal('D', false)],
  matematico: false,
  base: 0.1,
  disparoCentro: false,
  disparo: { fuente: 'A', subida: true, nivel: 2.5, modo: 'auto' },
  medidas: [],
  ideal: false,
  ...o
})

describe('marco de la pantalla A1', () => {
  it('reserva una columna por canal encendido y el eje del tiempo arriba', () => {
    const m = marcoDePantalla(ajustes(), 1000, 400, 1)
    expect(m.columnas.map((c) => c.canal)).toEqual(['A', 'B'])
    expect(m.x).toBe(MARCO.aire + 2 * MARCO.columna)
    expect(m.y).toBe(MARCO.ejeTiempo)
    expect(m.w).toBe(1000 - m.x - MARCO.derecha)
    expect(m.h).toBe(400 - m.y - MARCO.abajo)
    expect(m.eje).toEqual({ y0: 0, y1: MARCO.ejeTiempo })
  })

  it('sin canales encendidos deja solo el aire; con dpr 2 todo mide el doble', () => {
    const a = ajustes({ canales: [canal('A', false), canal('B', false), canal('C', false), canal('D', false)] })
    expect(marcoDePantalla(a, 1000, 400, 1).x).toBe(MARCO.aire)
    expect(marcoDePantalla(ajustes(), 2000, 800, 2).x).toBe(2 * (MARCO.aire + 2 * MARCO.columna))
  })

  it('las cifras de voltios de un canal van de arriba abajo con su posición y su prefijo', () => {
    // 2 V/div con la traza 3 divisiones abajo: arriba (4 div) dice 14 y abajo (−4 div) dice −2.
    expect(rotulosVoltaje(canal('A', true, 2, -3))).toEqual({ unidad: 'V', valores: ['14', '12', '10', '8', '6', '4', '2', '0', '−2'] })
    expect(rotulosVoltaje(canal('B', true, 0.005, 0)).unidad).toBe('mV')
    expect(rotulosVoltaje(canal('B', true, 0.005, 0)).valores[0]).toBe('20')
  })

  it('el tiempo se cuenta desde el disparo; sin disparo, desde el borde', () => {
    const conDisparo = rotulosTiempo(ajustes(), { t0: 2.9, tDisparo: 3.0 })
    expect(conDisparo.valores[0]).toBe('−100')
    expect(conDisparo.valores[10]).toBe('900')
    expect(conDisparo.titulo).toBe('Tiempo desde el disparo, en ms')
    expect(conDisparo.porDivision).toBe('100 ms por división')
    const sin = rotulosTiempo(ajustes({ base: 2e-6 }), { t0: 1, tDisparo: Number.NaN })
    // Un tiempo absoluto de 1 s se escribe en segundos (en µs serían siete cifras por rótulo); la división sigue diciéndose en µs.
    expect(sin.titulo).toBe('Tiempo de la simulación, en s')
    expect(sin.valores[0]).toBe('1.000000')
    expect(sin.valores[10]).toBe('1.000020')
    expect(sin.porDivision).toBe('2 µs por división')
    const inicio = rotulosTiempo(ajustes({ base: 2e-6 }), { t0: 0, tDisparo: Number.NaN })
    expect(inicio.titulo).toBe('Tiempo en la pantalla, en µs')
    expect(inicio.valores[10]).toBe('20')
    // Sin pantalla: el lugar nominal del disparo (10 % o centro).
    expect(rotulosTiempo(ajustes({ disparoCentro: true }), null).valores[5]).toBe('0')
    expect(rotulosTiempo(ajustes(), null).valores[1]).toBe('0')
  })

  it('en rodillo con 1 s por división las cifras avanzan con el tiempo simulado', () => {
    const r = (t0: number) => rotulosTiempo(ajustes({ base: 1 }), { t0, tDisparo: Number.NaN }).valores
    expect(r(0)[0]).toBe('0')
    expect(r(0)[10]).toBe('10')
    expect(r(10).slice(0, 2)).toEqual(['10', '11'])
    expect(r(10)[10]).toBe('20')
    expect(r(20.0234)[10]).toBe('30.02')
  })

  it('la rueda sabe sobre qué eje está', () => {
    const m = marcoDePantalla(ajustes(), 1000, 400, 1)
    expect(zonaEn(m, m.columnas[1].x0 + 5, 100)).toEqual({ tipo: 'canal', canal: 'B' })
    expect(zonaEn(m, 500, 10)).toEqual({ tipo: 'tiempo' })
    expect(zonaEn(m, 500, 200)).toEqual({ tipo: 'pantalla' })
    expect(zonaEn(m, 995, 200)).toBeNull()
  })

  it('la marca de 0 V se toma cerca de su nivel y su arrastre da la posición en pasos de 0.2', () => {
    const a = ajustes()
    const m = marcoDePantalla(a, 1000, 400, 1)
    const yA = yDeCero(m, a.canales[0])
    expect(yA).toBeCloseTo(m.y + m.h / 2 + 3 * (m.h / 8))
    expect(marcaEn(m, a, m.x - 4, yA + 2, 8)).toBe('A')
    expect(marcaEn(m, a, m.x + 200, yA, 8)).toBeNull()
    expect(posicionDeY(m, m.y + m.h / 2 - 1.13 * (m.h / 8))).toBe(1.2)
    expect(posicionDeY(m, -1000)).toBe(4)
  })

  it('el eje del tiempo no muestra ruido de coma flotante (disparo a t = 3.42 s con 1 µs y 1 ns por división)', () => {
    for (const base of [1e-6, 1e-9]) {
      const r = rotulosTiempo(ajustes({ base }), { t0: 3.42 - base * 1.0000003, tDisparo: 3.42 })
      expect(r.valores).toEqual(['−1', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    }
    const centro = rotulosTiempo(ajustes({ base: 1e-6, disparoCentro: true }), { t0: 3.42 - 5e-6, tDisparo: 3.42 })
    expect(centro.valores[5]).toBe('0')
  })

  it('dos marcas de 0 V a la misma altura se ponen una junto a la otra, fuera de las cifras, y las dos se toman', () => {
    const a = ajustes({ canales: [canal('A', true, 1, 0), canal('B', true, 1, 0), canal('C', false), canal('D', false)] })
    const m = marcoDePantalla(a, 1000, 400, 1)
    const marcas = marcasDeCero(m, a)
    expect(marcas.map((q) => q.canal)).toEqual(['A', 'B'])
    expect(marcas[0].x1).toBe(m.x - 1)
    expect(marcas[1].x1).toBeLessThan(marcas[0].x1 - 14)
    // Ninguna marca entra en la columna de cifras de su izquierda: el aire crece con las marcas apiladas.
    for (const q of marcas) expect(q.x1 - 15).toBeGreaterThanOrEqual(m.columnas[1].x1)
    expect(marcaEn(m, a, marcas[1].x1 - 6, marcas[1].y, 8)).toBe('B')
    expect(marcaEn(m, a, marcas[0].x1 - 6, marcas[0].y, 8)).toBe('A')
  })
})

describe('marco con el aspecto de la pantalla', () => {
  it('una escala a la derecha va después de la retícula y no reserva columna a la izquierda', () => {
    const m = marcoDePantalla(ajustes(), 1000, 400, 1, { lados: { B: 'derecha' } })
    expect(m.columnas.map((c) => [c.canal, c.lado])).toEqual([['A', 'izquierda'], ['B', 'derecha']])
    expect(m.x).toBe(MARCO.aire + MARCO.columna)
    expect(m.columnas[1].x0).toBe(m.x + m.w + MARCO.derecha)
    expect(m.w).toBe(1000 - m.x - MARCO.derecha - MARCO.columna)
  })
  it('una escala en medio no gasta ancho y su columna queda sobre el centro de la retícula', () => {
    const base = marcoDePantalla(ajustes({ canales: [canal('A', true), canal('B', false), canal('C', false), canal('D', false)] }), 1000, 400, 1)
    const m = marcoDePantalla(ajustes({ canales: [canal('A', true), canal('B', false), canal('C', false), canal('D', false)] }), 1000, 400, 1, { lados: { A: 'centro' } })
    expect(m.w).toBe(base.w + MARCO.columna)
    expect(m.columnas[0].x1).toBeCloseTo(m.x + m.w / 2, 6)
    // Solo se toma dentro de la retícula.
    expect(zonaEn(m, m.columnas[0].x0 + 5, m.y + 20)).toEqual({ tipo: 'canal', canal: 'A' })
  })
  it('el eje del tiempo abajo deja la retícula arriba y la banda debajo; en medio, la línea al centro', () => {
    const abajo = marcoDePantalla(ajustes(), 1000, 400, 1, { ejeX: 'abajo' })
    expect(abajo.y).toBe(24)
    expect(abajo.eje).toEqual({ y0: abajo.y + abajo.h, y1: 400 })
    expect(zonaEn(abajo, 500, abajo.y + abajo.h + 10)).toEqual({ tipo: 'tiempo' })
    expect(zonaEn(abajo, 500, 10)).toBeNull()
    const medio = marcoDePantalla(ajustes(), 1000, 400, 1, { ejeX: 'centro' })
    expect(medio.lineaEje).toBeCloseTo(medio.y + medio.h / 2, 6)
    expect(zonaEn(medio, 500, medio.lineaEje + 3)).toEqual({ tipo: 'tiempo' })
  })
  it('las marcas de 0 V siguen en el borde izquierdo de la retícula aunque la escala vaya a la derecha', () => {
    const a = ajustes()
    const m = marcoDePantalla(a, 1000, 400, 1, { lados: { A: 'derecha', B: 'derecha' } })
    for (const q of marcasDeCero(m, a)) expect(q.x1).toBeLessThanOrEqual(m.x)
  })
})

describe('la unidad mostrada de la escala, aparte de los voltios por división (N8b)', () => {
  it('500 mV por división mostrado en V se lee 2.0, 1.5, 1.0, 0.5, 0, y en mV 2000, 1500…', () => {
    const c = { vdiv: 0.5, pos: 0 }
    expect(rotulosVoltaje(c, 'base')).toEqual({ unidad: 'V', valores: ['2.0', '1.5', '1.0', '0.5', '0', '−0.5', '−1.0', '−1.5', '−2.0'] })
    expect(rotulosVoltaje(c, 'm')).toEqual({ unidad: 'mV', valores: ['2000', '1500', '1000', '500', '0', '−500', '−1000', '−1500', '−2000'] })
  })
  it('sin unidad elegida usa el prefijo que deja la cifra mayor de la columna entre 1 y 999', () => {
    expect(rotulosVoltaje({ vdiv: 0.5, pos: 0 }).unidad).toBe('V')
    expect(rotulosVoltaje({ vdiv: 0.05, pos: 0 }).unidad).toBe('mV')
    expect(rotulosVoltaje({ vdiv: 2, pos: 0 }, null).unidad).toBe('V')
  })
  it('la marca de 0 V corrida abre un decimal más para que las cifras no se redondeen', () => {
    expect(rotulosVoltaje({ vdiv: 1, pos: 0.2 }, 'base').valores[0]).toBe('3.8')
  })
  it('el eje del tiempo se escribe en el prefijo elegido y lo dice en sus títulos', () => {
    const t = rotulosTiempo({ base: 1e-3, disparoCentro: false }, null, 'u')
    expect(t.unidad).toBe('µs')
    expect(t.valores.slice(0, 3)).toEqual(['−1000', '0', '1000'])
    expect(t.porDivision).toBe('1000 µs por división')
    const auto = rotulosTiempo({ base: 1e-3, disparoCentro: false }, null)
    expect(auto.unidad).toBe('ms')
    expect(auto.valores.slice(0, 3)).toEqual(['−1', '0', '1'])
  })
})

describe('decimales elegidos en los ejes de la pantalla', () => {
  it('el tiempo sigue al paso por omisión y acepta de 0 a 4 o auto', () => {
    const a = { base: 2.5e-3, disparoCentro: false }
    expect(rotulosTiempo(a, null).valores.slice(1, 3)).toEqual(['0', '2.5'])
    expect(rotulosTiempo(a, null, null, null, 0).valores.slice(1, 3)).toEqual(['0', '3'])
    expect(rotulosTiempo(a, null, null, null, 3).valores.slice(1, 3)).toEqual(['0', '2.500'])
    expect(rotulosTiempo(a, null, null, null, 'auto').valores.slice(1, 3)).toEqual(['0', '2.5'])
  })
  it('el voltaje sigue al paso por omisión y acepta otros', () => {
    const c = { vdiv: 1, pos: 0 }
    expect(rotulosVoltaje(c).valores.slice(0, 2)).toEqual(['4', '3'])
    expect(rotulosVoltaje(c, null, 0).valores.slice(0, 2)).toEqual(['4', '3'])
    expect(rotulosVoltaje(c, 'm', 2).valores.slice(0, 2)).toEqual(['4000.00', '3000.00'])
    expect(rotulosVoltaje({ vdiv: 0.05, pos: 0 }).valores[0]).toBe('200')
    expect(rotulosVoltaje({ vdiv: 0.05, pos: 0 }, 'base').valores[0]).toBe('0.20')
  })
})

describe('eje del tiempo de un tramo exportado', () => {
  it('con 2 decimales y prefijo de la cifra mayor, y la escala en la misma unidad', () => {
    const t = rotulosTiempo({ base: 0.4090262, disparoCentro: false }, null, null, { valor: 9.6024106, alDisparo: false })
    expect(t.valores.slice(0, 3)).toEqual(['9.60', '10.01', '10.42'])
    expect(t.titulo).toBe('Tiempo de la simulación, en s')
    expect(t.porDivision).toBe('409 ms por división')
  })
})

describe('por división de un tramo exportado', () => {
  it('se escribe en el prefijo de su propio paso (724 µs, no 0.000724 s)', () => {
    const t = rotulosTiempo({ base: 7.24e-4, disparoCentro: false }, null, null, { valor: 1.8156, alDisparo: false })
    expect(t.porDivision).toBe('724 µs por división')
  })
})

describe('columnas del marco medidas por sus cifras', () => {
  const base0 = ajustes()
  const ajustesDos = { ...base0, canales: base0.canales.map((c) => ({ ...c, vdiv: 0.05 })) }
  const marcoCon = (prefijo: 'm' | 'base', decimales: 0 | 4, px = 11) => marcoDePantalla(ajustesDos, 1200, 600, 1, { estiloCifras: { px, canales: { A: { prefijo, decimales }, B: { prefijo, decimales } } } })
  it('«0.2000» reserva más que «0.2» y la retícula crece cuando las cifras se acortan', () => {
    const largo = marcoCon('base', 4)
    const corto = marcoCon('base', 0)
    const anchoCol = (m: ReturnType<typeof marcoDePantalla>) => m.columnas[0].x1 - m.columnas[0].x0
    expect(anchoCol(largo)).toBeGreaterThan(anchoCol(corto))
    expect(corto.w).toBeGreaterThan(largo.w)
  })
  it('una letra más grande ensancha la columna y la última no pasa del borde', () => {
    const chico = marcoCon('m', 0, 11)
    const grande = marcoCon('m', 0, 20)
    expect(grande.columnas[0].x1 - grande.columnas[0].x0).toBeGreaterThan(chico.columnas[0].x1 - chico.columnas[0].x0)
    expect(grande.x + grande.w).toBeLessThanOrEqual(1200)
  })
  it('a la derecha, las cifras largas quedan dentro de la figura', () => {
    const m = marcoDePantalla(ajustesDos, 1200, 600, 1, { lados: { A: 'izquierda', B: 'derecha' }, estiloCifras: { px: 14, canales: { B: { prefijo: 'm', decimales: 4 } } } })
    const der = m.columnas.find((c) => c.lado === 'derecha')!
    expect(der.x1).toBeLessThanOrEqual(1200)
  })
})
