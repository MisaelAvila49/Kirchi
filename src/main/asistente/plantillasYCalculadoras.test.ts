// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { escribirKir } from '../../renderer/src/archivo/kir'
import { CALCULADORAS, estadoInicial } from '../../renderer/src/calculadoras/catalogo'
import { fragmentoDeDocumento } from '../../renderer/src/plantillas/plantilla'
import { MM_POR_UNIDAD } from '../../renderer/src/doc/tipos'
import { armar } from '../../renderer/src/plantillas/armar'
import { conTextosFijos } from '../../renderer/src/plantillas/textosFijos'
import { divisor } from '../../renderer/src/prueba/circuitos'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { Herramientas, HERRAMIENTAS, type DepsHerramientas, type Respuesta } from './herramientas'
import { plantillasDeUsuario } from './plantillasUsuario'

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
  plantillas: plantillasDeUsuario(join(base, 'Plantillas')),
  ...extra
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Respuesta): any => JSON.parse((r.content[0] as { text: string }).text)
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text
const leer = async (circuito: string) => json(await h.llamar('leer_circuito', { circuito }))

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-plantillas-'))
  mkdirSync(join(base, 'datos'))
  mkdirSync(join(base, 'Plantillas', 'Mías'), { recursive: true })
  const propia = new SesionSinVentana({ lib, version: 'prueba' })
  propia.abrirDocumento(divisor())
  writeFileSync(join(base, 'Plantillas', 'Mías', 'Mi divisor.kir'), propia.guardar())
  h = new Herramientas(deps())
  await h.llamar('crear_circuito', { nombre: 'c' })
})
afterAll(() => {
  h.cerrar()
  rmSync(base, { recursive: true, force: true })
})

describe('plantillas como herramientas', () => {
  it('lista las incluidas y las del usuario, y filtra por texto sin acentos', async () => {
    const todas = json(await h.llamar('listar_plantillas', {})).plantillas as { categoria: string; nombre: string }[]
    expect(todas.some((p) => p.categoria === 'Incluidas' && p.nombre === 'Divisor de voltaje')).toBe(true)
    expect(todas).toContainEqual({ categoria: 'Mías', nombre: 'Mi divisor' })
    const notch = json(await h.llamar('listar_plantillas', { filtro: 'NOTCH' })).plantillas
    expect(notch.length).toBeGreaterThan(0)
    expect(notch.every((p: { categoria: string; nombre: string; descripcion?: string }) => /notch/i.test(`${p.nombre} ${p.descripcion ?? ''}`))).toBe(true)
    expect(json(await h.llamar('listar_plantillas', { filtro: 'mias' })).plantillas).toEqual([{ categoria: 'Mías', nombre: 'Mi divisor' }])
  })

  it('coloca una incluida por nombre, como fragmento, y se deshace de una vez', async () => {
    const r = await h.llamar('colocar_plantilla', { circuito: 'c', plantilla: 'Divisor de voltaje' })
    expect(r.isError, texto(r)).toBeUndefined()
    expect((await leer('c')).piezas).toHaveLength(4)
    await h.llamar('deshacer', { circuito: 'c' })
    expect((await leer('c')).piezas).toHaveLength(0)
  })

  it('coloca una del usuario por categoría y respeta «en»', async () => {
    const r = await h.llamar('colocar_plantilla', { circuito: 'c', plantilla: 'mi divisor', categoria: 'Mías', en: { x: 50, y: 50 } })
    expect(r.isError, texto(r)).toBeUndefined()
    const c = await leer('c')
    expect(c.piezas.length).toBeGreaterThan(0)
    expect(Math.min(...c.piezas.map((p: { x: number }) => p.x))).toBeGreaterThanOrEqual(40)
  })

  it('dice qué falta: plantilla que no existe, categoría ajena y nombres con ruta', async () => {
    expect((await h.llamar('colocar_plantilla', { circuito: 'c', plantilla: 'flux' })).isError).toBe(true)
    expect(texto(await h.llamar('colocar_plantilla', { circuito: 'c', plantilla: 'Mi divisor', categoria: 'Otra' }))).toContain('listar_plantillas')
    expect((await h.llamar('colocar_plantilla', { circuito: 'c', plantilla: '../x', categoria: 'Mías' })).isError).toBe(true)
    expect(plantillasDeUsuario(join(base, 'Plantillas')).leer('..', 'x')).toMatchObject({ ok: false })
  })
})

describe('calculadoras como herramientas', () => {
  it('calcular el divisor da valores comerciales E12 y lo que resulta con ellos', async () => {
    const r = json(await h.llamar('calcular', { calculadora: 'divisor', campos: { vin: '9', vout: '5', rtotal: '10k' } }))
    expect(r.serie).toBe('E12')
    expect(r.valores.map((v: { rotulo: string }) => v.rotulo)).toEqual(['R1', 'R2'])
    expect(r.reales[0].rotulo).toBe('Vout real')
    expect(r.ecuaciones[0].ecuacion).toContain('Vsalida')
  })

  it('los campos mal escritos y las calculadoras que no existen se rechazan con su motivo', async () => {
    expect(texto(await h.llamar('calcular', { calculadora: 'divisor', campos: { x: '1' } }))).toContain('no tiene el campo «x»')
    expect(texto(await h.llamar('calcular', { calculadora: 'divisor', campos: { vin: 'abc' } }))).toContain('vin')
    expect((await h.llamar('calcular', { calculadora: 'flux' })).isError).toBe(true)
    expect(texto(await h.llamar('calcular', { calculadora: 'divisor', serie: 'E99' }))).toContain('serie')
  })

  it('cada calculadora, con sus valores de omisión, calcula y arma su circuito', async () => {
    for (const def of CALCULADORAS) {
      const r = await h.llamar('calcular', { calculadora: def.id })
      expect(r.isError, `${def.id}: ${texto(r)}`).toBeUndefined()
    }
    for (const tipo of ['bajas', 'altas', 'pasabanda', 'rechazabanda', 'notch']) {
      const r = await h.llamar('calcular', { calculadora: 'filtro', campos: { tipo } })
      expect(r.isError, `filtro ${tipo}: ${texto(r)}`).toBeUndefined()
    }
  })

  it('generar_circuito deja el mismo circuito que «Generar circuito» del panel', async () => {
    await h.llamar('crear_circuito', { nombre: 'gen' })
    const campos = { vin: '9', vout: '5', rtotal: '10k' }
    const r = await h.llamar('generar_circuito', { circuito: 'gen', calculadora: 'divisor', campos })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(json(r).calculo.calculadora).toBe('divisor')
    // Lo que arma el panel: armar con los cables dados y fijar los textos.
    const def = CALCULADORAS.find((c) => c.id === 'divisor')!
    const armado = def.evaluar({ ...estadoInicial(def), ...campos }, { serie: 'E12', lib }).salida!.armado
    const doc = conTextosFijos(armar(armado.def, lib, armado.nombre), lib)
    const esperado = new SesionSinVentana({ lib, version: 'prueba' })
    esperado.abrir(escribirKir(doc, 'prueba'))
    const hecho = await leer('gen')
    const valores = (piezas: { ref: string; tipo: string; props?: Record<string, string> }[]) => piezas.map((p) => `${p.tipo}:${p.ref}`).sort()
    expect(valores(hecho.piezas)).toEqual(valores(Object.values(esperado.doc.piezas).map((p) => ({ ref: p.ref, tipo: p.tipo }))))
    expect(hecho.piezas).toHaveLength(Object.keys(doc.piezas).length)
    // Mismo acomodo: cada pieza en el mismo lugar respecto a la esquina del conjunto.
    const rel = (xs: { tipo: string; x: number; y: number }[]) => {
      const x0 = Math.min(...xs.map((p) => p.x)), y0 = Math.min(...xs.map((p) => p.y))
      return xs.map((p) => `${p.tipo}@${Math.round((p.x - x0) * 100)},${Math.round((p.y - y0) * 100)}`).sort()
    }
    expect(rel(hecho.piezas)).toEqual(rel(Object.values(doc.piezas).map((p) => ({ tipo: p.tipo, x: p.x * MM_POR_UNIDAD, y: p.y * MM_POR_UNIDAD }))))
  })

  it('generar_circuito del notch doble T y del 555 coloca piezas y se simula', async () => {
    await h.llamar('crear_circuito', { nombre: 'notch' })
    const n = await h.llamar('generar_circuito', { circuito: 'notch', calculadora: 'filtro', campos: { tipo: 'notch', f0: '60', cap: '100n' } })
    expect(n.isError, texto(n)).toBeUndefined()
    expect((await leer('notch')).piezas.length).toBeGreaterThan(5)
    await h.llamar('crear_circuito', { nombre: 'astable' })
    const a = await h.llamar('generar_circuito', { circuito: 'astable', calculadora: 'astable', campos: { f: '1k', d: '60', cap: '100n' }, en: { x: 0, y: 0 } })
    expect(a.isError, texto(a)).toBeUndefined()
    const s = await h.llamar('simular', { circuito: 'astable', hasta: 0.005 })
    expect(s.isError, texto(s)).toBeUndefined()
  })

  it('con un cálculo inválido no se coloca nada', async () => {
    const antes = (await leer('gen')).piezas.length
    const r = await h.llamar('generar_circuito', { circuito: 'gen', calculadora: 'divisor', campos: { vin: '5', vout: '9' } })
    expect(r.isError).toBe(true)
    expect((await leer('gen')).piezas).toHaveLength(antes)
  })
})

describe('descripciones', () => {
  const de = (n: string) => HERRAMIENTAS.find((t) => t.nombre === n)!.descripcion
  it('las herramientas que colocan llevan las reglas de acomodo y señalan las plantillas', () => {
    for (const n of ['colocar', 'aplicar_lote', 'colocar_plantilla', 'generar_circuito']) {
      expect(de(n), n).toContain('entrada a la izquierda')
      expect(de(n), n).toContain('2.5 mm')
    }
    expect(de('catalogo_piezas')).toContain('listar_plantillas')
    expect(de('leer_circuito')).toContain('listar_plantillas')
    expect(de('calcular')).toContain('divisor (vin, vout')
  })

  it('las lecturas no se anuncian como de escritura y al revés', () => {
    const lectura = (n: string) => HERRAMIENTAS.find((t) => t.nombre === n)!.lectura
    expect(['listar_plantillas', 'calcular'].every(lectura)).toBe(true)
    expect(['colocar_plantilla', 'generar_circuito', 'nombrar_red', 'analizar', 'exportar_grafica'].some(lectura)).toBe(false)
  })
})

describe('con la ventana abierta', () => {
  type Fake = { pedir(tipo: string, datos: unknown): Promise<{ ok: true; datos: unknown } | { ok: false; motivo: string }> }
  let ventana: SesionSinVentana
  let hv: Herramientas
  const pedidos: { tipo: string; datos: unknown }[] = []

  beforeAll(async () => {
    ventana = await SesionSinVentana.iniciar({ lib, wasm: bytesDelWasm(), version: 'prueba' })
    ventana.crear()
    ventana.nucleo.lectorDeArchivos = (nombre) => {
      const d = pedidos.at(-1)?.datos as { archivos?: Record<string, string> } | undefined
      const b64 = d?.archivos?.[nombre]
      if (!b64) return { motivo: `No se recibió ${nombre}.` }
      const s = new SesionSinVentana({ lib, version: 'prueba' })
      s.abrir(new Uint8Array(Buffer.from(b64, 'base64')))
      return fragmentoDeDocumento(s.doc, lib) ?? { motivo: 'vacío' }
    }
    const fake: Fake = {
      pedir: async (tipo, d) => {
        pedidos.push({ tipo, datos: d })
        return { ok: true, datos: ventana.aplicar((d as { orden: never }).orden) }
      }
    }
    hv = new Herramientas(deps({ ventana: async () => ({ ok: true, cliente: fake as never }) }))
  })
  afterAll(() => hv.cerrar())

  it('generar_circuito manda el diseño a la ventana como un archivo adjunto y lo coloca allí', async () => {
    const r = await hv.llamar('generar_circuito', { calculadora: 'led', campos: { vs: '5', i: '10m' } })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(pedidos.at(-1)).toMatchObject({ tipo: 'orden', datos: { orden: { orden: 'fragmento', archivo: 'calculadora:led' } } })
    expect(Object.keys(ventana.doc.piezas).length).toBeGreaterThan(2)
    expect(json(r).calculo.calculadora).toBe('led')
  })

  it('colocar_plantilla del usuario adjunta su archivo y la incluida va por nombre', async () => {
    const antes = Object.keys(ventana.doc.piezas).length
    const u = await hv.llamar('colocar_plantilla', { plantilla: 'Mi divisor', categoria: 'Mías' })
    expect(u.isError, texto(u)).toBeUndefined()
    expect(pedidos.at(-1)).toMatchObject({ datos: { orden: { archivo: 'plantilla:Mías/Mi divisor' } } })
    expect(Object.keys(ventana.doc.piezas).length).toBeGreaterThan(antes)
    const i = await hv.llamar('colocar_plantilla', { plantilla: 'Divisor de voltaje' })
    expect(i.isError, texto(i)).toBeUndefined()
    expect(pedidos.at(-1)).toMatchObject({ datos: { orden: { orden: 'fragmento', plantilla: 'Divisor de voltaje' } } })
  })
})
