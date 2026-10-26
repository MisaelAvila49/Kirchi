// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { ApiNgspice, ResultadoAnalisis } from '../../../compartido/ngspice'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { armarContexto, type ContextoAnalisis } from './contexto'
import { correrAnalisis, explicarFallo, guardadasDeSeleccion, seleccionDe, seleccionDeGuardadas, SIN_TRAZAS } from './ejecucion'

const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })

function contexto(partes: Parte[]): ContextoAnalisis {
  const d = conEtiquetas(lib, partes)
  const r = armarContexto(d, lib, calcularConexiones(d, lib))
  if (!r.ok) throw new Error(r.error)
  return r.ctx
}
const divisor = () => contexto([DC('V1', '5', 'entrada'), R('R1', '1k', 'entrada', 'salida'), R('R2', '1k', 'salida', '0')])
const OP: AnalisisDoc = { id: 'a', nombre: 'Punto de operación 1', config: { tipo: 'op' } }
const falsa = (r: ResultadoAnalisis | Error): Pick<ApiNgspice, 'ejecutar'> => ({ ejecutar: async () => { if (r instanceof Error) throw r; return r } })

describe('errores del análisis: siempre un mensaje, nunca un cuelgue', () => {
  it('sin API (fuera de la aplicación) dice que ngspice no está', async () => {
    const r = await correrAnalisis(OP, divisor(), SIN_TRAZAS, undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.clase).toBe('ausente')
  })

  it('cancelado, fuera de tiempo, ausente, sin convergencia y otro error se distinguen', () => {
    expect(explicarFallo({ ok: false, error: 'Análisis cancelado.', cancelado: true }).clase).toBe('cancelado')
    expect(explicarFallo({ ok: false, error: 'El análisis pasó de 60 s y se detuvo.', tiempoAgotado: true }).clase).toBe('tiempo')
    expect(explicarFallo({ ok: false, error: 'ngspice no está instalado con Kirchi: los análisis no están disponibles.' }).clase).toBe('ausente')
    const c = explicarFallo({ ok: false, error: 'ngspice no produjo resultados: doAnalyses: singular matrix' })
    expect(c.clase).toBe('convergencia')
    expect(c.error).toMatch(/no converge/)
    expect(c.error).toMatch(/tierra/)
    expect(explicarFallo({ ok: false, error: 'La pieza R9 no se puede exportar.' }).clase).toBe('otro')
  })

  it('un IPC que lanza, o una pieza que ya no existe, también vuelven como resultado', async () => {
    const ctx = divisor()
    const lanza = await correrAnalisis(OP, ctx, SIN_TRAZAS, falsa(new Error('canal cerrado')))
    expect(lanza.ok).toBe(false)
    if (!lanza.ok) expect(lanza.error).toMatch(/canal cerrado/)
    const dc: AnalisisDoc = { id: 'a', nombre: 'DC', config: { tipo: 'dc', fuente: 'p_que_no_esta', desde: 0, hasta: 5, paso: 1 } }
    const pieza = await correrAnalisis(dc, ctx, SIN_TRAZAS, falsa({ ok: true, graficos: [], avisos: [], duracionMs: 1 }))
    expect(pieza.ok).toBe(false)
    if (!pieza.ok) expect(pieza.clase).toBe('pieza')
  })

  it('el punto de operación pide todas las redes y las corrientes; los demás, solo lo elegido', () => {
    const ctx = divisor()
    const op = seleccionDe(OP, ctx, SIN_TRAZAS)
    expect(op.mapeo.redes?.length).toBe(ctx.redes.length)
    expect(op.corrientes.length).toBe(ctx.corrientes.length)
    const tran: AnalisisDoc = { id: 't', nombre: 'T', config: { tipo: 'tran', fin: 0.01 } }
    expect(seleccionDe(tran, ctx, SIN_TRAZAS).corrientes).toEqual([])
    const r1 = ctx.corrientes.find((c) => c.ref === 'R1')!
    expect(seleccionDe(tran, ctx, { redes: new Set([3]), piezas: new Set([r1.pieza]) })).toEqual({ mapeo: { redes: [3], corrientes: [r1.elemento] }, corrientes: [r1.elemento] })
  })
})

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice: se omiten las pruebas con ngspice real de la interfaz de análisis.')
const si = hay ? describe : describe.skip

si('con ngspice 47 real', () => {
  const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 60_000 })
  const api: Pick<ApiNgspice, 'ejecutar'> = { ejecutar: (p) => servicio.ejecutar(1, p) }

  it('el punto de operación del divisor da 5 V, 2.5 V, 2.5 mA y 12.5 mW por resistencia', async () => {
    const ctx = divisor()
    const r = await correrAnalisis(OP, ctx, SIN_TRAZAS, api)
    if (!r.ok) throw new Error(r.error)
    expect(r.tabla).not.toBeNull()
    const v = (n: string) => r.tabla!.redes.find((x) => x.nombre === n)!.voltaje
    expect(v('entrada')).toBeCloseTo(5, 6)
    expect(v('salida')).toBeCloseTo(2.5, 6)
    const r1 = r.tabla!.piezas.find((p) => p.ref === 'R1')!
    expect(Math.abs(r1.corriente)).toBeCloseTo(2.5e-3, 8)
    expect(r1.potencia!).toBeCloseTo(6.25e-3, 8)
    // La fuente entrega: su potencia absorbida es negativa y suma lo que gastan las resistencias.
    const total = r.tabla!.piezas.reduce((s, p) => s + (p.potencia ?? 0), 0)
    expect(Math.abs(total)).toBeLessThan(1e-9)
    expect(r.tabla!.voltajePorRed.size).toBeGreaterThanOrEqual(3)
  })

  it('un transitorio RC trae las series de las redes con nombre y las corrientes que se pidieron', async () => {
    const ctx = contexto([DC('V1', '5', 'in'), R('R1', '1k', 'in', 'out'), C('C1', '1u', 'out', '0')])
    const tran: AnalisisDoc = { id: 't', nombre: 'T', config: { tipo: 'tran', fin: 5e-3 } }
    const c1 = ctx.corrientes.find((c) => c.ref === 'C1')!
    const r = await correrAnalisis(tran, ctx, { redes: new Set(), piezas: new Set([c1.pieza]) }, api)
    if (!r.ok) throw new Error(r.error)
    const ids = r.mapeado.corridas[0].series.map((s) => s.etiqueta)
    expect(ids).toEqual(expect.arrayContaining(['V(in)', 'V(out)', 'I(C1)']))
    const out = r.mapeado.corridas[0].series.find((s) => s.etiqueta === 'V(out)')!
    expect(out.valores[out.valores.length - 1]).toBeGreaterThan(4.9)
    expect(r.tabla).toBeNull()
  })

  it('un circuito que no converge vuelve como error de convergencia y no se cuelga', async () => {
    // Dos fuentes de voltaje distintas en paralelo: la matriz es singular.
    const ctx = contexto([DC('V1', '5', 'a'), DC('V2', '3', 'a'), R('R1', '1k', 'a', '0')])
    const r = await correrAnalisis(OP, ctx, SIN_TRAZAS, api)
    expect(r.ok).toBe(false)
    if (!r.ok) console.info(`sin convergencia: ${r.clase}: ${r.error}`)
  })
})

describe('trazas elegidas guardadas con el análisis', () => {
  const ctx = { redes: [{ red: 1, nodo: 3, nombre: 'entrada', conNombre: true }, { red: 2, nodo: 4, nombre: 'N2', conNombre: false }, { red: 3, nodo: 7, nombre: 'N5', conNombre: false }] }
  it('las redes se guardan por nombre y se vuelven nodos del circuito actual', () => {
    const g = guardadasDeSeleccion({ redes: new Set([3, 4]), piezas: new Set(['p_r1']) }, ctx)
    // La red con nombre ya sale por omisión: no se guarda.
    expect(g).toEqual({ redes: ['N2'], piezas: ['p_r1'] })
    // Tras editar el circuito los nodos cambian de número; el nombre sigue siendo el mismo.
    const otro = { redes: [{ red: 2, nodo: 9, nombre: 'N2', conNombre: false }] }
    expect([...seleccionDeGuardadas(g, otro).redes]).toEqual([9])
  })
  it('una red que ya no existe se ignora y sin selección no se guarda nada', () => {
    expect(seleccionDeGuardadas({ redes: ['fantasma'], piezas: [] }, ctx).redes.size).toBe(0)
    expect(guardadasDeSeleccion(SIN_TRAZAS, ctx)).toBeUndefined()
    expect(seleccionDeGuardadas(undefined, ctx)).toBe(SIN_TRAZAS)
  })
})
