import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { coloresPantalla, dibujarPantalla, type EstiloPantalla, type Lienzo2D, type OpcionesDibujo } from './dibujar'
import { lecturaPantalla } from './lectura'
import { marcoDePantalla } from './marco'

/** Un contexto que anota los textos (con relleno y fuente), los trazos (con ancho y guiones) y los rellenos. */
function contexto() {
  const rotulos: { texto: string; relleno: string; fuente: string }[] = []
  const trazos: { estilo: string; n: number; ancho: number; guiones: number }[] = []
  let rellenos = 0
  let n = 0
  let guiones: number[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => void rellenos++,
    beginPath: () => void (n = 0),
    moveTo: () => void n++,
    lineTo: () => void n++,
    stroke: () => trazos.push({ estilo: String(ctx.strokeStyle), n, ancho: ctx.lineWidth, guiones: guiones.length }),
    fill: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => {}, translate: () => {},
    setLineDash: (g: number[]) => void (guiones = g),
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (t: string) => void rotulos.push({ texto: t, relleno: String(ctx.fillStyle), fuente: ctx.font })
  }
  return { ctx: ctx as unknown as Lienzo2D, rotulos, trazos, rellenos: () => rellenos, textos: () => rotulos.map((r) => r.texto) }
}

const ajustes = (vdiv = 0.5, o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false, ...o
})
function pantalla(n = 100): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++) for (let j = 0; j < n; j++) columnas.set([1, 1, 1, 1, 0], (c * n + j) * CIFRAS_COLUMNA)
  return { version: 1, t0: 0, dt: 1e-2 / n, ncol: n, tDisparo: 1e-3, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0) }
}
const estilo = (e: Partial<EstiloPantalla> = {}): EstiloPantalla => ({ textoTono: null, textoPeso: 'normal', rejillaEstilo: 'lineas', prefijoX: null, canales: {}, ...e })
const claro = coloresPantalla('claro')
const dibujar = (a: AjustesOsciloscopio, o: Partial<OpcionesDibujo> = {}) => {
  const r = contexto()
  dibujarPantalla(r.ctx, pantalla(), a, 1000, 480, claro, { dpr: 1, ejes: true, ...o })
  return r
}
const soloCifras = (t: string) => /^[\d.−]+$/.test(t)

describe('estilo de la pantalla del osciloscopio (N8b)', () => {
  it('sin estilo, las cifras llevan el color de su canal; con un tono para el texto, ese tono en todas', () => {
    const base = dibujar(ajustes(1)).rotulos.filter((r) => soloCifras(r.texto))
    expect(new Set(base.map((r) => r.relleno)).size).toBeGreaterThan(1)
    const negro = dibujar(ajustes(1), { estilo: estilo({ textoTono: 'negro' }) }).rotulos.filter((r) => soloCifras(r.texto))
    expect([...new Set(negro.map((r) => r.relleno))]).toEqual([claro.letra!('negro')])
  })
  it('el peso del texto llega a la fuente de las cifras', () => {
    const f = (peso: 'normal' | 'medio' | 'negrita') => dibujar(ajustes(1), { estilo: estilo({ textoPeso: peso }) }).rotulos.filter((r) => soloCifras(r.texto)).map((r) => r.fuente)
    expect(f('negrita').every((x) => x.startsWith('700 '))).toBe(true)
    expect(f('medio').every((x) => x.startsWith('500 '))).toBe(true)
    expect(f('normal').every((x) => !/^\d{3} /.test(x))).toBe(true)
  })
  it('500 mV por división se lee 0.5, 1.0… si se elige mostrar en V, y 500, 1000… en mV', () => {
    const en = (prefijo: 'base' | 'm') => dibujar(ajustes(0.5), { estilo: estilo({ canales: { A: { prefijo } } }) }).textos()
    const v = en('base')
    expect(v).toContain('A V')
    expect(v).toContain('1.0')
    expect(v).toContain('0.5')
    const mv = en('m')
    expect(mv).toContain('A mV')
    expect(mv).toContain('1000')
    expect(mv).toContain('500')
  })
  it('el eje del tiempo se lee en el prefijo elegido', () => {
    const t = dibujar(ajustes(1), { estilo: estilo({ prefijoX: 'u' }) }).textos()
    expect(t.some((x) => x.includes('en µs'))).toBe(true)
    expect(t).toContain('1000')
  })
  it('la rejilla: guiones, puntos o solo horizontales', () => {
    const rej = (e: EstiloPantalla['rejillaEstilo']) => {
      const r = dibujar(ajustes(1), { estilo: estilo({ rejillaEstilo: e }) })
      return { rejilla: r.trazos.filter((t) => t.estilo === claro.reticula), rellenos: r.rellenos() }
    }
    const lineas = rej('lineas')
    expect(lineas.rejilla[0].guiones).toBe(0)
    expect(rej('guiones').rejilla[0].guiones).toBeGreaterThan(0)
    expect(rej('puntos').rellenos).toBeGreaterThan(lineas.rellenos)
    expect(rej('puntos').rejilla).toHaveLength(0)
    expect(rej('horizontal').rejilla[0].n).toBeLessThan(lineas.rejilla[0].n)
    // Solo verticales: las nueve de las diez divisiones; con las ocho horizontales suman las de las líneas.
    expect(rej('vertical').rejilla[0].n).toBeLessThan(lineas.rejilla[0].n)
    expect(rej('vertical').rejilla[0].n + rej('horizontal').rejilla[0].n).toBe(lineas.rejilla[0].n)
  })
  it('las subdivisiones de cada eje pintan rayas más tenues entre las divisiones y los puntos no las llevan', () => {
    const tenues = (e: Partial<EstiloPantalla>) => dibujar(ajustes(1), { estilo: estilo(e) }).trazos.filter((t) => t.estilo !== claro.reticula && t.estilo.startsWith('rgba') && t.estilo.includes(', 0.5)'))
    expect(tenues({})).toHaveLength(0)
    // 10 divisiones por 4 partes: 3 rayas nuevas en cada una (30 verticales, cada raya son dos puntos del trazo).
    expect(tenues({ subdivisionesX: 4 })[0].n).toBe(30 * 2)
    // 8 divisiones por 5 partes: 4 nuevas en cada una.
    expect(tenues({ subdivisionesY: 5 })[0].n).toBe(32 * 2)
    expect(tenues({ subdivisionesX: 2, subdivisionesY: 2 })[0].n).toBe((10 + 8) * 2)
    // «Solo verticales» no pinta horizontales, tampoco las menores; «solo horizontales» al revés.
    expect(tenues({ subdivisionesX: 2, subdivisionesY: 2, rejillaEstilo: 'vertical' })[0].n).toBe(10 * 2)
    expect(tenues({ subdivisionesX: 2, subdivisionesY: 2, rejillaEstilo: 'horizontal' })[0].n).toBe(8 * 2)
    expect(tenues({ subdivisionesX: 2, subdivisionesY: 2, rejillaEstilo: 'puntos' })).toHaveLength(0)
  })
  it('cada canal usa su grosor y, sin él, el de la pantalla', () => {
    const r = dibujar(ajustes(1), { grosor: 2, estilo: estilo({ canales: { A: { grosor: 4 } } }) })
    const anchos = r.trazos.filter((t) => t.estilo === claro.canal.A || t.estilo === claro.canal.B).map((t) => ({ c: t.estilo === claro.canal.A ? 'A' : 'B', a: t.ancho }))
    expect(anchos.some((x) => x.c === 'A' && x.a === 4)).toBe(true)
    expect(anchos.some((x) => x.c === 'B' && x.a === 2)).toBe(true)
  })
  it('las asas solo se dibujan en pantalla', () => {
    expect(dibujar(ajustes(1), { asas: true }).rellenos()).toBeGreaterThan(dibujar(ajustes(1)).rellenos())
  })
  it('la lectura escribe su encabezado y el valor de cada canal; sin pantalla de datos no se dibuja', () => {
    const a = ajustes(1)
    const m = marcoDePantalla(a, 1000, 480, 1)
    const l = lecturaPantalla(pantalla(), a, m, m.x + m.w / 2)!
    const t = dibujar(a, { lectura: l }).textos()
    expect(t).toContain('t = 4 ms')
    expect(t.some((x) => x.startsWith('A') && x.includes('1 V'))).toBe(true)
  })
  it('los cursores van compactos: solo las diferencias; con el detalle, 1/Δt y los valores', () => {
    const cursores = { canal: 'A' as const, t: [2e-3, 4e-3] as [number, number], v: [-0.5, 1] as [number, number] }
    const compacto = dibujar(ajustes(1), { cursores }).textos()
    expect(compacto.some((x) => x.startsWith('Δt'))).toBe(true)
    expect(compacto.some((x) => x.startsWith('ΔV'))).toBe(true)
    expect(compacto.some((x) => x.startsWith('1/Δt') || x.startsWith('t1'))).toBe(false)
    const detalle = dibujar(ajustes(1), { cursores, detalleCursores: true }).textos()
    expect(detalle.some((x) => x.startsWith('1/Δt'))).toBe(true)
    expect(detalle.some((x) => x.startsWith('t1'))).toBe(true)
    expect(detalle.some((x) => x.startsWith('V2'))).toBe(true)
  })
  it('el tamaño del texto llega a las cifras de los ejes y la columna de la escala crece con él', () => {
    const px = (textoTam: number | null) => [...new Set(dibujar(ajustes(1), { estilo: estilo({ textoTam }) }).rotulos.filter((r) => soloCifras(r.texto)).map((r) => /(\d+)px/.exec(r.fuente)![1]))]
    expect(px(null)).toEqual(['11'])
    expect(px(20)).toEqual(['20'])
    const x = (tam: number | null) => marcoDePantalla(ajustes(1), 1000, 480, 1, { escalaTexto: tam ? tam / 11 : 1 }).x
    expect(x(22)).toBeGreaterThan(x(null))
  })
})
