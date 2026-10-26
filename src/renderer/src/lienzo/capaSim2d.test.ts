// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Aviso } from '../sim/avisos'
import type { Lectura, MedicionPieza } from '../sim/lectura'
import { textoRpm } from './avisosLienzo'
import { FLOTANTES_TRAZO, FLOTANTES_VERTICE } from './buffers'
import { construirCapaSim, piezasDeCapaSim } from './capaSim'
import { VigiaDeDestellos } from './luces'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, x = 0): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props: {} })
const doc = (...ps: Pieza[]): Documento => {
  const d = documentoVacio()
  for (const p of ps) d.piezas[p.id] = p
  return d
}
const capa = (d: Documento, piezas: Record<string, MedicionPieza>, extra: Partial<Lectura> = {}, destellos?: VigiaDeDestellos, ahora = 0) =>
  construirCapaSim(d, lib, calcularConexiones(d, lib), { t: 0, ratio: 1, redes: new Map(), piezas: new Map(Object.entries(piezas)), ...extra }, 5, PALETA_CLARA, undefined, null, [], null, destellos ? { destellos: { vigia: destellos, ahora, muestra: ahora } } : {})
const colores = (datos: Float32Array, paso: number, desde: number) => {
  const out = new Set<string>()
  for (let o = 0; o < datos.length; o += paso) out.add([datos[o + desde], datos[o + desde + 1], datos[o + desde + 2]].map((v) => v.toFixed(3)).join(','))
  return out
}
const clave = (c: readonly number[]) => [c[0], c[1], c[2]].map((v) => Math.fround(v).toFixed(3)).join(',')

describe('la vista previa de la 2D en el lienzo', () => {
  it('un LED con aviso lleva el contorno y el triángulo en ámbar y el chip con su cifra', () => {
    const d = doc(pieza('d1', 'led'))
    const aviso: Aviso = { tipo: 'led', texto: '31.6 mA, máximo 20 mA', excedido: true, hasta: Infinity, segmento: null }
    const c = capa(d, { d1: { v: 2, i: 0.0316, p: 0.06 } }, { avisos: new Map([['d1', aviso]]) })
    expect(colores(c.trazos, FLOTANTES_TRAZO, 5).has(clave(PALETA_CLARA.aviso))).toBe(true)
    expect(colores(c.triangulos, FLOTANTES_VERTICE, 2).has(clave(PALETA_CLARA.aviso))).toBe(true)
    const chip = c.textos.find((t) => t.texto === '31.6 mA, máximo 20 mA')
    expect(chip).toMatchObject({ chip: true, color: 'aviso' })
    expect(c.textos.some((t) => t.texto === '!' && t.color === 'lienzo')).toBe(true)
  })

  it('una pieza quemada lleva la cruz roja y su chip dice «quemado»', () => {
    const d = doc(pieza('d1', 'led'))
    const c = capa(d, { d1: { v: 5, i: 0, p: 0 } }, { quemadas: new Set(['d1']) })
    expect(colores(c.trazos, FLOTANTES_TRAZO, 5).has(clave(PALETA_CLARA.invalido))).toBe(true)
    expect(c.textos.find((t) => t.texto === 'quemado')).toMatchObject({ color: 'invalido', chip: true })
  })

  it('el motor lleva sus rpm y la flecha de sentido; debajo de 1 rpm, nada', () => {
    const d = doc(pieza('m1', 'motor-dc'))
    const gira = capa(d, { m1: { v: 6, i: 0.1, p: 0.6, extra: { tipo: 'motor', rpm: 6000 } } })
    expect(gira.textos.some((t) => t.texto === '6,000 rpm')).toBe(true)
    expect(gira.nTrazos).toBeGreaterThan(10)
    const quieto = capa(d, { m1: { v: 0, i: 0, p: 0, extra: { tipo: 'motor', rpm: 0.4 } } })
    expect(quieto.nTrazos).toBe(0)
    expect(textoRpm(-1234.6)).toBe('1,235 rpm')
  })

  it('el zumbador dibuja tres arcos mientras suena, con o sin sonido', () => {
    const d = doc(pieza('bz', 'zumbador'))
    expect(capa(d, { bz: { v: 5, i: 0.03, p: 0.15, extra: { tipo: 'zumbador', suena: true } } }).nTrazos).toBe(24)
    expect(capa(d, { bz: { v: 0, i: 0, p: 0, extra: { tipo: 'zumbador', suena: false } } }).nTrazos).toBe(0)
  })

  it('el foco se enciende con el cuadrado de su calentamiento y en el color de su filamento', () => {
    const d = doc(pieza('f1', 'foco'))
    const frio = capa(d, { f1: { v: 1, i: 0.1, p: 0.1, extra: { tipo: 'foco', fundido: false, calentamiento: 0.05 } } })
    expect(frio.nTriangulos).toBe(0)
    const pleno = capa(d, { f1: { v: 12, i: 0.4, p: 5, extra: { tipo: 'foco', fundido: false, calentamiento: 1 } } })
    expect(pleno.nTriangulos).toBe(72)
    expect(pleno.triangulos[2]).toBeCloseTo(PALETA_CLARA.focoPleno[0], 5)
    expect(capa(d, { f1: { v: 12, i: 0, p: 0, extra: { tipo: 'foco', fundido: true, calentamiento: 1 } } }).nTriangulos).toBe(0)
  })

  it('un LED que parpadea a 10 Hz se dibuja quieto con su brillo medio y el anillo en guiones; a 1 Hz parpadea', () => {
    const d = doc(pieza('d1', 'led'))
    const v = new VigiaDeDestellos()
    let ultima = capa(d, { d1: { v: 2, i: 0.02, p: 0.04 } }, {}, v, 0)
    for (let t = 0; t <= 1200; t += 1000 / 30) ultima = capa(d, { d1: { v: 2, i: Math.floor(t / 50) % 2 ? 0.02 : 0, p: 0 } }, {}, v, t)
    // Quieto: el disco a la opacidad del brillo medio (entre apagado y pleno) en cada cuadro.
    const alfa = ultima.triangulos[FLOTANTES_VERTICE - 1]
    expect(alfa).toBeGreaterThan(0.1)
    expect(alfa).toBeLessThan(0.45)
    // El anillo en guiones: más de 24 segmentos.
    expect(ultima.nTrazos).toBeGreaterThan(24)
  })

  it('el foco que se enciende y apaga a 5 Hz y los arcos del zumbador que suena a 5 Hz también se dibujan quietos', () => {
    const d = doc(pieza('f1', 'foco'), { ...pieza('z1', 'zumbador'), x: 30 })
    const v = new VigiaDeDestellos()
    const vistas = new Set<number>()
    for (let t = 0; t <= 2500; t += 1000 / 30) {
      const on = Math.floor(t / 100) % 2 === 1
      const c = capa(d, { f1: { v: 12, i: 0.4, p: 5, extra: { tipo: 'foco', fundido: false, calentamiento: on ? 1 : 0.15 } }, z1: { v: 5, i: 0.03, p: 0.15, extra: { tipo: 'zumbador', suena: on } } }, {}, v, t)
      if (t > 1500) vistas.add(c.nTrazos)
    }
    // Quietos: cada cuadro dibuja lo mismo (el anillo del foco en guiones y los arcos siempre).
    expect(vistas.size).toBe(1)
  })

  it('con la lista de piezas de la vista previa solo se recorren esas', () => {
    const d = doc(pieza('d1', 'led'), { ...pieza('d2', 'led'), x: 20 })
    const lecturas = { d1: { v: 2, i: 0.02, p: 0.04 }, d2: { v: 2, i: 0.02, p: 0.04 } }
    const dos = construirCapaSim(d, lib, calcularConexiones(d, lib), { t: 0, ratio: 1, redes: new Map(), piezas: new Map(Object.entries(lecturas)) }, 5, PALETA_CLARA, undefined, null, [], null, {}).nTriangulos
    const una = construirCapaSim(d, lib, calcularConexiones(d, lib), { t: 0, ratio: 1, redes: new Map(), piezas: new Map(Object.entries(lecturas)) }, 5, PALETA_CLARA, undefined, null, [], null, { piezas: piezasDeCapaSim(doc(pieza('d1', 'led')), lib) }).nTriangulos
    expect(una).toBe(dos / 2)
    // Un circuito de resistencias no tiene nada que recorrer.
    expect(piezasDeCapaSim(doc(pieza('r1', 'resistencia')), lib)).toEqual([])
  })
})
