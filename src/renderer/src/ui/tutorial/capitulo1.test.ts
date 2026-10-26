// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buscar } from '../../buscador/buscar'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import type { FaseSim } from '../../sim/control'
import { CAPITULO_1 } from './capitulo1'
import { sitioFuente, sitioLed, sitioResistencia } from './condiciones'
import type { CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Pieza['rot'], props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props })
const P = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }))

interface Opciones {
  fuente?: boolean
  r?: string | null
  led?: Pieza['rot'] | null
  cables?: boolean | 'incompleto'
  tierra?: boolean
}

/** Las piezas del capítulo en el rectángulo de líneas rectas que sugiere el tutorial, con o sin sus cables. */
function doc(opts: Opciones = {}): Documento {
  const d = documentoVacio()
  const o = { fuente: true, r: '220' as string | null, led: 90 as Pieza['rot'] | null, cables: true as boolean | 'incompleto', tierra: false, ...opts }
  if (o.fuente) d.piezas.v = pieza('v', 'fuente-dc', 'V1', 0, 0, 0)
  if (o.r !== null) d.piezas.r = pieza('r', 'resistencia', 'R1', 16, -4, 0, { valor: o.r })
  if (o.led !== null) d.piezas.d = pieza('d', 'led', 'D1', 32, 0, o.led, { color: 'rojo' })
  if (o.cables) {
    d.cables.c1 = { id: 'c1', puntos: P([0, -4], [12, -4]) }
    d.cables.c2 = { id: 'c2', puntos: P([20, -4], [32, -4]) }
    if (o.cables === true) d.cables.c3 = { id: 'c3', puntos: P([32, 4], [0, 4]) }
  }
  if (o.tierra) {
    d.piezas.g = pieza('g', 'tierra', 'GND1', 0, 12, 0)
    d.cables.c4 = { id: 'c4', puntos: P([0, 4], [0, 12]) }
  }
  return d
}

const ctx = (d: Documento, fase: FaseSim = 'detenida'): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase, centro: { x: 40, y: 10 } })
const paso = (id: string) => CAPITULO_1.pasos.find((p) => p.id === id)!

describe('capítulo 1: condiciones de los pasos', () => {
  it('tiene los 9 pasos (los 8 del plan y la tierra que pide la vista previa), con ids únicos', () => {
    expect(CAPITULO_1.pasos.map((p) => p.id)).toEqual(['fuente', 'resistencia', 'led', 'girar', 'cables', 'tierra', 'simular', 'valor', 'detener'])
    expect(CAPITULO_1.totalPasos).toBe(CAPITULO_1.pasos.length)
  })

  it('la fuente se cumple con una fuente de 5 V y no con otro voltaje', () => {
    expect(paso('fuente').hecho(ctx(documentoVacio()))).toBe(false)
    expect(paso('fuente').hecho(ctx(doc()))).toBe(true)
    const d = doc()
    d.piezas.v.props = { voltaje: '12' }
    expect(paso('fuente').hecho(ctx(d))).toBe(false)
    d.piezas.v.props = { voltaje: '5 V' }
    expect(paso('fuente').hecho(ctx(d))).toBe(true)
  })

  it('la resistencia se cumple con 220 Ω (escrito como sea) y no con otro valor', () => {
    expect(paso('resistencia').hecho(ctx(doc({ r: null })))).toBe(false)
    expect(paso('resistencia').hecho(ctx(doc({ r: '1k' })))).toBe(false)
    expect(paso('resistencia').hecho(ctx(doc({ r: '220' })))).toBe(true)
    expect(paso('resistencia').hecho(ctx(doc({ r: '0.22k' })))).toBe(true)
  })

  it('el LED se cumple con cualquier LED', () => {
    expect(paso('led').hecho(ctx(doc({ led: null })))).toBe(false)
    expect(paso('led').hecho(ctx(doc({ led: 0 })))).toBe(true)
  })

  it('girar se cumple con el cátodo abajo (90°) y no con el LED horizontal ni al revés', () => {
    expect(paso('girar').hecho(ctx(doc({ led: 0 })))).toBe(false)
    expect(paso('girar').hecho(ctx(doc({ led: 270 })))).toBe(false)
    expect(paso('girar').hecho(ctx(doc({ led: 90 })))).toBe(true)
  })

  it('los cables se cumplen con el circuito cerrado y no con un cable de menos', () => {
    expect(paso('cables').hecho(ctx(doc({ cables: false })))).toBe(false)
    expect(paso('cables').hecho(ctx(doc({ cables: 'incompleto' })))).toBe(false)
    expect(paso('cables').hecho(ctx(doc()))).toBe(true)
  })

  it('los cables no se cumplen con el LED al revés (cátodo hacia la resistencia)', () => {
    expect(paso('cables').hecho(ctx(doc({ led: 270 })))).toBe(false)
  })

  it('la tierra se cumple con una tierra unida al − de la fuente, y no con la tierra suelta ni sin cables', () => {
    expect(paso('tierra').hecho(ctx(doc()))).toBe(false)
    expect(paso('tierra').hecho(ctx(doc({ tierra: true })))).toBe(true)
    const suelta = doc({ tierra: true })
    delete suelta.cables.c4
    expect(paso('tierra').hecho(ctx(suelta))).toBe(false)
  })

  it('simular se cumple al arrancar o correr la vista previa; detener, al volver a detenida', () => {
    const d = doc()
    for (const f of ['arrancando', 'corriendo', 'pausada'] as const) expect(paso('simular').hecho(ctx(d, f))).toBe(true)
    expect(paso('simular').hecho(ctx(d, 'detenida'))).toBe(false)
    expect(paso('detener').hecho(ctx(d, 'corriendo'))).toBe(false)
    // «Detenida» solo cuenta si durante el paso se vio la simulación en marcha (el motor suma ese evento).
    expect(paso('detener').hecho(ctx(d, 'detenida'))).toBe(false)
    expect(paso('detener').hecho({ ...ctx(d, 'detenida'), eventos: new Set(['sim-activa']) })).toBe(true)
  })

  it('cambiar el valor se cumple cuando la resistencia deja de valer 220 Ω', () => {
    expect(paso('valor').hecho(ctx(doc({ r: '220' })))).toBe(false)
    expect(paso('valor').hecho(ctx(doc({ r: '1k' })))).toBe(true)
    expect(paso('valor').hecho(ctx(doc({ r: null })))).toBe(false)
  })
})

describe('capítulo 1: objetivos', () => {
  it('sin piezas, las colocaciones señalan zonas de 20 por 16 que siguen a la pieza anterior', () => {
    const c = ctx(documentoVacio())
    const z = (id: string) => {
      const o = paso(id).objetivo(c)
      if (o.tipo !== 'zona') throw new Error('no es zona')
      return o.caja
    }
    for (const id of ['fuente', 'resistencia', 'led']) expect(z(id).maxX - z(id).minX).toBe(20)
    expect(sitioResistencia(c).x - sitioFuente(c).x).toBe(16)
    expect(sitioLed(c).x - sitioResistencia(c).x).toBe(16)
  })

  it('con la fuente puesta, la resistencia se sugiere a su derecha; con todo puesto, el cableado señala el conjunto', () => {
    const c = ctx(doc({ r: null, led: null, cables: false }))
    expect(sitioResistencia(c)).toEqual({ x: 16, y: -4 })
    const o = paso('cables').objetivo(ctx(doc()))
    expect(o.tipo).toBe('zona')
    if (o.tipo === 'zona') {
      expect(o.caja.minX).toBeLessThan(0)
      expect(o.caja.maxX).toBeGreaterThan(32)
    }
  })

  it('simular y detener señalan los botones de la cinta por su comando', () => {
    expect(paso('simular').objetivo(ctx(doc()))).toEqual({ tipo: 'control', selector: '[data-comando="simular"]', pestana: 'inicio', respaldo: '[data-grupo="vista-previa"] .boton-grupo' })
    expect(paso('detener').objetivo(ctx(doc()))).toEqual({ tipo: 'control', selector: '[data-comando="detener"]', pestana: 'inicio', respaldo: '[data-grupo="vista-previa"] .boton-grupo' })
  })
})

describe('capítulo 1: lo que se pide escribir encuentra la pieza', () => {
  const primero = (q: string) => buscar(q, lib)[0]
  it('fuente dc 5, r 220 y led dan la fuente DC de 5 V, la resistencia de 220 y el LED', () => {
    expect(paso('fuente').texto).toContain('«fuente dc 5»')
    expect(paso('resistencia').texto).toContain('«r 220»')
    expect(paso('led').texto).toContain('«led»')
    expect(primero('fuente dc 5')).toMatchObject({ def: { id: 'fuente-dc' }, valor: '5' })
    expect(primero('r 220')).toMatchObject({ def: { id: 'resistencia' }, valor: '220' })
    expect(primero('led').def.id).toBe('led')
  })
})

describe('capítulo 1: textos', () => {
  it('sin guiones largos y con a lo sumo un punto y coma por texto', () => {
    for (const p of CAPITULO_1.pasos)
      for (const t of [p.texto, p.resumen, p.cumplido, p.pista ?? '']) {
        expect(t, p.id).not.toContain('—')
        expect((t.match(/;/g) ?? []).length, p.id).toBeLessThanOrEqual(1)
      }
  })
})
