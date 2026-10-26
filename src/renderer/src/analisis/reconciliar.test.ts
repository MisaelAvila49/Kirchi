// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { peticionDe } from '../../../compartido/analisis/peticion'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { Editor } from '../editor/Editor'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { armarContexto } from './contexto'
import { nombraPiezaAusente, reconciliarAnalisis, seDescartaAlCancelar } from './fichas'

const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const GEN = (a: string): Parte => ({ tipo: 'generador', ref: 'XFG1', props: { frecuencia: '1k', amplitud: '2' }, pines: { '+': a, COM: '0' } })
const RIEL: Parte = { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: '+15V' }, pines: { '1': '+15V' } }

const filtro = (extra: Parte[] = []) => conEtiquetas(lib, [...extra, GEN('entrada'), R('R1', '1k', 'entrada', 'salida'), C('C1', '100n', 'salida', '0')])
const ctxDe = (d: ReturnType<typeof filtro>) => {
  const r = armarContexto(d, lib, calcularConexiones(d, lib))
  if (!r.ok) throw new Error(r.error)
  return r.ctx
}
const bode = (fuente: string): AnalisisDoc => ({ id: 'a1', nombre: 'CA / Bode 1', config: { tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e6, fuente, magnitud: 1 } })

describe('análisis guardados frente a un circuito que cambió', () => {
  it('la secuencia del usuario: borrar todo, otro filtro, y el Bode usa el generador nuevo sin mostrar ids', () => {
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => undefined })
    ed.cargar(filtro(), { soloLectura: false })
    const viejo = Object.values(ed.doc.piezas).find((p) => p.tipo === 'generador')!.id
    expect(ed.guardarAnalisis(bode(viejo))).toBeNull()
    // Se borran todas las piezas y llega un filtro nuevo, con una resistencia delante para que los ids no coincidan.
    ed.cargar(filtro([R('R0', '10k', 'entrada', '0')]), { soloLectura: false })
    ed.guardarAnalisis(bode('p_45077871f5'))
    const doc = ed.doc
    const a = doc.analisis!.a1
    const ctx = ctxDe(doc)
    // Sin arreglar, armar la petición da un error que no nombra el id interno.
    const sin = peticionDe(a, { netlist: ctx.netlist, piezaDeElemento: ctx.piezaDeElemento, nombreDePieza: ctx.nombres.pieza })
    expect(sin.ok).toBe(false)
    if (!sin.ok) expect(sin.error).not.toMatch(/p_45077871f5/)
    const q = reconciliarAnalisis(a, ctx)
    const nuevo = ctx.fuentes.find((f) => f.clase === 'generador')!
    expect(q.analisis.config).toMatchObject({ tipo: 'ac', fuente: nuevo.id })
    expect(q.cambios).toEqual([`CA / Bode 1: la entrada de CA ya no estaba en el circuito y ahora es XFG1.`])
    expect(q.cambios.join()).not.toMatch(/p_\w{5,}/)
    expect(q.pendientes).toEqual([])
    const listo = peticionDe(q.analisis, { netlist: ctx.netlist, piezaDeElemento: ctx.piezaDeElemento })
    expect(listo.ok).toBe(true)
    // Guardarlo es un solo paso de deshacer.
    expect(ed.guardarAnalisis(q.analisis)).toBeNull()
    expect((ed.doc.analisis!.a1.config as { fuente: string }).fuente).toBe(nuevo.id)
  })

  it('la entrada de CA nunca pasa a un riel: con solo rieles queda pendiente y sin id', () => {
    const d = conEtiquetas(lib, [RIEL, R('R1', '1k', '+15V', '0')])
    const ctx = ctxDe(d)
    const q = reconciliarAnalisis(bode('p_borrada1'), ctx)
    expect(q.analisis.config).toMatchObject({ fuente: 'p_borrada1' })
    expect(q.cambios).toEqual([])
    expect(q.pendientes).toHaveLength(1)
    expect(q.pendientes[0]).toMatch(/alimentación/)
    expect(q.pendientes[0]).not.toMatch(/p_borrada1/)
  })

  it('una fuente de CD o una pieza barrida ausentes pasan a las de omisión; una segunda sin reemplazo se quita', () => {
    const d = conEtiquetas(lib, [{ tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } }, R('R1', '1k', 'a', '0')])
    const ctx = ctxDe(d)
    const dc: AnalisisDoc = { id: 'a2', nombre: 'Barrido de CD 1', config: { tipo: 'dc', fuente: 'p_x', desde: 0, hasta: 5, paso: 0.5, segunda: { fuente: 'p_y', desde: 0, hasta: 1, paso: 0.5 } } }
    const q = reconciliarAnalisis(dc, ctx)
    expect(q.analisis.config).toMatchObject({ fuente: ctx.fuentes[0].id })
    expect((q.analisis.config as { segunda?: unknown }).segunda).toBeUndefined()
    expect(q.cambios).toHaveLength(2)
    const par: AnalisisDoc = { id: 'a3', nombre: 'Barrido de parámetro 1', config: { tipo: 'op' }, parametro: { pieza: 'p_z', modo: 'lineal', desde: 1, hasta: 2, puntos: 3 } }
    const w = reconciliarAnalisis(par, ctx)
    expect(w.analisis.parametro?.pieza).toBe(ctx.barribles[0].id)
    expect(w.cambios[0]).toMatch(/ahora es R1/)
  })

  it('un análisis al día no cambia nada', () => {
    const ctx = ctxDe(filtro())
    const g = ctx.fuentes.find((f) => f.clase === 'generador')!
    const a = bode(g.id)
    const q = reconciliarAnalisis(a, ctx)
    expect(q.analisis).toBe(a)
    expect(q.cambios).toEqual([])
  })

  it('nombraPiezaAusente mira solo los ids del documento', () => {
    expect(nombraPiezaAusente(bode('p_45077871f5'), { p_1: {} })).toBe(true)
    expect(nombraPiezaAusente(bode('p_1'), { p_1: {} })).toBe(false)
    expect(nombraPiezaAusente({ id: 'a', nombre: 'T', config: { tipo: 'tran', fin: 1 } }, {})).toBe(false)
  })
})

describe('Cancelar con la ficha en reposo', () => {
  it('descarta lo creado desde la ficha y nunca ejecutado; lo demás solo se cierra', () => {
    const nuevos = new Set(['a1'])
    expect(seDescartaAlCancelar('a1', nuevos, [])).toBe(true)
    expect(seDescartaAlCancelar('a1', nuevos, [{ analisisId: 'a1' }])).toBe(false)
    expect(seDescartaAlCancelar('a2', nuevos, [])).toBe(false)
  })

  it('borrar el análisis recién creado es un paso de deshacer que lo devuelve', () => {
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => undefined })
    ed.cargar(filtro(), { soloLectura: false })
    ed.guardarAnalisis({ id: 'a1', nombre: 'Punto de operación 1', config: { tipo: 'op' } })
    ed.borrarAnalisis('a1')
    expect(ed.doc.analisis?.a1).toBeUndefined()
    ed.deshacer()
    expect(ed.doc.analisis?.a1).toBeDefined()
  })
})

describe('Cancelar con la ficha en reposo', () => {
  it('descarta lo creado desde la ficha y nunca ejecutado; lo demás solo se cierra', () => {
    const nuevos = new Set(['a1'])
    expect(seDescartaAlCancelar('a1', nuevos, [])).toBe(true)
    expect(seDescartaAlCancelar('a1', nuevos, [{ analisisId: 'a1' }])).toBe(false)
    expect(seDescartaAlCancelar('a2', nuevos, [])).toBe(false)
  })

  it('borrar el análisis recién creado es un paso de deshacer que lo devuelve', () => {
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => undefined })
    ed.cargar(filtro(), { soloLectura: false })
    ed.guardarAnalisis({ id: 'a1', nombre: 'Punto de operación 1', config: { tipo: 'op' } })
    ed.borrarAnalisis('a1')
    expect(ed.doc.analisis?.a1).toBeUndefined()
    ed.deshacer()
    expect(ed.doc.analisis?.a1).toBeDefined()
  })
})
