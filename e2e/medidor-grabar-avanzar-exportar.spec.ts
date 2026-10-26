import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leerDuracionMs } from '../src/main/cabeceraWebm'
import { textoDePantalla } from '../src/renderer/src/lienzo/medidores'
import { verInspector } from './franja'
import { carpetaNueva, lanzar } from './lanzar'

/** Medidor rápido, exportar, grabar y avanzar sobre el ejecutable. La grabación va a Videos/Kirchi dentro de la carpeta de datos de la prueba (con `--datos`), nunca a los Videos del usuario. Requiere ventana. */
test.describe.configure({ mode: 'serial' })

const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const cable = (id: string, ...pts: [number, number][]) => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** El divisor de la plantilla: 5 V sobre R1 y R2 de 1 kΩ. La red de salida pasa por (32, 0). */
const DIVISOR = {
  piezas: {
    v1: pieza('v1', 'fuente-dc', 'V1', 0, 20, { voltaje: '5' }),
    r1: pieza('r1', 'resistencia', 'R1', 20, 0, { valor: '1k' }),
    r2: pieza('r2', 'resistencia', 'R2', 44, 0, { valor: '1k' }),
    g: pieza('g', 'tierra', 'GND1', 28, 32)
  },
  cables: {
    a: cable('a', [0, 16], [0, 0], [16, 0]),
    b: cable('b', [24, 0], [40, 0]),
    c: cable('c', [48, 0], [56, 0], [56, 32], [0, 32], [0, 24])
  },
  etiquetas: {},
  notas: {}
}

async function abrir(): Promise<{ app: ElectronApplication; page: Page; datos: string }> {
  const datos = carpetaNueva()
  const app = await lanzar({ datos })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as any).__kirchi?.ready === true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(600)
  return { app, page, datos }
}
const sonda = (page: Page, metodo: string, ...args: unknown[]): Promise<any> => page.evaluate(([m, a]) => (window as any).__kirchi[m](...a), [metodo, args] as [string, unknown[]])
async function encuadrar(page: Page) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(300)
}
/** Abre el clic derecho en (x, y) del mundo y recorre `ruta` (los nombres de los ítems, del menú al submenú). */
async function menuEn(page: Page, x: number, y: number, ...ruta: RegExp[]) {
  await encuadrar(page)
  const c = await sonda(page, 'aPantalla', x, y)
  await page.waitForTimeout(450)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  for (const [k, n] of ruta.entries()) {
    const it = page.getByRole('menuitem', { name: n })
    if (k < ruta.length - 1) await it.hover()
    else await it.click()
    await page.waitForTimeout(250)
  }
}
const medidorRapido = (page: Page) => menuEn(page, 32, 0, /Medir con el multímetro/, /^Medidor rápido/)

async function dialogoGuardar(app: ElectronApplication, ruta: string) {
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: ruta })) as unknown as typeof dialog.showSaveDialog
  }, ruta)
}
async function simular(page: Page) {
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await expect.poll(async () => Object.values((await sonda(page, 'simulacion')).redes as Record<string, number>).some((v) => Math.abs(v - 2.5) < 0.05)).toBe(true)
}
async function abrirExportar(page: Page, formato: 'SVG' | 'PNG' | 'PDF'): Promise<Locator> {
  await page.getByRole('toolbar', { name: 'Inicio', exact: true }).getByRole('button', { name: 'Exportar', exact: true }).click()
  // Exportar abre el diálogo directo: el formato se elige adentro.
  await page.getByRole('dialog', { name: /^Exportar como/ }).locator('label.casilla-formato', { hasText: formato }).click()
  const dialogo = page.getByRole('dialog', { name: `Exportar como ${formato}` })
  await expect(dialogo).toBeVisible()
  return dialogo
}
async function exportarA(app: ElectronApplication, dialogo: Locator, ruta: string): Promise<string> {
  await dialogoGuardar(app, ruta)
  await dialogo.getByRole('button', { name: 'Exportar…' }).click()
  await expect.poll(() => existsSync(ruta), { timeout: 20_000 }).toBe(true)
  return readFileSync(ruta, 'utf8')
}

/** Los textos del SVG (`<text>`), con las entidades XML deshechas. */
const textosDelSvg = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
/** ¿Algún `<text>` del SVG dice exactamente `cifras`? */
const pintaCifras = (svg: string, _s: unknown, cifras: string): boolean => textosDelSvg(svg).includes(cifras)

test('el medidor rápido en la red de salida lee lo mismo que la vista previa', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await medidorRapido(page)
  const medidores = Object.values((await sonda(page, 'doc')).sondas) as any[]
  expect(medidores).toEqual([expect.objectContaining({ tipo: 'medidor', magnitud: 'voltaje', modo: 'dc', x: 32, y: 0, ref: 'M1' })])
  expect(await sonda(page, 'seleccion')).toEqual(expect.objectContaining({ sondas: [medidores[0].id] }))
  await verInspector(page)
  await expect(page.getByRole('region', { name: 'Controles de M1' })).toContainText('Convertir en multímetro completo')
  // Sin simular, el medidor dibuja su función y su referencia en el lienzo.
  expect(((await sonda(page, 'textos')) as { texto: string }[]).map((t) => t.texto)).toEqual(expect.arrayContaining(['V DC', 'M1']))

  await simular(page)
  const sim = await sonda(page, 'simulacion')
  // La red de salida es la que vale la mitad de la fuente (2.5 V de 5 V).
  const salida = Object.values(sim.redes as Record<string, number>).find((v) => Math.abs(v - 2.5) < 0.05)!
  // Lo que muestra la pantalla: los segmentos de su lectura salen en el SVG exportado con la vista previa corriendo.
  const dir = mkdtempSync(join(tmpdir(), 'kirchi-e2e-12-'))
  const svg = await exportarA(app, await abrirExportar(page, 'SVG'), join(dir, 'lectura.svg'))
  const esperado = textoDePantalla(medidores[0], { estado: 'ok', valor: salida, unidad: 'V' })
  expect(esperado.cifras).toBe('2.500')
  expect(esperado.unidad).toBe('V')
  expect(pintaCifras(svg, medidores[0], esperado.cifras), 'las cifras 2.500 están en la pantalla').toBe(true)
  // Y no el reposo ni la lectura de otra red (5 V).
  expect(pintaCifras(svg, medidores[0], '‒.‒‒‒')).toBe(false)
  expect(pintaCifras(svg, medidores[0], '5')).toBe(false)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('«Convertir en multímetro completo» pone un multímetro con sus sondas en el mismo punto', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await medidorRapido(page)
  await verInspector(page)
  await page.getByRole('button', { name: 'Convertir en multímetro completo' }).click()
  const d = await sonda(page, 'doc')
  const mm = Object.values(d.piezas).filter((p: any) => p.tipo === 'multimetro') as any[]
  expect(mm).toHaveLength(1)
  expect(mm[0].props.modo).toBe('V DC')
  const sondas = Object.values(d.sondas) as any[]
  expect(sondas.some((s) => s.tipo === 'medidor')).toBe(false)
  // Una sonda en el terminal «+» del multímetro nuevo, en el punto que medía el medidor (el COM va a tierra).
  expect(sondas).toEqual([expect.objectContaining({ tipo: 'multimetro', instrumento: mm[0].id, entrada: '+', x: 32, y: 0 })])
  // Un solo paso de deshacer lo devuelve a medidor rápido.
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('Control+Z')
  const antes = await sonda(page, 'doc')
  expect(Object.values(antes.piezas).filter((p: any) => p.tipo === 'multimetro')).toHaveLength(0)
  expect((Object.values(antes.sondas) as any[]).map((s) => s.tipo)).toEqual(['medidor'])
  await app.close()
})

test('exportar SVG con Área y con las lecturas de los medidores lleva su cuerpo, sus cifras y sus textos', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await medidorRapido(page)
  await simular(page)
  const medidor = (Object.values((await sonda(page, 'doc')).sondas) as any[])[0]
  const dir = mkdtempSync(join(tmpdir(), 'kirchi-e2e-12-'))
  const dialogo = await abrirExportar(page, 'SVG')
  await dialogo.getByRole('radio', { name: 'Área' }).check()
  // El recuadro inicial es el 60 % central del dibujo: se agranda al dibujo entero.
  const campo = (r: string) => dialogo.getByLabel(`${r} del área, en milímetros`)
  const [x, y, w, h] = [Number(await campo('Izquierda').inputValue()), Number(await campo('Arriba').inputValue()), Number(await campo('Ancho').inputValue()), Number(await campo('Alto').inputValue())]
  const [W, H] = [w / 0.6, h / 0.6]
  for (const [r, v] of [['Izquierda', x - 0.2 * W], ['Arriba', y - 0.2 * H], ['Ancho', W], ['Alto', H]] as const) {
    await campo(r).fill(String(v))
    await campo(r).blur()
  }
  const lecturas = dialogo.getByRole('switch', { name: 'Lecturas de los medidores rápidos' })
  await expect(lecturas).toBeEnabled()
  await expect(lecturas).toBeChecked()
  const svg = await exportarA(app, dialogo, join(dir, 'area.svg'))
  expect(svg).toContain('fill="#2a2e36"')
  expect(svg).toMatch(/>V DC</)
  expect(svg).toMatch(/>M1</)
  expect(svg).toMatch(/font-weight="700"[^>]*>V</)
  expect(pintaCifras(svg, medidor, '2.500'), 'las cifras 2.500 en el área exportada').toBe(true)
  // Sin las lecturas, la pantalla queda en reposo.
  const dialogo2 = await abrirExportar(page, 'SVG')
  await dialogo2.getByRole('switch', { name: 'Lecturas de los medidores rápidos' }).uncheck()
  const sin = await exportarA(app, dialogo2, join(dir, 'sin.svg'))
  expect(sin).toContain('fill="#2a2e36"')
  expect(pintaCifras(sin, medidor, '2.500')).toBe(false)
  expect(pintaCifras(sin, medidor, '‒.‒‒‒')).toBe(true)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

test('el clic derecho ofrece «Exportar la selección…» y abre el diálogo con Selección elegida', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await encuadrar(page)
  const c = await sonda(page, 'aPantalla', 20, 0)
  // Con una sola pieza el clic derecho ya no trae «Exportar la selección…» (está en la cinta): se seleccionan varias.
  await page.mouse.click(c.x, c.y)
  await page.keyboard.press('Control+A')
  await expect.poll(async () => (await sonda(page, 'seleccion')).piezas.length).toBeGreaterThan(1)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Exportar la selección…' }).click()
  const dialogo = page.getByRole('dialog', { name: /^Exportar como/ })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByRole('radio', { name: 'Selección' })).toBeChecked()
  await expect(dialogo.getByRole('radio', { name: 'Todo' })).not.toBeChecked()
  await app.close()
})

/** Duración en ms del `mvhd` de un MP4; null si no hay `ftyp` o `mvhd`. */
function duracionMp4(b: Buffer): number | null {
  if (b.length < 16 || b.toString('latin1', 4, 8) !== 'ftyp') return null
  let o = 0
  while (o + 8 <= b.length) {
    const tam = b.readUInt32BE(o)
    const tipo = b.toString('latin1', o + 4, o + 8)
    if (tipo === 'moov') {
      const i = b.indexOf('mvhd', o + 8, 'latin1')
      if (i < 0) return null
      const v = b[i + 4]
      const escala = b.readUInt32BE(i + 4 + (v ? 20 : 12))
      const dur = v ? Number(b.readBigUInt64BE(i + 4 + 24)) : b.readUInt32BE(i + 4 + 16)
      return Math.round((dur / escala) * 1000)
    }
    if (tam < 8) break
    o += tam
  }
  return null
}

test('grabar la ventana sin micrófono: el botón de Inicio empieza, el reloj y la barra de estado pausan y detienen, y el archivo guarda su duración', async () => {
  const { app, page, datos } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  const inicio = page.getByRole('toolbar', { name: 'Inicio', exact: true })
  const grabar = inicio.locator('[data-comando="grabar"]')
  const flecha = inicio.locator('[data-grabar-flecha]')
  await expect(grabar).toHaveText('Grabar')
  // La flecha abre las opciones sin empezar.
  await flecha.click()
  const opciones = page.getByRole('dialog', { name: 'Opciones de grabación' })
  await expect(opciones).toBeVisible()
  await expect(opciones.getByLabel('Micrófono')).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(opciones).toBeHidden()
  // El clic del botón empieza con lo recordado.
  await grabar.click()
  await page.waitForTimeout(1500)
  // Si el entorno no deja capturar la ventana, el grabador avisa en lugar de grabar: se explica y solo se omite este caso.
  const error = page.locator('.aviso-grabacion.aviso-error')
  if (await error.count()) test.skip(true, `getDisplayMedia no pudo correr en este entorno: ${await error.innerText()}`)
  await expect(grabar).toHaveText(/● 00:0\d/)
  const barra = page.locator('.estado-grabando')
  await expect(barra).toContainText('Grabando')
  // Pausar y continuar desde el menú de la flecha.
  await flecha.click()
  await page.getByRole('menuitem', { name: 'Pausar' }).click()
  await expect(barra).toContainText('En pausa')
  await barra.getByRole('button', { name: 'Continuar' }).click()
  await expect(barra).toContainText('Grabando')
  await page.waitForTimeout(1500)
  await barra.getByRole('button', { name: 'Detener' }).click()
  await expect(barra).toHaveCount(0)
  await expect(grabar).toHaveText('Grabar')
  const carpeta = join(datos, 'Videos', 'Kirchi')
  const listar = () => (existsSync(carpeta) ? readdirSync(carpeta).filter((n) => /\.(mp4|webm)$/.test(n)) : [])
  await expect.poll(() => listar().length, { timeout: 20_000 }).toBe(1)
  const nombre = listar()[0]
  const archivo = join(carpeta, nombre)
  const bytes = readFileSync(archivo)
  expect(statSync(archivo).size).toBeGreaterThan(0)
  // MP4 donde el sistema lo permite; si no, WebM con su duración escrita por Kirchi.
  const ms = nombre.endsWith('.mp4') ? duracionMp4(bytes) : leerDuracionMs(bytes)
  expect(ms).not.toBeNull()
  expect(ms!).toBeGreaterThan(0)
  console.log(`GRABACION ${nombre} ${statSync(archivo).size} bytes ${ms} ms`)
  await page.keyboard.press('Shift+F5')
  await app.close()
})

/** Un RC (5 V, 1 kΩ y 1 µF): la red de salida (32, 0) sube con el tiempo, así que cada avance cambia su voltaje. */
const RC = { ...DIVISOR, piezas: { ...DIVISOR.piezas, r2: pieza('r2', 'capacitor', 'C1', 44, 0, { valor: '1u' }) } }
const salidaDe = (sim: any): number[] => (Object.values(sim.redes) as number[]).slice().sort((a, b) => a - b)

test('la cinta de Simular trae «Avanzar» con su menú y las flechas Retroceder y Avanzar', async () => {
  const { app, page } = await abrir()
  const inicio = page.getByRole('toolbar', { name: 'Inicio', exact: true })
  await expect(inicio.locator('[data-comando="avanzar-tiempo"]')).toHaveText('Avanzar')
  // Las flechas no llevan texto, solo nombre accesible y globo.
  await expect(inicio.locator('[data-comando="retroceder"]')).toHaveText('')
  await expect(inicio.locator('[data-comando="retroceder"]')).toHaveAttribute('aria-label', 'Retroceder')
  await expect(inicio.locator('[data-comando="avanzar"]')).toHaveText('')
  await expect(inicio.locator('[data-comando="avanzar"]')).toHaveAttribute('aria-label', 'Avanzar')
  // Sin simular no hay a dónde regresar.
  await expect(inicio.locator('[data-comando="retroceder"]')).toHaveAttribute('aria-disabled', 'true')
  await inicio.locator('[data-comando="avanzar-tiempo"]').click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText(/Una división/)).toBeVisible()
  await expect(menu.getByText(/Un paso de cálculo \(/)).toBeVisible()
  await expect(menu.getByText(/Tiempo fijo/)).toBeVisible()
  await expect(menu.getByText(/Avanzar hasta/)).toBeVisible()
  await app.close()
})

test('Retroceder regresa al avance anterior (tiempo y voltajes) y se apaga al editar el circuito', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', RC)
  await page.locator('canvas.lienzo-gl').focus()
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('corriendo')
  await page.keyboard.press('F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('pausada')
  const inicio = page.getByRole('toolbar', { name: 'Inicio', exact: true })
  const avanzar = inicio.locator('[data-comando="avanzar"]')
  const retroceder = inicio.locator('[data-comando="retroceder"]')
  // «Un paso de cálculo» como lo que avanza cada vez.
  await inicio.locator('[data-comando="avanzar-tiempo"]').click()
  await page.getByRole('menu').getByText(/Un paso de cálculo \(/).click()
  const t = async () => (await sonda(page, 'simulacion')).t as number
  const reposo = async () => expect.poll(async () => (await sonda(page, 'tiempo')).avance).toBeNull()
  const t0 = await t()
  await avanzar.click()
  await reposo()
  await expect.poll(t).toBeGreaterThan(t0)
  const t1 = await t()
  const v1 = salidaDe(await sonda(page, 'simulacion'))
  await avanzar.click()
  await reposo()
  await expect.poll(t).toBeGreaterThan(t1)
  await expect(retroceder).not.toHaveAttribute('aria-disabled', 'true')
  await retroceder.click()
  await expect.poll(t).toBeCloseTo(t1, 12)
  const v1b = salidaDe(await sonda(page, 'simulacion'))
  expect(v1b).toHaveLength(v1.length)
  v1b.forEach((v, i) => expect(v).toBeCloseTo(v1[i], 9))
  // Editar el circuito (la vista previa se detiene) borra los avances guardados.
  await page.keyboard.press('Shift+F5')
  await expect.poll(async () => (await sonda(page, 'simulacion')).fase).toBe('detenida')
  await expect(retroceder).toHaveAttribute('aria-disabled', 'true')
  await app.close()
})

test('el exportar del esquema pone texto, flecha, llamada numerada y etiqueta de lectura, y salen en el SVG', async () => {
  const { app, page } = await abrir()
  await sonda(page, 'cargar', DIVISOR)
  await simular(page)
  const dir = mkdtempSync(join(tmpdir(), 'kirchi-e2e-12-'))
  const dialogo = await abrirExportar(page, 'SVG')
  const vista = dialogo.locator('.editor-vista')
  await expect(dialogo.locator('.marco-imagen')).toBeVisible()
  const caja = (await vista.boundingBox())!
  const herr = (n: string) => dialogo.locator(`.editor-herramientas button[aria-label^="${n}"]`)
  const en = (fx: number, fy: number) => ({ x: caja.x + caja.width * fx, y: caja.y + caja.height * fy })
  await herr('Texto').click()
  await page.mouse.click(en(0.2, 0.15).x, en(0.2, 0.15).y)
  await herr('Flecha').click()
  await page.mouse.move(en(0.3, 0.8).x, en(0.3, 0.8).y)
  await page.mouse.down()
  await page.mouse.move(en(0.45, 0.65).x, en(0.45, 0.65).y, { steps: 5 })
  await page.mouse.up()
  await herr('Llamada').click()
  await page.mouse.click(en(0.8, 0.8).x, en(0.8, 0.8).y)
  await page.keyboard.press('Escape')
  // La etiqueta de lectura pide un cable: se recorre la vista hasta que una se prenda (la nota queda con su lectura).
  await herr('Etiqueta').click()
  const lectura = dialogo.locator('.marco-notas:not(.marco-fantasma) text', { hasText: /\d V$/ })
  const img = (await dialogo.locator('.marco-imagen').boundingBox())!
  buscar: for (let fy = 0.05; fy <= 0.95; fy += 0.04) {
    for (let fx = 0.05; fx <= 0.95; fx += 0.04) {
      await page.mouse.click(img.x + img.width * fx, img.y + img.height * fy)
      if (await lectura.count()) break buscar
    }
  }
  expect(await lectura.count(), 'la etiqueta de lectura quedó puesta').toBeGreaterThan(0)
  const svg = await exportarA(app, dialogo, join(dir, 'notas.svg'))
  const grupo = svg.slice(svg.indexOf('<g id="anotaciones"'))
  expect(grupo).toContain('>Texto</text>')
  expect(grupo).toMatch(/<line [^>]*data-nota=/)
  expect(grupo).toMatch(/<circle [^>]*data-nota=[^>]*\/>\s*<text [^>]*>1<\/text>/)
  expect(grupo).toMatch(/>[\d.]+ ?[mµk]?V<\/text>/)
  await page.keyboard.press('Shift+F5')
  await app.close()
})
