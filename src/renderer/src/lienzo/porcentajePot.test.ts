// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento, Pieza } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { pinesEnMundo } from '../piezas/transformar'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { ponerTextoAjuste } from './ajusteEnPieza'
import { cajaTexto } from './apartar'
import { construirCapaSim } from './capaSim'
import { PALETA_CLARA } from './paleta'
import { porcentajesDePot } from './porcentajePot'

const lib = libreriaDePrueba().piezas

function conPot(posicion: string, rot: Pieza['rot'] = 0, espejo = false): Documento {
  const d = divisor()
  delete d.piezas.p_r1
  delete d.piezas.p_r2
  d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: -8, rot, espejo, props: { valor: '10k', posicion, junto: 'Ajuste' } }
  d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
  return d
}
const solapan = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

describe('porcentaje del cursor junto al potenciómetro', () => {
  it('escribe la posición («25 %») junto al pin del cursor', () => {
    const d = conPot('25 %')
    const [t] = porcentajesDePot(d, lib, new Set(['p_rv']), [], [])
    expect(t.texto).toBe('25 %')
    const cursor = pinesEnMundo(d.piezas.p_rv, lib.get('potenciometro')!).find((q) => q.id === '3')!
    expect(Math.hypot(t.x - cursor.x, t.y - cursor.y)).toBeLessThan(6)
    expect(t.tamaño).toBeLessThan(1.6)
  })

  afterEach(() => ponerTextoAjuste('Valores'))

  it('solo aparece si «Mostrar» pide el ajuste: con los valores, ambos, nada o lo de Configuración', () => {
    const textos = (junto: string | undefined) => {
      const d = conPot('25 %')
      if (junto === undefined) delete d.piezas.p_rv.props.junto
      else d.piezas.p_rv.props.junto = junto
      return porcentajesDePot(d, lib, new Set(['p_rv']), [], []).map((t) => t.texto)
    }
    expect(textos('Valores')).toEqual([])
    expect(textos('Nada')).toEqual([])
    expect(textos('Ajuste')).toEqual(['25 %'])
    expect(textos('Ambos')).toEqual(['25 %'])
    // Sin la opción guardada la pieza sigue a Configuración, que por omisión dice los valores.
    expect(textos(undefined)).toEqual([])
    ponerTextoAjuste('Ajuste')
    expect(textos(undefined)).toEqual(['25 %'])
    ponerTextoAjuste('Ambos')
    expect(textos(undefined)).toEqual(['25 %'])
    ponerTextoAjuste('Nada')
    expect(textos(undefined)).toEqual([])
  })

  it('al mover la perilla simulando, la capa no escribe el porcentaje si no se pidió', () => {
    const d = conPot('75 %')
    d.piezas.p_rv.props.junto = 'Valores'
    const con = calcularConexiones(d, lib)
    const l: Lectura = { t: 0, ratio: 1, redes: new Map(), piezas: new Map([['p_rv', { v: 5, i: 0.0005, p: 0.0025, cursor: 3.75 }]]) }
    expect(construirCapaSim(d, lib, con, l, 5, PALETA_CLARA, undefined, null).textos.some((t) => t.texto === '75 %')).toBe(false)
  })

  it('solo aparece si la pieza se simula', () => {
    expect(porcentajesDePot(conPot('25 %'), lib, new Set(), [], [])).toEqual([])
  })

  for (const rot of [0, 90, 180, 270] as const)
    for (const espejo of [false, true])
      it(`no se encima con el cuerpo, un cable ni otro texto a ${rot}°${espejo ? ' con espejo' : ''}`, () => {
        const d = conPot('75 %', rot, espejo)
        const pt = d.piezas.p_rv
        const cursor = pinesEnMundo(pt, lib.get('potenciometro')!).find((q) => q.id === '3')!
        // Un cable que sale del cursor hacia afuera y un texto cerca.
        const fuera = { x: Math.sign(cursor.x - pt.x) * 4 + cursor.x, y: Math.sign(cursor.y - pt.y) * 4 + cursor.y }
        d.cables.c_c = { id: 'c_c', puntos: [{ x: cursor.x, y: cursor.y }, fuera] }
        const [t] = porcentajesDePot(d, lib, new Set(['p_rv']), [], [])
        const b = cajaTexto(t)
        const c = cuerpoEnMundo(pt, lib.get('potenciometro'))
        expect(solapan(b, c)).toBe(false)
        const m = 0.2
        const cable = { minX: Math.min(cursor.x, fuera.x) - m, maxX: Math.max(cursor.x, fuera.x) + m, minY: Math.min(cursor.y, fuera.y) - m, maxY: Math.max(cursor.y, fuera.y) + m }
        expect(solapan(b, cable)).toBe(false)
      })

  it('esquiva un texto de la escena y un chip que ya están en el primer lugar', () => {
    const d = conPot('50 %')
    const [libre] = porcentajesDePot(d, lib, new Set(['p_rv']), [], [])
    const estorbo = { texto: 'R9', x: libre.x, y: libre.y, alinear: libre.alinear, tamaño: 1.6, color: 'valor' as const, fuente: 'cifras' as const }
    const [otro] = porcentajesDePot(d, lib, new Set(['p_rv']), [estorbo], [])
    expect(solapan(cajaTexto(otro), cajaTexto(estorbo))).toBe(false)
    expect([otro.x, otro.y]).not.toEqual([libre.x, libre.y])
    const chip = { ...estorbo, texto: '2.50 V', chip: true }
    const [conChip] = porcentajesDePot(d, lib, new Set(['p_rv']), [], [chip])
    expect(solapan(cajaTexto(conChip), cajaTexto(chip))).toBe(false)
  })

  it('dos potenciómetros no se pisan sus porcentajes y el resultado no depende del orden', () => {
    const d = conPot('25 %')
    d.piezas.p_rv2 = { ...d.piezas.p_rv, id: 'p_rv2', ref: 'RV2', x: 10, y: -8 + 2, props: { valor: '10k', posicion: '80 %', junto: 'Ajuste' } }
    const v = porcentajesDePot(d, lib, new Set(['p_rv', 'p_rv2']), [], [])
    expect(v.map((t) => t.texto).sort()).toEqual(['25 %', '80 %'])
    expect(solapan(cajaTexto(v[0]), cajaTexto(v[1]))).toBe(false)
    const invertido: Documento = { ...d, piezas: { p_rv2: d.piezas.p_rv2, p_rv: d.piezas.p_rv } }
    expect(porcentajesDePot(invertido, lib, new Set(['p_rv', 'p_rv2']), [], [])).toEqual(v)
  })

  it('la capa de la vista previa lo lleva entre sus textos junto al chip de voltaje', () => {
    const d = conPot('25 %')
    const con = calcularConexiones(d, lib)
    const redes = new Map<number, number>()
    for (const r of con.redes) redes.set(r.id, 1)
    const l: Lectura = { t: 0, ratio: 1, redes, piezas: new Map([['p_rv', { v: 5, i: 0.0005, p: 0.0025, cursor: 3.75 }]]) }
    const capa = construirCapaSim(d, lib, con, l, 5, PALETA_CLARA)
    expect(capa.textos.some((t) => t.texto === '25 %' && !t.chip)).toBe(true)
    expect(capa.textos.some((t) => t.chip)).toBe(true)
    const sinChips = construirCapaSim(d, lib, con, l, 5, PALETA_CLARA, undefined, null)
    expect(sinChips.textos.map((t) => t.texto)).toEqual(['25 %'])
  })
})
