// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { figuraPorOmision } from '../../../../compartido/ajustes'
import { ASPECTO_OSCILOSCOPIO } from '../../../../compartido/grafica/aspecto'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { csvDeCaptura, lineasDeCaptura } from './exportarCaptura'
import { svgDeFigura } from './exportarFigura'
import { figuraDeCaptura } from './figura'
import { rotulosMarcas, rotulosTiempo, rotulosVoltaje } from './marco'
import { ejeDeCaptura, marcasRedondas, recortarCaptura } from './recorte'

const a: AjustesOsciloscopio = {
  canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A' || canal === 'B', vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [], ideal: false
}

/** 100 columnas de 100 µs desde 10 ms, con el disparo a 11 ms (el eje de la figura va de −1 ms a 9 ms). El canal B vale j/100. */
function pantalla(tDisparo = 0.011): PantallaSab {
  const ncol = 100
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let j = 0; j < ncol; j++) columnas.set([j / 100, j / 100, j / 100, j / 100, 0], (ncol + j) * CIFRAS_COLUMNA)
  const muestras = new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
  for (let k = 0; k < MUESTRAS_CSV; k++) muestras[MUESTRAS_CSV + k] = k / 1000
  const medidas = Array.from({ length: CANALES_PANTALLA }, () => Array.from({ length: 8 }, () => ({ valor: 2, razon: '' as const })))
  return { version: 1, t0: 0.01, dt: 1e-4, ncol, tDisparo, estado: 'disparado', tCaptura: 0.02, csv: { t0: 0.01, dt: 5e-6, n: MUESTRAS_CSV }, completoHasta: Array(CANALES_PANTALLA).fill(0.02), medidas, columnas, muestras }
}

describe('recortar una captura del osciloscopio a un tramo del eje del tiempo', () => {
  it('el eje de la figura cuenta desde el disparo y, sin él, desde 0', () => {
    const e = ejeDeCaptura(a, pantalla())
    expect(e.min).toBeCloseTo(-1e-3, 12)
    expect(e.max).toBeCloseTo(9e-3, 12)
    const libre = ejeDeCaptura(a, pantalla(Number.NaN))
    expect(libre.min).toBeCloseTo(0.01, 12)
    expect(libre.max).toBeCloseTo(0.02, 12)
  })

  it('el tramo de 2 a 4 ms deja 20 columnas, una base que lo reparte en diez divisiones y el disparo fuera', () => {
    const r = recortarCaptura(a, pantalla(), { desde: 2e-3, hasta: 4e-3 })
    expect(r.recortada).toBe(true)
    expect(r.p.ncol).toBe(20)
    expect(r.p.t0).toBeCloseTo(0.013, 12)
    expect(r.a.base).toBeCloseTo(2e-4, 12)
    expect(r.vista.min).toBeCloseTo(2e-3, 12)
    expect(r.vista.max).toBeCloseTo(4e-3, 12)
    expect(Number.isNaN(r.p.tDisparo)).toBe(true)
    // El canal B conserva sus columnas de ese tramo (la columna 30 de 100 vale 0.30).
    expect(r.p.columnas[(1 * 20 + 0) * CIFRAS_COLUMNA]).toBeCloseTo(0.3, 6)
    expect(r.p.columnas[(1 * 20 + 19) * CIFRAS_COLUMNA]).toBeCloseTo(0.49, 6)
  })

  it('sin rango, con uno que cubre todo o con uno de menos de dos columnas, la captura queda igual', () => {
    const p = pantalla()
    expect(recortarCaptura(a, p, null).p).toBe(p)
    expect(recortarCaptura(a, p, { desde: -1, hasta: 1 }).recortada).toBe(false)
    expect(recortarCaptura(a, p, { desde: 2e-3, hasta: 2.05e-3 }).recortada).toBe(false)
  })

  it('el CSV solo trae los instantes del tramo, parte de 0 y lo dice', () => {
    const csv = csvDeCaptura('XSC1', a, pantalla(), { desde: 2e-3, hasta: 4e-3 }).trimEnd().split('\n')
    const datos = csv.filter((l) => !l.startsWith('#') && !l.startsWith('t (s)'))
    expect(datos).toHaveLength(401)
    expect(datos[0].split(',')[0]).toBe('0')
    expect(datos.at(-1)!.split(',')[0]).toBe('0.002')
    expect(csv.some((l) => l.startsWith('# Tramo exportado: de 2.000 ms a 4.000 ms'))).toBe(true)
    expect(csv.some((l) => l.includes('t simulado = 13.00 ms'))).toBe(true)
    // Sin rango, igual que antes: toda la captura.
    expect(csvDeCaptura('XSC1', a, pantalla()).trimEnd().split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('t (s)'))).toHaveLength(MUESTRAS_CSV)
  })

  it('la leyenda del PNG dice qué tramo se exportó', () => {
    const l = lineasDeCaptura('XSC1', a, pantalla(), { desde: 2e-3, hasta: 4e-3 })
    expect(l.at(-1)![0].texto).toContain('tramo de 2.000 ms a 4.000 ms')
    expect(lineasDeCaptura('XSC1', a, pantalla()).at(-1)![0].texto).not.toContain('tramo')
  })

  it('las cifras del eje del tramo parten de su inicio y siguen contadas desde el disparo', () => {
    const t = rotulosTiempo({ base: 2e-4, disparoCentro: false }, { t0: 0.013, tDisparo: Number.NaN }, null, { valor: 2e-3, alDisparo: true })
    expect(t.titulo).toBe('Tiempo desde el disparo, en ms')
    expect(t.valores[0]).toBe('2.0')
    expect(t.valores[10]).toBe('4.0')
    const s = rotulosTiempo({ base: 2e-5, disparoCentro: false }, null, null, { valor: 0.0123, alDisparo: false })
    expect(s.titulo).toBe('Tiempo de la simulación, en ms')
    expect(s.valores[0]).toBe('12.30')
    expect(s.valores[1]).toBe('12.32')
  })

  it('la figura del tramo trae las cifras del tramo y el mapa para elegirlo arrastrando', async () => {
    const op = figuraPorOmision()
    const completa = figuraDeCaptura('XSC1', a, pantalla(), op, 'claro', undefined, { aspecto: ASPECTO_OSCILOSCOPIO, canales: {} })
    const tramo = figuraDeCaptura('XSC1', a, pantalla(), op, 'claro', undefined, { aspecto: ASPECTO_OSCILOSCOPIO, canales: {}, rango: { desde: 2e-3, hasta: 4e-3 } })
    expect(completa.eje!.mapa.dom.min).toBeCloseTo(-1e-3, 12)
    expect(tramo.eje!.mapa.dom.min).toBeCloseTo(2e-3, 12)
    expect(tramo.eje!.mapa.dom.max).toBeCloseTo(4e-3, 12)
    // El eje completo se conserva para poder ampliar el tramo.
    expect(tramo.eje!.total.min).toBeCloseTo(-1e-3, 12)
    expect(tramo.eje!.total.max).toBeCloseTo(9e-3, 12)
    expect(tramo.eje!.mapa.px1).toBeGreaterThan(tramo.eje!.mapa.px0)
    const svg = (await svgDeFigura(tramo, 'x')).svg
    expect(svg).toContain('>2.0<')
    expect(svg).toContain('>4.0<')
    expect(svg).toContain('tramo de 2.000 ms a 4.000 ms')
  })
})

describe('marcas redondas de un tramo exportado (ventana 1.8156 a 1.8229 s)', () => {
  it('el tramo se queda como se eligió y las marcas caen cada 1 ms dentro de él', () => {
    const m = marcasRedondas({ min: 1.8156, max: 1.8229 })!
    expect(m.paso).toBeCloseTo(0.001, 12)
    expect(m.valores.map((v) => Number(v.toFixed(6)))).toEqual([1.816, 1.817, 1.818, 1.819, 1.82, 1.821, 1.822])
    expect(m.valores.every((v) => v >= 1.8156 && v <= 1.8229)).toBe(true)
  })
  it('las cifras llevan solo los decimales del paso y el pie dice el mismo paso', () => {
    const m = marcasRedondas({ min: 1.8156, max: 1.8229 })!
    const t = rotulosMarcas(m.valores, m.paso, false)
    expect(t.valores).toEqual(['1.816', '1.817', '1.818', '1.819', '1.820', '1.821', '1.822'])
    expect(t.porDivision).toBe('1 ms por división')
  })
  it('la figura conserva el tramo pedido y dibuja esas marcas', async () => {
    const tramo = figuraDeCaptura('XSC1', a, pantalla(), figuraPorOmision(), 'claro', undefined, { aspecto: ASPECTO_OSCILOSCOPIO, canales: {}, rango: { desde: 2.05e-3, hasta: 4.15e-3 } })
    expect(tramo.eje!.mapa.dom.min).toBeCloseTo(2.1e-3, 12)
    expect(tramo.eje!.mapa.dom.max).toBeCloseTo(4.1e-3, 12)
    const svg = (await svgDeFigura(tramo, 'x')).svg
    expect(svg).toContain('>3.0<')
    expect(svg).toContain('por división')
  })
  it('sin elección, 10 mV y 500 mV por división no llevan ceros de más; un número elegido se escribe tal cual', () => {
    expect(rotulosVoltaje({ vdiv: 0.01, pos: 0 }).valores.slice(0, 3)).toEqual(['40', '30', '20'])
    expect(rotulosVoltaje({ vdiv: 0.5, pos: 0 }, 'm').valores.slice(0, 3)).toEqual(['2000', '1500', '1000'])
    expect(rotulosVoltaje({ vdiv: 0.5, pos: 0 }, 'm', 4).valores.slice(0, 3)).toEqual(['2000.0000', '1500.0000', '1000.0000'])
  })
})

describe('tamaño y grosores generales en la figura del osciloscopio', () => {
  const svgCon = async (op = figuraPorOmision(), aspecto = ASPECTO_OSCILOSCOPIO) => (await svgDeFigura(figuraDeCaptura('XSC1', a, pantalla(), op, 'claro', undefined, { aspecto, canales: {} }), 'x')).svg
  const tamCifras = (svg: string) => /font-size="(\d+)"[^>]*>−?\d+(\.\d+)?</.exec(svg)?.[1]
  it('el tamaño general de la letra llega a las cifras de los ejes y un tamaño propio lo vence', async () => {
    expect(tamCifras(await svgCon({ ...figuraPorOmision(), tamañoLetra: 14 }))).toBe('14')
    expect(tamCifras(await svgCon({ ...figuraPorOmision(), tamañoLetra: 14 }, { ...ASPECTO_OSCILOSCOPIO, textoTam: 18 }))).toBe('18')
  })
  it('el grosor general de la rejilla y de los ejes se dibuja', async () => {
    const svg = await svgCon(figuraPorOmision(), { ...ASPECTO_OSCILOSCOPIO, grosorRejilla: 3, grosorEjes: 2.5 })
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('stroke-width="2.5"')
  })
  it('el grosor de los ejes engrosa también la cruz central, no solo las rayitas de afuera', async () => {
    const n = (g: number) => (svgText.match(new RegExp(`stroke-width="${g}"`, 'g')) ?? []).length
    const svgText = await svgCon(figuraPorOmision(), { ...ASPECTO_OSCILOSCOPIO, grosorRejilla: 1, grosorEjes: 3 })
    expect(n(3)).toBeGreaterThanOrEqual(2)
  })
})
