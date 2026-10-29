import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerKir } from '../../renderer/src/archivo/kir'
import { documentoVacio } from '../../renderer/src/doc/tipos'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { Herramientas, HERRAMIENTAS, TEXTO_APAGADO, type DepsHerramientas, type Respuesta } from './herramientas'
import { imagenSvgDe } from './imagen'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import { perilla } from '../../renderer/src/prueba/piezasNuevas'
import { resolverPerilla, valorDePerilla } from '../../renderer/src/edicion/perillas'

const lib = libreriaSinDom()
let base: string
let datos: string
let activo = true
let h: Herramientas

const deps = (extra: Partial<DepsHerramientas> = {}): DepsHerramientas => ({
  lib,
  wasm: bytesDelWasm(),
  version: 'prueba',
  dirDatos: datos,
  carpetaPorOmision: join(base, 'Asistente'),
  ajustes: () => ({ activo, carpeta: null }),
  ...extra
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Respuesta): any => JSON.parse((r.content[0] as { text: string }).text)
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text

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

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-asistente-'))
  datos = join(base, 'datos')
  mkdirSync(datos)
  h = new Herramientas(deps())
})
afterAll(() => {
  h.cerrar()
  rmSync(base, { recursive: true, force: true })
})

describe('herramientas del asistente sin ventana', () => {
  it('arma un divisor, lo simula y lo guarda: R2 da 2.878 V', async () => {
    expect(json(await h.llamar('crear_circuito', { nombre: 'divisor' }))).toEqual({ ok: true, nombre: 'divisor.kir' })
    const lote = await h.llamar('aplicar_lote', { circuito: 'divisor', ordenes: DIVISOR })
    expect(lote.isError, texto(lote)).toBeUndefined()
    const s = json(await h.llamar('simular', { circuito: 'divisor', hasta: 0.01 }))
    expect(s.lectura.piezas.R2.v.toFixed(3)).toBe('2.878')
    expect(json(await h.llamar('guardar_archivo', { circuito: 'divisor' }))).toMatchObject({ ok: true, nombre: 'divisor.kir' })
    expect(json(await h.llamar('listar_archivos', {})).archivos.map((a: { nombre: string }) => a.nombre)).toEqual(['divisor.kir'])
  })

  it('la plantilla incluida del divisor da la misma cifra que la ventana', async () => {
    await h.llamar('crear_circuito', { nombre: 'plantilla' })
    const r = await h.llamar('insertar_plantilla', { circuito: 'plantilla', plantilla: 'divisor-de-voltaje' })
    expect(r.isError, texto(r)).toBeUndefined()
    const s = json(await h.llamar('simular', { circuito: 'plantilla', hasta: 0.01 }))
    expect(s.lectura.piezas.R2.v).toBeCloseTo((9 * 4.7) / 14.7, 2)
  })

  it('inserta un archivo de la carpeta del asistente como fragmento', async () => {
    await h.llamar('crear_circuito', { nombre: 'desde-archivo' })
    const r = await h.llamar('insertar_plantilla', { circuito: 'desde-archivo', archivo: 'divisor' })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(json(await h.llamar('leer_circuito', { circuito: 'desde-archivo' })).piezas).toHaveLength(4)
    expect((await h.llamar('insertar_plantilla', { circuito: 'desde-archivo', archivo: '../x' })).isError).toBe(true)
  })

  it('lee el circuito y rechaza una orden inválida con su motivo', async () => {
    const c = json(await h.llamar('leer_circuito', { circuito: 'divisor' }))
    expect(c.piezas.map((p: { ref: string }) => p.ref).sort()).toEqual(['GND1', 'R1', 'R2', 'V1'])
    expect(c.piezas.find((p: { ref: string }) => p.ref === 'R1').valor).toBe('10k')
    const mal = await h.llamar('colocar', { circuito: 'divisor', tipo: 'flux' })
    expect(mal.isError).toBe(true)
    expect(texto(mal)).toContain('flux')
  })

  it('catalogo_piezas filtra por texto', async () => {
    const todas = json(await h.llamar('catalogo_piezas', {}))
    const r = json(await h.llamar('catalogo_piezas', { filtro: 'resistencia' }))
    expect(r.length).toBeGreaterThan(0)
    expect(r.length).toBeLessThan(todas.length)
    expect(r.some((p: { id: string }) => p.id === 'resistencia')).toBe(true)
  })

  it('datos_pieza da encapsulado, patillas, LCSC con su marca y hoja por tipo y opción', async () => {
    const r = json(await h.llamar('datos_pieza', { tipo: 'npn', opcion: 'BC547' }))
    expect(r).toMatchObject({ tipo: 'npn', opcion: 'BC547', fabricante: 'onsemi', hoja: expect.stringMatching(/^https:/) })
    expect(r.presentaciones[0]).toMatchObject({ encapsulado: 'TO-92', patillas: { C: '1', B: '2', E: '3' }, huella: 'Package_TO_SOT_THT:TO-92_Inline', lcsc: { numero: 'C258144', marca: 'sin verificar' } })
    expect(r.equivalencias.kicad).toBe('Transistor_BJT:BC547')
    // Sin opción, la de omisión de la pieza.
    expect(json(await h.llamar('datos_pieza', { tipo: 'npn' })).opcion).toBe(lib.get('npn')!.props.find((p) => p.id === 'modelo')!.defecto)
  })

  it('datos_pieza por referencia lee la pieza del circuito, con su propiedad', async () => {
    await h.llamar('crear_circuito', { nombre: 'datos' })
    await h.llamar('colocar', { circuito: 'datos', tipo: 'npn', props: { modelo: 'BC547' } })
    const r = json(await h.llamar('datos_pieza', { circuito: 'datos', ref: 'q1' }))
    expect(r).toMatchObject({ ref: 'Q1', opcion: 'BC547' })
    const l = json(await h.llamar('leer_circuito', { circuito: 'datos' }))
    expect(l.piezas[0].datos).toBe(true)
    expect((await h.llamar('datos_pieza', { circuito: 'datos', ref: 'Q9' })).isError).toBe(true)
  })

  it('datos_pieza dice el motivo con un tipo desconocido, una opción sin fila o sin tipo ni ref', async () => {
    const mal = await h.llamar('datos_pieza', { tipo: 'flux' })
    expect(mal.isError).toBe(true)
    expect(texto(mal)).toContain('flux')
    const sin = await h.llamar('datos_pieza', { tipo: 'npn', opcion: 'XYZ' })
    expect(sin.isError).toBe(true)
    expect(texto(sin)).toContain('Opciones con datos')
    expect((await h.llamar('datos_pieza', {})).isError).toBe(true)
  })

  it('datos_pieza de una pieza virtual lo dice, y el catálogo marca las que tienen datos', async () => {
    const v = json(await h.llamar('datos_pieza', { tipo: 'fuente-dc' }))
    expect(v.virtual).toBe(true)
    const cat = json(await h.llamar('catalogo_piezas', { filtro: 'npn' }))
    expect(cat.find((p: { id: string }) => p.id === 'npn').datos).toBe(true)
  })

  it('deshacer quita lo último', async () => {
    await h.llamar('crear_circuito', { nombre: 'paso' })
    await h.llamar('colocar', { circuito: 'paso', tipo: 'resistencia' })
    expect(json(await h.llamar('leer_circuito', { circuito: 'paso' })).piezas).toHaveLength(1)
    expect((await h.llamar('deshacer', { circuito: 'paso' })).isError).toBeUndefined()
    expect(json(await h.llamar('leer_circuito', { circuito: 'paso' })).piezas).toHaveLength(0)
    expect((await h.llamar('deshacer', { circuito: 'paso' })).isError).toBe(true)
  })

  it('rechaza nombres con .., reservados, subcarpetas y enlaces', async () => {
    for (const nombre of ['..', '../fuera', 'a/b', 'con', 'con.kir', 'nul', 'a:b']) {
      const r = await h.llamar('crear_circuito', { nombre })
      expect(r.isError, nombre).toBe(true)
    }
    expect((await h.llamar('leer_circuito', { circuito: '..\\..\\secreto' })).isError).toBe(true)
    expect(readdirSync(base).includes('fuera.kir')).toBe(false)
    try {
      symlinkSync(datos, join(base, 'Asistente', 'enlace.kir'))
    } catch {
      return // sin permiso para enlaces en esta máquina
    }
    expect((await h.llamar('leer_circuito', { circuito: 'enlace' })).isError).toBe(true)
  })

  it('guardar con otro nombre que existe exige reemplazar y deja respaldo', async () => {
    await h.llamar('crear_circuito', { nombre: 'origen' })
    await h.llamar('colocar', { circuito: 'origen', tipo: 'resistencia' })
    expect(json(await h.llamar('guardar_archivo', { circuito: 'origen', nombre: 'copia' }))).toMatchObject({ ok: true })
    const dos = await h.llamar('guardar_archivo', { circuito: 'origen', nombre: 'copia' })
    expect(dos.isError).toBe(true)
    expect(texto(dos)).toContain('ya existe')
    const tres = json(await h.llamar('guardar_archivo', { circuito: 'origen', nombre: 'copia', reemplazar: true }))
    expect(tres.ok).toBe(true)
    expect(tres.respaldo).toBeDefined()
    expect(existsSync(join(datos, 'respaldos'))).toBe(true)
  })

  it('sin circuito, o con «abierto» sin ventana, pide un archivo', async () => {
    expect((await h.llamar('leer_circuito', {})).isError).toBe(true)
    const a = await h.llamar('leer_circuito', { circuito: 'abierto' })
    expect(a.isError).toBe(true)
    expect(texto(a)).toContain('ventana')
  })

  it('analizar rechaza una fuente que no existe y responde con el motor de ngspice', async () => {
    const mal = await h.llamar('analizar', { circuito: 'divisor', config: { tipo: 'dc', fuente: 'V9', desde: 0, hasta: 1, paso: 0.1 } })
    expect(mal.isError).toBe(true)
    expect(texto(mal)).toContain('V9')
    const r = await h.llamar('analizar', { circuito: 'divisor', config: { tipo: 'op' } })
    expect(texto(r).length).toBeGreaterThan(0)
  })

  it('exportar_imagen sin rasterizador pide guardar como svg, y el svg se guarda', async () => {
    expect((await h.llamar('exportar_imagen', { circuito: 'divisor' })).isError).toBe(true)
    const r = await h.llamar('exportar_imagen', { circuito: 'divisor', guardar: { nombre: 'divisor', formato: 'svg' } })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(existsSync(join(base, 'Asistente', 'divisor.svg'))).toBe(true)
  })

  it('cada cambio sin ventana queda guardado en su archivo, sin llamar a guardar_archivo', async () => {
    await h.llamar('crear_circuito', { nombre: 'autoguardado' })
    expect((await h.llamar('colocar', { circuito: 'autoguardado', tipo: 'resistencia', ref: 'R7' })).isError).toBeUndefined()
    const leido = leerKir(new Uint8Array(readFileSync(join(base, 'Asistente', 'autoguardado.kir'))))
    expect(leido.ok && Object.values(leido.doc.piezas).map((p) => p.ref)).toEqual(['R7'])
    expect((await h.llamar('deshacer', { circuito: 'autoguardado' })).isError).toBeUndefined()
    const deshecho = leerKir(new Uint8Array(readFileSync(join(base, 'Asistente', 'autoguardado.kir'))))
    expect(deshecho.ok && Object.keys(deshecho.doc.piezas)).toEqual([])
  })

  it('un archivo cambiado en el disco por otro lado se vuelve a leer antes de la siguiente orden', async () => {
    await h.llamar('crear_circuito', { nombre: 'ajeno' })
    await h.llamar('colocar', { circuito: 'ajeno', tipo: 'resistencia', ref: 'R1' })
    // Otro programa deja el circuito vacío (lo que guardaría la ventana tras borrar R1).
    const s = new SesionSinVentana({ lib, version: 'prueba' })
    s.crear()
    const { writeFileSync, utimesSync } = await import('node:fs')
    const ruta = join(base, 'Asistente', 'ajeno.kir')
    writeFileSync(ruta, s.guardar())
    utimesSync(ruta, new Date(), new Date(Date.now() + 5000))
    expect(json(await h.llamar('leer_circuito', { circuito: 'ajeno' })).piezas).toEqual([])
  })

  it('una falla al leer los ajustes vuelve como resultado con error, sin lanzar', async () => {
    const hx = new Herramientas(deps({ ajustes: () => { throw new Error('disco') } }))
    const r = await hx.llamar('estado', {})
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain('disco')
    hx.cerrar()
  })

  it('con el interruptor apagado cada llamada devuelve el texto de activarlo', async () => {
    activo = false
    for (const t of HERRAMIENTAS) {
      const r = await h.llamar(t.nombre, { circuito: 'divisor' })
      expect(r.isError).toBe(true)
      expect(texto(r)).toBe(TEXTO_APAGADO)
    }
    activo = true
  })
})

describe('imagen del esquema', () => {
  it('el SVG del divisor no trae guiones ni referencias externas y respeta el tope de lado', () => {
    const s = new SesionSinVentana({ lib, version: 'prueba' })
    s.crear()
    expect(s.aplicar({ orden: 'lote', ordenes: DIVISOR as never }).ok).toBe(true)
    const img = imagenSvgDe(s.doc, lib, 'divisor', 5000)!
    expect(Math.max(img.ancho, img.alto)).toBeLessThanOrEqual(2048)
    expect(img.svg).not.toMatch(/<script|href=|xlink:|url\(|@import/i)
  })

  it('un circuito vacío no da imagen', () => {
    expect(imagenSvgDe(documentoVacio(), lib, 'vacío')).toBeNull()
  })
})

describe('herramientas del asistente con la ventana abierta', () => {
  type Fake = { pedir(tipo: string, datos: unknown): Promise<{ ok: true; datos: unknown } | { ok: false; motivo: string }> }
  let ventana: SesionSinVentana
  let pedidos: string[]
  let hv: Herramientas
  /** Las rutas que la ventana falsa dice tener abiertas y los datos de cada petición. */
  let abiertas: Set<string>
  let datosDe: unknown[]

  beforeAll(async () => {
    ventana = await SesionSinVentana.iniciar({ lib, wasm: bytesDelWasm(), version: 'prueba' })
    ventana.crear()
    pedidos = []
    abiertas = new Set()
    datosDe = []
    const fake: Fake = {
      pedir: async (tipo, d) => {
        pedidos.push(tipo)
        datosDe.push(d)
        if (tipo === 'dondeEsta') return { ok: true, datos: { abierto: abiertas.has((d as { ruta: string }).ruta) } }
        if (tipo === 'abrir') return { ok: true, datos: { ok: true } }
        if (tipo === 'estado') return { ok: true, datos: { ventana: true, titulo: 'Sin título', archivo: null, editable: null } }
        if (tipo === 'documento') return { ok: true, datos: { bytes: Buffer.from(ventana.guardar()).toString('base64'), titulo: 'Sin título', archivo: null } }
        return { ok: true, datos: ventana.aplicar((d as { orden: never }).orden) }
      }
    }
    hv = new Herramientas(deps({ ventana: async () => ({ ok: true, cliente: fake as never }) }))
  })
  afterAll(() => hv.cerrar())

  it('sin «circuito» usa el abierto: las órdenes van a la ventana y la simulación corre en el puente sobre su copia', async () => {
    const lote = await hv.llamar('aplicar_lote', { ordenes: DIVISOR })
    expect(lote.isError, texto(lote)).toBeUndefined()
    expect(Object.keys(ventana.doc.piezas)).toHaveLength(4)
    const s = json(await hv.llamar('simular', { circuito: 'abierto', hasta: 0.01 }))
    expect(s.lectura.piezas.R2.v.toFixed(3)).toBe('2.878')
    expect(json(await hv.llamar('leer_circuito', {})).ventana).toEqual({ titulo: 'Sin título', archivo: null })
    expect(pedidos).toEqual(['orden', 'documento', 'documento'])
  })

  it('estado dice que hay ventana y guardar_archivo escribe una copia del abierto en la carpeta', async () => {
    expect(json(await hv.llamar('estado', {}))).toMatchObject({ ventana: true, modo: 'con ventana' })
    expect((await hv.llamar('guardar_archivo', {})).isError).toBe(true)
    const g = await hv.llamar('guardar_archivo', { nombre: 'copia-de-ventana' })
    expect(g.isError, texto(g)).toBeUndefined()
    expect(json(g)).toMatchObject({ ok: true, nombre: 'copia-de-ventana.kir' })
  })

  it('un archivo de la carpeta que la ventana no tiene abierto sigue sin ventana, y una orden inválida no llega a la ventana', async () => {
    const antes = pedidos.length
    await hv.llamar('crear_circuito', { nombre: 'aparte' })
    expect((await hv.llamar('leer_circuito', { circuito: 'aparte' })).isError).toBeUndefined()
    expect((await hv.llamar('colocar', { tipo: '' })).isError).toBe(true)
    expect(pedidos.slice(antes).filter((p) => p === 'orden' || p === 'documento')).toEqual([])
  })

  it('un circuito nuevo se pide abrir en una ventana nueva, y si la ventana lo tiene abierto las órdenes van allí', async () => {
    const c = json(await hv.llamar('crear_circuito', { nombre: 'en-vivo' }))
    expect(c.ventana).toContain('ventana nueva')
    const ruta = join(base, 'Asistente', 'en-vivo.kir')
    expect(datosDe[pedidos.lastIndexOf('abrir')]).toEqual({ ruta })
    abiertas.add(ruta)
    const antes = Object.keys(ventana.doc.piezas).length
    const r = await hv.llamar('colocar', { circuito: 'en-vivo', tipo: 'resistencia' })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(Object.keys(ventana.doc.piezas).length).toBe(antes + 1)
    expect(datosDe[pedidos.lastIndexOf('orden')]).toMatchObject({ ruta })
    // Lo abierto en la ventana no se guarda encima desde el asistente: lo decide el usuario.
    expect(json(await hv.llamar('guardar_archivo', { circuito: 'en-vivo' }))).toMatchObject({ ok: true, enVentana: true })
    abiertas.delete(ruta)
  })

  it('si el usuario desconectó al asistente lo dice y no cae a la carpeta', async () => {
    const hd = new Herramientas(deps({ ventana: async () => ({ ok: false, sinVentana: false, motivo: 'El usuario desconectó al asistente.' }) }))
    expect(texto(await hd.llamar('leer_circuito', {}))).toContain('desconectó')
    hd.cerrar()
  })
})

// Una pieza en línea con una perilla: V(OUT) = 0.01 por la temperatura.
const base0 = lib.get('resistencia')!
const sensor: PiezaDef = {
  ...base0,
  id: 'sensor-t',
  nombre: { es: 'Sensor de prueba', en: 'Test sensor' },
  prefijo: 'U',
  pines: [{ id: 'OUT', nombre: 'OUT', x: 0, y: 0 }, { id: 'GND', nombre: 'GND', x: 0, y: 2 }],
  props: [perilla('temp', 'Temperatura', '°C', '25', 0, 200)],
  modelo: { tipo: 'compuesto', medida: { mas: 'OUT', menos: 'GND', i: 0 }, terminales: ['OUT', 'GND'], internas: [], elementos: [{ t: 'EXT', a: 'OUT', b: 'GND', modo: 'v', canal: 'temp', k: 0.01, c: 0 }] }
}
const libS = new Map(lib).set(sensor.id, sensor)
const CON_SENSOR = [
  { orden: 'colocar', tipo: 'sensor-t', clave: 's', en: { x: 0, y: 0 } },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r', en: { x: 25, y: 0 }, valor: '1k' },
  { orden: 'colocar', tipo: 'tierra', clave: 'g', en: { x: 25, y: 15 } },
  { orden: 'conectar', desde: 's.OUT', hasta: 'r.1' },
  { orden: 'conectar', desde: 'r.2', hasta: 'g.1' },
  { orden: 'conectar', desde: 's.GND', hasta: 'g.1' }
]

describe('perillas en el asistente', () => {
  let hp: Herramientas
  beforeAll(async () => {
    hp = new Herramientas(deps({ lib: libS, carpetaPorOmision: join(base, 'Perillas') }))
    await hp.llamar('crear_circuito', { nombre: 'sensor' })
    const r = await hp.llamar('aplicar_lote', { circuito: 'sensor', ordenes: CON_SENSOR })
    expect(r.isError, texto(r)).toBeUndefined()
  })
  afterAll(() => hp.cerrar())

  it('el catálogo da el rango, la unidad y la escala solo de las propiedades con perilla', async () => {
    const s = json(await hp.llamar('catalogo_piezas', { filtro: 'sensor-t' }))[0]
    expect(s.propiedades[0]).toMatchObject({ id: 'temp', perilla: { min: 0, max: 200, unidad: '°C', escala: 'lineal' } })
    const r = json(await hp.llamar('catalogo_piezas', { filtro: 'resistencia' })).find((p: { id: string }) => p.id === 'resistencia')
    expect(r.propiedades.some((p: object) => 'perilla' in p)).toBe(false)
  })

  it('ajustar_perilla sin vista previa cambia el valor del documento, con o sin «prop» si solo hay una', async () => {
    const r = await hp.llamar('ajustar_perilla', { circuito: 'sensor', ref: 'U1', valor: 80 })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(json(r)).toMatchObject({ ok: true })
    const c = json(await hp.llamar('leer_circuito', { circuito: 'sensor' }))
    expect(c.piezas.find((x: { ref: string }) => x.ref === 'U1').props.temp).toBe('80 °C')
    expect((await hp.llamar('ajustar_perilla', { circuito: 'sensor', ref: 'U1', prop: 'temp', valor: '120 °C' })).isError).toBeUndefined()
  })

  it('un valor fuera de rango, una pieza sin perilla o una unidad ajena se dicen sin tocar el circuito', async () => {
    const fuera = await hp.llamar('ajustar_perilla', { circuito: 'sensor', ref: 'U1', valor: 500 })
    expect(fuera.isError).toBe(true)
    expect(texto(fuera)).toBe('Temperatura va de 0 °C a 200 °C.')
    expect(texto(await hp.llamar('ajustar_perilla', { circuito: 'sensor', ref: 'R1', valor: 5 }))).toContain('R1 no tiene perillas')
    expect(texto(await hp.llamar('ajustar_perilla', { circuito: 'sensor', ref: 'U1', valor: '5 lx' }))).toContain('Se esperaba un valor en °C')
    const c = json(await hp.llamar('leer_circuito', { circuito: 'sensor' }))
    expect(c.piezas.find((x: { ref: string }) => x.ref === 'U1').props.temp).toBe('120 °C')
  })

  it('simular cambia la perilla en el instante pedido, devuelve las muestras con su t y su lectura trae el valor', async () => {
    const s = json(await hp.llamar('simular', {
      circuito: 'sensor',
      hasta: 0.004,
      cambios: [{ t: 0.001, ref: 'U1', prop: 'temp', valor: 50 }, { t: 0.002, ref: 'U1', valor: 100 }],
      muestrear: [{ t: 0.0005, traza: 'U1.OUT' }, { t: 0.0015, traza: 'U1.OUT' }, { t: 0.0035, traza: 'U1.OUT' }]
    }))
    expect(s.simulado.muestras.map((m: { t: number }) => m.t)).toEqual([0.0005, 0.0015, 0.0035])
    expect(s.simulado.muestras.map((m: { v: number }) => Number(m.v.toFixed(3)))).toEqual([1.2, 0.5, 1])
    expect(s.lectura.perillas).toEqual([{ ref: 'U1', prop: 'temp', valor: 100, unidad: '°C' }])
  })

  it('los errores de cambios y muestras salen con su motivo, sin envoltorio', async () => {
    const mal = await hp.llamar('simular', { circuito: 'sensor', hasta: 0.004, cambios: [{ t: 0, ref: 'U1', valor: 900 }] })
    expect(mal.isError).toBe(true)
    expect(texto(mal)).toBe('cambios[0]: Temperatura va de 0 °C a 200 °C.')
    const muchos = await hp.llamar('simular', { circuito: 'sensor', hasta: 0.004, cambios: Array.from({ length: 501 }, () => ({ t: 0, ref: 'U1', valor: 20 })) })
    expect(texto(muchos)).toBe('Hasta 500 cambios por simulación y se pidieron 501.')
  })

  it('con la ventana abierta el ajuste va a la ventana por la petición perilla', async () => {
    const pedidos: { tipo: string; datos: unknown }[] = []
    const fake = {
      pedir: async (tipo: string, datos: unknown) => {
        pedidos.push({ tipo, datos })
        return { ok: true as const, datos: { ok: true } }
      }
    }
    const hw = new Herramientas(deps({ lib: libS, ventana: async () => ({ ok: true, cliente: fake as never }) }))
    const r = await hw.llamar('ajustar_perilla', { ref: 'U1', prop: 'temp', valor: 60 })
    expect(r.isError, texto(r)).toBeUndefined()
    expect(pedidos).toEqual([{ tipo: 'perilla', datos: { ref: 'U1', prop: 'temp', valor: 60 } }])
    hw.cerrar()
  })

  it('el valor y la perilla se validan con las mismas funciones en las dos vías', () => {
    expect(resolverPerilla(documentoVacio(), libS, 'U1')).toMatchObject({ motivo: expect.stringContaining('U1') })
    const p = sensor.props[0]
    expect(valorDePerilla(p, 60)).toEqual({ valor: 60, texto: '60 °C' })
    expect(valorDePerilla(p, Number.NaN)).toMatchObject({ motivo: expect.any(String) })
  })
})

describe('piezas nuevas con el asistente', () => {
  it.skipIf(!lib.has('jfet-n'))('un JFET se coloca y se cablea con aplicar_lote y aparece en el circuito', async () => {
    const hj = new Herramientas(deps({ carpetaPorOmision: join(base, 'Jfet') }))
    await hj.llamar('crear_circuito', { nombre: 'jfet' })
    const r = await hj.llamar('aplicar_lote', {
      circuito: 'jfet',
      ordenes: [
        { orden: 'colocar', tipo: 'jfet-n', clave: 'j', en: { x: 0, y: 0 } },
        { orden: 'colocar', tipo: 'resistencia', clave: 'r', en: { x: 25, y: -10 }, valor: '1k' },
        { orden: 'colocar', tipo: 'tierra', clave: 'g', en: { x: 25, y: 25 } },
        { orden: 'conectar', desde: 'j.D', hasta: 'r.1' },
        { orden: 'conectar', desde: 'j.S', hasta: 'g.1' },
        { orden: 'conectar', desde: 'j.G', hasta: 'g.1' }
      ]
    })
    expect(r.isError, texto(r)).toBeUndefined()
    const c = json(await hj.llamar('leer_circuito', { circuito: 'jfet' }))
    const j = c.piezas.find((x: { tipo: string }) => x.tipo === 'jfet-n')
    expect(j.patillas.D).toBe(c.piezas.find((x: { ref: string }) => x.ref === 'R1').patillas['1'])
    expect(j.patillas.S).toBe(j.patillas.G)
    hj.cerrar()
  })
})

describe('chips con varias unidades con el asistente', () => {
  const colocarNand = (extra: object = {}, k = 0) => ({ orden: 'colocar', tipo: 'nand', en: { x: k * 40, y: 0 }, ...extra })

  it('el catálogo dice cuántas unidades tiene y el número de patilla de cada una', async () => {
    const nand = json(await h.llamar('catalogo_piezas', { filtro: 'nand' })).find((p: { id: string }) => p.id === 'nand')
    expect(nand.unidades).toMatchObject({ n: 4, nombres: ['A', 'B', 'C', 'D'], compartidos: [] })
    expect(nand.unidades.patillas.B).toEqual({ A: '4', B: '5', Y: '6' })
    const resistencia = json(await h.llamar('catalogo_piezas', { filtro: 'resistencia' })).find((p: { id: string }) => p.id === 'resistencia')
    expect(resistencia.unidades).toBeUndefined()
  })

  it('cuatro 74HC00 quedan en U1A a U1D, una quinta abre U2A, y leer_circuito da paquetes y patillas', async () => {
    const hu = new Herramientas(deps({ carpetaPorOmision: join(base, 'Unidades') }))
    await hu.llamar('crear_circuito', { nombre: 'u' })
    for (let k = 0; k < 5; k++) expect((await hu.llamar('colocar', { circuito: 'u', tipo: 'nand', en: { x: k * 40, y: 0 } })).isError).toBeUndefined()
    const c = json(await hu.llamar('leer_circuito', { circuito: 'u' }))
    expect(c.piezas.map((p: { ref: string }) => p.ref)).toEqual(['U1A', 'U1B', 'U1C', 'U1D', 'U2A'])
    expect(c.piezas[1]).toMatchObject({ paquete: 'U1', unidad: 'B', numeros: { A: '4', B: '5', Y: '6' } })
    expect(c.piezas[1].props?.paquete).toBeUndefined()
    expect(c.paquetes).toEqual([
      { paquete: 'U1', tipo: 'nand', unidades: { A: 'U1A', B: 'U1B', C: 'U1C', D: 'U1D' }, libres: [], compartidas: {} },
      { paquete: 'U2', tipo: 'nand', unidades: { A: 'U2A' }, libres: ['B', 'C', 'D'], compartidas: {} }
    ])
    // La referencia con la unidad sirve para conectar.
    expect((await hu.llamar('conectar', { circuito: 'u', desde: 'U1B.Y', hasta: 'U2A.A' })).isError).toBeUndefined()
    const d = json(await hu.llamar('datos_pieza', { circuito: 'u', ref: 'U1B' }))
    expect(d).toMatchObject({ paquete: 'U1', unidad: 'B', numerosDeUnidad: { A: '4', B: '5', Y: '6' } })
    hu.cerrar()
  })

  it('colocar con paquete y unidad elige la letra, y una unidad ocupada o un chip de otro tipo se dicen en español', async () => {
    const hu = new Herramientas(deps({ carpetaPorOmision: join(base, 'Unidades2') }))
    await hu.llamar('crear_circuito', { nombre: 'u' })
    expect((await hu.llamar('colocar', { circuito: 'u', tipo: 'nand', paquete: 'U1', unidad: 'C', en: { x: 0, y: 0 } })).isError).toBeUndefined()
    const ocupada = await hu.llamar('colocar', { circuito: 'u', tipo: 'nand', paquete: 'U1', unidad: 'C', en: { x: 40, y: 0 } })
    expect(ocupada.isError).toBe(true)
    expect(texto(ocupada)).toContain('ya está en uso por U1C')
    const otro = await hu.llamar('colocar', { circuito: 'u', tipo: 'nor', paquete: 'U1', en: { x: 40, y: 0 } })
    expect(texto(otro)).toContain('es de otro tipo')
    const noEsta = await hu.llamar('colocar', { circuito: 'u', tipo: 'nand', unidad: 'H', en: { x: 40, y: 0 } })
    expect(texto(noEsta)).toContain('no tiene la unidad «H»')
    hu.cerrar()
  })

  it('cambiar_unidad y agrupar_encapsulados, solos y dentro de aplicar_lote', async () => {
    const hu = new Herramientas(deps({ carpetaPorOmision: join(base, 'Unidades3') }))
    await hu.llamar('crear_circuito', { nombre: 'u' })
    // «ref» las deja sueltas (sin paquete): compuertas de un circuito viejo.
    const sueltas = [0, 1, 2].map((k) => colocarNand({ ref: `X${k + 1}` }, k))
    expect((await hu.llamar('aplicar_lote', { circuito: 'u', ordenes: sueltas })).isError).toBeUndefined()
    const g = await hu.llamar('agrupar_encapsulados', { circuito: 'u' })
    expect(g.isError, texto(g)).toBeUndefined()
    expect(texto(g)).toMatch(/X1 → U1A, X2 → U1B, X3 → U1C/)
    const c = await hu.llamar('cambiar_unidad', { circuito: 'u', ref: 'U1C', unidad: 'D' })
    expect(c.isError, texto(c)).toBeUndefined()
    expect(json(await hu.llamar('leer_circuito', { circuito: 'u' })).paquetes[0]).toMatchObject({ unidades: { A: 'U1A', B: 'U1B', D: 'U1D' }, libres: ['C'] })
    expect(texto(await hu.llamar('cambiar_unidad', { circuito: 'u', ref: 'U1D', unidad: 'A' }))).toContain('en uso por U1A')
    const lote = await hu.llamar('aplicar_lote', { circuito: 'u', ordenes: [{ orden: 'unidad', ref: 'U1D', unidad: 'C' }, { orden: 'agrupar' }] })
    expect(lote.isError, texto(lote)).toBeUndefined()
    const descripciones = HERRAMIENTAS.filter((t) => ['colocar', 'catalogo_piezas', 'cambiar_unidad'].includes(t.nombre)).map((t) => t.descripcion).join(' ')
    expect(descripciones).toContain('cerca una de otra')
    hu.cerrar()
  })

  it('con el circuito en la ventana, colocar con unidad, cambiar_unidad y agrupar_encapsulados van allí como órdenes', async () => {
    const pedidos: unknown[] = []
    const fake = { pedir: async (_t: string, d: unknown) => (pedidos.push(d), { ok: true as const, datos: { ok: true, creados: {}, avisos: [] } }) }
    const hv = new Herramientas(deps({ ventana: async () => ({ ok: true, cliente: fake as never }) }))
    await hv.llamar('colocar', { tipo: 'nand', paquete: 'U1', unidad: 'B', en: { x: 0, y: 0 } })
    await hv.llamar('cambiar_unidad', { ref: 'U1B', unidad: 'C' })
    await hv.llamar('agrupar_encapsulados', {})
    expect(pedidos).toEqual([
      { orden: { orden: 'colocar', tipo: 'nand', paquete: 'U1', unidad: 'B', en: { x: 0, y: 0 } } },
      { orden: { orden: 'unidad', ref: 'U1B', unidad: 'C' } },
      { orden: { orden: 'agrupar' } }
    ])
    hv.cerrar()
  })

  it('un amplificador doble muestra las patillas de alimentación que comparten sus unidades', async () => {
    const hu = new Herramientas(deps({ carpetaPorOmision: join(base, 'Unidades4') }))
    await hu.llamar('crear_circuito', { nombre: 'u' })
    for (let k = 0; k < 2; k++) await hu.llamar('colocar', { circuito: 'u', tipo: 'amp-op', props: { modelo: 'LM358' }, en: { x: k * 40, y: 0 } })
    const c = json(await hu.llamar('leer_circuito', { circuito: 'u' }))
    expect(c.paquetes).toHaveLength(1)
    const [pq] = c.paquetes
    expect(Object.keys(pq.compartidas).length).toBeGreaterThan(0)
    for (const comp of Object.values(pq.compartidas) as { piezas: string[] }[]) expect(comp.piezas).toEqual(['U1A', 'U1B'])
    hu.cerrar()
  })
})

describe('importar un circuito de otro programa', () => {
  const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../renderer/src/importar/__fixtures__/spice/divisor.cir')
  const carpeta = () => join(base, 'Asistente')

  it('devuelve el informe sin abrir nada', async () => {
    mkdirSync(carpeta(), { recursive: true })
    copyFileSync(FIXTURE, join(carpeta(), 'divisor-spice.cir'))
    const r = await h.llamar('importar', { archivo: 'divisor-spice.cir' })
    expect(r.isError, texto(r)).toBeUndefined()
    const x = json(r)
    expect(x.piezas).toBeGreaterThanOrEqual(3)
    expect(x.informe.origen.formato).toBe('spice')
    expect(x.circuito).toBeUndefined()
    expect(existsSync(join(carpeta(), 'divisor-spice.kir'))).toBe(false)
  })

  it('con abrir deja un circuito con las piezas que se puede leer, y no pisa uno existente', async () => {
    const r = json(await h.llamar('importar', { archivo: 'divisor-spice.cir', abrir: true }))
    expect(r.circuito).toBe('divisor-spice.kir')
    const piezas = json(await h.llamar('leer_circuito', { circuito: r.circuito })).piezas
    expect(piezas).toHaveLength(r.piezas)
    expect(json(await h.llamar('importar', { archivo: 'divisor-spice.cir', abrir: true })).circuito).toBe('divisor-spice-2.kir')
  })

  it('un archivo de más de 8 MB se rechaza sin leerlo', async () => {
    writeFileSync(join(carpeta(), 'enorme.cir'), Buffer.alloc(8 * 2 ** 20 + 1, 'x'))
    const r = await h.llamar('importar', { archivo: 'enorme.cir' })
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain('demasiado grande')
  })

  it('con convertidor externo usa su resultado y registra el detalle técnico de una falla', async () => {
    const errores: string[] = []
    const hx = new Herramientas(deps({ importar: async () => ({ ok: false, motivo: 'No se pudo convertir.', detalle: 'boom' }), registro: { error: (t: string) => errores.push(t) } as never }))
    const r = await hx.llamar('importar', { archivo: 'divisor-spice.cir' })
    expect(texto(r)).toContain('No se pudo convertir.')
    expect(errores.join(' ')).toContain('boom')
    hx.cerrar()
  })

  it('un archivo inexistente, una ruta o un formato desconocido dan su motivo', async () => {
    expect(texto(await h.llamar('importar', { archivo: 'nada.cir' }))).toContain('No se encontró')
    expect((await h.llamar('importar', { archivo: '../x.cir' })).isError).toBe(true)
    writeFileSync(join(carpeta(), 'raro.txt'), 'esto no es un circuito')
    const r = await h.llamar('importar', { archivo: 'raro.txt' })
    expect(r.isError).toBe(true)
    expect(texto(r)).toContain('no parece ser de otro programa')
  })
})
