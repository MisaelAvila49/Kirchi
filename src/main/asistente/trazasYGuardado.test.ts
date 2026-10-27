// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerKir } from '../../renderer/src/archivo/kir'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { carpetaHerramientas } from '../recursos'
import { localizarNgspice, ServicioNgspice } from '../servicioNgspice'
import { Herramientas, type DepsHerramientas, type Respuesta } from './herramientas'

// Con ngspice 47 real; sin `herramientas/ngspice` las pruebas que lo usan se omiten, como en las demás.
const raiz = join(import.meta.dirname, '../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })

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
  analisis: (p) => servicio.ejecutar(0, p),
  ...extra
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Respuesta): any => JSON.parse((r.content[0] as { text: string }).text)
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text

/** Divisor de 9 V con 10 kΩ y 4.7 kΩ, sin ninguna etiqueta: el punto medio mide 2.878 V. */
const DIVISOR = [
  { orden: 'colocar', tipo: 'fuente-dc', clave: 'v', en: { x: 0, y: 0 }, props: { voltaje: '9' } },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r1', en: { x: 25, y: -5 }, valor: '10k' },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r2', en: { x: 50, y: 0 }, valor: '4.7k' },
  { orden: 'colocar', tipo: 'tierra', clave: 'g', en: { x: 50, y: 15 } },
  { orden: 'conectar', desde: 'v.+', hasta: 'r1.1' },
  { orden: 'conectar', desde: 'r1.2', hasta: 'r2.1' },
  { orden: 'conectar', desde: 'r2.2', hasta: 'g.1' },
  { orden: 'conectar', desde: 'v.-', hasta: 'g.1' }
]
const DC = { tipo: 'dc', fuente: 'V1', desde: 0, hasta: 9, paso: 1 }

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-trazas-'))
  mkdirSync(join(base, 'datos'))
  h = new Herramientas(deps())
  await h.llamar('crear_circuito', { nombre: 'divisor' })
  const r = await h.llamar('aplicar_lote', { circuito: 'divisor', ordenes: DIVISOR })
  if (r.isError) throw new Error(texto(r))
})
afterAll(() => {
  h.cerrar()
  rmSync(base, { recursive: true, force: true })
})

const guardado = (nombre: string) => {
  const l = leerKir(new Uint8Array(readFileSync(join(base, 'Asistente', `${nombre}.kir`))))
  if (!l.ok) throw new Error(l.error)
  return l.doc
}

describe.skipIf(!hay)('análisis con trazas por patilla', () => {
  it('traza una red sin nombre por su patilla y la rotula con ella', async () => {
    const r = json(await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R1.2'] }))
    expect(r.ok).toBe(true)
    const serie = r.corridas[0].series.find((s: { nombre: string }) => s.nombre === 'V(R1.2)')
    expect(serie).toBeDefined()
    expect(serie.valores.at(-1)).toBeCloseTo((9 * 4.7) / 14.7, 2)
  })

  it('la patilla y «red de» dan la misma red, y la tierra se rechaza con su motivo', async () => {
    const a = json(await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['red de R2.1'] }))
    expect(a.corridas[0].series.map((s: { nombre: string }) => s.nombre)).toContain('V(R2.1)')
    const tierra = await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R2.2'] })
    expect(tierra.isError).toBe(true)
    expect(texto(tierra)).toContain('tierra')
    expect((await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R9.1'] })).isError).toBe(true)
  })

  it('con la red nombrada, la traza lleva su nombre y se pide también por él', async () => {
    await h.llamar('crear_circuito', { nombre: 'con-nombre' })
    await h.llamar('aplicar_lote', { circuito: 'con-nombre', ordenes: DIVISOR })
    const n = await h.llamar('nombrar_red', { circuito: 'con-nombre', punto: 'R1.2', nombre: 'SALIDA' })
    expect(n.isError, texto(n)).toBeUndefined()
    expect(json(await h.llamar('leer_circuito', { circuito: 'con-nombre' })).redes.map((x: { nombre?: string }) => x.nombre)).toContain('SALIDA')
    const porNombre = json(await h.llamar('analizar', { circuito: 'con-nombre', config: DC, trazas: ['SALIDA'] }))
    expect(porNombre.corridas[0].series.map((s: { nombre: string }) => s.nombre)).toContain('V(SALIDA)')
    const porPatilla = json(await h.llamar('analizar', { circuito: 'con-nombre', config: DC, trazas: ['R2.1'] }))
    expect(porPatilla.corridas[0].series.map((s: { nombre: string }) => s.nombre)).toContain('V(SALIDA)')
  })

  it('con corrientes grafica la corriente de la pieza', async () => {
    const r = json(await h.llamar('analizar', { circuito: 'divisor', config: DC, corrientes: ['R1'] }))
    expect(r.corridas[0].series.some((s: { nombre: string }) => /R1/.test(s.nombre))).toBe(true)
  })
})

describe('guardar el análisis en el documento', () => {
  it('pide un nombre, guarda en el .kir y el mismo nombre lo reemplaza', async () => {
    const sinNombre = await h.llamar('analizar', { circuito: 'divisor', config: { tipo: 'op' }, guardar: true })
    expect(sinNombre.isError).toBe(true)
    expect(texto(sinNombre)).toContain('nombre')
    if (!hay) return
    const r = json(await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R1.2'], nombre: 'Barrido del divisor', guardar: true }))
    expect(r.guardado).toBe('Barrido del divisor')
    expect(r.avisos[0]).toMatch(/«R1.2» no tiene nombre: .* «red [0-9]+»/)
    const a = Object.values(guardado('divisor').analisis ?? {})
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ nombre: 'Barrido del divisor', config: { tipo: 'dc', hasta: 9 }, trazas: { redes: [expect.stringMatching(/^red [0-9]+$/)] } })
    // Lo que guarda es lo que el panel Análisis lee: aparece al describir el circuito.
    expect(json(await h.llamar('leer_circuito', { circuito: 'divisor' })).analisis).toEqual([{ nombre: 'Barrido del divisor', tipo: 'dc' }])
    await h.llamar('analizar', { circuito: 'divisor', config: { ...DC, hasta: 5 }, nombre: 'barrido del divisor', guardar: true })
    const b = Object.values(guardado('divisor').analisis ?? {})
    expect(b).toHaveLength(1)
    expect(b[0].id).toBe(a[0].id)
    expect(b[0].config).toMatchObject({ hasta: 5 })
  })

  it('sin guardar, el análisis no toca el documento', async () => {
    await h.llamar('crear_circuito', { nombre: 'sin-guardar' })
    await h.llamar('aplicar_lote', { circuito: 'sin-guardar', ordenes: DIVISOR })
    await h.llamar('analizar', { circuito: 'sin-guardar', config: { tipo: 'op' } })
    expect(guardado('sin-guardar').analisis).toBeUndefined()
  })

  it('una orden «analisis» de un lote se deshace con el resto', async () => {
    await h.llamar('crear_circuito', { nombre: 'en-lote' })
    const r = await h.llamar('aplicar_lote', { circuito: 'en-lote', ordenes: [...DIVISOR, { orden: 'analisis', nombre: 'Op', config: { tipo: 'op' } }] })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(Object.keys(guardado('en-lote').analisis ?? {})).toHaveLength(1)
    await h.llamar('deshacer', { circuito: 'en-lote' })
    expect(Object.keys(guardado('en-lote').piezas)).toHaveLength(0)
  })
})

describe('exportar la gráfica de un análisis', () => {
  const falsoPng = new Uint8Array([137, 80, 78, 71])
  let hg: Herramientas
  const pedidos: { ancho: number; alto: number }[] = []
  beforeAll(() => {
    hg = new Herramientas(
      deps({
        rasterizar: async (i) => {
          pedidos.push({ ancho: i.ancho, alto: i.alto })
          return falsoPng
        },
        pdf: async () => new Uint8Array([37, 80, 68, 70])
      })
    )
  })
  afterAll(() => hg.cerrar())

  it.skipIf(!hay)('guarda un análisis guardado como SVG de informe, con la figura del diálogo de exportar', async () => {
    await hg.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R1.2'], nombre: 'Para exportar', guardar: true })
    const r = await hg.llamar('exportar_grafica', { circuito: 'divisor', analisis: 'para exportar', formato: 'svg', nombre: 'grafica-informe' })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(json(r)).toMatchObject({ guardado: 'grafica-informe.svg', preajuste: 'informe' })
    const svg = readFileSync(join(base, 'Asistente', 'grafica-informe.svg'), 'utf8')
    expect(svg).toContain('<svg')
    expect(svg).toContain('Para exportar')
    expect(svg).toMatch(/V\(red [0-9]+\)/)
    expect(svg).not.toMatch(/<script|href=|@import/i)
  })

  it.skipIf(!hay)('«pantalla» e «informe» dan figuras distintas y el PNG y el PDF se piden a quien los pinta', async () => {
    const pantalla = await hg.llamar('exportar_grafica', { circuito: 'divisor', config: DC, trazas: ['R1.2'], preajuste: 'pantalla', formato: 'svg', nombre: 'g-pantalla' })
    expect(pantalla.isError, texto(pantalla)).toBeUndefined()
    const a = readFileSync(join(base, 'Asistente', 'g-pantalla.svg'), 'utf8')
    await hg.llamar('exportar_grafica', { circuito: 'divisor', config: DC, trazas: ['R1.2'], preajuste: 'informe', formato: 'svg', nombre: 'g-informe' })
    expect(readFileSync(join(base, 'Asistente', 'g-informe.svg'), 'utf8')).not.toBe(a)
    const png = await hg.llamar('exportar_grafica', { circuito: 'divisor', config: DC, trazas: ['R1.2'], nombre: 'g-png' })
    expect(png.isError, texto(png)).toBeUndefined()
    expect(png.content.some((c) => c.type === 'image')).toBe(true)
    expect(pedidos.at(-1)).toEqual({ ancho: 1800, alto: expect.any(Number) })
    expect([...readFileSync(join(base, 'Asistente', 'g-png.png'))]).toEqual([...falsoPng])
    const pdf = await hg.llamar('exportar_grafica', { circuito: 'divisor', config: DC, trazas: ['R1.2'], formato: 'pdf', nombre: 'g-pdf' })
    expect(pdf.isError, texto(pdf)).toBeUndefined()
    expect(existsSync(join(base, 'Asistente', 'g-pdf.pdf'))).toBe(true)
  })

  it('dice por qué no puede: análisis que no existe, punto de operación o sin qué graficar, sin pintor y nombre inválido', async () => {
    expect(texto(await hg.llamar('exportar_grafica', { circuito: 'divisor', analisis: 'nada', nombre: 'x' }))).toContain('«nada»')
    expect(texto(await hg.llamar('exportar_grafica', { circuito: 'divisor', nombre: 'x' }))).toContain('«analisis»')
    expect((await hg.llamar('exportar_grafica', { circuito: 'divisor', config: DC, nombre: '..' })).isError).toBe(true)
    // Este anfitrión no tiene pintor de PNG ni de PDF.
    const sin = new Herramientas(deps())
    if (hay) expect(texto(await sin.llamar('exportar_grafica', { circuito: 'divisor', config: DC, nombre: 'x' }))).toContain('PNG')
    sin.cerrar()
    if (hay) expect(texto(await hg.llamar('exportar_grafica', { circuito: 'divisor', config: { tipo: 'op' }, formato: 'svg', nombre: 'op' }))).toContain('punto de operación')
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
    const fake: Fake = {
      pedir: async (tipo, d) => {
        pedidos.push({ tipo, datos: d })
        if (tipo === 'documento') return { ok: true, datos: { bytes: Buffer.from(ventana.guardar()).toString('base64'), titulo: 'Sin título', archivo: null } }
        return { ok: true, datos: ventana.aplicar((d as { orden: never }).orden) }
      }
    }
    hv = new Herramientas(deps({ ventana: async () => ({ ok: true, cliente: fake as never }) }))
    const r = await hv.llamar('aplicar_lote', { ordenes: DIVISOR })
    if (r.isError) throw new Error(texto(r))
  })
  afterAll(() => hv.cerrar())

  it('nombrar_red edita la ventana con su deshacer', async () => {
    const r = await hv.llamar('nombrar_red', { punto: 'R1.2', nombre: 'MEDIO' })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(Object.values(ventana.doc.etiquetas).map((e) => e.nombre)).toEqual(['MEDIO'])
    expect(pedidos.at(-1)).toMatchObject({ tipo: 'orden', datos: { orden: { orden: 'nombrar', punto: 'R1.2', nombre: 'MEDIO' } } })
  })

  it.skipIf(!hay)('analizar con guardar corre sobre una copia y deja el análisis en la ventana', async () => {
    const r = json(await hv.llamar('analizar', { config: DC, trazas: ['MEDIO'], nombre: 'Desde la ventana', guardar: true }))
    expect(r.guardado).toBe('Desde la ventana')
    expect(Object.values(ventana.doc.analisis ?? {}).map((a) => a.nombre)).toEqual(['Desde la ventana'])
    expect(pedidos.at(-1)).toMatchObject({ tipo: 'orden', datos: { orden: { orden: 'analisis', nombre: 'Desde la ventana' } } })
  })
})

describe.skipIf(!hay)('exportar solo las trazas pedidas, con título y subtítulo', () => {
  let hg: Herramientas
  beforeAll(async () => {
    hg = new Herramientas(deps())
    await hg.llamar('crear_circuito', { nombre: 'solo-pedidas' })
    const r = await hg.llamar('aplicar_lote', { circuito: 'solo-pedidas', ordenes: DIVISOR })
    if (r.isError) throw new Error(texto(r))
    // Una red con nombre sale en todo análisis por omisión.
    const n = await hg.llamar('nombrar_red', { circuito: 'solo-pedidas', punto: 'V1.+', nombre: 'ALTA' })
    if (n.isError) throw new Error(texto(n))
  })
  afterAll(() => hg.cerrar())
  const svgDe = (nombre: string) => readFileSync(join(base, 'Asistente', `${nombre}.svg`), 'utf8')

  it('con «trazas» grafica solo esas, sin las redes con nombre que el análisis agrega solo', async () => {
    const todas = await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', config: DC, formato: 'svg', nombre: 't-todas' })
    expect(todas.isError, texto(todas)).toBeUndefined()
    expect(svgDe('t-todas')).toContain('V(ALTA)')
    const una = await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', config: DC, trazas: ['R1.2'], formato: 'svg', nombre: 't-una' })
    expect(una.isError, texto(una)).toBeUndefined()
    expect(svgDe('t-una')).toContain('V(R1.2)')
    expect(svgDe('t-una')).not.toContain('V(ALTA)')
  })

  it('un análisis guardado usa sus trazas, y «trazas» las cambia', async () => {
    await hg.llamar('analizar', { circuito: 'solo-pedidas', config: DC, trazas: ['R1.2'], nombre: 'Medio', guardar: true })
    await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', analisis: 'Medio', formato: 'svg', nombre: 't-guardado' })
    expect(svgDe('t-guardado')).not.toContain('V(ALTA)')
    await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', analisis: 'Medio', trazas: ['ALTA'], formato: 'svg', nombre: 't-cambiadas' })
    expect(svgDe('t-cambiadas')).toContain('V(ALTA)')
    expect(svgDe('t-cambiadas')).not.toMatch(/V\(red [0-9]+\)/)
  })

  it('«titulo» y «subtitulo» van en la figura, y un subtítulo vacío queda vacío', async () => {
    await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', config: DC, trazas: ['R1.2'], titulo: 'Divisor de 9 V', subtitulo: 'Barrido de la fuente', formato: 'svg', nombre: 't-titulos' })
    expect(svgDe('t-titulos')).toContain('Divisor de 9 V')
    expect(svgDe('t-titulos')).toContain('Barrido de la fuente')
    await hg.llamar('exportar_grafica', { circuito: 'solo-pedidas', config: DC, trazas: ['R1.2'], titulo: 'Solo título', subtitulo: '', formato: 'svg', nombre: 't-sin-sub' })
    expect(svgDe('t-sin-sub')).toContain('Solo título')
    expect(svgDe('t-sin-sub')).not.toContain('Datos de')
  })
})
