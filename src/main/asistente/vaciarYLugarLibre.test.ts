// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cuerpoEnMundo } from '../../renderer/src/editor/colision'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { Herramientas, HERRAMIENTAS, type DepsHerramientas, type Respuesta } from './herramientas'

const lib = libreriaSinDom()
let base: string
let h: Herramientas

const deps = (extra: Partial<DepsHerramientas> = {}): DepsHerramientas => ({
  lib,
  wasm: bytesDelWasm(),
  version: 'prueba',
  dirDatos: join(base, 'datos'),
  carpetaPorOmision: join(base, 'Asistente'),
  ajustes: () => ({ activo: true, carpeta: null }),
  ...extra
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Respuesta): any => JSON.parse((r.content[0] as { text: string }).text)
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-vaciar-'))
  mkdirSync(join(base, 'datos'))
  h = new Herramientas(deps())
})
afterAll(() => {
  h.cerrar()
  rmSync(base, { recursive: true, force: true })
})

/** La caja de las piezas de un circuito de la carpeta, por referencia. */
async function cajas(nombre: string): Promise<Map<string, { minX: number; minY: number; maxX: number; maxY: number }>> {
  const s = await SesionSinVentana.iniciar({ lib, wasm: bytesDelWasm(), version: 'prueba' })
  const { readFileSync } = await import('node:fs')
  s.abrir(new Uint8Array(readFileSync(join(base, 'Asistente', `${nombre}.kir`))))
  const m = new Map(Object.values(s.doc.piezas).map((p) => [p.ref, cuerpoEnMundo(p, lib.get(p.tipo))]))
  s.cerrar()
  return m
}

describe('vaciar el circuito', () => {
  it('borra todo en un paso que se deshace, y un circuito vacío lo dice', async () => {
    await h.llamar('crear_circuito', { nombre: 'lleno' })
    expect((await h.llamar('colocar_plantilla', { circuito: 'lleno', plantilla: 'Divisor de voltaje' })).isError).toBeUndefined()
    const r = await h.llamar('vaciar_circuito', { circuito: 'lleno' })
    expect(r.isError, texto(r)).toBeUndefined()
    const vacio = json(await h.llamar('leer_circuito', { circuito: 'lleno' }))
    expect([vacio.piezas, vacio.redes, vacio.etiquetas, vacio.analisis].map((x: unknown[]) => x.length)).toEqual([0, 0, 0, 0])
    const otra = await h.llamar('vaciar_circuito', { circuito: 'lleno' })
    expect(otra.isError).toBe(true)
    expect(texto(otra)).toBe('El circuito ya está vacío.')
    await h.llamar('deshacer', { circuito: 'lleno' })
    expect(json(await h.llamar('leer_circuito', { circuito: 'lleno' })).piezas.length).toBe(4)
    expect(HERRAMIENTAS.find((t) => t.nombre === 'vaciar_circuito')?.lectura).toBe(false)
  })

  it('con el circuito en la ventana la orden va allí', async () => {
    const pedidos: unknown[] = []
    const fake = { pedir: async (_t: string, d: unknown) => (pedidos.push(d), { ok: true as const, datos: { ok: true, creados: {}, avisos: [] } }) }
    const hv = new Herramientas(deps({ ventana: async () => ({ ok: true, cliente: fake as never }) }))
    expect((await hv.llamar('vaciar_circuito', {})).isError).toBeUndefined()
    expect(pedidos).toEqual([{ orden: { orden: 'vaciar' } }])
    hv.cerrar()
  })
})

describe('lugar libre para plantillas y calculadoras', () => {
  it('sin «en», o si «en» choca, lo nuevo va debajo de lo que hay con 10 mm de aire y sin encimarse', async () => {
    await h.llamar('crear_circuito', { nombre: 'dos-notch' })
    const a = await h.llamar('generar_circuito', { circuito: 'dos-notch', calculadora: 'filtro', campos: { tipo: 'notch', f0: '60' } })
    expect(a.isError, texto(a)).toBeUndefined()
    const primeras = await cajas('dos-notch')
    const fondo = Math.max(...[...primeras.values()].map((c) => c.maxY))
    // La segunda versión pide el mismo lugar que la primera: choca y busca debajo.
    const b = await h.llamar('generar_circuito', { circuito: 'dos-notch', calculadora: 'filtro', campos: { tipo: 'notch', f0: '60' }, serie: 'libre', en: { x: 0, y: 0 } })
    expect(b.isError, texto(b)).toBeUndefined()
    expect(json(b).avisos.join(' ')).toMatch(/Ahí no había lugar: se colocó en \{ x: -?[\d.]+, y: [\d.]+ \} mm, debajo/)
    const todas = await cajas('dos-notch')
    const nuevas = [...todas].filter(([ref]) => !primeras.has(ref)).map(([, c]) => c)
    expect(nuevas.length).toBe(primeras.size)
    // 10 mm son 8 unidades de 1.25 mm.
    expect(Math.min(...nuevas.map((c) => c.minY)) - fondo).toBeGreaterThanOrEqual(8)
    const c = await h.llamar('colocar_plantilla', { circuito: 'dos-notch', plantilla: 'Divisor de voltaje' })
    expect(c.isError, texto(c)).toBeUndefined()
    expect(Math.min(...[...(await cajas('dos-notch'))].filter(([ref]) => !todas.has(ref)).map(([, x]) => x.minY))).toBeGreaterThan(Math.max(...nuevas.map((x) => x.maxY)))
  })

  it('la serie «libre» deja los valores exactos en el circuito y las descripciones lo dicen', async () => {
    await h.llamar('crear_circuito', { nombre: 'exacto' })
    const r = json(await h.llamar('generar_circuito', { circuito: 'exacto', calculadora: 'filtro', campos: { tipo: 'notch', f0: '60' }, serie: 'libre' }))
    expect(r.calculo.serie).toBe('libre')
    const corto = (v: string) => v.replace(/[\sΩF]/g, '').replace('µ', 'u')
    const valores = json(await h.llamar('leer_circuito', { circuito: 'exacto' })).piezas.map((p: { valor?: string }) => corto(p.valor ?? ''))
    const numericos = r.calculo.valores.filter((v: { exacto: string }) => /^\d/.test(v.exacto))
    expect(numericos.length).toBeGreaterThan(0)
    for (const v of numericos) expect(valores, JSON.stringify(v)).toContain(corto(v.comercial ?? v.exacto))
    for (const n of ['calcular', 'generar_circuito']) expect(HERRAMIENTAS.find((t) => t.nombre === n)!.descripcion).toMatch(/«libre» los valores son los exactos/)
  })
})
